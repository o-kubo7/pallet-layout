# 同じ品名のロットを1つの欄にまとめる 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の表で、同じ品名・同じ SNP・同じ種別・同じ置き場所のロットを1つの欄にまとめ、欄不足で紙に載らないロットが出る状態を緩和する。ただしメインに乗った荷物は引き出し線の 1:1 対応があるので対象外にする。

**Architecture:** まとめ処理を `mergeEntries()` に独立させ、段ごとの欄を返す `sheetSlots(tier)` から呼ぶ。`renderSheet()`（紙）と欄数超過の警告（`renderResult()`）の両方が `sheetSlots()` を通るので、片方だけがまとめを見て件数がずれることがない。ロット番号は3件以上で縦に積むが、縦積みの入れ物 `.fitcol` を flex にすると `fitSheetText()` が自然幅を測れなくなるため block ＋ `width:max-content` にする。

**Tech Stack:** 単一 HTML ファイルの PWA。ビルドツールなし、テストランナーなし、依存パッケージなし。素の JavaScript と localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-08-31-sheet-lot-merge-design.md`

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の 2 つだけ。他のファイルは変更しない。
- **`.fitcol` を flex にしてはいけない。** `.sheet .fit` は `display:inline-block`（`files/index.html:284`）で、
  flex の子になると block 化され `align-items:stretch` で欄幅いっぱいに伸びる。
  `fitSheetText()` の `natural`（`files/index.html:2682`）が自然幅 76.9px ではなく欄幅 93px を返し、
  `k≒1` で圧縮が掛からず、`white-space:nowrap` のまま `.sheet td{overflow:hidden}`（`files/index.html:248`）で
  **ロット番号が無警告で右から切れる**。下限 0.4 に落ちないので警告も出ない。実測で確認済み。
- **`width:max-content` は CSS ルールに書く。インラインスタイルで与えてはいけない。**
  `fitSheetText()` が測定前に `sp.style.width=""` を掛ける（`files/index.html:2681`）ため、
  インラインで与えた `max-content` は測定の直前に消える。実測で確認済み。
- **`.fitcol .fit` に `transform-origin` を書かない。** `.sheet .fit` の既存の
  `transform-origin:left center`（`files/index.html:284`）をそのまま継がせる。
  `center` にすると、はみ出したときに箱の中心が保存されて**右へ 37.5px はみ出す**。実測で確認済み。
- **`palletSlotText()` の引数は `{pallets, half}` を持つオブジェクト。** まとめた欄では
  `e` ではなく各メンバー `{lot, pallets, half}` を渡す。まとめた欄の `e` 自体は
  `pallets` / `half` を持たない。
- **「半」を合算しない。** メンバーごとの `palletSlotText()` の結果を並べる。
  全員一致なら `各` を頭に付ける。一致判定は文字列の完全一致。
- まとめキーは **品名 ＋ SNP ＋ 種別 ＋ エリア集合**。1つでも違えば別の欄にする。
- **基準エリア名を直書きしない。** `sheetAreas("bottom")[0]` で引く。
  `gridRows()`（`files/index.html:2853`）も同じ式で基準を引くので、設定でメインの掲載先を
  変えても、まとめの除外対象と引き出し線の対象が常に一致する。
- **判定はエリア集合で行う。アンカーの有無で判定しない。** グリッドが描けない日
  （`files/index.html:2858` で `anchors:[]` を返す）に表の形が変わってしまう。
- 設定の保存は **専用の `STORE_KEY.merge`**。`DEFAULT_DISPLAY` にキーを足してはいけない。
  `applyDisplay()`（`files/index.html:2528`）が `st.setProperty(DISPLAY_VARS[k], ...)` を
  無条件に呼ぶため `DISPLAY_VARS[k]` が undefined になり、
  `resetDisplay()` の「文字を初期値に戻す」がまとめ設定まで戻してラベル詐称になる。
- 設定を切り替えたら **`redraw()`** を呼ぶ。`renderSheet()` だけでは欄数超過の警告
  （`files/index.html:1627`、`renderResult()` の中）が古いまま残る。
- `drawLeaders()` の呼び出し `bottom.map(e=>e.lot.id)`（`files/index.html:2785`）は**変えない**。
  まとまった欄の代表 id はメインにアンカーを持たないので読み飛ばされ、
  欄と `slotIds` は同じ配列から作るので添字はずれない。
- `sheetEntries()` の既存の戻り値のキー（`lot` / `pallets` / `half` / `note`）は変えない。`areas` を足すだけ。
- `files/index.html` を変更したら、最後に `files/sw.js` の `CACHE_VERSION` を
  `"v24"` から `"v25"` に上げる（Task 7）。上げないとインストール済みの PWA に更新が届かない。

## 検証の方針

このプロジェクトにはテストランナーが無い。各タスクの検証は、ブラウザで開いたページに対して
`javascript_tool`（`mcp__Claude_Browser__javascript_tool`）で検証スクリプトを実行し、
返り値の `ok` が `true` であることを確認する形で行う。

**必ず守ること:**

- **サーバはポート 8765 で既に動いている場合がある。** 動いていなければ `preview_start` の
  `pallet-layout`（`python3 -m http.server 8765 --directory files`）で起動する。
  既に動いていれば `preview_start` に `url: "http://localhost:8765/index.html"` を渡して開く。
  Bash でサーバを起動しない。
- **コードを変更したらページをリロードしてから測る。** この PWA は単一ファイルで HMR が無い。
- **測る前に `switchTab('sheet')` を呼ぶ。** 非表示タブでは `getBoundingClientRect()` が
  0 を返す（2026-08-23 の教訓）。
- **`window.alert` と `window.confirm` を差し替えてから入力を差し替える。**
  `loadSample()` と `run()` はダイアログでスクリプトを止める。
- **この検証スクリプトを実機（Pixel 9a）に貼らないこと。** 入力を全置換するので
  利用者の入力が消える。実機確認は画面を触る手順だけで行う。
- 合成イベントは使わない。ハンドラ関数（`toggleMerge()` など）を直接呼ぶ（2026-08-27 の教訓）。

**改修前に実測した基準値**（既定設定・`basic` サンプル・`switchTab('sheet')` 後）:

- `.sheet` の `innerHTML.length` = **11835**
- `.sheet table` の高さ = 実寸 **474.3px** / 印刷 664.0px（用紙の 90.6%、上限 718.5px）
- `tr.grow` の本数 = **7**
- `.fit` の個数 = **29**、`.fitcol` の個数 = **0**
- `svg.leaders path` の本数 = **10**（線 5 本 × 矢頭込み）
- `sheetEntries(sheetAreas("top"), "軒下①").length` = **3**
- `sheetEntries(sheetAreas("bottom"), "メイン").length` = **6**

**ロット欄の実測**（`fsLot` 既定 13px、欄の実効幅 93px、9 桁ロット）:

- 1 件 = 76.9px → 圧縮なし
- 2 件 `/` 連結 = 160.0px → **k = 0.581**
- 3 件 = 243.1px → **k = 0.383**（下限 0.4 を割る。1 行に収める選択肢が無い）
- 4 件 = 326.2px → k = 0.285

**`.fitcol` の実測**（`display:block` ＋ `width:max-content` ＋ `margin:0 auto`）:

- 3 件・9 桁 → 自然幅 76.9px を正しく取得、左右オフセット 9.5px / 9.5px で中央寄せ、欄の高さ 50.3px
- 1 件・20 桁（はみ出す）→ k=0.544、左右 1.5px / 1.5px で**欄内に収まる**
- 6 件・9 桁 → 欄の高さ 97.1px
- 短い/長いの混在 → 各行が独立に圧縮され、すべて欄内に収まる

**共通のヘルパ**（各タスクの検証スクリプトの冒頭に貼る）:

```js
const H = {
  // 入力を差し替えて配置し、配置表タブを開く。ダイアログは潰す
  load(rows){
    const oc=window.confirm, oa=window.alert;
    window.confirm=()=>true; window.alert=()=>{};
    try{
      document.querySelector("#lotTable tbody").innerHTML="";
      rows.forEach(addRow); syncCards(); run(true); switchTab("sheet");
    } finally { window.confirm=oc; window.alert=oa; }
  },
  sample(which){
    const oc=window.confirm, oa=window.alert;
    window.confirm=()=>true; window.alert=()=>{};
    try{ loadSample(which); switchTab("sheet"); }
    finally { window.confirm=oc; window.alert=oa; }
  },
  sheet(){ return document.querySelector("#sheetView .sheet"); },
  areasOf(id){ return lastSp.filter(s=>s.cols.some(c=>c.fills.some(f=>f.id===id))).map(s=>s.name); },
};
// 検証用シナリオ S。メインに 3 件・軒下①に部品A 4 件が落ちる（実測で確認済み）
const SCENARIO = (() => {
  const r=[{type:"仕掛品", name:"詰め物F", lot:"F-001", snp:10, qty:630}];
  for(let i=1;i<=6;i++) r.push({type:"仕掛品", name:"部品A", lot:"10000000"+i, snp:10, qty:20});
  return r;
})();
```

**シナリオ S の配置**（改修前に実測して確認済み）:

- メイン … `F-001`（63P）、`100000001`（2P）、`100000002`（2P）
- 軒下① … `100000003` / `100000004` / `100000005` / `100000006`（各 2P）
- 改修前の上段の欄 = **4 件**（部品A が 4 欄を占める）
- 改修後の上段の欄 = **1 件**（4 ロットを 1 欄にまとめ、ロットは縦積み、パレット数は `各2P`）
- 下段の欄 = **3 件**。全員メインを含むのでまとめない。引き出し線は従来どおり

---

### Task 1: `sheetSlots(tier)` を新設して呼び出しを1か所に寄せる（挙動不変）

まとめ処理を入れる前に、段ごとの欄を作る経路を1つにする。
現在この 2 行が `renderResult()` と `renderSheet()` に重複しており、
片方だけにまとめを入れると欄数超過の警告の件数が実際の欄数とずれる。

**Files:**
- Modify: `files/index.html:2650`（`sheetEntries()` の戻り値）
- Modify: `files/index.html:2652` の直後（`sheetSlots()` を新設）
- Modify: `files/index.html:1626-1628`（欄数超過の警告の呼び出し）
- Modify: `files/index.html:2722-2726`（`renderSheet()` の呼び出し）

**Interfaces:**
- Produces: `sheetSlots(tier)` … `tier` は `"top"` / `"bottom"`。戻り値は
  `sheetEntries()` と同じ配列（この時点ではまとめない）
- Produces: `sheetEntries()` の戻り値に `areas`（エリア名の配列）が加わる

- [ ] **Step 1: `sheetEntries()` の戻り値に `areas` を足す**

`files/index.html:2650` の `return` を差し替える。

変更前:

```js
    return {lot:e.lot, pallets:e.pallets, half, note: extra.length ? ("※"+extra.join("・")) : ""};
