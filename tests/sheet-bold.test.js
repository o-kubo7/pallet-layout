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

test("normalizeSheetEdits は {text,bold} の形も読む", () => {
  const normalizeSheetEdits = load([...MARK_CORE, "normalizeMark", "normalizeSheetEdits"]);
  const out = normalizeSheetEdits({ sig: "s", marks: {
    "top|0|name": "A",
    "top|1|lot": { text: " ABC123", bold: [[4, 7]] },
    "top|2|lot": { text: "ABC", bold: "壊れ" },
    "top|3|lot": { text: 5, bold: [] },
    "top|4|lot": { text: "   ", bold: [[0, 3]] },
    "top|5|lot": [1, 2],
  } });
  assert.deepEqual(out, { sig: "s", marks: {
    "top|0|name": "A",
    "top|1|lot": { text: "ABC123", bold: [[3, 6]] },
    "top|2|lot": "ABC",
  } });
});

test("saveSheetMark は自動計算の値と同じ文字でも太字があれば残す", () => {
  const normalizeMarkValue = load(["normalizeMarkValue"]);
  const normalizeMark = load([...MARK_CORE, "normalizeMark"]);
  const shift = { sheetEdits: { sig: "s", marks: {} } };
  const save = load(["saveSheetMark"], {
    activeShift: () => shift, saveSchedule: () => {}, normalizeMarkValue, normalizeMark,
  });
  assert.equal(save("top|0|lot", { text: "ABC123", bold: [[3, 6]] }, "ABC123"), true);
  assert.deepEqual(shift.sheetEdits.marks["top|0|lot"], { text: "ABC123", bold: [[3, 6]] });
  // 太字を全部外して自動計算の値に戻すと、キーが消える
  assert.equal(save("top|0|lot", "ABC123", "ABC123"), false);
  assert.equal(shift.sheetEdits.marks["top|0|lot"], undefined);
  // 文字が空ならキーが消える（太字があっても）
  shift.sheetEdits.marks["top|1|lot"] = "X";
  assert.equal(save("top|1|lot", { text: "  ", bold: [[0, 2]] }, "ABC"), false);
  assert.equal(shift.sheetEdits.marks["top|1|lot"], undefined);
});

test("barEditValue は文字が変わらなければ太字を残し、変われば外す", () => {
  const normalizeMarkValue = load(["normalizeMarkValue"]);
  const barEditValue = load(["barEditValue"], { normalizeMarkValue });
  const orig = { text: "ABC123", bold: [[3, 6]] };
  assert.equal(barEditValue(" ABC123 ", orig), orig);
  assert.equal(barEditValue("ABC124", orig), "ABC124");
  assert.equal(barEditValue("ABC", "ABC"), "ABC");
  assert.equal(barEditValue("ABC", undefined), "ABC");
});

const renderSlots = () => new Function(
  "esc", "palSlotTextOf", functionSource("slotCells") + "; return slotCells;"
)(esc, () => "3P");
const renderOverflow = () => new Function(
  "esc", "palSlotTextOf", "slotAreaNote", functionSource("overflowTable") + "; return overflowTable;"
)(esc, () => "", () => "");

test("slotCells は太字の区間を <b> で包み、esc を通す", () => {
  const html = renderSlots()([], 1, "lot", null, null, "top",
    { "top|0|lot": { text: "AB<123", bold: [[3, 6]] } });
  assert.match(html, /<span class="fit">AB&lt;<b>123<\/b><\/span>/);
  assert.match(html, /edited/);
  assert.doesNotMatch(html, /object Object/);
});

test("slotCells の縦積みの欄で、改行をまたいで太字の位置が合う", () => {
  const html = renderSlots()([], 1, "lot", null, null, "top",
    { "top|0|lot": { text: "L1\nL2", bold: [[4, 5]] } });
  assert.match(html, /<span class="fitcol"><span class="fit">L1<\/span><span class="fit">L<b>2<\/b><\/span><\/span>/);
});

