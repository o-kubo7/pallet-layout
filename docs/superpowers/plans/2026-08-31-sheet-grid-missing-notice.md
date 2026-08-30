# 大きな配置図が出せないことを表の中で知らせる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 下段の先頭エリアが紙の様式（11 列）と合わずに大きなグリッドが描けないとき、その事実と原因と直し方を配置図の表の中と設定タブの両方に出し、警告のない「グリッドの無い紙」が刷られるのを止める。

**Architecture:** 判定を `gridWarn()` に独立させ、`gridRows()`（紙）と `applyConfig()`（設定タブ）の両方から呼ぶ。`renderSheet()` は配置表タブが開いているときしか走らないので、判定を `gridRows()` の中に閉じ込めると設定タブから使えない。様式が要求する列数は `SHEET_GRID_ORDER` から導き、マジックナンバーにしない。案内は `#sheetMsg` ではなく表の `<tr>` として入れる（`#sheetMsg` は印刷 CSS で消えるため）。

**Tech Stack:** 単一 HTML ファイルの PWA。ビルドツールなし、テストランナーなし、依存パッケージなし。素の JavaScript と localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-08-31-sheet-grid-missing-notice-design.md`

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の 2 つだけ。他のファイルは変更しない。
- 案内行のクラス名は `gnote`。**`note` と `hint` は使ってはいけない。**
  印刷 CSS（`files/index.html:330`）が `.note` と `.hint` を `display:none !important` で消す。
- 案内に背景色を使わない。ブラウザは既定で背景色を印刷しない（2026-08-23 の教訓）。
- 様式が要求する列数を数値リテラルで書かない。`SHEET_GRID_ORDER.filter(o=>!o.lab).length` で導く。
- **`kind:"extra"` は 12 列目以降に実際に荷物があるときだけ出す。** 列があるだけでは出さない。
  `SPACES_MAX_COLS` は 40 なので、無条件だとレイアウトが育った日から毎日の紙に但し書きが載り続ける。
- `gridNoticeText()` は**素のテキスト**を返す。`esc()` は `gridNoticeRow()` の中でだけ掛ける。
  設定タブの `showCfgNote()` は `textContent` に入れるため、エスケープ済みを渡すと
  実体参照がそのまま見える。
- `gridRows()` の既存の関数名・引数・戻り値のキー（`html` / `anchors`）は変えない。`warn` を足すだけ。
- `gridRows()` の本体（`order` を使う 7 か所）は書き換えない。
  `const order=SHEET_GRID_ORDER;` を残して差分を最小にする。
- `renderSheet()` / `drawLeaders()` / `slotCells()` / `fitSheetText()` の既存の挙動は変えない。
- **`const order=` はファイル内に 2 か所ある。** `gridRows()` の 14 列の並びと
  ロットの並べ替え（`files/index.html:1566`）。置換は一意に決まる範囲で指定する
  （2026-08-30 の教訓「replace の曖昧一致」）。
- `files/index.html` を変更したら、最後に `files/sw.js` の `CACHE_VERSION` を
  `"v23"` から `"v24"` に上げる（Task 4）。上げないとインストール済みの PWA に更新が届かない。

## 検証の方針

このプロジェクトにはテストランナーが無い。各タスクの検証は、ブラウザで開いたページに対して
`javascript_tool`（`mcp__Claude_Browser__javascript_tool`）で検証スクリプトを実行し、
返り値の `ok` が `true` であることを確認する形で行う。

**必ず守ること:**

- **サーバは `preview_start` で起動する。** `.claude/launch.json` の `pallet-layout`
  （`python3 -m http.server 8765 --directory files`）。Bash で起動しない。
- **測る前に `switchTab('sheet')` を呼ぶ。** 非表示タブでは `getBoundingClientRect()` が
  0 を返す（2026-08-23 の教訓）。
- **`@media print` の中の宣言は `getComputedStyle()` では読めない**（2026-08-30 の教訓）。
  `document.styleSheets` を走査し、`CSSRule.MEDIA_RULE` かつ `conditionText` に
  `print` を含むルールを見る。
- **`window.alert` と `window.confirm` を差し替えてから `applyConfig()` を呼ぶ。**
  差し替えないとダイアログでスクリプトが止まる。
- **`applyConfig()` は検証エラーで `alert()` して early return する。** `alert` を潰すと
  設定が適用されなかったことに気づけないので、本計画の `apply()` ヘルパは
  適用後に `sheetAreas("bottom")[0]` を確認し、想定と違えば `throw` する。
- **この検証スクリプトを実機（Pixel 9a）に貼らないこと。** 冒頭の `localStorage.clear()` が
  利用者の配置マス設定・品目マスタ・保存済み手動調整を消す。実機確認は画面を触る手順だけで行う。
- 本計画の検証スクリプトは計画の作成前に改修前のコードに対して実行済みで、
  例外なく期待どおり空振りすることを確認してある。

**改修前に実測した基準値**（既定設定・`basic` サンプル・`switchTab('sheet')` 後）:

- `.sheet` の `innerHTML.length` = **11836**
- `tr.grow` の本数 = **7**
- `.sheet table` の高さ = 実寸 **474px** / 印刷時 664px（用紙の 90.6%、上限 718.5px）
- 12 列にしたときの高さ = 実寸 **472px**（案内 1 行 26px を足して 498px、印刷 697px）
- `tr.gnote` の本数 = **0**（改修前は存在しない）

**共通のヘルパ**（各タスクの検証スクリプトの冒頭に貼る）:

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic'); switchTab('sheet');
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
const LINES=BASE.split("\n").filter(Boolean);
const PC=LINES.find(l=>l.startsWith("PC横"));
const MAIN_COLS="6*,7,7,7,7,7,7,7,7,7,5*";
// applyConfig() は検証エラーで alert して early return する。alert は潰してあるので、
// 適用されたかを下段の先頭エリアで必ず確かめる（想定と違えば止める）
const apply=(v, expectHead)=>{
  cfg.value=v; applyConfig(); switchTab('sheet');
  const head=sheetAreas("bottom")[0];
  if(head!==expectHead) throw new Error(`設定が適用されていない: 下段先頭=${head} 期待=${expectHead}`);
};
```

