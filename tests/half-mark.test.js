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

function halfFns() {
  return new Function(
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells",
     "manualHalfList", "halfCells", "halfMarkSet", "halfMarkClear", "dropHalfMarks"]
      .map(functionSource).join("\n") +
    "; return {spaceCells, manualHalfList, halfCells, halfMarkSet, halfMarkClear, dropHalfMarks};"
  )();
}
const MAIN = "メイン";
const inMain = () => MAIN;
const main = cols => ({ name: MAIN, cols });
const keys = map => Object.keys(map).sort();

test("自動: 単独ロットの列では最下段に半を付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_4"]);
});

test("自動: 准緊急マスありでも准緊急マスではなく下端に付ける（提示画像1の列5）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 9, up: 1, aisleRows: [8], fills: [{ id: 2, count: 8 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 2, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_7"]);
});

test("自動: 両端詰めの第2ロットはまとまりの下端に付ける（提示画像2の列4）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 9, up: 1, aisleRows: [8], fills: [{ id: 0, count: 4 }, { id: 1, count: 4 }] }]);
  const map = halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: false, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_7"]);
  assert.deepEqual(map["0_7"], { lotId: 1, manual: false });
});

test("自動: 両端詰めの第1ロットもまとまりの下端に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 2 }, { id: 1, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }, { id: 1, half: 0 }], { manualOn: false, areaOf: inMain })), ["0_1"]);
});

test("自動: 緊急用マスまで使う列では最下段の緊急用マスに付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 8, aisleRows: [7], fills: [{ id: 0, count: 8 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_7"]);
});

test("自動: 複数列にまたがるロットは末尾の列の下端に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }] }, { h: 4, fills: [{ id: 0, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["1_1"]);
});

test("自動: 通路列にあるロットは通路列を末尾として扱う（既存の優先を保つ）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, aisle: true, fills: [{ id: 0, count: 2 }] }, { h: 4, fills: [{ id: 0, count: 4 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_1"]);
});

test("自動: half>=2 は下から順に付け、足りなければ前の列へ進む", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }] }, { h: 4, fills: [{ id: 0, count: 1 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 3 }], { manualOn: false, areaOf: inMain })), ["0_2", "0_3", "1_0"]);
});

test("自動: 末尾エリアがメイン以外なら、手動指定が無い限りメインに付けない", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: () => "軒下①" })), []);
});

test("手動: 指定位置に付け、manual:true を返す", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  const map = halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_0"]);
  assert.deepEqual(map["0_0"], { lotId: 0, manual: true });
});

test("手動: 末尾エリアがメイン以外でも、手動指定があればメインに付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: () => "軒下①" })), ["0_1"]);
});

test("手動: 一部だけ指定したら残りは自動で埋める", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 5, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  const map = halfCells(sp, [{ id: 0, half: 2 }], { manualOn: true, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_0", "0_4"]);
  assert.equal(map["0_0"].manual, true);
  assert.equal(map["0_4"].manual, false);
});

test("手動: 範囲外の指定は無視して自動の位置に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 5, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 3, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_1"]);
});

test("手動: manualOn が false なら指定を無視する", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_4"]);
});

test("手動: 他ロットが動いても、まとまりの下からの位置は保たれる", () => {
  const { halfCells } = halfFns();
  // ロット1は下端3マス（row4-6）。下から1番目 = row5
  const sp = main([{ h: 7, fills: [{ id: 0, count: 2 }, { id: 1, count: 3 }], halfMarks: { "1": [{ k: 1, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_5"]);
  sp.cols[0].fills[0].count = 1;   // 他ロットが減っても
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_5"]);
});

test("halfMarkSet: half=1 では半がそのマスへ移る", () => {
  const { spaceCells, halfMarkSet, halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }] }]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 2, 1);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 2, seq: 1 }] });
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_2"]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 1);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 4, seq: 2 }] });
});

