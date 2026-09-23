const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// files/index.html から1つの関数の本文を切り出す。
// tests/sheet-placement.test.js の同名ヘルパーと同じ実装。
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
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}") { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`${name} must be balanced`);
}

function constant(name) {
  const m = source.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  assert.notEqual(m, null, `${name} must exist`);
  return m[1];
}

/* 退避の1列の高さ。本体の STASH_COL_H を読む。
   ここに数字を直接書くと、段数を変えたときにテストだけが取り残される。 */
const COL_H = Number(constant("STASH_COL_H"));

/* 本体から関数だけを取り出して動かす。names に挙げた関数はすべて本物を使う。
   関数宣言は巻き上げられるので、names の順番は結果に影響しない。 */
function load(names, { spaces = [], lots = [] } = {}) {
  const src = `
    const STASH_COL_H=${constant("STASH_COL_H")};
    let lastSp=spaces, lastLots=lots;
    ${names.map(functionSource).join("\n")}
    return { ${names.join(", ")}, spaces: () => lastSp };
  `;
  return new Function("spaces", "lots", src)(spaces, lots);
}

test("cloneSpaces は blockedRows を Set のまま複製する", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const sp = [{ name: "棟A", cols: [{ h: 4, fills: [], blockedRows: new Set([1, 2]) }] }];
  const next = cloneSpaces(sp);
  assert.ok(next[0].cols[0].blockedRows instanceof Set, "Set が復元されていない");
  assert.deepEqual([...next[0].cols[0].blockedRows], [1, 2]);
  next[0].cols[0].blockedRows.add(3);
  assert.equal(sp[0].cols[0].blockedRows.has(3), false, "元の Set と共有している");
});

test("blockedRows が無い列でも空の Set になる", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const next = cloneSpaces([{ name: "棟A", cols: [{ h: 4, fills: [] }] }]);
  assert.ok(next[0].cols[0].blockedRows instanceof Set);
  assert.equal(next[0].cols[0].blockedRows.size, 0);
});

test("validateMove は cloneSpaces を使う", () => {
  assert.match(functionSource("validateMove"), /cloneSpaces\(/);
});

// 退避スペース1つ。count を入れた列を持つ
function stashWith(count) {
  const cols = [];
  let rem = count;
  while (rem > 0) {
    const put = Math.min(rem, COL_H);
    cols.push({ h: COL_H, aisle: false, fills: [{ id: "L1", count: put }] });
    rem -= put;
  }
  if (!cols.length) cols.push({ h: COL_H, aisle: false, fills: [] });
  return [{ name: "退避", zone: "stash", cols }];
}

test("退避の上限はその日の入力総パレット数", () => {
  const spaces = stashWith(6);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 20 }, { pallets: 10 }] }
  );
  // 入力は 30P、退避には 6P 入っているので残り 24P
  assert.equal(stashFreeRoom(spaces), 24);
});

test("入力より多く入っていても空きは負にならない", () => {
  const spaces = stashWith(12);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 4 }] }
  );
  assert.equal(stashFreeRoom(spaces), 0);
});

test("上限を列数から数えない", () => {
  const fn = functionSource("stashFreeRoom");
  assert.match(fn, /stashCapacity\(/);
  assert.doesNotMatch(fn, /STASH_MAX_COLS/);
});

function emptyStash() {
  return [{ name: "退避", zone: "stash", cols: [{ h: COL_H, aisle: false, fills: [] }] }];
}

const STASH_PIECES = ["clone", "used", "stashSpaces", "stashTotal", "stashCapacity",
  "stashFreeRoom", "normalizeFills", "putToStash"];

test("putToStash は列数の上限で止まらない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 100 }] });
  putToStash(spaces, "L1", 100);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 100, "100P 入っていない");
  const want = Math.ceil(100 / COL_H);
  assert.equal(spaces[0].cols.length, want,
    `1列 ${COL_H} 段なら 100P は ${want} 本になるはず`);
});

