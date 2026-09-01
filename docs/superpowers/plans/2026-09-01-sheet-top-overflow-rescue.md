# 上段のあふれを下段の空き欄で受ける 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の表で、上段に入りきらない欄を下段の空き欄へ回し、紙から荷物が落ちる日を減らす。

**Architecture:** 上段・下段の欄と様式を `sheetPlacement()` が 1 回で決める。欄数超過の警告と `renderSheet()` の両方がこの関数を通るので、警告の件数と紙に出る欄がずれない。様式（`wide`）の判定は救済前の件数で行い、それでもあふれる分だけを下段の空き欄の数まで回す。回した欄には置き場所の注釈を必ず出し、引き出し線は引かない。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`, 3350 行）。ビルド無し・テストランナー無し。検証はブラウザのコンソールで `javascript_tool` から実行する。

**設計書:** `docs/superpowers/specs/2026-09-01-sheet-top-overflow-rescue-design.md`

## Global Constraints

- **通常日（救済も `wide` も起きない日）の紙は改修前と完全に同一。** この環境での実測基準値:
  `colCount 14 / colW ["48px"] / tableW 674 / tableH 474.3 / 上段欄 [96,96,96,96] / 下段欄 [96×7] / 引出線 5 / top 3 / bottom 6 / sheetMsg "" / warn null`
- 欄数超過の警告の**文言は変更しない**（`⚠ 配置図の表に載りきらないロットがあります：上段 N件。ブロック図で確認してください。`）
- 数え方も変更しない。**欄の数ではなく荷物の数**（`members` を合計）で数える
- 様式（`SHEET_LAYOUTS` の `cols` / `colW` / `top` / `bottom`）と `sheetLayout()` の判定条件は変更しない。総幅 672px 不変
- 救済するのは**上段 → 下段のみ**。下段 → 上段はやらない
- 救済の判定順は **`wide` を先、救済は最後**。様式は救済前の件数で決める
- 救済した欄には**置き場所のエリア名の注釈を必ず出す**（`※` で始まる。基準エリアも省かない）
- 救済した欄には**引き出し線を引かない**。`drawLeaders()` へ渡す id を `null` にする（アンカーの有無に頼らない）
- **同じロットが下段に 2 欄並ぶ日はそのまま出す**（設計書 §4-4。ユーザー判断）
- **同じエリアの荷物が上下段に割れることは許容する**（設計書 §10。ユーザー判断）
- 救済の告知は**画面だけ**。`#sheetMsg` は印刷 CSS で `display:none`
- `fitSheetText()` の引数は**省略可のまま**にする。`applyDisplay()` が引数なしで呼ぶ
- 配置アルゴリズム（`areaCandidates` ほか）、まとめ（`mergeEntries`）、グリッド（`gridRows` / `gridNoticeRow`）は変更しない
- 表示設定に項目を追加しない。`STORE_KEY` を増やさない

> **この計画に書かれた行番号は、すべて改修前（`c5e67a5`）の値。**
> Task 1 が 3 行削って約 25 行足すので、Task 2 以降の実際の行は **20 行ほど後ろにずれる**。
> **行番号ではなく、各ステップの「置換前のコード」の文字列で該当箇所を特定すること。**

### 検証の定型（毎タスクの冒頭で必ず実行）

ブラウザで `file:///Users/kenichihanada/web-app/pallet-layout/files/index.html` を開く。
`file://` では Service Worker が登録されないので、SW キャッシュの回り道は起きない
（`http` で開く場合のみ、SW を unregister し `caches.delete()` してから開くこと）。

幾何を測る前に必ず `switchTab('sheet')` を呼ぶ。非表示タブでは `getBoundingClientRect()` が
0 を返す（教訓 2026-08-23 / 2026-08-30）。`probe()` はこれを内蔵している。
タブの識別子は `'sheet'`。`'map'` というタブは存在しない。

**`javascript_tool` は呼び出しをまたぐとトップレベルの `const` / `function` 宣言が引き継がれない。**
ヘルパは `window.probe = function(){...}` の形で定義すること（実測済み）。
ページをリロードすると消えるので、リロード後は毎回入れ直す。

### フィクスチャ（改修前のコードで到達を実測済み 2026-09-01）

```js
window.useFixture=function(rows){
  document.querySelector("#lotTable tbody").innerHTML="";
  rows.forEach(addRow); syncCards(); saveLots(); run(true); switchTab('sheet');
};
window.T="仕掛品";
window.mk=(n,q)=>({type:T,name:n,lot:"L"+n,snp:10,qty:q});
// FN … 通常日。救済も wide も起きない
window.FN=()=>useFixture(SAMPLES.basic);
// FR … ちょうど収まる日（現場から出た実例。上段があふれ、下段に空きが1つある）
window.FR=()=>useFixture([
 {type:T,name:"部品C",lot:"L-103",snp:10,qty:245},{type:T,name:"部品A",lot:"L-101",snp:10,qty:120},
 {type:T,name:"部品B",lot:"L-102",snp:10,qty:70}, {type:T,name:"部品D",lot:"L-104",snp:10,qty:140},
 {type:T,name:"部品E",lot:"L-105",snp:10,qty:60},
 {type:"商品",name:"製品X",lot:"P-201",snp:10,qty:60},{type:"商品",name:"製品Y",lot:"P-202",snp:10,qty:90},
 {type:"商品",name:"製品Z",lot:"P-203",snp:10,qty:110},{type:"商品",name:"製品W",lot:"P-204",snp:10,qty:80},
 {type:T,name:"部品1",lot:"5555",snp:10,qty:80},{type:T,name:"部品2",lot:"222",snp:10,qty:70},
 {type:T,name:"部品3",lot:"3333",snp:10,qty:55},{type:"商品",name:"製品4",lot:"444",snp:10,qty:44}]);
// FP … 回しきれない日（あふれ4に対して空きが2しかない）
window.FP=()=>useFixture([{type:T,name:"詰め物F",lot:"L-900",snp:10,qty:700}]
  .concat("ABCDEFGHIJKLMN".split("").map((n,i)=>({type:T,name:"部品"+n,lot:"L-"+(910+i),snp:10,qty:20}))));
// FS … 注釈が空の欄（軒下①だけ）が回る日
window.FS=()=>useFixture([mk("p0",130),mk("p1",40),mk("p2",90),mk("p3",70),mk("p4",40),mk("p5",110),
 mk("p6",20),mk("p7",80),mk("p8",110),mk("p9",50),mk("p10",40),mk("p11",110),mk("p12",20),
 mk("p13",90),mk("BIG",560)]);
// FD … 同じロットが下段に2欄並ぶ日（メインと軒下に分割配置され、その軒下分が回る）
window.FD=()=>useFixture([mk("p0",90),mk("p1",110),mk("p2",90),mk("p3",120),mk("p4",10),mk("p5",100),
 mk("p6",110),mk("p7",90),mk("p8",30),mk("p9",40),mk("BIG",670),mk("q0",80),mk("q1",10),mk("q2",10)]);
// FB … 下段があふれ、上段はあふれない日（救済0件のパス）
window.FB=()=>useFixture("ABCDEFGHIJKL".split("").map((n,i)=>({type:T,name:"m"+n,lot:"M-"+(100+i),snp:10,qty:20})));
```

