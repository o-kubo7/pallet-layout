# 配置図のテキスト編集で一部の文字を太字にする 実行計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図のテキスト編集（PC）で、範囲選択＋「B」ボタン（Ctrl+B）により1文字単位で太字を付けられるようにし、紙と画面に太字で出す。

**Architecture:** 書き足しの値を「文字列」または `{text, bold:[[開始,終了),...]}` で保存する。純粋関数（`markFlags` / `markFromFlags` / `normalizeMark` / `toggleBold` / `markHtml`）で形を扱い、描画3か所で `<b>` を組み立てる。PC の編集欄は `contenteditable="plaintext-only"` の `div` にし、編集中の画面（DOM）を正として読み取る。スマホの編集バーは `input` のまま、文字が変わらなければ太字を残す。

**Tech Stack:** 単一 HTML の PWA（`files/index.html` に埋め込みの JavaScript）、Service Worker（`files/sw.js`）、テストは `node --test`（外部ライブラリなし）。

**Spec:** `docs/superpowers/specs/2026-09-29-sheet-text-bold-design.md`

## Global Constraints

- 行番号は 2026-09-29 時点（`files/index.html` 全 7187 行、`main` の `519f862`）。各タスクの着手時に `grep -n` で取り直すこと。
- テストの実行コマンドは `node --test tests/*.test.js`（`node --test tests/` は動かない）。着手前の基準は 463 件すべて成功。
- 太さは `font-weight:700` 固定。欄の太字設定（`--fw-*`）が ON の欄では見た目が変わらないが、これは仕様。
- `execCommand` は使わない。
- `slotCells` と `overflowTable` の中から、外の関数を呼ばない（テストが `new Function(依存名..., 本体)` で評価するため）。`esc` は依存名に入っているので使ってよい。
- テストの `functionSource()` は、関数の本体を括弧の対応で切り出す。その際 `'` `"` `` ` `` を文字列の開始として数え、コメントは区別しない。**テストから切り出す関数の中では、コメントに ASCII の引用符（`'` `"` `` ` ``）を書かない。** 正規表現リテラルにも `"` と `'` を入れない。
- 確定の経路（`saveSheetMark` / `flushSheetEdit` / `exitSheetEditMode`）に `confirm()` を入れない（印刷の経路から呼ばれる）。
- PC とスマホで入力面が別（600px 境界、`compactInputMq`）。「B」ボタンと DOM の読み取り処理は PC 側（`openInlineEditor`）にだけ置く。
- コミットメッセージは日本語で `feat:` / `test:` / `chore:` などの接頭辞を付け、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を入れる。
- 作業ブランチは `main` から切った `feat/sheet-text-bold`。
- 計画外の変更が必要になったら、止めてユーザーに相談する。

---

## ファイル構成

| ファイル | 変更 |
|---|---|
| `files/index.html` | 太字の値を扱う純粋関数の追加、保存・読み込み、描画3か所、PC の編集欄、「B」ボタン、CSS |
| `files/sw.js` | `CACHE_VERSION` を1つ上げる |
| `tests/sheet-bold.test.js` | 新規。今回の単体テスト |
| `tests/sheet-placement.test.js` | `saveSheetMark` のテストの依存名に `normalizeMark` を足す（1か所） |

新しい関数は `files/index.html` の中で次の位置に置く。

- 純粋関数（`markFlags` / `markFromFlags` / `markText` / `normalizeMark` / `toggleBold` / `markHtml` / `barEditValue`）: `normalizeMarkValue`（`:3790`）の直後
- DOM を扱う関数（`editorRaw` / `editorModel` / `editorPoint` / `editorSelection` / `setEditorSelection` / `insertEditorNewline` / `applySheetBold` / `placeSheetBoldBtn` / `removeSheetBoldBtn`）: `openInlineEditor`（`:6095`）の直前

---

### Task 1: 太字の値を扱う純粋関数

**Files:**
- Modify: `files/index.html`（`normalizeMarkValue` の直後、`:3794` 付近）
- Create: `tests/sheet-bold.test.js`

**Interfaces:**
- Consumes: `esc(s)`（`files/index.html:6932`、関数宣言なので巻き上げで使える）
- Produces:
  - `markFlags(v)` → `{text: string, flags: boolean[]}`。`v` は文字列か `{text, bold}`。壊れた範囲は無視する
  - `markFromFlags(text, flags)` → 太字が無ければ `text`（文字列）、あれば `{text, bold}`（範囲は昇順・まとめ済み）
  - `markText(v)` → 値の文字（文字列）
  - `normalizeMark(raw)` → 行ごとに前後の空白と空行を落とし、太字の位置を合わせた値（文字列か `{text, bold}`）
  - `toggleBold(v, start, end)` → 範囲がすべて太字なら外し、そうでなければ全部太字にした値。`start === end` なら変えない
  - `markHtml(v)` → `<b>` 付きの HTML（`esc` 済み、改行はそのまま `\n`）

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-bold.test.js` を新規作成する。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: FAIL（`markFlags must exist` など）

