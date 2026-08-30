# 場所の洗い出し反映と上段の注釈 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現場で洗い出した配置スペースを `DEFAULT_SPACES` に反映し、ブロック図を実形に寄せ、配置表の上段にも注釈を出す。

**Architecture:** `col` に描画専用の任意属性 `row`（描画行）と `off`（行内の開始オフセット）を足す。配置ロジックは一切見ない。`drawZone()` に「位置指定モード」を足し、`row` を持つ列があるエリアを 1 マス幅トラックの CSS grid で組む。配置表は上段の基準エリアを `topAreas[0]` にして注釈行を 1 行足し、増えたぶん印刷倍率を下げる。

**Tech Stack:** 単一 HTML ファイルの PWA。ビルドツールなし、テストランナーなし、依存パッケージなし。素の JavaScript と localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-08-30-space-survey-and-top-tier-note-design.md`

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の 2 つだけ。他のファイルは変更しない。
- `row` / `off` は**描画専用**。`place()` / `areaCandidates()` / `fitWindow()` / `validateMove()` / `applyMove()` など配置ロジックは一切参照しない。
- 設定テキストの書式は変更しない。`spacesToText()` は `row` / `off` を出力しない。したがって手動配置の指紋 `inputFingerprint()`（`spacesToText(false)` を使う）にも入らない。
- `SHEET_TOP_SLOTS`（4）と `SHEET_BOTTOM_SLOTS`（7）は変更しない。上下段の欄追加は次回。
- 配置表の見出し「軒下」は変更しない。
- `AREA_GROUPS` は `[["軒下①","軒下②"]]` のまま。新規 2 エリアは連結しない。
- `gridRows()` の 14 列の並びと 11 列のハードコードは変更しない。メインは形が変わらないため。
- 掲載先 `"over"` のあふれブロック描画は範囲外。実装しない。
- 位置指定モードの空き行のクラスは `.hgap`。`.empty` は使わない
  （`files/index.html:152` のグローバル定義に当たって高さが倍になる）。
- 印刷 CSS の `zoom` は `1.5` → `1.4`（Task 4 Step 5）。注釈行 1 行で
  A4 横に収まらなくなるため。
- 既存の関数名・引数の並びは変えない。
- `files/index.html` を変更したら、最後に `files/sw.js` の `CACHE_VERSION` を `"v19"` から `"v20"` に上げる（Task 6）。上げないとインストール済みの PWA に更新が届かない。

## 検証の方針

このプロジェクトにはテストランナーが無い。各タスクの検証は、ブラウザで開いたページに対して
`javascript_tool`（`mcp__Claude_Browser__javascript_tool`）で検証スクリプトを実行し、
返り値の `ok` が `true` であることを確認する形で行う。

**必ず守ること:**

- `applyConfig()` は `alert()` を呼ぶ。`alert()` は `javascript_tool` の実行をブロックするので、
  検証スクリプトの先頭で必ず `window.alert` を差し替える。各タスクの検証スクリプトに含めてある。
- 合成イベントは `isTrusted:false` で既定動作を持たないため、ボタンのクリックは再現しない。
  `applyConfig()` / `resetConfig()` / `run(false)` / `switchTab()` はハンドラを直接呼ぶ。
- textarea への入力は `.value=` の直代入で行う。
- Service Worker は cache-first なので、`index.html` を編集したら
  検証の前に必ず登録解除とキャッシュ削除を行う（Task 0 の手順）。行わないと旧版を見続ける。
- 配置表の文字数を測るときの測定対象は `#sheetView .sheet` であって `#sheetView` ではない。
  `#sheetView` は外側のラッパーで、数えると基準値が合わない。
- 配置表の innerHTML には曜日の丸印 `<span class="ring">月</span>` が日付によって入る。
  比較の前に必ず正規化する（各検証スクリプトに含めてある）。
- **`localStorage` を消す検証は、ユーザーが実際に使っているのと同じオリジンで走る。**
  この端末には実ロット・品目マスタ・手動調整が保存済みで、消すと復旧できない。
  Task 0 Step 5 で退避し、Task 5 Step 8 で書き戻す。この 2 つを飛ばさないこと。
- 引き出し線の本数はその日のロット一覧に依存する。リテラルで比べず、
  Task 0 で測った改修前の値と比べる。
- `#cfgNote` は `hidden` 属性で開閉する。`style.display` を見ても常に空振りになる。

---

## Task 0: 検証環境の用意

**Files:**
- 変更なし（既存の `.claude/launch.json` を使う）

**Interfaces:**
- Produces: `http://localhost:8765/index.html` で `files/` を配信する preview サーバ。以降の全タスクがこれを使う。

- [ ] **Step 1: preview サーバを起動する**

`mcp__Claude_Browser__preview_start` を `{"name": "pallet-layout"}` で呼ぶ。
`.claude/launch.json` に定義済みなので新規作成は不要。

期待: `serverId` と `tabId` が返る。

- [ ] **Step 2: `index.html` を開く**

`mcp__Claude_Browser__navigate` を `{"url": "http://localhost:8765/index.html"}` で呼ぶ。

- [ ] **Step 3: Service Worker とキャッシュを落とす**

`javascript_tool` で実行:

```js
(async () => {
  const rs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(rs.map(r => r.unregister()));
  const ks = await caches.keys();
  await Promise.all(ks.map(k => caches.delete(k)));
  return {unregistered: rs.length, cachesDeleted: ks.length};
})()
```

期待: エラーなく返る。件数は 0 でもよい（初回は登録されていない）。

- [ ] **Step 4: リロードして改修前の値を記録する**

`javascript_tool` で `location.reload()` を実行し、少し待ってから:

```js
(() => {
  window.alert = () => {};
  const caps = document.getElementById("capacity").textContent;
  const names = SPACES.map(s => s.name).join(",");
  run(false);
  switchTab("sheet");
  const sheet = document.querySelector("#sheetView .sheet");
  const len = sheet.innerHTML
    .replace(/<span class="ring">(月|火|水|木|金)<\/span>/g, '$1').length;
  const leaders = [...sheet.querySelectorAll("svg.leaders path")]
    .filter(p => !p.getAttribute("transform")).length;
  const table = sheet.querySelector("table");
  const box = table.getBoundingClientRect();
  return {caps, names, ver: SPACES_SAVE_VERSION,
          sheetLen: len, leaders, rows: table.rows.length,
          tableHeight: Math.round(box.height)};
})()
```

期待: `names` が `"メイン,軒下①,軒下②,PC横,EV横"`、`ver` が `1`。
`caps` は「倉庫内: 通常85P＋通路11P ／ 倉庫外: 通常38P＋通路0P」（合計 134P）。
`showCapacity()` は zone ごとの合計を出すので、倉庫内はメイン 63 ＋ PC横 12 ＋ EV横 10 = 85。
メイン単独の 63 と取り違えないこと。

**`leaders` と `sheetLen` と `tableHeight` の値を控える。** Task 4・Task 5 で比較に使う。
`leaders` はその日のロット一覧で変わるので、リテラルではなくここで得た値と比べる。

- [ ] **Step 5: 実データを退避する**

以降の検証で `localStorage` を消す。ユーザーの実データが入っているので必ず退避する。

`javascript_tool` で実行:

```js
(() => {
  const backup = {};
  Object.entries(STORE_KEY).forEach(([k, key]) => {
    backup[key] = localStorage.getItem(key);
  });
  window.__palletBackup = backup;
  // ページをリロードすると window の変数は消えるので、別キーにも書いておく
  localStorage.setItem("palletApp.__backup", JSON.stringify(backup));
  return {keys: Object.keys(backup), lotsPresent: !!backup["palletApp.lots"]};
})()
```

期待: `keys` に 10 個のキーが並び、`lotsPresent: true`。

このバックアップは Task 5 Step 8 で書き戻す。

---

## Task 1: `row` / `off` をデータ経路に通す

**Files:**
- Modify: `files/index.html` — `SPACES_MAX_COL_H` 付近（定数追加）、`validSpaces()`、`normalizeSpaces()`、`buildWork()`、`applyConfig()`

**Interfaces:**
- Produces:
  - 定数 `SPACES_MAX_ROW = 99`、`SPACES_MAX_OFF = 99`
  - `col` の任意プロパティ `row: number|undefined`（0 以上の整数）、`off: number|undefined`（0 以上の整数）
  - `validSpaces(a)` が `row`/`off` の範囲を検証する（存在するときだけ）
  - `normalizeSpaces(a)` と `buildWork()` が `row`/`off` を落とさずに引き継ぐ
  - `applyConfig()` が、列数の変わらないエリアについて既存の `row`/`off` を列インデックスで引き継ぐ

この時点では `DEFAULT_SPACES` はまだ `row`/`off` を持たない。描画も変わらない。
「値が通る配管」だけを作り、実行時に注入して確認する。

- [ ] **Step 1: 失敗する検証を書いて走らせる（配管が無いことの確認）**

`javascript_tool` で実行:

```js
(() => {
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    // 軒下① の 1 列目に描画位置を注入し、buildWork() を通す
    SPACES[1].cols[0].row = 3;
    SPACES[1].cols[0].off = 2;
    const w = buildWork();
    const col = w[1].cols[0];
    const n = normalizeSpaces(JSON.parse(JSON.stringify(SPACES)));
    return {
      ok: col.row === 3 && col.off === 2 && n[1].cols[0].row === 3 && n[1].cols[0].off === 2,
      buildWorkRow: col.row, buildWorkOff: col.off,
      normalizeRow: n[1].cols[0].row, normalizeOff: n[1].cols[0].off
    };
  } finally {
    SPACES = before;
  }
})()
```

期待: **FAIL** — `ok: false`、4 つの値がすべて `undefined`。
`buildWork()` と `normalizeSpaces()` が `cols` を作り直して `row`/`off` を捨てているため。

- [ ] **Step 2: 上限の定数を足す**