`loadSample()` は `confirm()` を出すので自動検証では使わない。

**改修前の実測値**（到達を確認済み。Task 1 で控え直す）:

| | 様式 | top | bottom | 空き | あふれ | 救済見込み | 警告 | colCount | tableH | 引出線 |
|---|---|---|---|---|---|---|---|---|---|---|
| FN | normal | 3 | 6 | 1 | −1 | 0 | なし | 14 | 474.3 | 5 |
| FR | wide | 6 | 7 | 1 | 1 | 1 | 上段 1件 | 16 | 480.2 | 5 |
| FP | wide | 9 | 6 | 2 | 4 | 2 | 上段 4件 | 16 | 478.1 | 1 |
| FS | wide | 11 | 7 | 1 | 6 | 1 | 上段 6件 | 16 | 480.2 | 3 |
| FD | wide | 11 | 6 | 2 | 6 | 2 | 上段 6件 | 16 | 478.1 | 3 |
| FB | wide | 1 | 11 | −3 | −4 | 0 | 下段 3件 | 16 | 476 | 8 |

改修後の期待:

| | 救済 | 警告 | 下段の末尾に出る欄 |
|---|---|---|---|
| FN | 0 件 | なし（変化なし） | — |
| FR | 1 件 | **消える** | 8 欄目 = `製品4` / `444` / `※5棟壁際` |
| FP | 2 件 | **上段 2件** | 7・8 欄目 = `部品F`・`部品G` / いずれも `※軒下②` |
| FS | 1 件 | **上段 5件** | 8 欄目 = `p10` / `Lp10` / `※軒下①`（**改修前は注釈が空**） |
| FD | 2 件 | **上段 4件** | 7 欄目 = `p2` / `Lp2` / `※軒下②`（3 欄目にも同じ `p2` がいる）<br>8 欄目 = `p7` / `Lp7` / `※軒下②・出庫口横・5棟壁際` |
| FB | 0 件 | **下段 3件**（変化なし） | — |

> **落とし穴 1。** `slotCells()` は欄が空でも `lay.bottom` 個ぶん `td` を出す。
> 「下段が 8 欄になった」は**改修前から真**で、判定に使えない。**8 欄目の中身**を見ること。

> **落とし穴 2。** 救済した欄は改修前も改修後も線が引かれない（アンカーが無い）。
> 「引出線の本数が変わらない」は**救済欄に線が無いことの証明にならない**。
> 線の**起点の x 座標**が救済欄の x 範囲に入らないことまで見る（Task 2 Step 9）。

> **落とし穴 3。** 注釈の行は `slotCells()` が `cls="none snote"` にするので **`td.slot` を持たない**。
> `td.slot` を含む行は 6 行だけで、`[上段品名, 上段ロット, 上段P数, 下段品名, 下段ロット, 下段P数]`。
> **下段の品名行は `slotRows[3]`**（`[4]` はロット行）。実測で確認済み。

### 測定ヘルパ（各タスクの検証で使い回す）

```js
window.probe=function(){
  switchTab('sheet');
  const sheet=document.querySelector("#sheetView .sheet");
  if(!sheet) return {err:"sheet null"};
  const tbl=sheet.querySelector("table");
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const w=e=>+(e.getBoundingClientRect().width/z).toFixed(1);
  const cols=[...tbl.querySelectorAll("colgroup col")];
  // 注釈の行は td.snote なので、この配列は
  // [上段品名, 上段ロット, 上段P数, 下段品名, 下段ロット, 下段P数] の6行
  const slotRows=[...tbl.rows].filter(r=>r.querySelector("td.slot"));
  // drawLeaders() は矢頭を有効にすると1本の線につき path を2個出す。
  // 矢頭の d は "M-4.5 -8L0 0" で始まるので除外する（実測で確認済み）
  const paths=[...sheet.querySelectorAll("svg path")].map(p=>p.getAttribute("d")||"");
  const warn=[...document.querySelectorAll("#messages .msg.warn")]
    .map(d=>d.textContent.trim()).filter(t=>t.includes("載りきらない"))[0]||null;
  return {
    colCount:cols.length, colW:[...new Set(cols.map(c=>c.style.width))],
    tableW:w(tbl), tableH:+(tbl.getBoundingClientRect().height/z).toFixed(1),
    上段欄:[...slotRows[0].querySelectorAll("td.slot")].map(w),
    下段欄:[...slotRows[3].querySelectorAll("td.slot")].map(w),
    引出線:paths.filter(d=>!d.startsWith("M-")).length,
    top:sheetSlots("top").length, bottom:sheetSlots("bottom").length,
    sheetMsg:document.getElementById("sheetMsg").textContent.trim(), warn};
};
// 下段の各欄に実際に出ている文字。品名・ロット・P数・注釈を欄ごとに読む
window.btm=function(){
  const tbl=document.querySelector("#sheetView .sheet table");
  if(!tbl) return [];
  const rows=[...tbl.rows];
  const slotRows=rows.filter(r=>r.querySelector("td.slot"));
  const name=slotRows[3], lot=slotRows[4];
  const pal=rows.find(r=>r.classList.contains("btmp"));
  const note=pal && pal.nextElementSibling;   // btmp の次が下段の注釈行
  const txt=(tr,sel)=>tr?[...tr.querySelectorAll(sel)].map(td=>td.textContent.trim()):[];
  return txt(name,"td.slot").map((n,i)=>({
    i, 品名:n, ロット:txt(lot,"td.slot")[i]||"", P数:txt(pal,"td.slot")[i]||"",
    注釈:txt(note,"td.snote")[i]||""}));
};
```

---

## File Structure

変更するファイルは 2 つ。新規ファイルは作らない（既存が「1 ファイル・関数単位」なので踏襲する）。

- **Modify: `files/index.html`** … 触るのは次の 6 か所
  - `:1676-1678` 欄数超過の警告の中の `const lotsIn=...`（トップレベルへ切り出す。Task 1）
  - `:2747` `sheetSlots()` の直後（`lotsIn` / `slotAreaNote()` / `sheetPlacement()` を足す。Task 1）
  - `:1670-1679` 欄数超過の警告（救済後の残りだけを数える。Task 2）
  - `:2831-2834` `renderSheet()` の `top` / `bottom` / `lay` の導出（Task 2）
  - `:2893` `drawLeaders()` へ渡す id ／ `:3148` `drawLeaders()` のコメント（Task 2）
  - `:2759-2762, :2798` `fitSheetText()` の引数と告知（Task 3）
