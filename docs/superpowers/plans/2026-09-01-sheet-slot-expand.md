# 入りきらない日だけ配置表の欄を広げる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置表に載りきらないロットが出る日だけ、上段 5 欄・下段 8 欄へ自動で広がるようにする。通常日の紙は 1px も変えない。

**Architecture:** 配置表の様式を `SHEET_LAYOUTS`（normal = 14列×48px / wide = 16列×42px）の 2 つに定義し、`sheetLayout(topSlots, bottomSlots)` が欄数の超過から選ぶ。欄数超過の警告と `renderSheet()` の両方が同じ関数を通るので、警告の件数と紙に出る欄数がずれない。総幅 672px は両モードで不変。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`, 3317 行）。ビルド無し・テストランナー無し。検証はブラウザのコンソールで `javascript_tool` から実行する。

**設計書:** `docs/superpowers/specs/2026-09-01-sheet-slot-expand-design.md`

## Global Constraints

- 総幅は両モードとも **672px**。`.sheet table` の `width/min-width/max-width:672px`（`files/index.html:246`）は変更しない
- 通常モードの出力は**改修前と完全に同一**でなければならない（14列・48px・上段4欄96px・下段7欄96px・引出線5本）
- 欄数超過の警告の**文言と数え方（`lotsIn` で members を合計）は変更しない**
- 表示設定に項目を追加しない。`STORE_KEY` を増やさない
- 配置アルゴリズム（`areaCandidates` ほか）は変更しない
- 拡張時に足す右の余り 2 列は **`class="none"`（罫線なし・背景色なし）**。背景色は既定で印刷されないため（教訓 2026-08-23）
- `672 ÷ 16 = 42`、`672 ÷ 14 = 48`。どちらも割り切れる
- **月日の文字サイズは対象外。** 拡張時の 42px 列では `--fs-date` が 30px 以上だと桁が隣に重なるが、
  既定は 20px で運用しており、クランプも警告も入れない（ユーザー判断。設計書 §11 に既知の制限として記載）

### 検証の定型（毎タスクの冒頭で必ず実行）

ブラウザで `file:///Users/kenichihanada/web-app/pallet-layout/files/index.html` を開く。
file:// では Service Worker が登録されないので、SW キャッシュの回り道は起きない
（http で開く場合のみ、SW を unregister し `caches.delete()` してから開くこと）。

幾何を測る前に必ず `switchTab('sheet')` を呼ぶ。非表示タブでは `getBoundingClientRect()` が
0 を返す（教訓 2026-08-23 / 2026-08-30）。`probe()` はこれを内蔵している。

**タブの識別子は `'sheet'`。`'map'` というタブは存在しない**（実測で確認済み）。

### フィクスチャ（改修前のコードで到達を実測済み 2026-09-01）

```js
function useFixture(rows){
  document.querySelector("#lotTable tbody").innerHTML="";
  rows.forEach(addRow); syncCards(); saveLots(); run(true); switchTab('sheet');
}
const T="仕掛品";
const FILL=[{type:T,name:"詰め物F",lot:"L-900",snp:10,qty:700}];
const mk=names=>FILL.concat(names.map((n,i)=>({type:T,name:n,lot:"L-"+(910+i),snp:10,qty:20})));
const many=names=>names.map((n,i)=>({type:T,name:n,lot:"L-"+(920+i),snp:10,qty:20}));

const F1=()=>useFixture(SAMPLES.basic);
const F2=()=>useFixture(mk(["部品A","部品B","部品C","部品D","部品E"]));
const F3=()=>useFixture(mk(["部品A","部品B","部品C","部品D","部品E","製品X","製品Y"]));
const F4=()=>useFixture(many(["部品A","部品B","部品C","部品D","部品E","製品X","製品Y","製品Z"]));
const F5=()=>useFixture(many(["部品A","部品B","部品C","部品D","部品E","製品X","製品Y","製品Z","部品F","部品G"]));
```

`loadSample()` は `confirm()` を出すので自動検証では使わない。

改修前の実測（到達を確認済み）:

| | top | bottom | 警告 |
|---|---|---|---|
| F1 | 3 | 6 | なし |
| F2 | 5 | 1 | 上段 1件 |
| F3 | 7 | 1 | 上段 3件 |
| F4 | 0 | 8 | 下段 1件 |
| F5 | 0 | 10 | 下段 3件 |

### 測定ヘルパ（各タスクの検証で使い回す）

```js
function probe(){
  switchTab('sheet');
  const sheet=document.querySelector("#sheetView .sheet");
  if(!sheet) return {err:"sheet null"};
  const tbl=sheet.querySelector("table");
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const w=e=>+(e.getBoundingClientRect().width/z).toFixed(1);
  const cols=[...tbl.querySelectorAll("colgroup col")];
  const slotRows=[...tbl.rows].filter(r=>r.querySelector("td.slot"));
  // drawLeaders() は矢頭を有効にすると1本の線につき path を2個出す
  // （線 files/index.html:3119 ＋ 矢頭 :3126）。矢頭の d は "M-4.5 -8L0 0" で始まる。
  // 素の path 数を引出線の本数として数えると必ず2倍になる（実測で確認済み）
  const paths=[...sheet.querySelectorAll("svg path")].map(p=>p.getAttribute("d")||"");
  const warn=[...document.querySelectorAll("#messages .msg.warn")]
    .map(d=>d.textContent.trim()).filter(t=>t.includes("載りきらない"))[0]||null;
  return {
    colCount:cols.length,
    colW:[...new Set(cols.map(c=>c.style.width))],
    tableW:w(tbl),
    tableH:+(tbl.getBoundingClientRect().height/z).toFixed(1),
    上段欄:[...slotRows[0].querySelectorAll("td.slot")].map(w),
    下段欄:[...slotRows[4].querySelectorAll("td.slot")].map(w),
    引出線:paths.filter(d=>!d.startsWith("M-")).length,
    top:sheetSlots("top").length, bottom:sheetSlots("bottom").length,
    sheetMsg:document.getElementById("sheetMsg").textContent.trim(),
    warn
  };
}
```