- [ ] **Step 3: 関数を実装する**

`files/index.html` の `normalizeMarkValue` の直後（`function inputFingerprint()` の前）に追加する。

```js
/* ---------- 書き足しの太字 ----------
   書き足しの値は、太字が無ければ文字列、あれば {text, bold:[[開始,終了),...]}。
   位置は文字列の添字で数え、改行も1文字に数える */
// 値を1文字ずつの太字の配列にする。壊れた範囲は無視する
function markFlags(v){
  const text = typeof v==="string" ? v
    : (v && typeof v==="object" ? (typeof v.text==="string" ? v.text : "") : "");
  const flags = new Array(text.length).fill(false);
  const bold = v && typeof v==="object" && Array.isArray(v.bold) ? v.bold : [];
  bold.forEach(r=>{
    if(!Array.isArray(r)) return;
    const s=r[0], e=r[1];
    if(!Number.isInteger(s) || !Number.isInteger(e) || s<0 || e>text.length || s>=e) return;
    for(let k=s;k<e;k++) flags[k]=true;
  });
  return {text, flags};
}
// 太字の配列から値に戻す。範囲は昇順で、隣り合うものは1つにまとめる
function markFromFlags(text,flags){
  const bold=[];
  for(let i=0;i<text.length;i++){
    if(!flags[i]) continue;
    const last=bold[bold.length-1];
    if(last && last[1]===i) last[1]=i+1;
    else bold.push([i,i+1]);
  }
  return bold.length ? {text, bold} : text;
}
function markText(v){
  return typeof v==="string" ? v : (v && typeof v.text==="string" ? v.text : "");
}
// normalizeMarkValue と同じ規則（行ごとに前後の空白を落とし、空行を捨てる）で
// 文字をならし、落とした文字のぶん太字の位置を詰める
function normalizeMark(raw){
  if(raw==null) return "";
  const src=markFlags(typeof raw==="object" ? raw : String(raw));
  let text="", pos=0;
  const flags=[];
  src.text.split("\n").forEach(line=>{
    const body=line.trim();
    const lead=line.length-line.replace(/^\s+/,"").length;
    if(body){
      if(text){ text+="\n"; flags.push(false); }
      text+=body;
      for(let k=0;k<body.length;k++) flags.push(src.flags[pos+lead+k]);
    }
    pos+=line.length+1;
  });
  return markFromFlags(text, flags);
}
// 選んだ範囲がすべて太字なら外し、1文字でも普通の文字があれば全部を太字にする
function toggleBold(v,start,end){
  const m=markFlags(v);
  const s=Math.max(0,Math.min(start,end)), e=Math.min(m.text.length,Math.max(start,end));
  if(s<e){
    let all=true;
    for(let k=s;k<e;k++) if(!m.flags[k]){ all=false; break; }
    for(let k=s;k<e;k++) m.flags[k]=!all;
  }
  return markFromFlags(m.text, m.flags);
}
// 太字の区間だけを <b> で包む。各区間は esc を通す。改行はそのまま残す
function markHtml(v){
  const m=markFlags(v);
  let h="", i=0;
  while(i<m.text.length){
    const b=m.flags[i];
    let j=i+1;
    while(j<m.text.length && m.flags[j]===b) j++;
    const t=esc(m.text.slice(i,j));
    h+= b ? "<b>"+t+"</b>" : t;
    i=j;
  }
  return h;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: PASS（5件）

Run: `node --test tests/*.test.js`
Expected: 既存の 463 件を含めてすべて PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-bold.test.js
git commit -m "feat: 書き足しの太字を扱う関数を追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 太字付きの書き足しの保存と読み込み

**Files:**
- Modify: `files/index.html` の `normalizeSheetEdits`（`:1456-1464`）、`saveSheetMark`（`:6080-6090`）、Task 1 の関数群の末尾（`barEditValue` を追加）
- Modify: `tests/sheet-placement.test.js:3020-3045`（`saveSheetMark` のテストの依存名）
- Test: `tests/sheet-bold.test.js`

**Interfaces:**
- Consumes: Task 1 の `markFlags` / `markFromFlags` / `markText` / `normalizeMark`
- Produces:
  - `normalizeSheetEdits(raw)`: `marks` の値として、空でない文字列と、`{text: 空でない文字列, bold}` を受け付ける。後者は `normalizeMark` を通し、文字が空になれば捨てる
  - `saveSheetMark(key, raw, autoText)`: `raw` は文字列か `{text, bold}`。文字が空、または「太字が無く文字が自動計算の値と同じ」ときだけキーを消す
  - `barEditValue(typed, orig)` → `orig` が `{text, bold}` で、`normalizeMarkValue(typed)` がその文字と同じなら `orig`、それ以外は `typed`

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-bold.test.js` の末尾に追加する。

```js
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
```

`tests/sheet-placement.test.js` の「書き足しは空文字か自動計算値と同じならキーを消す」（`:3020` 付近）を次のように直す。`normalizeMark` を依存名に足し、実物を渡す。

```js
test("書き足しは空文字か自動計算値と同じならキーを消す", () => {
  const norm = new Function(
    functionSource("normalizeMarkValue") + "; return normalizeMarkValue;"
  )();
  const normalizeMark = new Function(
    ["markFlags", "markFromFlags", "markText", "normalizeMark"].map(functionSource).join("\n")
      + "; return normalizeMark;"
  )();
  // ensureSheetEditSig は渡さない。saveSheetMark が呼び始めたら
  // ReferenceError で落ちてほしい（確定の経路に confirm を混ぜないための守り）
  const save = new Function(
    "activeShift", "saveSchedule", "normalizeMarkValue", "normalizeMark",
    functionSource("saveSheetMark") + "; return saveSheetMark;"
  );
  const shift = { sheetEdits: { sig: "s1", marks: { "top|0|name": "既存" } } };
  const run = save(() => shift, () => {}, norm, normalizeMark);
```

（以降の `run(...)` と `assert` の行は変えない。）

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: FAIL（`normalizeSheetEdits` が `{text,bold}` を捨てる、`barEditValue must exist` など）

- [ ] **Step 3: 実装する**

`normalizeSheetEdits`（`:1462`）の1行を次に置き換える。文字列の扱いは今までと同じ（ならさない）。

```js
  Object.keys(m).forEach(k=>{
    const v=m[k];
    if(typeof v==="string"){ if(v!=="") marks[k]=v; return; }
    // 太字付きの書き足し。文字が文字列でないもの、配列は捨てる。
    // 太字の範囲だけ壊れているものは、太字を捨てて文字だけ残す
    if(!v || typeof v!=="object" || Array.isArray(v) || typeof v.text!=="string") return;
    const n=normalizeMark({text:v.text, bold:Array.isArray(v.bold)?v.bold:[]});
    if(markText(n)!=="") marks[k]=n;
  });
```

`normalizeSheetEdits` から `markText` と `normalizeMark` を呼ぶので、Step 1 のテストは `MARK_CORE`（`markText` を含む）を先に読み込んでいる。

`saveSheetMark`（`:6080`）を次に置き換える。

```js
function saveSheetMark(key,raw,autoText){
  const ed=activeShift().sheetEdits;
  const value=normalizeMark(raw);
  const text=typeof value==="string" ? value : value.text;
  const auto=normalizeMarkValue(autoText);
  // 太字があれば、文字が自動計算の値と同じでも残す
  if(text==="" || (typeof value==="string" && value===auto)){
    if(Object.prototype.hasOwnProperty.call(ed.marks,key)){ delete ed.marks[key]; saveSchedule(); }
    return false;
  }
  ed.marks[key]=value;
  saveSchedule();
  return true;
}
```

関数の上のコメント（`:6077-6079`）の「空文字か自動計算の値と同じならキーを消す」を「空文字か、太字が無く自動計算の値と同じならキーを消す」に直す。

Task 1 の `markHtml` の直後に追加する。

```js
// スマホの編集バーの確定値。バーでは太字を付けられないので、
// 文字が変わらなければ元の太字を残し、変わったら太字を全部外す
function barEditValue(typed,orig){
  if(orig && typeof orig==="object" && normalizeMarkValue(typed)===orig.text) return orig;
  return typed;
}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-bold.test.js tests/sheet-placement.test.js
git commit -m "feat: 太字付きの書き足しを保存・読み込みできるようにする

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 紙と画面に太字を描く

**Files:**
- Modify: `files/index.html` の `slotCells` の `markSpan`（`:6371-6375`）、`overflowTable` の `markSpan`（`:6437-6441`）、`renderSheet` の見出し欄（`:6258`、`:6261`）、CSS（`.sheet td.slot.c-pal` の行 `:591` 付近の後ろ）
- Test: `tests/sheet-bold.test.js`

**Interfaces:**
- Consumes: Task 1 の `markHtml`（見出し欄だけ。`slotCells` と `overflowTable` からは呼ばない）
- Produces: 描画3か所が `{text, bold}` を `<b>` 付きで出す。文字列の値の出力は今までと同じ

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-bold.test.js` の末尾に追加する。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: FAIL（`[object Object]` が出る、`markHtml(mv)` が無い、など）

- [ ] **Step 3: 実装する**

`slotCells` の `markSpan`（`:6371-6375`）と、`overflowTable` の `markSpan`（`:6437-6441`）を、どちらも次に置き換える。上にある「ここで別の関数を呼ばないこと」のコメントは残す。`span` は自動計算の値で使うので残す。

```js
  const markSpan = v => {
    const text = typeof v==="string" ? v : String(v.text);
    const on = new Array(text.length).fill(false);
    (typeof v==="string" ? [] : (v.bold || [])).forEach(r => {
      for(let k=r[0]; k<r[1] && k<text.length; k++) on[k]=true;
    });
    let pos=0;
    const line = s => {
      let h="", i=0;
      while(i<s.length){
        const b=on[pos+i];
        let j=i+1;
        while(j<s.length && on[pos+j]===b) j++;
        const t=esc(s.slice(i,j));
        h += b ? "<b>"+t+"</b>" : t;
        i=j;
      }
      pos += s.length+1;
      return h;
    };
    const lines=text.split("\n").map(line);
    const wrap = h => h ? `<span class="fit">${h}</span>` : "";
    return lines.length<=1 ? wrap(lines[0])
      : `<span class="fitcol">${lines.map(wrap).join("")}</span>`;
  };
```

`renderSheet` の見出し欄（`:6258`、`:6261`）を直す。

```js
          const label=edited?markHtml(mv):esc(g.label);
```

```js
               + `<span class="fit">${label}</span></td>`;
```

CSS の `.sheet td.slot.c-pal{...}`（`:591`）の次の行に追加する。

```css
  /* 書き足しの一部の太字。欄の太字設定が ON の欄では見た目が変わらない（仕様） */
  .sheet .fit b{font-weight:700}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-bold.test.js
