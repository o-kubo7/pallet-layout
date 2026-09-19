# 配置図のテキスト編集 実行計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図（紙）の欄の文字を、印刷前にその場で書き換えられるようにする。書き換えた内容は端末に保存し、配置が変わったら紙に出さない。

**Architecture:** 書き足しを `shift.sheetEdits = {sig, marks}` に持つ。`sig` は「どの配置に対する書き足しか」を表す署名で、伝票指紋・配置・掲載先・まとめ設定・端数表示・様式から作る。`marks` のキーは欄の位置（`top|2|name`）。署名が一致するときだけ紙に出す。入力欄は画面幅で2通り出し分け、600px 以下は表の外の編集バー、601px 以上はセル内で直接編集する。

**Tech Stack:** 素の HTML/CSS/JavaScript（`files/index.html` 単一ファイルに埋め込み）、`node:test`、Service Worker（`files/sw.js`）

**Spec:** `docs/superpowers/specs/2026-09-19-sheet-text-edit-design.md`

## Global Constraints

- アプリ本体は `files/index.html` 1ファイル。JavaScript は埋め込み `<script>` の中。外部 `.js` へ切り出さない
- テストの実行コマンドは `node --test tests/*.test.js`。着手時点で **172件すべて緑**
- コミットは1タスク1コミット。メッセージ末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- `files/sw.js` の `CACHE_VERSION`（現在 `"v55"`）は Task 10 でだけ上げる
- 印刷の紙に新しいものを出さない。画面だけの印は `print-color-adjust` を付けず、`@media print` でも消す
- 行番号は着手時に `grep -n` で取り直すこと（この計画の値は 2026-09-19 時点）

### テストの2つの流儀を取り違えない

既存テストは `functionSource(name)` で関数本体を切り出したあと、**2通りの使い方**をする。
制約が正反対なので混同しないこと。

**（A）`new Function` で実行される関数** — `slotCells` / `overflowTable` /
`topHeadGroups` / `gridRows` / `normalizeShift` / `emptyShift`。

- **これらの中からモジュールスコープの関数や変数を新しく呼んではならない。**
  依存名リストに無いため ReferenceError で落ちる
- `normalizeShift` も対象。既存テスト
  （`tests/sheet-placement.test.js:350`「旧形式の時間帯データは配置不可セルなしとして読み込む」）は
  依存名を `"normalizeSlip", "normalizeSnapshot", "normalizeBlocked"` の3つしか渡していない。
  Task 2 で `normalizeSheetEdits()` を呼ぶ形に変えるので、
  **この既存テストの依存名にも足す**（足さないと ReferenceError で落ちる）
- キーの組み立ては `[tier, i, kind].join("|")` を**その場に書く**。
  `sheetEditKey()` を呼んではいけない
- `gridRows` を忘れやすい。`overflowTable` を呼ぶのは `renderSheet` ではなく
  `gridRows` の中（`files/index.html:5143`）で、`gridRows` 自身も
  `new Function("lastSp","sheetAreas","gridWarn","SHEET_GRID_ORDER","overflowTable","lastLots","tailAreaOf", …)`
  で実行される（`tests/sheet-placement.test.js:331`、`:391`）

**（B）文字列として照合されるだけの関数** — `renderSheet` / `fitSheetText` /
`printSheet` / `switchTab`。

- 実行されないのでモジュールスコープを参照してよい
- 代わりに**呼び出しの書き方そのものが正規表現で固定されている**。
  引数を足すと落ちる。Task 3 で7つの assert を直す

### `@media print` を見るテストの書き方

このブロックは `files/index.html:563-582` の **866文字**しかない。
`source.slice(printStart, printStart + 4000)` のような固定長で切ると
ブロックの外（`#updateBar` など）まで含み、印刷CSSの外に書いた指定でも緑になる。

Task 4 で次のヘルパーを `tests/sheet-placement.test.js` に足し、以後これを使う。

```js
// @media print ブロックだけを切り出す。固定長で切るとブロックの外まで
// 含んでしまい、印刷CSSの外に書いた指定でもテストが通る
function printBlock() {
  const start = source.indexOf("@media print{");
  assert.notEqual(start, -1);
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("@media print block not closed");
}
```

---

## ファイル構成

| ファイル | 役割 | 触るタスク |
|---|---|---|
| `files/index.html` | アプリ本体。純粋関数・描画・UI・CSS すべて | 1〜9 |
| `files/sw.js` | PWA キャッシュ。`CACHE_VERSION` のみ | 10 |
| `tests/sheet-placement.test.js` | 配置図まわりのテスト | 1〜9 |

`files/index.html` の中での置き場所:

- 純粋関数（署名・キー・正規化）→ `fingerprintFor()`（`3042`）の直後
- 保存形式 → `emptyShift()`（`1073`）と `normalizeShift()`（`1146`）
- 描画 → `slotCells()`（`4915`）、`overflowTable()`（`4955`）、`gridRows()`、`renderSheet()`（`4801`）
- 編集モードの状態と UI → `renderSheet()` の直前にまとめて置く
- CSS → `.sheet` の既存ブロック（`418`〜`562`）の末尾
- 設定のチェックボックス → `#cfgpane-display` の「そのほかの表示」（`798`〜`831`）

---

### Task 1: 署名・キー・値の正規化（純粋関数）

**Files:**
- Modify: `files/index.html`（`fingerprintFor()` = `3042` の直後に追加）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: なし
- Produces:
  - `sheetEditHash(text)` → `string`
  - `sheetEditSigFrom(parts)` → `string`。`parts` は `{fp, lots, sp, spacesText, mergeLots, fracMode, layName}`
  - `sheetEditKey(tier, index, kind)` → `string`
  - `sheetHeadKey(groupIndex)` → `string`
  - `normalizeMarkValue(raw)` → `string`

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-placement.test.js` の末尾に足す。

```js
test("書き足しの署名は材料が1つ変われば変わる", () => {
  const hash = new Function(functionSource("sheetEditHash") + "; return sheetEditHash;")();
  const sigFrom = new Function(
    "sheetEditHash",
    functionSource("sheetEditSigFrom") + "; return sheetEditSigFrom;"
  )(hash);

  const base = {
    fp: '{"items":[{"itemId":"i1"}]}',
    lots: [{ id: "l1", pallets: 3 }],
    sp: [{ name: "軒下①", cells: ["l1"] }],
    spacesText: "軒下① | far | v | 1 | 3,3 | top",
    mergeLots: true,
    fracMode: false,
    layName: "normal",
  };
  const sig = sigFrom(base);

  assert.equal(sigFrom({ ...base }), sig);
  assert.notEqual(sigFrom({ ...base, fp: '{"items":[{"itemId":"i2"}]}' }), sig);
  assert.notEqual(sigFrom({ ...base, lots: [{ id: "l1", pallets: 4 }] }), sig);
  assert.notEqual(sigFrom({ ...base, sp: [{ name: "軒下①", cells: ["l2"] }] }), sig);
  assert.notEqual(sigFrom({ ...base, mergeLots: false }), sig);
  assert.notEqual(sigFrom({ ...base, fracMode: true }), sig);
  assert.notEqual(sigFrom({ ...base, layName: "wide" }), sig);
});

test("書き足しの署名は掲載先が変われば変わる", () => {
  // fingerprintFor() が使う spacesToText(false) は掲載先を含まないので、
  // 掲載先を署名の材料に入れておかないと、上段・下段の欄が総入れ替えに
  // なっても署名が一致したまま書き足しが別の荷物の欄に貼りつく
  const hash = new Function(functionSource("sheetEditHash") + "; return sheetEditHash;")();
  const sigFrom = new Function(
    "sheetEditHash",
    functionSource("sheetEditSigFrom") + "; return sheetEditSigFrom;"
  )(hash);

  const base = {
    fp: "fp", lots: [], sp: [],
    spacesText: "軒下① | far | v | 1 | 3,3 | bottom",
    mergeLots: true, fracMode: false, layName: "normal",
  };
  const moved = { ...base, spacesText: "軒下① | far | v | 1 | 3,3 | top" };
  assert.notEqual(sigFrom(moved), sigFrom(base));
});

test("書き足しのキーは段・位置・種別で引く", () => {
  const key = new Function(functionSource("sheetEditKey") + "; return sheetEditKey;")();
  const headKey = new Function(functionSource("sheetHeadKey") + "; return sheetHeadKey;")();

  assert.equal(key("top", 2, "name"), "top|2|name");
  assert.equal(key("bottom", 5, "note"), "bottom|5|note");
  assert.equal(key("over", 0, "pallet"), "over|0|pallet");
  assert.equal(headKey(0), "top|g0|head");
  assert.equal(headKey(1), "top|g1|head");
});