**改修前の `F1(); probe()` の実測値**（非退行の基準。Task 1 で必ず控える）:

```
colCount 14 / colW ["48px"] / tableW 673.6 / tableH 473.6
上段欄 [96,96,96,96] / 下段欄 [96,96,96,96,96,96,96]
引出線 5 / top 3 / bottom 6 / sheetMsg "" / warn null
```

> **引出線 5 と bottom 6 は一致しない。** 下段の先頭は基準エリア（メイン）で、
> そこには線を引かないため。「引出線＝下段の欄数」という判定式を書いてはいけない。

---

## File Structure

変更するファイルは 2 つ。

- **Modify: `files/index.html`** … 配置表の様式を 2 モード化する。触るのは次の 6 か所
  - `:244` CSS のコメント（「1列 48px×14＝672px」は wide では偽になる）
  - `:658` 欄数の定数 → `SHEET_LAYOUTS` と `sheetLayout()` に置き換え
  - `:1650-1660` 欄数超過の警告（コメント含む）→ `sheetLayout()` から欄数を引く
  - `:2737-2790` `fitSheetText()` → 拡張時の告知を画面だけに出す
  - `:2792-2860` `renderSheet()` → 列数・欄数・colgroup を様式から引く
  - `:2943-3049` `gridRows()` ／ `:3075` `gridNoticeRow()` → 列数をそろえる
- **Modify: `files/sw.js:6`** … 最後に `CACHE_VERSION` を `v25` → `v26`（Task 6）

新規ファイルは作らない。既存の構造が「1 ファイル・関数単位」なので踏襲する。

---

## Task 1: 様式テーブルと選択関数を足す（描画には未接続）

**Files:**
- Modify: `files/index.html:658`

**Interfaces:**
- Consumes: `sheetSlots(tier)`（既存, `files/index.html:2717`）、`SHEET_GRID_ORDER`（既存, `:2918`, 要素数 14）
- Produces:
  - `SHEET_LAYOUTS` … `{normal:{cols:14,colW:48,top:4,bottom:7}, wide:{cols:16,colW:42,top:5,bottom:8}}`
  - `sheetLayout(topSlots, bottomSlots)` … 配列 2 本を受け、`SHEET_LAYOUTS.normal` か `.wide` を返す

このタスクでは**まだ誰も呼ばない**。既存の `SHEET_TOP_SLOTS` / `SHEET_BOTTOM_SLOTS` は
`normal` を指す別名として残す。接続は Task 2 で行う。分けるのは、選択ロジック単体の
正しさを描画と切り離して確かめるため。

- [ ] **Step 1: 改修前の基準値を控える**

「測定ヘルパ」の `probe` と「フィクスチャ」をコンソールに貼ってから実行する。

```js
F1(); probe()
```

期待（この値を Task 4 の非退行判定で使う）:

```
colCount 14 / colW ["48px"] / tableW 673.6 / tableH 473.6
上段欄 [96,96,96,96] / 下段欄 [96,96,96,96,96,96,96]
引出線 5 / top 3 / bottom 6 / sheetMsg "" / warn null
```

- [ ] **Step 2: 実装**

`files/index.html:658` の

```js
const SHEET_TOP_SLOTS = 4, SHEET_BOTTOM_SLOTS = 7; // 紙のレイアウトで決まる欄数。renderSheet と欄数超過の警告で共有
```

を次に置き換える。

```js
/* 配置図の表の様式。荷物が多い日は上段・下段の欄を1つずつ増やした wide に切り替える。
   総幅 672px は両方で同じ。672÷14=48、672÷16=42 でどちらも割り切れる。
   ・normal … 現行の紙。左ブロック5列(240px)＋すき間1列(48px)＋上段4欄×2列(96px)＝14列
   ・wide   … 左ブロック5列(210px)＋すき間1列(42px)＋上段5欄×2列(84px)＝16列
              メインは14列×42px=588px で、右に2列(84px)余る。後日あふれブロックが入る用地。
   左ブロックが両方とも5列なのは、曜日セルが5個並ぶため。5列未満にはできない。
   wide の1列42pxは、あさ／ひるの丸印に要る36px（文字11px×2＋padding6＋border4＋tdの4）を満たす。
   cols は SHEET_GRID_ORDER の要素数（メインの列数）以上でなければならない。
   下回ると gridRows() の余り列が負になり、表が黙って崩れる。 */
const SHEET_LAYOUTS = {
  normal: {cols:14, colW:48, top:4, bottom:7},
  wide:   {cols:16, colW:42, top:5, bottom:8},
};
/* 欄が足りない日だけ wide にする。判定は「まとめた後の欄数」（sheetSlots の戻り値）で行う。
   上段だけが溢れた日でも上下段そろって wide になる。1つの表で列を共有しているので
   上段と下段を別々の様式にはできない。 */
function sheetLayout(topSlots, bottomSlots){
  const n=SHEET_LAYOUTS.normal;
  return (topSlots.length>n.top || bottomSlots.length>n.bottom) ? SHEET_LAYOUTS.wide : n;
}
const SHEET_TOP_SLOTS = SHEET_LAYOUTS.normal.top, SHEET_BOTTOM_SLOTS = SHEET_LAYOUTS.normal.bottom;
```

