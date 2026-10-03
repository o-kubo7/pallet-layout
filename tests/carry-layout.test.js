const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 関数をソースから切り出す。tests/sheet-placement.test.js と同じ実装
function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

/* 変更分だけ配置し直す処理を、小さな倉庫で動かす。
   倉庫 A は高さ4の列が4本、B は高さ4の列が2本（A が埋まったら B）。退避は高さ5。
   blocked・指紋・保存はスタブにする */
const PIECES = [
  "clone", "lotKey", "used", "usableCount", "columnFreeCount", "aisleRowCount", "autoFreeCount",
  "findRun", "buildWork", "snapshotFitsBlocked", "areaCandidates", "placeLot", "fillMix", "place",
  "normalizeFills", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom", "putToStash",
  "matchLots", "placementColumns", "carryCells", "topUpLot", "sameSpacesFp", "carryOver",
];
const SPACES = [
  { name: "A", zone: "near", orient: "v", block: 3, sheet: "bottom", cols: [{ h: 4 }, { h: 4 }, { h: 4 }, { h: 4 }] },
  { name: "B", zone: "far", orient: "h", block: 99, sheet: "top", cols: [{ h: 4 }, { h: 4 }] },
  { name: "退避", zone: "stash", orient: "v", block: 99, sheet: "none", cols: [{ h: 5 }] },
];
const FP = spaces => JSON.stringify({ items: [], spaces });

function sandbox(shift, opts = {}) {
  const env = new Function(
    "SPACES", "shift", "fpNow",
    `const STASH_COL_H=5; const AREA_GROUPS=[];
     let lastLots=null;
     const blockedRowsFor=()=>new Set();
     const sheetAreas=()=>[];
     const activeShift=()=>shift;
     const inputFingerprint=()=>fpNow;
     ${PIECES.map(functionSource).join("\n")}
     return {carryOver, carryCells, matchLots, placementColumns, buildWork, getLastLots:()=>lastLots};`
  );
  return env(JSON.parse(JSON.stringify(SPACES)), shift, opts.fp || FP("S1"));
}

// 荷物。id は readLots() と同じく並び順
const lot = (id, name, lotNo, pallets, extra = {}) => Object.assign({
  id, type: "充填品", name, lot: lotNo, snp: 10, qty: pallets * 10, code: lotNo || name,
  sourceKey: name + "\u0000" + lotNo, itemIds: ["i-" + name + lotNo], pallets, parts: 1, half: 0,
}, extra);

// 盤の中身を {エリア: [[id,count],...] の列ごとの配列} にして比べやすくする
function view(sp) {
  const out = {};
  sp.forEach(s => {
    out[s.name] = s.cols.map(c => c.fills.map(f => [f.id, f.count]));
  });
  return out;
}
function stashOf(sp) {
  const n = {};
  sp.filter(s => s.zone === "stash").forEach(s => s.cols.forEach(c => c.fills.forEach(f => {
    n[f.id] = (n[f.id] || 0) + f.count;
  })));
  return n;
}
// 手動調整を保存した状態を作る。fills は {エリア: [[ [id,count], ...], ...]}
function manualOf(lots, fills, stash = [], fp = FP("S1")) {
  const sp = JSON.parse(JSON.stringify(SPACES)).map(s => Object.assign({}, s, {
    cols: s.cols.map((c, ci) => Object.assign({ aisle: false }, c, {
      fills: ((fills[s.name] || [])[ci] || []).map(([id, count]) => ({ id, count })),
    })),
  }));
  const st = sp.find(s => s.zone === "stash");
  stash.forEach(([id, count]) => st.cols[0].fills.push({ id, count }));
  return { fp, lots, sp };
}

test("変わっていない荷物は手で置いた位置のまま残し、IDを付け替える", () => {
  // 前: 部品X が A の4列目、部品Y が A の1列目（自動配置ならありえない、手で動かした形）
  const old = [lot(0, "部品X", "L1", 3), lot(1, "部品Y", "L2", 4)];
  const shift = { manual: manualOf(old, { A: [[[1, 4]], [], [], [[0, 3]]] }), blocked: [] };
  // 今: 先頭に新しい荷物が入り、IDがずれる
  const now = [lot(0, "部品Z", "L9", 2), lot(1, "部品X", "L1", 3), lot(2, "部品Y", "L2", 4)];
  const r = sandbox(shift).carryOver(now, "place", true);
  assert.ok(r);
  const v = view(r.sp);
  assert.deepEqual(v.A[0], [[2, 4]], "部品Y は1列目のまま");
  assert.deepEqual(v.A[3], [[1, 3]], "部品X は4列目のまま");
  assert.deepEqual(v.A[1], [[0, 2]], "新しい荷物は空いた列へ");
  assert.equal(r.summary.kept, 2);
  assert.equal(r.summary.added, 1);
});