test("halfMarkSet: 手動指定が half 個に達していたら一番古い指定を外す（列をまたいでも）", () => {
  const { spaceCells, halfMarkSet } = halfFns();
  const sp = main([
    { h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 5 }] } },
    { h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 2 }] } },
  ]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 2);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 0, seq: 5 }, { k: 3, seq: 6 }] });
  assert.equal(sp.cols[1].halfMarks, undefined);
});

test("halfMarkSet: 手動指定が half 未満なら既存の指定を残す（自動の半が1つ減る）", () => {
  const { spaceCells, halfMarkSet } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 2);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 0, seq: 1 }, { k: 3, seq: 2 }] });
});

test("halfMarkClear: そのロットの指定だけを全列から消す", () => {
  const { halfMarkClear } = halfFns();
  const sp = main([
    { h: 4, fills: [], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 1, seq: 2 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 2, seq: 3 }] } },
  ]);
  halfMarkClear(sp, 0);
  assert.deepEqual(sp.cols[0].halfMarks, { "1": [{ k: 1, seq: 2 }] });
  assert.equal(sp.cols[1].halfMarks, undefined);
});

test("dropHalfMarks: 指定した列の、そのロットの指定だけを消す", () => {
  const { dropHalfMarks } = halfFns();
  const spaces = [main([
    { h: 4, fills: [], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 0, seq: 2 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 1, seq: 3 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 2, seq: 4 }] } },
  ])];
  dropHalfMarks(spaces, 0, [MAIN + "|0", MAIN + "|1", "軒下①|0"]);
  assert.deepEqual(spaces[0].cols[0].halfMarks, { "1": [{ k: 0, seq: 2 }] });
  assert.equal(spaces[0].cols[1].halfMarks, undefined);
  assert.deepEqual(spaces[0].cols[2].halfMarks, { "0": [{ k: 2, seq: 4 }] });
});

test("halfAreaOf: 設定ONでメインに有効な手動指定があればメイン、なければ末尾エリア", () => {
  const make = (enabled) => new Function(
    "lastSp", "halfManualEnabled", "tailAreaOf",
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells", "manualHalfList", "halfAreaOf"]
      .map(functionSource).join("\n") + "; return halfAreaOf;"
  )([
    { name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }] },
    { name: "軒下①", cols: [{ h: 4, fills: [{ id: 0, count: 1 }] }] },
  ], enabled, () => "軒下①");
  assert.equal(make(true)(0), "メイン");
  assert.equal(make(false)(0), "軒下①");
  assert.equal(make(true)(9), "軒下①");
});

test("表の「P 半」は halfAreaOf で決める", () => {
  assert.match(functionSource("sheetEntries"), /halfAreaOf\(e\.lot\.id\)/);
  assert.doesNotMatch(functionSource("sheetEntries"), /tailAreaOf\(/);
  assert.match(functionSource("stashSlots"), /halfAreaOf\(e\.lot\.id\)/);
  assert.doesNotMatch(functionSource("stashSlots"), /tailAreaOf\(/);
});

test("配置図のグリッドは halfCells で半を決める", () => {
  const fn = functionSource("gridRows");
  assert.match(fn, /halfCells\(sp,/);
  assert.doesNotMatch(fn, /splitIds/);
});

test("書き足しの署名は halfMarks を含めない", () => {
  const currentSig = new Function(
    "schedule", "hasResult", "sheetPlacement", "sheetEditSigFrom", "lastFp", "lastLots",
    "snapshotSpaces", "lastSp", "spacesToText", "mergeLots", "fracMode", "SHEET_LAYOUTS",
    functionSource("currentSheetSig") + "; return currentSheetSig;"
  );
  const lay = { top: 0, bottom: 0 };
  const pl = { lay, top: [], bottom: [], overflow: [] };
  const sigOf = sp => currentSig({}, true, () => pl, parts => JSON.stringify(parts.sp), "", [],
    value => JSON.parse(JSON.stringify(value)), sp, () => "", false, false,
    { middle: {}, wide: {} })(pl);
  const plain = [{ name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }] }] }];
  const marked = [{ name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }] }];
  assert.equal(sigOf(marked), sigOf(plain));
});