- [ ] **Step 3: 選択関数だけを検証する**

ページをリロードしてから実行する。

```js
(()=>{
  const r=[];
  const A=n=>Array(n).fill({});
  r.push(["3/6 → normal", sheetLayout(A(3),A(6))===SHEET_LAYOUTS.normal]);
  r.push(["4/7 → normal（境界。超えていない）", sheetLayout(A(4),A(7))===SHEET_LAYOUTS.normal]);
  r.push(["5/1 → wide（上段だけ溢れ）", sheetLayout(A(5),A(1))===SHEET_LAYOUTS.wide]);
  r.push(["0/8 → wide（下段だけ溢れ）", sheetLayout(A(0),A(8))===SHEET_LAYOUTS.wide]);
  r.push(["7/10 → wide（両方溢れ）", sheetLayout(A(7),A(10))===SHEET_LAYOUTS.wide]);
  r.push(["normal は14列48px", SHEET_LAYOUTS.normal.cols===14 && SHEET_LAYOUTS.normal.colW===48]);
  r.push(["wide は16列42px",   SHEET_LAYOUTS.wide.cols===16   && SHEET_LAYOUTS.wide.colW===42]);
  r.push(["どちらも総幅672px", SHEET_LAYOUTS.normal.cols*SHEET_LAYOUTS.normal.colW===672
                            && SHEET_LAYOUTS.wide.cols*SHEET_LAYOUTS.wide.colW===672]);
  // メインの列数(14)より狭い様式があると gridRows() の余り列が負になり表が崩れる
  r.push(["normal.cols がメインの列数と一致", SHEET_LAYOUTS.normal.cols===SHEET_GRID_ORDER.length]);
  r.push(["wide.cols がメインの列数以上",     SHEET_LAYOUTS.wide.cols>=SHEET_GRID_ORDER.length]);
  r.push(["旧定数の別名が normal と一致", SHEET_TOP_SLOTS===4 && SHEET_BOTTOM_SLOTS===7]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>x[0])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 4: 描画が変わっていないことを確認する**

```js
F1(); probe()
```

期待: Step 1 と**完全に同じ値**（まだ誰も `sheetLayout()` を呼んでいないため）。

- [ ] **Step 5: Commit**

```bash
git add files/index.html
git commit -m "feat: 配置表の様式を SHEET_LAYOUTS と sheetLayout() に定義する"
```

---

## Task 2: 警告と紙を同時に様式へ切り替える

**Files:**
- Modify: `files/index.html:244`（CSS のコメント）
- Modify: `files/index.html:1650-1660`（欄数超過の警告。コメント含む）
- Modify: `files/index.html:2801`（`lay` の導出）
- Modify: `files/index.html:2814`（上段タイトルの colspan）
- Modify: `files/index.html:2818, 2826, 2829, 2834`（上段の欄数）
- Modify: `files/index.html:2837, 2845`（区切りと gap の colspan）
- Modify: `files/index.html:2840, 2841, 2843, 2844`（下段の欄数）
- Modify: `files/index.html:2857`（colgroup）

**Interfaces:**
- Consumes: `sheetLayout(topSlots, bottomSlots)`, `SHEET_LAYOUTS`（Task 1）
- Produces: `renderSheet()` 内のローカル変数 `lay`（Task 3 が `gridRows()` / `gridNoticeRow()` に渡す）

> **警告と描画を 1 つのタスクにまとめる理由。** 警告だけを先に切り替えると、
> 上段 5 件の日に `overTop = 5−5 = 0` となって**警告が消えるのに紙は 4 欄のまま**になり、
> 5 件目のロットが無警告で紙から消える。これは本改修が解消しようとしている不都合そのもの。
> 中間状態を git に残さないため、両方を同じコミットに入れる。

- [ ] **Step 1: 改修前の警告を控える**

```js
F2(); probe().warn
```

期待: `"⚠ 配置図の表に載りきらないロットがあります：上段 1件。ブロック図で確認してください。"`

```js
F3(); probe().warn
```

期待: `"⚠ 配置図の表に載りきらないロットがあります：上段 3件。ブロック図で確認してください。"`

- [ ] **Step 2: 警告の欄数を様式から引く**

`files/index.html:1650-1653` の

```js
  // 配置図の表は上段SHEET_TOP_SLOTS欄・下段SHEET_BOTTOM_SLOTS欄しかない。載りきらないロットは黙って消えるので知らせる。
  const topSlots=sheetSlots("top"), bottomSlots=sheetSlots("bottom");
  const overTop=topSlots.length-SHEET_TOP_SLOTS;
  const overBottom=bottomSlots.length-SHEET_BOTTOM_SLOTS;
```

を次に置き換える（**コメントも直す。旧定数名が残っていると Task 4 の grep が誤ヒットする**）。

```js
  // 配置図の表の欄数は様式で決まる（sheetLayout）。載りきらないロットは黙って消えるので知らせる。
  // renderSheet() も同じ sheetLayout() を通すので、警告の件数と実際に紙へ出る欄数がずれない。
  const topSlots=sheetSlots("top"), bottomSlots=sheetSlots("bottom");
  const lay=sheetLayout(topSlots, bottomSlots);
  const overTop=topSlots.length-lay.top;
  const overBottom=bottomSlots.length-lay.bottom;