test("putToStash は上限を超えては積まない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 30 }] });
  putToStash(spaces, "L1", 40);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 30, "上限を超えて積んでいる");
});

test("ensureStashRoom は容量が残っていれば末尾に空き列を残す", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 20 }] }
  );
  ensureStashRoom(spaces);
  const cols = spaces[0].cols;
  assert.equal(cols[cols.length - 1].fills.length, 0, "末尾に空き列が無い");
});

test("ensureStashRoom は満杯なら空き列を足さない", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 8 }] }
  );
  ensureStashRoom(spaces);
  assert.equal(spaces[0].cols.length, 2, "満杯なのに空き列を足している");
});

// R1: run() の中の「退避を積み戻す」コード片を、テキストの位置関係ではなく
// 本物として実行して確かめる。clearHistory() の直後から「あふれた分は退避
// スペースへ逃がす」コメントの手前までを切り出す。この境界は、積み戻しを
// 1ループで書くか2ループに分けるかに関わらず動かない目印なので、安全な
// 書き方の変更まで巻き添えで落とすことはない（実測で確認済み。下記コメント参照）。
//
// 切り出した本物のコードを、退避のみで倉庫の空きが無いロットを複数件、
// その日の入力パレット数ちょうど（余白ゼロ）だけ与えて動かす。
// putToStash(lastSp,l.id,l.stashed) が l.pallets+=l.stashed より先に走る
// 退避（task-3-brief.md 追記 R1 の不具合）に戻すと、あとから処理される
// ロットぶんだけ stashCapacity() が目減りし、余白ゼロでは即座に積み残しが
// 出る。実際に「putToStash → l.pallets+=l.stashed」の順に手直しして
// このテストに通したところ、100P 中 50P しか積めず検知した
// （3ロットとも全量退避、想定合計100Pに対し取得50P）。
// 一方、2ループを「ロットごとに restore→put」の1ループへ安全に書き換える
// 変更は、同じ入力で実行しても取りこぼしが発生しないことを確認済みなので、
// このテストは対象外のまま（想定合計100Pに対し取得100P）。
function stashRestoreBlock() {
  const fn = functionSource("run");
  const marker = "clearHistory();";
  const s = fn.indexOf(marker);
  assert.notEqual(s, -1, "clearHistory() が見つからない");
  const start = s + marker.length;
  const endMarker = "// あふれた分は退避スペースへ逃がす";
  const e = fn.indexOf(endMarker, start);
  assert.notEqual(e, -1, "あふれ処理の手前の目印が見つからない");
  return fn.slice(start, e);
}

test("run の退避積み戻しは、倉庫の空きが無いロットが複数あっても取りこぼさない", () => {
  const snippet = stashRestoreBlock();
  const spaces = [{ name: "退避", zone: "stash", cols: [{ h: COL_H, aisle: false, fills: [] }] }];
  // 3ロットとも倉庫には置けず全量退避、かつ退避の残り容量はその日の
  // 入力パレット数ちょうど（余白ゼロ）。目減りが1Pでもあれば積み残す条件。
  const lots = [
    { id: "L1", pallets: 0, stashed: 50 },
    { id: "L2", pallets: 0, stashed: 30 },
    { id: "L3", pallets: 0, stashed: 20 },
  ];
  const wantTotal = lots.reduce((a, l) => a + l.stashed, 0);
  const src = `
    const STASH_COL_H=${constant("STASH_COL_H")};
    let lastSp=spaces, lastLots=lots;
    ${STASH_PIECES.map(functionSource).join("\n")}
    ${snippet}
    return { spaces: () => lastSp };
  `;
  const { spaces: getSp } = new Function("spaces", "lots", src)(spaces, lots);
  const sp = getSp();
  const total = sp[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, wantTotal, "退避の中身が取りこぼされている");
  lots.forEach(l => assert.equal(l.pallets, l.stashed, `${l.id} の pallets が元に戻っていない`));
});

const VALIDATE_PIECES = [...STASH_PIECES, "cloneSpaces", "validateStashMove"];

