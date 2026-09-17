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

test("紙の欄を指す語を「追記欄」に統一する", () => {
  // 荷物の側の「あふれ」「あふれ受け」は残す。紙の欄の呼び名だけを直す
  assert.doesNotMatch(source, /あふれブロック/);
  assert.match(source, /配置図の追記欄にも記載できない項目があります/);
  assert.match(source, /あふれ受け\(出庫口横・5棟壁際\)/);
});

test("掲載先 over のラベルは実態に合わせて「掲載しない」にする", () => {
  // over は「配置の対象から外し、紙にも出さない」であって追記欄とは別物
  assert.match(source, /over＝掲載しない/);
  assert.match(source, /掲載先を「掲載しない」にした次のエリアには、新しく荷物を置きません/);
});

test("退避スペースの中身から紙の欄を作る", () => {
  const fn = functionSource("stashSlots");
  // 退避エリアだけを見る
  assert.match(fn, /stashSpaces\(/);
  // 注釈はエリア名ではなく固定の文言
  assert.match(fn, /※置き場未定/);
  // 後続の分岐が見る目印
  assert.match(fn, /stash:\s*true/);
  // 通常の欄と同じくまとめる。まとめない設定にも従う
  assert.match(fn, /mergeLots/);
  assert.match(fn, /mergeEntries\(/);
});

test("退避の欄を上段の欄の末尾に連結する", () => {
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /sheetSlots\("top"\)\.concat\(stashSlots\(\)\)/);
});

test("下段へ回した退避の欄は注釈を作り直さない", () => {
  // slotAreaNote() を通すと ※退避 に化ける
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /e\.stash\s*\?\s*e\.note\s*:\s*slotAreaNote\(e\.areas\)/);
});

test("追記欄には欄数超過を先に入れ、退避の欄を後ろへ回す", () => {
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /filter\(e=>!e\.stash\)\.concat\(/);
  assert.match(fn, /filter\(e=>e\.stash\)/);
});

test("追記欄は3件以上あるとき2枠目にまとめて記載する", () => {
  const fn = functionSource("arrangeOverflowSlots");
  // 2件以内は従来どおり
  assert.match(fn, /entries\.length<=2/);
  // 3件以上は2枠目を group にする
  assert.match(fn, /group:\s*entries\.slice\(1\)/);
  // 紙に出ない項目は出さない
  assert.match(fn, /unlisted:\s*\[\]/);
});

test("まとめ欄は品名・ロット・パレット数を縦積みで書く", () => {
  const fn = functionSource("overflowTable");
  assert.match(fn, /e\.group\s*\|\|\s*\[e\]/);
  assert.match(fn, /fitcol/);
});

test("まとめ欄の注記は重複を畳む", () => {
  // 置き場未定が3件あっても ※置き場未定 は1回だけ書く
  const fn = functionSource("overflowTable");
  assert.match(fn, /new Set\(/);
});

test("あふれた分を退避スペースへ入れる", () => {
  const fn = functionSource("run");
  assert.match(fn, /l\.rem>0/);
  assert.match(fn, /putToStash\(lastSp,\s*l\.id,/);
  // 前回の退避を積み戻したあとに置く（先に置くと前回分の居場所を食う）
  const back = fn.indexOf("l.stashed");
  const auto = fn.indexOf("l.rem>0");
  assert.ok(back !== -1 && auto !== -1 && back < auto,
    "あふれの投入は退避の積み戻しより後に置くこと");
});

test("退避の実効容量は列数×列高から数える", () => {
  const fn = functionSource("stashFreeRoom");
  // 初期列は h:7 だが repackStash() が h:4 で積み直すので、実効は 14×4=56P
  assert.match(fn, /STASH_MAX_COLS\s*\*\s*STASH_COL_H/);
  assert.match(fn, /stashTotal\(/);
});

test("退避にも入りきらない分は知らせる", () => {
  const fn = functionSource("run");
  assert.match(fn, /noRoom/);
  const render = functionSource("renderResult");
  assert.match(render, /退避スペースに入りきらない荷物があります/);
});

test("退避に荷物が残る日は「すべてのパレットを配置しました」を出さない", () => {
  const fn = functionSource("renderResult");
  assert.match(fn, /倉庫に置く分はすべて配置しました/);
});

test("退避の知らせは紙に載ることを伝える", () => {
  const fn = functionSource("renderResult");
  assert.match(fn, /置き場未定として配置図に載ります/);
  assert.doesNotMatch(fn, /配置図の表には出ません。倉庫内・倉庫外へ戻してください/);
});
