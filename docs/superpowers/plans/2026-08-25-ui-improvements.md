# 入力と配置図まわりの5改善 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図タブを「配置編集」「配置表」に分割し、入力を Enter で送れるようにし、未登録品目を自動でマスタへ入れ、品名候補を自前のドロップダウンにし、配色を差し替えてマスにロット番号を出す。

**Architecture:** 配置アルゴリズムには触らない。表示の分岐を `sheetMode` フラグからタブへ移し、`setView()` を消す。品名候補は `<datalist>` を捨て、`<body>` 直下に1つだけ置いた `position:fixed` のリストを自前で開閉する。マスの識別は色からロット番号へ移し、色は「同じロットのまとまり」を示す補助に降格する。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`）内のバニラ JavaScript と CSS。ビルドツールもテストランナーも無い。

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の2つのみ。新しいファイルは作らない
- **編集位置は行番号ではなくコード片で指定している。** 各ステップの「変更前」の文字列を検索して置き換えること
- 自動テストの基盤が無いため、各タスクの検証はブラウザのコンソールと手動確認で行う
- 検証用のローカルサーバはリポジトリのルートで `python3 -m http.server 50999` を起動し、
  `http://localhost:50999/files/index.html` を開く
- **Enter を扱うハンドラには必ず `if(ev.isComposing || ev.keyCode===229) return;` を入れる。**
  品名は日本語入力が前提なので、これが無いと**変換候補を Enter で確定した瞬間に次の欄へ飛ぶ**。
  ↑↓ も IME の候補選択を横取りしてしまう
- **Enter 連鎖は Android を対象とする。** iOS Safari のテンキー（`inputmode="tel"`）と
  数字キーボード（`type="number"`）には Enter キーが存在せず、`enterkeyhint` も出しようがない。
  ロット・SNP・個数の欄では iPhone から Enter で送ることが原理的にできない。
  iPhone では欄をタップして移る従来の操作になる（機能が減るわけではない）。
  Android Gboard の数字レイアウトには実行キーがあるので成立する
- **`sw.js` の HTML はネットワーク優先。** `index.html` の更新はオンラインなら即届く。
  それでも `CACHE_VERSION` を上げるのは、`sw.js` 自体が変わることで新しい Service Worker が
  install され、「新しいバージョンがあります」バーが出て、旧キャッシュが破棄されるため。
  HTML 以外のアセットはキャッシュ優先なので、上げないと古いものが残る
- **`<datalist>` に戻さない。** Android 11 以降は IME が候補をキーボード上のストリップに
  インライン表示するため、ドロップダウンにならない。ブラウザ側の制御手段は無い
- **候補リストを入力欄の親の中に置かない。** カードは `syncCards()` で毎回作り直されるため、
  入力中にリストごと消える。`<body>` 直下に1つだけ置き `position:fixed` で位置を合わせる
- **候補の確定は `pointerdown` の `preventDefault()` とセットで実装する。** そうしないと
  `blur` が先に走ってリストが閉じ、タップが届かない
- **`enterkeyhint` はキーの見た目を変えるだけ。** フォーカス移動は `keydown` で自分で行う
- **マスの文字はロットコードではなくロット番号（素の数字）にする。** ロットコードは
  `1111-2222` のように長く、30px のマスに入らない
- 最後に `files/sw.js` の `CACHE_VERSION` を `v16` から `v17` にする（Task 6）
- 設計書は `docs/superpowers/specs/2026-08-25-ui-improvements-design.md`

---

## File Structure

| ファイル | 責任 | このプランでの変更 |
|---|---|---|
| `files/index.html` | アプリ全体（HTML・CSS・JS が1ファイル） | パレットと番号表示、タブ分割、未登録品目の登録、オートコンプリート、Enter 遷移 |
| `files/sw.js` | Service Worker（キャッシュ） | `CACHE_VERSION` の更新のみ |

既存の構造に合わせ、JS は既存のセクションコメントの区分に従って追記する。
オートコンプリートは「入力（スマホカード：テーブルと同期）」セクションの直後に
新しいセクションコメントを立てて置く。

---

## 検証用データ

DevTools のコンソールに貼り付けて実行する。以降のタスクで「データ A」のように参照する。

**データ A（9ロット・長いロットコードを含む）**

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [
    {type:"仕掛品",name:"部品C",lot:"1111-2222",snp:10,qty:245},
    {type:"仕掛品",name:"部品A",lot:"1111-2301",snp:10,qty:120},
    {type:"仕掛品",name:"部品B",lot:"L-102",    snp:10,qty:70},
    {type:"仕掛品",name:"部品D",lot:"3040-1188",snp:10,qty:140},
    {type:"仕掛品",name:"部品E",lot:"L-105",    snp:10,qty:60},
    {type:"商品",  name:"製品X",lot:"P-201",    snp:10,qty:60},
    {type:"商品",  name:"製品Y",lot:"7788-0012",snp:10,qty:90},
    {type:"商品",  name:"製品Z",lot:"P-203",    snp:10,qty:110},
    {type:"商品",  name:"製品W",lot:"9021-4455",snp:10,qty:80}
  ].forEach(addRow);
  syncCards(); saveLots(); run(false);
  return lastLots.map(l=>(l.id+1)+":"+l.name+"/"+l.lot).join(" ");
})()
```

期待される出力:

```
1:部品C/1111-2222 2:部品A/1111-2301 3:部品B/L-102 4:部品D/3040-1188 5:部品E/L-105 6:製品X/P-201 7:製品Y/7788-0012 8:製品Z/P-203 9:製品W/9021-4455
```

**データ B（20ロット・番号が2桁になり色が一周する）**

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  for(let i=1;i<=20;i++) addRow({type:"仕掛品",name:"部品"+i,lot:"L-"+(100+i),snp:10,qty:30});
  syncCards(); saveLots(); run(false);
  return lastLots.length+"ロット / 最後の番号="+(lastLots[lastLots.length-1].id+1);
})()
```

期待される出力:

```
20ロット / 最後の番号=20
```

**データ C（未登録の品目を含む）** — Task 3 で使う。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [
    {type:"仕掛品",name:"新部品ZZ", lot:"N-001",snp:24,qty:96},
    {type:"仕掛品",name:"新部品YY", lot:"N-002",snp:15,qty:60},
    {type:"仕掛品",name:"部品A",    lot:"L-101",snp:10,qty:50}
  ].forEach(addRow);
  syncCards(); saveLots();
  return "登録前の品目数="+new Set(MASTER.map(m=>m.name)).size;
})()
```

---

## Task 1: 配色の差し替えとマスへのロット番号表示

**Files:**
- Modify: `files/index.html`（`PALETTE` / `.cell` の CSS / `cellsOf()` / `drawZone()` / `codeShort()` / 凡例）

**Interfaces:**
- Consumes: なし（このプランの最初のタスク）
- Produces: マスに `lot.id + 1` の数字が出る。凡例の各項目が同じ番号で始まる。
  `codeShort()` は削除済み。`cellsOf()` の戻り値から `label` プロパティが消える

- [ ] **Step 1: パレットを差し替える**

変更前（`const PALETTE=` で検索）:

```js
const PALETTE=["#93c5fd","#fca5a5","#86efac","#fcd34d","#c4b5fd","#f9a8d4","#7dd3fc","#fdba74",
  "#a7f3d0","#d8b4fe","#f0abfc","#bef264","#67e8f9","#fda4af","#a5b4fc","#5eead4","#fbcfe8","#bae6fd"];
```

変更後:

```js
// 薄さ（L* 78〜93）とカラフルさを保ったまま、一般色覚での最小色差 ΔE00 を最大化して選んだ18色。
// 旧パレットは #fca5a5 と #fda4af が ΔE00 3.7 でほぼ同色だった。この18色は最小 14.5。
// 色相順に並べたものを前半・後半で交互に差し込み、隣り合うロットの色が近づかないようにしてある。
// ロットの識別はマスの番号が担うので、色は「同じロットのまとまり」を示す補助と位置づける。
const PALETTE=["#ffadb1","#71d69e","#ffdbcc","#47ffed","#ffaf7a","#c8efef",
  "#ffbb3d","#3de2ff","#e3cfa0","#8fc7ff","#ffed47","#d7e0f4",
  "#aed369","#cdb8ff","#dbefc8","#f4d7ee","#3dff64","#ffa3e8"];