// 倉庫1エリアと退避スペース。棟A の列0 に 25 枚入っている
function warehouseAndStash(count = 25) {
  return [
    { name: "棟A", zone: "near", cols: [{ h: 30, aisle: false, fills: [{ id: "L1", count }] }] },
    { name: "退避", zone: "stash", cols: [{ h: COL_H, aisle: false, fills: [] }] },
  ];
}

function stashTotalOf(sp) {
  return sp.find(s => s.zone === "stash").cols
    .reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
}

test("空の退避に22枚を落とせる", () => {
  const spaces = warehouseAndStash(25);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 22 });
  assert.equal(v.ok, true, v.reason);
  assert.equal(stashTotalOf(v.next), 22);
  assert.equal(stashTotalOf(spaces), 0, "元の配置を書き換えている");
  // 減算は next 側の複製にしか起きないはず。元の棟A の fill が
  // そのまま残っていることまで見ないと、cloneSpaces が fills を
  // 複製せず参照を共有するように壊れても検知できない。
  assert.equal(spaces[0].cols[0].fills[0].count, 25, "元の倉庫の fill を書き換えている");
});

test("列の実際の枚数を超える選択でも、減った分しか退避に積まない", () => {
  // 棟A の列0 には L1 が5枚しか無いのに、counts では20枚選んだことにする
  // （選択が壊れている状況を想定）。積む枚数は「選んだ数」ではなく
  // 「実際に倉庫から引けた数」でなければならない。
  const spaces = warehouseAndStash(5);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 20 });
  assert.equal(v.ok, true, v.reason);
  const warehouse = v.next.find(s => s.name === "棟A").cols[0];
  const warehouseLeft = warehouse.fills.reduce((a, f) => a + f.count, 0);
  assert.equal(warehouseLeft, 0, "倉庫から引けたのは5枚だけ");
  assert.equal(stashTotalOf(v.next), 5, "倉庫から減った分より多く退避に積んでいる");
});

test("1列に積める枚数を超えても入る", () => {
  const spaces = warehouseAndStash(60);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 60 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 60 });
  assert.equal(v.ok, true, v.reason);
  assert.equal(stashTotalOf(v.next), 60);
});

test("上限を超える選択は1マスも動かさず、空き容量を理由に出す", () => {
  const spaces = warehouseAndStash(25);
  // 入力は 10P しかないので、25 枚は入らない
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 10 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 25 });
  assert.equal(v.ok, false);
  assert.equal(v.same, undefined, "「動くマスが無い」と混同している");
  assert.match(v.reason, /25P/, "選んだ枚数が理由に無い");
  assert.match(v.reason, /10P/, "空き容量が理由に無い");
  assert.equal(v.next, undefined, "動かさないのに配置を返している");
});

test("退避の中のマスだけを選んでも動かない", () => {
  const spaces = warehouseAndStash(25);
  spaces[1].cols[0].fills.push({ id: "L1", count: 3 });
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "退避|0": 3 });
  assert.equal(v.ok, false);
  assert.equal(v.same, true, "「動くマスが無い」になっていない");
});

test("倉庫と退避が混ざった選択では倉庫側だけが動く", () => {
  const spaces = warehouseAndStash(25);
  spaces[1].cols[0].fills.push({ id: "L1", count: 3 });
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 28 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 5, "退避|0": 3 });
  assert.equal(v.ok, true, v.reason);
  // 退避にあった 3 枚はそのまま、倉庫から 5 枚が増えて 8 枚
  assert.equal(stashTotalOf(v.next), 8);
  const warehouse = v.next.find(s => s.name === "棟A").cols[0];
  assert.equal(warehouse.fills.reduce((a, f) => a + f.count, 0), 20);
});

test("退避への移動では分割の確認を出さない", () => {
  const spaces = warehouseAndStash(25);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 10 });
  assert.equal(v.needConfirm, false);
});

