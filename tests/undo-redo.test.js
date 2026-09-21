const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 関数をソースから切り出す。既存テスト（tests/sheet-placement.test.js:339）と同じ実装。
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

// 履歴の5関数をまとめて取り出して動かす。上限は定数なのでソースから読む。
function loadHistory() {
  const limit = source.match(/const HISTORY_LIMIT\s*=\s*(\d+)/);
  assert.notEqual(limit, null, "HISTORY_LIMIT must exist");
  const src = `const HISTORY_LIMIT=${limit[1]};`
    + functionSource("historyMake")
    + functionSource("historyPush")
    + functionSource("historyUndo")
    + functionSource("historyRedo")
    + functionSource("historyCanUndo")
    + functionSource("historyCanRedo")
    + "; return {HISTORY_LIMIT, historyMake, historyPush, historyUndo, historyRedo,"
    + " historyCanUndo, historyCanRedo};";
  return new Function(src)();
}

const step = (kind, tag) => ({kind, tag, sel:{lotId:null, cells:[]}, sp:[tag]});

test("新しい履歴は空でカーソルが -1", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.deepEqual(h.steps, []);
  assert.equal(h.cursor, -1);
});

test("push するとカーソルが末尾に進む", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(h.steps.length, 1);
  assert.equal(h.cursor, 0);
  H.historyPush(h, step("move", "b"));
  assert.equal(h.steps.length, 2);
  assert.equal(h.cursor, 1);
});

test("undo はひとつ前のステップを返す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  const got = H.historyUndo(h);
  assert.equal(got.tag, "a");
  assert.equal(h.cursor, 0);
});

test("redo は戻したステップに進み直す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  H.historyUndo(h);
  const got = H.historyRedo(h);
  assert.equal(got.tag, "b");
  assert.equal(h.cursor, 1);
});

test("先頭で undo しても何も返さずカーソルも動かない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyUndo(h), null);
  assert.equal(h.cursor, 0);
});

test("末尾で redo しても何も返さずカーソルも動かない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyRedo(h), null);
  assert.equal(h.cursor, 0);
});

test("空の履歴で undo と redo を呼んでも壊れない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.equal(H.historyUndo(h), null);
  assert.equal(H.historyRedo(h), null);
  assert.equal(h.cursor, -1);
  assert.equal(h.steps.length, 0);
});

test("undo した後に push すると、やり直せる分が捨てられる", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  H.historyPush(h, step("move", "c"));
  H.historyUndo(h);                       // cursor=1（b）
  H.historyPush(h, step("move", "d"));
  assert.deepEqual(h.steps.map(s => s.tag), ["a", "b", "d"]);
  assert.equal(h.cursor, 2);
  assert.equal(H.historyCanRedo(h), false);
});

test("上限を超えると古いほうから落ち、カーソルも詰まる", () => {
  const H = loadHistory();
  const h = H.historyMake();
  for (let i = 0; i < H.HISTORY_LIMIT + 5; i++) H.historyPush(h, step("move", "s" + i));
  assert.equal(h.steps.length, H.HISTORY_LIMIT);
  assert.equal(h.cursor, H.HISTORY_LIMIT - 1);
  assert.equal(h.steps[0].tag, "s5");
  assert.equal(h.steps[h.steps.length - 1].tag, "s" + (H.HISTORY_LIMIT + 4));
});

test("上限で落ちた後も undo が正しいステップを返す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  for (let i = 0; i < H.HISTORY_LIMIT + 1; i++) H.historyPush(h, step("move", "s" + i));
  // s0 が落ちて s1..sN が残る。末尾は sN なので、ひとつ戻ると s(N-1)
  const got = H.historyUndo(h);
  assert.equal(got.tag, "s" + (H.HISTORY_LIMIT - 1));
});

test("canUndo と canRedo が境界で正しい", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.equal(H.historyCanUndo(h), false);
  assert.equal(H.historyCanRedo(h), false);
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyCanUndo(h), false);   // 1件だけなら戻れない
  H.historyPush(h, step("move", "b"));
  assert.equal(H.historyCanUndo(h), true);
  assert.equal(H.historyCanRedo(h), false);
  H.historyUndo(h);
  assert.equal(H.historyCanRedo(h), true);
});

test("履歴はあさ・ひるで別々に持つ", () => {
  assert.match(source, /let histories\s*=\s*\{\s*am:historyMake\(\)\s*,\s*pm:historyMake\(\)\s*\}/);
  assert.match(source, /function activeHistory\(\)\{[^}]*histories\[activeTiming\]/);
});

test("選択は配列に写して履歴へ入れる", () => {
  // sel.cells は Set。履歴には配列で入れ、戻すときに new Set() で復元する
  const fn = functionSource("selSnapshot");
  assert.match(fn, /lotId:\s*sel\.lotId/);
  assert.match(fn, /cells:\s*\[\.\.\.sel\.cells\]/);
});