test("半を手動で設定する の保存キーと初期値", () => {
  assert.match(source, /halfManual:"palletApp\.halfManual"/);
  assert.match(source, /let halfManualEnabled=false;/);
});

test("moveCells: 移動したロットの指定を移動元・移動先から消し、他ロットと他の列は残す", () => {
  const moveCells = new Function(
    functionSource("normalizeFills") + functionSource("dropHalfMarks") +
    functionSource("moveCells") + "; return moveCells;"
  )();
  const next = [{ name: "メイン", cols: [
    { h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 0, seq: 2 }] } },
    { h: 7, fills: [{ id: 1, count: 2 }], halfMarks: { "1": [{ k: 1, seq: 3 }] } },
    { h: 7, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 1, seq: 4 }] } },
  ] }];
  moveCells(next, 0, { "メイン|0": 1 }, "メイン", 1);
  assert.deepEqual(next[0].cols[0].halfMarks, { "1": [{ k: 0, seq: 2 }] });
  assert.deepEqual(next[0].cols[1].halfMarks, { "1": [{ k: 1, seq: 3 }] });
  assert.deepEqual(next[0].cols[2].halfMarks, { "0": [{ k: 1, seq: 4 }] });
});

test("退避への移動でも、移動したロットの指定を移動元から消す", () => {
  assert.match(functionSource("validateStashMove"), /dropHalfMarks\(next, lotId, Object\.keys\(counts\)\)/);
});