git commit -m "feat: 書き足しの太字を配置図に描く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: PC の編集欄を contenteditable にし、スマホの確定で太字を保つ

**Files:**
- Modify: `files/index.html` の `openInlineEditor`（`:6095-6121`）、`openBarEditor`（`:6126-6155`）、`flushSheetEdit`（`:5950-5957`）、`let sheetEditing` のコメント（`:6005`）、CSS（`:707-713` の編集欄のルール、`:811` の印刷のルール）
- 追加: `openInlineEditor` の直前に `editorRaw` / `editorModel` / `editorPoint` / `editorSelection` / `setEditorSelection` / `insertEditorNewline`
- Test: `tests/sheet-bold.test.js`

**Interfaces:**
- Consumes: Task 1 の `markFromFlags` / `markHtml` / `markText`、Task 2 の `barEditValue`、既存の `activeSheetMarks()`（`:5865`）
- Produces:
  - `editorRaw(root)` → `{text, flags}`。子孫をたどり、テキストは文字として、`<br>` は `\n` として足す。祖先に `<b>` があれば太字
  - `editorModel(root, multi)` → 値（文字列か `{text, bold}`）。`multi` が false なら `\n` を取り除く
  - `editorPoint(root, pos)` → `[node, offset]`
  - `editorSelection(root)` → `[start, end]` か `null`
  - `setEditorSelection(root, start, end)`
  - `insertEditorNewline(root)`
  - `sheetEditing` は `{key, td, el, auto, read}`。`read()` は確定する値を返す

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-bold.test.js` の末尾に追加する。DOM は使わず、最小限の偽のノードで確かめる。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: FAIL（`editorRaw must exist` など）

- [ ] **Step 3: DOM を扱う関数を実装する**

`openInlineEditor` の直前（`// PC（601px 以上）。欄の中身を入力欄に差し替える。` のコメントの前）に追加する。