test("書き足しの値は前後の空白を落とし、空白だけなら捨てる", () => {
  const norm = new Function(
    functionSource("normalizeMarkValue") + "; return normalizeMarkValue;"
  )();

  assert.equal(norm("  部品A  "), "部品A");
  assert.equal(norm(""), "");
  assert.equal(norm("   "), "");
  assert.equal(norm("　　"), "");
  assert.equal(norm("\n\n"), "");
  assert.equal(norm(null), "");
  assert.equal(norm(undefined), "");

  assert.equal(norm(" A \n B "), "A\nB");
  assert.equal(norm("A\n\nB"), "A\nB");
  assert.equal(norm("A\n  \nB"), "A\nB");
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`sheetEditHash must exist`

- [ ] **Step 3: 最小の実装を書く**

`files/index.html` の `fingerprintFor()`（`3042`）の直後に足す。

```js
/* ---------- 配置図のテキスト編集（書き足し） ---------- */
// 署名の材料をそのまま持つと配置スナップショットのぶんだけ長くなり、
// localStorage を無駄に食う。djb2 で短い16進に畳む
function sheetEditHash(text){
  const s=String(text==null?"":text);
  let h=5381;
  for(let i=0;i<s.length;i++) h=(((h<<5)+h)^s.charCodeAt(i))>>>0;
  return h.toString(16);
}
// 書き足しが「どの配置に対して書かれたか」を1本の文字列で表す。
// fp（伝票指紋）だけでは足りない。fingerprintFor() が使う spacesToText(false) は
// 掲載先（top/bottom）を含まないので、掲載先を変えて上段・下段の欄が
// 総入れ替えになっても fp は変わらず、位置キーの書き足しが別の荷物に貼りつく。
// fracMode は P数欄の自動計算値そのものを変える（palletSlotText()）ので、
// 「自動計算の値と同じならキーを削除」の比較基準がずれないよう材料に入れる。
// 文字サイズ・矢印・角の丸みは欄の並びも自動値も変えないので入れない
function sheetEditSigFrom(parts){
  const p=parts||{};
  return sheetEditHash(JSON.stringify([
    p.fp||"", p.lots||null, p.sp||null, p.spacesText||"",
    !!p.mergeLots, !!p.fracMode, p.layName||"",
  ]));
}
// 欄のキー。ロットIDの集合ではなく位置で引く。
// 署名が配置・掲載先・まとめ設定・端数表示・様式を全部含むので、
// 署名が一致する間は欄の並びが変わらない。位置キーなら空欄にも書ける
// （ロットIDキーだと荷物の無い欄が "top||name" に潰れて衝突する）。
// 注意: slotCells / overflowTable / gridRows はテストが new Function で
// 本体だけを評価するので、この関数をそこから呼んではいけない。
// 向こうでは [tier,i,kind].join("|") をその場に書く
function sheetEditKey(tier,index,kind){ return [tier,index,kind].join("|"); }
function sheetHeadKey(groupIndex){ return ["top","g"+groupIndex,"head"].join("|"); }
// 保存する前に値をならす。空白だけの入力は「書き足しなし」と同じに扱う。
// 改行は残す（縦積みの欄を textarea で行ごとに編集するため）が、
// 各行の前後の空白と空行は落とす
function normalizeMarkValue(raw){
  if(raw==null) return "";
  const lines=String(raw).split("\n").map(s=>s.trim()).filter(Boolean);
  return lines.join("\n");
}
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS。172 + 4 = 176件

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: 書き足しの署名・キー・値の正規化を足す

署名の材料に掲載先（spacesToText(true)）を入れる。fingerprintFor() が使う
spacesToText(false) は掲載先を含まないため、掲載先だけを変えると上段・下段の
欄が総入れ替えになっても署名が一致し、位置キーの書き足しが別の荷物の欄に
貼りつく。fracMode も P数欄の自動計算値を変えるので材料に入れる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 保存の形（`shift.sheetEdits`）

**Files:**
- Modify: `files/index.html:1073`（`emptyShift()`）、`files/index.html:1146`（`normalizeShift()`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `emptyShift()` の戻り値に `sheetEdits: {sig:"", marks:{}}`
  - `normalizeSheetEdits(raw)` → `{sig: string, marks: {[key:string]: string}}`

- [ ] **Step 1: 失敗するテストを書く**

```js
test("シフトの初期値は空の書き足しを持つ", () => {
  const emptyShift = new Function(functionSource("emptyShift") + "; return emptyShift;")();
  assert.deepEqual(emptyShift().sheetEdits, { sig: "", marks: {} });
});

test("壊れた書き足しは空に落とす", () => {
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();

  assert.deepEqual(normalizeSheetEdits(null), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits("abc"), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits([]), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({}), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({ sig: 1, marks: {} }), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({ sig: "a", marks: "x" }), { sig: "a", marks: {} });

  // 文字列でない値と空文字の値は落とす
  assert.deepEqual(
    normalizeSheetEdits({ sig: "a", marks: { "top|0|name": "A", "top|1|name": 5, "top|2|name": "" } }),
    { sig: "a", marks: { "top|0|name": "A" } }
  );
});

test("署名が空なら書き足しも空にする", () => {
  // {sig:"", marks:{中身あり}} を通すと、紙にも出ず件数の案内にも出ない
  // 見えない残骸が保存に残る（activeSheetMarks も hiddenMarkCount も
  // sig が空のときは 0 を返すため）
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();
  assert.deepEqual(
    normalizeSheetEdits({ sig: "", marks: { "top|0|name": "孤児" } }),
    { sig: "", marks: {} }
  );
});

test("シフトの正規化は書き足しを通す", () => {
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();
  const normalizeShift = new Function(
    "normalizeSlip", "normalizeSnapshot", "normalizeBlocked", "emptyShift", "normalizeSheetEdits",
    functionSource("normalizeShift") + "; return normalizeShift;"
  )(
    x => x,
    () => null,
    () => [],
    () => ({ slips: [], result: null, manual: null, resultFingerprint: null, blocked: [], sheetEdits: { sig: "", marks: {} } }),
    normalizeSheetEdits
  );

  const out = normalizeShift({ sheetEdits: { sig: "s1", marks: { "top|0|name": "手書き" } } });
  assert.deepEqual(out.sheetEdits, { sig: "s1", marks: { "top|0|name": "手書き" } });
  assert.deepEqual(normalizeShift({}).sheetEdits, { sig: "", marks: {} });
});

test("署名の材料の sp は snapshotSpaces を通した形にする", () => {
  // リロードすると lastSp は clone(snapshot.sp) に hydrateBlockedRows() を
  // 掛けて復元される。hydrateBlockedRows() は全スペースの全列に blockedRows を
  // 入れるが、buildWork() が作った生の lastSp では退避スペースの列だけ
  // blockedRows を持たない。2026-09-19 の実測（サンプル9件・normal）:
  //   JSON.stringify(lastSp)                    3063 バイト
  //   JSON.stringify(復元後の lastSp)            3080 バイト  ← 一致しない
  //   JSON.stringify(snapshotSpaces(どちらも))   2536 バイト  ← 一致する
  // 生の lastSp を材料にすると、リロードした瞬間に全部の書き足しが消える
  const snapshotSpaces = new Function(
    "clone",
    functionSource("snapshotSpaces") + "; return snapshotSpaces;"
  )(v => JSON.parse(JSON.stringify(v)));
  const hydrateBlockedRows = new Function(
    "blockedRowsFor",
    functionSource("hydrateBlockedRows") + "; return hydrateBlockedRows;"
  )(() => new Set());

  // 生の lastSp を模す。退避スペースの列だけ blockedRows を持たない
  const raw = [
    { name: "メイン", cols: [{ h: 3, fills: [], blockedRows: new Set() }] },
    { name: "退避",   cols: [{ h: 4, fills: [] }] },
  ];
  // リロード後を模す。hydrateBlockedRows が全列に入れる
  const restored = JSON.parse(JSON.stringify(snapshotSpaces(raw)));
  hydrateBlockedRows(restored, []);

  // 生のままでは一致しない
  assert.notEqual(JSON.stringify(raw), JSON.stringify(restored));
  // snapshotSpaces を通せば一致する
  assert.equal(JSON.stringify(snapshotSpaces(raw)), JSON.stringify(snapshotSpaces(restored)));

  // currentSheetSig が生の lastSp を渡していないこと
  assert.match(functionSource("currentSheetSig"), /snapshotSpaces\(lastSp\)/);
  assert.doesNotMatch(functionSource("currentSheetSig"), /sp:\s*lastSp\b/);
});
```

**注意:** `currentSheetSig` は Task 3 で足すので、最後の2つの assert は
Task 3 のテストへ移してもよい。その場合もこのテスト名のコメントは残すこと。
`snapshotSpaces` / `hydrateBlockedRows` の実体は
`sed -n '2133,2145p' files/index.html` で読んでから書く。

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`normalizeSheetEdits must exist`

- [ ] **Step 3: 最小の実装を書く**

`files/index.html:1073` の `emptyShift()`:

```js
function emptyShift(){
  return {slips:[],result:null,manual:null,resultFingerprint:null,blocked:[],
          sheetEdits:{sig:"",marks:{}}};
}
```

その直後に足す:

```js
// 書き足しの保存を正規化する。壊れた値・古い版のデータは空に落とす。
// 値が文字列でないもの、空文字のものはキーごと捨てる。
// 署名が空のときは marks も捨てる。残すと紙にも出ず件数の案内にも出ない
// 見えない残骸になる（activeSheetMarks も hiddenMarkCount も
// sig が空のときは 0 を返すため）
function normalizeSheetEdits(raw){
  const src=raw && typeof raw==="object" && !Array.isArray(raw) ? raw : {};
  const sig = typeof src.sig==="string" ? src.sig : "";
  if(!sig) return {sig:"", marks:{}};
  const marks={};
  const m=src.marks && typeof src.marks==="object" && !Array.isArray(src.marks) ? src.marks : {};
  Object.keys(m).forEach(k=>{ if(typeof m[k]==="string" && m[k]!=="") marks[k]=m[k]; });
  return {sig, marks};
}
```

`normalizeShift()` の戻り値に1行:

```js
      blocked:normalizeBlocked(src.blocked),
      sheetEdits:normalizeSheetEdits(src.sheetEdits),
```

**既存テストの依存名を直す。** `normalizeShift` は `new Function` で
**実行される**（`tests/sheet-placement.test.js:350`
「旧形式の時間帯データは配置不可セルなしとして読み込む」）。
依存名リストに `normalizeSheetEdits` が無いと ReferenceError で落ちる。

```js
  const normalizeShift = new Function(
    "normalizeSlip", "normalizeSnapshot", "normalizeBlocked", "normalizeSheetEdits",
    functionSource("normalizeShift") + "; return normalizeShift;"
  )(
    value => value,
    value => value,
    () => [],
    new Function(functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;")()
  );
```

`loadOrMigrateSchedule()` の警告条件（`1274` 付近）には足さない。
`SCHEDULE_VERSION`（`996`）も上げない。

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: シフトに書き足しの保存場所を足す

署名が空なら marks も捨てる。残すと紙にも出ず件数の案内にも出ない
見えない残骸になる。

SCHEDULE_VERSION は上げない。normalizeShift() が既定値に落とすので
古いデータはそのまま読める。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 描画への差し込み

**Files:**
- Modify: `files/index.html:4915`（`slotCells()`）、`:4955`（`overflowTable()`）、`gridRows()`、`:4801`（`renderSheet()`）
- Test: `tests/sheet-placement.test.js`（**既存の7 assert を直す**）

**Interfaces:**
- Consumes: なし（キーはその場で組み立てる）
- Produces:
  - `slotCells(entries, count, kind, extra, sepAt, tier, marks)`
  - `gridRows(pad, overflow, marks)` — `overflowTable` へ通すためだけに受け取る
  - `overflowTable(entries, marks)`
  - `activeSheetMarks(pl)` → `{}` または `marks`
  - `currentSheetSig(pl)` → `string`（`pl` は省略可。省略すると `sheetPlacement()` を呼ぶ）
  - `hiddenMarkCount(pl)` → `number`（Task 5 の `openSheetEditor` と Task 8 の案内が使う）
  - 各 `<td>` に `data-ek` と `data-auto`

**このタスクの肝が3つある。**

1. `slotCells` / `overflowTable` / `gridRows` の中から
   **モジュールスコープの関数を新しく呼ばない**（Global Constraints の（A））
2. `overflowTable` を呼ぶのは `gridRows` の中（`files/index.html:5143`）。
   `renderSheet → gridRows(pad, overflow, marks) → overflowTable(overflow, marks)` と通す
3. **既存テスト7 assert が落ちる。** Step 7 で直す

- [ ] **Step 1: 失敗するテストを書く**

```js
test("書き足しがあれば自動計算の値より優先する", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A"), lot("部品B")], 2, "name", null, null,
                      "top", { "top|1|name": "手書きの品名" });
  assert.match(html, /部品A/);
  assert.match(html, /手書きの品名/);
  assert.doesNotMatch(html, />部品B</);
});

test("欄には data-ek と data-auto を付ける", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A"), lot("部品B")], 2, "name", null, null,
                      "top", { "top|1|name": "手書き" });
  const tds = html.match(/<td [^>]*>/g) || [];
  assert.equal(tds.length, 2);
  // data-ek は編集モードが OFF でも常に付ける
  assert.match(tds[0], /data-ek="top\|0\|name"/);
  assert.match(tds[1], /data-ek="top\|1\|name"/);
  // data-auto は書き足しがある欄にも、自動計算の値が入る。
  // これが無いと自動値を知るために表を描き直すことになり、
  // タップされた td が DOM から切り離されて入力欄が出なくなる
  assert.match(tds[0], /data-auto="部品A"/);
  assert.match(tds[1], /data-auto="部品B"/);
  // edited は書き足した欄だけ
  assert.doesNotMatch(tds[0], /edited/);
  assert.match(tds[1], /edited/);
});

test("空欄にも書き足しを差し込める", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");

  const html = render([], 2, "note", null, null, "top", { "top|0|note": "臨時の置き場" });
  assert.match(html, /臨時の置き場/);
  assert.match(html, /data-ek="top\|0\|note"/);
});

test("改行を含む書き足しは縦積みに組み立てる", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");

  const html = render([], 1, "lot", null, null, "top", { "top|0|lot": "L1\nL2\nL3" });
  assert.match(html, /<span class="fitcol">/);
  const inner = html.match(/<span class="fit">[^<]*<\/span>/g) || [];
  assert.equal(inner.length, 3);
  assert.match(inner[0], /L1/);
  assert.match(inner[2], /L3/);

  const one = render([], 1, "lot", null, null, "top", { "top|0|lot": "L1" });
  assert.doesNotMatch(one, /fitcol/);
});

test("書き足しを渡さなければ従来どおりの出力になる", () => {
  // slotCells を実行しているテストは位置引数で呼ぶので、tier と marks は
  // undefined になる。この経路が従来どおりであることを回帰として残す
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A")], 1, "name", "bb2");
  assert.match(html, /部品A/);
  assert.doesNotMatch(html, /edited/);
  // tier が無いときはキーが作れないので data-ek を付けない
  assert.doesNotMatch(html, /data-ek/);
});

test("追記欄の書き足しは gridRows を経由して届く", () => {
  // overflowTable を呼ぶのは renderSheet ではなく gridRows の中。
  // gridRows 自身も new Function で実行されるので、marks は引数で通す
  const fn = functionSource("gridRows");
  assert.match(fn, /overflowTable\(overflow,\s*marks\)/);
  const render = functionSource("renderSheet");
  assert.match(render, /gridRows\([^)]*marks\)/);
});