```

変更後:

```js
    // areas は mergeEntries() のまとめキーに使う。置き場所が違うロットは
    // 注釈が唯一の場所情報なので、まとめずに別の欄へ分ける
    return {lot:e.lot, pallets:e.pallets, half, areas:e.areas,
            note: extra.length ? ("※"+extra.join("・")) : ""};
```

- [ ] **Step 2: `sheetSlots()` を新設する**

`sheetEntries()` の閉じ括弧（`files/index.html:2652`）の直後に足す。

```js
/* 配置図の表の、段ごとの欄。renderSheet()（紙）と欄数超過の警告の両方がここを通る。
   片方だけを通すと、警告の件数が実際に紙へ出る欄数とずれる。 */
function sheetSlots(tier){
  const names=sheetAreas(tier);
  return sheetEntries(names, names[0]||null);
}
```

- [ ] **Step 3: 欄数超過の警告を `sheetSlots()` 経由にする**

`files/index.html:1626-1628` の **3 行を 2 行に差し替える**。
`topAreas` / `bottomAreas` はこの 3 行の中でしか使われていないので、定義ごと消す。

変更前:

```js
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  const overTop=sheetEntries(topAreas, topAreas[0]||null).length-SHEET_TOP_SLOTS;
  const overBottom=sheetEntries(bottomAreas, bottomAreas[0]||null).length-SHEET_BOTTOM_SLOTS;