- **Modify: `files/sw.js:6`** … 最後に `CACHE_VERSION` を `v26` → `v27`（Task 4）

---

## Task 1: 配置を決める関数を足す（描画には未接続）

**Files:**
- Modify: `files/index.html:1676-1678`（`lotsIn` をトップレベルへ移す）
- Modify: `files/index.html:2747`（`sheetSlots()` の直後に 3 つ足す）

**Interfaces:**
- Consumes: `sheetSlots(tier)`（既存, `:2739`）、`sheetLayout(topSlots, bottomSlots)`（既存, `:675`）、`SHEET_LAYOUTS`（既存, `:668`）
- Produces:
  - `lotsIn(slots)` … 欄の配列を受け、荷物の数（`members` の合計）を返す
  - `slotAreaNote(areas)` … エリア名の配列を受け、`"※軒下①・軒下②"` の形の注釈を返す。空配列なら `""`
  - `sheetPlacement()` … `{lay, top, bottom, moved}` を返す。`bottom` は救済した欄を末尾に含む。
    救済した欄は `fromTop:true` と作り直した `note` を持つ

このタスクでは `slotAreaNote()` と `sheetPlacement()` を**まだ誰も呼ばない**。
接続は Task 2 で行う。分けるのは、配置の決め方の正しさを描画と切り離して確かめるため。
`lotsIn` の切り出しだけは既存の呼び出し元がそのまま使う（振る舞いは変わらない）。

- [ ] **Step 1: 改修前の基準値を控える**

「測定ヘルパ」と「フィクスチャ」をコンソールに貼ってから実行する。

```js
[["FN",FN],["FR",FR],["FP",FP],["FS",FS],["FD",FD],["FB",FB]].map(([t,f])=>{
  f(); const p=probe();
  return {t, colCount:p.colCount, colW:p.colW, tableW:p.tableW, tableH:p.tableH,
    上段欄:p.上段欄, 下段欄:p.下段欄, 引出線:p.引出線, top:p.top, bottom:p.bottom,
    sheetMsg:p.sheetMsg, warn:p.warn};
})
```

期待（**この値を Task 2・3 の非退行判定で使う**。上の「改修前の実測値」の表と一致すること）:

```
FN: colCount 14 / colW ["48px"] / tableW 674 / tableH 474.3
    上段欄 [96,96,96,96] / 下段欄 [96×7] / 引出線 5 / top 3 / bottom 6 / warn null
FR: colCount 16 / tableH 480.2 / 引出線 5 / top 6 / bottom 7 / warn "…上段 1件…"
FP: colCount 16 / tableH 478.1 / 引出線 1 / top 9 / bottom 6 / warn "…上段 4件…"
FS: colCount 16 / tableH 480.2 / 引出線 3 / top 11 / bottom 7 / warn "…上段 6件…"
FD: colCount 16 / tableH 478.1 / 引出線 3 / top 11 / bottom 6 / warn "…上段 6件…"
FB: colCount 16 / tableH 476   / 引出線 8 / top  1 / bottom 11 / warn "…下段 3件…"
```

- [ ] **Step 2: `lotsIn` をトップレベルへ移す**

`files/index.html:1676-1678` の

```js
  // まとめた欄は複数のロットを含む。欄の数で知らせると、実際に紙から落ちるロットの数を
  // 過少に申告してしまう（1欄に6ロット入っていても「1件」になる）
  const lotsIn=slots=>slots.reduce((a,g)=>a+(g.members?g.members.length:1),0);
```

の 3 行を**削除する**（同じ処理を Step 3 でトップレベルに置く。画面の告知からも呼ぶので、
関数の中に閉じておくと 2 か所に同じ式を書くことになる）。

- [ ] **Step 3: 3 つの関数を足す**

`files/index.html:2746` の `sheetSlots()` の閉じ括弧 `}` の直後、
`/* 欄に入りきらない文字を水平に縮めて1行に収める。` で始まるコメントの**前**に、次を挿入する。

```js
/* 欄に入っている荷物の数。まとめた欄は複数のロットを含むので、欄の数で数えると
   実際に紙から落ちるロットの数を過少に申告してしまう（1欄に6ロット入っていても「1件」）。
   欄数超過の警告と、救済の告知の両方がここを通る。 */
function lotsIn(slots){ return slots.reduce((a,g)=>a+(g.members?g.members.length:1),0); }
/* 欄の注釈を、置き場所のエリア名だけから作る。
   sheetEntries() は段ごとの基準エリア（上段なら軒下①）を注釈から省くが、
   下段へ回した欄では注釈が唯一の場所情報になるので、基準を省かずに作り直す。
   混載が1列に複数ロットを詰めるため、注釈が空の軒下①の欄が回ることは実際に起こる。 */
function slotAreaNote(areas){ return (areas && areas.length) ? "※"+areas.join("・") : ""; }
/* 上段・下段の欄と様式を1回で決める。欄数超過の警告と renderSheet() の両方がここを通る。
   2か所で別々に数えると、警告の件数と実際に紙へ出る欄がずれる。
   上段に入りきらない欄は、下段に空きがあればその末尾へ回す（救済）。
   ・様式の判定は救済前の件数で行う。先に wide にして上段の欄を増やし、
     それでもあふれる分だけを下段へ回す（上段の荷物はできるだけ上段に並べる）
   ・sheetLayout() は上段が4欄を超えた時点で wide にするので、救済が起きる日は必ず wide。
     SHEET_LAYOUTS の欄数を変えるとこの関係が崩れる
   ・回せるのは下段の空きの数まで。回しきれない分は従来どおり警告に残る
   ・回した欄は元の欄を浅く複製して作る。members と areas の配列は元の欄と共有するので、
     どちらも書き換えないこと。元の欄（top の中身）自体も書き換えない
   ・fromTop は renderSheet() が引き出し線の id を落とすのに使う目印 */
function sheetPlacement(){
  const top=sheetSlots("top");
  const base=sheetSlots("bottom");
  const lay=sheetLayout(top, base);
  const free=Math.max(0, lay.bottom-base.length);
  const over=Math.max(0, top.length-lay.top);
  const moved=top.slice(lay.top, lay.top+Math.min(free, over))
    .map(e=>({...e, fromTop:true, note:slotAreaNote(e.areas)}));
  return {lay, top, bottom:base.concat(moved), moved};
}
```

- [ ] **Step 4: 警告が変わっていないことを確認する**

`lotsIn` を移しただけなので、警告の文言は 1 文字も変わらないはず。