`files/index.html` の `const SPACES_MAX_AREAS = 20;` の直後に足す。

変更前:

```js
const SPACES_MAX_COL_H = 99;
const SPACES_MAX_COLS = 40;
const SPACES_MAX_AREAS = 20;
```

変更後:

```js
const SPACES_MAX_COL_H = 99;
const SPACES_MAX_COLS = 40;
const SPACES_MAX_AREAS = 20;
// 列の描画位置（row＝描画上の行、off＝行内の開始オフセット）の上限。
// drawZone() は row を 0 から最大値まで数えて空き行の div を作るので、
// 桁違いの値は例外にならずタブごと固まる。col.h と同じ理由で歯止めが要る。
const SPACES_MAX_ROW = 99;
const SPACES_MAX_OFF = 99;
```

- [ ] **Step 3: `buildWork()` に `row`/`off` を通す**

`files/index.html:1332` 付近。

変更前:

```js
function buildWork(){
  return SPACES.map(s=>({
    name:s.name, zone:s.zone, orient:s.orient||"v", block:s.block||99, align:s.align||"bottom",
    cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle, fills:[]}))
  }));
}
```

変更後:

```js
function buildWork(){
  return SPACES.map(s=>({
    name:s.name, zone:s.zone, orient:s.orient||"v", block:s.block||99, align:s.align||"bottom",
    // row / off は描画専用。配置ロジックは見ないが、drawZone() が受け取るのは
    // ここで作った lastSp なので、落とすと一度も実形で描かれない
    cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle, row:c.row, off:c.off, fills:[]}))
  }));
}
```

- [ ] **Step 4: `normalizeSpaces()` に `row`/`off` を通す**

`files/index.html:2193` 付近。

変更前:

```js
      cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle})),
```

変更後:

```js
      // row / off は保存に無ければ undefined のまま。既定の「順に詰める」の意味になる
      cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle, row:c.row, off:c.off})),
```

- [ ] **Step 5: Step 1 の検証を走らせて通ることを確認する**

Task 0 Step 3 の手順で Service Worker とキャッシュを落としてリロードしてから、
Step 1 とまったく同じスクリプトを `javascript_tool` で実行する。

期待: **PASS** — `ok: true`、`buildWorkRow: 3`、`buildWorkOff: 2`、
`normalizeRow: 3`、`normalizeOff: 2`。

- [ ] **Step 6: `validSpaces()` の失敗する検証を書いて走らせる**

`javascript_tool` で実行:

```js
(() => {
  const mk = (row, off) => ([{name:"A", zone:"near", orient:"h", block:99,
                              cols:[{h:3, row, off}], sheet:"bottom"}]);
  return {
    ok: validSpaces(mk(0,0)) === true
     && validSpaces(mk(undefined,undefined)) === true
     && validSpaces(mk(999,0)) === false
     && validSpaces(mk(0,999)) === false
     && validSpaces(mk(-1,0)) === false
     && validSpaces(mk("x",0)) === false,
    zero: validSpaces(mk(0,0)),
    absent: validSpaces(mk(undefined,undefined)),
    bigRow: validSpaces(mk(999,0)),
    bigOff: validSpaces(mk(0,999)),
    negative: validSpaces(mk(-1,0)),
    string: validSpaces(mk("x",0))
  };
})()
```

期待: **FAIL** — `ok: false`。`bigRow` / `bigOff` / `negative` / `string` がすべて `true`
（検証がまだ無いので何でも通る）。

- [ ] **Step 7: `validSpaces()` に `row`/`off` の検証を足す**

`files/index.html:2171` 付近。

変更前:

```js
    && s.cols.every(c=>c && Number.isFinite(c.h) && c.h>0 && c.h<=SPACES_MAX_COL_H))) return false;
```

変更後:

```js
    && s.cols.every(c=>c && Number.isFinite(c.h) && c.h>0 && c.h<=SPACES_MAX_COL_H
        // row / off は任意。無いのは正常な状態なので、あるときだけ範囲を見る
        && (c.row===undefined || (Number.isFinite(c.row) && c.row>=0 && c.row<=SPACES_MAX_ROW))
        && (c.off===undefined || (Number.isFinite(c.off) && c.off>=0 && c.off<=SPACES_MAX_OFF))
       ))) return false;
```

- [ ] **Step 8: Step 6 の検証を走らせて通ることを確認する**

Service Worker とキャッシュを落としてリロードしてから、Step 6 と同じスクリプトを実行する。

期待: **PASS** — `ok: true`。`zero: true`、`absent: true`、
`bigRow: false`、`bigOff: false`、`negative: false`、`string: false`。

- [ ] **Step 9: `applyConfig()` の引き継ぎの失敗する検証を書いて走らせる**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const beforeSpaces = JSON.parse(JSON.stringify(SPACES));
  const beforeText = document.getElementById("cfgText").value;
  try{
    // 軒下① の 1 列目に描画位置を注入する
    SPACES[1].cols[0].row = 3;
    SPACES[1].cols[0].off = 2;
    // 列数を変えずに高さだけ変えたテキストを流す
    const keep = SPACES.map(s=>{
      const cols = s.cols.map(c=>c.h+(c.aisle?"*":"")).join(",");
      return `${s.name} | ${s.zone} | ${s.orient||"v"} | ${s.block||99} | ${cols} | ${s.sheet||"bottom"}`;
    }).join("\n");
    document.getElementById("cfgText").value = keep;
    applyConfig();
    const kept = SPACES[1].cols[0];

    // 列数を変えたテキストを流す（引き継がず捨てる）
    const lines = keep.split("\n");
    lines[1] = "軒下① | far | h | 99 | 11,11,8,4 | top";
    document.getElementById("cfgText").value = lines.join("\n");
    applyConfig();
    const dropped = SPACES[1].cols[0];

    return {
      ok: kept.row === 3 && kept.off === 2
       && dropped.row === undefined && dropped.off === undefined,
      keptRow: kept.row, keptOff: kept.off,
      droppedRow: dropped.row, droppedOff: dropped.off
    };
  } finally {
    SPACES = beforeSpaces;
    document.getElementById("cfgText").value = beforeText;
    saveData(STORE_KEY.spaces, null);
    clearManual();
  }
})()
```

期待: **FAIL** — `ok: false`、`keptRow: undefined`、`keptOff: undefined`。
`applyConfig()` が `cols` を新規に作るだけで引き継いでいないため。

- [ ] **Step 10: `applyConfig()` に引き継ぎを足す**

`files/index.html:2094` 付近。

変更前:

```js
    const cols=p[4].split(",").map(x=>x.trim()).filter(Boolean).map(x=>{
      const aisle=x.endsWith("*"); const h=parseInt(x); return {h, aisle};
    }).filter(c=>c.h>0);
    if(!cols.length){alert("列の指定がありません:\n"+ln);return;}
    if(cols.some(c=>c.h>SPACES_MAX_COL_H)){alert(`列の高さは${SPACES_MAX_COL_H}以下にしてください:\n`+ln);return;}
    if(cols.length>SPACES_MAX_COLS){alert(`列数は${SPACES_MAX_COLS}以下にしてください:\n`+ln);return;}
    const prev=SPACES.find(s=>s.name===p[0]);
```

変更後:

```js
    const cols=p[4].split(",").map(x=>x.trim()).filter(Boolean).map(x=>{
      const aisle=x.endsWith("*"); const h=parseInt(x); return {h, aisle};
    }).filter(c=>c.h>0);
    if(!cols.length){alert("列の指定がありません:\n"+ln);return;}
    if(cols.some(c=>c.h>SPACES_MAX_COL_H)){alert(`列の高さは${SPACES_MAX_COL_H}以下にしてください:\n`+ln);return;}
    if(cols.length>SPACES_MAX_COLS){alert(`列数は${SPACES_MAX_COLS}以下にしてください:\n`+ln);return;}
    const prev=SPACES.find(s=>s.name===p[0]);
    // 描画位置（row/off）は設定テキストに出ない。列の本数が変わらないなら
    // 列インデックスで引き継ぎ、変わったら捨てて従来どおり詰めて描く。
    // 初期値に戻せば resetConfig() が DEFAULT_SPACES ごと形も戻す。
    if(prev && prev.cols.length===cols.length){
      cols.forEach((c,i)=>{
        if(prev.cols[i].row!==undefined) c.row=prev.cols[i].row;
        if(prev.cols[i].off!==undefined) c.off=prev.cols[i].off;
      });
    }
```

- [ ] **Step 11: Step 9 の検証を走らせて通ることを確認する**

Service Worker とキャッシュを落としてリロードしてから、Step 9 と同じスクリプトを実行する。

期待: **PASS** — `ok: true`、`keptRow: 3`、`keptOff: 2`、
`droppedRow: undefined`、`droppedOff: undefined`。

- [ ] **Step 12: 配置と指紋が変わっていないことを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    const fpBefore = inputFingerprint();
    const textBefore = spacesToText();
    // 描画位置だけを変えても、書式にも指紋にも出ないこと
    SPACES[1].cols[0].row = 3;
    SPACES[1].cols[0].off = 2;
    return {
      ok: spacesToText() === textBefore
       && inputFingerprint() === fpBefore
       && !/row|off|@/.test(spacesToText()),
      textUnchanged: spacesToText() === textBefore,
      fpUnchanged: inputFingerprint() === fpBefore,
      firstLine: spacesToText().split("\n")[0]
    };
  } finally {
    SPACES = before;
  }
})()
```

期待: `ok: true`。`textUnchanged: true`、`fpUnchanged: true`。
`firstLine` が `メイン | near | v | 3 | 6*,7,7,7,7,7,7,7,7,7,5* | bottom` のまま。

- [ ] **Step 13: コミット**