```

変更後:

```js
  const overTop=sheetSlots("top").length-SHEET_TOP_SLOTS;
  const overBottom=sheetSlots("bottom").length-SHEET_BOTTOM_SLOTS;
```

- [ ] **Step 4: `renderSheet()` を `sheetSlots()` 経由にする**

`files/index.html:2720-2726` を差し替える。
`renderSheet()` の中でも `topAreas` / `bottomAreas` は 2725・2726 でしか使われていないので、
2720 の定義ごと消す（ファイル全体でこの 2 つの変数を使うのは 1626-1628 と 2720-2726 の
6 行だけであることを確認済み）。

変更前:

```js
  // 上段・下段に出すエリアは掲載先の属性から引く。下段の先頭エリアは注釈を付けない基準にする。
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  // 上段も下段と同じ流儀にする。先頭のエリアが基準で、そこに置かれたロットには
  // 注釈を付けない。上段が軒下だけだったころは見出し「軒下」で足りていたが、
  // 掲載先が可変になり、上段に移したエリアのロットが紙のどこにあるか
  // 分からなくなっていた
  const top=sheetEntries(topAreas, topAreas[0]||null);
```

変更後:

```js
  // 上段・下段に出すエリアは掲載先の属性から引く。下段の先頭エリアは注釈を付けない基準にする。
  // 上段も下段と同じ流儀で、先頭のエリアが基準になる。上段が軒下だけだったころは
  // 見出し「軒下」で足りていたが、掲載先が可変になり、上段に移したエリアのロットが
  // 紙のどこにあるか分からなくなっていた
  const top=sheetSlots("top");
