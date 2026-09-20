const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

test("角の丸みは設定タブの数値入力で指定する", () => {
  assert.match(
    source,
    /<input type="number" id="lotCornerPx" min="0" max="20" step="1" onchange="cornerChanged\(\)">/
  );
});

test("角の丸みの「あり／なし」ボタンは残っていない", () => {
  // 数値入力に一本化したので data-corner のボタンは消えている。
  // 消し忘れると setCellSize() の [data-size] 絞り込みと同じ種類の
  // 「2つの UI が同じ値を指す」ずれが戻る
  assert.equal(source.includes("data-corner"), false);
  assert.equal(source.includes("setLotCorner(true)"), false);
  assert.equal(source.includes("setLotCorner(false)"), false);
});

test("角の丸みは常に px 付きで CSS 変数に書き込む", () => {
  // removeProperty で既定値に戻す分岐は廃止した。0 も 20 も同じ経路で当てる
  assert.match(source, /setProperty\("--lot-corner", *lotCorner *\+ *"px"\)/);
  assert.equal(source.includes('removeProperty("--lot-corner")'), false);
});

test("角の丸みは 0〜20 に丸め、外れた値は既定の 15 に戻す", () => {
  assert.match(source, /LOT_CORNER_MIN *= *0\b/);
  assert.match(source, /LOT_CORNER_MAX *= *20\b/);
  assert.match(source, /LOT_CORNER_DEFAULT *= *15\b/);

  const start = source.indexOf("function clampLotCorner(");
  assert.notEqual(start, -1);
  const body = source.slice(start, start + 400);
  assert.match(body, />= *LOT_CORNER_MIN/);
  assert.match(body, /<= *LOT_CORNER_MAX/);
  assert.match(body, /LOT_CORNER_DEFAULT/);

  // 入力欄からの経路も clamp を通る
  assert.match(source, /function setLotCorner\(px\)\{\s*lotCorner=clampLotCorner\(px\)/);
});

test("角の丸みは旧版の true／false の保存値からも復元する", () => {
  // 旧版は真偽値で保存していた。移行しないと、あり派の端末が
  // リロードで既定に戻ったように見え、なし派の端末は角が丸くなる
  const start = source.indexOf("function initLotCorner(");
  assert.notEqual(start, -1);
  const body = source.slice(start, start + 600);
  assert.match(body, /c *=== *true/);
  assert.match(body, /c *=== *false/);
});