```bash
git add files/index.html
git commit -m "feat: 列に描画位置（row/off）を持てるようにする

配置ロジックは見ない描画専用の任意属性。buildWork() と
normalizeSpaces() が cols を作り直すたびに落ちていたので両方に通し、
validSpaces() に範囲の検証を足した。applyConfig() は列数が変わらない
エリアだけ列インデックスで引き継ぐ。

設定テキストの書式は変えていないので、手動配置の指紋にも入らない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: `drawZone()` の位置指定モード

**Files:**
- Modify: `files/index.html` — CSS（`.grid-h` 付近、`files/index.html:101` 前後）、`drawZone()`（`files/index.html:1573` 付近）

**Interfaces:**
- Consumes: Task 1 の `col.row` / `col.off`
- Produces:
  - CSS クラス `.grid-h.pos`、`.hgap`
  - `drawZone()` は、`orient === "h"` かつ `cols` のどれかが `row` を持つエリアを
    1 マス幅トラックの CSS grid で描く。`colwrap` の `data-space` / `data-col` 属性は
    従来どおり付く（手動移動のドロップ先判定がこれを使うため）

**空き行のクラスは `.hgap`。`.empty` は使わない。** `files/index.html:152` に
グローバルの `.empty{padding:26px 10px;text-align:center;color:var(--muted);font-size:13px}`
があり、当たると空き行が 30px ではなく 52px になり、色とセンタリングまで拾う。
このコードベースは同じ罠を一度踏んでいて、`files/index.html:249` に
「グローバルの `.note` と衝突させないため別名」という注意書きが残っている。

- [ ] **Step 1: 失敗する検証を書いて走らせる**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    // 軒下① を 2 行構成にして描かせる（1 行目に列なし＝空き行）
    SPACES[1].cols = [{h:11, row:1, off:0}, {h:11, row:2, off:0}, {h:8, row:3, off:0}];
    run(false);
    const wrap = [...document.querySelectorAll("#zone-far .space")]
      .find(w => w.querySelector(".name").textContent === "軒下①");
    const grid = wrap.querySelector(".grid-h");
    const gaps = grid.querySelectorAll(".hgap");
    return {
      ok: grid.classList.contains("pos")
       && grid.querySelectorAll(".colwrap").length === 3
       && gaps.length === 1
       && Math.round(gaps[0].getBoundingClientRect().height) <= 32,
      hasPos: grid.classList.contains("pos"),
      cols: grid.querySelectorAll(".colwrap").length,
      gaps: gaps.length,
      gapHeight: gaps.length ? Math.round(gaps[0].getBoundingClientRect().height) : null
    };
  } finally {
    SPACES = before;
    run(false);
  }
})()
```

期待: **FAIL** — `ok: false`、`hasPos: false`、`gaps: 0`。

`gapHeight` は空き行の高さ。`.empty` を拾うと 52px になるので、
30px 前後（マス 1 個分）であることを見る。

- [ ] **Step 2: CSS を足す**

`files/index.html:101` の `.grid-h` の定義の直後に足す。

変更前:

```css
  .grid-h{display:flex;flex-direction:column;gap:5px}
  /* PC横・EV横：実際の図と同じく短い段が上・右寄せ */
  .space.flip .grid-h{flex-direction:column-reverse;align-items:flex-end}
```

変更後:

```css
  .grid-h{display:flex;flex-direction:column;gap:5px}
  /* PC横・EV横：実際の図と同じく短い段が上・右寄せ */
  .space.flip .grid-h{flex-direction:column-reverse;align-items:flex-end}
  /* 位置指定モード：列が row / off を持つエリア。1マス幅のトラックを並べた grid で、
     列は grid-column: off+1 / span h に置く。同じ off の列が必ず縦に揃う。
     flex とマージンで組むと .hrow の枠と gap が先行列の本数だけ積み上がり、
     同じ off の列が13pxずれた（軒下①のマス22とマス20）。
     列の実幅はトラックより約8px広く右へはみ出すが、空きマス1つ（32px）より
     小さいので隣とはぶつからない。
     flip のエリアは列位置を JS で反転して入れるので、CSS 側の反転は要らない。
     空き行のクラスが .hgap なのは、グローバルの .empty（padding:26px）に
     当たると 30px のはずが 52px になり、色とセンタリングまで拾うため */
  .grid-h.pos{display:grid;grid-auto-rows:auto;gap:5px 0;justify-content:start}
  .space.flip .grid-h.pos{align-items:stretch}
  .hgap{height:var(--cell)}
```

**列方向の gap は 0 にする。** 5px 入れるとトラック幅（`cell + 2px`）に gap が積み上がり、
`span h` の幅が列の実幅と合わなくなる（cell 30px・h=8 で 291px 対 264px）。
行方向の 5px だけ残す。

`.space.flip .grid-h` の `align-items:flex-end` は grid でも効いてしまうので、
`.pos` では `stretch` に戻す。`flex-direction:column-reverse` のほうは
`display:grid` では無視されるので放っておいてよい。

- [ ] **Step 3: `drawZone()` に位置指定モードを足す**

`files/index.html:1573` の `drawZone()` の中、`sp.cols.forEach((col,ci)=>{ ... });` の
ループから `wrap.innerHTML=` までを差し替える。

変更前:

```js
    let lines="";
    const grouping = sp.block>0 && sp.block<sp.cols.length;
    let nonAisleSeen=0;
    sp.cols.forEach((col,ci)=>{
      const blockStart = grouping && !col.aisle && nonAisleSeen>0 && (nonAisleSeen % sp.block===0);
      if(!col.aisle) nonAisleSeen++;
      const arr=cellsOf(col);
      let cells="";
      arr.forEach(a=>{
        const filled=a.id!=null;
        const bg=filled?colorOf[a.id]:"";
        const cls=["cell"];
        if(!filled&&col.aisle)cls.push("aisle-empty");
        if(a.seg)cls.push(horizontal?"segline-h":"segline");
        // ロットコードは 1111-2222 のように長いことがあり 30px のマスに入らない。
        // 凡例と同じ通し番号を出す。id は readLots() が付ける0始まりの連番。
        const label=filled?String(a.id+1):"";
        cells+=`<div class="${cls.join(' ')}" data-row="${a.row}"${filled?` data-lot="${a.id}"`:""}`
              +` style="${bg?'background:'+bg:''}">${label}</div>`;
      });
      const inner = horizontal ? `<div class="hrow">${cells}</div>` : `<div class="col${topAlign?' top':''}">${cells}</div>`;
      const cap = `<div class="colcap">${used(col)}/${col.h}${col.aisle?' 通':''}</div>`;
      const editCls = editMode? " editable":"";
      const gapCls = blockStart? " blockgap":"";
      lines+=`<div class="colwrap${col.aisle?' aisle':''}${editCls}${gapCls}" data-space="${sp.name}" data-col="${ci}">${inner}${cap}</div>`;
    });
    wrap.innerHTML=`<div class="name">${sp.name}</div><div class="${horizontal?'grid-h':'grid'}${topAlign?' top':''}">${lines}</div>`;
```

変更後:

```js
    // 列が row を持つエリアは「位置指定モード」。1マス幅のトラックを並べた grid に
    // grid-column: off+1 / span h で置く。列が 1 つも無い row が通路の空き行になる。
    // 位置指定モードでは block による隙間（blockgap）は使わない。
    // 隙間は off が決めるので、二重に空けると実形からずれる。
    const positioned = horizontal && sp.cols.some(c=>Number.isFinite(c.row));
    const grouping = !positioned && sp.block>0 && sp.block<sp.cols.length;
    // エリアの幅（マス数）。flip のとき列位置を反転するのに使う
    const width = positioned
      ? Math.max(...sp.cols.map(c=>(Number.isFinite(c.off)?c.off:0)+c.h))
      : 0;
    let nonAisleSeen=0;
    // 1 列ぶんの HTML を作る。blockStart は位置指定モードでは常に false。
    // place は位置指定モードのときだけ渡す grid-area の指定
    const colHtml=(col,ci,blockStart,place)=>{
      const arr=cellsOf(col);
      let cells="";
      arr.forEach(a=>{
        const filled=a.id!=null;
        const bg=filled?colorOf[a.id]:"";
        const cls=["cell"];
        if(!filled&&col.aisle)cls.push("aisle-empty");
        if(a.seg)cls.push(horizontal?"segline-h":"segline");
        // ロットコードは 1111-2222 のように長いことがあり 30px のマスに入らない。
        // 凡例と同じ通し番号を出す。id は readLots() が付ける0始まりの連番。
        const label=filled?String(a.id+1):"";
        cells+=`<div class="${cls.join(' ')}" data-row="${a.row}"${filled?` data-lot="${a.id}"`:""}`
              +` style="${bg?'background:'+bg:''}">${label}</div>`;
      });
      const inner = horizontal ? `<div class="hrow">${cells}</div>` : `<div class="col${topAlign?' top':''}">${cells}</div>`;
      const cap = `<div class="colcap">${used(col)}/${col.h}${col.aisle?' 通':''}</div>`;
      const editCls = editMode? " editable":"";
      const gapCls = blockStart? " blockgap":"";
      const style = place ? ` style="${place}"` : "";
      return `<div class="colwrap${col.aisle?' aisle':''}${editCls}${gapCls}"`
           + ` data-space="${sp.name}" data-col="${ci}"${style}>${inner}${cap}</div>`;
    };
    let lines="";
    if(positioned){
      const rowsUsed=new Set();
      let maxRow=0;
      sp.cols.forEach(c=>{
        const r=Number.isFinite(c.row)?c.row:0;
        rowsUsed.add(r);
        if(r>maxRow) maxRow=r;
      });
      sp.cols.forEach((col,ci)=>{
        const r=Number.isFinite(col.row)?col.row:0;
        const off=Number.isFinite(col.off)?col.off:0;
        // flip のエリアは右起点。off を右からのオフセットとして読み替える
        const start = (pos && pos.flip) ? (width-off-col.h) : off;
        lines+=colHtml(col, ci, false,
          `grid-row:${r+1};grid-column:${start+1} / span ${col.h}`);
      });
      // 列が 1 つも無い row を 1 マス分の高さで埋める。これが通路の隙間になる
      for(let r=0;r<=maxRow;r++){
        if(rowsUsed.has(r)) continue;
        lines+=`<div class="hgap" style="grid-row:${r+1};grid-column:1 / span ${width}"></div>`;
      }
    }else{
      sp.cols.forEach((col,ci)=>{
        const blockStart = grouping && !col.aisle && nonAisleSeen>0 && (nonAisleSeen % sp.block===0);
        if(!col.aisle) nonAisleSeen++;
        lines+=colHtml(col, ci, blockStart, "");
      });
    }
    const gridCls = horizontal ? ("grid-h"+(positioned?" pos":"")) : "grid";
    // トラックは 1 マス幅（マス幅＋マス間の 2px）。列は span h で載る
    const gridStyle = positioned
      ? ` style="grid-template-columns:repeat(${width}, calc(var(--cell) + 2px))"`
      : "";
    wrap.innerHTML=`<div class="name">${sp.name}</div>`
      +`<div class="${gridCls}${topAlign?' top':''}"${gridStyle}>${lines}</div>`;
```

