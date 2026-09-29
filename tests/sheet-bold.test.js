const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

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

// 本物の esc と同じ実装。esc 自体は正規表現に " を含み、functionSource で切り出せない
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g,
  c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// 名前の並びを1つの関数本体にまとめて評価し、最後の名前を返す
function load(names, deps = {}) {
  const depNames = Object.keys(deps);
  const body = names.map(functionSource).join("\n") + `; return ${names[names.length - 1]};`;
  return new Function(...depNames, body)(...depNames.map(k => deps[k]));
}

const MARK_CORE = ["markFlags", "markFromFlags", "markText"];

test("markFlags は文字列と {text,bold} を1文字ずつの太字の配列にする", () => {
  const markFlags = load(["markFlags"]);
  assert.deepEqual(markFlags("AB"), { text: "AB", flags: [false, false] });
  assert.deepEqual(markFlags({ text: "ABC", bold: [[1, 3]] }), { text: "ABC", flags: [false, true, true] });
  // 壊れた範囲は無視する
  assert.deepEqual(markFlags({ text: "ABC", bold: [[2, 1], [0, 9], ["a", 2], 5] }).flags, [false, false, false]);
  assert.deepEqual(markFlags({ text: 5, bold: [] }), { text: "", flags: [] });
  assert.deepEqual(markFlags(null), { text: "", flags: [] });
});

test("markFromFlags は範囲をまとめ、太字が無ければ文字列に戻す", () => {
  const markFromFlags = load(["markFromFlags"]);
  assert.equal(markFromFlags("ABC", [false, false, false]), "ABC");
  assert.deepEqual(markFromFlags("ABCD", [true, true, false, true]), { text: "ABCD", bold: [[0, 2], [3, 4]] });
});

test("normalizeMark は空白を落とし、太字の位置を合わせる", () => {
  const norm = load([...MARK_CORE, "normalizeMark"]);
  // 文字列は旧 normalizeMarkValue と同じ結果
  const old = load(["normalizeMarkValue"]);
  for (const s of ["  部品A  ", "", "   ", "　　", "\n\n", " A \n B ", "A\n\nB", "A\n  \nB"]) {
    assert.equal(norm(s), old(s), JSON.stringify(s));
  }
  assert.equal(norm(null), "");
  // 前の空白2文字を落とすと、太字の位置も2つ前へずれる
  assert.deepEqual(norm({ text: "  ABC123", bold: [[5, 8]] }), { text: "ABC123", bold: [[3, 6]] });
  // 空白だけが太字だった場合は太字が消えて文字列に戻る
  assert.equal(norm({ text: "AB  ", bold: [[2, 4]] }), "AB");
  // 空行を落としても2行目の太字の位置が合う
  assert.deepEqual(norm({ text: "L1\n\n L2", bold: [[5, 7]] }), { text: "L1\nL2", bold: [[3, 5]] });
  // 重なる範囲と隣り合う範囲は1つにまとまる
  assert.deepEqual(norm({ text: "ABCDE", bold: [[0, 2], [1, 3], [3, 4]] }), { text: "ABCDE", bold: [[0, 4]] });
});

test("toggleBold は全部太字なら外し、一部でも普通なら全部太字にする", () => {
  const toggle = load([...MARK_CORE, "toggleBold"]);
  assert.deepEqual(toggle("ABC123", 3, 6), { text: "ABC123", bold: [[3, 6]] });
  assert.equal(toggle({ text: "ABC123", bold: [[3, 6]] }, 3, 6), "ABC123");
  assert.deepEqual(toggle({ text: "ABC123", bold: [[3, 4]] }, 2, 6), { text: "ABC123", bold: [[2, 6]] });
  // 逆向きの選択も同じ
  assert.deepEqual(toggle("ABC", 3, 1), { text: "ABC", bold: [[1, 3]] });
  // 0文字の範囲では何も変えない
  assert.deepEqual(toggle({ text: "ABC", bold: [[0, 1]] }, 2, 2), { text: "ABC", bold: [[0, 1]] });
});

test("markHtml は太字の区間だけを <b> で包み、各区間を esc する", () => {
  const html = load([...MARK_CORE, "markHtml"], { esc });
  assert.equal(html("A<B"), "A&lt;B");
  assert.equal(html({ text: "AB<C", bold: [[2, 4]] }), "AB<b>&lt;C</b>");
  assert.equal(html({ text: "L1\nL2", bold: [[0, 1], [4, 5]] }), "<b>L</b>1\nL<b>2</b>");
});