test("追記欄にも書き足しを差し込める。余り欄には付けない", () => {
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  )(v => String(v), () => "3P", () => "※未定");

  const entry = n => ({ lot: { name: n, lot: "L" }, areas: ["退避"], note: "※未定" });
  // 件数が奇数。右側は blank で埋まる
  const html = renderOverflow([entry("部品A")], { "over|0|name": "書き足し" });
  assert.match(html, /書き足し/);
  assert.doesNotMatch(html, />部品A</);
  assert.match(html, /data-ek="over\|0\|name"/);
  // 余り欄（blank）は荷物の欄ではないのでキーを与えない。
  // 与えると件数が1つ増えたとき埋め草が本物の欄に変わり、書き足しがずれる
  const blanks = html.match(/<td class="none"[^>]*>/g) || [];
  blanks.forEach(td => assert.doesNotMatch(td, /data-ek/));

  // 2件目にも正しい index が付く
  const two = renderOverflow([entry("A"), entry("B")], {});
  assert.match(two, /data-ek="over\|0\|name"/);
  assert.match(two, /data-ek="over\|1\|name"/);

  // 渡さなければ従来どおり
  const plain = renderOverflow([entry("部品A")]);
  assert.match(plain, />部品A</);
  assert.doesNotMatch(plain, /data-ek/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: `slotCells()` を直す**

`files/index.html:4915`。引数を**末尾に**足す。

```js
function slotCells(entries,count,kind,extra,sepAt,tier,marks){
  // data-fit は fitSheetText() が「どの種類の欄が入りきらなかったか」を数えるのに使う
  const FIT={name:"name", lot:"lot", pallet:"pal", note:"note"};
  const fk=FIT[kind]||"";
  let out="";
  // 空欄は包まない。包むと高さ0の span が残って測定対象が無駄に増える
  const span = v => v ? `<span class="fit">${esc(v)}</span>` : "";
  // 書き足しの値。改行を含むときは縦積みに組み立てる。
  // ここで別の関数を呼ばないこと。テストが new Function(依存名..., src) で
  // 本体だけを評価するので、依存名に無い名前は ReferenceError になる
  const markSpan = v => {
    const lines=String(v).split("\n");
    return lines.length<=1 ? span(lines[0])
      : `<span class="fitcol">${lines.map(span).join("")}</span>`;
  };
  const mk = marks || {};
  for(let i=0;i<count;i++){
    const e=entries[i], l=e&&e.lot;
    const ms = e ? (e.members || [e]) : [];
    // 自動計算の値。書き足しの有無にかかわらず組み立て、data-auto に入れる。
    // 編集を開くときにここから読む。表を描き直して読もうとすると、
    // タップされた td が DOM から切り離されて入力欄が出なくなる
    // autoText は data-auto に入れる値。sheetCellText() が欄から読み戻す値と
    // 揃えること（saveSheetMark() がこの2つを比べて「自動値と同じなら
    // キーを消す」を判定する）。縦積みは改行で連結、それ以外はそのまま
    let autoInner="", autoText="";
    if(kind==="name"){ autoText=l?l.name:""; autoInner=span(autoText); }
    else if(kind==="lot"){
      // 空のロット番号は並べない。品名だけ入力した荷物が混ざりうる
      const ts=ms.map(m=>m.lot.lot).filter(t=>t);
      if(ts.length>=3){
        // 3件以上は1行に収まらない（9桁3件で圧縮 0.383。下限 0.4 を割る）ので縦に積む
        autoText=ts.join("\n");
        autoInner=`<span class="fitcol">${ts.map(span).join("")}</span>`;
      }else{
        autoText=ts.join("/");
        autoInner=span(autoText);
      }
    }
    else if(kind==="pallet"){ autoText=palSlotTextOf(ms); autoInner=span(autoText); }
    else if(kind==="note"){   autoText=e&&e.note?e.note:""; autoInner=span(autoText); }
    // 欄のキーは位置で引く。tier が渡されていない経路（既存テストなど）では
    // キーを作らず、data-ek も data-auto も付けない
    const ek = tier ? [tier,i,kind].join("|") : "";
    const mv = ek && Object.prototype.hasOwnProperty.call(mk,ek) ? mk[ek] : null;
    const edited = (mv!=null && mv!=="");
    const inner = edited ? markSpan(mv) : autoInner;
    let cls = (kind==="note") ? "none snote" : "slot c-"+fk;
    if(sepAt && sepAt.has(i) && kind!=="note") cls+=" gsep";
    if(extra && kind!=="note"){
      cls+=" "+extra;
      if(i===0)       cls+=" bl2";
      if(i===count-1) cls+=" br2";
    }
    // 書き足した欄は画面でだけ色を付ける。印刷では消す（CSS 側で扱う）
    if(edited) cls+=" edited";
    const attr = ek ? ` data-ek="${ek}" data-auto="${esc(autoText)}"` : "";
    out+=`<td class="${cls}" data-fit="${fk}"${attr} colspan="2">${inner}</td>`;
  }
  // 4区画のときは左半分（6列）を空ける
  return out;
}
```

**注意:** 元のコードは `kind==="note"` の分岐の中で `cls="none snote"` を代入し、
その後 `if(kind!=="note") cls+=" c-"+fk;` としていた。上の書き換えでは
`cls` の初期値を三項演算子でまとめている。`snote` を見る既存テスト
（`tests/sheet-placement.test.js:1855` 付近）が通ることを Step 6 で必ず確かめる。

- [ ] **Step 4: `overflowTable()` と `gridRows()` を直す**

先に実体を読む。

```bash
sed -n '4955,5010p' files/index.html
```

`overflowTable` は `entries` を2件ずつの `pairs` に畳んでから
4行 × 2列で組む（`4996-5003`）。**`entries` の添字はペア化で失われる**ので、
添字を対にして持ち回る。

```js
function overflowTable(entries,marks){
  if(!entries.length) return "";
  const span=v=>v?`<span class="fit">${esc(v)}</span>`:"";
  const markSpan = v => {
    const lines=String(v).split("\n");
    return lines.length<=1 ? span(lines[0])
      : `<span class="fitcol">${lines.map(span).join("")}</span>`;
  };
  const mk = marks || {};
  // e は [entry, index] の対。index は entries の添字
  const cell=([e,index],kind)=>{
    // …（既存の gs / textOf / vals の組み立てはそのまま。autoInner に入れる）…
    const ek = (index==null) ? "" : ["over",index,kind].join("|");
    const mv = ek && Object.prototype.hasOwnProperty.call(mk,ek) ? mk[ek] : null;
    const edited = (mv!=null && mv!=="");
    const inner = edited ? markSpan(mv) : autoInner;
    let cls = /* …既存の cls 組み立て… */;
    if(edited) cls+=" edited";
    const attr = ek ? ` data-ek="${ek}" data-auto="${esc(autoText)}"` : "";
    return `<td class="${cls} ${edge}" data-fit="${fit}"${attr}>${inner}</td>`;
  };
  // 余った側は罫線の無い空欄で埋める。td を省くと表が崩れて残りの欄が横に広がる。
  // ここは荷物の欄ではないので data-ek を与えない。与えると件数が1つ増えたとき
  // 埋め草が本物の欄に変わり、書き足しが荷物の欄へずれる
  const blank=`<td class="none"></td>`;
  const pairs=[];
  for(let i=0;i<entries.length;i+=2) pairs.push([[entries[i],i],[entries[i+1],i+1]]);
  const block=([a,b])=>["name","lot","pallet","note"]
    .map(k=>`<tr>${cell(a,k)}${b[0]?cell(b,k):blank}</tr>`).join("");
  return `<table class="overflow-table">${
    pairs.map(block).join('<tr class="overflow-gap"><td colspan="2"></td></tr>')}</table>`;
}
```

`gridRows()` は `marks` を受け取って `overflowTable` に渡すだけ。

```bash
grep -n "^function gridRows" files/index.html
```

シグネチャの末尾に `marks` を足し、`5143` の呼び出しを
`overflowTable(overflow, marks)` にする。

- [ ] **Step 5: `renderSheet()` から `marks` を渡す**

冒頭で1度だけ引く。

```js
  // 書き足し。署名が合わないときは空を渡す（紙には出さないが保存には残す）
  const marks=activeSheetMarks();
```

`slotCells` の呼び出し8か所に `tier` と `marks` を足す。

```js
  slotCells(top,lay.top,"name","bb2",gsep,"top",marks)
  slotCells(top,lay.top,"lot",null,gsep,"top",marks)
  slotCells(top,lay.top,"pallet",null,gsep,"top",marks)
  slotCells(topNotes,lay.top,"note",null,null,"top",marks)
  slotCells(bottom,lay.bottom,"name","bb2",null,"bottom",marks)
  slotCells(bottom,lay.bottom,"lot",null,null,"bottom",marks)
  slotCells(bottom,lay.bottom,"pallet",null,null,"bottom",marks)
  slotCells(bottom,lay.bottom,"note",null,null,"bottom",marks)
```

`gridRows` の呼び出しに `marks` を足す。

見出し（行1）は `marks` を直接引く。

```js
      + heads.map((g,i)=>{
          const ek=["top","g"+i,"head"].join("|");
          const mv=Object.prototype.hasOwnProperty.call(marks,ek)?marks[ek]:null;
          const edited=(mv!=null&&mv!=="");
          const label=edited?mv:g.label;
          return `<td class="ttl bb2${i?" gsep":""}${edited?" edited":""}" data-fit="head"`
               + ` data-ek="${ek}" data-auto="${esc(g.label)}" colspan="${g.slots*2}">`
               + `<span class="fit">${esc(label)}</span></td>`;
        }).join("")
```

- [ ] **Step 6: `activeSheetMarks()` と `currentSheetSig()` を足す**

`renderSheet()` の直前に足す。これらは `renderSheet` から呼ぶので
モジュールスコープでよい（`renderSheet` は文字列照合されるだけ）。

```js
// いま紙に出してよい書き足し。署名が合わないときは空を返す。
// marks そのものは捨てない（保存に残し、#sheetMsg で件数を知らせる）
function activeSheetMarks(){
  if(!schedule) return {};
  const ed=activeShift().sheetEdits;
  if(!ed || !ed.sig) return {};
  return ed.sig===currentSheetSig() ? (ed.marks||{}) : {};
}
// いまの状態の署名。pl を持っている呼び出し元は渡す（sheetPlacement() の
// 計算を省くため。1描画で3回呼ばれる）。
//
// sp は snapshotSpaces() を通した形にする。生の lastSp は使えない。
// リロード時の lastSp は clone(snapshot.sp) + hydrateBlockedRows() で
// 復元されるが、hydrateBlockedRows() は全スペースの全列に blockedRows を
// 入れるのに対し、buildWork() が作った生の lastSp では退避スペースの列だけ
// blockedRows を持たない。2026-09-19 の実測（サンプル9件・normal）で
// 3063 バイト vs 3080 バイトと一致しなかった。
// snapshotSpaces() は blockedRows を削るので、どちらの経路でも同じ JSON になる
function currentSheetSig(pl){
  if(!schedule || !hasResult) return "";
  const p=pl||sheetPlacement();
  return sheetEditSigFrom({
    fp: lastFp,
    lots: lastLots,
    sp: snapshotSpaces(lastSp),
    spacesText: spacesToText(true),
    mergeLots: mergeLots,
    fracMode: fracMode,
    layName: (p.lay===SHEET_LAYOUTS.wide)?"wide":"normal",
  });
}
// 保存には残っているが、署名が合わないので紙に出ていない書き足しの件数
function hiddenMarkCount(pl){
  if(!schedule) return 0;
  const ed=activeShift().sheetEdits;
  if(!ed || !ed.sig || ed.sig===currentSheetSig(pl)) return 0;
  return Object.keys(ed.marks||{}).length;
}
```

`activeSheetMarks()` も `pl` を受け取って `currentSheetSig(pl)` へ渡す形にし、
`renderSheet()` からは `activeSheetMarks(pl)` / `hiddenMarkCount(pl)` と呼ぶ。
`pl` は `renderSheet()` が既に計算している（`const pl=sheetPlacement()`）。

- [ ] **Step 7: 既存テストの7 assert を直す**

`slotCells` の呼び出しを固定している正規表現に、足した引数を反映する。

`tests/sheet-placement.test.js:1830-1835`（テスト名「グループの区切り線は上段の品名・ロット・P数の行にも通す」）:

```js
  assert.match(fn, /slotCells\(top,lay\.top,"name","bb2",gsep,"top",marks\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"lot",null,gsep,"top",marks\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"pallet",null,gsep,"top",marks\)/);
  // 下段にはグループの区切りを渡さない（sepAt が null）
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"name","bb2",null,"bottom",marks\)/);
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"lot",null,null,"bottom",marks\)/);
```

`:1844`（テスト名「上段の注釈行は残し、またがる欄にだけ注釈を出す」）:

```js
  assert.match(fn, /slotCells\(topNotes,lay\.top,"note",null,null,"top",marks\)/);
```

`:1820`（テスト名「配置図の見出し行はグループごとのセルで、列数の合計が様式に一致する」）:

```js
  assert.match(fn, /<span class="fit">\$\{esc\(label\)\}<\/span>/);
```

**直す前に、それぞれのテストが何を守っているかをコメントから読むこと。**
区切り線のテストは「下段には渡さない」ことを確かめている。`sepAt` を
`null` で渡す形に変わっただけで、意図は変わらない。

- [ ] **Step 8: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS。既存172件 + Task 1 の4件 + Task 2 の5件 + 今回の7件 = 188件

落ちた場合に疑う順:
1. `slotCells` の `cls` 組み立て（Step 3 の注意）→ `snote` のテスト
2. `gridRows` の中からモジュールスコープを呼んでいないか → ReferenceError
3. Step 7 の正規表現と実際の呼び出しの文字列が1文字でも違わないか

- [ ] **Step 9: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: 配置図の欄に書き足しを差し込めるようにする

marks は renderSheet → gridRows → overflowTable と引数で通す。追記欄を
呼ぶのは renderSheet ではなく gridRows で、gridRows もテストが
new Function で実行するため、中からモジュールスコープを参照できない。

各欄に data-auto で自動計算の値を持たせる。編集を開くときにここから読む。
表を描き直して読もうとすると、タップされた td が DOM から切り離されて
入力欄が出なくなる。

renderSheet を文字列照合している既存テストが slotCells の呼び出しを
末尾の ) まで固定しているので、7つの assert を同時に直した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 編集モードの骨格と `renderSheet()` の後始末

**Files:**
- Modify: `files/index.html:736`（`.sheet-toolbar`）、`:4801`（`renderSheet()`）、`:2606`（`switchTab()`）、`:3059`（`setActiveTiming()`）、CSS
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 3 の `activeSheetMarks()`
- Produces:
  - `sheetEditMode`（`boolean`）
  - `toggleSheetEditMode()` / `applySheetEditMode()` / `exitSheetEditMode()`
  - `flushSheetEdit()` — 保存だけして描き直さない。Task 5 で中身を入れる。ここでは `false` を返すだけ
  - `commitSheetEdit()` — `flushSheetEdit()` が true なら `renderSheet()`。Task 4 で完成し、以降変えない
  - `printBlock()` テストヘルパー

- [ ] **Step 1: テストヘルパーと失敗するテストを書く**

まず Global Constraints の `printBlock()` ヘルパーを
`tests/sheet-placement.test.js` の `functionSource` の隣に足す。

```js
test("配置表のツールバーに文字を編集するトグルを置く", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  const sheetTab = source.slice(sheetStart, sheetEnd);
  assert.match(sheetTab, /id="sheetEditBtn"[^>]*onclick="toggleSheetEditMode\(\)"/);
  assert.match(sheetTab, /✏ 文字を編集/);
});

test("編集モードの印は画面だけに出し、紙には出さない", () => {
  // 背景色はブラウザが既定で印刷しないので print-color-adjust を付けないことが
  // 紙に出さない手段になる。念のため @media print でも消す
  assert.match(source, /\.sheet td\.edited\{background:#fffbe6\}/);
  assert.match(printBlock(), /\.sheet td\.edited\{background:transparent/);
  assert.doesNotMatch(source, /td\.edited\{[^}]*print-color-adjust/);
});

test("表を描き直しても横スクロール位置を戻す", () => {
  // .sheet ごと作り直すので、確定のたびに紙が左端へ飛ぶと
  // 右側の欄を続けて直せない（実機は幅412px・表672pxで必ず横スクロール）
  assert.match(functionSource("renderSheet"), /scrollLeft/);
});

test("表を描き直す前に編集中の入力を保存する。早期returnでも後始末する", () => {
  // onHeadChange / setArrowHead / applyDisplay / showMapState はいずれも
  // 編集中でも走り、開いている入力欄を無言で捨てる。
  // 早期 return の経路では末尾の applySheetEditMode() に届かない
  const fn = functionSource("renderSheet");
  const flushAt = fn.indexOf("flushSheetEdit()");
  const guardAt = fn.indexOf("!isActiveFresh()");
  assert.notEqual(flushAt, -1);
  assert.notEqual(guardAt, -1);
  assert.ok(flushAt < guardAt, "保存は早期 return より前に置くこと");
  assert.match(fn, /applySheetEditMode\(\)/);
  // commitSheetEdit() は renderSheet() を呼ぶので、ここから呼ぶと
  // 1回の確定で表を2回組み立てることになる
  assert.doesNotMatch(fn, /commitSheetEdit\(\)/);
});

test("あさとひるを切り替える前に編集を閉じる", () => {
  // setActiveTiming は activeTiming を切り替えた後に showMapState →
  // renderSheet を呼びうる。そこで確定すると、あさで開いていた入力が
  // ひるの marks に保存される
  const fn = functionSource("setActiveTiming");
  const exitAt = fn.indexOf("exitSheetEditMode()");
  const switchAt = fn.indexOf("activeTiming=key");
  assert.notEqual(exitAt, -1);
  assert.ok(exitAt < switchAt, "確定は activeTiming を変える前に置くこと");
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: ツールバーにボタンを足す**

`files/index.html:736`:

```html
      <div class="sheet-toolbar">
        <div class="timing-switch" data-timing-switch></div>
        <button class="btn btn-ghost" id="sheetEditBtn" onclick="toggleSheetEditMode()">✏ 文字を編集</button>
        <button class="btn btn-ghost sheet-print" id="printBtn" onclick="printSheet()" disabled>🖨 印刷</button>
      </div>
```

既存テスト「配置表は時間帯切替の右に112px幅の印刷ボタンを置く」
（`tests/sheet-placement.test.js:44`）は `[\s\S]*?` の遅延マッチなので
間にボタンが入っても通るが、Step 6 で確認する。

- [ ] **Step 4: 状態と関数を足す**

`renderSheet()` の直前に足す。

```js
/* ---------- 配置図の編集モード ---------- */
// 画面の状態。保存しない。タブを離れたら OFF に戻す
let sheetEditMode=false;

function toggleSheetEditMode(){
  if(sheetEditMode){ exitSheetEditMode(); return; }
  sheetEditMode=true;
  applySheetEditMode();
}
// 開いている入力欄の値を保存する。描き直さない。Task 5 で中身を入れる。
// 保存と描き直しを分けるのは、renderSheet() の冒頭から呼ぶため。
// ここで renderSheet() を呼ぶと、外側の renderSheet() が続行して
// 1回の確定で表を2回組み立てることになる。
// 保存したら true
function flushSheetEdit(){ return false; }
// 保存して描き直す。入力欄の blur やボタンから呼ぶ。
// 印刷の経路（printSheet / beforeprint）からも辿り着くので、
// ここから confirm() を出してはならない。紙が白紙になる
function commitSheetEdit(){ if(flushSheetEdit()) renderSheet(); }
function exitSheetEditMode(){
  const had=flushSheetEdit();
  sheetEditMode=false;
  // renderSheet() の末尾で applySheetEditMode() が走るので、
  // 描き直すときは二重に呼ばない
  if(had) renderSheet();
  else    applySheetEditMode();
}
// renderSheet() は #sheetView の中身を丸ごと入れ替えるので、
// クラスは描き直すたびに貼り直す。呼び出し元は setArrowHead / onHeadChange /
// applyDisplay / showMapState と複数あるので、renderSheet() の末尾で行う
function applySheetEditMode(){
  const sheet=document.querySelector("#sheetView .sheet");
  if(sheet) sheet.classList.toggle("editing", sheetEditMode);
  const btn=document.getElementById("sheetEditBtn");
  if(btn){
    btn.classList.toggle("on", sheetEditMode);
    btn.setAttribute("aria-pressed", sheetEditMode ? "true" : "false");
  }
}
```

`switchTab()`（`2606`）の `if(name!=="edit") clearSel();` の直後:

```js
  // 編集モードは配置図タブの中だけの状態。他のタブへ移ったら OFF に戻す
  if(name!=="sheet" && sheetEditMode) exitSheetEditMode();
```

`setActiveTiming()`（`3059`）の `if(key!==activeTiming){` の直後、`acClose()` の隣:

```js
    // 切り替える前に確定する。activeTiming を変えたあとに showMapState() →
    // renderSheet() → commitSheetEdit() が走ると、あさで開いていた入力が
    // ひるの marks に保存される
    exitSheetEditMode();
    acClose();
```

- [ ] **Step 5: `renderSheet()` に後始末を足す**

```js
function renderSheet(){
  // 描き直す前に、開いている入力欄の値を保存する。onHeadChange / setArrowHead /
  // applyDisplay / showMapState はいずれも編集中でも走るので、
  // ここで保存しないと入力が無言で捨てられる。早期 return より前に置く。
  // commitSheetEdit() ではなく flushSheetEdit()。前者は renderSheet() を
  // 呼ぶので、この下の組み立てと合わせて表を2回作ることになる
  flushSheetEdit();
  const host=document.getElementById("sheetView");
  if(!isActiveFresh() || !lastSp){
    host.innerHTML="";
    // ここで抜けると末尾の applySheetEditMode() に届かない。
    // トグルが ON のまま残るので、自分で戻す
    sheetEditMode=false;
    applySheetEditMode();
    return;
  }
  // 横スクロールのコンテナは .sheet 自身（overflow-x:auto）で、この関数が
  // それごと作り直す。実機は幅412px・表672pxで必ず横スクロールしているので、
  // 控えておかないと確定のたびに紙が左端へ飛ぶ
  const keepLeft=(document.querySelector("#sheetView .sheet")||{}).scrollLeft||0;
  // …（既存の組み立て）…
  host.innerHTML=`<div class="sheet${gridCls}">…`;
  const now=document.querySelector("#sheetView .sheet");
  if(now && keepLeft) now.scrollLeft=keepLeft;
  fitSheetText(pl);
  drawLeaders(grid.anchors, bottom.map(e=>e && !e.fromTop ? e.lot.id : null));
  applySheetZoom();
  applySheetEditMode();
}
```

**注意:** `keepLeft` を読む行は `host.innerHTML` を差し替える**前**に置くこと。
既存の早期 return の位置（`4803`）も変わるので、着手時に実物を読んで合わせる。

- [ ] **Step 6: CSS を足す**

`.sheet` の既存 CSS ブロックの末尾（`562` 付近）:

```css
  /* 書き足した欄。画面だけの印。print-color-adjust を付けないので紙には出ない */
  .sheet td.edited{background:#fffbe6}
  /* 編集モードの間だけ、触れる欄がどこか分かるようにする。空欄も対象なので
     この印がないと押せる場所が見えない */
  .sheet.editing td[data-ek]{background:#eef6ff;cursor:text}
  .sheet.editing td.edited{background:#fff3c4}
```

`@media print`（`563`）の中:

```css
    .sheet td.edited{background:transparent !important}
    .sheet.editing td[data-ek]{background:transparent !important}
```

- [ ] **Step 7: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: 配置図に編集モードの骨格を足す

renderSheet は .sheet ごと作り直すので、横スクロール位置を控えて戻し、
描き直す前に編集中の入力を確定し、末尾で編集モードのクラスを貼り直す。
早期 return の経路では末尾に届かないので、その場で後始末する。

setActiveTiming は activeTiming を切り替えた後に showMapState →
renderSheet を呼びうる。切り替える前に確定しないと、あさで開いていた
入力がひるの marks に保存される。

印刷CSSを見るテストは @media print の閉じ括弧までを切り出す。固定長で
切るとブロックの外まで含み、印刷CSSの外に書いた指定でも緑になる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: PC のセル内編集（601px 以上）

**Files:**
- Modify: `files/index.html`（Task 4 のブロックの続き）、CSS
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 4 の `sheetEditMode` / `flushSheetEdit()` / `commitSheetEdit()`、Task 1 の `normalizeMarkValue`
- Produces:
  - `sheetEditing`（`{key, td, el, auto}` または `null`）
  - `openSheetEditor(td)` / `openInlineEditor(td)` / `cancelSheetEdit()`
  - `saveSheetMark(key, raw, autoText)` → `boolean`
  - `ensureSheetEditSig()` — ここでは常に `true` を返す。Task 7 で中身を入れる

- [ ] **Step 1: 失敗するテストを書く**

```js
test("セル内編集は圧縮を外し、文字の大きさに下限を置く", () => {
  // 追記欄のまとめ欄は font-size:55% ≒ 7px でそのままでは打てない。
  // 編集中だけ実用サイズに上げ、確定したら元に戻す
  assert.match(source, /\.sheet td\.editing-cell \.fit\{transform:none/);
  assert.match(source, /\.sheet td\.editing-cell (input|textarea)/);
  assert.match(source, /font-size:max\(13px,/);
});

test("IMEの変換確定のEnterで欄を閉じない", () => {
  // Android Chrome では変換確定の Enter が keydown に届く。
  // e.key === "Enter" だけで判定すると変換しただけで閉じる
  assert.match(functionSource("openInlineEditor"), /isComposing/);
});

test("欄は mousedown で開く", () => {
  // click を待つと、前の欄の blur → commitSheetEdit → renderSheet で
  // DOM が総入れ替えになり、mouseup の時点でクリック対象が消えている。
  // 別の欄へ移るのに2タップ必要になる
  assert.match(source, /addEventListener\("mousedown",[\s\S]{0,400}?data-ek/);
});

test("自動計算の値は data-auto から読む", () => {
  // 表を描き直して読もうとすると、タップされた td が DOM から切り離されて
  // 入力欄が出ず、focus() も効かない。しかもこれが起きるのは
  // 「すでに書き足した欄をもう一度直す」＝最も普通の用途
  const fn = functionSource("openInlineEditor");
  assert.match(fn, /dataset\.auto/);
  assert.doesNotMatch(fn, /renderSheet\(\)/);
});

test("書き足しは空文字か自動計算値と同じならキーを消す", () => {
  const norm = new Function(
    functionSource("normalizeMarkValue") + "; return normalizeMarkValue;"
  )();
  const save = new Function(
    "activeShift", "saveSchedule", "normalizeMarkValue", "ensureSheetEditSig",
    functionSource("saveSheetMark") + "; return saveSheetMark;"
  );
  const shift = { sheetEdits: { sig: "s1", marks: { "top|0|name": "既存" } } };
  const run = save(() => shift, () => {}, norm, () => true);

  run("top|0|name", "", "自動値");
  assert.equal(shift.sheetEdits.marks["top|0|name"], undefined);

  shift.sheetEdits.marks["top|1|name"] = "何か";
  run("top|1|name", "  自動値  ", "自動値");
  assert.equal(shift.sheetEdits.marks["top|1|name"], undefined);

  run("top|2|name", "  手書き  ", "自動値");
  assert.equal(shift.sheetEdits.marks["top|2|name"], "手書き");
});

test("確定の経路に確認を挟まない", () => {
  // printSheet と beforeprint が exitSheetEditMode → flushSheetEdit →
  // saveSheetMark と辿る。ここで confirm を出すと紙が白紙になる
  assert.doesNotMatch(functionSource("saveSheetMark"), /confirm\(/);
  assert.doesNotMatch(functionSource("flushSheetEdit"), /confirm\(/);
  assert.doesNotMatch(functionSource("exitSheetEditMode"), /confirm\(/);
});

test("欄を開くときは、描き直したあとの td をキーで引き直す", () => {
  // openSheetEditor は先頭で commitSheetEdit() を呼ぶ。そこで renderSheet() が
  // 走ると、引数で受け取った td は DOM から切り離される
  // （isConnected===false）。切り離されたノードに入力欄を差し込んでも
  // 画面に出ず focus() も効かない。編集中に別の欄をタップする＝最も普通の
  // 操作で必ず起きる
  const fn = functionSource("openSheetEditor");
  const keyAt = fn.indexOf("td.dataset.ek");
  const commitAt = fn.indexOf("commitSheetEdit()");
  assert.notEqual(keyAt, -1);
  assert.notEqual(commitAt, -1);
  assert.ok(keyAt < commitAt, "キーは描き直す前に控えること");
  assert.match(fn, /querySelector\('#sheetView td\[data-ek="'\s*\+\s*key/);
  // 引数の td をそのまま渡していないこと
  assert.doesNotMatch(fn, /open(Bar|Inline)Editor\(td\)/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 欄を開く入口を足す**

Task 4 のブロックの続きに足す。

```js
// いま開いている編集の状態。1つだけ開く
let sheetEditing=null;   // {key, td, el, auto}

// click ではなく mousedown で開く。click を待つと、前の欄の blur →
// commitSheetEdit() → renderSheet() で DOM が総入れ替えになり、
// mouseup の時点でクリック対象が消えていて別の欄へ移るのに2タップ要る。
// これはスマホの入口も兼ねる。タッチでも touchstart のあと合成の mousedown が
// 発火するので、touchstart を別に登録してはいけない（二重に開いて
// 開いたばかりの入力欄が blur ＝確定する）。方式の分岐は openSheetEditor の中
document.addEventListener("mousedown", e=>{
  if(!sheetEditMode) return;
  const host=document.getElementById("sheetView");
  if(!host || !host.contains(e.target)) return;
  const td=e.target.closest("td[data-ek]");
  if(!td) return;
  if(sheetEditing && sheetEditing.td===td) return;   // 開いている欄そのもの
  e.preventDefault();                                 // 既定のフォーカス移動を止める
  openSheetEditor(td);
});

// 幅で方式を分ける。両方の入力欄を同時に DOM へ置かない。
// 非表示側の要素に focus() を呼んでも何も起きない（2026-08-27 の教訓）
function openSheetEditor(td){
  // キーを先に控える。この下で表が描き直されると、引数で受け取った td は
  // DOM から切り離される（isConnected===false）。切り離されたノードに
  // 入力欄を差し込んでも画面に出ず focus() も効かない。
  // 編集中に別の欄をタップする＝最も普通の操作で必ず起きる
  const key=td.dataset.ek;
  const hadHidden=hiddenMarkCount()>0;
  // 前の欄を確定する。中で renderSheet() が走りうる
  commitSheetEdit();
  // 署名が合わないときはここで古い書き足しを捨てる（Task 7）。
  // 確定側ではなく開く側に置くのは、印刷の経路に confirm を出さないため
  if(!ensureSheetEditSig()) return;
  // 捨てたなら #sheetMsg の「前の配置に対する書き足しが N 件」も消す
  if(hadHidden) renderSheet();
  // 描き直されたあとの欄をキーで引き直す。
  // 属性セレクタは引用符で囲めばキーの "|" をそのまま書ける
  const fresh=document.querySelector('#sheetView td[data-ek="'+key+'"]');
  if(!fresh) return;
  if(compactInputMq.matches) openBarEditor(fresh);
  else                       openInlineEditor(fresh);
}
// 署名を合わせる。Task 7 で中身を入れる
function ensureSheetEditSig(){ return true; }
// 欄の中の文字。縦積み（.fitcol）は行を改行で連結する
function sheetCellText(td){
  const col=td.querySelector(".fitcol");
  if(col) return [...col.querySelectorAll(".fit")].map(s=>s.textContent).join("\n");
  const one=td.querySelector(".fit");
  return one?one.textContent:"";
}
// 書き足しを保存する。空文字か自動計算の値と同じならキーを消す
// （これが「欄ごとの取り消し」になる。紙の上に×ボタンを増やさない）。
// 印刷の経路から呼ばれるので confirm() を出さないこと
function saveSheetMark(key,raw,autoText){
  const ed=activeShift().sheetEdits;
  const value=normalizeMarkValue(raw);
  const auto=normalizeMarkValue(autoText);
  if(value==="" || value===auto){
    if(Object.prototype.hasOwnProperty.call(ed.marks,key)){ delete ed.marks[key]; saveSchedule(); }
    return false;
  }
  ed.marks[key]=value;
  saveSchedule();
  return true;
}
```

- [ ] **Step 4: セル内編集を足す**

```js
// PC（601px 以上）。欄の中身を入力欄に差し替える。
// 欄の実測幅は 95px しかないが、PC は Escape があり、表示倍率ボタンで
// 拡大でき、マウスで横スクロールできるので実用になる
function openInlineEditor(td){
  const key=td.dataset.ek;
  // 自動計算の値は描画時に data-auto へ入れてある。
  // ここで表を描き直して読もうとすると、この td が DOM から切り離されて
  // 入力欄が出ず focus() も効かない（書き足し済みの欄を直すとき必ず起きる）
  const auto=td.dataset.auto||"";
  const cur=sheetCellText(td);
  const multi=cur.indexOf("\n")>=0 || !!td.querySelector(".fitcol");
  const el=document.createElement(multi?"textarea":"input");
  if(!multi) el.type="text";
  el.value=cur;
  if(multi) el.rows=Math.max(1,cur.split("\n").length);
  td.classList.add("editing-cell");
  td.innerHTML="";
  td.appendChild(el);
  sheetEditing={key, td, el, auto};
  el.focus();
  if(el.select) el.select();

  el.addEventListener("keydown", ev=>{
    if(ev.key==="Escape"){ ev.preventDefault(); cancelSheetEdit(); return; }
    // Android Chrome は IME の変換確定の Enter も keydown に届ける。
    // isComposing を見ないと、変換しただけで欄が閉じる
    if(ev.key==="Enter" && !multi && ev.isComposing===false){ ev.preventDefault(); el.blur(); }
  });
  el.addEventListener("blur", ()=>{ commitSheetEdit(); });
}
function cancelSheetEdit(){
  if(!sheetEditing) return;
  sheetEditing=null;
  renderSheet();
}
```

Task 4 で空にしておいた `flushSheetEdit()` を差し替える。
`commitSheetEdit()` は Task 4 のまま（`flushSheetEdit()` が true なら `renderSheet()`）。

```js
// 保存だけして描き直さない。renderSheet() の冒頭から呼ばれるので、
// ここで renderSheet() を呼ぶと表を2回組み立てることになる
function flushSheetEdit(){
  if(!sheetEditing) return false;
  const {key, el, auto}=sheetEditing;
  sheetEditing=null;                 // 再入を止める
  saveSheetMark(key, el.value, auto);
  return true;
}
```

- [ ] **Step 5: CSS を足す**

```css
  /* セル内編集。圧縮を外して等倍にする。追記欄のまとめ欄は font-size:55%
     ≒7px なので、編集中だけ 13px を下限にする（確定したら元に戻る） */
  .sheet td.editing-cell .fit{transform:none !important}
  .sheet td.editing-cell input,.sheet td.editing-cell textarea{
    width:100%;box-sizing:border-box;border:1px solid #06f;padding:0;margin:0;
    font-family:inherit;font-size:max(13px,1em);line-height:1.2;text-align:center;
    background:#fff;color:#000;resize:none}
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 7: ブラウザで確かめる**

```bash
python3 -m http.server 8765 --directory files
```

`http://localhost:8765` →「▶ 自動配置を作成」→ 配置図タブ →「✏ 文字を編集」。

- 欄をクリックすると入力欄に変わり、圧縮が外れて等倍になる
- **別の欄をクリックすると1タップで移る**（前の欄が確定して新しい欄が開く）
- **一度書き足した欄をもう一度開ける**（`data-auto` が効いているかの確認）
- Escape で元に戻る
- 空にして確定すると自動計算の値へ戻る
- 確定しても横スクロール位置が保たれる
- ロットが3件以上ある欄は `<textarea>` になり、行ごとに直せる
- **リロードしても書き足しが紙に残る**

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: PC で配置図の欄をセル内で直せるようにする

自動計算の値は data-auto から読む。表を描き直して読むと、タップされた td が
DOM から切り離されて入力欄が出ず focus も効かない。書き足し済みの欄を
もう一度直すときに必ず起きる。

欄は mousedown で開く。click を待つと、前の欄の blur で DOM が総入れ替えに
なり、mouseup の時点で対象が消えていて2タップ必要になる。

確定は blur。Enter は e.isComposing === false のときだけ効かせる。
Android Chrome は IME の変換確定の Enter も keydown に届けるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: スマホの編集バー（600px 以下）

**Files:**
- Modify: `files/index.html`（`#tab-sheet` にバーの DOM、Task 5 のブロックの続き）、CSS
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 5 の `openSheetEditor()` / `saveSheetMark()` / `sheetCellText()`
- Produces:
  - `openBarEditor(td)` / `positionSheetEditBar()` / `closeSheetEditBar()` / `sheetEditLabelOf(key)`

- [ ] **Step 1: 失敗するテストを書く**

```js
test("スマホ用の編集バーを配置表タブに置く", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  const sheetTab = source.slice(sheetStart, sheetEnd);
  assert.match(sheetTab, /id="sheetEditBar"/);
  assert.match(sheetTab, /id="sheetEditInput"/);
  assert.match(sheetTab, /id="sheetEditLabel"/);
  assert.match(sheetTab, /onclick="commitSheetEdit\(\)"/);
  assert.match(sheetTab, /onclick="cancelSheetEdit\(\)"/);
});

test("編集バーは hidden で隠れる", () => {
  // #sheetEditBar の display:flex は ID セレクタの作者スタイルなので
  // UA の [hidden]{display:none} に勝つ。属性セレクタを書かないと
  // bar.hidden=true が効かずバーが出っぱなしになる。
  // このリポジトリは .ac-list[hidden] など3か所で同じ回避をしている
  assert.match(source, /#sheetEditBar\[hidden\]\{display:none\}/);
});

test("編集バーはソフトキーボードの上に留まる", () => {
  // Chrome 108 以降の Android はキーボードで Layout Viewport をリサイズせず
  // Visual Viewport だけ縮める。既存の acPosition() と同じ計算を使う。
  // 可視領域の下端に置く。上端だとハイライトした td をバーが覆いうる
  const fn = functionSource("positionSheetEditBar");
  assert.match(fn, /visualViewport/);
  assert.match(fn, /offsetTop/);
  assert.match(fn, /height/);
});

test("編集バーは印刷しない", () => {
  assert.match(printBlock(), /#sheetEditBar/);
});

test("幅で方式を分け、両方の入力欄を同時に置かない", () => {
  // 非表示側の要素に focus() を呼んでも何も起きない（2026-08-27 の教訓）
  const fn = functionSource("openSheetEditor");
  assert.match(fn, /compactInputMq\.matches/);
  assert.match(fn, /openBarEditor/);
  assert.match(fn, /openInlineEditor/);
});

test("欄を開く入口は mousedown だけ。touchstart を足さない", () => {
  // タッチでも touchstart のあと合成の mousedown が発火する。両方に登録すると
  // 同じ欄で openSheetEditor が2回走り、2回目は mousedown ハンドラの
  // preventDefault() を通らないまま既定のフォーカス移動が起きて、
  // 開いたばかりの入力欄から blur ＝確定してしまう
  const opens = source.match(/addEventListener\("(mousedown|touchstart)"[\s\S]{0,400}?data-ek/g) || [];
  assert.equal(opens.length, 1, "欄を開くリスナは1つだけ");
  assert.match(opens[0], /mousedown/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 編集バーの DOM を足す**

`#tab-sheet` の中、`<div id="sheetMsg"></div>`（`752` 付近）の直前:

```html
      <!-- スマホ（600px以下）の編集バー。欄の実幅は95pxで品名は5.6文字しか
           見えず、Pixel 9a には Escape キーも無いので、表の外で編集する -->
      <div id="sheetEditBar" hidden>
        <span class="lbl" id="sheetEditLabel"></span>
        <input type="text" id="sheetEditInput">
        <button class="btn btn-primary" onclick="commitSheetEdit()">確定</button>
        <button class="btn btn-ghost" onclick="cancelSheetEdit()">取り消し</button>
      </div>
```

- [ ] **Step 4: 編集バーの動きを足す**

```js
// スマホ（600px 以下）。表の外のバーで編集する。
// 欄の実幅は 95px で品名（16px）は 5.6 文字しか見えず、
// Pixel 9a には Escape キーが無く、ソフトキーボードの戻るボタンは
// blur ＝確定になるので、in-place だと取り消す手段が無い
function openBarEditor(td){
  const key=td.dataset.ek;
  const auto=td.dataset.auto||"";
  const cur=sheetCellText(td);
  const multi=cur.indexOf("\n")>=0 || !!td.querySelector(".fitcol");
  const bar=document.getElementById("sheetEditBar");
  // 単一行と縦積みで要素ごと入れ替える。両方を DOM に置いたままにしない
  const el=document.createElement(multi?"textarea":"input");
  if(!multi) el.type="text";
  el.id="sheetEditInput";
  el.value=cur;
  if(multi) el.rows=Math.max(2,cur.split("\n").length);
  document.getElementById("sheetEditInput").replaceWith(el);

  document.getElementById("sheetEditLabel").textContent=sheetEditLabelOf(key);
  td.classList.add("editing-cell");
  bar.hidden=false;
  sheetEditing={key, td, el, auto};
  positionSheetEditBar();
  el.focus();

  el.addEventListener("keydown", ev=>{
    if(ev.key==="Enter" && !multi && ev.isComposing===false){ ev.preventDefault(); commitSheetEdit(); }
  });
}
// どの欄を直しているかをバーに出す
function sheetEditLabelOf(key){
  const p=String(key).split("|");
  const tier={top:"上段",bottom:"下段",over:"追記欄"}[p[0]]||p[0];
  if(p[2]==="head") return `${tier} 見出し`;
  const kind={name:"品名",lot:"ロット",pallet:"P数",note:"注釈"}[p[2]]||p[2];
  return `${tier} ${Number(p[1])+1}番目の${kind}`;
}
// Chrome 108 以降の Android はソフトキーボードで Layout Viewport を
// リサイズせず Visual Viewport だけ縮める。既存の acPosition() と同じ計算で
// 可視領域の下端（キーボードのすぐ上）に貼る。上端だと、ハイライトした
// 欄をバーが覆うことがある
function positionSheetEditBar(){
  const bar=document.getElementById("sheetEditBar");
  if(!bar || bar.hidden) return;
  const vv=window.visualViewport;
  const vTop=vv?vv.offsetTop:0;
  const vh=vv?vv.height:window.innerHeight;
  bar.style.top=(vTop+vh-bar.getBoundingClientRect().height-8)+"px";
}
if(window.visualViewport){
  window.visualViewport.addEventListener("resize", positionSheetEditBar);
  window.visualViewport.addEventListener("scroll", positionSheetEditBar);
}
function closeSheetEditBar(){
  const bar=document.getElementById("sheetEditBar");
  if(bar) bar.hidden=true;
}
```

`flushSheetEdit()` と `cancelSheetEdit()` にバーを閉じる処理を足す。
`commitSheetEdit()` は Task 4 のまま触らない。

```js
function flushSheetEdit(){
  if(!sheetEditing) return false;
  const {key, el, auto}=sheetEditing;
  sheetEditing=null;
  closeSheetEditBar();               // ← 足す
  saveSheetMark(key, el.value, auto);
  return true;
}
function cancelSheetEdit(){
  if(!sheetEditing) return;
  sheetEditing=null;
  closeSheetEditBar();               // ← 足す
  renderSheet();
}
```

編集中に幅が境（600px）を跨いだら確定する。

```js
// 編集中にウィンドウ幅が 600px を跨いだら、いったん確定する。
// 方式が変わるので、開いたままの入力欄を残さない
if(compactInputMq.addEventListener) compactInputMq.addEventListener("change", commitSheetEdit);
else compactInputMq.addListener(commitSheetEdit);
```

**タップの入口は Task 5 の `mousedown` のまま。`touchstart` を足さないこと。**

タッチでも `touchstart` のあと合成の `mousedown` が発火するので
（2026-09-19 実測でこの順に飛ぶことを確認）、`mousedown` だけで
PC とスマホの両方を賄える。両方に登録すると同じ欄で `openSheetEditor()` が
2回走り、2回目は `mousedown` ハンドラの `preventDefault()` を通らないまま
既定のフォーカス移動が起きて、開いたばかりの入力欄から `blur` ＝
確定してしまう（実機で「タップしたら即座に閉じる」症状になる）。

viewport meta に `width=device-width` があるので（`files/index.html:5`）、
タップから `mousedown` までの 300ms 遅延は起きない。

- [ ] **Step 5: CSS を足す**

```css
  /* スマホの編集バー。.sheet の外なので zoom も scaleX も掛からない */
  #sheetEditBar{position:fixed;left:8px;right:8px;z-index:60;display:flex;gap:6px;
                align-items:center;background:#fff;border:1px solid #06f;border-radius:8px;
                padding:6px 8px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
  /* display:flex は ID セレクタの作者スタイルなので UA の [hidden]{display:none}
     に勝つ。これを書かないと bar.hidden=true が効かない
     （.ac-list[hidden] などと同じ回避） */
  #sheetEditBar[hidden]{display:none}
  #sheetEditBar .lbl{flex:0 0 auto;font-size:12px;color:#333;white-space:nowrap}
  #sheetEditBar input,#sheetEditBar textarea{flex:1 1 auto;min-width:0;font-size:16px;
                padding:4px;border:1px solid #bbb;border-radius:4px;font-family:inherit;resize:none}
  #sheetEditBar button{flex:0 0 auto}
```

`@media print`:

```css
    #sheetEditBar{display:none !important}
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 7: ブラウザで確かめる（ウィンドウを狭めて）**

開発者ツールのデバイスモードか、ウィンドウ幅を 600px 以下にする。

- 欄をタップすると編集バーが出て、その欄がハイライトされる
- バーに「上段 3番目の品名」のように欄の名前が出る
- **バーがハイライトした欄を覆っていない**
- 「確定」で反映され、「取り消し」で元に戻り、**バーが閉じる**
- ウィンドウを 601px 以上に広げると、次からセル内編集になる

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: スマホで配置図の文字を表の外のバーから直せるようにする

欄の実測幅は95pxで品名（16px）は5.6文字しか見えない。table-layout:fixed の
672px固定なので入力欄を広げても列は広がらない。加えて Pixel 9a には Escape が
無く、ソフトキーボードの戻るボタンは blur ＝確定になるため、セル内編集だと
実機に取り消し手段が存在しない。

#sheetEditBar[hidden]{display:none} を書く。ID セレクタの display:flex は
UA の [hidden] に勝つため、これが無いと hidden=true が効かない。

バーの位置は既存の acPosition() と同じく visualViewport から出し、
可視領域の下端に置く。Chrome 108 以降の Android はキーボードで
Layout Viewport をリサイズしないため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 署名が合わない状態で書き始めたときの遷移と設定項目

**Files:**
- Modify: `files/index.html`（`ensureSheetEditSig()`、`STORE_KEY`、`#cfgpane-display`、起動時の読み込み）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 3 の `currentSheetSig()`、Task 5 の `ensureSheetEditSig()`（空実装）
- Produces:
  - `STORE_KEY.sheetEditSilent` / `sheetEditSilent` / `toggleSheetEditSilent()`
  - `ensureSheetEditSig()` の中身

- [ ] **Step 1: 失敗するテストを書く**

```js
test("確認なしで書き足しを捨てる設定を置く", () => {
  assert.match(source, /sheetEditSilent:"palletApp\.sheetEditSilent"/);
  const cfgStart = source.indexOf('<div id="cfgpane-display"');
  const pane = source.slice(cfgStart, cfgStart + 4000);
  assert.match(pane, /id="sheetEditSilentChk"[^>]*onchange="toggleSheetEditSilent\(\)"/);
  assert.match(pane, /確認なしで書き足しを捨てる/);
});

test("署名が合わない状態で書き始めたら古い書き足しを捨てる", () => {
  const ensure = new Function(
    "activeShift", "currentSheetSig", "sheetEditSilent", "confirm", "saveSchedule",
    functionSource("ensureSheetEditSig") + "; return ensureSheetEditSig;"
  );

  // 署名が合っていれば何もしない
  const same = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => same, () => "s1", false, () => false, () => {})(), true);
  assert.deepEqual(same.sheetEdits.marks, { "top|0|name": "A" });

  // 署名が違い、確認で OK なら marks を空にして新しい署名にする
  const diff = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => diff, () => "s2", false, () => true, () => {})(), true);
  assert.deepEqual(diff.sheetEdits.marks, {});
  assert.equal(diff.sheetEdits.sig, "s2");

  // キャンセルなら何も変えず false（欄を開かない）
  const kept = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => kept, () => "s2", false, () => false, () => {})(), false);
  assert.deepEqual(kept.sheetEdits.marks, { "top|0|name": "A" });

  // 設定が ON なら確認せずに捨てる
  const silent = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  let asked = false;
  assert.equal(ensure(() => silent, () => "s2", true, () => { asked = true; return false; }, () => {})(), true);
  assert.equal(asked, false);
  assert.deepEqual(silent.sheetEdits.marks, {});

  // 書き足しが元から空なら確認せずに署名だけ更新する
  const empty = { sheetEdits: { sig: "s1", marks: {} } };
  let asked2 = false;
  assert.equal(ensure(() => empty, () => "s2", false, () => { asked2 = true; return false; }, () => {})(), true);
  assert.equal(asked2, false);
  assert.equal(empty.sheetEdits.sig, "s2");
});

test("確認は欄を開くときに出す。確定の経路には置かない", () => {
  // 確定側に置くと printSheet / beforeprint → exitSheetEditMode →
  // flushSheetEdit → confirm となり、紙が白紙になる
  assert.match(functionSource("openSheetEditor"), /ensureSheetEditSig\(\)/);
  assert.doesNotMatch(functionSource("saveSheetMark"), /ensureSheetEditSig/);
  assert.doesNotMatch(functionSource("flushSheetEdit"), /confirm\(/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 設定キーと状態を足す**

`STORE_KEY`（`1002`）に `sheetEditSilent:"palletApp.sheetEditSilent"` を足す。

`fracMode` の隣（`993` 付近）に `let sheetEditSilent=false;`。

`toggleFrac()`（`1632`）に倣う。

```js
/* 配置が変わったときに、書き足しを捨てる確認を出すかどうか。
   既定は off（確認する）。「そのほかの表示」の他の項目と同じ流儀で
   専用の STORE_KEY に保存する。DEFAULT_DISPLAY に相乗りさせない。
   利用者が自分で押す破棄（「捨てる」「書き足しを全部戻す」）には効かせない。
   押した破棄まで黙って実行すると、誤タップで書き足しが消える */
function toggleSheetEditSilent(){
  sheetEditSilent=document.getElementById("sheetEditSilentChk").checked;
  saveData(STORE_KEY.sheetEditSilent, sheetEditSilent);
}
```

起動時の読み込みは、隣の `initMergeLots`（`files/index.html:5471`）と同じ
IIFE の流儀に揃える。その直後に置く。

```js
// 書き足しを捨てる確認：保存があれば復元。既定は off なので true のときだけ立てる
(function initSheetEditSilent(){
  const v=loadData(STORE_KEY.sheetEditSilent);
  if(v===true){ sheetEditSilent=true; document.getElementById("sheetEditSilentChk").checked=true; }
})();
```

- [ ] **Step 4: 設定タブにチェックボックスを足す**

`mergeChk` の直後（`827` 付近）:

```html
        <div><label class="chk"><input type="checkbox" id="sheetEditSilentChk" onchange="toggleSheetEditSilent()"> 配置が変わったら、確認なしで書き足しを捨てる</label></div>
        <div class="hint">配置図の「✏ 文字を編集」で書き足した文字は、荷物を動かしたり伝票を直したりすると紙から消えます。その状態で新しく書き始めるとき、古い書き足しを捨てる確認を出すかどうかです。「捨てる」「書き足しを全部戻す」を自分で押したときは、この設定にかかわらず確認します。</div>
```

- [ ] **Step 5: `ensureSheetEditSig()` の中身を入れる**

Task 5 で空にしておいた関数を差し替える。

```js
// 署名が合わない状態で書き始めたとき、古い書き足しを捨てて新しい署名で始める。
// {sig, marks} を1組しか持たないので、sig だけ書き換えると古い marks が
// 新しい配置の同じ位置に一斉に復活する（位置キーなので必ず衝突する）。
// 逆に sig を据え置くと、書いた直後に自分の入力が消える。
//
// 呼ぶのは「欄を開く」ときだけ。確定側に置くと printSheet / beforeprint →
// exitSheetEditMode → flushSheetEdit → confirm という経路ができ、
// beforeprint の途中でモーダルが出て紙が白紙になる
// （tests/stash-overflow.test.js:167 に既存のテストがある）。
// 続けてよければ true、やめるなら false
function ensureSheetEditSig(){
  const ed=activeShift().sheetEdits;
  const now=currentSheetSig();
  if(ed.sig===now) return true;
  const n=Object.keys(ed.marks).length;
  if(n>0 && !sheetEditSilent){
    if(!confirm(`前の配置に対する書き足しが ${n} 件あります。\n捨てて、新しく書き始めますか？`)) return false;
  }
  ed.marks={};
  ed.sig=now;
  saveSchedule();
  return true;
}
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 7: ブラウザで確かめる**

- 書き足し → 配置編集で荷物を1マス動かす → 配置図タブで書き足しが消えている
- その状態で欄を**開く**と確認ダイアログが出る。キャンセルすると欄が開かない
- 設定タブ →「表示設定」→ チェックを ON → 同じ操作で確認が出ない
- **編集モード ON のまま印刷しても確認が出ず、紙が白紙にならない**

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: 配置が変わったあとに書き始めたら古い書き足しを捨てる

確認は「欄を開く」ときに出す。確定側に置くと printSheet と beforeprint が
exitSheetEditMode → flushSheetEdit → confirm と辿り、beforeprint の途中で
モーダルが出て紙が白紙になる。既存の
tests/stash-overflow.test.js:167 がこの罠を記録している。

sheetEdits は {sig, marks} を1組しか持たない。署名だけ書き換えると古い
marks が新しい配置の同じ位置に一斉に復活し、位置キーなので必ず別の荷物の
欄に乗る。署名を据え置けば書いた直後に自分の入力が消える。

設定は「配置が変わったら」の確認にだけ効かせる。自分で押す破棄まで
黙って実行すると、誤タップで書き足しが消える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `#sheetMsg` の案内

**Files:**
- Modify: `files/index.html:4717`（`fitSheetText()`）、`renderSheet()`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 3 の `currentSheetSig()`、Task 7 の `sheetEditSilent`
- Produces:
  - `fitSheetText(pl, hidden)` — 引数を末尾に足す
  - `dropHiddenMarks()`（`hiddenMarkCount()` は Task 3 で定義済み）

- [ ] **Step 1: 失敗するテストを書く**

```js
test("紙に出ていない書き足しの件数を画面に知らせる", () => {
  // #sheetMsg は印刷CSSで display:none なので紙には出ない
  const fn = functionSource("fitSheetText");
  assert.match(fn, /前の配置に対する書き足し/);
  assert.match(fn, /dropHiddenMarks\(\)/);
});

test("案内は innerHTML への代入より前で組む", () => {
  // fitSheetText は末尾で box.innerHTML = html と上書きし、applyDisplay からも
  // 呼ばれる。renderSheet の末尾で後から足すと、表示設定を触った瞬間に消える
  const fn = functionSource("fitSheetText");
  const assignAt = fn.lastIndexOf("box.innerHTML=html");
  const noticeAt = fn.indexOf("前の配置に対する書き足し");
  assert.notEqual(assignAt, -1);
  assert.notEqual(noticeAt, -1);
  assert.ok(noticeAt < assignAt);
});

test("書き足しであふれたときは書き足しを短くするよう案内する", () => {
  // 既存の「品名を短くしてください」「エリア名を短くしてください」は
  // 書き足し由来のあふれには当てはまらない
  const fn = functionSource("fitSheetText");
  assert.match(fn, /書き足した文字を短くしてください/);
  // 既存の2つの文言と条件には触れない
  assert.match(fn, /品名を短くしてください/);
  assert.match(fn, /エリア名を短くしてください/);
});

test("自分で押す破棄は設定にかかわらず確認する", () => {
  const fn = functionSource("dropHiddenMarks");
  assert.match(fn, /confirm\(/);
  assert.doesNotMatch(fn, /sheetEditSilent/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 件数と破棄の関数を足す**

`hiddenMarkCount()` は Task 3 で定義済み。ここでは破棄の関数だけ足す。

```js
// 利用者が自分で押す破棄。sheetEditSilent は見ない。
// 押した破棄まで黙って実行すると、誤タップで書き足しが消える
function dropHiddenMarks(){
  const n=hiddenMarkCount();
  if(!n) return;
  if(!confirm(`前の配置に対する書き足し ${n} 件を捨てますか？`)) return;
  const ed=activeShift().sheetEdits;
  ed.marks={};
  ed.sig="";
  saveSchedule();
  renderSheet();
}
```

- [ ] **Step 4: `fitSheetText()` に案内を足す**

シグネチャ:

```js
function fitSheetText(pl,hidden){
```

`box.innerHTML=html` より**前**、既存の `parts.length` のブロックの直後:

```js
  // 紙に出ていない書き足し。#sheetMsg は印刷CSSで display:none なので紙には出ない。
  // 引数で渡されない経路（applyDisplay 経由など）では自分で数える
  const hid=(hidden==null) ? (typeof hiddenMarkCount==="function"?hiddenMarkCount():0) : hidden;
  if(hid>0){
    html+=`<div class="msg ok">※ 前の配置に対する書き足しが ${hid} 件あります。紙には出ません。`
        + ` <button class="btn btn-ghost" onclick="dropHiddenMarks()">捨てる</button></div>`;
  }
```

あふれの案内に1文を足す。既存の `hasHead` / `hasSlot` の分岐（`4778` 付近）へ。

```js
    // 書き足した欄があふれているときは対処が違う。既存の2つの条件には触れない
    const hasEdited=Object.keys(over).some(k=>[...over[k]].some(td=>td.classList.contains("edited")));
    if(hasEdited) how+="書き足した文字を短くしてください。";
```

**注意:** `over` は `{kind: Set<td>}` の形。着手時に
`sed -n '4717,4800p' files/index.html` で `over` の作られ方を読み、
`td` が `Set` に入る条件と上の判定が合っているか確かめること。

- [ ] **Step 5: `renderSheet()` から件数を渡す**

```js
  fitSheetText(pl, hiddenMarkCount(pl));
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 7: ブラウザで確かめる**

- 書き足し → 荷物を動かす → 「前の配置に対する書き足しが N 件」が出る
- **設定タブで文字サイズを変えても、この案内が消えない**
- 「捨てる」を押すと確認が出て、OK で案内が消える
- 品名欄に 29 文字以上書くと「書き足した文字を短くしてください」が付く

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
docs: 紙に出ていない書き足しと、書き足し由来のあふれを画面に知らせる

案内は fitSheetText() の中で組む。この関数は末尾で box.innerHTML を上書きし、
applyDisplay() からも呼ばれるので、renderSheet() の末尾で後から足すと
表示設定を触った瞬間に案内が消える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 印刷経路と「書き足しを全部戻す」

**Files:**
- Modify: `files/index.html:4257`（`printSheet()`）、`:4266`（`beforeprint`）、`:736`（ツールバー）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 4 の `exitSheetEditMode()` / `applySheetEditMode()`
- Produces: `clearAllMarks()`

- [ ] **Step 1: 失敗するテストを書く**

```js
test("印刷の前に編集モードを閉じる。ショートカット経由も塞ぐ", () => {
  // Ctrl/Cmd+P とブラウザのメニューは printSheet() を通らず beforeprint だけが走る
  assert.match(functionSource("printSheet"), /exitSheetEditMode\(\)/);

  const beforeStart = source.indexOf("window.addEventListener('beforeprint'");
  assert.notEqual(beforeStart, -1);
  assert.match(source.slice(beforeStart, beforeStart + 400), /exitSheetEditMode\(\)/);
});

test("書き足しを全部戻すボタンは編集モードの間だけ出す", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  assert.match(source.slice(sheetStart, sheetEnd), /id="sheetClearBtn"[^>]*onclick="clearAllMarks\(\)"/);

  const fn = functionSource("applySheetEditMode");
  assert.match(fn, /sheetClearBtn/);
  assert.match(fn, /hidden/);
});

test("書き足しを全部戻すときは設定にかかわらず確認する", () => {
  const fn = functionSource("clearAllMarks");
  assert.match(fn, /confirm/);
  assert.doesNotMatch(fn, /sheetEditSilent/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 印刷経路を塞ぐ**

```js
function printSheet(){
  // 編集中の入力を確定し、モードを OFF に戻してから印刷する。
  // 紙に入力欄の枠や編集済みの背景色を出さない。
  // この経路に confirm() が入ると紙が白紙になるので、
  // 署名を合わせる確認は「欄を開く」側に置いてある
  exitSheetEditMode();
  if(!isActiveFresh()){ refreshFreshness(); return; }
  switchTab('sheet');
  window.print();
}
window.addEventListener('beforeprint', ()=>{
  // Ctrl/Cmd+P とブラウザのメニューからの印刷は printSheet() を通らない
  exitSheetEditMode();
  if(!isActiveFresh()){ refreshFreshness(); return; }
  switchTab('sheet');
});
```

- [ ] **Step 4: 「全部戻す」ボタンを足す**

ツールバー（`736`）:

```html
        <button class="btn btn-ghost" id="sheetClearBtn" onclick="clearAllMarks()" hidden></button>
```

`.btn` は `display` を指定していない（`files/index.html:50`）ので、
`#sheetEditBar` と違って `[hidden]` がそのまま効く。

`applySheetEditMode()` に足す:

```js
  // 「書き足しを全部戻す」は編集モードの間だけ、書き足しがあるときだけ出す
  const clear=document.getElementById("sheetClearBtn");
  if(clear){
    const n=schedule?Object.keys(activeShift().sheetEdits.marks||{}).length:0;
    clear.hidden=!(sheetEditMode && n>0);
    clear.textContent=`書き足しを全部戻す（${n}件）`;
  }
```

```js
// 利用者が自分で押す破棄。sheetEditSilent は見ない
function clearAllMarks(){
  const ed=activeShift().sheetEdits;
  const n=Object.keys(ed.marks||{}).length;
  if(!n) return;
  if(!confirm(`書き足し ${n} 件を全部戻しますか？`)) return;
  ed.marks={};
  ed.sig="";
  saveSchedule();
  renderSheet();
}
```

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 6: ブラウザで確かめる**

- 編集モード ON のまま「🖨 印刷」→ 紙に入力欄の枠と背景色が出ない
- 編集モード ON のまま Ctrl/Cmd+P → 同じく出ない
- **署名が合わない状態で編集モード ON のまま印刷しても、確認が出ず紙が白紙にならない**
- 編集モード ON のとき「書き足しを全部戻す（N件）」が出る。OFF で消える
- 押すと確認が出て、OK で全部が自動計算の値に戻る

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js && git commit -m "$(cat <<'EOF'
feat: 印刷の前に編集モードを閉じ、書き足しを全部戻すボタンを足す

Ctrl/Cmd+P とブラウザのメニューからの印刷は printSheet() を通らず
beforeprint だけが走る。片方だけに後始末を置くともう片方から漏れる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 追記欄の実測、PWA キャッシュ、実機確認

**Files:**
- Modify: `files/sw.js:6`、`docs/superpowers/specs/2026-09-19-sheet-text-edit-design.md`（§6-6）

- [ ] **Step 1: 追記欄のまとめ欄を実測する**

```bash
python3 -m http.server 8765 --directory files
```

入力タブで伝票を増やし、追記欄（`.overflow-table`）が出る日を作る。
上段・下段に入りきらない荷物が3件以上あるとまとめ欄（`.roll`）が出る。

コンソールで測る。

```js
const sheet=document.querySelector('#sheetView .sheet');
const z=parseFloat(getComputedStyle(sheet).zoom)||1;
const t=sheet.querySelector('table');
const H=()=>t.getBoundingClientRect().height/z;
const base=H();
const ov=sheet.querySelector('.overflow-table td.roll');
const orig=ov.innerHTML;
const rows=[];
for(let n=1;n<=6;n++){
  ov.innerHTML='<span class="fitcol">'+Array.from({length:n},(_,i)=>'<span class="fit">品名'+i+'</span>').join('')+'</span>';
  fitSheetText();
  rows.push({lines:n, delta:Math.round((H()-base)*10)/10});
}
ov.innerHTML=orig; fitSheetText();
({base:Math.round(base*10)/10, limit:513.2, headroom:Math.round((513.2-base)*10)/10, rows})
```

続けて、まとめ欄をクリックして `<textarea>` に変わり、
7px ではなく読める大きさ（13px 下限）で打てることを確かめる。

- [ ] **Step 2: 設計書 §6-6 を実測値で埋める**

「未測定」の語を残さない。

- [ ] **Step 3: PC のブラウザで通しで確かめる**

設計書 §7-2 の項目を上から順に消す。他のタスクで確かめていないのは次の3つ。

- **掲載先を変えたときに書き足しが紙から消える**
  設定タブ →「配置マス」でエリアの掲載先を `bottom` から `top` に変えて反映する。
  書き足しが消え、`#sheetMsg` に件数が出れば署名の材料が効いている
- **あさで書いた書き足しが、ひるに切り替えてから戻ってもあさに残っている**
  `setActiveTiming()` の後始末が効いているかの確認
- **リロードしても書き足しが紙に残る**
  署名の sp が snapshotSpaces() を通っているかの確認。生の lastSp を
  材料にしていると、リロードした瞬間に全部消える（退避スペースの
  blockedRows のぶんだけ JSON が変わるため）

- [ ] **Step 4: `CACHE_VERSION` を上げる**

`files/sw.js:6` を `"v56"` にする。

- [ ] **Step 5: テストを最後にもう一度走らせる**

Run: `node --test tests/*.test.js`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add files/sw.js docs/superpowers/specs/2026-09-19-sheet-text-edit-design.md && git commit -m "$(cat <<'EOF'
chore: PWA キャッシュの版を上げ、追記欄の実測値を設計書に書く

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: 実機（Pixel 9a / Android Chrome）で確かめる**

**準備**

```bash
ipconfig getifaddr en0
```

```bash
python3 -m http.server 8765 --directory files
```

Mac とスマホが同じ Wi-Fi にいること。ファイアウォールが有効だと
初回に受信接続の許可ダイアログが出るので許可する。

```bash
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate
```

スマホの Chrome で `http://<調べたIP>:8765` を開く。

**この経路の制限（2026-09-16 の教訓）**

- `http://<IP>:8765` は secure context ではないので **Service Worker が登録されない**。
  登録コードは `.catch(()=>{})` で失敗を握り潰すため画面上は何も起きないが、
  **Step 4 で上げた `CACHE_VERSION` の効果はこの経路では検証できない**
- データ投入は不要。`initLots()` が保存済みデータが無いとサンプルを自動で読む

**確かめること**

- 「▶ 自動配置を作成」→ 配置図タブ →「✏ 文字を編集」で触れる欄に色が付く
- 欄をタップすると画面下部に編集バーが出て、その欄がハイライトされる
- **バーがハイライトした欄を覆っていない**
- ソフトキーボードが出てもバーが隠れない
- **タップした直後に欄が閉じない**（touchstart と mousedown の二重発火が
  起きていないかの確認。起きていると入力欄が開いた瞬間に blur ＝確定する）
- **日本語を変換して確定しても、変換確定の Enter で欄が閉じない**
- 「確定」で紙に反映される。「取り消し」で元に戻り、**バーが閉じる**
- 確定しても横スクロール位置が保たれる（右端の欄を続けて直せる）
- **一度書き足した欄をもう一度開ける**
- ロットが3件以上ある欄はバーが複数行の入力になる
- 空にして確定すると自動計算の値に戻る
- 「🖨 印刷」で編集モードが OFF になり、紙に入力欄の枠と背景色が出ない
- **ツールバーのボタンが増えても紙が押し下げられすぎない。**
  `.sheet-toolbar` は `flex-wrap: wrap`（`files/index.html:355`）、
  `.btn` は `min-height:44px`（`:50`）。412px 幅に「あさ/ひる」
  「✏ 文字を編集」「書き足しを全部戻す」「🖨 印刷」が並ぶと2〜3段に折り返す。
  段数を見て、収まらなければ文言を詰める
- **1文字直すたびの待ち時間が気にならない。**
  確定のたびに `renderSheet()` が走り、`fitSheetText()`（全 `.fit` の実測）と
  `drawLeaders()` が動く。荷物が多い日ほど重い

**停止**

```bash
lsof -ti:8765 | xargs kill
```

---

## 自己レビュー

**1. 設計書の各節に対応するタスク**

| 設計書 | タスク |
|---|---|
| §3-1 保存先と形（孤児 marks を含む） | Task 2 |
| §3-2 署名 | Task 1、Task 3（`currentSheetSig()`） |
| §3-3 キー | Task 1 |
| §3-4 署名が合わない状態で編集したとき | Task 7 |
| §3-5 編集対象（余り欄の除外を含む） | Task 3 |
| §3-6 書き足しの差し込み（`gridRows` 経由、`data-auto`、pairs） | Task 3 |
| §3-7 表示していない書き足しの案内 | Task 8 |
| §3-8 編集モード | Task 4 |
| §3-9 入力欄の出し方（幅で2通り、`data-auto`、mousedown、`[hidden]`） | Task 5、Task 6 |
| §3-10 確定と取り消し | Task 5、Task 6 |
| §3-11 `renderSheet()` の副作用（早期 return、`setActiveTiming`） | Task 4 |
| §3-12 編集済みの印 | Task 4 |
| §3-13 印刷との関係（confirm 禁止） | Task 7、Task 9 |
| §3-14 あふれたときの扱い | Task 8 |
| §6-6 未測定 | Task 10 |
| §7-1 自動テスト（既存7 assert の修正を含む） | Task 1〜9 |
| §7-2 PC のブラウザ確認 | Task 5〜9 の確認 Step、Task 10 Step 3 |
| §7-3 実機確認 | Task 10 Step 7 |

**2. 名前の一貫性**

- Task 1: `sheetEditHash` / `sheetEditSigFrom` / `sheetEditKey` / `sheetHeadKey` / `normalizeMarkValue`
- Task 2: `normalizeSheetEdits`
- Task 3: `activeSheetMarks` / `currentSheetSig` / `hiddenMarkCount`
- Task 4: `sheetEditMode` / `toggleSheetEditMode` / `applySheetEditMode` / `flushSheetEdit` / `commitSheetEdit` / `exitSheetEditMode` / `printBlock`（テスト側）
- Task 5: `sheetEditing` / `openSheetEditor` / `openInlineEditor` / `cancelSheetEdit` / `saveSheetMark` / `sheetCellText` / `ensureSheetEditSig`（空実装）
- Task 6: `openBarEditor` / `positionSheetEditBar` / `sheetEditLabelOf` / `closeSheetEditBar`
- Task 7: `sheetEditSilent` / `toggleSheetEditSilent` / `ensureSheetEditSig`（中身）
- Task 8: `dropHiddenMarks`
- Task 9: `clearAllMarks`

2回に分けて書く関数は `flushSheetEdit`（Task 4 で空 → Task 5 で中身 → Task 6 でバーを閉じる）と
`ensureSheetEditSig`（Task 5 で空 → Task 7 で中身）の2つ。どちらも名前と引数は変わらない。
`commitSheetEdit` は Task 4 で完成し、以降変えない。

**3. 実装中に気をつける点（各タスクの本文に注記済み）**

- Task 2 Step 1: スナップショット往復のテストは `snapshotSpaces` の実体を読んでから書く
- Task 3 Step 3: `slotCells` の `cls` 組み立てを三項演算子にまとめるので、`snote` のテストを確認する
- Task 3 Step 4: `overflowTable` の `pairs` は `[entry, index]` の対にする
- Task 3 Step 7: 既存7 assert の正規表現は実際の呼び出しと1文字も違わないこと
- Task 4 Step 5: `keepLeft` は `host.innerHTML` を差し替える前に読む
- Task 8 Step 4: `over` の作られ方を読み、`td` が `Set` に入る条件と判定が合っているか確かめる