- [ ] **Step 4: Step 1 の検証を走らせて通ることを確認する**

Service Worker とキャッシュを落としてリロードしてから、Step 1 と同じスクリプトを実行する。

期待: **PASS** — `ok: true`、`hasPos: true`、`cols: 3`、`gaps: 1`、
`gapHeight` が 30 前後（`.empty` を拾っていれば 52 になる）。

- [ ] **Step 5: 同じ `off` の列が縦に揃うことを確認する**

`/dig` が実測で見つけた、flex とマージンでは 13px ずれた条件をそのまま再現する。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    // 実際の軒下①と同じ形。col2（20-21）と col3（22-24）はどちらも off:9
    SPACES[1].cols = [{h:8, row:4, off:0}, {h:11, row:3, off:0}, {h:2, row:4, off:9},
                      {h:3, row:0, off:9}, {h:11, row:2, off:0}];
    run(false);
    const wrap = [...document.querySelectorAll("#zone-far .space")]
      .find(w => w.querySelector(".name").textContent === "軒下①");
    const cw = i => wrap.querySelector(`.colwrap[data-col="${i}"]`).getBoundingClientRect();
    const base = wrap.querySelector(".grid-h").getBoundingClientRect().left;
    const x2 = Math.round(cw(2).left - base);
    const x3 = Math.round(cw(3).left - base);
    const x0 = Math.round(cw(0).left - base);
    const x1 = Math.round(cw(1).left - base);
    return {
      ok: x2 === x3 && x0 === 0 && x1 === 0 && x2 > 0,
      off9a: x2, off9b: x3, off0a: x0, off0b: x1,
      diff: Math.abs(x2 - x3)
    };
  } finally {
    SPACES = before;
    run(false);
  }
})()
```

期待: `ok: true`、`diff: 0`。`off9a` と `off9b` が同じ値（`off:9` なので
`9 × (cell + 2)` ＝ cell 30px のとき 288 前後）。`off0a` / `off0b` はどちらも 0。

**`diff` が 0 でなければ次に進まない。** ここがずれると、実測 Excel で同じ列にある
マス 22 とマス 20 が縦に揃わず、§10-3 の目視確認が成立しない。

- [ ] **Step 6: `flip` のエリアで `off` が右起点になることを確認する**

既定値では `flip` のエリア（PC横）は `off` を持たないので、この経路は
検証しないと未実行のまま出荷される。一時的に `off` を与えて確かめる。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    // PC横（FLOOR_POS で flip:true）。幅 8、row0 は右から 2 マス目から 4 マス
    const pc = SPACES.findIndex(s => s.name === "PC横");
    SPACES[pc].cols = [{h:4, row:0, off:2}, {h:8, row:2, off:0}];
    run(false);
    const wrap = [...document.querySelectorAll("#zone-near .space")]
      .find(w => w.querySelector(".name").textContent === "PC横");
    const grid = wrap.querySelector(".grid-h");
    const gs = i => grid.querySelector(`.colwrap[data-col="${i}"]`).style.gridColumn;
    return {
      // width = max(off+h) = max(2+4, 0+8) = 8
      // col0 は flip なので start = 8 - 2 - 4 = 2 → grid-column: 3 / span 4
      // col1 は start = 8 - 0 - 8 = 0 → grid-column: 1 / span 8
      ok: gs(0).replace(/\s/g, "") === "3/span4"
       && gs(1).replace(/\s/g, "") === "1/span8",
      col0: gs(0), col1: gs(1)
    };
  } finally {
    SPACES = before;
    run(false);
  }
})()
```

期待: `ok: true`。`col0: "3 / span 4"`、`col1: "1 / span 8"`。
`off:2` が**右から** 2 マス目として効いている（左起点なら `3 / span 4` にはならない）。

- [ ] **Step 7: 手動移動のドロップ先判定が壊れていないことを確認する**

位置指定モードでも `colwrap` の `data-space` / `data-col` は従来どおり付く必要がある。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  const before = JSON.parse(JSON.stringify(SPACES));
  try{
    SPACES[1].cols = [{h:8, row:0, off:0}, {h:2, row:0, off:9}, {h:11, row:1, off:0},
                      {h:3, row:2, off:9}, {h:6, row:3, off:0}];
    run(false);
    const wrap = [...document.querySelectorAll("#zone-far .space")]
      .find(w => w.querySelector(".name").textContent === "軒下①");
    const cws = [...wrap.querySelectorAll(".colwrap")];
    const idx = cws.map(w => w.dataset.col).sort((a,b)=>a-b).join(",");
    const spaces = new Set(cws.map(w => w.dataset.space));
    return {
      ok: cws.length === 5 && idx === "0,1,2,3,4"
       && spaces.size === 1 && spaces.has("軒下①"),
      count: cws.length, idx, spaces: [...spaces]
    };
  } finally {
    SPACES = before;
    run(false);
  }
})()
```

期待: `ok: true`。`count: 5`、`idx: "0,1,2,3,4"`、`spaces: ["軒下①"]`。
`data-col` が `sp.cols` の元のインデックスであること（描画順ではない）が要点。

- [ ] **Step 8: 既存エリアの描画が変わっていないことを確認する**

`DEFAULT_SPACES` はまだ `row` を持たないので、すべてのエリアが従来モードのままのはず。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  run(false);
  const posGrids = document.querySelectorAll("#zone-far .grid-h.pos, #zone-near .grid-h.pos");
  const gaps = document.querySelectorAll("#zone-near .colwrap.blockgap");
  const main = [...document.querySelectorAll("#zone-near .space")]
    .find(w => w.querySelector(".name").textContent === "メイン");
  return {
    ok: posGrids.length === 0 && gaps.length === 2
     && main.querySelectorAll(".colwrap").length === 11,
    posGrids: posGrids.length, blockgaps: gaps.length,
    mainCols: main.querySelectorAll(".colwrap").length
  };
})()
```

期待: `ok: true`。`posGrids: 0`、`blockgaps: 2`（メインの 3 列ごとの隙間）、
`mainCols: 11`。

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "feat: ブロック図に列の位置指定モードを足す

row を持つ列があるエリアを 1 マス幅トラックの grid で描く。
列は grid-column: off+1 / span h に載り、列が 1 つも無い row が
通路の空き行になる。

flex とマージンで組むと .hrow の枠と gap が先行列の本数だけ積み上がり、
同じ off の列が 13px ずれた（軒下①のマス 22 とマス 20 は実測の Excel で
同じ列にあり、縦に揃うべきもの）。grid なら同じ off は必ず同じトラックから
始まる。列の実幅がトラックより約 8px 広く右へはみ出すが、空きマス 1 つの
幅より小さいので隣とはぶつからない。

空き行のクラスは .hgap。.empty はグローバル定義（padding:26px）に
当たって高さが倍になる。

data-space / data-col は従来どおり付くので、手動移動のドロップ先
判定は変わらない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: `DEFAULT_SPACES` の更新

**Files:**
- Modify: `files/index.html` — `DEFAULT_SPACES`（`files/index.html:500` 付近）、`FLOOR_POS`（`files/index.html:519` 付近）、`SPACES_SAVE_VERSION`（`files/index.html:581` 付近）、`initSpaces()`（`files/index.html:2616` 付近）

**Interfaces:**
- Consumes: Task 1 の `row`/`off` の配管、Task 2 の位置指定モード
- Produces: 7 エリア・全容量 161P の既定値。`SPACES_SAVE_VERSION === 2`。
  バージョン不一致のときだけ出る専用の案内文