```

続く `const bottom=sheetEntries(bottomAreas, bottomAreas[0]||null);`（次の行）も
`const bottom=sheetSlots("bottom");` に差し替える。

差し替え後、`grep -n 'topAreas\|bottomAreas' files/index.html` が**何も返さない**こと。

- [ ] **Step 5: 挙動が変わっていないことを確認する**

ページをリロードしてから実行する。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.sample("basic");
  const sheet=H.sheet();
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const r={
    innerLen: sheet.innerHTML.length,
    tableH: +(sheet.querySelector("table").getBoundingClientRect().height/z).toFixed(1),
    grow: sheet.querySelectorAll("tr.grow").length,
    fit: sheet.querySelectorAll(".fit").length,
    leaders: sheet.querySelectorAll("svg.leaders path").length,
    top: sheetSlots("top").length,
    bottom: sheetSlots("bottom").length,
    hasAreas: sheetSlots("top").every(e=>Array.isArray(e.areas)),
  };
  r.ok = r.innerLen===11835 && r.tableH===474.3 && r.grow===7 && r.fit===29
      && r.leaders===10 && r.top===3 && r.bottom===6 && r.hasAreas===true;
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: 段ごとの欄を sheetSlots() に寄せて areas を返す

紙と欄数超過の警告が同じ経路を通るようにする。まとめ処理を
片方だけに入れると警告の件数が実際の欄数とずれるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `fitSheetText()` を縦積みに耐える形にする（挙動不変）

縦積みでは `.fit` の親が `td` ではなくなる。先に測定と件数の数え方を直しておく。

**Files:**
- Modify: `files/index.html:2671-2699`（`fitSheetText()` の本体）

**Interfaces:**
- Consumes: なし
- Produces: `fitSheetText()` が `.fitcol` の中の `.fit` でも欄幅と `data-fit` を引ける

- [ ] **Step 1: 親要素の取り方と件数の数え方を直す**

`files/index.html:2671` からの `const over={};` と `forEach` の冒頭、
および警告文を組む箇所を差し替える。

変更前:

```js
  const over={};
  sheet.querySelectorAll(".fit").forEach(sp=>{
    const td=sp.parentElement; if(!td) return;
```

変更後:

```js
  // 欄ごとに数える。縦積みの欄は .fit が複数あるので、span 単位で数えると
  // 1 欄あふれただけで「ロット 6件」と出てしまう
  const over={};
  sheet.querySelectorAll(".fit").forEach(sp=>{
    // 縦積み（.fitcol）では親が td ではないので closest で引く
    const td=sp.closest("td"); if(!td) return;
```

変更前（`k<FIT_MIN_SCALE` の中）:

```js
      const kind=td.dataset.fit||"";
      over[kind]=(over[kind]||0)+1;
```

変更後:

```js
      const kind=td.dataset.fit||"";
      (over[kind]=over[kind]||new Set()).add(td);
```

変更前（警告文）:

```js
  const parts=Object.keys(over).map(k=>`${FIT_LABEL[k]||k} ${over[k]}件`);
```

変更後:

```js
  const parts=Object.keys(over).map(k=>`${FIT_LABEL[k]||k} ${over[k].size}件`);
```

- [ ] **Step 2: 挙動が変わっていないことを確認する**

ページをリロードしてから実行する。長い品名で圧縮と警告が従来どおり働くことを見る。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.load([
    {type:"仕掛品", name:"エキゾーストマニホールド組立左右共通", lot:"L-001", snp:10, qty:120},
    {type:"仕掛品", name:"部品B", lot:"L-002", snp:10, qty:70},
  ]);
  const sheet=H.sheet();
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const long=[...sheet.querySelectorAll("td.c-name .fit")]
    .find(sp=>sp.textContent.startsWith("エキゾースト"));
  const msg=document.getElementById("sheetMsg").textContent;
  const r={
    found: !!long,
    scaled: long ? long.style.transform : null,
    insideCell: (()=>{ if(!long) return false;
      const a=long.getBoundingClientRect(), b=long.closest("td").getBoundingClientRect();
      return a.left>=b.left-0.6 && a.right<=b.right+0.6; })(),
    closestIsTd: long ? long.closest("td")===long.parentElement : null,
    warnHasCount: /品名 1件|ロット 1件/.test(msg) || msg==="",
    msg,
  };
  r.ok = r.found===true && r.insideCell===true && r.closestIsTd===true;
  return r;
})()
```

期待: `ok: true`（この時点では `.fitcol` がまだ無いので `closest("td")` は親と一致する）

- [ ] **Step 3: 基準値が変わっていないことを確認する**

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.sample("basic");
  const sheet=H.sheet();
  const r={ innerLen: sheet.innerHTML.length, fit: sheet.querySelectorAll(".fit").length,
            msg: document.getElementById("sheetMsg").innerHTML };
  r.ok = r.innerLen===11835 && r.fit===29 && r.msg==="";
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 4: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: fitSheetText を欄単位で数え closest(td) で引く

ロット番号を縦積みにすると .fit の親が td でなくなる。件数も
欄単位にしないと、1 欄あふれただけで行数ぶん件数が出る。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `mergeEntries()` を実装する（まだ紙には出さない）

まとめのロジックだけを先に入れ、単体で確かめる。

**Files:**
- Modify: `files/index.html`（`sheetSlots()` の直前に `mergeEntries()` を足す）

**Interfaces:**
- Consumes: `sheetEntries()` の戻り値（`{lot, pallets, half, areas, note}` の配列）
- Produces: `mergeEntries(entries, baseArea)` … 戻り値は
  `{lot, members:[{lot, pallets, half}], areas, note}` の配列

- [ ] **Step 1: `mergeEntries()` を書く**

Task 1 で足した `sheetSlots()` の**直前**に置く。

```js
/* 同じ品名・SNP・種別・置き場所のロットを1つの欄にまとめる。
   baseArea（下段の基準エリア。既定はメイン）に乗っているロットはまとめない。
   下段の欄からグリッドへ引く引き出し線が、欄とロットの 1:1 対応を前提にしているため
   （drawLeaders 参照）。メインに乗っていないロットにはそもそも線が引かれないので、
   PC横・EV横だけの荷物はまとめてよい。
   判定はエリア集合で行う。アンカーの有無で判定すると、グリッドが描けない日だけ
   表の形が変わってしまう。
   品名が空のロットもまとめない。品名欄が空のままロット番号だけが縦に並ぶ欄になる。 */
function mergeEntries(entries, baseArea){
  const out=[], byKey={};
  entries.forEach(e=>{
    const solo = !e.lot.name || (baseArea && e.areas.includes(baseArea));
    const key = solo ? null
      : [e.lot.name, e.lot.snp, e.lot.type, e.areas.join(" ")].join("");
    let g = (key!=null) ? byKey[key] : null;
    if(!g){
      g={lot:e.lot, members:[], areas:e.areas, note:e.note};
      if(key!=null) byKey[key]=g;
      out.push(g);
    }
    g.members.push({lot:e.lot, pallets:e.pallets, half:e.half});
  });
  return out;
}
```

- [ ] **Step 2: まとめの判定を確かめる**

ページをリロードしてから実行する。`mergeEntries()` を直接呼ぶ。

```js
(() => {
  const L=(name,lot,snp,type)=>({name,lot,snp,type});
  const E=(lot,pallets,half,areas)=>({lot, pallets, half, areas, note:""});
  const ids=g=>g.members.map(m=>m.lot.lot).join(",");
  const r={};

  // 全部一致 → 1 欄にまとまる
  r.same = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("部品A","2",10,"仕掛品"),2,0,["軒下①"]),
  ], "メイン").map(ids);

  // SNP 違い → 分かれる
  r.snp = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("部品A","2",20,"仕掛品"),2,0,["軒下①"]),
  ], "メイン").map(ids);

  // 種別違い → 分かれる
  r.type = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("部品A","2",10,"商品"),2,0,["軒下①"]),
  ], "メイン").map(ids);

  // 置き場所違い → 分かれる
  r.area = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("部品A","2",10,"仕掛品"),2,0,["5棟壁際"]),
  ], "メイン").map(ids);

  // メインを含む → まとめない
  r.base = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["メイン"]),
    E(L("部品A","2",10,"仕掛品"),2,0,["メイン"]),
  ], "メイン").map(ids);

  // PC横だけ → まとまる
  r.pc = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["PC横"]),
    E(L("部品A","2",10,"仕掛品"),2,0,["PC横"]),
  ], "メイン").map(ids);

  // 品名が空 → まとめない
  r.noname = mergeEntries([
    E(L("","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("","2",10,"仕掛品"),2,0,["軒下①"]),
  ], "メイン").map(ids);

  // エリア集合の一部一致 → 分かれる
  r.partial = mergeEntries([
    E(L("部品A","1",10,"仕掛品"),2,0,["軒下①"]),
    E(L("部品A","2",10,"仕掛品"),2,0,["軒下①","軒下②"]),
  ], "メイン").map(ids);

  r.ok = JSON.stringify(r.same)==='["1,2"]'
      && JSON.stringify(r.snp)==='["1","2"]'
      && JSON.stringify(r.type)==='["1","2"]'
      && JSON.stringify(r.area)==='["1","2"]'
      && JSON.stringify(r.base)==='["1","2"]'
      && JSON.stringify(r.pc)==='["1,2"]'
      && JSON.stringify(r.noname)==='["1","2"]'
      && JSON.stringify(r.partial)==='["1","2"]';
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 3: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
feat: 同じ品名のロットをまとめる mergeEntries() を足す

品名・SNP・種別・置き場所が一致するロットを1つの欄にまとめる。
メインに乗った荷物は引き出し線の 1:1 対応があるので対象外。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: まとめた欄を紙に描く

`slotCells()` を複数メンバーに対応させ、`sheetSlots()` から `mergeEntries()` を呼ぶ。
この時点ではまとめは常に有効。設定は Task 5 で足す。

**Files:**
- Modify: `files/index.html:284` の直後（`.fitcol` の CSS）
- Modify: `files/index.html`（`palletSlotText()` の直後に `palSlotTextOf()` を足す）
- Modify: `files/index.html:2798-2822`（`slotCells()`）
- Modify: `files/index.html`（`sheetSlots()` に `mergeEntries()` を挟む）

**Interfaces:**
- Consumes: `mergeEntries(entries, baseArea)`（Task 3）
- Produces: `palSlotTextOf(members)` … `members` は `{lot, pallets, half}` の配列。
  全員一致なら `"各" + 表記`、違えば `/` 連結、1 件ならそのまま

- [ ] **Step 1: `.fitcol` の CSS を足す**

`files/index.html:284`（`.sheet .fit{...}` の行）の**直後**に足す。

```css
  /* まとめた欄のロット番号を縦に積む入れ物。
     flex にしてはいけない。.fit が block 化されて欄幅いっぱいに伸び、
     fitSheetText() が自然幅ではなく欄幅を測ってしまう。圧縮が掛からないまま
     td{overflow:hidden} で無警告に切れる。
     width:max-content はここ（CSSルール）に書く。fitSheetText() が測定前に
     sp.style.width="" を掛けるので、インラインで与えると測定の直前に消える。
     transform-origin は .fit の left center をそのまま継がせる。center にすると
     はみ出したときに箱の中心が保存されて右へずれる。 */
  .sheet .fitcol{display:block}
  .sheet .fitcol .fit{display:block;width:max-content;margin:0 auto}
```

- [ ] **Step 2: `palSlotTextOf()` を足す**

`palletSlotText()`（`files/index.html:2791-2795`）の**直後**に足す。

```js
// 欄のパレット数。まとめた欄は、全員が同じ表記なら「各2P 半」、違えば「/」で並べる。
// 「半」は合算しない。合算すると「半3」が 3 ロットぶんの半端なのか
// 1 ロットに半端が 3 件なのか、紙の上で区別できなくなる
function palSlotTextOf(members){
  const t=members.map(palletSlotText);
  if(t.length<=1) return t[0]||"";
  return t.every(x=>x===t[0]) ? "各"+t[0] : t.join("/");
}
```

- [ ] **Step 3: `slotCells()` を複数メンバーに対応させる**

`files/index.html:2803-2818` の `for` ループの中身を差し替える。

変更前:

```js
  for(let i=0;i<count;i++){
    const e=entries[i], l=e&&e.lot;
    let v="", cls="slot";
    if(kind==="name")        v=l?l.name:"";
    else if(kind==="lot")    v=l?l.lot:"";
    else if(kind==="pallet") v=e?palletSlotText(e):"";
    else if(kind==="note"){  v=e&&e.note?e.note:""; cls="none snote"; }
    if(kind!=="note") cls+=" c-"+fk;
    if(extra && kind!=="note"){
      cls+=" "+extra;
      if(i===0)       cls+=" bl2";
      if(i===count-1) cls+=" br2";
    }
    // 空欄は包まない。包むと高さ0の span が残って測定対象が無駄に増える
    const inner = v ? `<span class="fit">${esc(v)}</span>` : "";
    out+=`<td class="${cls}" data-fit="${fk}" colspan="2">${inner}</td>`;
  }
```

変更後:

```js
  // 空欄は包まない。包むと高さ0の span が残って測定対象が無駄に増える
  const span = v => v ? `<span class="fit">${esc(v)}</span>` : "";
  for(let i=0;i<count;i++){
    const e=entries[i], l=e&&e.lot;
    // まとめていない欄（下段や設定オフ）は members を持たないので、自分自身を1件として扱う
    const ms = e ? (e.members || [e]) : [];
    let inner="", cls="slot";
    if(kind==="name")        inner=span(l?l.name:"");
    else if(kind==="lot"){
      // 空のロット番号は並べない。品名だけ入力した荷物が混ざりうる
      const ts=ms.map(m=>m.lot.lot).filter(t=>t);
      // 3件以上は1行に収まらない（9桁3件で圧縮 0.383。下限 0.4 を割る）ので縦に積む
      inner = ts.length>=3 ? `<span class="fitcol">${ts.map(span).join("")}</span>`
                           : span(ts.join("/"));
    }
    else if(kind==="pallet") inner=span(palSlotTextOf(ms));
    else if(kind==="note"){  inner=span(e&&e.note?e.note:""); cls="none snote"; }
    if(kind!=="note") cls+=" c-"+fk;
    if(extra && kind!=="note"){
      cls+=" "+extra;
      if(i===0)       cls+=" bl2";
      if(i===count-1) cls+=" br2";
    }
    out+=`<td class="${cls}" data-fit="${fk}" colspan="2">${inner}</td>`;
  }
```

- [ ] **Step 4: `sheetSlots()` にまとめを挟む**

Task 1 で作った `sheetSlots()` を差し替える。

```js
/* 配置図の表の、段ごとの欄。renderSheet()（紙）と欄数超過の警告の両方がここを通る。
   片方だけを通すと、警告の件数が実際に紙へ出る欄数とずれる。 */
function sheetSlots(tier){
  const names=sheetAreas(tier);
  const entries=sheetEntries(names, names[0]||null);
  // 基準エリア名は直書きしない。gridRows() も同じ式で引くので、設定でメインの
  // 掲載先を変えても、まとめの除外対象と引き出し線の対象が常に一致する
  return mergeEntries(entries, sheetAreas("bottom")[0]||null);
}
```

- [ ] **Step 5: シナリオ S で描画を確かめる**

ページをリロードしてから実行する。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.load(SCENARIO);
  const sheet=H.sheet();
  const top=sheetSlots("top"), bottom=sheetSlots("bottom");
  const fc=sheet.querySelector(".fitcol");
  const r={
    topSlots: top.length,
    topMembers: top.map(g=>g.members.length),
    bottomSlots: bottom.length,
    bottomMembers: bottom.map(g=>g.members.length),
    fitcolCount: sheet.querySelectorAll(".fitcol").length,
    stackedLots: fc ? [...fc.querySelectorAll(".fit")].map(s=>s.textContent) : null,
    palTexts: [...sheet.querySelectorAll("td.c-pal")].map(td=>td.textContent).filter(t=>t),
    leaders: sheet.querySelectorAll("svg.leaders path").length,
  };
  // 縦積みの各行が欄からはみ出していないこと
  r.allInside = fc ? [...fc.querySelectorAll(".fit")].every(sp=>{
    const a=sp.getBoundingClientRect(), b=sp.closest("td").getBoundingClientRect();
    return a.left>=b.left-0.6 && a.right<=b.right+0.6;
  }) : false;
  r.ok = r.topSlots===1 && JSON.stringify(r.topMembers)==="[4]"
      && r.bottomSlots===3 && JSON.stringify(r.bottomMembers)==="[1,1,1]"
      && r.fitcolCount===1
      && JSON.stringify(r.stackedLots)==='["100000003","100000004","100000005","100000006"]'
      && r.palTexts.includes("各2P")
      && r.allInside===true && r.leaders===6;
  return r;
})()
```

期待: `ok: true`

上段が 4 欄から 1 欄になり、ロットが縦に 4 行積まれ、パレット数が `各2P` になる。
下段は 3 欄のままで、引き出し線は 3 本（矢頭込みで path 6 本）。

- [ ] **Step 6: パレット数が不一致のときを確かめる**

```js
(() => {
  /* 共通のヘルパをここに貼る */
  const rows=[{type:"仕掛品", name:"詰め物F", lot:"F-001", snp:10, qty:630},
              {type:"仕掛品", name:"部品A", lot:"100000001", snp:10, qty:20},
              {type:"仕掛品", name:"部品A", lot:"100000002", snp:10, qty:20},
              {type:"仕掛品", name:"部品A", lot:"100000003", snp:10, qty:25},
              {type:"仕掛品", name:"部品A", lot:"100000004", snp:10, qty:30}];
  H.load(rows);
  const top=sheetSlots("top");
  const pal=[...H.sheet().querySelectorAll("td.c-pal")].map(td=>td.textContent).filter(t=>t);
  const r={ top: top.map(g=>g.members.map(m=>palletSlotText(m))), pal };
  // まとまった欄があり、その表記に「/」が入っていること（「各」ではない）
  r.merged = top.filter(g=>g.members.length>1);
  r.ok = r.merged.length>=1 && pal.some(t=>t.includes("/")) && !pal.some(t=>t.startsWith("各"));
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 7: 端数表示 off と文字サイズの上下限を確かめる**

`fracMode` が off のとき `palletSlotText()` は「半」を出さない。一致判定が同じ論理で
働くことと、`fsLot` を下限 8px・上限 24px にしても縦積みが破綻しないことを見る。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.load(SCENARIO);
  const chk=document.getElementById("fracChk");
  const palOf=()=>[...H.sheet().querySelectorAll("td.c-pal")].map(td=>td.textContent).filter(t=>t);
  const wasFrac=fracMode;
  const r={};
  // 端数表示 off（既定）。「半」が出ないまま「各2P」にまとまること
  chk.checked=false; toggleFrac(); switchTab("sheet");
  r.fracOff=palOf();
  // 端数表示 on
  chk.checked=true; toggleFrac(); switchTab("sheet");
  r.fracOn=palOf();
  chk.checked=wasFrac; toggleFrac(); switchTab("sheet");

  // 文字サイズの上下限で縦積みが欄からはみ出さないこと
  const el=document.getElementById("fsLot"), was=el.value;
  const inside=()=>{
    const fc=H.sheet().querySelector(".fitcol");
    if(!fc) return null;
    return [...fc.querySelectorAll(".fit")].every(sp=>{
      const a=sp.getBoundingClientRect(), b=sp.closest("td").getBoundingClientRect();
      return a.left>=b.left-0.6 && a.right<=b.right+0.6;
    });
  };
  el.value=8;  displayChanged(); r.at8  = inside();
  el.value=24; displayChanged(); r.at24 = inside();
  el.value=was; displayChanged();

  r.ok = r.fracOff.includes("各2P") && r.fracOn.includes("各2P")
      && r.at8===true && r.at24===true;
  return r;
})()
```

期待: `ok: true`

（シナリオ S は端数の無いロットだけなので、「半」の有無で表記は変わらない。
どちらでも `各2P` にまとまることを見ている）

- [ ] **Step 8: 基準サンプルが壊れていないことを確認する**

`basic` サンプルには同一品名の複数ロットが無いので、まとめても表示は変わらない。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.sample("basic");
  const sheet=H.sheet();
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const r={
    innerLen: sheet.innerHTML.length,
    tableH: +(sheet.querySelector("table").getBoundingClientRect().height/z).toFixed(1),
    fitcol: sheet.querySelectorAll(".fitcol").length,
    leaders: sheet.querySelectorAll("svg.leaders path").length,
    top: sheetSlots("top").length, bottom: sheetSlots("bottom").length,
    msg: document.getElementById("sheetMsg").innerHTML,
  };
  r.ok = r.innerLen===11835 && r.tableH===474.3 && r.fitcol===0
      && r.leaders===10 && r.top===3 && r.bottom===6 && r.msg==="";
  return r;
})()
```

期待: `ok: true`（`basic` は 1 ロット 1 欄なので改修前と完全に同じ）

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
feat: まとめた欄を配置図の表に描く

ロット番号は3件以上で縦に積む。9桁3件を1行に入れると圧縮 0.383 で
下限 0.4 を割るため。パレット数は全員一致なら「各2P半」、
違えば「/」で並べる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 表示設定にまとめの切替を足す

**Files:**
- Modify: `files/index.html:698`（`STORE_KEY`）
- Modify: `files/index.html:571` 付近（表示設定のチェックボックス）
- Modify: `files/index.html`（`setMergeLots()` / `toggleMerge()` を `toggleFrac()` の直後に足す）
- Modify: `files/index.html`（`sheetSlots()` に `mergeLots` の分岐を足す）
- Modify: `files/index.html:3161` 付近（`initFrac()` の直後に `initMergeLots()`）

**Interfaces:**
- Consumes: `sheetSlots(tier)`（Task 4）、`redraw()`（`files/index.html:1678`）
- Produces: グローバル `mergeLots`（真偽・既定 `true`）、`toggleMerge()`

- [ ] **Step 1: `STORE_KEY` にキーを足す**

`files/index.html:698` の `STORE_KEY` の定義に `merge:"palletApp.merge"` を足す。
`DEFAULT_DISPLAY` には**足さない**。

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual", spaces:"palletApp.spaces", display:"palletApp.display", merge:"palletApp.merge"};
```

- [ ] **Step 2: グローバル変数と切替の関数を足す**

`toggleFrac()`（`files/index.html:862-866`）の**直後**に足す。

```js
/* 同じ品名のロットを1つの欄にまとめるか。既定は on。
   「そのほかの表示」の他の項目（矢印の先・角の丸み・端数の「半」）と同じ流儀で、
   専用の STORE_KEY に保存する。DEFAULT_DISPLAY に相乗りさせない。
   applyDisplay() が DISPLAY_VARS[k] を無条件に引くので undefined になり、
   resetDisplay() の「文字を初期値に戻す」がまとめ設定まで戻してしまう。 */
let mergeLots=true;
function toggleMerge(){
  mergeLots=document.getElementById("mergeChk").checked;
  saveData(STORE_KEY.merge, mergeLots);
  // renderSheet() ではなく redraw()。欄数超過の警告は renderResult() の中で
  // 組まれるので、renderSheet() だけだと off に戻したときに警告が古いまま残る
  if(hasResult) redraw();
}
```

- [ ] **Step 3: チェックボックスを足す**

`files/index.html:571` の端数の行の**直後**に足す。

変更前:

```html
        <label class="chk"><input type="checkbox" id="fracChk" onchange="toggleFrac()"> 端数を「半」で表示</label>
```

変更後:

```html
        <label class="chk"><input type="checkbox" id="fracChk" onchange="toggleFrac()"> 端数を「半」で表示</label>
        <label class="chk"><input type="checkbox" id="mergeChk" checked onchange="toggleMerge()"> 同じ品名のロットを1つの欄にまとめる</label>
        <div class="hint">品名・入数・種別・置き場所がすべて同じロットだけをまとめます。メインに置いた荷物は、引き出し線が1本ずつ要るのでまとめません。</div>
```

- [ ] **Step 4: `sheetSlots()` に分岐を足す**

Task 4 の `sheetSlots()` を差し替える。

```js
function sheetSlots(tier){
  const names=sheetAreas(tier);
  const entries=sheetEntries(names, names[0]||null);
  if(!mergeLots) return entries;
  // 基準エリア名は直書きしない。gridRows() も同じ式で引くので、設定でメインの
  // 掲載先を変えても、まとめの除外対象と引き出し線の対象が常に一致する
  return mergeEntries(entries, sheetAreas("bottom")[0]||null);
}
```

- [ ] **Step 5: 保存の復元を足す**

`initFrac()`（`files/index.html:3157-3160`）の**直後**に足す。

```js
// ロットのまとめ：保存があれば復元。既定は on なので false のときだけ落とす
(function initMergeLots(){
  const m=loadData(STORE_KEY.merge);
  if(m===false){ mergeLots=false; document.getElementById("mergeChk").checked=false; }
})();
```

- [ ] **Step 6: 切替が効くことを確かめる**

ページをリロードしてから実行する。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  H.load(SCENARIO);
  const chk=document.getElementById("mergeChk");
  const read=()=>({ top: sheetSlots("top").length,
                    fitcol: H.sheet().querySelectorAll(".fitcol").length,
                    warn: document.getElementById("messages").textContent.includes("載りきらない") });
  const r={};
  r.on = read();                                   // 既定 on
  chk.checked=false; toggleMerge(); switchTab("sheet");
  r.off = read();
  r.savedOff = loadData(STORE_KEY.merge);
  chk.checked=true; toggleMerge(); switchTab("sheet");
  r.backOn = read();
  r.savedOn = loadData(STORE_KEY.merge);
  // off にすると上段が 4 欄になり SHEET_TOP_SLOTS(4) と同数。あふれないので警告は出ない。
  // まとめの有無で欄数が変わることと、警告がその場で組み直されることを見る
  r.ok = r.on.top===1 && r.on.fitcol===1
      && r.off.top===4 && r.off.fitcol===0
      && r.backOn.top===1 && r.backOn.fitcol===1
      && r.savedOff===false && r.savedOn===true;
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 7: 警告がその場で組み直されることを確かめる**

上段があふれる入力を作り、まとめの on/off で警告が追随することを見る。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  // 軒下①に 5 種類の荷物を落として上段 4 欄を超えさせる
  const rows=[{type:"仕掛品", name:"詰め物F", lot:"F-001", snp:10, qty:630}];
  ["A","B","C","D","E"].forEach((s,i)=>
    rows.push({type:"仕掛品", name:"部品"+s, lot:"20000000"+i, snp:10, qty:20}));
  H.load(rows);
  const chk=document.getElementById("mergeChk");
  const warnOf=()=>document.getElementById("messages").textContent.includes("載りきらない");
  const r={};
  r.topSlots=sheetSlots("top").length;
  r.warnNow=warnOf();
  chk.checked=false; toggleMerge();
  r.warnAfterOff=warnOf();
  chk.checked=true; toggleMerge();
  r.warnAfterOn=warnOf();
  // 品名が全部違うのでまとめても件数は変わらない。警告の有無が on/off で一致すること
  r.ok = r.warnNow===r.warnAfterOff && r.warnNow===r.warnAfterOn;
  return r;
})()
```

期待: `ok: true`

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
feat: 表示設定でロットのまとめを切り替えられるようにする

紙の様式が変わるので、前の書き方に戻せる逃げ道を残す。切替では
renderSheet() ではなく redraw() を呼ぶ。欄数超過の警告は
renderResult() の中で組まれるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 高さ超過の警告が原因を断定しないようにする

縦積みで紙があふれたとき、今の文言は「文字が大きくて」と断定し「文字を小さくしてください」と
指示する。原因がフォントではないので、指示どおりにしても解決しないことがある。

**Files:**
- Modify: `files/index.html:2705-2710`（`fitSheetText()` の高さ警告）

- [ ] **Step 1: 文言を差し替える**

変更前:

```js
      const pct=Math.round(h*PRINT_ZOOM/PRINT_H_PX*100);
      html+=`<div class="msg warn">⚠ 文字が大きくて印刷が1ページに収まりません`
          + `（用紙の高さの${pct}%）。設定タブの「表示設定」で文字を小さくしてください。</div>`;