```js
(()=>{
  const r=[], W=n=>`⚠ 配置図の表に載りきらないロットがあります：上段 ${n}件。ブロック図で確認してください。`;
  FR(); r.push(["FR 上段 1件 のまま", probe().warn===W(1), probe().warn]);
  FP(); r.push(["FP 上段 4件 のまま", probe().warn===W(4), probe().warn]);
  FS(); r.push(["FS 上段 6件 のまま", probe().warn===W(6), probe().warn]);
  FD(); r.push(["FD 上段 6件 のまま", probe().warn===W(6), probe().warn]);
  FN(); r.push(["FN 警告なし", probe().warn===null, probe().warn]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 5: `slotAreaNote()` を直接確かめる**

```js
(()=>{
  const r=[];
  r.push(["空配列は空文字", slotAreaNote([])==="", slotAreaNote([])]);
  r.push(["undefined でも落ちない", slotAreaNote(undefined)==="", slotAreaNote(undefined)]);
  r.push(["1つなら ※軒下①", slotAreaNote(["軒下①"])==="※軒下①", slotAreaNote(["軒下①"])]);
  r.push(["2つなら ※軒下①・軒下②",
          slotAreaNote(["軒下①","軒下②"])==="※軒下①・軒下②", slotAreaNote(["軒下①","軒下②"])]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 6: `sheetPlacement()` を検証する**

```js
(()=>{
  const r=[];
  FN(); let pl=sheetPlacement();
  r.push(["FN は normal", pl.lay===SHEET_LAYOUTS.normal, pl.lay]);
  r.push(["FN は救済0件", pl.moved.length===0, pl.moved.length]);
  r.push(["FN の下段は sheetSlots と同件数", pl.bottom.length===6, pl.bottom.length]);
  FR(); pl=sheetPlacement();
  r.push(["FR は wide", pl.lay===SHEET_LAYOUTS.wide, pl.lay]);
  r.push(["FR は救済1件", pl.moved.length===1, pl.moved.length]);
  r.push(["FR の救済は 製品4 / 444",
          pl.moved[0].lot.name==="製品4" && pl.moved[0].lot.lot==="444", pl.moved[0].lot]);
  r.push(["FR の救済に fromTop", pl.moved[0].fromTop===true, pl.moved[0].fromTop]);
  r.push(["FR の救済の注釈が ※5棟壁際", pl.moved[0].note==="※5棟壁際", pl.moved[0].note]);
  r.push(["FR の下段は 8 件", pl.bottom.length===8, pl.bottom.length]);
  r.push(["FR の下段の末尾が救済分", pl.bottom[7]===pl.moved[0], true]);
  r.push(["FR の上段は 6 件のまま（切らない）", pl.top.length===6, pl.top.length]);
  r.push(["FR の元の欄を書き換えていない",
          pl.top[5].fromTop===undefined, {fromTop:pl.top[5].fromTop, note:pl.top[5].note}]);
  r.push(["FR は救済後に残りゼロ", pl.top.length-pl.lay.top-pl.moved.length===0, 0]);
  FP(); pl=sheetPlacement();
  r.push(["FP は救済2件（空き2 < あふれ4）", pl.moved.length===2, pl.moved.length]);
  r.push(["FP の救済は 部品F・部品G",
          pl.moved.map(e=>e.lot.name).join(",")==="部品F,部品G", pl.moved.map(e=>e.lot.name)]);
  r.push(["FP は救済後も 2 件残る", pl.top.length-pl.lay.top-pl.moved.length===2,
          pl.top.length-pl.lay.top-pl.moved.length]);
  FS(); pl=sheetPlacement();
  r.push(["FS は救済1件", pl.moved.length===1, pl.moved.length]);
  r.push(["FS の救済は p10", pl.moved[0].lot.name==="p10", pl.moved[0].lot.name]);
  r.push(["FS の救済の注釈が ※軒下① に作り直される",
          pl.moved[0].note==="※軒下①", pl.moved[0].note]);
  r.push(["FS の元の欄の注釈は空のまま", pl.top[5].note==="", pl.top[5].note]);
  FD(); pl=sheetPlacement();
  r.push(["FD は救済2件", pl.moved.length===2, pl.moved.length]);
  r.push(["FD は同じロットが下段に2欄（設計 §4-4 の想定どおり）",
          pl.bottom.filter(e=>e.lot.id===pl.moved[0].lot.id).length===2,
          pl.bottom.map(e=>e.lot.id)]);
  FB(); pl=sheetPlacement();
  r.push(["FB は救済0件（下段があふれ、上段はあふれない）", pl.moved.length===0, pl.moved.length]);
  r.push(["FB の下段は base のまま", pl.bottom.length===sheetSlots("bottom").length, pl.bottom.length]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 7: まとめを切っても成立することを確かめる**

「同じ品名のロットを1つの欄にまとめる」を OFF にすると、`sheetSlots()` は `members` を
持たない素の欄を返す。`lotsIn` と救済がその形でも動くことを見る。

```js
(()=>{
  const keep=mergeLots;
  try{
    mergeLots=false;
    FR();
    const pl=sheetPlacement();
    return {ok: pl.moved.every(e=>e.fromTop===true && e.note && e.note[0]==="※")
              && lotsIn(pl.moved)===pl.moved.length,
            救済数:pl.moved.length, 荷物数:lotsIn(pl.moved),
            注釈:pl.moved.map(e=>e.note)};
  } finally { mergeLots=keep; }
})()
```

期待: `ok:true`。`members` が無くても `lotsIn` が 1 件ずつ数え、注釈が付く。

- [ ] **Step 8: 描画が変わっていないことを確認する**

```js
FN(); const p=probe();
JSON.stringify({colCount:p.colCount, colW:p.colW, tableW:p.tableW, tableH:p.tableH,
  上段欄:p.上段欄, 下段欄:p.下段欄, 引出線:p.引出線, top:p.top, bottom:p.bottom,
  sheetMsg:p.sheetMsg, warn:p.warn})
```

期待: Step 1 の FN と**完全に同じ値**（まだ誰も `sheetPlacement()` を呼んでいないため）。

- [ ] **Step 9: Commit**

```bash
git add files/index.html
git commit -m "feat: 配置表の欄と様式を決める sheetPlacement() を足す"
```

---

## Task 2: 警告と紙を同時に救済へ切り替える

**Files:**
- Modify: `files/index.html:1670-1679`（欄数超過の警告）
- Modify: `files/index.html:2831-2834`（`renderSheet()` の `top` / `bottom` / `lay`）
- Modify: `files/index.html:2893`（`drawLeaders()` へ渡す id）
- Modify: `files/index.html:3148`（`drawLeaders()` のコメント）

**Interfaces:**
- Consumes: `sheetPlacement()`, `lotsIn(slots)`（Task 1）
- Produces: `renderSheet()` 内のローカル変数 `pl`（Task 3 が `fitSheetText()` に渡す）

> **警告と描画を 1 つのタスクにまとめる理由。** 警告だけを先に切り替えると、
> 救済したつもりの件数が警告から引かれるのに紙は救済していない状態になり、
> **落ちた荷物が無警告で消える**。これは本改修が解消しようとしている不都合そのもの。
> 中間状態を git に残さないため、両方を同じコミットに入れる。

- [ ] **Step 1: 警告を救済後の残りで数える**

`files/index.html:1670-1675` の

```js
  // 配置図の表の欄数は様式で決まる（sheetLayout）。載りきらないロットは黙って消えるので知らせる。
  // renderSheet() も同じ sheetLayout() を通すので、警告の件数と実際に紙へ出る欄数がずれない。
  const topSlots=sheetSlots("top"), bottomSlots=sheetSlots("bottom");
  const lay=sheetLayout(topSlots, bottomSlots);
  const overTop=topSlots.length-lay.top;
  const overBottom=bottomSlots.length-lay.bottom;
```

を次に置き換える。

```js
  // 配置図の表の欄数は様式で決まり、上段のあふれは下段の空き欄へ回る（sheetPlacement）。
  // renderSheet() も同じ sheetPlacement() を通すので、警告の件数と実際に紙へ出る欄数がずれない。
  // 回しきれずに紙から落ちる分だけを知らせる。
  const pl=sheetPlacement();
  const lay=pl.lay, topSlots=pl.top, bottomSlots=pl.bottom;
  // 上段のうち紙に残るのは lay.top 欄。そこから先は moved の分だけ下段へ回っている
  const kept=lay.top+pl.moved.length;
  const overTop=topSlots.length-kept;
  const overBottom=bottomSlots.length-lay.bottom;
```

- [ ] **Step 2: 件数を数える起点を直す**

`files/index.html:1678-1679`（Task 1 で `lotsIn` の 3 行を消したぶん、実際は上に詰まっている）の

```js
    if(overTop>0) parts.push(`上段 ${lotsIn(topSlots.slice(lay.top))}件`);
    if(overBottom>0) parts.push(`下段 ${lotsIn(bottomSlots.slice(lay.bottom))}件`);
```

を次に置き換える（**`slice` の起点も `kept` にする。直し忘れると件数だけ救済前のままになる**）。

```js
    if(overTop>0) parts.push(`上段 ${lotsIn(topSlots.slice(kept))}件`);
    if(overBottom>0) parts.push(`下段 ${lotsIn(bottomSlots.slice(lay.bottom))}件`);
```

- [ ] **Step 3: `renderSheet()` で配置を1回だけ求める**

`files/index.html:2831-2834` の

```js
  const top=sheetSlots("top");
  const bottom=sheetSlots("bottom");
  // 欄が足りない日は wide（16列×42px・上段5欄・下段8欄）。総幅 672px は変わらない
  const lay=sheetLayout(top, bottom);
```

を次に置き換える。

```js
  // 上段・下段の欄と様式は sheetPlacement() が1回で決める。欄数超過の警告も同じ関数を通るので、
  // 警告の件数と紙に出る欄がずれない。
  // 欄が足りない日は wide（16列×42px・上段5欄・下段8欄）。総幅 672px は変わらない。
  // それでも上段に入りきらない欄は、下段に空きがあればその末尾へ回っている（bottom の末尾）
  const pl=sheetPlacement();
  const top=pl.top, bottom=pl.bottom, lay=pl.lay;
```

- [ ] **Step 4: 救済した欄には引き出し線の id を渡さない**

`files/index.html:2893` の

```js
  drawLeaders(grid.anchors, bottom.map(e=>e.lot.id));
```

を次に置き換える。

```js
  // 救済で下段へ回した欄には線を引かない。同じロットがメインと軒下に分割配置された日、
  // アンカーの有無に任せると救済欄からメインの同じマスへ2本目の線が伸びて誤読させる
  drawLeaders(grid.anchors, bottom.map(e=>e.fromTop ? null : e.lot.id));
```

- [ ] **Step 5: `drawLeaders()` のコメントを直す**

`files/index.html:3148` の

```js
    if(!a || !src) return;                      // メイン外のロットには線を引かない
```

を次に置き換える（コメントに書いた前提は放っておくと古くなる。教訓 2026-07-19）。

```js
    // メイン外のロットには線を引かない。救済で下段へ回した欄は id が null で渡ってくる
    if(!a || !src) return;
```

- [ ] **Step 6: 通常日の非退行を確かめる**

```js
FN(); const p=probe();
JSON.stringify({colCount:p.colCount, colW:p.colW, tableW:p.tableW, tableH:p.tableH,
  上段欄:p.上段欄, 下段欄:p.下段欄, 引出線:p.引出線, top:p.top, bottom:p.bottom,
  sheetMsg:p.sheetMsg, warn:p.warn})
```

期待（**Task 1 Step 1 の FN と 1 つ残らず一致すること**）:

```
colCount 14 / colW ["48px"] / tableW 674 / tableH 474.3
上段欄 [96,96,96,96] / 下段欄 [96×7] / 引出線 5 / top 3 / bottom 6 / sheetMsg "" / warn null
```

`btm()` でも下段が改修前のままであることを見る。

```js
FN(); btm()
```

期待: 7 件。うち実データは 6 件で、品名は `["部品E","部品C","部品D","部品A","部品B","製品X"]` の順
（`製品X` の注釈は `※PC横`）。7 件目（`i:6`）は空欄（`slotCells()` は欄が空でも `lay.bottom` 個ぶん
`td` を出す）。`i` は 0〜6（**8 欄目は存在しない**。normal は下段 7 欄）。

- [ ] **Step 7: 救済が紙に出て、警告が減ることを確かめる**

```js
(()=>{
  const r=[];
  FR(); let p=probe(), b=btm();
  r.push(["FR 警告が消える", p.warn===null, p.warn]);
  r.push(["FR 下段は8欄", b.length===8, b.length]);
  r.push(["FR 8欄目 = 製品4 / 444 / ※5棟壁際",
          b[7].品名==="製品4" && b[7].ロット==="444" && b[7].注釈==="※5棟壁際", b[7]]);
  r.push(["FR 8欄目にP数が出る", !!b[7].P数, b[7]]);
  r.push(["FR 1〜7欄目は改修前と同じ品名",
          b.slice(0,7).map(x=>x.品名).join(",")==="部品E,部品C,部品D,部品A,部品1,製品Z,製品Y",
          b.slice(0,7).map(x=>x.品名)]);
  r.push(["FR 上段は5欄のまま", p.上段欄.length===5, p.上段欄]);
  FP(); p=probe(); b=btm();
  r.push(["FP 警告が 上段 2件 に減る", !!p.warn && p.warn.includes("上段 2件"), p.warn]);
  r.push(["FP 7・8欄目が 部品F・部品G で注釈 ※軒下②",
          b[6].品名==="部品F" && b[7].品名==="部品G"
          && b[6].注釈==="※軒下②" && b[7].注釈==="※軒下②", [b[6],b[7]]]);
  FS(); p=probe(); b=btm();
  r.push(["FS 警告が 上段 5件 に減る", !!p.warn && p.warn.includes("上段 5件"), p.warn]);
  r.push(["FS 8欄目 = p10 / Lp10 / ※軒下①（改修前は注釈が空だった欄）",
          b[7].品名==="p10" && b[7].ロット==="Lp10" && b[7].注釈==="※軒下①", b[7]]);
  FD(); p=probe(); b=btm();
  r.push(["FD 警告が 上段 4件 に減る", !!p.warn && p.warn.includes("上段 4件"), p.warn]);
  r.push(["FD 3欄目と7欄目に同じ p2 が出る（設計 §4-4）",
          b[2].品名==="p2" && b[6].品名==="p2", [b[2],b[6]]]);
  r.push(["FD 3欄目は注釈なし・7欄目は ※軒下②",
          b[2].注釈==="" && b[6].注釈==="※軒下②", [b[2].注釈,b[6].注釈]]);
  r.push(["FD 8欄目 = p7 / ※軒下②・出庫口横・5棟壁際",
          b[7].品名==="p7" && b[7].注釈==="※軒下②・出庫口横・5棟壁際", b[7]]);
  FB(); p=probe();
  r.push(["FB は下段の警告のまま（救済0件）", !!p.warn && p.warn.includes("下段"), p.warn]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 8: 上段の欄が改修前と変わっていないことを確かめる**

救済は下段に足すだけで、上段の 5 欄の中身は改修前と同じはず。

```js
(()=>{
  const topTxt=()=>{
    const tbl=document.querySelector("#sheetView .sheet table");
    const rows=[...tbl.rows].filter(r=>r.querySelector("td.slot"));
    return [...rows[0].querySelectorAll("td.slot")].map(td=>td.textContent.trim());
  };
  const r=[];
  FR(); r.push(["FR 上段", topTxt().join(",")==="部品B,部品2,部品3,製品W,製品X", topTxt()]);
  FN(); r.push(["FN 上段", topTxt().filter(x=>x).length===3, topTxt()]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 9: 救済した欄から線が出ていないことを確かめる**

引出線の**本数**は救済の前後で変わらない（救済欄は元から線が引かれない）。
本数ではなく、線の**起点の x 座標**が救済欄の x 範囲に入らないことを見る。

```js
(()=>{
  const r=[];
  const check=(movedIdx)=>{
    const sheet=document.querySelector("#sheetView .sheet");
    const tbl=sheet.querySelector("table");
    const z=parseFloat(getComputedStyle(sheet).zoom)||1;
    const base=tbl.getBoundingClientRect();
    const btmp=[...tbl.querySelectorAll("tr.btmp td")];
    // 線の起点 x（矢頭は d が "M-" で始まるので除く）
    const x0=[...sheet.querySelectorAll("svg path")]
      .map(p=>p.getAttribute("d")||"").filter(d=>!d.startsWith("M-"))
      .map(d=>parseFloat(d.slice(1).split(" ")[0]));
    const hit=movedIdx.filter(i=>{
      const q=btmp[i].getBoundingClientRect();
      const l=(q.left-base.left)/z, rr=(q.right-base.left)/z;
      return x0.some(x=>x>l && x<rr);
    });
    return {線の本数:x0.length, 救済欄:movedIdx, 救済欄から出ている線:hit};
  };
  FR(); probe(); const c1=check([7]);
  r.push(["FR 救済欄(8欄目)から線なし", c1.救済欄から出ている線.length===0, c1]);
  r.push(["FR 線の本数は改修前と同じ 5", c1.線の本数===5, c1]);
  FP(); probe(); const c2=check([6,7]);
  r.push(["FP 救済欄(7・8欄目)から線なし", c2.救済欄から出ている線.length===0, c2]);
  r.push(["FP 線の本数は改修前と同じ 1", c2.線の本数===1, c2]);
  FD(); probe(); const c3=check([6,7]);
  r.push(["FD 救済欄から線なし（同じロットが3欄目にもいる日）",
          c3.救済欄から出ている線.length===0, c3]);
  r.push(["FD 線の本数は改修前と同じ 3（2本目が増えていない）", c3.線の本数===3, c3]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]]), c1, c2, c3};
})()
```

期待: `{ok:true, ng:[]}`

- [ ] **Step 10: 印刷が1ページに収まることを確かめる**

`@media print` の宣言は `getComputedStyle` では読めないので CSSOM を走査する（教訓 2026-08-30）。

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
  const out={};
  [["FN",FN],["FR",FR],["FP",FP],["FS",FS],["FD",FD]].forEach(([t,f])=>{
    f(); probe(); out[t]=h();
    r.push([t+" の印刷高さが上限内", out[t]<=PRINT_H_LIMIT, {h:out[t], PRINT_H_LIMIT}]);
  });
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]]), 高さ:out};
})()
```

期待: `{ok:true, ng:[]}`。`PRINT_H_LIMIT` は 718.5。

- [ ] **Step 11: 文字があふれていないことを確かめる**

救済で下段の注釈が増えるので、欄に入りきらない文字が出ていないかを見る。
`FD` の 8 欄目は注釈が `※軒下②・出庫口横・5棟壁際`（14 文字）で、**いちばん長い**。

```js
(()=>{
  const r=[];
  [["FR",FR],["FP",FP],["FS",FS],["FD",FD]].forEach(([t,f])=>{
    f(); const p=probe();
    r.push([t+" 切れている欄なし", !p.sheetMsg.includes("入りきらない欄"), p.sheetMsg]);
  });
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`。
**落ちた場合は、期待値を書き換えず、どの欄がどれだけあふれたかを報告して止まること。**
注釈が長すぎるのは設計側の問題（`FIT_MIN_SCALE` を割る）で、実装で握りつぶしてはいけない。

- [ ] **Step 12: Commit**

```bash
git add files/index.html
git commit -m "feat: 上段のあふれを下段の空き欄で受ける"
```

---

## Task 3: 救済が起きた日を画面にだけ知らせる

**Files:**
- Modify: `files/index.html:2759-2762`（`fitSheetText()` の引数）
- Modify: `files/index.html:2798` 付近（告知の組み立て）
- Modify: `files/index.html:2892`（`renderSheet()` からの呼び出し）

**Interfaces:**
- Consumes: `sheetPlacement()`, `lotsIn(slots)`（Task 1）、`renderSheet()` のローカル変数 `pl`（Task 2）
- Produces: `fitSheetText(pl)` … `pl` は省略可。省略時は自分で `sheetPlacement()` を引く

`#sheetMsg` は印刷 CSS で `display:none` になるので、ここに出しても**紙には出ない**。
現場が「軒下の荷物が下段に出ている」と不具合を疑うのを防ぐための、画面だけの案内。

> `fitSheetText()` は `applyDisplay()`（`files/index.html:2583`）からも引数なしで呼ばれる。
> **引数を必須にすると表示設定を変えた瞬間に落ちる。** 必ず省略可にすること。

- [ ] **Step 1: 引数を様式から配置に変える**

`files/index.html:2759-2762` の

```js
/* lay: 配置表の様式。renderSheet() からは求め済みのものを渡す。
   applyDisplay() など様式を持たない呼び出し元のために省略可にしてある。 */
function fitSheetText(lay){
  if(!lay) lay=sheetLayout(sheetSlots("top"), sheetSlots("bottom"));
```

を次に置き換える。

```js
/* pl: sheetPlacement() の戻り値（様式と、下段へ回した欄）。
   renderSheet() からは求め済みのものを渡す。
   applyDisplay() など配置を持たない呼び出し元のために省略可にしてある。 */
function fitSheetText(pl){
  if(!pl) pl=sheetPlacement();
  const lay=pl.lay;
```

- [ ] **Step 2: 救済の告知を足す**

`files/index.html:2798` 付近の

```js
  if(lay===SHEET_LAYOUTS.wide){
    html+=`<div class="msg ok">※ 荷物が多いため、今日は欄を増やしています`
        + `（上段 ${lay.top} 欄・下段 ${lay.bottom} 欄）。用紙の大きさは変わりません。</div>`;
  }
```

を次に置き換える（`wide` の告知はそのまま。その後ろに 1 つ足す）。

```js
  if(lay===SHEET_LAYOUTS.wide){
    html+=`<div class="msg ok">※ 荷物が多いため、今日は欄を増やしています`
        + `（上段 ${lay.top} 欄・下段 ${lay.bottom} 欄）。用紙の大きさは変わりません。</div>`;
  }
  // 上段に入りきらない荷物を下段の空き欄へ回した日も、画面にだけ知らせる。
  // 件数は欄の数ではなく荷物の数（まとめた欄は複数のロットを含む）
  if(pl.moved.length){
    html+=`<div class="msg ok">※ 上段に入りきらない ${lotsIn(pl.moved)} 件を`
        + `下段の空き欄に回しています。</div>`;
  }
```

- [ ] **Step 3: `renderSheet()` から配置を渡す**

`files/index.html:2892` の

```js
  fitSheetText(lay);              // 折り返しは行の高さを変えるので線より先に確定させる
```

を次に置き換える。

```js
  fitSheetText(pl);               // 折り返しは行の高さを変えるので線より先に確定させる
```

- [ ] **Step 4: 告知の出方を検証する**

```js
(()=>{
  const r=[];
  const msg=()=>{
    const box=document.getElementById("sheetMsg");
    return {告知:[...box.querySelectorAll(".msg.ok")].map(d=>d.textContent.trim()),
            警告:[...box.querySelectorAll(".msg.warn")].map(d=>d.textContent.trim())};
  };
  FN(); probe(); let m=msg();
  r.push(["FN は告知なし", m.告知.length===0, m]);
  r.push(["FN は警告もなし", m.警告.length===0, m]);
  FR(); probe(); m=msg();
  r.push(["FR は告知が2本（wide＋救済）", m.告知.length===2, m]);
  r.push(["FR 1本目が wide", m.告知[0].includes("欄を増やしています"), m]);
  r.push(["FR 2本目が救済", m.告知[1].includes("下段の空き欄に回しています"), m]);
  r.push(["FR の救済が 1 件", m.告知[1].includes("1 件"), m]);
  FP(); probe(); m=msg();
  r.push(["FP の救済が 2 件", m.告知.length===2 && m.告知[1].includes("2 件"), m]);
  FS(); probe(); m=msg();
  r.push(["FS の救済が 1 件", m.告知.length===2 && m.告知[1].includes("1 件"), m]);
  FD(); probe(); m=msg();
  r.push(["FD の救済が 2 件", m.告知.length===2 && m.告知[1].includes("2 件"), m]);
  FB(); probe(); m=msg();
  r.push(["FB は wide の告知だけ（救済0件）",
          m.告知.length===1 && m.告知[0].includes("欄を増やしています"), m]);
  return {ok:r.every(x=>x[1]), ng:r.filter(x=>!x[1]).map(x=>[x[0],x[2]])};
})()
```

期待: `{ok:true, ng:[]}`（FB は下段があふれる日なので `wide`。告知は wide の 1 本だけ）

- [ ] **Step 5: 表示設定から呼んでも落ちないことを確かめる**

引数なしの呼び出し元（`applyDisplay()`）が生きていることを見る。

```js
(()=>{
  FR(); switchTab('sheet');
  let err=null;
  try{ applyDisplay(); }catch(e){ err=String(e); }
  const box=document.getElementById("sheetMsg");
  const ok=[...box.querySelectorAll(".msg.ok")].map(d=>d.textContent.trim());
  return {ok:err===null && ok.length===2 && ok[1].includes("下段の空き欄に回しています"),
          err, 告知:ok};
})()
```

期待: `{ok:true, err:null, 告知:[wideの告知, 救済の告知]}`
（引数なしでも `sheetPlacement()` を自分で引くので、告知が消えない）

- [ ] **Step 6: 印刷に出ないことを確かめる**

`#sheetMsg` が印刷 CSS で `display:none` になっていることを CSSOM で確かめる。

```js
(()=>{
  let hidden=false;
  for(const ss of document.styleSheets){
    let rules; try{ rules=ss.cssRules; }catch(e){ continue; }
    for(const rule of rules||[]){
      if(rule.type===CSSRule.MEDIA_RULE && rule.conditionText.includes("print")){
        for(const inner of rule.cssRules){
          if(inner.selectorText && inner.selectorText.includes("#sheetMsg")
             && inner.style.display==="none") hidden=true;
        }
      }
    }
  }
  return {ok:hidden};
})()
```

期待: `{ok:true}`

- [ ] **Step 7: 通常日の非退行を再確認する**

```js
FN(); const p=probe(); ({sheetMsg:p.sheetMsg, colCount:p.colCount, 引出線:p.引出線, warn:p.warn})
```

期待: `{sheetMsg:"", colCount:14, 引出線:5, warn:null}`

- [ ] **Step 8: Commit**

```bash
git add files/index.html
git commit -m "feat: 下段の空き欄に回した日を画面にだけ知らせる"
```

---

## Task 4: キャッシュを繰り上げる

**Files:**
- Modify: `files/sw.js:6`

**Interfaces:**
- Consumes: Task 1〜3 のすべて
- Produces: なし

`files/sw.js` は cache-first。キャッシュ名を変えないと、インストール済みの端末に
更新が永続的に届かない（教訓 2026-07-09）。**このタスクは必ず最後に行う。**

- [ ] **Step 1: 現在の値を確認する**

```bash
grep -n "CACHE_VERSION" files/sw.js
```

期待: `6:const CACHE_VERSION = "v26";`

- [ ] **Step 2: 繰り上げる**

`files/sw.js:6` を次に置き換える。

```js
const CACHE_VERSION = "v27";
```

- [ ] **Step 3: 1行だけ変わったことを確認する**

```bash
git diff --stat files/sw.js
```

期待: `1 file changed, 1 insertion(+), 1 deletion(-)`

- [ ] **Step 4: Commit**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v27 に上げる"
```

---

## Task 5: 実機確認（人の作業）

自動検証では見えない「紙の見た目」を目で見る。**Pixel 9a で印刷プレビューまで確認する。**
配布は前回のブランチと同じ手順で行う。

- [ ] FN（通常日）の紙が、改修前と見分けがつかないこと
- [ ] FR の紙で、下段の 8 欄目に `製品4 / 444 / ※5棟壁際` が出ていること
- [ ] FR の 8 欄目に**引き出し線が引かれていない**こと。他の 5 本は改修前と同じ位置に出ていること
- [ ] FP の紙で、下段の 7・8 欄目に `部品F`・`部品G`（`※軒下②`）が出ていること
- [ ] FS の紙で、下段の 8 欄目の注釈が `※軒下①` と読めること
- [ ] FD の紙で、**同じ `p2` が 3 欄目（線あり・注釈なし）と 7 欄目（線なし・`※軒下②`）に並ぶ**のを見て、
      現場が P 数を取り違えないと言えるか。**取り違えると判断された場合は設計 §4-4 の再検討が要る**
- [ ] FD の 8 欄目の長い注釈（`※軒下②・出庫口横・5棟壁際`）が読めること
- [ ] 救済した欄が、注釈と線の無さで「メイン以外」と読めること。
      **読み取れないと判断された場合は再設計が要る**
- [ ] FR・FP・FS・FD とも A4 横 1 ページに収まること
- [ ] 画面の告知（`※ 上段に入りきらない N 件を下段の空き欄に回しています。`）が
      印刷プレビューには**出ていない**こと

---

## Self-Review

**1. 仕様の網羅**

| 設計書の項目 | 対応タスク |
|---|---|
| §2-1 上段 → 下段のみ | Task 1 Step 3（`sheetPlacement()` は上段からしか回さない） |
| §2-2 `wide` を先、救済は最後 | Task 1 Step 3（`sheetLayout()` を救済前の件数で引く） |
| §2-3 注釈を必ず出す | Task 1 Step 3、検証は Step 5・6 と Task 2 Step 7（FS） |
| §2-4 引き出し線を引かない | Task 2 Step 4・5、検証は Task 2 Step 9 |
| §2-5 画面にだけ告知 | Task 3 |
| §2-6 決めを 1 関数に集約 | Task 1 Step 3 ／ Task 2 Step 1・3 |
| §3 決めの流れ | Task 1 Step 3・6 |
| §3 救済しても足りない日 | Task 2 Step 1・2、検証は Task 2 Step 7（FP・FS・FD） |
| §4-1 下段の末尾から詰める | Task 1 Step 3（`base.concat(moved)`）、検証は Step 6 |
| §4-2 注釈の作り直し | Task 1 Step 3、検証は Step 5（単体）と Task 2 Step 7（FS で E2E） |
| §4-3 引き出し線 | Task 2 Step 4・5・9（FD を含む） |
| §4-4 同じロットが 2 欄 | Task 1 Step 6（FD）／ Task 2 Step 7・9（FD）／ Task 5 |
| §5 告知 | Task 3 Step 2・4 |
| §6-1〜6-5 実装対象 | Task 1〜3 |
| §6-6 `CACHE_VERSION` | Task 4 |
| §6-7 触らないもの | 変更対象に含めていない |
| §7-1 SW cache-first | Task 4 |
| §7-2 非表示タブ | `probe()` が `switchTab('sheet')` を内蔵 |
| §7-3 `@media print` と CSSOM | Task 2 Step 10 ／ Task 3 Step 6 |
| §7-4 背景色 | 色で区別していない（注釈と線の有無だけ） |
| §7-5 到達不能でないこと | 6 本のフィクスチャすべて、改修前のコードで到達を実測済み |
| §7-6 コメントの前提 | Task 2 Step 5 |
| §8-2 検証項目 1〜13 | Task 1 Step 1・4〜8 ／ Task 2 Step 6〜11 ／ Task 3 Step 4〜7 |
| §8-3 実機確認 | Task 5 |
| §10 既知の制限 | 実装しない（記録のみ） |

**2. プレースホルダ**: 「TBD」「適切に」「同様に」の類は無い。すべてのコードステップに置換前後の実コードを載せた。

**3. 型・名前の一貫性**

- `sheetPlacement()` の戻り値のプロパティは `lay` / `top` / `bottom` / `moved` の 4 つ。全タスクで同じ名前
- `renderSheet()` と `renderResult()` の中の変数名は `pl`。`lay` は `pl.lay` の別名として置く
- `lotsIn(slots)` は Task 1 でトップレベルに移し、警告（Task 2）と告知（Task 3）の両方から呼ぶ
- `slotAreaNote(areas)` は `sheetPlacement()` からのみ呼ぶ
- 救済した欄の目印は `fromTop`（真偽値）。`renderSheet()` の `drawLeaders` 呼び出しだけが読む
- 測定ヘルパは `probe()` / `btm()` の 2 つ。下段の品名行は `slotRows[3]`（注釈行は `td.slot` を持たないため）

**4. `/dig` の指摘の反映**

| 指摘 | 反映 |
|---|---|
| B-1 `btm()` / `probe()` の行 index が 1 つずれ | 測定ヘルパを `slotRows[3]`（品名）／`[4]`（ロット）に訂正。実測で確認 |
| B-2 「FN 8欄目は空」は原理的に false | Task 2 Step 6 で `btm().length===7` を見る形に変更 |
| B-3 行番号が Task 1 適用前の値 | Global Constraints に「行番号ではなく置換前コードの文字列で特定する」と明記 |
| C 注釈の作り直しは既定設定で実際に起こる | 設計書 §4-2 を訂正。フィクスチャ FS を追加し、Task 2 Step 7 で E2E 検証 |
| D-1 同じロットが下段に 2 欄 | ユーザー判断で「そのまま出す」。設計書 §4-4 に追記。FD で検証し、Task 5 で目視 |
| D-2 同じエリアが上下段に割れる | ユーザー判断で許容。設計書 §10 に明記 |
| E-1 実機確認のタイミングと配布 | ユーザー判断で従来どおり最後。配布は前回と同じ手順（Task 5 に明記） |
| E-2 救済を止めるスイッチが無い | 設計書 §10 に既知の制限として明記 |
| E-3 まとめ OFF の経路が未検証 | Task 1 Step 7 を追加 |
| E-4 救済 0 件のパスが未検証 | フィクスチャ FB を追加（Task 1 Step 6 / Task 2 Step 7 / Task 3 Step 4） |
| E-5 `{...e}` は浅いコピー | Task 1 Step 3 のコメントに明記 |
| E-6 「救済は wide の日にしか起きない」が未文書 | Task 1 Step 3 のコメントに明記 |