- [ ] **Step 1: 失敗する検証を書いて走らせる**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  const cap = n => {
    const s = SPACES.find(x => x.name === n);
    return s ? s.cols.reduce((a,c)=>a+c.h, 0) : null;
  };
  const total = SPACES.reduce((a,s)=>a+s.cols.reduce((x,c)=>x+c.h,0), 0);
  return {
    ok: SPACES.length === 7 && total === 161 && SPACES_SAVE_VERSION === 2
     && cap("軒下①") === 35 && cap("5棟壁際") === 18 && cap("出庫口横") === 4,
    names: SPACES.map(s=>s.name).join(","),
    total, ver: SPACES_SAVE_VERSION,
    nokishita1: cap("軒下①"), kabe: cap("5棟壁際"), deko: cap("出庫口横")
  };
})()
```

期待: **FAIL** — `ok: false`。`names` が `"メイン,軒下①,軒下②,PC横,EV横"`、
`total: 134`、`ver: 1`、`kabe: null`、`deko: null`。

- [ ] **Step 2: `DEFAULT_SPACES` を差し替える**

`files/index.html:500` 付近。コメントも含めて差し替える。

変更前:

```js
const DEFAULT_SPACES = [
  // 配列の順＝自動配置でエリアを試す順（メイン ＞ 軒下 ＞ PC横・EV横）。
  // 配置図の表では、下段の先頭にあたるエリアが基準になる（注釈を付けない・グリッドを描く）。
  // zone はブロック図の倉庫内／外の並べ分けにだけ使う。
  // sheet は配置図の表のどのブロックに欄を書くか（top＝上段 / bottom＝下段 / over＝あふれブロック）。
  {name:"メイン", zone:"near", orient:"v", block:3, align:"top", sheet:"bottom", cols:[
     {h:6,aisle:true},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:5,aisle:true}]},
  {name:"軒下①", zone:"far", orient:"h", block:99, sheet:"top", cols:[{h:11},{h:11},{h:8}]},
  {name:"軒下②", zone:"far", orient:"v", block:99, sheet:"top", cols:[{h:4},{h:4}]},
  {name:"PC横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[{h:8},{h:4}]},
  {name:"EV横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[{h:6},{h:4}]},
];
```

変更後:

```js
const DEFAULT_SPACES = [
  // 配列の順＝自動配置でエリアを試す順（倉庫内のメイン ＞ 軒下 ＞ PC横・EV横 ＞ あふれ受け）。
  // 配置図の表では、上段・下段それぞれの先頭にあたるエリアが基準になる
  // （注釈を付けない。下段の基準はグリッドも描く）。
  // zone はブロック図の倉庫内／外の並べ分けにだけ使う。
  // sheet は配置図の表のどのブロックに欄を書くか（top＝上段 / bottom＝下段 / over＝あふれブロック）。
  // row / off は描画専用（row＝ブロック図の何行目、off＝行内の何マス目から）。
  // 2026-08-30 の現場実測（配置図の表/配置マス.xlsx）に合わせてある。
  // 省略した列は「順に積む・左端から」の意味になる。
  {name:"メイン", zone:"near", orient:"v", block:3, align:"top", sheet:"bottom", cols:[
     {h:6,aisle:true},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:5,aisle:true}]},
  // 軒下①：現場で振った番号がそのまま配置順。列はどれも柱をまたがない
  {name:"軒下①", zone:"far", orient:"h", block:99, sheet:"top", cols:[
     {h:8,  row:4, off:0},    // 1-8
     {h:11, row:3, off:0},    // 9-19
     {h:2,  row:4, off:9},    // 20-21（1-8 との間に柱 1 マス）
     {h:3,  row:0, off:9},    // 22-24
     {h:11, row:2, off:0}]},  // 25-35　※ row1 は通路の空き行
  {name:"軒下②", zone:"far", orient:"h", block:99, sheet:"top", cols:[{h:4},{h:4}]},
  // PC横：1-4 と 5-12 の間の row1 が通路。flip なので行の中は右起点
  {name:"PC横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[
     {h:4, row:0},            // 1-4
     {h:8, row:2}]},          // 5-12　※ row1 は通路の空き行
  // EV横：L 字なので列を分ける。5 と 6 は直角の位置関係で、連続しては置けない
  {name:"EV横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[
     {h:5, row:2, off:0},     // 1-5
     {h:1, row:3, off:4},     // 6
     {h:2, row:1, off:6},     // 7-8
     {h:2, row:0, off:6}]},   // 9-10
  // あふれ受け。普段はここまで来ない
  {name:"出庫口横", zone:"far", orient:"h", block:99, sheet:"top", cols:[{h:2},{h:2}]},
  {name:"5棟壁際", zone:"far", orient:"h", block:99, sheet:"top", cols:[{h:6},{h:6},{h:6}]},
];
```

- [ ] **Step 3: `FLOOR_POS` を差し替える**

`files/index.html:515` 付近。コメントも含めて差し替える。

変更前:

```js
// 実際の倉庫の位置関係（ブロック図の並び）。列・行はフロア図のマス目
//   倉庫外: 軒下②＝左 ／ 軒下①＝右
//   倉庫内: メイン＝右上 ／ PC横＝左下 ／ EV横＝右下
// flip＝実際の図と同じく短い段を上・右寄せにする
const FLOOR_POS = {
  "軒下②":{c:1,r:1}, "軒下①":{c:2,r:1},
  "メイン":{c:2,r:1}, "PC横":{c:1,r:2,flip:true}, "EV横":{c:2,r:2,flip:true},
};
```

変更後:

```js
// 実際の倉庫の位置関係（ブロック図の並び）。列・行はフロア図のマス目
//   倉庫外: 5棟壁際＝右上 ／ 下の行は左から 軒下②・出庫口横・軒下①
//   倉庫内: メイン＝右上 ／ PC横＝左下 ／ EV横＝右下
// 倉庫外と倉庫内は別コンテナ（#zone-far / #zone-near）に描くので c/r が重なってよい。
// flip＝実際の図と同じく右寄せにする。位置指定モードのエリアでは
// 行の中の並びが右起点になり、off も右からのオフセットとして効く。
// EV横は実測では 1 が左端なので flip を付けない（以前の flip:true は誤りだった）。
const FLOOR_POS = {
  "5棟壁際":{c:3,r:1},
  "軒下②":{c:1,r:2}, "出庫口横":{c:2,r:2}, "軒下①":{c:3,r:2},
  "メイン":{c:2,r:1}, "PC横":{c:1,r:2,flip:true}, "EV横":{c:2,r:2},
};
```

- [ ] **Step 4: `SPACES_SAVE_VERSION` を上げる**

`files/index.html:581` 付近。

変更前:

```js
const SPACES_SAVE_VERSION = 1;
```

変更後:

```js
const SPACES_SAVE_VERSION = 2;
```

- [ ] **Step 5: バージョン不一致に専用の案内文を出す**

バージョンを上げると既存の端末はすべて `initSpaces()` の破棄パスに入り、
「保存されていた設定を読み込めなかったので、初期値に戻しました。」が出る。
壊れていたのではなく既定値を意図的に更新しただけなので、この文言は誤解を招く。
手動調整も `restoreManual()` が指紋不一致で無言に捨てるので、あわせて知らせる。

`files/index.html:2616` 付近。

変更前:

```js
(function initSpaces(){
  const d=loadData(STORE_KEY.spaces);
  if(!d) return;
  if(d.v!==SPACES_SAVE_VERSION || !validSpaces(d.spaces)){
    saveData(STORE_KEY.spaces, null);
    showCfgNote("保存されていた設定を読み込めなかったので、初期値に戻しました。");
    return;
  }
  SPACES=normalizeSpaces(d.spaces);
})();
```

変更後:

```js
(function initSpaces(){
  const d=loadData(STORE_KEY.spaces);
  if(!d) return;
  // バージョン不一致は「壊れていた」のではなく、こちらが既定値を更新した合図。
  // 同じ文言にすると利用者は自分の設定が壊れたと読む。手動調整も
  // restoreManual() が指紋不一致で無言に捨てるので、ここで一緒に知らせる
  if(d.v!==SPACES_SAVE_VERSION){
    saveData(STORE_KEY.spaces, null);
    clearManual();
    showCfgNote("配置マスを現場の実測に合わせて更新したので、スペース設定と手動調整を初期値に戻しました。");
    return;
  }
  if(!validSpaces(d.spaces)){
    saveData(STORE_KEY.spaces, null);
    showCfgNote("保存されていた設定を読み込めなかったので、初期値に戻しました。");
    return;
  }
  SPACES=normalizeSpaces(d.spaces);
})();
```

`clearManual()` と `showCfgNote()` はどちらも関数宣言なので、
この位置より後ろに書かれていても巻き上げで呼べる。

- [ ] **Step 6: Step 1 の検証を走らせて通ることを確認する**

Service Worker とキャッシュを落としてリロードしてから、Step 1 と同じスクリプトを実行する。

期待: **PASS** — `ok: true`。
`names: "メイン,軒下①,軒下②,PC横,EV横,出庫口横,5棟壁際"`、`total: 161`、`ver: 2`、
`nokishita1: 35`、`kabe: 18`、`deko: 4`。

- [ ] **Step 7: ブロック図が実形で描かれることを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  run(false);
  const pick = (zone, name) => [...document.querySelectorAll(zone + " .space")]
    .find(w => w.querySelector(".name").textContent === name);
  // grid-row ごとに、その行にある列のマス数を並べる。空き行は "-"
  const shape = w => {
    const grid = w.querySelector(".grid-h");
    const rows = {};
    let max = 0;
    grid.querySelectorAll(".colwrap").forEach(c => {
      const r = parseInt(c.style.gridRow) || 1;
      (rows[r] = rows[r] || []).push({
        start: parseInt(c.style.gridColumn) || 1,
        n: c.querySelectorAll(".cell").length
      });
      if(r > max) max = r;
    });
    const out = [];
    for(let r = 1; r <= max; r++){
      if(!rows[r]){ out.push("-"); continue; }
      rows[r].sort((a,b) => a.start - b.start);
      out.push(rows[r].map(x => x.n).join("+"));
    }
    return out.join(" / ");
  };
  const n1 = pick("#zone-far", "軒下①");
  const pc = pick("#zone-near", "PC横");
  const ev = pick("#zone-near", "EV横");
  const n2 = pick("#zone-far", "軒下②");
  const kb = pick("#zone-far", "5棟壁際");
  const dk = pick("#zone-far", "出庫口横");
  return {
    ok: shape(n1) === "3 / - / 11 / 11 / 8+2"
     && shape(pc) === "4 / - / 8"
     && shape(ev) === "2 / 2 / 5 / 1"
     && n2.querySelectorAll(".hrow").length === 2
     && kb.querySelectorAll(".hrow").length === 3
     && dk.querySelectorAll(".hrow").length === 2,
    nokishita1: shape(n1), pcYoko: shape(pc), evYoko: shape(ev),
    nokishita2rows: n2.querySelectorAll(".hrow").length,
    kabeRows: kb.querySelectorAll(".hrow").length,
    dekoRows: dk.querySelectorAll(".hrow").length
  };
})()
```

