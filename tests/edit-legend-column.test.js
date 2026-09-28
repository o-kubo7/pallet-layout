const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 開き括弧 { から対応する閉じ括弧 } までの中身を返す（入れ子を数える）
function blockFrom(open) {
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, j);
    }
  }
  throw new Error("閉じ括弧が見つからない");
}
// 同じ @media 条件のブロックをすべてつないで返す
function mediaCss(query) {
  const parts = [];
  let i = 0;
  while ((i = source.indexOf(query, i)) !== -1) {
    parts.push(blockFrom(source.indexOf("{", i)));
    i += query.length;
  }
  return parts.join("\n");
}
function fnBody(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name + " が見つからない");
  return blockFrom(source.indexOf("{", start));
}

test("凡例1件は品名・ロット・パレット数を入れ物に分け、パレット数を太字にする", () => {
  assert.match(
    source,
    /<span class="lg-body"><span class="lg-name\$\{\[\.\.\.l\.name\]\.length>4\?" lg-long":""\}">\$\{esc\(l\.name\)\}<\/span><span class="lg-rest"><span class="lg-sep">\/<\/span>\$\{esc\(l\.lot\)\|\|"—"\}　<b>\$\{l\.pallets\}P<\/b>/
  );
});

test("製品だけ、番号の枠の中に「製」の印を入れる", () => {
  assert.match(source, /\$\{l\.type==="製品"\?'<i class="lg-mk">製<\/i>':""\}<\/span><span class="lg-body">/);
});

test("凡例1件の共通スタイル（どの画面幅でも効く）", () => {
  // 新しい span に .legend span の背景・余白・inline-flex が付かないよう打ち消す
  assert.match(
    source,
    /\.legend \.lg-body,\.legend \.lg-name,\.legend \.lg-rest,\.legend \.lg-sep\{display:inline;padding:0;background:none;border-radius:0\}/
  );
  assert.match(source, /\.legend \.lg-sep\{margin:0 \.3em\}/);
  assert.match(source, /\.legend \.lg-rest b\{font-weight:800\}/);
  assert.match(source, /\.legend \.swframe\{position:relative\}/);
  const mk = source.match(/\.legend \.lg-mk\{[^}]*\}/);
  assert.notEqual(mk, null);
  assert.match(mk[0], /position:absolute/);
  assert.match(mk[0], /top:-8px/);
  assert.match(mk[0], /left:-8px/);
  assert.match(source, /\.legend\.no-mk \.lg-mk\{display:none\}/);
  // .legend{display:flex} が UA の [hidden] に勝つので明示する
  assert.match(source, /\.legend\[hidden\]\{display:none\}/);
});