## File Structure

| ファイル | 役割 | このタスク群での変更 |
|---|---|---|
| `files/index.html` | 単一 HTML の本体（CSS・HTML・JS が全部入り） | `SHEET_GRID_ORDER` / `SHEET_GRID_COLS` / `gridWarn()` を新設、`gridRows()` が `warn` を返す、`gridNoticeText()` / `gridNoticeRow()` を新設、`renderSheet()` と `applyConfig()` から呼ぶ、`.sheet tr.gnote` の CSS を追加 |
| `files/sw.js` | Service Worker（cache-first） | `CACHE_VERSION` の繰り上げのみ |

新規ファイルは作らない。単一 HTML の PWA という既存の構成を維持する。

---

### Task 1: 判定を `gridWarn()` に独立させ、`gridRows()` が `warn` を返す

この段階では画面の見た目は一切変わらない。戻り値にデータが増えるだけ。

**Files:**
- Modify: `files/index.html:2805-2821`（`gridRows()` の前に定数と `gridWarn()` を挿入、頭を書き換え）
- Modify: `files/index.html`（`gridRows()` 末尾の return）

**Interfaces:**
- Consumes: なし
- Produces:
  - `SHEET_GRID_ORDER` — 紙の様式の 14 列の並び（配列）
  - `SHEET_GRID_COLS` — 様式が要求する通常列の本数（`11`）
  - `gridWarn(sp) -> object|null` — `sp` は `lastSp` の要素。戻り値は次のいずれか。
    - `null` — 問題なし
    - `{kind:"none"}` — 下段の先頭エリアが見つからない
    - `{kind:"short", area:string, cols:number, need:number}` — 列が `need` 本に足りない
    - `{kind:"extra", area:string, cols:number, need:number}` — `need` 本目以降に荷物がある
  - `gridRows()` の戻り値 `{html, anchors, warn}`。
    **`kind:"extra"` のときも `html` は空でない。判定を `html` の空判定に寄せてはいけない。**

- [ ] **Step 1: 検証スクリプトを書いて、失敗することを確認する**