期待: `ok: true`。

- `nokishita1: "3 / - / 11 / 11 / 8+2"` — 22-24 が最上段、次が通路の空き行、
  25-35、9-19、最下段は 1-8 と 20-21 の 2 本
- `pcYoko: "4 / - / 8"` — 1-4、通路の空き行、5-12
- `evYoko: "2 / 2 / 5 / 1"` — 9-10、7-8、1-5、6
- 軒下②・出庫口横は 2 行、5棟壁際は 3 行（どれも位置指定モードではないので `.hrow` で数える）

- [ ] **Step 8: 収容能力の表示が 161P になることを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  const t = document.getElementById("capacity").textContent;
  const nums = (t.match(/(\d+)P/g) || []).map(x => parseInt(x));
  return {ok: nums.reduce((a,b)=>a+b, 0) === 161, text: t, sum: nums.reduce((a,b)=>a+b, 0)};
})()
```

期待: `ok: true`、`sum: 161`。
`text` は「倉庫内: 通常**85P**＋通路11P ／ 倉庫外: 通常**65P**＋通路0P」。

`showCapacity()` は zone ごとの合計を出す。倉庫内はメイン 63 ＋ PC横 12 ＋ EV横 10 = 85
（メイン単独の 63 ではない）、倉庫外は 軒下① 35 ＋ 軒下② 8 ＋ 出庫口横 4 ＋ 5棟壁際 18 = 65。
`ok` は合計しか見ないので、内訳が違っていても素通りする。**テキストも目で確かめること。**

- [ ] **Step 9: 設定テキストが 7 行で、`row`/`off` を含まないことを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  const t = document.getElementById("cfgText").value;
  const lines = t.split("\n");
  return {
    ok: lines.length === 7
     && lines.every(l => l.split("|").length === 6)
     && !/row|off|@/.test(t),
    count: lines.length, lines
  };
})()
```

期待: `ok: true`、`count: 7`。各行が 6 項目。

- [ ] **Step 10: リロードで形が保たれることを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  // 高さだけ変えて保存させる（列数は変えないので row/off は引き継がれる）
  const lines = document.getElementById("cfgText").value.split("\n");
  lines[1] = "軒下① | far | h | 99 | 7,11,2,3,11 | top";
  document.getElementById("cfgText").value = lines.join("\n");
  applyConfig();
  const saved = loadData(STORE_KEY.spaces);
  const col0 = saved.spaces[1].cols[0];
  return {
    ok: col0.h === 7 && col0.row === 4 && col0.off === 0
     && validSpaces(saved.spaces) === true,
    col0, valid: validSpaces(saved.spaces)
  };
})()
```

期待: `ok: true`。`col0` が `{h:7, aisle:false, row:4, off:0}`。

続けて `location.reload()` してから:

```js
(() => {
  const c = SPACES[1].cols[0];
  const note = document.getElementById("cfgNote");
  return {
    // #cfgNote は hidden 属性で開閉する。style.display は常に空なので見ない
    ok: c.h === 7 && c.row === 4 && c.off === 0 && note.hidden === true,
    col0: c, noteHidden: note.hidden, noteText: note.textContent
  };
})()
```

期待: `ok: true`、`noteHidden: true`、`noteText: ""`。
復元後も `row`/`off` が残り、案内が出ていない。

- [ ] **Step 11: v1 の保存を持つ端末が通る道を確認する**

既存の端末はすべてこの経路を通る。バージョン不一致で設定と手動調整が捨てられ、
専用の案内文が出ること、そのあと新しい既定値で動くことを見る。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  run(false);
  // 改修前の端末を再現する。v1 の設定（旧 5 エリア）と、旧い指紋の手動保存
  saveData(STORE_KEY.spaces, {v:1, spaces:[
    {name:"メイン", zone:"near", orient:"v", block:3, align:"top", sheet:"bottom",
     cols:[{h:6,aisle:true},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:5,aisle:true}]},
    {name:"軒下①", zone:"far", orient:"h", block:99, sheet:"top", cols:[{h:11},{h:11},{h:8}]},
    {name:"軒下②", zone:"far", orient:"v", block:99, sheet:"top", cols:[{h:4},{h:4}]},
    {name:"PC横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[{h:8},{h:4}]},
    {name:"EV横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[{h:6},{h:4}]}
  ]});
  const d = loadData(STORE_KEY.manual) || {sp: lastSp, lots: lastLots};
  saveData(STORE_KEY.manual, {sp: d.sp, lots: d.lots, fp: "old-fingerprint-before-survey"});
  return {spacesSaved: loadData(STORE_KEY.spaces).v, manualSaved: !!loadData(STORE_KEY.manual)};
})()
```

期待: `spacesSaved: 1`、`manualSaved: true`。

続けて `location.reload()` を実行し、少し待ってから:

```js
(() => {
  const note = document.getElementById("cfgNote");
  return {
    ok: note.hidden === false
     && note.textContent.includes("配置マスを現場の実測に合わせて更新した")
     && !note.textContent.includes("読み込めなかった")
     && SPACES.length === 7
     && loadData(STORE_KEY.spaces) === null
     && loadData(STORE_KEY.manual) === null,
    noteHidden: note.hidden,
    noteText: note.textContent,
    areas: SPACES.length,
    spacesLeft: loadData(STORE_KEY.spaces),
    manualLeft: loadData(STORE_KEY.manual)
  };
})()
```

期待: `ok: true`。
`noteText` が「配置マスを現場の実測に合わせて更新したので、スペース設定と
手動調整を初期値に戻しました。」で、「読み込めなかった」を含まない。
`areas: 7`、`spacesLeft: null`、`manualLeft: null`。

- [ ] **Step 12: 壊れた保存では従来の文言が出ることを確認する**

Step 5 で分岐を 2 つに割ったので、壊れた保存のほうの経路も見る。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  // バージョンは合っているが中身が壊れている
  saveData(STORE_KEY.spaces, {v: SPACES_SAVE_VERSION, spaces: [{name:"", cols:[]}]});
  return {saved: loadData(STORE_KEY.spaces).v};
})()
```

続けて `location.reload()` を実行し、少し待ってから:

```js
(() => {
  const note = document.getElementById("cfgNote");
  return {
    ok: note.hidden === false
     && note.textContent.includes("読み込めなかった")
     && SPACES.length === 7,
    noteText: note.textContent, areas: SPACES.length
  };
})()
```

期待: `ok: true`。従来どおり「保存されていた設定を読み込めなかったので、
初期値に戻しました。」が出る。

- [ ] **Step 13: 後始末**

`javascript_tool` で実行:

```js
(() => { window.alert = () => {}; resetConfig(); clearManual(); run(false);
         return {names: SPACES.map(s=>s.name).join(",")}; })()
```

期待: `names: "メイン,軒下①,軒下②,PC横,EV横,出庫口横,5棟壁際"`。

- [ ] **Step 14: コミット**

```bash
git add files/index.html
git commit -m "feat: 現場実測の配置スペースを既定値に反映する

2026-08-30 の洗い出し（配置図の表/配置マス.xlsx）どおりに直した。

- 軒下① 30 → 35 マス。列は現場で振った配置順 [8,11,2,3,11]
- 5棟壁際(18) と 出庫口横(4) を追加。自動配置の最後に置くあふれ受け
- 軒下②の向きが逆だったので v → h に直す
- EV横の flip:true は実測と食い違うので外し、L字に合わせて列を分けた
- PC横は列の順を配置順に入れ替えた

全容量 134P → 161P。既定値が変わったので SPACES_SAVE_VERSION を 2 に
上げ、古い保存を捨てて新しい既定値が既存の端末に届くようにした。

あわせて initSpaces() の分岐を「バージョン不一致」と「保存が壊れている」に
割った。前者は壊れていたのではなくこちらが既定値を更新した合図なので、
同じ文言を出すと利用者は自分の設定が壊れたと読む。手動調整も
restoreManual() が無言に捨てるため、案内文に含めた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 4: 配置表の上段に注釈を出す

**Files:**
- Modify: `files/index.html` — `renderSheet()`（`files/index.html:2341` 付近）、`renderResult()` の `overTop`（`files/index.html:1480`）、印刷 CSS の `zoom`（`files/index.html:294`）

**Interfaces:**
- Consumes: Task 3 の `DEFAULT_SPACES`（上段が倉庫外 4 エリアになっている）
- Produces: 配置表が 9 行になり、上段の欄に `※エリア名` が付く。上段の基準は `sheetAreas("top")[0]`。印刷の `zoom` が 1.4

- [ ] **Step 1: 失敗する検証を書いて走らせる**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  run(false);
  switchTab("sheet");
  const table = document.querySelector("#sheetView .sheet table");
  const noteRows = table.querySelectorAll("tr.note-row");
  // 上段の注釈行は先頭から数えて 5 行目（月日 / 曜日 / ロット / パレット数 / 注釈）
  const topNote = table.rows[4];
  return {
    ok: noteRows.length === 2
     && topNote.classList.contains("note-row")
     && [...topNote.cells].reduce((a,c)=>a+(c.colSpan||1), 0) === 14,
    noteRowCount: noteRows.length,
    row4Class: topNote.className,
    row4Cols: [...topNote.cells].reduce((a,c)=>a+(c.colSpan||1), 0)
  };
})()
```

期待: **FAIL** — `ok: false`、`noteRowCount: 1`（下段のぶんだけ）。

- [ ] **Step 2: 上段の基準エリアを設定する**

`files/index.html:2347` 付近。

変更前:

```js
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  const top=sheetEntries(topAreas, null);
  const bottom=sheetEntries(bottomAreas, bottomAreas[0]||null);