/* applyMoveToStash を実際に動かす。検証の中身は Task 4 のテストの範囲なので、
   ここでは validateStashMove の返り値を差し替えて、後始末だけを見る。 */
function loadApplyToStash({ spaces, validate }) {
  const log = { alerted: [], pushed: 0, saved: 0, redrawn: 0, cleared: 0 };
  const src = `
    let lastSp=spaces;
    const sel={lotId:"L1", cells:new Set(["棟A|0"])};
    ${functionSource("stashSpaces")}
    ${functionSource("applyMoveToStash")}
    function isActiveFresh(){ return true; }
    function refreshFreshness(){}
    function selCounts(){ return { "棟A|0": 1 }; }
    function selSnapshot(){ return null; }
    function snapshotSpaces(sp){ return sp; }
    function validateStashMove(){ return validate; }
    function alert(m){ log.alerted.push(m); }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){ log.cleared++; }
    function redraw(){ log.redrawn++; }
    return { applyMoveToStash, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "validate", "log", src)(spaces, validate, log);
  return { ...made, log };
}

test("入りきらないときは理由を出して、何も変えない", () => {
  const spaces = emptyStash();
  const app = loadApplyToStash({
    spaces,
    validate: { ok: false, reason: "退避スペースに入りきりません。\n選んだのは 30P、いま空いているのは 12P です。" },
  });
  app.applyMoveToStash();
  assert.equal(app.log.alerted.length, 1, "理由を出していない");
  assert.match(app.log.alerted[0], /入りきりません/);
  assert.equal(app.log.pushed, 0);
  assert.equal(app.log.saved, 0);
  assert.equal(app.spaces(), spaces, "配置を差し替えている");
});

test("動くマスが無いときは黙って中止する", () => {
  const app = loadApplyToStash({
    spaces: emptyStash(),
    validate: { ok: false, same: true, reason: "動くマスがありません" },
  });
  app.applyMoveToStash();
  assert.equal(app.log.alerted.length, 0, "退避の中で動かすたびにダイアログが出る");
  assert.equal(app.log.pushed, 0);
});

test("成立したら検証後の配置を採り、履歴に積む", () => {
  const next = [{ name: "退避", zone: "stash", cols: [] }];
  const app = loadApplyToStash({ spaces: emptyStash(), validate: { ok: true, next } });
  app.applyMoveToStash();
  assert.equal(app.spaces(), next, "検証後の配置を採っていない");
  assert.equal(app.log.pushed, 1, "履歴に積んでいない");
  assert.equal(app.log.saved, 1);
  assert.equal(app.log.cleared, 1);
  assert.equal(app.log.redrawn, 1);
});

test("applyMove は退避が宛先なら専用の経路へ渡す", () => {
  const fn = functionSource("applyMove");
  assert.match(fn, /applyMoveToStash\(\)/);
  assert.match(fn, /stashSpaces\(/);
});

test("受け皿に落とす経路は列を渡さない", () => {
  assert.doesNotMatch(source, /firstFreeStashCol/);
});

test("退避の列を伸ばす仕掛けは残っていない", () => {
  assert.doesNotMatch(source, /growStashCol/);
  assert.doesNotMatch(source, /STASH_COL_MAX_H/);
});

/* tests/stash-grow.test.js の生き残り。あのファイルは growStashCol と
   STASH_COL_MAX_H を本物で動かして「列を伸ばしたら検証後に元へ戻す」ことを
   見ていたが、退避への移動が applyMoveToStash() に切り出されて growStashCol
   自体が無くなったため、その観点はもう成立しない。ただしあのファイルは
   applyMove() を実際に new Function で動かして呼ぶ、唯一のテストでもあった。
   ここに残すのはその役目 ── 「分割の確認を取り消したら何もしない」
   「成立したら検証後の配置をそのまま採る」という2分岐の実行確認 ── だけを
   倉庫の宛先（退避への振り分けを踏まない宛先）で引き継ぐ。 */
function loadApplyMove({ spaces, counts, validate, confirmAnswer, splitConfirmEnabled = true }) {
  const log = { pushed: 0, saved: 0, redrawn: 0, confirmed: 0 };
  const src = `
    let lastSp=spaces, lastLots=[], splitConfirmEnabled=confirmEnabled;
    const sel={lotId:"L1", cells:new Set(["棟A|0"])};
    ${functionSource("clone")}
    ${functionSource("stashSpaces")}
    ${functionSource("snapshotSpaces")}
    ${functionSource("applyMove")}
    function isActiveFresh(){ return true; }
    function refreshFreshness(){}
    function selCounts(){ return counts; }
    function selSnapshot(){ return null; }
    function validateMove(){ return validate; }
    function confirm(){ log.confirmed++; return confirmAnswer; }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){}
    function redraw(){ log.redrawn++; }
    return { applyMove, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "counts", "validate", "confirmAnswer", "confirmEnabled", "log", src)(
    spaces, counts, validate, confirmAnswer, splitConfirmEnabled, log
  );
  return { ...made, log };
}