test("slotCells は文字列の書き足しを今までどおりに出す", () => {
  const html = renderSlots()([], 1, "note", null, null, "top", { "top|0|note": "臨時" });
  assert.match(html, /<span class="fit">臨時<\/span>/);
  assert.doesNotMatch(html, /<b>/);
});

test("overflowTable と markHtml は slotCells と同じ中身を出す", () => {
  const markHtml = load([...MARK_CORE, "markHtml"], { esc });
  const v = { text: "AB<123", bold: [[3, 6]] };
  const inner = h => (h.match(/<span class="fit">(.*?)<\/span><\/td>/) || [])[1];
  const slot = renderSlots()([], 1, "lot", null, null, "top", { "top|0|lot": v });
  const entry = { lot: { id: "X", name: "品", lot: "L" }, areas: [] };
  const over = renderOverflow()([entry], { "over|0|lot": v });
  assert.equal(inner(slot), markHtml(v));
  assert.match(over, new RegExp("<span class=\"fit\">" + markHtml(v).replace(/[/]/g, "\\/") + "</span>"));
});

test("見出し欄は markHtml で組み立てる", () => {
  const fn = functionSource("renderSheet");
  assert.match(fn, /edited\s*\?\s*markHtml\(mv\)\s*:\s*esc\(g\.label\)/);
  assert.doesNotMatch(fn, /esc\(label\)/);
});

test("太字は 700 で描く", () => {
  assert.match(source, /\.sheet \.fit b\{font-weight:700\}/);
});

// editorRaw / editorPoint が見るのは childNodes・nodeType・nodeValue・nodeName だけ
const T = s => ({ nodeType: 3, nodeName: "#text", nodeValue: s, childNodes: [] });
const E = (name, kids) => ({ nodeType: 1, nodeName: name, childNodes: kids });

test("editorRaw は <b> の中を太字、<br> を改行として読む", () => {
  const editorRaw = load(["editorRaw"]);
  const root = E("DIV", [T("AB"), E("B", [T("12"), E("SPAN", [T("3")])]), E("BR", []), T("C")]);
  assert.deepEqual(editorRaw(root), {
    text: "AB123\nC",
    flags: [false, false, true, true, true, false, false],
  });
});

test("editorModel は1行の欄では改行を取り除く", () => {
  const editorModel = load(["editorRaw", "markFromFlags", "editorModel"]);
  const root = E("DIV", [T("AB"), E("BR", []), E("B", [T("C")])]);
  assert.deepEqual(editorModel(root, false), { text: "ABC", bold: [[2, 3]] });
  assert.deepEqual(editorModel(root, true), { text: "AB\nC", bold: [[3, 4]] });
});

test("editorPoint は文字位置をノードと位置に変える", () => {
  const editorPoint = load(["editorPoint"]);
  const t1 = T("AB"), t2 = T("12"), br = E("BR", []), t3 = T("C");
  const root = E("DIV", [t1, E("B", [t2]), br, t3]);
  assert.deepEqual(editorPoint(root, 0), [t1, 0]);
  // 区間の境目は前の区間の末尾に置く（太字の直後で打つと太字が続く）
  assert.deepEqual(editorPoint(root, 2), [t1, 2]);
  assert.deepEqual(editorPoint(root, 3), [t2, 1]);
  assert.deepEqual(editorPoint(root, 4), [t2, 2]);
  assert.deepEqual(editorPoint(root, 5), [t3, 0]);
  assert.deepEqual(editorPoint(root, 99), [root, 4]);
});

test("PC の編集欄は plaintext-only の contenteditable にする", () => {
  const fn = functionSource("openInlineEditor");
  assert.match(fn, /contenteditable/);
  assert.match(fn, /plaintext-only/);
  assert.match(fn, /activeSheetMarks\(\)/);
  assert.match(fn, /isComposing/);
  assert.doesNotMatch(fn, /execCommand/);
  assert.doesNotMatch(fn, /createElement\(multi\?"textarea":"input"\)/);
});