```

変更後:

```js
      const pct=Math.round(h*PRINT_ZOOM/PRINT_H_PX*100);
      // 原因を断定しない。文字サイズのほかに、まとめた欄のロット番号が縦に積まれて
      // 伸びる場合がある。ロット 6 件を積むと欄の高さが 26px から 97px になる
      html+=`<div class="msg warn">⚠ 表が縦に伸びて印刷が1ページに収まりません`
          + `（用紙の高さの${pct}%）。設定タブの「表示設定」で文字を小さくするか、`
          + `同じ品名にまとめたロットの数を確認してください。</div>`;
```

- [ ] **Step 2: 警告が出る状態を作って文言を確かめる**

ロットを 6 件まとめると紙からあふれる（実測: 印刷 757.7px、上限 718.5px）。

```js
(() => {
  /* 共通のヘルパをここに貼る */
  // 軒下①に部品A を 6 件落とす。メインを埋めてから流す
  const rows=[{type:"仕掛品", name:"詰め物F", lot:"F-001", snp:10, qty:610}];
  for(let i=1;i<=6;i++) rows.push({type:"仕掛品", name:"部品A", lot:"10000000"+i, snp:10, qty:20});
  H.load(rows);
  const sheet=H.sheet();
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const h=sheet.querySelector("table").getBoundingClientRect().height/z;
  const msg=document.getElementById("sheetMsg").textContent;
  const fc=sheet.querySelector(".fitcol");
  const r={
    stacked: fc ? fc.querySelectorAll(".fit").length : 0,
    printH: +(h*PRINT_ZOOM).toFixed(1), limit: +PRINT_H_LIMIT.toFixed(1),
    over: h*PRINT_ZOOM > PRINT_H_LIMIT,
    msg,
  };
  // 6 件積めたとき、あふれていれば新しい文言が出ていること
  r.ok = r.stacked>=4 && (!r.over || (msg.includes("表が縦に伸びて") && !msg.includes("文字が大きくて")));
  return r;
})()
```

期待: `ok: true`

**注意:** 配置の都合で軒下①に 6 件そろわないことがある。`stacked` が 4 未満なら
`qty` を調整して軒下①に落ちる件数を増やしてから測り直す。

- [ ] **Step 3: コミット**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
fix: 高さ超過の警告が原因を文字サイズと断定しないようにする

まとめた欄のロット番号が縦に積まれて伸びる場合があり、
文字を小さくしても解決しないことがある。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `CACHE_VERSION` を上げる

**Files:**
- Modify: `files/sw.js:6`

- [ ] **Step 1: 番号を上げる**

`files/sw.js` の `CACHE_VERSION` を `"v24"` から `"v25"` にする。

- [ ] **Step 2: 確認する**

```bash
grep -n 'CACHE_VERSION' files/sw.js
```

期待: `6:const CACHE_VERSION = "v25";`

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "$(cat <<'EOF'
chore: CACHE_VERSION を v25 に上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 実機確認（人の作業。コードでは代替できない）

**検証スクリプトを実機に貼らないこと。** 入力を全置換するので利用者の入力が消える。
画面を触る手順だけで行う。

Pixel 9a で `http://<開発機のIP>:8765/index.html` を開き、次を確認する。