`preview_start`（`name: "pallet-layout"`）してから `javascript_tool` で実行する。

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic'); switchTab('sheet');
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
const LINES=BASE.split("\n").filter(Boolean);
const PC=LINES.find(l=>l.startsWith("PC横"));
const MAIN_COLS="6*,7,7,7,7,7,7,7,7,7,5*";
const apply=(v, expectHead)=>{
  cfg.value=v; applyConfig(); switchTab('sheet');
  const head=sheetAreas("bottom")[0];
  if(head!==expectHead) throw new Error(`設定が適用されていない: 下段先頭=${head} 期待=${expectHead}`);
};
const got={};
// 並べ替え → 下段の先頭が PC横（2列）になる
apply([PC,...LINES.filter(l=>l!==PC)].join("\n"), "PC横");
got.reorder=gridRows().warn;
// メインの列を 11→10 に減らす
apply(BASE.replace(MAIN_COLS,"6*,7,7,7,7,7,7,7,7,5*"), "メイン");
got.shrink=gridRows().warn;
// 全エリアを top にして下段を空にする
apply(LINES.map(l=>l.replace(/\| (bottom|top|over)\s*$/,"| top")).join("\n"), undefined);
got.none=gridRows().warn;
// メインの列を 11→12 に増やす。11本目の高さを 1 にすると荷物が 12 列目まで届く。
// 高さ 7 のまま増やすと 12 列目が空になり extra は出ない（改修前コードで実測済み）
apply(BASE.replace(MAIN_COLS,"6*,7,7,7,7,7,7,7,7,7,1,5*"), "メイン");
const sp12=lastSp.find(s=>s.name==="メイン");
got.col12Filled=sp12.cols.slice(11).some(c=>c.fills.length);
got.extra=gridRows().warn;
// 既定に戻す
apply(BASE, "メイン");
got.normal=gridRows().warn;
const ok =
     got.reorder && got.reorder.kind==="short" && got.reorder.area==="PC横"
  && got.reorder.cols===2 && got.reorder.need===11
  && got.shrink  && got.shrink.kind==="short"  && got.shrink.area==="メイン" && got.shrink.cols===10
  && got.none    && got.none.kind==="none"
  && got.normal===null
  && (got.col12Filled
        ? (got.extra && got.extra.kind==="extra" && got.extra.area==="メイン"
           && got.extra.cols===12 && got.extra.need===11)
        : got.extra===null);
({ok, got});
```

- [ ] **Step 2: 実行して FAIL することを確認する**

期待: `ok: false`。`got.reorder` などが `undefined`（改修前は `warn` を返していない）。
`Error: 設定が適用されていない` が出た場合は検証スクリプトのバグなので、
先に進まずに報告する。

`got.col12Filled` は改修前コードで `true` になることを実測済み。
`false` が返った場合は 12 列目に荷物が届いていないので `extra` の確認が成立しない。
列の高さを変えて荷物が届く設定を探し、見つからなければ報告する。

- [ ] **Step 3: 様式の並びを定数に切り出し、`gridWarn()` を新設する**

`files/index.html:2805` の行の**前**に挿入する。

置換前:
```js
// 下段の先頭エリアのグリッド行（○／半／太枠）。
```

置換後:
```js
// 紙の様式である 14 列の並び：通路 | 1-3 | 段番号 | 4-6 | 段番号 | 7-9 | 通路 | 段番号
// 段番号の l/r は左右に隣り合うレーン。最後の段番号は右隣がないので跨がない。
// gridRows() の外に出してあるのは、gridWarn() が列数を数えるため。
const SHEET_GRID_ORDER=[{c:0,aisle:true},{c:1},{c:2},{c:3},{lab:true,l:3,r:4},{c:4},{c:5},{c:6},{lab:true,l:6,r:7},
                        {c:7},{c:8},{c:9},{c:10,aisle:true},{lab:true}];
// 様式が要求する通常列の本数（=11）。並びを変えれば判定も案内の文言も追随する
const SHEET_GRID_COLS=SHEET_GRID_ORDER.filter(o=>!o.lab).length;

/* 下段の先頭エリアが紙の様式と合っているかを見る。合っていれば null。
   renderSheet() は配置表タブが開いているときしか走らない（files/index.html:1850）ので、
   設定タブからも呼べるよう gridRows() から切り離してある。 */
function gridWarn(sp){
  if(!sp) return {kind:"none"};
  // buildWork() の cols は密配列なので、本数不足と「必要な添字が undefined」は同じ条件
  if(sp.cols.length<SHEET_GRID_COLS)
    return {kind:"short", area:sp.name, cols:sp.cols.length, need:SHEET_GRID_COLS};
  // 列があるだけでは紙は狂わない。様式が参照しない列に荷物がある日だけ知らせる。
  // 無条件にすると、現場のレイアウトが育った日から毎日の紙に但し書きが載り続ける
  if(sp.cols.slice(SHEET_GRID_COLS).some(c=>c.fills && c.fills.length))
    return {kind:"extra", area:sp.name, cols:sp.cols.length, need:SHEET_GRID_COLS};
  return null;
}