test("移動のステップは新しい sp を持ち、選択のステップは前の sp を使い回す", () => {
  const move = functionSource("pushMoveStep");
  assert.match(move, /kind:"move"/);
  // 移動後の配置をそのまま持つ（呼ぶ側が控えた spBefore ではない）
  assert.match(move, /snapshotSpaces\(lastSp\)/);

  const sel = functionSource("pushSelectStep");
  assert.match(sel, /kind:"select"/);
  // 履歴が空のときの土台だけは実配置を控える。それ以外ではコピーしない（設計書 §4）
  assert.equal((sel.match(/snapshotSpaces\(/g) || []).length, 1);
  assert.match(sel, /currentStepSp\(\)\s*\|\|/);
  assert.match(sel, /currentStepSp\(\)/);
});

test("移動のステップは移動前の配置も積む", () => {
  // 1件目で戻れないと「動かした直後に戻す」ができない。
  // 履歴が空のときは、移動前の配置を先に1件積んでから移動後を積む。
  const fn = functionSource("pushMoveStep");
  assert.match(fn, /spBefore/);
});

test("履歴を捨てる関数がある", () => {
  const fn = functionSource("clearHistory");
  assert.match(fn, /historyMake\(\)/);
});

test("履歴の適用は配置をコピーしてから載せる", () => {
  const fn = functionSource("applyHistoryStep");
  // steps に入っている配列をそのまま lastSp にすると、以後の操作が履歴を壊す
  assert.match(fn, /lastSp\s*=\s*clone\(step\.sp\)/);
});

test("履歴の適用は配置不可をいまの値から合成する", () => {
  // 配置不可は履歴に持たない。戻した配置にいまの blocked を混ぜる
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /hydrateBlockedRows\(lastSp,\s*activeShift\(\)\.blocked\)/);
});

test("履歴の適用は選択を Set に戻す", () => {
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /sel\.cells\s*=\s*new Set\(/);
  assert.match(fn, /sel\.lotId\s*=/);
});

test("履歴の適用は手動調整の保存と描き直しまでやる", () => {
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /saveManual\(\)/);
  assert.match(fn, /redraw\(\)/);
});

test("入力が変わっていたら履歴を捨てて何もしない", () => {
  // 伝票を書き換えると isActiveFresh() が false になる。そのまま戻すと
  // saveManual() も redraw() も弾かれ、配置ごと消える
  assert.match(functionSource("historyUsable"), /isActiveFresh\(\)/);
  const u = functionSource("doUndo");
  assert.match(u, /historyUsable\(\)/);
  assert.match(u, /clearHistory\(\)/);
});

test("戻すと進むは履歴の関数を呼ぶ", () => {
  assert.match(functionSource("doUndo"), /historyUndo\(activeHistory\(\)\)/);
  assert.match(functionSource("doRedo"), /historyRedo\(activeHistory\(\)\)/);
});

test("履歴の適用は redraw のあとに選択を戻す", () => {
  // drawZone が clearSel() を呼ぶので、redraw より前に戻した選択は消える
  const fn = functionSource("applyHistoryStep");
  const redrawAt = fn.indexOf("redraw()");
  const selAt = fn.indexOf("sel.cells = new Set(");
  const paintAt = fn.indexOf("repaintSel()");
  assert.notEqual(redrawAt, -1);
  assert.notEqual(selAt, -1);
  assert.notEqual(paintAt, -1);
  assert.ok(redrawAt < selAt, "redraw() より前に選択を戻している");
  assert.ok(selAt < paintAt, "repaintSel() より後に選択を戻している");
});

test("移動は growStashCol より前の配置を控える", () => {
  // growStashCol は lastSp を直接書き換える。後で控えると、
  // 退避スペースの列が伸びた後の状態しか残らない。設計書 §5-1
  const fn = functionSource("applyMove");
  const before = fn.indexOf("snapshotSpaces(lastSp)");
  // 実装コメントにも「growStashCol」という語が出てくるため、素の文字列だと
  // コメント側にマッチして誤判定になる。実際の呼び出し（開き括弧つき）を探す。
  const grow = fn.indexOf("growStashCol(spaceName");
  assert.notEqual(before, -1, "移動前の配置を控えていない");
  assert.notEqual(grow, -1);
  assert.ok(before < grow, "控えるのが growStashCol より後になっている");
});

test("移動後のステップは選択を空で積む", () => {
  // 移動前の選択を持たせると、やり直したときに荷物の無いマスのキーが戻り、
  // 帯に「NP」だけが出る実体のない選択になる
  const fn = functionSource("pushMoveStep");
  assert.match(fn, /sel:\{lotId:null,\s*cells:\[\]\}/);
  // 土台（動かす前）のステップには、動かす前の選択を持たせる
  assert.match(fn, /sel:selBefore/);
});

test("移動が確定してから履歴に積む", () => {
  const fn = functionSource("applyMove");
  const assign = fn.indexOf("lastSp=v.next");
  const push = fn.indexOf("pushMoveStep(");
  assert.ok(assign !== -1 && push !== -1);
  assert.ok(assign < push, "配置が確定する前に積んでいる");
});

test("タップの選択を履歴に積む", () => {
  const fn = functionSource("toggleCell");
  assert.match(fn, /pushSelectStep\(\)/);
  // intent==="single" の枝でも積む（どちらも選択が変わるため）
  assert.equal((fn.match(/pushSelectStep\(\)/g) || []).length, 2);
});

test("なぞりと矩形はストロークが成立したときだけ積む", () => {
  const sweep = functionSource("endSweep");
  assert.match(sweep, /sweep\.started/);
  assert.match(sweep, /pushSelectStep\(\)/);
  const rubber = functionSource("endRubber");
  assert.match(rubber, /started/);
  assert.match(rubber, /pushSelectStep\(\)/);
});

test("自動配置は履歴を捨てる", () => {
  assert.match(functionSource("run"), /clearHistory\(\)/);
});

test("時間帯の切替では履歴を捨てない", () => {
  // あさ・ひるで別々に持つので、切り替えただけで消してはいけない
  assert.equal(functionSource("setActiveTiming").includes("clearHistory()"), false);
});