```

続けて `files/index.html:1659-1660` の

```js
    if(overTop>0) parts.push(`上段 ${lotsIn(topSlots.slice(SHEET_TOP_SLOTS))}件`);
    if(overBottom>0) parts.push(`下段 ${lotsIn(bottomSlots.slice(SHEET_BOTTOM_SLOTS))}件`);
```

を次に置き換える（**`slice` の基準も様式から引く。直し忘れると件数だけ旧欄数のままになる**）。

```js
    if(overTop>0) parts.push(`上段 ${lotsIn(topSlots.slice(lay.top))}件`);
    if(overBottom>0) parts.push(`下段 ${lotsIn(bottomSlots.slice(lay.bottom))}件`);
```

- [ ] **Step 3: `renderSheet()` で様式を1回だけ求める**

`files/index.html:2801-2802` の

```js
  const top=sheetSlots("top");
  const bottom=sheetSlots("bottom");
```

の直後に次の 1 行を足す。

```js
  // 欄が足りない日は wide（16列×42px・上段5欄・下段8欄）。総幅 672px は変わらない
  const lay=sheetLayout(top, bottom);
```

- [ ] **Step 4: 上段タイトルの colspan を欄数から引く**

`files/index.html:2814` の

```js
      + `<td class="ttl bb2" colspan="8">軒下</td></tr>`;
```

を次に置き換える。

```js
      + `<td class="ttl bb2" colspan="${lay.top*2}">軒下</td></tr>`;
```

- [ ] **Step 5: 上段・下段の欄数を差し替える**

`SHEET_TOP_SLOTS` を使っている 4 か所（`:2818, 2826, 2829, 2834`）を `lay.top` に、
`SHEET_BOTTOM_SLOTS` を使っている 4 か所（`:2840, 2841, 2843, 2844`）を `lay.bottom` に
置き換える。置き換え後の該当行は次のとおり。

```js
      + `${E}${slotCells(top,lay.top,"name","bb2")}</tr>`;
```
```js
      + `${slotCells(top,lay.top,"lot")}</tr>`;
```
```js
  rows+=`<tr class="r3">${E}${slotCells(top,lay.top,"pallet")}</tr>`;
```
```js
      + `${slotCells(top,lay.top,"note")}</tr>`;
```
```js
  rows+=`<tr>${slotCells(bottom,lay.bottom,"name","bb2")}</tr>`;
  rows+=`<tr>${slotCells(bottom,lay.bottom,"lot")}</tr>`;
```
```js
  rows+=`<tr class="btmp">${slotCells(bottom,lay.bottom,"pallet")}</tr>`;
  rows+=`<tr class="note-row">${slotCells(bottom,lay.bottom,"note")}</tr>`;
```

- [ ] **Step 6: 区切り行と gap 行の colspan を列数から引く**

`files/index.html:2837` と `:2845` をそれぞれ次に置き換える。

```js
  rows+=`<tr class="gap"><td class="none sep" colspan="${lay.cols}"></td></tr>`;
```
```js
  rows+=`<tr class="gap"><td class="none" colspan="${lay.cols}"></td></tr>`;
```

- [ ] **Step 7: colgroup を様式から組む**

`files/index.html:2857` の

```js
    <colgroup>${Array(14).fill('<col style="width:48px">').join("")}</colgroup>
```

を次に置き換える。

```js
    <colgroup>${Array(lay.cols).fill(`<col style="width:${lay.colW}px">`).join("")}</colgroup>
```

> `table-layout:fixed` は colspan だけでは列幅を均等配分しない。この `<colgroup>` が
> 列幅を決めている唯一の場所なので、列数と幅の両方を必ず様式から引くこと。

- [ ] **Step 8: CSS のコメントを直す**

`files/index.html:244` の

```css
  /* 1列 48px×14＝672px。ロット（最大9文字）が区画セル（2列＝96px）に収まる幅 */
```

を次に置き換える（wide では 42px×16 になるので、48 固定と読める記述を残さない）。

```css
  /* 総幅は 672px 固定。列数と1列の幅は SHEET_LAYOUTS が決める
     （normal 48px×14 / wide 42px×16）。列幅は colgroup で与える */