test("確定は sheetEditing.read() の値を保存する", () => {
  const fn = functionSource("flushSheetEdit");
  assert.match(fn, /read\(\)/);
  assert.doesNotMatch(fn, /el\.value/);
  assert.match(functionSource("openBarEditor"), /barEditValue\(/);
});

test("編集欄の CSS を contenteditable にも当てる", () => {
  assert.match(source, /\.sheet td\.editing-cell input,\.sheet td\.editing-cell textarea,\.sheet td\.editing-cell \.cell-editor\{/);
  assert.match(source, /\.sheet td\.editing-cell \.cell-editor\{white-space:pre/);
});

test("B ボタンは mousedown で既定動作を止め、確定を走らせない", () => {
  const fn = functionSource("placeSheetBoldBtn");
  assert.match(fn, /addEventListener\("mousedown",\s*ev\s*=>\s*ev\.preventDefault\(\)\)/);
  assert.match(fn, /addEventListener\("click",\s*applySheetBold\)/);
  assert.match(fn, /\.sheetbox/);
  // 表示倍率で割る（drawLeaders と同じ考え方）
  assert.match(fn, /zoom/);
  // 右端を欄の右端にそろえる
  assert.match(fn, /style\.left=\(\(r\.right-b\.left\)\/z-w\)/);
});

test("B ボタンと Ctrl+B は同じ処理を呼ぶ", () => {
  const fn = functionSource("openInlineEditor");
  assert.match(fn, /placeSheetBoldBtn\(td\)/);
  assert.match(fn, /ev\.key\.toLowerCase\(\)==="b"/);
  assert.match(fn, /applySheetBold\(\)/);
});

test("applySheetBold は toggleBold を通して組み直し、選択を戻す", () => {
  const fn = functionSource("applySheetBold");
  assert.match(fn, /editorSelection\(/);
  assert.match(fn, /toggleBold\(/);
  assert.match(fn, /setEditorSelection\(/);
  assert.doesNotMatch(fn, /execCommand/);
});

test("欄を閉じるときに B ボタンも消す", () => {
  assert.match(functionSource("flushSheetEdit"), /removeSheetBoldBtn\(\)/);
  assert.match(functionSource("cancelSheetEdit"), /removeSheetBoldBtn\(\)/);
});

test("B ボタンは紙に出さない", () => {
  const start = source.indexOf("@media print{");
  const print = source.slice(start, source.indexOf("</style>", start));
  assert.match(print, /\.sheet-bold-btn\{display:none !important\}/);
});

// 末尾の改行は Chrome が pre の中で描かないので、編集欄にだけ目印の BR を足す
const tailBr = () => ({ nodeType: 1, nodeName: "BR", childNodes: [], dataset: { tail: "1" } });

test("editorRaw は末尾の目印 BR を数えない", () => {
  const editorRaw = load(["editorRaw"]);
  const root = E("DIV", [T("AB\n"), tailBr()]);
  assert.deepEqual(editorRaw(root), { text: "AB\n", flags: [false, false, false] });
});

test("editorPoint は末尾の目印 BR を数えず、位置にもしない", () => {
  const editorPoint = load(["editorPoint"]);
  const t = T("AB\n");
  const root = E("DIV", [t, tailBr()]);
  assert.deepEqual(editorPoint(root, 3), [t, 3]);
  assert.deepEqual(editorPoint(root, 99), [root, 2]);
});

test("setEditorContent は末尾が改行のときだけ目印の BR を足す", () => {
  const setEditorContent = load(["markFlags", "markFromFlags", "markText", "markHtml", "setEditorContent"], { esc });
  const root = {};
  setEditorContent(root, "AB");
  assert.equal(root.innerHTML, "AB");
  setEditorContent(root, { text: "A\n", bold: [[0, 1]] });
  assert.equal(root.innerHTML, '<b>A</b>\n<br data-tail="1">');
});

test("編集欄の中身は setEditorContent で入れる", () => {
  for (const name of ["openInlineEditor", "insertEditorNewline", "applySheetBold"]) {
    const fn = functionSource(name);
    assert.match(fn, /setEditorContent\(/, name);
    assert.doesNotMatch(fn, /innerHTML=markHtml/, name);
  }
});