```js
/* ---------- PC の編集欄（contenteditable）----------
   編集中は画面を正にする。太字の付け外しや改行は、画面を値に読み取り、
   値を変えて、中身を組み直し、選択を文字位置で戻す */
// 子孫を先頭からたどる。テキストは文字、BR は改行。祖先に B があれば太字
function editorRaw(root){
  let text="";
  const flags=[];
  const walk=(node,b)=>{
    for(const c of node.childNodes){
      if(c.nodeType===3){
        text+=c.nodeValue;
        for(let k=0;k<c.nodeValue.length;k++) flags.push(b);
      }else if(c.nodeName==="BR"){
        text+="\n"; flags.push(b);
      }else if(c.nodeType===1){
        walk(c, b || c.nodeName==="B");
      }
    }
  };
  walk(root,false);
  return {text, flags};
}
// 確定する値。1行の欄では改行を取り除く（貼り付けで紛れ込んでも1行に収まる）
function editorModel(root,multi){
  const m=editorRaw(root);
  if(multi) return markFromFlags(m.text, m.flags);
  let text="";
  const flags=[];
  for(let i=0;i<m.text.length;i++){
    if(m.text[i]==="\n") continue;
    text+=m.text[i]; flags.push(m.flags[i]);
  }
  return markFromFlags(text, flags);
}
// 文字位置を [ノード, 位置] に変える。区間の境目は前の区間の末尾に置く
function editorPoint(root,pos){
  let count=0, found=null;
  const walk=node=>{
    const kids=Array.from(node.childNodes);
    for(let i=0;i<kids.length && !found;i++){
      const c=kids[i];
      if(c.nodeType===3){
        const n=c.nodeValue.length;
        if(pos<=count+n){ found=[c,pos-count]; return; }
        count+=n;
      }else if(c.nodeName==="BR"){
        if(pos===count){ found=[node,i]; return; }
        count++;
      }else if(c.nodeType===1){
        walk(c);
      }
    }
  };
  walk(root);
  return found || [root, root.childNodes.length];
}
// いまの選択を文字位置 [開始, 終了] で返す。欄の外なら null
function editorSelection(root){
  const sel=document.getSelection();
  if(!sel || !sel.rangeCount) return null;
  const r=sel.getRangeAt(0);
  if(!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const off=(node,o)=>{
    const x=document.createRange();
    x.setStart(root,0); x.setEnd(node,o);
    const d=document.createElement("div");
    d.appendChild(x.cloneContents());
    return editorRaw(d).text.length;
  };
  return [off(r.startContainer,r.startOffset), off(r.endContainer,r.endOffset)];
}
function setEditorSelection(root,start,end){
  const a=editorPoint(root,start), b=editorPoint(root,end);
  const r=document.createRange();
  r.setStart(a[0],a[1]); r.setEnd(b[0],b[1]);
  const sel=document.getSelection();
  sel.removeAllRanges(); sel.addRange(r);
}
// 縦積みの欄の Enter。Chrome の既定の改行（div や br の挿入）は使わず、
// 値に改行を1文字入れて組み直す
function insertEditorNewline(root){
  const sel=editorSelection(root);
  if(!sel) return;
  const m=editorRaw(root);
  const s=Math.min(sel[0],sel[1]), e=Math.max(sel[0],sel[1]);
  const text=m.text.slice(0,s)+"\n"+m.text.slice(e);
  const flags=m.flags.slice(0,s).concat([false], m.flags.slice(e));
  root.innerHTML=markHtml(markFromFlags(text, flags));
  setEditorSelection(root, s+1, s+1);
}
```

