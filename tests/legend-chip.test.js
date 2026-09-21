const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

test("凡例のチップは番号を色マスの中に入れた1要素で出す", () => {
  // 番号（.lno）と色見本（.swatch）に分かれていた2要素をやめ、
  // 盤のマスと同じ「色の付いた四角に番号が入っている」形に揃える
  assert.match(
    source,
    /<i class="swatch" style="background:\$\{colorOf\[l\.id\]\}">\$\{l\.id *\+ *1\}<\/i>/
  );
  assert.equal(source.includes('<b class="lno">'), false);
  assert.equal(source.includes(".legend b.lno"), false);
});

test("凡例のマスは盤の列と同じ外枠でくるむ", () => {
  // 盤の列（.col / .hrow）は 2px の黒枠・内側 3px の余白・角丸 4px・背景 #fafafa。
  // 凡例も同じ値にして、スペースに配置されたときの見た目に合わせる
  assert.match(source, /<span class="swframe">/);
  const m = source.match(/\.swframe\{[^}]*\}/);
  assert.notEqual(m, null);
  assert.match(m[0], /border:2px solid #111/);
  assert.match(m[0], /padding:3px/);
  assert.match(m[0], /border-radius:4px/);
  assert.match(m[0], /background:#fafafa/);
});

test("凡例のマスは 26px 角・番号 15px", () => {
  const m = source.match(/\.swatch\{[^}]*\}/);
  assert.notEqual(m, null);
  assert.match(m[0], /width:26px/);
  assert.match(m[0], /height:26px/);
  assert.match(m[0], /font-size:15px/);
  // ロット一覧は外枠（.swframe）だけで囲む。マスの灰色の枠線は出さない
  assert.match(m[0], /border:0/);
  assert.equal(m[0].includes("#cbd5e1"), false);
  assert.match(m[0], /border-radius:2px/);
  assert.match(m[0], /font-weight:800/);
  assert.match(m[0], /color:#1f2937/);
});