test("パレット数が減った荷物は、最後に積んだ所から空ける", () => {
  // 部品X が 4・4・2 の3列。2枚減らすと3列目が空く
  const old = [lot(0, "部品X", "L1", 10)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [[0, 4]], [[0, 2]], []] }), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品X", "L1", 8)], "place", true);
  assert.deepEqual(view(r.sp).A, [[[0, 4]], [[0, 4]], [], []]);
  assert.equal(r.summary.trimmed, 1);
});

test("減った分が列をまたぐときは、後ろの列から順に空ける", () => {
  const old = [lot(0, "部品X", "L1", 10)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [[0, 4]], [[0, 2]], []] }), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品X", "L1", 5)], "place", true);
  assert.deepEqual(view(r.sp).A, [[[0, 4]], [[0, 1]], [], []]);
});

test("減った分は退避にある分から先に減らす", () => {
  const old = [lot(0, "部品X", "L1", 6)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [], [], []] }, [[0, 2]]), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品X", "L1", 5)], "place", true);
  assert.deepEqual(view(r.sp).A[0], [[0, 4]], "倉庫の分は減らさない");
  assert.deepEqual(stashOf(r.sp), { 0: 1 });
});

test("同じ列で後ろに積んだ荷物から減らし、前の荷物は動かさない", () => {
  // 1列目に Y(2) と X(2) が混載。X を1枚減らす
  const old = [lot(0, "部品X", "L1", 2), lot(1, "部品Y", "L2", 2)];
  const shift = { manual: manualOf(old, { A: [[[1, 2], [0, 2]], [], [], []] }), blocked: [] };
  const r = sandbox(shift).carryOver(
    [lot(0, "部品X", "L1", 1), lot(1, "部品Y", "L2", 2)], "place", true);
  assert.deepEqual(view(r.sp).A[0], [[1, 2], [0, 1]]);
});

test("増えた分は、まずその荷物だけの列の空きに足す", () => {
  const old = [lot(0, "部品X", "L1", 2), lot(1, "部品Y", "L2", 4)];
  const shift = { manual: manualOf(old, { A: [[], [], [[0, 2]], [[1, 4]]] }), blocked: [] };
  const r = sandbox(shift).carryOver(
    [lot(0, "部品X", "L1", 5), lot(1, "部品Y", "L2", 4)], "place", true);
  const v = view(r.sp);
  assert.deepEqual(v.A[2], [[0, 4]], "同じ列を埋める");
  assert.deepEqual(v.A[3], [[1, 4]], "他の荷物は動かない");
  // 残り1枚は空き列へ
  const elsewhere = v.A[0].concat(v.A[1], v.B[0], v.B[1]);
  assert.deepEqual(elsewhere, [[0, 1]]);
  assert.equal(r.summary.grown, 1);
  assert.equal(r.summary.placed, 3);
});

test("案B: 増えた分・新しい荷物は倉庫に置かず退避へ移す", () => {
  const old = [lot(0, "部品X", "L1", 2)];
  const shift = { manual: manualOf(old, { A: [[[0, 2]], [], [], []] }), blocked: [] };
  const now = [lot(0, "部品X", "L1", 3), lot(1, "部品N", "L5", 4)];
  const r = sandbox(shift).carryOver(now, "stash", true);
  const v = view(r.sp);
  assert.deepEqual(v.A, [[[0, 2]], [], [], []], "倉庫は前のまま");
  assert.deepEqual(v.B, [[], []]);
  assert.deepEqual(stashOf(r.sp), { 0: 1, 1: 4 });
  assert.equal(r.summary.stashed, 5);
  assert.ok(now.every(l => l.rem === 0), "退避へ移した分はあふれに数えない");
});

test("削除した荷物のマスは空く", () => {
  const old = [lot(0, "部品X", "L1", 4), lot(1, "部品Y", "L2", 4)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [[1, 4]], [], []] }), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品Y", "L2", 4)], "place", true);
  assert.deepEqual(view(r.sp).A, [[], [[0, 4]], [], []]);
  assert.equal(r.summary.removed, 1);
});

test("ロット番号を直しても、品目行のIDが同じなら同じ荷物として残す", () => {
  const old = [lot(0, "部品X", "仮", 4, { itemIds: ["i-1"] })];
  const shift = { manual: manualOf(old, { A: [[], [], [[0, 4]], []] }), blocked: [] };
  const now = [lot(0, "部品X", "L-777", 4, { itemIds: ["i-1"] })];
  const r = sandbox(shift).carryOver(now, "place", true);
  assert.deepEqual(view(r.sp).A[2], [[0, 4]]);
  assert.equal(r.summary.kept, 1);
});