```

- [ ] **Step 9: 警告と欄数の両方を検証する**

```js
(()=>{
  const r=[];
  F1(); let p=probe();
  r.push(["F1 警告なし", p.warn===null, p.warn]);
  r.push(["F1 は 14列48px のまま", p.colCount===14 && p.colW[0]==="48px", p.colW]);
  r.push(["F1 上段4欄×96", JSON.stringify(p.上段欄)===JSON.stringify([96,96,96,96]), p.上段欄]);
  r.push(["F1 下段7欄×96", p.下段欄.length===7 && p.下段欄.every(x=>x===96), p.下段欄]);
  F2(); p=probe();
  r.push(["F2 警告が消える（top5 ≤ wide.top5）", p.warn===null, p.warn]);
  r.push(["F2 は 16列42px", p.colCount===16 && p.colW[0]==="42px", p.colW]);
  r.push(["F2 上段5欄×84", p.上段欄.length===5 && p.上段欄.every(x=>x===84), p.上段欄]);
  r.push(["F2 下段8欄×84（上段だけ溢れても下段も広がる）",
          p.下段欄.length===8 && p.下段欄.every(x=>x===84), p.下段欄]);
  r.push(["F2 総幅は 672px のまま", Math.abs(p.tableW-673.6)<1.5, p.tableW]);
  F3(); p=probe();
  r.push(["F3 警告が 上段 2件 に減る（7−5）", !!p.warn && p.warn.includes("上段 2件"), p.warn]);
  F4(); p=probe();
  r.push(["F4 警告が消える（bottom8 ≤ wide.bottom8）", p.warn===null, p.warn]);
  r.push(["F4 は 16列42px", p.colCount===16 && p.colW[0]==="42px", p.colW]);
  F5(); p=probe();
  r.push(["F5 警告が 下段 2件 に減る（10−8）", !!p.warn && p.warn.includes("下段 2件"), p.warn]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

> この時点ではグリッドがまだ 14 列なので、拡張時は**表の下半分だけが 16 列**という
> 崩れた見た目になる。Task 3 で揃える。ここでは上段・下段と警告だけを見る。

- [ ] **Step 10: Commit**

```bash
git add files/index.html
git commit -m "feat: 配置表の欄数と列の土台を様式から引く"
```

---

## Task 3: グリッドの行を表の列数にそろえる

**Files:**
- Modify: `files/index.html:2943`（`gridRows()` の引数）
- Modify: `files/index.html:3036`（グリッドの各行）
- Modify: `files/index.html:3049`（列番号の行）
- Modify: `files/index.html:3075`（`gridNoticeRow()`）
- Modify: `files/index.html:2848, 2851, 2854`（`renderSheet()` からの呼び出し）

**Interfaces:**
- Consumes: `lay`（Task 2 で `renderSheet()` に導入したローカル変数）
- Produces:
  - `gridRows(pad)` … `pad` は右に足す余りの列数（normal は 0、wide は 2）
  - `gridNoticeRow(w, cols)` … `cols` は表の総列数

- [ ] **Step 1: `gridRows()` が余りの列を受け取れるようにする**

`files/index.html:2943` の

```js
function gridRows(){
```

を次に置き換える。

```js
/* pad: 表の右に余る列数。wide の様式ではメイン14列の右に2列（84px）余るので、
   各行の末尾に空セルを足して表全体の列数をそろえる。
   ここは後日あふれブロックが入る用地。罫線も背景色も持たせない
   （背景色は既定で印刷されないため、意味を持たせてはいけない）。 */
function gridRows(pad){
  const padCell = pad>0 ? `<td class="none" colspan="${pad}"></td>` : "";
```

- [ ] **Step 2: グリッドの各行に余りの列を足す**

`files/index.html:3036` の

```js
    rows+=`<tr class="grow">${tds}</tr>`;
```

を次に置き換える。

```js
    rows+=`<tr class="grow">${tds}${padCell}</tr>`;
```

- [ ] **Step 3: 列番号の行にも足す**

`files/index.html:3049` の

```js
  return {html: rows+`<tr>${nums}</tr>`, anchors, warn};
```

を次に置き換える（**足し忘れると最終行だけ 14 列になって表がずれる**）。

```js
  return {html: rows+`<tr>${nums}${padCell}</tr>`, anchors, warn};
```

- [ ] **Step 4: 案内行の colspan を列数から引く**

`files/index.html:3075` の

```js
function gridNoticeRow(w){
  return `<tr class="gnote"><td colspan="14">${esc(gridNoticeText(w))}</td></tr>`;
}
```

を次に置き換える。

```js
function gridNoticeRow(w, cols){
  return `<tr class="gnote"><td colspan="${cols}">${esc(gridNoticeText(w))}</td></tr>`;
}
```

> `gridNoticeText()` は設定タブ（`files/index.html:2382`）からも呼ばれるが、
> そちらのシグネチャは変えないので影響しない。

- [ ] **Step 5: `renderSheet()` からの呼び出しを直す**

`files/index.html:2848` の

```js
  const grid=gridRows();
```

を次に置き換える。

```js
  const grid=gridRows(lay.cols-SHEET_GRID_ORDER.length);
```

続けて `files/index.html:2851` と `:2854` の `gridNoticeRow(grid.warn)` を、
それぞれ `gridNoticeRow(grid.warn, lay.cols)` に置き換える。

- [ ] **Step 6: 表全体の列数がそろったことを検証する**

```js
(()=>{
  const r=[];
  // 各行の colspan の合計。ただし tr.r3（上段のパレット数行）だけは、直前の tr.r2 が
  // rowspan=2 で左5列を覆っているので、自分では 5 列ぶん持たない（改修前の実測でも 9）
  const sums=()=>{
    const tbl=document.querySelector("#sheetView .sheet table");
    return [...tbl.rows].map(tr=>({
      r3:tr.classList.contains("r3"),
      sum:[...tr.cells].reduce((a,td)=>a+(td.colSpan||1),0)
    }));
  };
  const check=(cols)=>{
    const s=sums();
    const bad=s.filter(x=> x.sum !== (x.r3 ? cols-5 : cols));
    return {ok:bad.length===0, bad:bad.map(x=>x.sum), 一覧:[...new Set(s.map(x=>x.sum))]};
  };
  F1(); probe(); const c1=check(14);
  r.push(["F1 全行14列（r3 だけ 9）", c1.ok, c1]);
  F2(); probe(); const c2=check(16);
  r.push(["F2 全行16列（r3 だけ 11）", c2.ok, c2]);
  F4(); probe(); const c4=check(16);
  r.push(["F4 全行16列（r3 だけ 11）", c4.ok, c4]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 7: メインの列幅と縦線の一致を検証する**

```js
(()=>{
  const r=[];
  const geo=()=>{
    const sheet=document.querySelector("#sheetView .sheet"), tbl=sheet.querySelector("table");
    const z=parseFloat(getComputedStyle(sheet).zoom)||1;
    const base=tbl.getBoundingClientRect().left;
    const L=e=>+((e.getBoundingClientRect().left-base)/z).toFixed(1);
    const rows=[...tbl.rows];
    const gRow=rows.find(t=>t.classList.contains("grow"));
    const bRow=rows.filter(t=>t.querySelector("td.slot"))[4];
    const gW=+(gRow.cells[0].getBoundingClientRect().width/z).toFixed(1);
    // 先頭セルの左辺は表の左端なので除く。残りが「内側の境界」。
    // 末尾は落とさない（wide では 588px＝余り列の開始位置で、いちばん確かめたい線）
    const gx=[...gRow.cells].slice(1).map(L), inner=[...bRow.cells].slice(1).map(L);
    const hit=inner.filter(x=>gx.some(g=>Math.abs(g-x)<0.6)).length;
    return {メイン1列:gW, 下段の内側:inner.length, うち一致:hit};
  };
  F1(); probe(); const g1=geo();
  r.push(["F1 メイン48px", Math.abs(g1.メイン1列-48)<0.6, g1]);
  r.push(["F1 下段の縦線が全部メインに乗る（6/6）", g1.下段の内側===6 && g1.うち一致===6, g1]);
  F2(); probe(); const g2=geo();
  r.push(["F2 メイン42px", Math.abs(g2.メイン1列-42)<0.6, g2]);
  r.push(["F2 下段の縦線が全部メインに乗る（7/7）", g2.下段の内側===7 && g2.うち一致===7, g2]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]]), g1, g2};
})()
```

期待: `{ok:true, ng:[]}`。`g1` は `{メイン1列:48, 下段の内側:6, うち一致:6}`、
`g2` は `{メイン1列:42, 下段の内側:7, うち一致:7}`。

- [ ] **Step 8: Commit**

```bash
git add files/index.html
git commit -m "feat: グリッドの行を表の列数にそろえ、右の余りを空ける"
```

---

## Task 4: 旧定数を消し、非退行と印刷の収まりを確かめる

**Files:**
- Modify: `files/index.html:658`（別名の 2 定数を削除）

**Interfaces:**
- Consumes: Task 1〜3 のすべて
- Produces: なし

- [ ] **Step 1: 参照が残っていないことを確認する**

```bash
grep -n "SHEET_TOP_SLOTS\|SHEET_BOTTOM_SLOTS" files/index.html
```

期待: **定義行の 1 行だけ**がヒットする
（`files/index.html:1650` のコメントは Task 2 Step 2 で書き換え済みのため、もう出ない）。
他の行がヒットしたら、その行を `lay` から引く形に直してから先へ進む。

- [ ] **Step 2: 別名の定数を消す**

次の 1 行を削除する。

```js
const SHEET_TOP_SLOTS = SHEET_LAYOUTS.normal.top, SHEET_BOTTOM_SLOTS = SHEET_LAYOUTS.normal.bottom;
```

- [ ] **Step 3: 通常モードの非退行を確かめる**

```js
F1(); const p=probe();
JSON.stringify({colCount:p.colCount, colW:p.colW, tableW:p.tableW, tableH:p.tableH,
  上段欄:p.上段欄, 下段欄:p.下段欄, 引出線:p.引出線,
  top:p.top, bottom:p.bottom, sheetMsg:p.sheetMsg, warn:p.warn})