1. 同じ品名・同じ入数・同じ種別のロットを 4 件入力し、軒下に落ちる状態を作る。
   配置図の表で 1 欄にまとまり、ロット番号が縦に 4 行並ぶこと
2. その 4 件のパレット数が全部同じとき `各2P半` のように出ること。
   1 件だけ数を変えると `/` 区切りに変わること
3. 印刷プレビューを開き、**縦積みのロット番号が紙で読めること**。
   欄からはみ出したり右が切れたりしていないこと
4. 設定タブの「表示設定」で「同じ品名のロットを1つの欄にまとめる」を外すと、
   **その場で**表が 1 ロット 1 欄に戻ること。入れ直すとまとまること
5. メインに置いた同じ品名の荷物はまとまらず、引き出し線が従来どおり 1 本ずつ引かれること
6. ロットを 6 件まとめた状態で、印刷が 1 ページに収まらない旨の警告が出ること。
   その文言が「文字が大きくて」と断定していないこと
7. アプリを再読み込みしても、まとめの設定が保たれていること

## 範囲外（設計書 §8）

- メインに乗っている荷物のまとめ
- あふれブロックの描画
- 注釈まで含めた太枠
- 配置表のテキスト編集
- パレット数の縦積みと行高の同期
- テーブル分割と欄数の拡張
- 軒下①のみの荷物と、軒下①＋軒下②にまたがる荷物をまとめること