- [ ] **Step 4: `openInlineEditor` を置き換える**

`openInlineEditor`（`:6095-6121`）を次に置き換える。上のコメント（`:6092-6094`）は残す。Task 5 で「B」ボタンと Ctrl+B を足すので、ここではまだ入れない。

```js
function openInlineEditor(td){
  const key=td.dataset.ek;
  // 自動計算の値は描画時に data-auto へ入れてある。
  // ここで表を描き直して読もうとすると、この td が DOM から切り離されて
  // 入力欄が出ず focus() も効かない（書き足し済みの欄を直すとき必ず起きる）
  const auto=td.dataset.auto||"";
  const cur=sheetCellText(td);
  const multi=cur.indexOf("\n")>=0 || !!td.querySelector(".fitcol");
  // 画面の文字からは太字が取れないので、保存済みの書き足しから組み立てる
  const saved=activeSheetMarks()[key];
  const el=document.createElement("div");
  el.className="cell-editor";
  // plaintext-only は Chrome の書式コマンドと、貼り付けの HTML を効かなくする
  el.setAttribute("contenteditable","plaintext-only");
  el.innerHTML=markHtml(saved!=null ? saved : cur);
  td.classList.add("editing-cell");
  td.innerHTML="";
  td.appendChild(el);
  sheetEditing={key, td, el, auto, read:()=>editorModel(el, multi)};
  el.focus();
  document.getSelection().selectAllChildren(el);

  el.addEventListener("keydown", ev=>{
    if(ev.key==="Escape"){ ev.preventDefault(); cancelSheetEdit(); return; }
    // Android Chrome は IME の変換確定の Enter も keydown に届ける。
    // isComposing を見ないと、変換しただけで欄が閉じる
    if(ev.key==="Enter" && ev.isComposing===false){
      ev.preventDefault();
      if(multi) insertEditorNewline(el);
      else      el.blur();
    }
  });
  el.addEventListener("blur", ()=>{ commitSheetEdit(); });
}
```