test("盤はメインの半のマスに角バッジを付ける", () => {
  const root = { innerHTML: "", children: [], appendChild(node) { this.children.push(node); } };
  const doc = {
    getElementById: () => root,
    createElement: () => ({ className: "", classList: { add() {} }, style: {}, innerHTML: "" }),
  };
  const drawZone = new Function("document", "FLOOR_POS", "activeShift", "blockedCellKey", "used", "usableCount",
    "halfCellsFor",
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells", "colTopOffset", "drawZone"]
      .map(functionSource).join("\n") + "; return drawZone;"
  )(doc, {}, () => ({ blocked: [] }), () => "", col => col.fills.reduce((n, f) => n + f.count, 0), col => col.h,
    () => ({ "0_4": { lotId: 0, manual: false } }));
  drawZone("map", [{ name: "メイン", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }], { 0: "#aaa" });
  const html = root.children[0].innerHTML;
  assert.match(html, /<div class="cell half"[^>]*data-row="4"[^>]*>1<span class="halfbadge" aria-hidden="true">半<\/span><\/div>/);
  assert.equal((html.match(/halfbadge/g) || []).length, 1);
  assert.match(source, /\.cell \.halfbadge\{position:absolute;top:0;right:0/);
});

function loadHalfBtn({ spaces, lots, cells, enabled = true, fresh = true }) {
  const log = { pushed: 0, saved: 0, redrawn: 0, cleared: 0 };
  const src = `
    let lastSp=spaces, lastLots=lots, halfManualEnabled=enabled;
    const sel={lotId:null, cells:new Set(cells)};
    ${["clone", "fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells",
       "manualHalfList", "halfCells", "halfMarkSet", "halfMarkClear", "halfCellsFor",
       "halfBtnState", "onHalfBtn"].map(functionSource).join("\n")}
    function isActiveFresh(){ return fresh; }
    function halfAreaOf(){ return "メイン"; }
    function snapshotSpaces(sp){ return clone(sp); }
    function cloneSpaces(sp){ return clone(sp); }
    function selSnapshot(){ return null; }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){ log.cleared++; }
    function redraw(){ log.redrawn++; }
    return { halfBtnState, onHalfBtn, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "lots", "cells", "enabled", "fresh", "log", src)(spaces, lots, cells, enabled, fresh, log);
  return { ...made, log };
}
const oneCol = () => [{ name: "メイン", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }];

test("半ボタン: 設定OFF・複数選択・メイン外・half=0・古い配置では出さない", () => {
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"], enabled: false }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|1", "メイン|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: [{ name: "軒下①", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }], lots: [{ id: 0, half: 1 }], cells: ["軒下①|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 0 }], cells: ["メイン|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"], fresh: false }).halfBtnState(), null);
});

test("半ボタン: 半でないマスは set、自動の半は disabled、手動の半は auto", () => {
  const lots = [{ id: 0, half: 1 }];
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots, cells: ["メイン|0|2"] }).halfBtnState().mode, "set");
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots, cells: ["メイン|0|4"] }).halfBtnState().mode, "disabled");
  const marked = oneCol(); marked[0].cols[0].halfMarks = { "0": [{ k: 2, seq: 1 }] };
  assert.equal(loadHalfBtn({ spaces: marked, lots, cells: ["メイン|0|2"] }).halfBtnState().mode, "auto");
});

test("半ボタン: 半を設定 は履歴に積み、保存し、描き直す", () => {
  const app = loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"] });
  app.onHalfBtn();
  assert.deepEqual(app.spaces()[0].cols[0].halfMarks, { "0": [{ k: 2, seq: 1 }] });
  assert.deepEqual(app.log, { pushed: 1, saved: 1, redrawn: 1, cleared: 1 });
});

test("半ボタン: 半を自動に戻す はそのロットの指定を消す", () => {
  const marked = oneCol(); marked[0].cols[0].halfMarks = { "0": [{ k: 2, seq: 1 }] };
  const app = loadHalfBtn({ spaces: marked, lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"] });
  app.onHalfBtn();
  assert.equal(app.spaces()[0].cols[0].halfMarks, undefined);
  assert.equal(app.log.pushed, 1);
});

test("半ボタン: 自動の半（disabled）では何もしない", () => {
  const app = loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|4"] });
  app.onHalfBtn();
  assert.equal(app.spaces()[0].cols[0].halfMarks, undefined);
  assert.equal(app.log.pushed, 0);
});

test("操作バー: 半ボタンの文言と丸囲みアイコン", () => {
  assert.match(source, /<span class="flaghalf" id="flagHalf" hidden>/);
  assert.match(source, /<span class="halfic" aria-hidden="true">半<\/span>/);
  const fn = functionSource("updateFlag");
  assert.match(fn, /"半を自動に戻す"/);
  assert.match(fn, /"半を設定"/);
  assert.match(fn, /halfBtnState\(\)/);
  assert.match(fn, /fitFlagHalf\(\)/);
  // 押せないときも消さずに disabled にする
  assert.match(fn, /hb\.disabled\s*=/);
});

test("操作バー: 2行にするかは実測で決め、@media では決めない", () => {
  const fn = functionSource("fitFlagHalf");
  assert.match(fn, /parseFloat\(cs\.maxWidth\)/);
  assert.match(fn, /classList\.toggle\("tworow"/);
  assert.match(source, /\.toolflag\.tworow\{flex-wrap:wrap\}/);
  assert.match(source, /\.toolflag\.tworow \.flaghalf\{flex-basis:100%\}/);
  assert.match(source, /\.flaghalf\[hidden\]\{display:none\}/);
});

test("設定: 半を手動で設定する のチェックボックスと読み書き", () => {
  assert.match(source, /<input type="checkbox" id="halfManualChk" onchange="toggleHalfManual\(\)">/);
  assert.match(functionSource("toggleHalfManual"), /saveData\(STORE_KEY\.halfManual, halfManualEnabled\)/);
  assert.match(functionSource("initHalfManual"), /loadData\(STORE_KEY\.halfManual\)===true/);
  assert.match(source, /initSplitConfirm\(\);\s*\ninitHalfManual\(\);/);
});