// 倉庫の1マスだけの配置。zone が "stash" ではないので、applyMove 先頭の
// 退避振り分けを踏まずに applyMove 自身の分岐へ進む
function warehouseOnly() {
  return [{ name: "棟A", zone: "warehouse", cols: [{ h: 4, aisle: false, fills: [{ id: "L1", count: 3 }] }] }];
}

test("分割の確認を取り消したら、何も変えない", () => {
  const app = loadApplyMove({
    spaces: warehouseOnly(),
    counts: { "棟A|0": 5 },
    validate: { ok: true, needConfirm: true, before: 1, after: 2, next: [] },
    confirmAnswer: false,
  });
  app.applyMove("棟A", 0);
  assert.equal(app.log.confirmed, 1, "確認を出していない");
  assert.equal(app.log.pushed, 0, "確認を取り消したのに履歴に積んでいる");
  assert.equal(app.log.saved, 0, "確認を取り消したのに保存している");
});

test("分割確認をOFFにしたら、確認を出さずに移動する", () => {
  const next = [{ name: "棟A", zone: "warehouse", cols: [{ h: 4, aisle: false, fills: [{ id: "L1", count: 8 }] }] }];
  const app = loadApplyMove({
    spaces: warehouseOnly(),
    counts: { "棟A|0": 5 },
    validate: { ok: true, needConfirm: true, before: 1, after: 2, next },
    confirmAnswer: false,
    splitConfirmEnabled: false,
  });
  app.applyMove("棟A", 0);
  assert.equal(app.log.confirmed, 0, "OFFなのに確認を出している");
  assert.equal(app.spaces(), next, "確認なしで移動を完了していない");
  assert.equal(app.log.pushed, 1, "移動を履歴に積んでいない");
  assert.equal(app.log.saved, 1, "移動結果を保存していない");
});

test("移動が成立したら検証後の配置をそのまま採る", () => {
  const next = [{ name: "棟A", zone: "warehouse", cols: [{ h: 4, aisle: false, fills: [{ id: "L1", count: 8 }] }] }];
  const app = loadApplyMove({
    spaces: warehouseOnly(),
    counts: { "棟A|0": 5 },
    validate: { ok: true, needConfirm: false, next },
    confirmAnswer: true,
  });
  app.applyMove("棟A", 0);
  assert.equal(app.spaces(), next, "検証後の配置を採っていない");
  assert.equal(app.log.pushed, 1, "履歴に積んでいない");
  assert.equal(app.log.saved, 1);
  assert.equal(app.log.redrawn, 1);
});

test("ドラッグ中の色付けは退避なら退避用の検証を使う", () => {
  const fn = functionSource("highlightDrop");
  assert.match(fn, /validateStashMove\(/, "退避用の検証を呼んでいない");
  assert.match(fn, /stashSpaces\(/, "宛先が退避かを見ていない");
  assert.match(fn, /validateMove\(/, "倉庫側の検証を失っている");
});