test("itemIds の無い古い保存データは品名＋ロットで引き当てる", () => {
  const old = [lot(0, "部品X", "L1", 4)];
  delete old[0].itemIds;
  const shift = { manual: manualOf(old, { A: [[], [[0, 4]], [], []] }), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品X", "L1", 4, { itemIds: ["new"] })], "place", true);
  assert.deepEqual(view(r.sp).A[1], [[0, 4]]);
});

test("種別が変わった荷物は引き継がず、置き直す", () => {
  const old = [lot(0, "部品X", "L1", 4)];
  const shift = { manual: manualOf(old, { A: [[], [], [], [[0, 4]]] }), blocked: [] };
  const now = [lot(0, "部品X", "L1", 4, { type: "製品" })];
  const r = sandbox(shift).carryOver(now, "place", true);
  assert.deepEqual(view(r.sp).A[3], [], "前の位置は空く");
  assert.equal(r.summary.removed, 1);
  assert.equal(r.summary.added, 1);
});

test("案A: 空きが足りない分は rem に残す（run() が退避へ回す）", () => {
  const old = [lot(0, "部品X", "L1", 16)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [[0, 4]], [[0, 4]], [[0, 4]]] }), blocked: [] };
  const now = [lot(0, "部品X", "L1", 16), lot(1, "部品N", "L5", 11)];
  const r = sandbox(shift).carryOver(now, "place", false);
  assert.equal(now[1].rem, 3, "B の8マスに入らない3枚");
  assert.equal(r.summary.placed, 8);
});

test("前の退避の中身は引き継ぐ", () => {
  const old = [lot(0, "部品X", "L1", 6)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [], [], []] }, [[0, 2]]), blocked: [] };
  const r = sandbox(shift).carryOver([lot(0, "部品X", "L1", 6)], "place", true);
  assert.deepEqual(stashOf(r.sp), { 0: 2 });
  assert.deepEqual(view(r.sp).A[1], [], "退避の分を倉庫へ勝手に出さない");
});

test("スペース設定が変わっていたら引き継がない", () => {
  const old = [lot(0, "部品X", "L1", 4)];
  const shift = { manual: manualOf(old, { A: [[[0, 4]], [], [], []] }, [], FP("S1")), blocked: [] };
  const r = sandbox(shift, { fp: FP("S2") }).carryOver([lot(0, "部品X", "L1", 4)], "place", true);
  assert.equal(r, null);
});

test("手動調整が無ければ引き継がない", () => {
  const r = sandbox({ manual: null, blocked: [] }).carryOver([lot(0, "部品X", "L1", 4)], "place", true);
  assert.equal(r, null);
});

test("「半」の手動指定はIDを付け替え、減らした列からは消す", () => {
  const old = [lot(0, "部品X", "L1", 6), lot(1, "部品Y", "L2", 4)];
  const manual = manualOf(old, { A: [[[1, 4]], [[0, 4]], [[0, 2]], []] });
  manual.sp[0].cols[0].halfMarks = { "1": [{ k: 0, seq: 1 }] };
  manual.sp[0].cols[2].halfMarks = { "0": [{ k: 0, seq: 1 }] };
  const shift = { manual, blocked: [] };
  // 今は Y が先頭（ID 0）、X（ID 1）は1枚減
  const now = [lot(0, "部品Y", "L2", 4), lot(1, "部品X", "L1", 5)];
  const r = sandbox(shift).carryOver(now, "place", true);
  assert.deepEqual(r.sp[0].cols[0].halfMarks, { "0": [{ k: 0, seq: 1 }] });
  assert.equal(r.sp[0].cols[2].halfMarks, undefined);
});

test("putToStash の上限に使うので lastLots を今の荷物にする", () => {
  const old = [lot(0, "部品X", "L1", 2)];
  const shift = { manual: manualOf(old, { A: [[[0, 2]], [], [], []] }), blocked: [] };
  const env = sandbox(shift);
  const now = [lot(0, "部品X", "L1", 2)];
  env.carryOver(now, "stash", true);
  assert.equal(env.getLastLots(), now);
});

test("確認は3択の画面で、手動調整を破棄するのは「すべて自動配置し直す」だけ", () => {
  // runFromButton(options={}) は既定値の { で functionSource が止まるので、次の関数までを切り出す
  const fn = source.slice(source.indexOf("function runFromButton("), source.indexOf("function runWithChoice("));
  assert.ok(fn.length > 0);
  assert.match(fn, /openCarryDialog\(/);
  assert.doesNotMatch(fn, /confirm\("手動調整を破棄/);
  assert.match(source, /closeCarryDialog\('place'\)/);
  assert.match(source, /closeCarryDialog\('stash'\)/);
  assert.match(source, /closeCarryDialog\('full'\)/);
  assert.match(source, /closeCarryDialog\(null\)/);
});

test("引き継いだ盤は手動調整として保存する", () => {
  const fn = functionSource("run");
  assert.match(fn, /carryOver\(lots,carryMode,allowMix\)/);
  assert.match(fn, /activeShift\(\)\.manual=carried \?/);
});

test("荷物は元の品目行のIDを持つ", () => {
  const fn = functionSource("readLots");
  assert.match(fn, /itemIds:\[v\.itemId\]/);
  assert.match(fn, /g\.itemIds\.push\(v\.itemId\)/);
});