- [ ] **Step 5: `openBarEditor` と `flushSheetEdit` を直す**

`openBarEditor` の `sheetEditing={key, td, el, auto};`（`:6145`）を次に置き換える。

```js
  // バーでは太字を付けられない。文字が変わらなければ元の太字を残す
  const orig=activeSheetMarks()[key];
  sheetEditing={key, td, el, auto, read:()=>barEditValue(el.value, orig)};
```

`flushSheetEdit`（`:5950-5957`）を次に置き換える。

```js
function flushSheetEdit(){
  if(!sheetEditing) return false;
  const {key, read, auto}=sheetEditing;
  sheetEditing=null;                 // 再入を止める
  closeSheetEditBar();
  saveSheetMark(key, read(), auto);
  return true;
}
```

`let sheetEditing=null;` のコメント（`:6005`）を `// {key, td, el, auto, read}` に直す。

- [ ] **Step 6: CSS を直す**

編集欄のルール（`:707`）のセレクタに `.cell-editor` を足す。

```css
  .sheet td.editing-cell input,.sheet td.editing-cell textarea,.sheet td.editing-cell .cell-editor{
```

そのルールの閉じ括弧の直後に追加する。

```css
  /* PC の編集欄。pre は折り返さず、空白も潰さない。縦積みの欄の改行もそのまま出る */
  .sheet td.editing-cell .cell-editor{white-space:pre;cursor:text}
```

印刷のルール（`:811`）のセレクタにも足す。

```css
    .sheet td.editing-cell input,.sheet td.editing-cell textarea,.sheet td.editing-cell .cell-editor{border:0 !important;font-size:inherit !important}
```

- [ ] **Step 7: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS。既存の「セル内編集で行の高さを変えない」「セル内編集の印も画面だけに出し、紙には出さない」も PASS のままであること（セレクタの先頭は変えていない）。

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-bold.test.js
git commit -m "feat: PCの書き足しの編集欄をcontenteditableにし、スマホの確定で太字を保つ

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 「B」ボタンと Ctrl+B

**Files:**
- Modify: `files/index.html` の `openInlineEditor`（Task 4 で置き換えたもの）、`flushSheetEdit`、`cancelSheetEdit`（`:6195`）、CSS（Task 3 で足した `.sheet .fit b` の後ろ、印刷の `@media print` の中）
- 追加: Task 4 の `insertEditorNewline` の直後に `applySheetBold` / `placeSheetBoldBtn` / `removeSheetBoldBtn`
- Test: `tests/sheet-bold.test.js`