// 下段の先頭エリアのグリッド行（○／半／太枠）。
```

- [ ] **Step 4: `gridRows()` の頭を書き換える**

置換前:
```js
function gridRows(){
  const sp=lastSp.find(s=>s.name===sheetAreas("bottom")[0]);
  // 下段が空、または設定でエリア名を変えて見つからないことがある
  if(!sp) return {html:"", anchors:[]};
  // 14列の並び：通路 | 1-3 | 段番号 | 4-6 | 段番号 | 7-9 | 通路 | 段番号
  // 段番号の l/r は左右に隣り合うレーン。最後の段番号は右隣がないので跨がない
  const order=[{c:0,aisle:true},{c:1},{c:2},{c:3},{lab:true,l:3,r:4},{c:4},{c:5},{c:6},{lab:true,l:6,r:7},
               {c:7},{c:8},{c:9},{c:10,aisle:true},{lab:true}];
  // 紙の様式に合わせた固定の列並びなので、下段の先頭エリアの列構成がこれと合わないと
  // sp.cols[o.c] が undefined になって描画全体が落ちる。合わないときは大きなグリッドを描かない。
  if(order.some(o=>!o.lab && !sp.cols[o.c])) return {html:"", anchors:[]};
```

置換後:
```js
function gridRows(){
  const sp=lastSp.find(s=>s.name===sheetAreas("bottom")[0]);
  const warn=gridWarn(sp);
  // 下段が空、または設定でエリア名を変えて見つからないことがある。
  // 列が足りないときは sp.cols[o.c] が undefined になって描画全体が落ちるので、
  // どちらの場合も大きなグリッドは描かない。理由は warn で呼び出し側に渡す。
  if(warn && warn.kind!=="extra") return {html:"", anchors:[], warn};
  // 以降は order という名前で参照する（本体を書き換えないため）
  const order=SHEET_GRID_ORDER;
```

- [ ] **Step 5: `gridRows()` 末尾の return に `warn` を足す**

置換前:
```js
  return {html: rows+`<tr>${nums}</tr>`, anchors};
```

置換後:
```js
  return {html: rows+`<tr>${nums}</tr>`, anchors, warn};
```

- [ ] **Step 6: Step 1 のスクリプトを再実行して PASS することを確認する**

期待: `ok: true`。

- [ ] **Step 7: 既定設定で見た目が変わっていないことを確認する**

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic'); switchTab('sheet');
const s=document.querySelector("#sheetView .sheet");
const r={len:s.innerHTML.length,
         grow:document.querySelectorAll("#sheetView .sheet tr.grow").length,
         warn:gridRows().warn};
({ok: r.len===11836 && r.grow===7 && r.warn===null, r});
```

期待: `ok: true`（基準値 11836 / 7 と一致し、`warn` は `null`）。

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
feat: グリッドを描けない理由を gridWarn() が返すようにする

下段の先頭エリアが紙の様式と合わないとき、gridRows() は黙って
空のグリッドを返していた。何が起きたかを warn として返す。

判定は gridRows() の外に出した。renderSheet() は配置表タブが
開いているときしか走らないので、中に閉じ込めると設定タブから使えない。

様式が要求する列数は SHEET_GRID_ORDER から導くので、並びを変えれば追随する。
12列以上は、列があるだけでなく、そこに荷物がある日だけ知らせる。

この時点では呼び出し側が warn を読まないため、画面の見た目は変わらない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 案内を表の中に出す

**Files:**
- Modify: `files/index.html`（`.sheet tr.gnote` の CSS、`gridNoticeText()` / `gridNoticeRow()` を新設、`renderSheet()` から呼ぶ）

**Interfaces:**
- Consumes: Task 1 の `gridRows()` の戻り値 `{html, anchors, warn}`
- Produces:
  - `gridNoticeText(warn) -> string` — 素のテキスト。`esc()` は掛けない
  - `gridNoticeRow(warn) -> string` — `<tr class="gnote">…</tr>` の HTML

- [ ] **Step 1: 検証スクリプトを書いて、失敗することを確認する**

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic'); switchTab('sheet');
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
const LINES=BASE.split("\n").filter(Boolean);
const PC=LINES.find(l=>l.startsWith("PC横"));
const MAIN_COLS="6*,7,7,7,7,7,7,7,7,7,5*";
const apply=(v, expectHead)=>{
  cfg.value=v; applyConfig(); switchTab('sheet');
  const head=sheetAreas("bottom")[0];
  if(head!==expectHead) throw new Error(`設定が適用されていない: 下段先頭=${head} 期待=${expectHead}`);
};
const gn  =()=>[...document.querySelectorAll("#sheetView .sheet tr.gnote")];
const grow=()=>document.querySelectorAll("#sheetView .sheet tr.grow").length;
const got={};

apply([PC,...LINES.filter(l=>l!==PC)].join("\n"), "PC横");
got.reorder={n:gn().length, t:(gn()[0]||{textContent:""}).textContent.trim(), grow:grow()};

apply(BASE.replace(MAIN_COLS,"6*,7,7,7,7,7,7,7,7,5*"), "メイン");
got.shrink={n:gn().length, t:(gn()[0]||{textContent:""}).textContent.trim(), grow:grow()};

apply(LINES.map(l=>l.replace(/\| (bottom|top|over)\s*$/,"| top")).join("\n"), undefined);
got.none={n:gn().length, t:(gn()[0]||{textContent:""}).textContent.trim(), grow:grow()};

// 12列で、11本目の高さを 1 にすると荷物が 12 列目まで届く → 案内が出る
apply(BASE.replace(MAIN_COLS,"6*,7,7,7,7,7,7,7,7,7,1,5*"), "メイン");
got.extra={n:gn().length, t:(gn()[0]||{textContent:""}).textContent.trim(), grow:grow()};
// 案内がグリッドより後ろにあること
const all=[...document.querySelectorAll("#sheetView .sheet tr")];
const lastGrow=all.map((t,i)=>t.classList.contains("grow")?i:-1).reduce((a,b)=>Math.max(a,b),-1);
got.extraAfterGrid = gn().length===1 && all.indexOf(gn()[0])>lastGrow;

// 12列でも高さ 7 のままなら荷物が 12 列目に届かない → 案内は出ない（改修前コードで実測済み）
apply(BASE.replace(MAIN_COLS,"6*,7,7,7,7,7,7,7,7,7,7,5*"), "メイン");
const sp=lastSp.find(s=>s.name==="メイン");
got.emptyTail={n:gn().length, col12Filled:sp.cols.slice(11).some(c=>c.fills.length)};

apply(BASE, "メイン");
const s=document.querySelector("#sheetView .sheet");
got.normal={n:gn().length, grow:grow(), len:s.innerHTML.length};

const ok =
     got.reorder.n===1 && got.reorder.grow===0
  && got.reorder.t.includes("メインエリアの配置図はこの表に出ていません")
  && got.reorder.t.includes("「PC横」") && got.reorder.t.includes("2 列")
  && got.reorder.t.includes("ちょうど 11 列")
  && got.shrink.n===1 && got.shrink.grow===0
  && got.shrink.t.includes("「メイン」") && got.shrink.t.includes("10 列")
  && got.none.n===1 && got.none.grow===0
  && got.none.t.includes("掲載先が「下段」のエリアがありません")
  && got.extra.n===1 && got.extra.grow===7
  && got.extra.t.includes("「メイン」") && got.extra.t.includes("12 列目以降")
  && got.extra.t.includes("通路の位置も様式どおりに塗ります")
  && got.extraAfterGrid===true
  && got.emptyTail.col12Filled===false && got.emptyTail.n===0
  && got.normal.n===0 && got.normal.grow===7 && got.normal.len===11836;
({ok, got});
```

- [ ] **Step 2: 実行して FAIL することを確認する**

期待: `ok: false`。`n` がすべて 0（`tr.gnote` がまだ無い）。
`Error: 設定が適用されていない` が出た場合は検証スクリプトのバグなので、
先に進まずに報告する。

`got.emptyTail.col12Filled` は改修前コードで `false` になることを実測済み。
`true` が返った場合は 12 列目を空にできていないので「荷物が無ければ出ない」の
確認が成立しない。列の高さを変えて空になる設定を探し、見つからなければ報告する。

- [ ] **Step 3: 案内行の CSS を足す**

`files/index.html` の次の 2 行の**間**に挿入する。

置換前:
```css
  .sheet tr.note-row td.none{height:16px}
  .sheet td.g{height:30px;position:relative;padding:0;line-height:0}
```

置換後:
```css
  .sheet tr.note-row td.none{height:16px}
  /* 大きな配置図が出せない／欠けているときの案内。表の中に置くので紙にも出る。
     印刷CSSが .note と .hint を消すので、その2つとは別名にすること。
     背景色は既定で印刷されないので、色ではなく文字だけで伝える。 */
  .sheet tr.gnote td{border:0;background:transparent;text-align:left;
                     white-space:normal;font-size:10px;line-height:1.3;
                     color:#000;padding:4px 2px}
  .sheet td.g{height:30px;position:relative;padding:0;line-height:0}
```

- [ ] **Step 4: `gridNoticeText()` と `gridNoticeRow()` を新設する**

`gridRows()` の直後（`drawLeaders` の説明コメントの直前）に挿入する。

置換前:
```js
/* 下段の欄からメインのスペースへ引き出し線を引く。
```

置換後:
```js
/* 大きな配置図が出せない／欠けていることを伝える文。素のテキストを返す。
   設定タブの showCfgNote() は textContent に入れるので、ここで esc() を掛けてはいけない。
   HTML に入れる側（gridNoticeRow）でだけ掛ける。 */
function gridNoticeText(w){
  if(w.kind==="none"){
    return `※ メインエリアの配置図はこの表に出ていません。掲載先が「下段」のエリアがありません。`
         + `設定タブの「配置マス」で、いずれかのエリアの掲載先を bottom にしてください。`;
  }
  if(w.kind==="short"){
    // 「11 列以上」と書いてはいけない。12 列にすると今度は extra に着地する
    return `※ メインエリアの配置図はこの表に出ていません。`
         + `下段の先頭「${w.area}」は ${w.cols} 列で、表の様式（${w.need} 列）に足りません。`
         + `設定タブの「配置マス」で、ちょうど ${w.need} 列のエリアを下段の先頭行にしてください。`;
  }
  // extra。通路の塗り分けも様式どおりなので、実際の通路が右にずれていると位置が食い違う。
  // パレットが消えることだけを伝えると「灰色は正しい」と誤って安心させる
  return `※「${w.area}」の ${w.need+1} 列目以降はこの表に出ていません。`
       + `表の様式は ${w.need} 列で、通路の位置も様式どおりに塗ります。`;
}

/* 上の文を表の中の1行にする。#sheetMsg は印刷CSSで display:none になるので、
   紙に残すには表の中に置く必要がある。 */
function gridNoticeRow(w){
  return `<tr class="gnote"><td colspan="14">${esc(gridNoticeText(w))}</td></tr>`;
}

/* 下段の欄からメインのスペースへ引き出し線を引く。
```

- [ ] **Step 5: `renderSheet()` から案内行を差し込む**

置換前:
```js
  const grid=gridRows();
  rows+=grid.html;
```

置換後:
```js
  const grid=gridRows();
  // グリッドが描けないときは、グリッドがあった位置に案内を出す。
  // 紙を見た人が「ここに図があるはずだ」と分かる位置に置く。
  if(grid.warn && grid.warn.kind!=="extra") rows+=gridNoticeRow(grid.warn);
  rows+=grid.html;
  // 12列以上のときはグリッド自体は描けているので、案内はその下に置く
  if(grid.warn && grid.warn.kind==="extra")  rows+=gridNoticeRow(grid.warn);
```

- [ ] **Step 6: Step 1 のスクリプトを再実行して PASS することを確認する**

期待: `ok: true`。

- [ ] **Step 7: 印刷で案内が消えないことを確認する**

`@media print` の中の宣言は `getComputedStyle()` では読めないので、CSSOM を走査する。

```js
const hidden=[];
for(const ss of document.styleSheets){
  let rules; try{ rules=ss.cssRules; }catch(e){ continue; }
  for(const rule of rules){
    if(rule.type===CSSRule.MEDIA_RULE && rule.conditionText.includes("print")){
      for(const inner of rule.cssRules){
        const sel=inner.selectorText||"";
        if(/gnote/.test(sel) && /display\s*:\s*none/.test(inner.cssText)) hidden.push(sel);
      }
    }
  }
}
({ok: hidden.length===0, hidden});
```

期待: `ok: true`（`.gnote` を隠す印刷ルールが無い）。

- [ ] **Step 8: 12 列のケースで印刷が 1 ページに収まることを確認する**

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic'); switchTab('sheet');
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
// 案内が出る側の12列構成（11本目の高さ1で荷物が12列目まで届く）で測る
cfg.value=BASE.replace("6*,7,7,7,7,7,7,7,7,7,5*","6*,7,7,7,7,7,7,7,7,7,1,5*");
applyConfig(); switchTab('sheet');
if(sheetAreas("bottom")[0]!=="メイン") throw new Error("設定が適用されていない");
if(document.querySelectorAll("#sheetView .sheet tr.gnote").length!==1)
  throw new Error("案内が出ていない構成では高さを測る意味がない");
const s=document.querySelector("#sheetView .sheet");
const z=parseFloat(getComputedStyle(s).zoom)||1;
const h=s.querySelector("table").getBoundingClientRect().height/z;
const r={実寸:Math.round(h), 印刷:Math.round(h*PRINT_ZOOM),
         上限:Math.round(PRINT_H_LIMIT), 用紙比:Math.round(h*PRINT_ZOOM/PRINT_H_PX*1000)/10,
         gnote:document.querySelectorAll("#sheetView .sheet tr.gnote").length};
cfg.value=BASE; applyConfig();
({ok: h*PRINT_ZOOM<=PRINT_H_LIMIT, r});
```

期待: `ok: true`。実測の見込みは実寸 498px / 印刷 697px / 用紙比 95.1%
（上限 718.5px に対し印刷換算 21px の余裕）。
超えた場合は先に進まずに報告する。対処は `extra` の文言を短くする方向で、
`.sheet tr.gnote td` の `font-size` は下げない（10px が現行の最小で、
これ以上小さくすると紙で読めない）。

- [ ] **Step 9: 画面の見た目をスクリーンショットで確認する**

並べ替えの状態にしてから `computer` の `screenshot` を撮り、次を目で確認する。

- 案内が下段の下・グリッドがあった位置に 2 行で出ている
- 表の幅（672px）からはみ出していない
- 罫線が増えていない（`border:0` が効いている）

続けて 12 列の状態にして撮り、案内がグリッドの列番号行のさらに下に 1 行で出ていることを確認する。

- [ ] **Step 10: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
fix: 大きな配置図が出せないことを表の中で知らせる

下段の先頭エリアが紙の様式（11列）と合わないと、グリッドと引き出し線が
黙って消えた紙が刷れていた。行を並べ替えただけでも起きるので、
掲載先を触っている意識がないまま紙が壊れる。

#sheetMsg は印刷CSSで消えるため、紙に残すには表の中に置く必要がある。
グリッドがあった位置に、事実と原因と直し方を1件出す。

同じ11列ハードコードに由来する「12列目以降が黙って欠ける」件も、
荷物がある日だけグリッドの下に案内を出す。通路の塗り分けも様式どおりで
実態とずれるため、その旨を同じ文に含めた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 設定タブでも知らせる

紙に案内が出るのは配置表タブを開いたときだが、事故を起こす瞬間は設定タブの中にある。
既存の `showCfgNote()`（`cfgNote` への表示＋`subtab-spaces` への `alert` クラス付与）に乗せる。

**Files:**
- Modify: `files/index.html`（`applyConfig()` の末尾）

**Interfaces:**
- Consumes: Task 1 の `gridWarn()`、Task 2 の `gridNoticeText()`
- Produces: なし

- [ ] **Step 1: 検証スクリプトを書いて、失敗することを確認する**

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); resetConfig(); loadSample('basic');
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
const LINES=BASE.split("\n").filter(Boolean);
const PC=LINES.find(l=>l.startsWith("PC横"));
const note=()=>document.getElementById("cfgNote");
const badge=()=>document.getElementById("subtab-spaces");
const state=()=>({hidden:note().hidden, text:note().textContent.trim(),
                  alert:badge().classList.contains("alert")});
const got={};

// 設定タブに居るまま反映する（配置表タブは開かない）。タブ id は 'settings'（'config' は無い）
switchTab('settings');
cfg.value=[PC,...LINES.filter(l=>l!==PC)].join("\n");
applyConfig();
if(sheetAreas("bottom")[0]!=="PC横") throw new Error("設定が適用されていない");
got.afterBad=state();

// 既定に戻すと消える
cfg.value=BASE; applyConfig();
if(sheetAreas("bottom")[0]!=="メイン") throw new Error("設定が適用されていない");
got.afterGood=state();

const ok = got.afterBad.hidden===false
        && got.afterBad.alert===true
        && got.afterBad.text.includes("メインエリアの配置図はこの表に出ていません")
        && got.afterBad.text.includes("「PC横」")
        && got.afterGood.hidden===true && got.afterGood.alert===false;
({ok, got});
```

- [ ] **Step 2: 実行して FAIL することを確認する**

期待: `ok: false`。`got.afterBad.hidden` が `true`（知らせが出ていない）。

- [ ] **Step 3: `applyConfig()` の末尾に判定を足す**

置換前:
```js
  if(lastLots){
    if(spacesToText(false)===geomBefore) redraw();
    else run(false);
  }
  alert("設定を反映しました。");
}
```

置換後:
```js
  if(lastLots){
    if(spacesToText(false)===geomBefore) redraw();
    else run(false);
  }
  // 配置表タブは開いていないことが多く、renderSheet() は開いているときしか走らない
  // （files/index.html:1850）。紙が壊れる設定をした瞬間に気づけるよう、ここでも見る。
  // clearCfgNote() より後、再配置より後でないと、消されるか古い lastSp を見てしまう
  if(hasResult && lastSp){
    const w=gridWarn(lastSp.find(s=>s.name===sheetAreas("bottom")[0]));
    if(w) showCfgNote(gridNoticeText(w));
  }
  alert("設定を反映しました。");
}
```

- [ ] **Step 4: Step 1 のスクリプトを再実行して PASS することを確認する**

期待: `ok: true`。

- [ ] **Step 5: 結果が無いときに誤爆しないことを確認する**

```js
window.alert=()=>{}; window.confirm=()=>true;
localStorage.clear(); location.reload();
```

リロード後、**サンプルを読み込まずに**次を実行する。

```js
window.alert=()=>{}; window.confirm=()=>true;
const cfg=document.getElementById("cfgText"), BASE=cfg.value;
const LINES=BASE.split("\n").filter(Boolean);
const PC=LINES.find(l=>l.startsWith("PC横"));
switchTab('settings');
cfg.value=[PC,...LINES.filter(l=>l!==PC)].join("\n");
applyConfig();
({ok: document.getElementById("cfgNote").hidden===true
   && document.getElementById("subtab-spaces").classList.contains("alert")===false,
  hasResult, lastSp: !!lastSp});
```

期待: `ok: true`（結果が無いので紙も無く、知らせない）。

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
fix: 紙が壊れる設定をした瞬間に設定タブでも知らせる

表の中の案内は印刷で消えないための本命だが、気づくのが配置表タブを
開いたときになる。事故を起こす瞬間は設定タブの中で、
renderSheet() は配置表タブが開いているときしか走らない。

既存の showCfgNote()（cfgNote への表示とサブタブへの印）に乗せて、
applyConfig() の成功直後にも知らせる。結果が無いときは紙も無いので黙る。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `CACHE_VERSION` を上げる

**Files:**
- Modify: `files/sw.js:6`

- [ ] **Step 1: バージョンを繰り上げる**

置換前:
```js
const CACHE_VERSION = "v23";
```

置換後:
```js
const CACHE_VERSION = "v24";
```

- [ ] **Step 2: 反映を確認する**

```bash
grep -n 'CACHE_VERSION = ' files/sw.js
```

期待: `6:const CACHE_VERSION = "v24";`

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "$(cat <<'EOF'
chore: CACHE_VERSION を v24 に上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 実機確認（人の作業。コードでは代替できない）

**検証スクリプトを実機に貼らないこと。** `localStorage.clear()` が実データを消す。
画面を触る手順だけで行う。

Pixel 9a で `http://<開発機のIP>:8765/index.html` を開き、次を確認する。

1. 設定タブの「配置マス」で PC横 の行を先頭に動かして反映し、**その場で**
   サブタブに印が付き `cfgNote` に知らせが出ること（配置表タブを開く前に気づけること）
2. 配置表タブを開き、グリッドがあった位置に案内が出ていること
3. その状態で印刷プレビューを開き、**案内が紙に出ていること**（`#sheetMsg` と違って消えないこと）
4. 案内の文字がスマホ幅で読めること。表は横スクロールする幅なので、案内も横に流れる
5. メインの列を 12 本にして荷物を 12 列目まで届かせ、グリッドの下に案内が出て、
   なお 1 ページに収まること
6. 設定を初期値に戻して、案内とサブタブの印が両方消えること

## 範囲外（設計書 §8）

- 下段の全欄に「※メイン」注釈が付く現象。基準エリアの定義どおりの挙動なので直さない
- グリッドの一般化（11 列ハードコードの撤廃）
- 設定側で反映を拒む案
- ちょうど 11 列で通路の位置だけが違う場合の検知
- `fitSheetText()` の警告が真因を「文字が大きい」と名指しする件
