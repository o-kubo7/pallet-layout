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