**Interfaces:**
- Consumes: Task 1 の `toggleBold` / `markFromFlags` / `markHtml`、Task 4 の `editorRaw` / `editorSelection` / `setEditorSelection`
- Produces:
  - `applySheetBold()`: 開いている PC の編集欄の選択範囲の太字を切り替える
  - `placeSheetBoldBtn(td)`: `.sheetbox` の中に `#sheetBoldBtn` を置く
  - `removeSheetBoldBtn()`

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-bold.test.js` の末尾に追加する。

```js
test("B ボタンは mousedown で既定動作を止め、確定を走らせない", () => {
  const fn = functionSource("placeSheetBoldBtn");
  assert.match(fn, /addEventListener\("mousedown",\s*ev\s*=>\s*ev\.preventDefault\(\)\)/);
  assert.match(fn, /addEventListener\("click",\s*applySheetBold\)/);
  assert.match(fn, /\.sheetbox/);
  // 表示倍率で割る（drawLeaders と同じ考え方）
  assert.match(fn, /zoom/);
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/sheet-bold.test.js`
Expected: FAIL（`placeSheetBoldBtn must exist` など）

- [ ] **Step 3: 実装する**

`insertEditorNewline` の直後に追加する。

```js
// 開いている PC の編集欄で、選んだ範囲の太字を切り替える。
// スマホの編集バー（input）では何もしない
function applySheetBold(){
  if(!sheetEditing || !sheetEditing.el || !sheetEditing.el.classList.contains("cell-editor")) return;
  const el=sheetEditing.el;
  const sel=editorSelection(el);
  if(!sel) return;
  const m=editorRaw(el);
  const next=toggleBold(markFromFlags(m.text, m.flags), sel[0], sel[1]);
  el.innerHTML=markHtml(next);
  setEditorSelection(el, sel[0], sel[1]);
}
// 編集中の欄のすぐ上に B を浮かべる。.sheetbox の中に置くので、
// 横スクロールや表示倍率が変わっても欄と一緒に動く。
// 上に場所が無い（先頭の行）ときは欄の下に置く。
// 配置図タブが表示されているとき（欄を開いた時点）にだけ測る
function placeSheetBoldBtn(td){
  removeSheetBoldBtn();
  const box=td.closest(".sheetbox");
  const sheet=box && box.closest(".sheet");
  if(!box || !sheet) return;
  const btn=document.createElement("button");
  btn.type="button";
  btn.id="sheetBoldBtn";
  btn.className="sheet-bold-btn";
  btn.textContent="B";
  btn.title="選んだ文字を太字にする（Ctrl+B）";
  btn.setAttribute("aria-label","太字");
  // mousedown の既定動作を止めて、フォーカスと選択を編集欄に残す。
  // 止めないと blur で確定が走る
  btn.addEventListener("mousedown", ev=>ev.preventDefault());
  btn.addEventListener("click", applySheetBold);
  box.appendChild(btn);
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const b=box.getBoundingClientRect(), r=td.getBoundingClientRect();
  const h=btn.getBoundingClientRect().height/z;
  let top=(r.top-b.top)/z-h-2;
  if(top<0) top=(r.bottom-b.top)/z+2;
  btn.style.left=((r.left-b.left)/z)+"px";
  btn.style.top=top+"px";
}
function removeSheetBoldBtn(){
  const btn=document.getElementById("sheetBoldBtn");
  if(btn) btn.remove();
}
```

`openInlineEditor`（Task 4 で置き換えたもの）を2か所直す。

`document.getSelection().selectAllChildren(el);` の直後に1行足す。

```js
  placeSheetBoldBtn(td);
```

`keydown` の処理の、Enter の `if` の後ろに足す。

```js
    if((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase()==="b" && !ev.isComposing){
      ev.preventDefault();
      applySheetBold();
    }
```

`flushSheetEdit` の `closeSheetEditBar();` の直後と、`cancelSheetEdit`（`:6195`）の `closeSheetEditBar();` の直後に、それぞれ1行足す。

```js
  removeSheetBoldBtn();
```

CSS: Task 3 で足した `.sheet .fit b{font-weight:700}` の次に追加する。

```css
  /* 書き足しの編集中だけ出す太字ボタン。位置は placeSheetBoldBtn() が決める */
  .sheet .sheet-bold-btn{position:absolute;z-index:3;min-width:28px;height:24px;padding:0 6px;
                         border:1px solid #374151;border-radius:4px;background:#fff;color:#111;
                         font-family:inherit;font-size:14px;font-weight:700;line-height:22px;cursor:pointer}
  .sheet td.editing-cell .cell-editor b{font-weight:700}
```

`@media print{` のブロックの中（`.sheet td.editing-cell input,...{border:0 !important;...}` の行の次）に追加する。

```css
    .sheet-bold-btn{display:none !important}
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-bold.test.js
git commit -m "feat: 配置図の書き足しに太字ボタンとCtrl+Bを付ける

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: キャッシュ版の更新とブラウザでの確認

**Files:**
- Modify: `files/sw.js:6`

- [ ] **Step 1: `CACHE_VERSION` を上げる**

`files/sw.js` の `const CACHE_VERSION = "v77";` を、着手時の値から1つ上げる（`v77` なら `"v78"`）。

- [ ] **Step 2: テストを通す**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "chore: 書き足しの太字に合わせてキャッシュ版を上げる

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: ブラウザで確認する**

`preview_start` に `{name: "pallet-layout"}` を渡して起動する（`.claude/launch.json` にある。`http://localhost:8765`）。

守ること（このプロジェクトで過去に踏んだ罠）:
- px を測る呼び出しは `resize_window`（`width:1280, height:900`）と同じ `browser_batch` にまとめる。`innerWidth` を必ず結果に含める。
- `computer` の `key` は keydown をページに届けない。Enter / Esc / Ctrl+B は `new KeyboardEvent("keydown", {key:"b", ctrlKey:true, bubbles:true, cancelable:true})` を編集欄に `dispatchEvent` して、ハンドラの処理を確かめる（既定動作は起きないので、文字の入力は `computer` の `type` で行う）。
- Browser pane が閉じていると `computer` の入力が全部タイムアウトする。そのときはユーザーに pane を開いてもらう。
- 機能は本物の入口（欄のクリック、ボタンのクリック）から通す。状態をスクリプトで直接作らない。

手順:
1. 入力タブでサンプルを入れ、「自動配置を作成」を押す。配置図タブを開き、「✏ テキスト編集」を押す。
2. **最初の1回**: まだ書き足していないロットの欄をクリック → 全文が選択された状態で `setEditorSelection` を使わずに、`computer` のドラッグで末尾の3文字を選ぶ（難しければ `javascript_tool` で `setEditorSelection(document.querySelector(".cell-editor"), 3, 6)` を呼び、そのことを報告に書く）→ 「B」ボタンをクリック → 欄の外をクリック。
   - 確認: 欄の中身が `<span class="fit">ABC<b>123</b></span>` の形になっている（`read_page` か `javascript_tool` で `innerHTML` を読む）。`localStorage` の `palletApp.schedule` に `{text, bold}` が入っている。
   - リロードしても太字が残る。
3. 同じ欄をもう一度開き、同じ範囲で「B」を押して太字を外し、確定する。文字が自動計算の値と同じなら、黄色い背景（`edited`）が消える。
4. 縦積みの欄（1欄に複数ロットがある日。サンプルで出なければ、欄に Enter で改行を入れて作る）、上段の見出し、追記欄で、2 と同じ操作をする。縦積みの欄では2行目の文字を太字にし、位置がずれないこと。
5. Ctrl+B（合成の keydown）で太字が切り替わる。Esc で取り消せる。別の欄をクリックすると、前の欄が確定して「B」ボタンが新しい欄の上へ移る。
6. 表示倍率 150% と横スクロールの状態で欄を開き、「B」ボタンが欄のすぐ上（先頭の行なら下）にある（スクリーンショット）。
7. 太字にした欄で、確定後に横縮み（`transform:scaleX`）が掛かり直している。
8. 「🖨 印刷」を押して印刷プレビューを出す直前の状態で、`#sheetBoldBtn` が無いこと、紙に太字が出ること（`beforeprint` の経路で編集が確定されるため）。
9. Ctrl+Z（実キー。pane で操作できなければユーザーに頼む）の挙動を記録する。直さない。
10. 幅 412px（`resize_window` で `width:412, height:915`）に切り替え、太字の欄が太字で表示されること。編集バーで文字を変えずに確定すると太字が残り、1文字変えて確定すると太字が外れること。
11. 最後に `resize_window` で `preset:"desktop"` に戻す。

うまくいかない点があれば、直さずに止めて報告する（計画外の変更になるため）。

---

## 完了後にユーザーへ渡すもの

- E2E に相当するテストの実行コマンド（本プロジェクトは `node --test` のみ）

```bash
node --test tests/*.test.js
```

- 実機での確認手順は設計書 §6（Windows ＋ Chrome の MS-IME、Ctrl+Z、Pixel 9a）をそのまま渡す。起動は次のコマンド。

```bash
python3 -m http.server 8765 --directory files
```