```

変更後:

```js
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  // 上段も下段と同じ流儀にする。先頭のエリアが基準で、そこに置かれたロットには
  // 注釈を付けない。上段が軒下だけだったころは見出し「軒下」で足りていたが、
  // 掲載先が可変になり、上段に移したエリアのロットが紙のどこにあるか
  // 分からなくなっていた
  const top=sheetEntries(topAreas, topAreas[0]||null);
  const bottom=sheetEntries(bottomAreas, bottomAreas[0]||null);
```

- [ ] **Step 3: 上段の注釈行を足す**

`files/index.html:2380` 付近。

変更前:

```js
  // 行4：上段のパレット数（左5列は上の行の rowspan で埋まっている）
  rows+=`<tr class="r3">${E}${slotCells(top,SHEET_TOP_SLOTS,"pallet")}</tr>`;

  // 上下段の区切り（用紙では太罫1本）
  rows+=`<tr class="gap"><td class="none sep" colspan="14"></td></tr>`;
```

変更後:

```js
  // 行4：上段のパレット数（左5列は上の行の rowspan で埋まっている）
  rows+=`<tr class="r3">${E}${slotCells(top,SHEET_TOP_SLOTS,"pallet")}</tr>`;

  // 行5：上段の注釈。行3 の rowspan は行4 までしか届かないので、
  //      左5列はこの行で自分で埋める（5 + 1 + 4×2 = 14 列）
  rows+=`<tr class="note-row"><td class="none" colspan="5"></td>${E}`
      + `${slotCells(top,SHEET_TOP_SLOTS,"note")}</tr>`;

  // 上下段の区切り（用紙では太罫1本）
  rows+=`<tr class="gap"><td class="none sep" colspan="14"></td></tr>`;
```

- [ ] **Step 4: 欄数超過の警告も基準エリアを揃える**

`files/index.html:1480`。`length` しか使わないので動作は変わらないが、
揃えておかないと `renderSheet()` と別の基準を持つことになり、あとで意味がずれる。

変更前:

```js
  const overTop=sheetEntries(topAreas,null).length-SHEET_TOP_SLOTS;
```

変更後:

```js
  const overTop=sheetEntries(topAreas, topAreas[0]||null).length-SHEET_TOP_SLOTS;
```

- [ ] **Step 5: 印刷の `zoom` を 1.4 に下げる**

注釈行は**空でも 26px** 増える（`td.snote` の height 24px に罫線と padding が付く）。
実測値は次のとおりで、`zoom:1.5` のままだと 1 ページに収まらない。

| | 表の高さ | zoom 1.5 での印刷時 | A4 横（余白 8mm）＝733.2px に対して |
|---|---|---|---|
| 現行 | 468.1px | 702.1px | 95.8% |
| 注釈行あり（注釈が空でも） | 494.1px | 741.1px | **101.1%** |
| 注釈が 2 行に折り返した場合 | 502.6px | 753.9px | **102.8%** |

`.sheet` は `page-break-inside:avoid` なので、収まらないと 2 ページ目へ丸ごと落ちる。
`※軒下②・出庫口横・5棟壁際` は 96px の欄で 2 行に折り返す（実測 26 → 34.5px）ので、
最も高くなるケースまで見込んで 1.4 にする（96%）。

`files/index.html:291` 付近。コメントも数字を直す。

変更前:

```css
    /* 表は 675×469px 固定。A4横・余白8mm の印刷領域は 281×194mm＝約1062×733px。
       1.5倍で 1012×703px＝268×186mm。用紙の高さを 96% 使い、
       ブラウザごとの余白差で2ページに割れない範囲に収める */
    .sheet{padding:0;overflow:visible;max-width:none;zoom:1.5;page-break-inside:avoid}
```

変更後:

```css
    /* 表は 675×503px 固定（上段の注釈行を足したぶん高くなった。注釈が2行に
       折り返した場合の高さ）。A4横・余白8mm の印刷領域は 281×194mm＝約1062×733px。
       1.4倍で 945×704px＝250×186mm。用紙の高さを 96% 使い、
       ブラウザごとの余白差で2ページに割れない範囲に収める。
       1.5倍のままだと注釈行のぶんで 103% になり、page-break-inside:avoid で
       表ごと2ページ目に落ちる */
    .sheet{padding:0;overflow:visible;max-width:none;zoom:1.4;page-break-inside:avoid}
```

- [ ] **Step 6: Step 1 の検証を走らせて通ることを確認する**

Service Worker とキャッシュを落としてリロードしてから、Step 1 と同じスクリプトを実行する。

期待: **PASS** — `ok: true`、`noteRowCount: 2`、`row4Class` に `note-row` を含む、
`row4Cols: 14`。

- [ ] **Step 7: 実際に注釈が出ることを確認する**

軒下①（上段の基準）を溢れさせて軒下②にも載るロットを作り、
そのロットの欄に `※軒下②` が付くことを見る。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  // 軒下① を 1 列 1 マスまで縮めて、軒下② に必ず流れるようにする
  const lines = document.getElementById("cfgText").value.split("\n");
  lines[0] = "メイン | near | v | 3 | 1 | bottom";
  lines[1] = "軒下① | far | h | 99 | 1 | top";
  document.getElementById("cfgText").value = lines.join("\n");
  applyConfig();
  run(false);
  switchTab("sheet");
  const table = document.querySelector("#sheetView .sheet table");
  const topNotes = [...table.rows[4].cells].map(c => c.textContent).filter(Boolean);
  return {
    ok: topNotes.some(t => t.includes("※軒下②")) && !topNotes.some(t => t.includes("※軒下①")),
    topNotes
  };
})()
```

期待: `ok: true`。`topNotes` に `※軒下②` を含む欄があり、`※軒下①` はどこにも無い
（軒下①が基準なので注釈が付かない）。

- [ ] **Step 8: 後始末して引き出し線の本数を確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  resetConfig();
  clearManual();
  run(false);
  switchTab("sheet");
  // drawLeaders() は svg.leaders の中に path を積む。矢じり（transform 付き）は
  // 線ではないので除いて数える
  const leaders = [...document.querySelectorAll("#sheetView .sheet svg.leaders path")]
    .filter(p => !p.getAttribute("transform")).length;
  const table = document.querySelector("#sheetView .sheet table");
  const box = table.getBoundingClientRect();
  return {rows: table.rows.length, leaders, tableHeight: Math.round(box.height)};
})()
```

期待: `leaders` が **Task 0 Step 4 で控えた値と同じ**。引き出し線は下段のパレット数行
`tr.btmp` を起点にしているので、上段に行が増えても本数は変わらない。
本数はその日のロット一覧で決まる（「下段のロットのうちメインにも乗っているもの」の数）ので、
リテラルで比べないこと。

`rows` は Task 0 で控えた値より 1 多い。
`tableHeight` は 26px 前後増える（注釈が 2 行に折り返すと 34px 前後）。

本数が Task 0 の値と一致するまで次に進まない。

- [ ] **Step 8b: 印刷時の高さが用紙に収まることを確認する**

`javascript_tool` で実行:

```js
(() => {
  const sheet = document.querySelector("#sheetView .sheet");
  const h = sheet.querySelector("table").getBoundingClientRect().height;
  const printed = h * 1.4;           // 印刷 CSS の zoom
  const paper = 733.2;               // A4横・余白8mm の印刷領域の高さ(px)
  return {ok: printed / paper < 0.98,
          tableHeight: Math.round(h), printed: Math.round(printed),
          ratio: Math.round(printed / paper * 1000) / 10};
})()
```

期待: `ok: true`、`ratio` が 98 未満（実測の見込みは 96 前後）。
98 を超えるならブラウザごとの余白差で 2 ページに割れうるので、
`zoom` をさらに下げるか行高を削る判断が要る。ユーザーに相談してから進める。

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "fix: 上段に移したエリアのロットの居場所を紙に出す

上段は基準エリアを持たず、注釈行もなかった。上段が軒下①②だけだった
ころは見出し「軒下」で足りていたが、掲載先が可変になったことで、
上段に移したエリアのロットが紙のどこにあるか分からないまま印刷される
状態になっていた。

上段の基準を先頭エリアにして下段と同じ流儀に揃え、行4 の下に上段の
注釈行を 1 行足した。行3 の rowspan は行4 までしか届かないので、
新しい行の左5列は自分で埋めている。

注釈行は空でも 26px 増え、zoom:1.5 のままだと A4横の印刷領域に対して
101%（注釈が2行に折り返すと103%）になる。.sheet は
page-break-inside:avoid なので、収まらないと表ごと2ページ目に落ちる。
印刷の zoom を 1.4 に下げた。

欄数超過の警告の overTop も基準エリアを topAreas[0] に揃えた。
length しか使わないので動作は変わらないが、renderSheet() と別の基準を
持ったままにしない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 5: 通しの確認と新しい基準値の記録

**Files:**
- 変更なし（確認のみ）

**Interfaces:**
- Consumes: Task 0 Step 5 で退避した実データ（Step 8 で書き戻す）
- Produces: 配置表の innerHTML 長の新しい基準値。以降の回帰確認で使う

- [ ] **Step 1: まっさらな状態から通しで確認する**

> **注意:** これはユーザーが実際に使っているのと同じオリジンの `localStorage` を消す。
> 実ロット・品目マスタ・手動調整が入っており、消すと復旧できない。
> **Task 0 Step 5 の退避を済ませてから実行すること。** 退避していない場合はここで戻り、
> 先に退避する。書き戻しは Step 8。

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  // 退避があることを確かめてから消す
  const backup = localStorage.getItem("palletApp.__backup");
  if(!backup) return {aborted: true, reason: "退避が無い。Task 0 Step 5 を先に実行する"};
  Object.values(STORE_KEY).forEach(k => { try{ localStorage.removeItem(k); }catch(e){} });
  return {cleared: true, backupKept: true};
})()
```

期待: `cleared: true`、`backupKept: true`。
`aborted: true` が返ったら先に Task 0 Step 5 を実行する。

続けて `location.reload()` を実行し、少し待ってから:

```js
(() => {
  window.alert = () => {};
  run(false);
  switchTab("sheet");
  const sheet = document.querySelector("#sheetView .sheet");
  // 曜日の丸印は日付で変わるので正規化してから数える
  const len = sheet.innerHTML
    .replace(/<span class="ring">(月|火|水|木|金)<\/span>/g, '$1').length;
  const table = sheet.querySelector("table");
  const posGrids = document.querySelectorAll(".grid-h.pos").length;
  return {
    names: SPACES.map(s=>s.name).join(","),
    ver: SPACES_SAVE_VERSION,
    capacity: document.getElementById("capacity").textContent,
    sheetLen: len,
    sheetRows: table.rows.length,
    noteRows: table.querySelectorAll("tr.note-row").length,
    positionedAreas: posGrids
  };
})()
```

期待:
- `names: "メイン,軒下①,軒下②,PC横,EV横,出庫口横,5棟壁際"`
- `ver: 2`
- `capacity` が「倉庫内: 通常85P＋通路11P ／ 倉庫外: 通常65P＋通路0P」（合計 161P）
- `noteRows: 2`
- `positionedAreas: 3`（軒下①・PC横・EV横）

`sheetLen` は**この実行で得た値を新しい基準値として記録する**。
改修前の 8528 は使えない。

- [ ] **Step 2: 基準値を実行記録に書く**

`.superpowers/sdd/progress.md` に、Step 1 で得た `sheetLen` の値と、
測り方（測定対象は `#sheetView .sheet`、丸印を正規化してから数える）を追記する。
このファイルは `.gitignore` に入っているのでコミットしない。

- [ ] **Step 3: 印刷プレビューが 1 ページに収まることを確認する**

`javascript_tool` で実行:

画面表示では `zoom` は効いていない（印刷 CSS の中にあるため）。
CSSOM から印刷時の値を読んで確かめる。

```js
(() => {
  const sheet = document.querySelector("#sheetView .sheet");
  const h = sheet.querySelector("table").getBoundingClientRect().height;
  // 印刷 CSS の .sheet の zoom を CSSOM から探す
  let printZoom = null;
  for(const ss of document.styleSheets){
    let rules; try{ rules = ss.cssRules; }catch(e){ continue; }
    for(const r of rules){
      if(r.type !== CSSRule.MEDIA_RULE || !r.conditionText.includes("print")) continue;
      for(const ir of r.cssRules){
        if(ir.selectorText === ".sheet" && ir.style.zoom) printZoom = parseFloat(ir.style.zoom);
      }
    }
  }
  const paper = 733.2;   // A4横・余白8mm の印刷領域の高さ(px)
  const printed = h * (printZoom || 1);
  return {
    ok: printZoom === 1.4 && printed / paper < 0.98,
    printZoom,
    breakInside: getComputedStyle(sheet).breakInside || getComputedStyle(sheet).pageBreakInside,
    tableHeight: Math.round(h), printed: Math.round(printed),
    ratio: Math.round(printed / paper * 1000) / 10
  };
})()
```

期待: `ok: true`。`printZoom: 1.4`、`breakInside: "avoid"`、
`ratio` が 98 未満（見込みは 96 前後）。

`ratio` が 98 以上ならブラウザごとの余白差で 2 ページに割れうる。
`zoom` をさらに下げるか行高を削る判断が要るので、ユーザーに相談してから進める。
実際の印刷ダイアログでの確認は Task 6 Step 4。

- [ ] **Step 4: 設定を触ったあとに形が戻ることを確認する**

`javascript_tool` で実行:

```js
(() => {
  window.alert = () => {};
  // 軒下① の列数を変えて位置指定を捨てさせる
  const lines = document.getElementById("cfgText").value.split("\n");
  lines[1] = "軒下① | far | h | 99 | 11,11,8 | top";
  document.getElementById("cfgText").value = lines.join("\n");
  applyConfig();
  const dropped = document.querySelectorAll(".grid-h.pos").length;
  // 初期値に戻す
  resetConfig();
  run(false);
  const restored = document.querySelectorAll(".grid-h.pos").length;
  return {
    ok: dropped === 2 && restored === 3,
    afterColChange: dropped, afterReset: restored
  };
})()
```

期待: `ok: true`。列数を変えた軒下①だけ位置指定が外れて 2 に減り、
リセットで 3 に戻る。

- [ ] **Step 5: 画面を撮って目視する**

`mcp__Claude_Browser__computer` を `{"action": "screenshot"}` で呼び、
配置編集タブのブロック図が実測の形になっていることを見る。

確認する点:
- 倉庫外が 3 列 × 2 行（右上に 5棟壁際、下の行に 軒下②・出庫口横・軒下①）
- 軒下①の 22-24 が右上に離れて置かれ、その下に通路の隙間がある
- 軒下①の最下段が 1-8 と 20-21 に分かれ、間に柱 1 マスぶんの隙間がある
- 軒下①のマス 22 とマス 20 の左端が縦に揃っている
- PC横の 1-4 が右上、EV横が L 字
- 通路の空き行がマス 1 個ぶんの高さ（倍の高さになっていない）

- [ ] **Step 6: 倉庫外の総幅を測る**

エリアが 2 つ増え、`.spaces` が 3 列になるので横に伸びる。
`.scroller` があるので破綻はしないが、実機で扱いに困る幅かどうかを見るために測る。

`javascript_tool` で実行:

```js
(() => {
  const far = document.getElementById("zone-far").getBoundingClientRect();
  const near = document.getElementById("zone-near").getBoundingClientRect();
  return {farWidth: Math.round(far.width), nearWidth: Math.round(near.width),
          cell: getComputedStyle(document.documentElement).getPropertyValue("--cell").trim()};
})()
```

`farWidth` の見込みは 670px 前後（`--cell` の設定による）。
値を控えて Task 6 Step 4 の実機確認に渡す。

- [ ] **Step 7: 欄数超過の警告が出ていないことを確認する**

上段の容量が 38P から 65P に増えた一方、`SHEET_TOP_SLOTS` は 4 のまま。
現在のロットで欄が足りなくなっていないかを見る。

`javascript_tool` で実行:

```js
(() => {
  const msg = document.getElementById("msg").textContent;
  const topAreas = sheetAreas("top"), bottomAreas = sheetAreas("bottom");
  return {
    ok: !msg.includes("載りきらないロット"),
    topEntries: sheetEntries(topAreas, topAreas[0]||null).length,
    bottomEntries: sheetEntries(bottomAreas, bottomAreas[0]||null).length,
    topSlots: SHEET_TOP_SLOTS, bottomSlots: SHEET_BOTTOM_SLOTS,
    msg
  };
})()
```

期待: `ok: true`。`topEntries` が 4 以下、`bottomEntries` が 7 以下。
超えていたら「上下段に 1 列追加」を次回にまわす前提が崩れるので、
ユーザーに報告して判断を仰ぐ。

- [ ] **Step 8: 退避した実データを書き戻す**

Task 0 Step 5 で退避したユーザーの実データを戻す。**これを飛ばさないこと。**

`javascript_tool` で実行:

```js
(() => {
  const raw = localStorage.getItem("palletApp.__backup");
  if(!raw) return {aborted: true, reason: "退避が見つからない"};
  const backup = JSON.parse(raw);
  Object.entries(backup).forEach(([key, val]) => {
    if(val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  });
  localStorage.removeItem("palletApp.__backup");
  return {restored: Object.keys(backup).length,
          lotsBack: !!localStorage.getItem("palletApp.lots")};
})()
```

期待: `lotsBack: true`。

続けて `location.reload()` を実行し、少し待ってから:

```js
(() => {
  const rows = document.querySelectorAll("#lotTable tbody tr").length;
  const note = document.getElementById("cfgNote");
  return {lotRows: rows, masterCount: MASTER.length,
          noteText: note.textContent};
})()
```

期待: `lotRows` と `masterCount` が改修前と同じ。
`noteText` にはバージョン不一致の案内文が出る（v1 の設定を書き戻したため）。
これは正しい挙動。

- [ ] **Step 9: コミットは不要**

このタスクはコードを変更しない。

---

## Task 6: `CACHE_VERSION` を上げる

**Files:**
- Modify: `files/sw.js:6`

**Interfaces:**
- Produces: インストール済みの PWA に更新が届く

- [ ] **Step 1: `CACHE_VERSION` を上げる**

変更前:

```js
const CACHE_VERSION = "v19";
```

変更後:

```js
const CACHE_VERSION = "v20";
```

- [ ] **Step 2: 上がっていることを確認する**

```bash
grep -n 'CACHE_VERSION = ' files/sw.js
```

期待: `6:const CACHE_VERSION = "v20";`

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v20 に上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: 実機確認の項目をユーザーに渡す**

コードでは代替できない。Pixel 9a（`http://<PCのIP>:8765/index.html`）で確認してもらう。

1. 配置編集タブのブロック図が、現場のスペースと目視で対応が取れる
2. 倉庫外が 3 列になって横に伸びた（Task 5 Step 6 で測った幅）。
   `.scroller` があるので破綻はしないが、横スクロールが要る。実機で扱いに困らないか
3. 印刷プレビューの体裁（上段の注釈行 1 行増、`zoom` 1.4）が 1 ページに収まる

このプロジェクトには E2E テストランナーが無いので、
`superpowers:finishing-a-development-branch` に進む前にこの 2 項目を人が見る。

---

## 実装後に残るもの

計画の範囲外。マージ後の掃除としてまとめて扱う。

- 欄が足りないときの上下段 1 列追加（ロットまとめ表記でも足りない場合の対応）
- あふれブロック（掲載先 `over`）の実装
- 前案件から持ち越し: `.superpowers/sdd/progress.md` の N-2（空のエリア名を
  `applyConfig()` も弾く）、N-3（`files/index.html:1503` の自己シャドーイング）、
  I-3（下段の基準エリアを動かすとグリッドが無言で消える）、Minor 群