```

期待（**Task 1 Step 1 で控えた値と 1 つ残らず一致すること**）:

```
colCount 14 / colW ["48px"] / tableW 673.6 / tableH 473.6
上段欄 [96,96,96,96] / 下段欄 [96,96,96,96,96,96,96]
引出線 5 / top 3 / bottom 6 / sheetMsg "" / warn null
```

- [ ] **Step 4: 拡張モードで引出線と圧縮が壊れていないことを確かめる**

```js
(()=>{
  const r=[];
  F2(); let p=probe();
  r.push(["F2 引出線が1本以上引かれている", p.引出線>0, p.引出線]);
  r.push(["F2 切れている欄なし（sheetMsg 空）", p.sheetMsg==="", p.sheetMsg]);
  F4(); p=probe();
  r.push(["F4 引出線が1本以上引かれている", p.引出線>0, p.引出線]);
  r.push(["F4 切れている欄なし", p.sheetMsg==="", p.sheetMsg]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

> 引出線の本数は「下段の欄数」とは一致しない（基準エリアには引かないため）。
> 本数を固定値で断定せず、**引けていること**だけを見る。

- [ ] **Step 5: 印刷が1ページに収まることを確かめる**

`@media print` の宣言は `getComputedStyle` では読めないので CSSOM を走査する
（教訓 2026-08-30）。

```js
(()=>{
  const r=[];
  let printZoom=null;
  for(const ss of document.styleSheets){
    let rules; try{ rules=ss.cssRules; }catch(e){ continue; }
    for(const rule of rules||[]){
      if(rule.type===CSSRule.MEDIA_RULE && rule.conditionText.includes("print")){
        for(const inner of rule.cssRules){
          if(inner.selectorText && inner.selectorText.includes(".sheet") && inner.style.zoom){
            printZoom=parseFloat(inner.style.zoom);
          }
        }
      }
    }
  }
  r.push(["印刷zoomが定数と一致", printZoom===PRINT_ZOOM, {printZoom, PRINT_ZOOM}]);
  const h=()=>{
    const sheet=document.querySelector("#sheetView .sheet"), tbl=sheet.querySelector("table");
    const z=parseFloat(getComputedStyle(sheet).zoom)||1;
    return +(tbl.getBoundingClientRect().height/z*PRINT_ZOOM).toFixed(1);
  };
  F1(); probe(); const h1=h(); r.push(["F1 の印刷高さが上限内", h1<=PRINT_H_LIMIT, {h1, PRINT_H_LIMIT}]);
  F2(); probe(); const h2=h(); r.push(["F2 の印刷高さが上限内", h2<=PRINT_H_LIMIT, {h2, PRINT_H_LIMIT}]);
  F4(); probe(); const h4=h(); r.push(["F4 の印刷高さが上限内", h4<=PRINT_H_LIMIT, {h4, PRINT_H_LIMIT}]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]]), h1, h2, h4};
})()
```

期待: `{ok:true, ng:[]}`。`PRINT_H_LIMIT` は 718.5。

- [ ] **Step 6: Commit**

```bash
git add files/index.html
git commit -m "refactor: 様式に移した旧欄数の定数を消す"
```

---

## Task 5: 拡張モードに入った日を画面にだけ知らせる

**Files:**
- Modify: `files/index.html:2737`（`fitSheetText()` の引数）
- Modify: `files/index.html:2769` 付近（`html` の組み立て）
- Modify: `files/index.html:2859`（`renderSheet()` からの呼び出し）

**Interfaces:**
- Consumes: `lay`（Task 2）、`sheetLayout()` / `SHEET_LAYOUTS`（Task 1）
- Produces: `fitSheetText(lay)` … `lay` は省略可。省略時は自分で `sheetLayout()` を引く

`#sheetMsg` は印刷 CSS で `display:none` になるので、ここに出しても**紙には出ない**。
現場が「紙の幅が違う」と不具合を疑うのを防ぐための、画面だけの案内。

> `fitSheetText()` は `applyDisplay()`（`files/index.html:2561`）からも引数なしで呼ばれる。
> **引数を必須にすると表示設定を変えた瞬間に落ちる。** 必ず省略可にすること。

- [ ] **Step 1: 引数を省略可で受ける**

`files/index.html:2737` の

```js
function fitSheetText(){
```

を次に置き換える。

```js
/* lay: 配置表の様式。renderSheet() からは求め済みのものを渡す。
   applyDisplay() など様式を持たない呼び出し元のために省略可にしてある。 */
function fitSheetText(lay){
```

続けて、同関数の中で `const box=document.getElementById("sheetMsg");` の直前に次を足す。

```js
  if(!lay) lay=sheetLayout(sheetSlots("top"), sheetSlots("bottom"));
```

- [ ] **Step 2: 告知を組み立てる**

`files/index.html:2769` 付近の

```js
  if(!box) return;
  let html="";
```

を次に置き換える。

```js
  if(!box) return;
  let html="";
  // 荷物が多い日は欄が増え、紙のマス目の幅が変わる。現場が不具合と疑わないように
  // 画面にだけ知らせる（#sheetMsg は印刷CSSで display:none なので紙には出ない）
  if(lay===SHEET_LAYOUTS.wide){
    html+=`<div class="msg ok">※ 荷物が多いため、今日は欄を増やしています`
        + `（上段 ${lay.top} 欄・下段 ${lay.bottom} 欄）。用紙の大きさは変わりません。</div>`;
  }
```

- [ ] **Step 3: `renderSheet()` から様式を渡す**

`files/index.html:2859` の

```js
  fitSheetText();                 // 折り返しは行の高さを変えるので線より先に確定させる
```

を次に置き換える。

```js
  fitSheetText(lay);              // 折り返しは行の高さを変えるので線より先に確定させる
```

- [ ] **Step 4: 告知の出方を検証する**

`probe()` の `sheetMsg` は告知も拾うので、この検証では警告だけを別に数える。

```js
(()=>{
  const r=[];
  const msg=()=>{
    const box=document.getElementById("sheetMsg");
    return {
      告知:[...box.querySelectorAll(".msg.ok")].map(d=>d.textContent.trim()),
      警告:[...box.querySelectorAll(".msg.warn")].map(d=>d.textContent.trim()),
    };
  };
  F1(); probe(); let m=msg();
  r.push(["F1（通常）は告知なし", m.告知.length===0, m]);
  r.push(["F1 は警告もなし", m.警告.length===0, m]);
  F2(); probe(); m=msg();
  r.push(["F2（拡張）に告知が1本", m.告知.length===1, m]);
  r.push(["F2 の告知に 上段 5 欄・下段 8 欄 が入る",
          m.告知[0]&&m.告知[0].includes("上段 5 欄")&&m.告知[0].includes("下段 8 欄"), m]);
  r.push(["F2 は入りきらない欄の警告なし", m.警告.length===0, m]);
  F4(); probe(); m=msg();
  r.push(["F4（拡張）にも告知", m.告知.length===1, m]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 5: 表示設定から呼んでも落ちないことを確かめる**

引数なしの呼び出し元（`applyDisplay()`）が生きていることを見る。

```js
(()=>{
  F2(); switchTab('sheet');
  let err=null;
  try{ applyDisplay(); }catch(e){ err=String(e); }
  const box=document.getElementById("sheetMsg");
  return {ok:err===null && box.querySelectorAll(".msg.ok").length===1,
          err, 告知本数:box.querySelectorAll(".msg.ok").length};
})()
```

期待: `{ok:true, err:null, 告知本数:1}`
（引数なしでも `sheetLayout()` を自分で引くので、告知が消えない）

- [ ] **Step 6: 通常モードの非退行を再確認する**

```js
F1(); const p=probe(); ({sheetMsg:p.sheetMsg, colCount:p.colCount, 引出線:p.引出線})
```

期待: `{sheetMsg:"", colCount:14, 引出線:5}`

- [ ] **Step 7: Commit**

```bash
git add files/index.html
git commit -m "feat: 欄を増やした日を画面にだけ知らせる"
```

---

## Task 6: キャッシュを繰り上げる

**Files:**
- Modify: `files/sw.js:6`

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: なし

`files/sw.js` は cache-first。キャッシュ名を変えないと、インストール済みの端末に
更新が永続的に届かない（教訓 2026-07-09）。**このタスクは必ず最後に行う。**

- [ ] **Step 1: 現在の値を確認する**

```bash
grep -n "CACHE_VERSION" files/sw.js
```

期待: `6:const CACHE_VERSION = "v25";`

- [ ] **Step 2: 繰り上げる**

`files/sw.js:6` を次に置き換える。

```js
const CACHE_VERSION = "v26";
```

- [ ] **Step 3: 1行だけ変わったことを確認する**

```bash
git diff --stat files/sw.js
```

期待: `1 file changed, 1 insertion(+), 1 deletion(-)`

- [ ] **Step 4: Commit**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v26 に上げる"
```

---

## Task 7: 実機確認（人の作業）

自動検証では見えない「紙の見た目」を目で見る。**Pixel 9a で印刷プレビューまで確認する。**

- [ ] 通常モード（F1）の紙が、改修前と見分けがつかないこと
- [ ] 拡張モード（F2）で上段が 5 欄・下段が 8 欄になり、縦線がそろっていること
- [ ] 拡張モードで**メインの右に出る 84px の余白**の見え方（設計書 §10）。
      手書きで書き足せる場所として使えそうか。**使えないと判断された場合は再設計が要る**
- [ ] 拡張モードで「あさ／ひる」の丸印と総パレット数が潰れていないこと（左ブロック 210px）
- [ ] 拡張モードで品名が読めること（欄幅 84px・水平圧縮あり）
- [ ] 両モードとも A4 横 1 ページに収まること
- [ ] F3（上段 7 名）で、警告が「上段 2件」と出ること
- [ ] 拡張モードの画面の告知が、印刷プレビューには**出ていない**こと
- [ ] 表示設定で「月日」を 30px 以上に上げると拡張時に桁が重なること（**既知の制限**。
      直さない。現場が既定 20px で使っていることを確認する）

---

## Self-Review

**1. 仕様の網羅**

| 設計書の項目 | 対応タスク |
|---|---|
| §2 2 モードの定義 | Task 1 |
| §3 切替条件 | Task 1（判定）／ Task 2（適用） |
| §4 列の土台 | Task 2（colgroup・欄数）／ Task 3（グリッド） |
| §5-1 定数を様式から引く | Task 1・4 |
| §5-2 `14` のハードコード 4 か所 | Task 2（2837・2845・2857）／ Task 3（3075） |
| §5-3 上段タイトルの colspan | Task 2 Step 4 |
| §5-4 メインの右の余り | Task 3 Step 1〜3 |
| §5-5 触らないもの | 変更対象に含めていない（`fitSheetText` は告知のためだけに引数を1つ増やす） |
| §6 印刷の収まり | Task 4 Step 5 |
| §7-1 SW cache-first | Task 6 |
| §7-2 非表示タブ | `probe()` が `switchTab('sheet')` を内蔵 |
| §7-3 `@media print` と CSSOM | Task 4 Step 5 |
| §7-4 `clearLots()` | 本計画では空状態を作らないので不要 |
| §7-6 背景色 | Task 3 Step 1（`class="none"` で罫線も背景も持たせない） |
| §8 検証 | 各タスクの検証ステップ ＋ Task 7 |
| §10 拡張時の告知 | Task 5 |
| §11 月日の既知の制限 | 実装しない。Task 7 で現場の使い方を確認するだけ |

**2. プレースホルダ**: 「TBD」「適切に」「同様に」の類は無い。すべてのコードステップに置換前後の実コードを載せた。

**3. 型・名前の一貫性**

- `sheetLayout(topSlots, bottomSlots)` の戻り値は `SHEET_LAYOUTS` の要素。プロパティは
  `cols` / `colW` / `top` / `bottom` の 4 つ。変数名は全タスクで `lay` に統一
- `gridRows(pad)` の `pad` は Task 3 Step 5 で `lay.cols-SHEET_GRID_ORDER.length` を渡す
  （normal は 14−14=0、wide は 16−14=2）
- `gridNoticeRow(w, cols)` の第 2 引数は `lay.cols`
- `fitSheetText(lay)` の `lay` は省略可。`applyDisplay()` からの引数なし呼び出しが生きる

**4. `/dig` の指摘の反映**

| 指摘 | 反映 |
|---|---|
| A-1 `tr.r3` は rowspan で覆われ colspan 合計が 9 | Task 3 Step 6 で `r3` を `cols-5` として判定 |
| A-2 矢頭で `path` が 2 倍。引出線＝下段の欄数は偽 | `probe()` が矢頭を除外。基準値を 10→5 に訂正し、本数の固定判定をやめた |
| A-3 `slice(0,-1)` で一番見たい線が抜ける | Task 3 Step 7 で削除。期待値を 6/6・7/7 に訂正 |
| B-1 月日が wide の 42px 列で重なる | 実装しない（ユーザー判断）。Global Constraints と Task 7 に明記 |
| C-1 警告だけ先に切り替えると悪化する | 旧 Task 2・3 を統合して現 Task 2 に |
| C-2 `:1650` のコメントが grep に誤ヒット | Task 2 Step 2 でコメントも書き換え。`:244` の CSS コメントも Step 8 で修正 |
| C-3 `SHEET_GRID_ORDER.length` への暗黙依存 | Task 1 Step 3 に 2 本の検査を追加 |
