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