```

- [ ] **Step 2: `cellsOf()` から `label` を外す**

変更前（`function cellsOf(col){` で検索）:

```js
function cellsOf(col){
  const arr=Array.from({length:col.h},(_,i)=>({id:null,seg:false,label:"",row:i}));
  let r=0;
  col.fills.forEach((f,fi)=>{
    for(let k=0;k<f.count;k++){ if(r<col.h){ arr[r]={id:f.id,seg:(k===0&&fi>0),label:"",row:r}; r++; } }
    if(r-1>=0) arr[r-1].label = f.id;
  });
  return arr;
}
```

変更後:

```js
function cellsOf(col){
  const arr=Array.from({length:col.h},(_,i)=>({id:null,seg:false,row:i}));
  let r=0;
  col.fills.forEach((f,fi)=>{
    for(let k=0;k<f.count;k++){ if(r<col.h){ arr[r]={id:f.id,seg:(k===0&&fi>0),row:r}; r++; } }
  });
  return arr;
}
```

`label` は「塊の末尾1マスにだけロットコードを出す」ためのものだった。
全マスに番号を出すので不要になる。

- [ ] **Step 3: `drawZone()` の文字をロット番号にする**

変更前（`const label=filled?(codeShort(a.label)):"";` で検索）:

```js
        const label=filled?(codeShort(a.label)):"";
```

変更後:

```js
        // ロットコードは 1111-2222 のように長いことがあり 30px のマスに入らない。
        // 凡例と同じ通し番号を出す。id は readLots() が付ける0始まりの連番。
        const label=filled?String(a.id+1):"";
```

- [ ] **Step 4: `codeShort()` を削除する**

変更前（`function codeShort(id){` で検索）:

```js
function codeShort(id){ const l=lastLots&&lastLots.find(x=>x.id===id); return l?esc(l.code):''; }
```

変更後: 行ごと削除する。

- [ ] **Step 5: 凡例に番号を付ける**

変更前（`document.getElementById("legend").innerHTML=lots.map(l=>` で検索）:

```js
  document.getElementById("legend").innerHTML=lots.map(l=>
    `<span><i class="swatch" style="background:${colorOf[l.id]}"></i>${esc(l.name)} / ${esc(l.lot)||"—"}　${l.pallets}P${l.parts>1?`（${l.parts}件）`:""}</span>`).join("");
```

変更後:

```js
  document.getElementById("legend").innerHTML=lots.map(l=>
    `<span><b class="lno">${l.id+1}</b><i class="swatch" style="background:${colorOf[l.id]}"></i>${esc(l.name)} / ${esc(l.lot)||"—"}　${l.pallets}P${l.parts>1?`（${l.parts}件）`:""}</span>`).join("");
```

- [ ] **Step 6: マスと凡例の CSS を直す**

変更前（`.cell{width:var(--cell)` で検索。1つ目の行）:

```css
  .cell{width:var(--cell);height:var(--cell);border:1px solid #cbd5e1;border-radius:2px;background:#fff;overflow:hidden;
        display:flex;align-items:center;justify-content:center;font-weight:600;color:#1f2937;
        font-size:calc(var(--cell) * .3);line-height:1;
        user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
```

変更後:

```css
  /* 文字はロット番号（1〜）。コードより短いので大きくできる */
  .cell{width:var(--cell);height:var(--cell);border:1px solid #cbd5e1;border-radius:2px;background:#fff;overflow:hidden;
        display:flex;align-items:center;justify-content:center;font-weight:800;color:#1f2937;
        font-size:calc(var(--cell) * .46);line-height:1;
        user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
```

変更前（`.swatch{width:13px` で検索）:

```css
  .swatch{width:13px;height:13px;border-radius:3px;border:1px solid rgba(0,0,0,.2);flex:none}
```

変更後:

```css
  .swatch{width:13px;height:13px;border-radius:3px;border:1px solid rgba(0,0,0,.2);flex:none}
  .legend b.lno{font-weight:800;font-size:12px;min-width:14px;text-align:center;flex:none}
```

- [ ] **Step 7: ブラウザで確認する**

1. `python3 -m http.server 50999` を起動し `http://localhost:50999/files/index.html` を開く
2. DevTools で "Bypass for network" を入れてリロードする
3. コンソールに**データ A**を貼る。上の期待出力が返ること
4. 「配置図」タブ →「ブロック図」を選ぶ
5. マスに `1`〜`9` の数字が出ていること。ロットコード（`1111-2222` 等）は出ていないこと
6. 凡例が `1 ■ 部品C / 1111-2222　25P` の形で、番号がマスと一致していること
7. 「マスの大きさ」を 小 / 中 / 大 に切り替え、どれでも数字が読めること
8. コンソールに**データ B**を貼る。20ロットで `10`〜`20` の2桁が出て、
   色は 19番目が1番目と同じになるが、番号で区別できること
9. 「配置図の表」に切り替え、表の見た目が今までと変わっていないこと（このタスクでは表に手を入れない）

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "feat: 配色を差し替え、マスにロット番号を表示する"
```

---

## Task 2: 配置図タブを「配置編集」「配置表」に分割

**Files:**
- Modify: `files/index.html`（タブのマークアップ / タブパネル / `.tab` の CSS / 印刷 CSS / `switchTab()` / `showMapState()` / `setView()` / `toggleMove()` / `run()` / `initView()`）

**Interfaces:**
- Consumes: Task 1 の変更（このタスクは配色・番号に依存しないが、同じファイルを触る）
- Produces: `switchTab(name)` の `name` が `"input" | "edit" | "sheet" | "settings"` になる。
  `sheetMode` / `setView()` / `STORE_KEY.view` / `initView()` は無くなる。
  空状態の要素 id が `#mapEmpty` から `#editEmpty` と `#sheetEmpty` の2つになる

- [ ] **Step 1: タブボタンを4つにする**

変更前（`<div class="tabs">` で検索）:

```html
<div class="tabs">
  <button class="tab active" id="tabbtn-input" onclick="switchTab('input')">入力</button>
  <button class="tab" id="tabbtn-map" onclick="switchTab('map')">配置図</button>
  <button class="tab" id="tabbtn-settings" onclick="switchTab('settings')">設定<span class="dot" id="regDot">0</span></button>
</div>
```

変更後:

```html
<div class="tabs">
  <button class="tab active" id="tabbtn-input" onclick="switchTab('input')">入力</button>
  <button class="tab" id="tabbtn-edit" onclick="switchTab('edit')">配置編集</button>
  <button class="tab" id="tabbtn-sheet" onclick="switchTab('sheet')">配置表</button>
  <button class="tab" id="tabbtn-settings" onclick="switchTab('settings')">設定<span class="dot" id="regDot">0</span></button>
</div>
```

- [ ] **Step 2: タブが4つでも収まるよう CSS を詰める**

変更前（`.tab{flex:1;border:0;` で検索）:

```css
  .tab{flex:1;border:0;background:none;padding:13px 6px;font-size:14px;font-weight:700;color:var(--muted);
```

変更後:

```css
  /* 4タブになったので、iPhone SE 幅（375px）でも折り返さないよう詰める */
  .tab{flex:1;border:0;background:none;padding:13px 3px;font-size:13px;font-weight:700;color:var(--muted);
       white-space:nowrap;
```

- [ ] **Step 3: 配置図タブを2つのタブパネルに割る**

変更前（`<!-- ===== 配置図タブ ===== -->` から `</div>` までの塊すべて。
`<div id="tab-map" class="tabpanel" style="display:none">` で始まり、
`<div class="empty" id="mapEmpty">「入力」タブで荷物を入れて<br>「自動配置を作成」を押してください</div>` の
2行あとの `</div>` で終わる）:

```html
  <!-- ===== 配置図タブ ===== -->
  <div id="tab-map" class="tabpanel" style="display:none">
    <div class="card" id="resultCard">
      <h2>配置図
        <button id="moveBtn" class="btn btn-ghost" style="margin-left:auto" onclick="toggleMove()">ロットを移動</button>
        <button id="editBtn" class="btn btn-ghost" style="margin-left:8px" onclick="toggleEdit()">通路を編集</button>
      </h2>
      <div id="editHint" class="hint" style="display:none;margin-bottom:8px">✏ 編集モード：マスをタップするとその列が「通路（灰・破線）」⇔「通常」に切り替わります。</div>
      <div id="moveHint" class="hint" style="display:none;margin-bottom:8px">✋ 移動モード：同じロットのマスをタップして選び、選んだマスをドラッグして別の列へ運びます。
        <button class="btn-mini" onclick="clearSel()">選択解除</button></div>

      <div class="sizectl">
        <span class="lbl">表示</span>
        <button class="sizebtn on" data-view="sheet" onclick="setView('sheet')">配置図の表</button>
        <button class="sizebtn" data-view="block" onclick="setView('block')">ブロック図</button>
        <button class="btn btn-ghost" style="margin-left:auto" onclick="window.print()">🖨 印刷</button>
      </div>

      <div class="sizectl" id="zoomCtl">
        <span class="lbl">表示倍率</span>
        <button class="sizebtn on" data-zoom="auto" onclick="setSheetZoom('auto')">自動</button>
        <button class="sizebtn" data-zoom="1" onclick="setSheetZoom('1')">100%</button>
        <button class="sizebtn" data-zoom="1.5" onclick="setSheetZoom('1.5')">150%</button>
        <button class="sizebtn" data-zoom="2" onclick="setSheetZoom('2')">200%</button>
        <span class="grp"><span class="lbl">矢印の先</span>
          <button class="sizebtn on" data-arrow="1" onclick="setArrowHead(true)">あり</button>
          <button class="sizebtn" data-arrow="0" onclick="setArrowHead(false)">なし</button></span>
        <span class="grp"><span class="lbl">角の丸み</span>
          <button class="sizebtn on" data-corner="1" onclick="setLotCorner(true)">あり</button>
          <button class="sizebtn" data-corner="0" onclick="setLotCorner(false)">なし</button></span>
        <span class="lbl" id="zoomNow"></span>
      </div>

      <div id="sheetView"></div>

      <div class="sizectl" id="sizeCtl" style="display:none">
        <span class="lbl">マスの大きさ</span>
        <button class="sizebtn" data-size="20" onclick="setCellSize(20)">小</button>
        <button class="sizebtn on" data-size="30" onclick="setCellSize(30)">中</button>
        <button class="sizebtn" data-size="42" onclick="setCellSize(42)">大</button>
      </div>

      <div id="messages"></div>
      <div id="mapBody">
        <div id="legend" class="legend"></div>

        <div class="floor">
          <div class="zone-title zone-far">倉庫外（収納庫から遠い）</div>
          <div class="scroller"><div class="spaces" id="zone-far"></div></div>

          <div class="fl-wall"><span>壁</span></div>

          <div class="zone-title zone-near">倉庫内（収納庫に近い）</div>
          <div class="scroller"><div class="spaces" id="zone-near"></div></div>
        </div>

        <div class="note" style="margin-top:10px">
          <span><b>越</b>＝通路へはみ出し</span>
          <span><b>混</b>＝混載（破線で品目が分かれる）</span>
          <span>灰色＝通路（空き）</span>
          <span>横にスクロールできます</span>
        </div>
        <div class="summary" id="summary"></div>
      </div>
      <div class="empty" id="mapEmpty">「入力」タブで荷物を入れて<br>「自動配置を作成」を押してください</div>
    </div>
  </div>
```

変更後:

```html
  <!-- ===== 配置編集タブ（ブロック図：移動と通路編集はここでだけできる） ===== -->
  <div id="tab-edit" class="tabpanel" style="display:none">
    <div class="card" id="editCard">
      <h2>配置編集
        <button id="moveBtn" class="btn btn-ghost" style="margin-left:auto" onclick="toggleMove()">ロットを移動</button>
        <button id="editBtn" class="btn btn-ghost" style="margin-left:8px" onclick="toggleEdit()">通路を編集</button>
      </h2>
      <div id="editHint" class="hint" style="display:none;margin-bottom:8px">✏ 編集モード：マスをタップするとその列が「通路（灰・破線）」⇔「通常」に切り替わります。</div>
      <div id="moveHint" class="hint" style="display:none;margin-bottom:8px">✋ 移動モード：同じロットのマスをタップして選び、選んだマスをドラッグして別の列へ運びます。
        <button class="btn-mini" onclick="clearSel()">選択解除</button></div>

      <div class="sizectl" id="sizeCtl">
        <span class="lbl">マスの大きさ</span>
        <button class="sizebtn" data-size="20" onclick="setCellSize(20)">小</button>
        <button class="sizebtn on" data-size="30" onclick="setCellSize(30)">中</button>
        <button class="sizebtn" data-size="42" onclick="setCellSize(42)">大</button>
      </div>

      <div id="messages"></div>
      <div id="mapBody">
        <div id="legend" class="legend"></div>

        <div class="floor">
          <div class="zone-title zone-far">倉庫外（収納庫から遠い）</div>
          <div class="scroller"><div class="spaces" id="zone-far"></div></div>

          <div class="fl-wall"><span>壁</span></div>

          <div class="zone-title zone-near">倉庫内（収納庫に近い）</div>
          <div class="scroller"><div class="spaces" id="zone-near"></div></div>
        </div>

        <div class="note" style="margin-top:10px">
          <span><b>越</b>＝通路へはみ出し</span>
          <span><b>混</b>＝混載（破線で品目が分かれる）</span>
          <span>灰色＝通路（空き）</span>
          <span>横にスクロールできます</span>
        </div>
        <div class="summary" id="summary"></div>
      </div>
      <div class="empty" id="editEmpty">「入力」タブで荷物を入れて<br>「自動配置を作成」を押してください</div>
    </div>
  </div>

  <!-- ===== 配置表タブ（印刷はこちら。印刷CSSが配置編集タブを隠す） ===== -->
  <div id="tab-sheet" class="tabpanel" style="display:none">
    <div class="card" id="sheetCard">
      <h2>配置表
        <button class="btn btn-ghost" style="margin-left:auto" onclick="printSheet()">🖨 印刷</button>
      </h2>

      <div class="sizectl" id="zoomCtl">
        <span class="lbl">表示倍率</span>
        <button class="sizebtn on" data-zoom="auto" onclick="setSheetZoom('auto')">自動</button>
        <button class="sizebtn" data-zoom="1" onclick="setSheetZoom('1')">100%</button>
        <button class="sizebtn" data-zoom="1.5" onclick="setSheetZoom('1.5')">150%</button>
        <button class="sizebtn" data-zoom="2" onclick="setSheetZoom('2')">200%</button>
        <span class="grp"><span class="lbl">矢印の先</span>
          <button class="sizebtn on" data-arrow="1" onclick="setArrowHead(true)">あり</button>
          <button class="sizebtn" data-arrow="0" onclick="setArrowHead(false)">なし</button></span>
        <span class="grp"><span class="lbl">角の丸み</span>
          <button class="sizebtn on" data-corner="1" onclick="setLotCorner(true)">あり</button>
          <button class="sizebtn" data-corner="0" onclick="setLotCorner(false)">なし</button></span>
        <span class="lbl" id="zoomNow"></span>
      </div>

      <div id="sheetView"></div>
      <div class="empty" id="sheetEmpty">「入力」タブで荷物を入れて<br>「自動配置を作成」を押してください</div>
    </div>
  </div>
```

- [ ] **Step 4: `switchTab()` を4タブに直す**

変更前（`function switchTab(name){` で検索）:

```js
function switchTab(name){
  ["input","map","settings"].forEach(t=>{
    document.getElementById("tab-"+t).style.display = (t===name)?"":"none";
    document.getElementById("tabbtn-"+t).classList.toggle("active", t===name);
  });
  document.getElementById("actionBar").style.display = (name==="input")?"":"none";
  window.scrollTo(0,0);
  // 表は表示されて初めて幅が測れるので、タブに来たタイミングで再描画・倍率決定する
  // （表モードで結果があるときは renderSheet() が末尾で applySheetZoom() も呼ぶ）
  if(name==="map"){
    if(sheetMode && hasResult) renderSheet(); else applySheetZoom();
  }
}
```

変更後:

```js
function switchTab(name){
  ["input","edit","sheet","settings"].forEach(t=>{
    document.getElementById("tab-"+t).style.display = (t===name)?"":"none";
    document.getElementById("tabbtn-"+t).classList.toggle("active", t===name);
  });
  document.getElementById("actionBar").style.display = (name==="input")?"":"none";
  window.scrollTo(0,0);
  // 移動モードと通路編集モードは配置編集タブでしか操作できない。
  // 他のタブへ移ったら解除する。残すと、戻ってきたとき「なぜかマスが選べる」状態になる
  if(name!=="edit" && (moveMode || editMode)){
    setMoveMode(false); setEditMode(false);
    redraw();   // editable クラスは DOM に焼き込まれているので描き直して落とす
  }
  // 表は表示されて初めて幅が測れるので、タブに来たタイミングで再描画・倍率決定する
  // （結果があるときは renderSheet() が末尾で applySheetZoom() も呼ぶ）
  if(name==="sheet"){
    if(hasResult) renderSheet(); else applySheetZoom();
  }
}
```

`setMoveMode()` / `setEditMode()` はヒントとボタンの見た目も戻す既存の関数だが、
`drawZone()` が焼き込む `.editable` クラスまでは落とさないので `redraw()` が要る。
`toggleMove()` が `switchTab('edit')` を呼ぶが、そのときは `name==="edit"` なので解除されない。

- [ ] **Step 5: `showMapState()` を2タブ構成に直す**

変更前（`function showMapState(){` で検索）:

```js
function showMapState(){
  document.getElementById("mapEmpty").style.display = hasResult?"none":"block";
  document.getElementById("mapBody").style.display  = (hasResult&&!sheetMode)?"block":"none";
  document.getElementById("sheetView").style.display= sheetMode?"":"none";
  document.getElementById("sizeCtl").style.display  = sheetMode?"none":"flex";
  if(hasResult&&sheetMode) renderSheet(); else if(!hasResult) document.getElementById("sheetView").innerHTML="";
}
```

変更後:

```js
function showMapState(){
  // 配置編集タブと配置表タブは独立しているので、それぞれの空表示を出し分ける
  document.getElementById("editEmpty").style.display  = hasResult?"none":"block";
  document.getElementById("sheetEmpty").style.display = hasResult?"none":"block";
  document.getElementById("mapBody").style.display    = hasResult?"block":"none";
  document.getElementById("sizeCtl").style.display    = hasResult?"flex":"none";
  document.getElementById("zoomCtl").style.display    = hasResult?"flex":"none";
  // 表を描くのは配置表タブを開いたときだけにする。
  // ここは renderResult() から呼ばれ、renderResult() は redraw() 経由で
  // ロットを1マス動かすたびに走る。見ていない表を毎回組み直すのは無駄
  if(hasResult){
    if(document.getElementById("tab-sheet").style.display!=="none") renderSheet();
  }else{
    document.getElementById("sheetView").innerHTML="";
  }
}
```

- [ ] **Step 6: `setView()` を削除し、印刷用の関数を足す**

変更前（`function setView(v){` で検索）:

```js
function setView(v){
  sheetMode=(v==="sheet");
  document.querySelectorAll(".sizebtn[data-view]").forEach(b=>
    b.classList.toggle("on", b.dataset.view===v));
  document.getElementById("sheetView").style.display = sheetMode?"":"none";
  document.getElementById("mapBody").style.display   = (!sheetMode && hasResult)?"block":"none";
  document.getElementById("sizeCtl").style.display   = sheetMode?"none":"flex";
  document.getElementById("zoomCtl").style.display   = sheetMode?"flex":"none";
  saveData(STORE_KEY.view, v);
  if(sheetMode && hasResult) renderSheet();
}
```

変更後:

```js
// 印刷は表だけを出す（印刷CSSが #tab-edit を隠す）。
// 表は表示されて初めて幅が測れるので、印刷の前に配置表タブへ寄せて描き直す。
function printSheet(){
  switchTab('sheet');
  window.print();
}
```

- [ ] **Step 7: `sheetMode` の宣言と、残り2か所の参照を消す**

変更前（`let sheetMode=true;` で検索）:

```js
let sheetMode=true;  // 配置図タブの表示（true=配置図の表 / false=ブロック図）
```

変更後: 行ごと削除する。

`setView()` / `switchTab()` / `showMapState()` / `toggleMove()` の外にも、
`sheetMode` を見ている箇所が**2つ**ある。両方直す。

変更前（`function setArrowHead(on){` の中）:

```js
  saveData(STORE_KEY.arrow, arrowHead);
  if(sheetMode && hasResult) renderSheet();
}
```

変更後:

```js
  saveData(STORE_KEY.arrow, arrowHead);
  if(hasResult) renderSheet();
}
```

変更前（`window.addEventListener("resize", ()=>{ if(sheetMode` で検索）:

```js
window.addEventListener("resize", ()=>{ if(sheetMode && sheetZoom==="auto") applySheetZoom(); });
```

変更後:

```js
window.addEventListener("resize", ()=>{ if(sheetZoom==="auto") applySheetZoom(); });
```

`applySheetZoom()` は `#sheetView .sheet` が無ければ即 return し、
`autoSheetZoom()` は幅が測れなければ `null` を返して据え置くので、
配置表タブが非表示のときに呼ばれても害はない。

- [ ] **Step 8: `toggleMove()` の `setView` を差し替える**

変更前（`function toggleMove(){` で検索）:

```js
function toggleMove(){
  setMoveMode(!moveMode);
  // 既定は「配置図の表」なので、そのまま移動モードに入ると掴めるマスが1つも無い。
  // 移動モードに入るときはブロック図へ寄せる。
  if(moveMode){ setEditMode(false); if(sheetMode) setView('block'); }
  redraw();
}
```

変更後:

```js
function toggleMove(){
  setMoveMode(!moveMode);
  // 配置表タブから押されると掴めるマスが1つも無いので、配置編集タブへ寄せる。
  if(moveMode){ setEditMode(false); switchTab('edit'); }
  redraw();
}
```

- [ ] **Step 9: `run()` の遷移先を配置編集タブにする**

`run()` の中には `if(goMap) switchTab('map');` が**2か所**ある（早期 return する側と末尾）。
両方とも次のように直す。

変更前:

```js
    if(goMap) switchTab('map');
```

変更後:

```js
    if(goMap) switchTab('edit');
```

変更前:

```js
  renderResult(lots, unknown, typeMix);
  if(goMap) switchTab('map');
}
```

変更後:

```js
  renderResult(lots, unknown, typeMix);
  if(goMap) switchTab('edit');
}
```

- [ ] **Step 10: `run()` の早期 return が触る id を直す**

変更前（`document.getElementById("mapEmpty").style.display="none";` で検索）:

```js
    showMapState();
    document.getElementById("mapEmpty").style.display="none";
    document.getElementById("mapBody").style.display="block";
```

変更後:

```js
    showMapState();
    document.getElementById("editEmpty").style.display="none";
    document.getElementById("mapBody").style.display="block";
```

- [ ] **Step 11: `initView()` を削除し、`STORE_KEY.view` を消す**

変更前（`(function initView(){` で検索）:

```js
// 配置図タブの表示モード
(function initView(){
  const v=loadData(STORE_KEY.view);
  if(v){ sheetMode=(v==="sheet"); }
  document.querySelectorAll(".sizebtn[data-view]").forEach(b=>
    b.classList.toggle("on", b.dataset.view===(sheetMode?"sheet":"block")));
  document.getElementById("sizeCtl").style.display = sheetMode?"none":"flex";
  document.getElementById("zoomCtl").style.display = sheetMode?"flex":"none";
})();
```

変更後: この即時関数ごと削除する。
起動時は必ず入力タブから始まり、配置を作れば配置編集タブへ飛ぶので、復元する場面が無い。

変更前（`const STORE_KEY={` で検索）:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", view:"palletApp.view", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual"};
```

変更後:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual"};
```

- [ ] **Step 12: 印刷 CSS を「配置表タブだけを出す」形に直す**

タブの表示・非表示は `switchTab()` が inline style で焼く。
そのため配置編集タブを開いたままブラウザのメニュー（Ctrl+P）で印刷すると、
`#tab-sheet` が `display:none` のままで**白紙になる**。
隠す側を並べるのではなく、配置表タブを強制的に出す形にする。

変更前（`header,.tabs,.actionbar,#updateBar,.sizectl,#mapBody,` で検索）:

```css
    header,.tabs,.actionbar,#updateBar,.sizectl,#mapBody,#messages,#regInfo,#saveStatus,.note,.hint{display:none !important}
```

変更後:

```css
    header,.tabs,.actionbar,#updateBar,.sizectl,#messages,#regInfo,#saveStatus,.note,.hint{display:none !important}
    /* どのタブを開いていても、紙には配置表だけを出す */
    .tabpanel{display:none !important}
    #tab-sheet{display:block !important}
```

`#mapBody` は `#tab-edit` の中にあり、`.tabpanel` を隠せば一緒に消えるので列挙から外す。

- [ ] **Step 12b: `setCellSize()` が他のボタンの選択を消さないようにする**

`.sizebtn` には `[data-size]`（マスの大きさ）のほかに `[data-zoom]` `[data-arrow]` `[data-corner]` がある。
現状は属性を絞らずに全部を回しているため、マスの大きさを変えると
**配置表タブの倍率・矢印・角丸の選択がすべて外れる**。
同じタブの中にあった今までは気づけたが、分割後は別タブの表示が壊れるので原因が見えない。

変更前（`function setCellSize(px){` で検索）:

```js
function setCellSize(px){
  document.documentElement.style.setProperty("--cell", px+"px");
  document.querySelectorAll(".sizebtn").forEach(b=>
    b.classList.toggle("on", parseInt(b.dataset.size)===px));
  saveData(STORE_KEY.cell, px);
}
```

変更後:

```js
function setCellSize(px){
  document.documentElement.style.setProperty("--cell", px+"px");
  // [data-size] に絞る。絞らないと配置表タブの倍率・矢印・角丸の選択まで外れる
  document.querySelectorAll(".sizebtn[data-size]").forEach(b=>
    b.classList.toggle("on", parseInt(b.dataset.size)===px));
  saveData(STORE_KEY.cell, px);
}
```

- [ ] **Step 13: 残った `sheetMode` の参照を潰す**

次を実行し、ヒットが 0 件になっていることを確かめる。

```bash
grep -n "sheetMode\|setView(\|mapEmpty\|tab-map\|tabbtn-map\|STORE_KEY.view\|codeShort" files/index.html
```

期待: 出力なし。1件でも残っていたら、そこを Step 4〜11 の方針に合わせて直す。

- [ ] **Step 14: ブラウザで確認する**

1. リロードし、タブが `入力 / 配置編集 / 配置表 / 設定` の4つになっていること
2. DevTools のデバイスツールバーで iPhone SE（375px）にし、タブが折り返さないこと
3. コンソールに**データ A**を貼る
4. 「配置編集」タブにブロック図が、「配置表」タブに表が出ること
5. 入力タブで「▶ 自動配置を作成」を押すと**配置編集**タブへ飛ぶこと
6. 「ロットを移動」を押すと配置編集タブに切り替わり、マスを選んでドラッグで移動できること
7. 「通路を編集」でマスをタップすると通路が切り替わること
8. 「配置表」タブで「🖨 印刷」を押し、プレビューに**表だけ**が出ること
   （ブロック図・凡例・ヒント・操作ボタンが紙に出ていないこと）
9. 表示倍率・矢印の先・角の丸みが配置表タブで効くこと
10. マスの大きさが配置編集タブで効くこと
11. コンソールで `localStorage.removeItem("palletApp.lots")` を実行しリロードする。
    配置編集タブと配置表タブの両方に「「入力」タブで荷物を入れて…」が出ること

- [ ] **Step 15: コミット**

```bash
git add files/index.html
git commit -m "feat: 配置図タブを配置編集タブと配置表タブに分割する"
```

---

## Task 3: 未登録品目を自動配置時にマスタへ登録

**Files:**
- Modify: `files/index.html`（`runFromButton()` の直前に関数を追加、`runFromButton()` の本体）

**Interfaces:**
- Consumes: `rowValues(tr)` / `snpsOf(name)` / `addMasterRow({name,snp})` / `onMasterChange()` / `readMaster()`（いずれも既存）
- Produces:
  - `unknownItems()` … 入力にあってマスタに無い `{name, snp}` の配列を返す。マスタは変更しない
  - `registerItems(list)` … 受け取った配列をマスタへ足す

登録は打ち間違い（`部品A` → `部品AA`、SNP `10` → `35`）もそのまま恒久的に取り込んでしまい、
以後その品名の SNP 欄が `<select>` に化けて入力UIが変わる。除去手段は設定タブでの手動削除だけ。
そこで**登録の前に品名つきの確認ダイアログを出す**。断っても配置は作る。

- [ ] **Step 1: 未登録の品目を「調べるだけ」の関数を足す**

`function runFromButton(){` の**直前**に次を挿入する。

```js
/* 入力にあってマスタに無い「品名＋SNP」を集める。ここではマスタを変更しない。
   seen で重ねているのは、同じ品名＋SNPが2行あるときに2件と数えないため。 */
function unknownItems(){
  const out=[], seen={};
  [...document.querySelectorAll("#lotTable tbody tr")].forEach(tr=>{
    const v=rowValues(tr);
    if(!v.name || v.snp<=0) return;
    if(snpsOf(v.name).includes(v.snp)) return;
    const key=v.name+"\u0000"+v.snp;   // readLots() と同じ区切り方
    if(seen[key]) return;
    seen[key]=1;
    out.push({name:v.name, snp:v.snp});
  });
  return out;
}
// 集めた品目をマスタへ足す
function registerItems(list){
  if(!list.length) return;
  list.forEach(m=>addMasterRow(m));
  onMasterChange();   // 保存・候補更新・パレット数の再計算
}
```

- [ ] **Step 2: `runFromButton()` から確認して呼ぶ**

変更前（`function runFromButton(){` で検索）:

```js
function runFromButton(){
  if(hasManual() && !confirm("手動調整を破棄して自動配置し直します。よろしいですか？")) return;
  run(true);
}
```

変更後:

```js
function runFromButton(){
  if(hasManual() && !confirm("手動調整を破棄して自動配置し直します。よろしいですか？")) return;

  // 未登録の品目は、何を入れるか見せてから登録する。
  // 打ち間違いをそのままマスタへ入れると、以後その品名のSNP欄がプルダウンに化ける
  const add=unknownItems();
  let added=[];
  if(add.length){
    const list=add.map(m=>`　・${m.name}　SNP ${m.snp}`).join("\n");
    if(confirm(`次の品目が未登録です。「設定」タブに登録しますか？\n\n${list}\n\n`
              +`（キャンセルしても配置図は作成します）`)){
      registerItems(add);
      added=add;
    }
  }

  run(true);

  // run() の中の renderResult() が #messages を上書きするので、そのあとに足す。
  // ロットを動かすと redraw() → renderResult() でこの行は消えるが、
  // 登録そのものは設定タブに残るので実害は無い
  if(added.length){
    const names=added.map(m=>`${esc(m.name)}(${m.snp})`).join(" / ");
    document.getElementById("messages").innerHTML +=
      `<div class="msg ok">✅ 「設定」タブに登録しました：${names}</div>`;
  }
}
```

`run(true)` は荷物が1件も無いと `alert()` を出して戻る。
その場合でも登録は済んでいるが、確認ダイアログで品名を見て承諾しているので不意打ちにはならない。

- [ ] **Step 3: ブラウザで確認する**

1. リロードし、コンソールに**データ C**を貼る。`登録前の品目数=24` のような値が返ること
2. 入力タブで「▶ 自動配置を作成」を押す
3. 確認ダイアログに**品名とSNPが並んで**出ること

```
次の品目が未登録です。「設定」タブに登録しますか？

　・新部品ZZ　SNP 24
　・新部品YY　SNP 15

（キャンセルしても配置図は作成します）
```

（`部品A / SNP 10` は登録済みなので出ない）

4. **まず「キャンセル」を押す。** 配置図は作られ配置編集タブへ飛ぶが、
   メッセージに登録の行が出ず、設定タブにも増えていないこと
5. もう一度「▶ 自動配置を作成」を押し、今度は「OK」を押す
6. 配置編集タブのメッセージに
   「✅ 「設定」タブに登録しました：新部品ZZ(24) / 新部品YY(15)」が出ること
7. 「設定」タブを開き、品目マスタの末尾に `新部品ZZ / 24` と `新部品YY / 15` があること
8. 設定タブのバッジ（品目数）が2つ増えていること
9. もう一度「▶ 自動配置を作成」を押す。**2回目はダイアログが出ないこと**（すでに登録済み）
10. 同じ品名で別の SNP を入れた場合を試す。入力タブで `部品A` の SNP を `10` から `35` に変え、
    自動配置を押す。ダイアログに `部品A　SNP 35` の1件だけが出て、OK すると
    設定タブに `部品A / 35` の行が増えること（`部品A / 10` は残ったまま）
11. リロードし、設定タブに登録が残っていること（localStorage に保存されている）
12. 同じ品名・同じSNPを**2行**入れて自動配置を押す。ダイアログの一覧に**1件だけ**出ること

- [ ] **Step 4: コミット**

```bash
git add files/index.html
git commit -m "feat: 自動配置時に未登録の品目をマスタへ登録する"
```

---

## Task 4: 品名のオートコンプリート

**Files:**
- Modify: `files/index.html`（CSS / `<datalist>` の削除 / `body` 直下にリスト追加 / `refreshNameOptions()` / `addRow()` の品名欄 / `syncCards()` の品名欄 / 新セクションの JS / `cardEdit()`）

**Interfaces:**
- Consumes: `MASTER` / `snpsOf(name)` / `esc(s)` / `cardEdit(i,idx,val)` / `nameChanged(el)` / `focusField(i,f)` / `syncCards()`（いずれも既存）
- Produces:
  - `acOpen(inp)` … 入力欄 `inp` に対して候補を開く（`onfocus` 用）
  - `acTyped(inp)` … 打つたびに呼ぶ。`acOpen()` と同じだが意図を分けてある（`oninput` 用）
  - `acRender()` … いま開いている候補を描き直す
  - `acClose()` … 閉じる
  - `acPick(name)` … 候補 `name` を確定して入力欄へ入れ、ロット欄へフォーカスを送る
  - `acKey(ev, inp)` … 品名欄の `keydown`。↑↓ Enter Esc を処理する（Task 5 で Enter の続きを足す）
  - `acVisible()` … 候補が開いているか（boolean）

- [ ] **Step 1: CSS を足す**

Task 1 の Step 6 で足した `.legend b.lno{...}` の行の**直後**に挿入する。

```css
  /* ---- 品名のオートコンプリート ----
     datalist は Android の IME がキーボード上の候補ストリップに出してしまい、
     ドロップダウンにならない。body 直下に1つだけ置いて position:fixed で位置を合わせる。 */
  .ac-list{position:fixed;z-index:50;background:#fff;border:1px solid var(--line);border-radius:8px;
           box-shadow:0 8px 24px rgba(0,0,0,.18);overflow-y:auto;-webkit-overflow-scrolling:touch;
           touch-action:pan-y;padding:4px}
  .ac-list[hidden]{display:none}
  .ac-item{padding:10px 12px;border-radius:6px;font-size:14px;cursor:pointer;min-height:44px;
           display:flex;align-items:center;gap:8px}
  .ac-item span{margin-left:auto;font-size:11px;color:var(--muted);flex:none}
  .ac-item.on{background:#eef2ff}
```

- [ ] **Step 2: `<datalist>` を消し、`body` 直下にリストを置く**

変更前（`<datalist id="nameOptions"></datalist>` で検索）:

```html
      <datalist id="nameOptions"></datalist>
```

変更後: 行ごと削除する。

変更前（`<div id="updateBar">` で検索）:

```html
<div id="updateBar">
```

変更後:

```html
<!-- 品名の候補。開いている入力欄に合わせて位置を決めるので body 直下に1つだけ置く -->
<div id="acList" class="ac-list" hidden></div>

<div id="updateBar">
```

- [ ] **Step 3: `refreshNameOptions()` を候補データの更新に変える**

変更前（`function refreshNameOptions(){` で検索）:

```js
function refreshNameOptions(){
  const names=[]; MASTER.forEach(m=>{ if(!names.includes(m.name)) names.push(m.name); });
  document.getElementById("nameOptions").innerHTML =
    names.map(n=>`<option value="${esc(n)}">SNP ${snpsOf(n).join(" / ")}</option>`).join("");
}
```

変更後:

```js
// マスタが変わったら、開いている候補を描き直す（閉じていれば何もしない）
function refreshNameOptions(){
  if(acVisible()) acRender();
}
```

- [ ] **Step 4: テーブルの品名欄からから `list` を外し、候補を配線する**

変更前（`<td><input list="nameOptions" value="${esc(d.name)}" placeholder="品名" oninput="nameChanged(this)"></td>` で検索）:

```html
    <td><input list="nameOptions" value="${esc(d.name)}" placeholder="品名" oninput="nameChanged(this)"></td>
```

変更後:

```html
    <td><input enterkeyhint="next" value="${esc(d.name)}" placeholder="品名"
               oninput="nameChanged(this);acTyped(this)" onfocus="acOpen(this)" onkeydown="acKey(event,this)"></td>
```

`onfocus` は `acOpen()`、`oninput` は `acTyped()` と分ける。
打ち直したときに ↑↓ の選択位置を残すと、絞り込み後の別の項目が選ばれてしまう。

- [ ] **Step 5: カードの品名欄からも `list` を外し、候補を配線する**

変更前（`<input list="nameOptions" value="${esc(v.name)}" placeholder="品名" oninput="cardEdit(${i},1,this.value)"></div>` で検索）:

```html
      <div class="fld" data-f="name"><label>品名</label>
        <input list="nameOptions" value="${esc(v.name)}" placeholder="品名" oninput="cardEdit(${i},1,this.value)"></div>
```

変更後:

```html
      <div class="fld" data-f="name"><label>品名</label>
        <input enterkeyhint="next" data-card="${i}" value="${esc(v.name)}" placeholder="品名"
               oninput="cardEdit(${i},1,this.value);acTyped(this)" onfocus="acOpen(this)"
               onkeydown="acKey(event,this)"></div>
```

`data-card` は「この入力欄はカードのもので、行番号は `i`」を表す。
`acPick()` がテーブル側かカード側かを見分けるのに使う。

- [ ] **Step 6: `syncCards()` の先頭でカード側の候補だけ閉じる**

カードを作り直すと `acInput` が DOM から外れた要素を指したままになる。

ただし**無条件に閉じてはいけない**。テーブルの品名欄は `oninput → nameChanged() →
rowChanged() → syncCards()` の順に呼ばれるため、1文字打つたびに候補が閉じてしまう。
閉じるのはカード側の欄から開いているときだけにする。

変更前（`function syncCards(){` で検索）:

```js
function syncCards(){
  const host=document.getElementById("lotCards");
```

変更後:

```js
function syncCards(){
  // カードを作り直すと、カード側から開いている候補の参照先が DOM から消える。
  // テーブル側の欄は作り直されないので、そのままにする
  // （テーブルの品名入力は rowChanged() 経由でここを毎回通る）
  if(acInput && acInput.dataset.card!=null) acClose();
  const host=document.getElementById("lotCards");
```

- [ ] **Step 7: オートコンプリート本体を書く**

`/* ---------- 配置アルゴリズム ---------- */` の**直前**に、新しいセクションとして挿入する。

```js
/* ---------- 品名のオートコンプリート ----------
   <datalist> は Android 11 以降、IME がキーボード上の候補ストリップに
   インライン表示してしまい、ドロップダウンにならない。ブラウザ側の制御手段が無いので自前で描く。
   リストは body 直下に1つだけ置き、position:fixed で対象の欄に合わせる。
   カードの入力欄は syncCards() で作り直されるため、リストを欄の親に入れると入力中に消える。 */
let acInput=null;   // いま候補を出している入力欄。null なら閉じている
let acIndex=-1;     // ↑↓ で選択中の項目。-1 は未選択

function acBox(){ return document.getElementById("acList"); }
function acVisible(){ return !!acInput && !acBox().hidden; }

// マスタの品名（重複を除く）
function acNames(){
  const names=[]; MASTER.forEach(m=>{ if(!names.includes(m.name)) names.push(m.name); });
  return names;
}
// フォーカスしたとき。まだ何も選んでいない状態で開く
function acOpen(inp){
  acInput=inp; acIndex=-1;
  acRender();
}
// 打つたびに呼ぶ。絞り込みが変わるので ↑↓ の選択は捨てる
function acTyped(inp){
  acInput=inp; acIndex=-1;
  acRender();
}
function acRender(){
  const box=acBox();
  if(!acInput){ box.hidden=true; return; }
  const q=acInput.value.trim();
  // 部分一致。1111 で 1111-2222 を引けるようにする
  const list=acNames().filter(n=>!q || n.indexOf(q)>=0);
  if(!list.length){ box.hidden=true; return; }
  if(acIndex>=list.length) acIndex=list.length-1;
  box.innerHTML=list.map((n,i)=>
    `<div class="ac-item${i===acIndex?" on":""}" data-name="${esc(n)}">`
    +`${esc(n)}<span>SNP ${snpsOf(n).join(" / ")}</span></div>`).join("");
  box.hidden=false;
  acPosition();
}
/* 位置決め。ソフトキーボードが出ていると画面の下半分が隠れるので、
   visualViewport で可視領域を測り、入らなければ欄の上側に出す。 */
function acPosition(){
  const box=acBox();
  if(!acInput) return;
  const r=acInput.getBoundingClientRect();
  const vv=window.visualViewport;
  const vTop = vv ? vv.offsetTop : 0;
  const vh   = vv ? vv.height    : window.innerHeight;
  // 下端には「▶ 自動配置を作成」の固定バーが乗っている。その上までしか使えない
  const bar=document.getElementById("actionBar");
  const barH=(bar && bar.style.display!=="none") ? bar.getBoundingClientRect().height : 0;
  box.style.left  = r.left+"px";
  box.style.width = r.width+"px";
  box.style.maxHeight="";                        // 実寸を測るため一旦外す
  const want=Math.min(box.scrollHeight, vh*0.44);
  const below=(vTop+vh-barH)-r.bottom-8;         // 欄の下に残っている高さ
  const above=r.top-vTop-8;                      // 欄の上に残っている高さ
  if(below>=want || below>=above){ box.style.top=(r.bottom+4)+"px"; box.style.maxHeight=Math.max(Math.min(want,below),60)+"px"; }
  else                           { const h=Math.max(Math.min(want,above),60); box.style.top=(r.top-h-4)+"px"; box.style.maxHeight=h+"px"; }
}
function acClose(){ acInput=null; acIndex=-1; acBox().hidden=true; }

// 候補を確定する。入力欄へ入れ、SNPを自動補完し、ロット欄へ送る
function acPick(name){
  const inp=acInput;
  if(!inp) return;
  const card=inp.dataset.card;
  acClose();
  inp.value=name;
  if(card!=null){
    // カード側：テーブルへ書き戻し、SNP欄がプルダウンに変わることがあるので作り直す
    cardEdit(parseInt(card),1,name);
    syncCards();
    focusField(parseInt(card),"lot");
  }else{
    nameChanged(inp);
    const c=[...inp.closest("tr").querySelectorAll("select,input")];
    const lot=c[2];
    if(lot){ lot.focus(); try{ lot.setSelectionRange(lot.value.length,lot.value.length); }catch(e){} }
  }
}

/* 品名欄の keydown。候補が開いていれば ↑↓ Enter Esc を候補の操作に使う。
   閉じているときの Enter は Task 5 で「次の欄へ送る」を足す。 */
function acKey(ev, inp){
  // 日本語の変換中は何もしない。これが無いと、変換候補を Enter で確定した瞬間に
  // 次の欄へ飛んでしまう。↑↓ も IME の候補選択を横取りしてしまう。
  // keyCode 229 は isComposing を出さない古い IME 向けの保険
  if(ev.isComposing || ev.keyCode===229) return;
  const open = acVisible() && acInput===inp;
  const items = open ? [...acBox().querySelectorAll(".ac-item")] : [];
  if(open && (ev.key==="ArrowDown" || ev.key==="ArrowUp")){
    ev.preventDefault();
    acIndex += (ev.key==="ArrowDown" ? 1 : -1);
    if(acIndex < 0) acIndex = items.length-1;
    if(acIndex >= items.length) acIndex = 0;
    acRender();
    return;
  }
  if(ev.key==="Escape"){ if(open){ ev.preventDefault(); acClose(); } return; }
  if(ev.key!=="Enter") return;
  ev.preventDefault();
  if(open && acIndex>=0){ acPick(items[acIndex].dataset.name); return; }
  acClose();
}

/* 候補の確定。
   よくある実装は pointerdown を preventDefault() してフォーカスを保つ形だが、
   それをやるとリストをタッチでスクロールできなくなる（既定のマスタは24件あるので実害が出る）。
   代わりに pointerdown で対象と座標を控え、pointerup までの移動が小さいときだけ確定する。
   要素は pointerdown の時点で確定しているので、キーボードが閉じて位置がずれても影響しない。
   閉じるのは「外側の pointerdown」「Esc」「確定時」だけで、blur では閉じない。 */
let acDown=null;
acBox().addEventListener("pointerdown", ev=>{
  const it=ev.target.closest(".ac-item");
  acDown = it ? {el:it, x:ev.clientX, y:ev.clientY} : null;
});
acBox().addEventListener("pointerup", ev=>{
  const d=acDown; acDown=null;
  if(!d) return;
  if(Math.abs(ev.clientX-d.x)>8 || Math.abs(ev.clientY-d.y)>8) return;   // スクロールとみなす
  acPick(d.el.dataset.name);
});
// 外側をタップしたら閉じる。品名欄自身と候補の中は除く
document.addEventListener("pointerdown", ev=>{
  if(!acVisible()) return;
  if(ev.target===acInput) return;
  if(ev.target.closest("#acList")) return;
  acClose();
});
// 欄が動いたら位置を合わせ直す
window.addEventListener("scroll", ()=>{ if(acVisible()) acPosition(); }, true);
window.addEventListener("resize", ()=>{ if(acVisible()) acPosition(); });
if(window.visualViewport){
  window.visualViewport.addEventListener("resize", ()=>{ if(acVisible()) acPosition(); });
  window.visualViewport.addEventListener("scroll", ()=>{ if(acVisible()) acPosition(); });
}
```

- [ ] **Step 8: `updateCardFoot()` が個数欄を壊す既存バグを直す**

`updateCardFoot()` は SNP 欄を「カード内の `.fld input` の3番目」で引いている。
SNP 欄が `<select>` になっているカードでは `.fld input` が
`[品名, ロット, 個数]` になり、**3番目は個数欄**になる。
その結果、品名やロットを打つたびに個数欄が SNP の値で上書きされる。

`acPick()` はカードの品名を `cardEdit(i,1,name)` で書くのでここを通る。
Task 3 の自動登録は `<select>` に化ける品名を増やす方向に働くので、
このバグを踏む頻度が上がる。

変更前（`function updateCardFoot(i){` で検索）:

```js
  const snpInput=card.querySelectorAll(".fld input")[2];
  if(snpInput && document.activeElement!==snpInput) snpInput.value=v.snp||"";
```

変更後:

```js
  // .fld input の3番目では、SNPが <select> のカードで個数欄を指してしまう
  const snpInput=card.querySelector('.fld[data-f="snp"] input');
  if(snpInput && document.activeElement!==snpInput) snpInput.value=v.snp||"";
```

- [ ] **Step 9: 残った `nameOptions` の参照を潰す**

```bash
grep -n "nameOptions" files/index.html
```

期待: 出力なし。

- [ ] **Step 10: PC のブラウザで確認する**

1. リロードし、DevTools のデバイスツールバーを**切って**（PCレイアウト）確認する
2. 入力テーブルの品名欄をクリックする。候補が欄の直下に出て、
   各行が `部品A` と右端に `SNP 10` の形になっていること
3. `部品` と打つ。`部品A` `部品B` … に絞り込まれること
4. `1` と打つ。`部品1` `部品11` … のように**部分一致**で絞り込まれること
5. ↓↑ で選択が動き、選択中の行に薄い背景が付くこと
6. Enter で確定し、品名が入り、SNPが自動で入り、**ロット欄にフォーカスが移る**こと
7. マウスで候補をクリックしても同じ結果になること
8. Esc で閉じること
9. 候補の外をクリックして閉じること
10. 候補に無い品名（`テスト品`）を打ち切っても、そのまま入力欄に残ること
11. 設定タブで品目を1件足し、入力タブに戻って品名欄を開くと、その品目が候補に出ること

- [ ] **Step 11: スマホ表示で確認する**

1. DevTools のデバイスツールバーで iPhone SE（375px）にしてリロードする
2. カードの品名欄をタップする。候補が出ること
3. 候補をタップして確定できること（**タップが不発にならないこと**）
4. 確定後、SNP が自動で入り、ロット欄にフォーカスが移ること
5. 同じ品名で SNP が2つ登録されているもの（`部品C`）を選ぶと、
   SNP欄が**プルダウンに変わる**こと
6. カードを何枚も足して**画面の一番下のカード**の品名欄を開き、
   候補が画面外にはみ出さないこと

- [ ] **Step 12: Android 実機で確認する**

`http://<PCのIP>:50999/files/index.html` を Android Chrome で開く。

**注意:** http の IP アドレスは secure context ではないので、この経路では
Service Worker が登録されず、ホーム画面に追加した standalone 表示にもならない。
候補の位置決めは standalone だとアドレスバーが無いぶん条件が変わるので、
GitHub Pages へ上げたあとに standalone でも一度確かめること（Task 6 で扱う）。

1. 品名欄をタップする。**キーボード上の候補ストリップではなく、画面内にドロップダウンが出る**こと
2. 候補をタップして確定できること
3. 候補が多いとき（設定タブのサンプル品目を読み込むと24件になる）、
   **リストを指でスクロールできる**こと。スクロールしただけで確定してしまわないこと
4. 画面下部の入力欄で開いたとき、候補がソフトキーボードに隠れないこと
   （欄の上側に出るか、キーボードの上に収まること）
5. 候補が「▶ 自動配置を作成」の固定バーに重ならないこと
6. 品名に日本語を入力し、**変換候補を Enter で確定しても次の欄へ飛ばない**こと
   （確定だけが起き、もう一度 Enter を押して初めてロット欄へ移る）

- [ ] **Step 13: コミット**

```bash
git add files/index.html
git commit -m "feat: 品名の候補を自前のドロップダウンにする"
```

---

## Task 5: Enter で次の項目へ送る

**Files:**
- Modify: `files/index.html`（`focusField()` / `addRow()` のロット・SNP欄 / `syncCards()` のロット・SNP欄 / `acKey()` の末尾 / 新しい遷移関数）

**Interfaces:**
- Consumes: Task 4 の `acKey()` / `acVisible()` / `acClose()`、既存の `focusField(i,f)` / `addNextRow(i)` / `rowIndexOf(el)`
- Produces:
  - `nextField(el)` … 入力欄 `el` の次の欄へフォーカスを送る。カード・テーブルのどちらでも動く
  - `enterKey(ev, el)` … ロット欄と SNP 欄の `keydown` ハンドラ

- [ ] **Step 1: `focusField()` を select にも当たるようにする**

SNP 欄は、同じ品名で SNP が2つ以上登録されていると `<select>` になる。

変更前（`function focusField(i,f){` で検索）:

```js
function focusField(i,f){
  const inp=document.querySelector(`.lotcard[data-i="${i}"] .fld[data-f="${f}"] input`);
  if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length,inp.value.length); }catch(e){} }
  return inp;
}
```

変更後:

```js
function focusField(i,f){
  // SNP欄は候補が2つ以上あると <select> になるので、input だけを探すと当たらない
  const sel=`.lotcard[data-i="${i}"] .fld[data-f="${f}"] input,.lotcard[data-i="${i}"] .fld[data-f="${f}"] select`;
  const inp=document.querySelector(sel);
  if(inp){ inp.focus(); try{ inp.setSelectionRange(inp.value.length,inp.value.length); }catch(e){} }
  return inp;
}
```

- [ ] **Step 1b: `addNextRow()` を PC でも効くようにする**

`addNextRow()` は新しい行を足したあと `.lotcard` にフォーカスを当てるが、
`.lotcards{display:none}`（601px 以上）なので **PC では何も起きない**。
行だけが増えてカーソルが飛ばない。

変更前（`function addNextRow(i){` で検索）:

```js
function addNextRow(i){
  const rows=document.querySelectorAll("#lotTable tbody tr");
  const last=rows[rows.length-1];
  // 末尾が空行ならそこへ移動、そうでなければ追加
  if(!last || rowValues(last).qty>0 || rowValues(last).name){ addRow(); }
  syncCards(); saveLots();
  const cards=document.querySelectorAll(".lotcard");
  const target=cards[cards.length-1];
  if(target){
    target.scrollIntoView({behavior:"smooth", block:"center"});
    const inp=target.querySelector('.fld[data-f="name"] input');
    if(inp) inp.focus();
  }
}
```

変更後:

```js
function addNextRow(i){
  const rows=document.querySelectorAll("#lotTable tbody tr");
  const last=rows[rows.length-1];
  // 末尾が空行ならそこへ移動、そうでなければ追加
  if(!last || rowValues(last).qty>0 || rowValues(last).name){ addRow(); }
  syncCards(); saveLots();
  // PC はカードが display:none なので、カード側だけを見ていると何も起きない。
  // 表示されているほうの品名欄へ送る
  const cards=document.querySelectorAll(".lotcard");
  const target=cards[cards.length-1];
  if(target && target.offsetParent!==null){
    target.scrollIntoView({behavior:"smooth", block:"center"});
    const inp=target.querySelector('.fld[data-f="name"] input');
    if(inp) inp.focus();
    return;
  }
  const trs=document.querySelectorAll("#lotTable tbody tr");
  const tr=trs[trs.length-1];
  if(tr){
    tr.scrollIntoView({behavior:"smooth", block:"center"});
    const inp=tr.querySelectorAll("select,input")[1];   // [0]=種別, [1]=品名
    if(inp) inp.focus();
  }
}
```

`offsetParent===null` は「その要素が描画されていない」ことを表す。
親の `.lotcards` が `display:none` のとき true になる。

- [ ] **Step 2: 遷移関数を足す**

Task 4 で作った「品名のオートコンプリート」セクションの**末尾**（`window.visualViewport` のブロックの後）に挿入する。

```js
/* ---------- 入力欄の Enter 遷移 ----------
   品名 → ロット → SNP → 個数 → 次の行の品名 の順に送る。種別はボタンなので飛ばす。
   カードとテーブルのどちらから呼ばれても動くよう、data-card の有無で見分ける。 */
const FIELD_ORDER=["name","lot","snp","qty"];

function nextField(el){
  const card=el.dataset.card;
  if(card!=null){
    const i=parseInt(card);
    const cur=el.closest(".fld");
    const f=cur?cur.dataset.f:null;
    const k=FIELD_ORDER.indexOf(f);
    if(k>=0 && k<FIELD_ORDER.length-1){ focusField(i, FIELD_ORDER[k+1]); return; }
    addNextRow(i);   // 個数まで来たら次の行へ
    return;
  }
  // テーブル側。c は [種別select, 品名, ロット, SNP, 個数] の5つ
  const c=[...el.closest("tr").querySelectorAll("select,input")];
  const k=c.indexOf(el);
  const nx=c[k+1];
  if(nx){ nx.focus(); try{ nx.setSelectionRange(nx.value.length,nx.value.length); }catch(e){} return; }
  addNextRow(rowIndexOf(el));
}

// ロット欄と SNP 欄の keydown。候補は出ないので Enter だけ見る
function enterKey(ev, el){
  if(ev.isComposing || ev.keyCode===229) return;   // 日本語の変換確定を奪わない
  if(ev.key!=="Enter") return;
  ev.preventDefault();
  nextField(el);
}
```

`data-card` はカードの品名欄にしか付けていないので、
ロット欄と SNP 欄にも付ける（次のステップ）。

- [ ] **Step 3: `acKey()` の末尾で次の欄へ送る**

変更前（`acKey` の中の、Task 4 で書いた末尾2行）:

```js
  if(open && acIndex>=0){ acPick(items[acIndex].dataset.name); return; }
  acClose();
}
```

変更後:

```js
  if(open && acIndex>=0){ acPick(items[acIndex].dataset.name); return; }
  acClose();
  nextField(inp);   // 候補を選ばずに Enter → ロット欄へ
}
```

- [ ] **Step 4: テーブルのロット欄と SNP 欄に配線する**

変更前（`addRow()` の中。`<td><input inputmode="tel" value="${esc(d.lot)}"` で検索）:

```html
    <td><input inputmode="tel" value="${esc(d.lot)}" placeholder="ロット" oninput="rowChanged(this)"></td>
    <td><input type="number" inputmode="numeric" min="1" value="${esc(d.snp)}" placeholder="SNP" oninput="rowChanged(this)"></td>
```

変更後:

```html
    <td><input inputmode="tel" enterkeyhint="next" value="${esc(d.lot)}" placeholder="ロット"
               oninput="rowChanged(this)" onkeydown="enterKey(event,this)"></td>
    <td><input type="number" inputmode="numeric" min="1" enterkeyhint="next" value="${esc(d.snp)}" placeholder="SNP"
               oninput="rowChanged(this)" onkeydown="enterKey(event,this)"></td>
```

- [ ] **Step 5: テーブルの個数欄に `enterkeyhint` を足す**

変更前（`onkeydown="if(event.key==='Enter'){event.preventDefault();addNextRow(rowIndexOf(this));}"` で検索。
テーブル側の1か所）:

```html
    <td><input type="number" inputmode="numeric" min="1" value="${esc(d.qty)}" placeholder="個数" oninput="rowChanged(this)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addNextRow(rowIndexOf(this));}"></td>
```

変更後:

```html
    <td><input type="number" inputmode="numeric" min="1" enterkeyhint="done" value="${esc(d.qty)}" placeholder="個数" oninput="rowChanged(this)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addNextRow(rowIndexOf(this));}"></td>
```

- [ ] **Step 6: カードのロット欄に配線する**

変更前（`syncCards()` の中。`<div class="fld" data-f="lot"><label>ロット</label>` で検索）:

```html
      <div class="fld" data-f="lot"><label>ロット</label>
        <input inputmode="tel" value="${esc(v.lot)}" placeholder="ロット" oninput="cardEdit(${i},2,this.value)">
        <button class="hyph" onclick="addHyphen(${i})" title="ハイフンを入力">−</button></div>
```

変更後:

```html
      <div class="fld" data-f="lot"><label>ロット</label>
        <input inputmode="tel" enterkeyhint="next" data-card="${i}" value="${esc(v.lot)}" placeholder="ロット"
               oninput="cardEdit(${i},2,this.value)" onkeydown="enterKey(event,this)">
        <button class="hyph" onclick="addHyphen(${i})" title="ハイフンを入力">−</button></div>
```

- [ ] **Step 7: カードの SNP 欄（プルダウンと入力欄の両方）に配線する**

変更前（`syncCards()` の中。`const opts=list.map(` から `snpField=` の2か所を含む塊）:

```js
    if(useSelect){
      const opts=list.map(s=>`<option value="${s}" ${s===v.snp?"selected":""}>${s}</option>`).join("");
      const cur = list.includes(v.snp) ? "" : `<option value="${v.snp}" selected>${v.snp}</option>`;
      snpField=`<select onchange="cardSnpSelect(${i},this.value)">${cur}${opts}</select>`;
    }else{
      snpField=`<input type="number" inputmode="numeric" min="1" value="${v.snp||""}" placeholder="SNP"
                       oninput="cardEdit(${i},3,this.value)" onchange="snpEntered(${i})">`;
    }
```

変更後:

```js
    if(useSelect){
      const opts=list.map(s=>`<option value="${s}" ${s===v.snp?"selected":""}>${s}</option>`).join("");
      const cur = list.includes(v.snp) ? "" : `<option value="${v.snp}" selected>${v.snp}</option>`;
      snpField=`<select data-card="${i}" onchange="cardSnpSelect(${i},this.value)"
                        onkeydown="enterKey(event,this)">${cur}${opts}</select>`;
    }else{
      snpField=`<input type="number" inputmode="numeric" min="1" enterkeyhint="next" data-card="${i}"
                       value="${v.snp||""}" placeholder="SNP"
                       oninput="cardEdit(${i},3,this.value)" onchange="snpEntered(${i})"
                       onkeydown="enterKey(event,this)">`;
    }
```

- [ ] **Step 8: カードの個数欄に `enterkeyhint` と `data-card` を足す**

変更前（`syncCards()` の中。`<div class="fld" data-f="qty"><label>個数</label>` で検索）:

```html
      <div class="fld" data-f="qty"><label>個数</label>
        <input type="number" inputmode="numeric" min="1" value="${v.qty||""}" placeholder="個数"
               oninput="cardEdit(${i},4,this.value)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addNextRow(${i});}"></div>
```

変更後:

```html
      <div class="fld" data-f="qty"><label>個数</label>
        <input type="number" inputmode="numeric" min="1" enterkeyhint="done" data-card="${i}"
               value="${v.qty||""}" placeholder="個数"
               oninput="cardEdit(${i},4,this.value)"
               onkeydown="if(event.key==='Enter'){event.preventDefault();addNextRow(${i});}"></div>
```

- [ ] **Step 9: PC のブラウザで確認する**

1. リロードし、PC レイアウトで入力テーブルの品名欄をクリックする
2. 候補に無い文字列（`テスト品`）を打ち、Enter を押す。**ロット欄**へ移ること
3. ロット欄で Enter。**SNP欄**へ移ること
4. SNP欄で Enter。**個数欄**へ移ること
5. 個数欄で Enter。**新しい行が増え、その品名欄**にフォーカスが移ること
6. 品名欄で候補が開いている状態で ↓ を押して候補を選び、Enter。
   候補が確定し、ロット欄へ移ること（新しい行は増えないこと）

- [ ] **Step 10: スマホ表示で確認する**

1. iPhone SE（375px）でリロードする
2. カードの品名欄で `テスト品` と打ち Enter。ロット欄へ移ること
3. ロット欄で Enter。SNP欄へ移ること
4. SNP欄で Enter。個数欄へ移ること
5. 個数欄で Enter。新しいカードが増え、その品名欄へ移ること
6. `部品C`（SNPが2つ登録されている）を選び、SNP欄が `<select>` になった状態で Enter。
   **個数欄へ移ること**（select でも遷移できること）

- [ ] **Step 11: Android 実機でキーボードのラベルと日本語入力を確認する**

Android Chrome で開く。iPhone は Enter 連鎖の対象外（Global Constraints 参照）。

1. 品名欄で、ソフトキーボードの Enter が「**次へ**」になっていること
2. ロット欄（テンキー）と SNP 欄（数字）で、実行キーを押すと次へ移ること
3. 個数の欄で「**完了**」になっていること
4. 品名に `ぶひん` と打ち、変換候補を Enter で確定する。
   **その場に留まり、ロット欄へ飛ばない**こと
5. 確定後にもう一度 Enter を押すと、ロット欄へ移ること
6. 候補リストが開いている状態で日本語を変換中に ↑↓ を押しても、
   候補リストの選択が動かない（IME の候補が動く）こと

- [ ] **Step 12: コミット**

```bash
git add files/index.html
git commit -m "feat: 入力欄の Enter で次の項目へ送る"
```

---

## Task 6: キャッシュ更新と全体の回帰確認

**Files:**
- Modify: `files/sw.js`（`CACHE_VERSION`）

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: なし（最終タスク）

- [ ] **Step 1: `CACHE_VERSION` を上げる**

変更前（`files/sw.js`。`const CACHE_VERSION = "v16";` で検索）:

```js
const CACHE_VERSION = "v16";
```

変更後:

```js
const CACHE_VERSION = "v17";
```

`sw.js` の fetch ハンドラは HTML を**ネットワーク優先**にしているので、
`index.html` 自体はオンラインなら上げなくても届く。
それでも上げるのは次の3つのため。

- `sw.js` の中身が変わることで新しい Service Worker が install され、
  画面下に「新しいバージョンがあります」のバーが出る（利用者が更新に気づける）
- `activate` で旧 `CACHE_NAME` のキャッシュが破棄される
- HTML 以外（`manifest.json` / アイコン）はキャッシュ優先なので、上げないと古いものが残る

- [ ] **Step 2: 回帰確認（既存機能が壊れていないこと）**

DevTools の "Bypass for network" を**外して**リロードする。
画面下に「新しいバージョンがあります」が出たら「更新する」を押す。

1. **手動調整の保存と復元** — コンソールに**データ A**を貼り、配置編集タブでロットを1つ別の列へ移す。
   リロードして、移した位置が保たれていること
2. **サンプル読込の確認** — 手動調整がある状態で「基本サンプル」を押すと
   「手動調整を破棄してサンプルを読み込みます。よろしいですか？」が出ること。
   「キャンセル」で入力が変わらないこと
3. **自動配置し直しの確認** — 手動調整がある状態で「▶ 自動配置を作成」を押すと
   「手動調整を破棄して自動配置し直します。よろしいですか？」が出ること
4. **通路編集** — 「通路を編集」でマスをタップし、その列が灰色の破線に変わること。
   もう一度タップで戻ること
5. **混載の警告** — コンソールに次を貼り、「⚠ 入りきらない荷物があります」または
   混載の注記が出ること

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  SAMPLES.mix.forEach(addRow);
  syncCards(); saveLots(); run(true);
})()
```

6. **端数の「半」表示** — 入力タブで「端数を『半』で表示」にチェックを入れ、
   パレット数が `24P 半` の形になること
7. **搬入日と納品タイミング** — 日付を変えると曜日のヒントが変わり、
   配置表タブの表に反映されること
8. **スペース設定** — 設定タブで「初期値に戻す」→「設定を反映」が動くこと
9. **印刷（ボタン）** — 配置表タブで「🖨 印刷」。表だけが1ページに収まること
10. **印刷（メニュー）** — **配置編集タブを開いたまま** Ctrl+P（Mac は Cmd+P）を押す。
    白紙ではなく、表が出ること
11. **他タブの選択が消えないこと** — 配置表タブで倍率を「150%」矢印を「なし」にしてから、
    配置編集タブでマスの大きさを「大」にする。配置表タブに戻って
    **150% と「なし」の選択が残っている**こと
12. **モードがタブをまたがないこと** — 配置編集タブで「ロットを移動」を押し、
    配置表タブへ移ってから戻る。移動モードが解除され、
    ボタンが「ロットを移動」に戻り、マスが選択できない状態になっていること

- [ ] **Step 3: 新機能の通し確認**

入力からやり直して、5つの改善が同時に動くことを見る。

1. 入力をクリアする
2. カードの品名欄に `新品目AA` と打つ（候補に無い）→ Enter → ロット欄
3. `1111-2222` と打つ → Enter → SNP欄
4. `12` と打つ → Enter → 個数欄
5. `120` と打つ → Enter → 新しいカードの品名欄
6. 2件目は品名欄をタップし、候補から `部品A` を選ぶ → ロット欄へ移る
7. ロット `L-101`、個数 `50` を入れる
8. 「▶ 自動配置を作成」を押す
9. 確認ダイアログに `新品目AA　SNP 12` が出るので OK を押す
10. **配置編集タブ**へ飛び、「✅ 「設定」タブに登録しました：新品目AA(12)」が出ること
11. マスに `1` と `2` の番号が出て、凡例の番号と一致すること
12. 設定タブに `新品目AA / 12` が登録されていること
13. 配置表タブに表が出て、印刷できること
14. PC でも同じ流れをテーブル側で通せること（個数 Enter で行が増え、
    新しい行の**品名欄にカーソルが入る**こと）

- [ ] **Step 3b: インストール済み PWA（standalone）で確認する**

ローカルの `http://<IP>` では Service Worker が登録されず standalone にもならないので、
ここまでの実機確認では見られない条件がある。
このブランチをマージして GitHub Pages に反映したあと、Android の実機で確認する。

1. ホーム画面のアイコンから起動する（アドレスバーが無い表示になること）
2. 「新しいバージョンがあります」が出たら「更新する」を押す
3. 品名欄をタップし、候補ドロップダウンが画面内に収まること
   （アドレスバーが無いぶん画面が縦に広がるので、位置決めの条件が変わる）
4. 一番下のカードで開いても、キーボードと固定バーに隠れないこと
5. 機内モードにして起動し、オフラインでも画面が出ること

- [ ] **Step 4: コミット**

```bash
git add files/sw.js
git commit -m "chore: 5改善に合わせて CACHE_VERSION を v17 に上げる"
```

---

## 完了後

すべてのタスクが終わったら `superpowers:finishing-a-development-branch` に進む。

このリポジトリには自動テストの基盤（`package.json` / テストランナー / Playwright 等）が無いため、
マージ前に流す E2E テストコマンドは存在しない。
Task 6 の Step 2〜3 の手動確認が、その代わりの受け入れ確認になる。
