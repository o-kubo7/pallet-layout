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

function masterRowOrder(names) {
  return new Function(
    ["compareMasterName", "masterRowOrder"].map(functionSource).join("\n") +
    "; return masterRowOrder;"
  )()(names);
}

test("品目マスタの行は品名順に並ぶ。英字が先、連番は数として比べる", () => {
  const names = ["部品10", "製品X", "Box", "部品2", "あ"];
  const order = masterRowOrder(names);
  assert.deepEqual(order.map(i => names[i]), ["Box", "あ", "製品X", "部品2", "部品10"]);
});

test("同じ品名の行は元の順のまま。先の行のSNPが既定値なので崩さない", () => {
  // 部品C を SNP 20 → 10 の順で登録した場合、並べ替え後も 20 が先
  const names = ["部品D", "部品C", "部品A", "部品C"];
  assert.deepEqual(masterRowOrder(names), [2, 1, 3, 0]);
});

test("品名が空の行は末尾に置く", () => {
  const names = ["", "部品B", " ", "部品A"];
  assert.deepEqual(masterRowOrder(names), [3, 1, 0, 2]);
});

test("伝票入力の候補も同じ比較関数で並べる", () => {
  assert.match(functionSource("acNames"), /compareMasterName/);
});

test("品名の入力を終えたときと、入力画面から登録したときに並べ替える", () => {
  assert.match(functionSource("addMasterRow"), /onchange="setTimeout\(sortMasterRows\)"/);
  assert.match(functionSource("registerItems"), /sortMasterRows\(\)/);
});
