# ブロック図でのロット移動 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブロック図でロットのマスを選択し、ドラッグ＆ドロップで別の列へ移せるようにする。

**Architecture:** 配置結果 `lastSp` を直接書き換える。移動の可否判定と `fills[]` の書き換えは DOM に触らない純粋関数に切り出し、コンソールから単体で検証できるようにする。ポインタ処理は Pointer Events で自前実装し、選択済みマスからのドラッグだけを移動として扱うことで既存の横スクロールと競合させない。表・引き出し線・警告はすべて `lastSp` を読むため追随は自動。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`）内のバニラ JavaScript と CSS。ビルドツールもテストランナーも無い。

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の2つのみ。新しいファイルは作らない
- **編集位置は行番号ではなくコード片で指定している。** 各ステップの「変更前」の文字列を検索して置き換えること
- 自動テストの基盤が無いため、各タスクの検証はブラウザのコンソールと手動確認で行う
- 検証用のローカルサーバはリポジトリのルートで `python3 -m http.server 50999` を起動し、
  `http://localhost:50999/files/index.html` を開く
- **`touch-action:none` は `.cell.sel` に CSS で静的に持たせる。** JS で付け外ししない。
  タッチでは 8px 動いた時点で既にブラウザがパンを開始しており、そこから変えても間に合わない
- **ドロップ先の判定に `event.target` を使わない。** `setPointerCapture()` 中はキャプチャ元に固定される。
  必ず `document.elementFromPoint()` で座標から引く
- **HTML5 Drag & Drop API を使わない。** iOS Safari で動作しない
- **`renderResult()` に配置を引数で渡さない。** 内部で呼ぶ `sheetEntries()` / `tailAreaOf()` が
  グローバルの `lastSp` / `lastLots` を直接読むため、引数を持たせると嘘になる
- **手動調整の指紋は `run()` を実行した時点のものを使う。** 保存した瞬間の入力ではない
- **端の自動スクロールは `requestAnimationFrame` のループで回す。** `pointermove` の中では、
  指を端で止めた瞬間にスクロールが止まる
- 印刷の非表示リストに `.hint` を追加する。追加しないと移動モードのヒント文が紙に出る
- 最後に `files/sw.js` の `CACHE_VERSION` を `v15` から `v16` にする（Task 7）
- 設計書は `docs/superpowers/specs/2026-08-24-block-map-lot-drag-design.md`

---

## File Structure

| ファイル | 責任 | このプランでの変更 |
|---|---|---|
| `files/index.html` | アプリ全体（HTML・CSS・JS が1ファイル） | `run()` の分割、セルへの data 属性、移動用の純粋関数、モードと選択、ドラッグ処理、保存と復元、CSS、ボタン1つとヒント1つ |
| `files/sw.js` | Service Worker（キャッシュ） | `CACHE_VERSION` の更新のみ |

既存の構造に合わせ、JS は既存のセクションコメントの区分に従って追記する。
移動関連の関数は「通路編集」セクションに寄せる。

---

## 検証用データ

DevTools のコンソールに貼り付けて実行する。以降のタスクで「データ A」のように参照する。

**データ A（添付画面と同じ入力・6行）** — メインが 9 列すべて埋まり、軒下①に 30P が入る。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [
    {type:"仕掛品",name:"部品A",lot:"111", snp:10,qty:235},
    {type:"仕掛品",name:"部品C",lot:"222", snp:10,qty:12},
    {type:"仕掛品",name:"部品B",lot:"333", snp:10,qty:23},
    {type:"仕掛品",name:"部品A",lot:"111", snp:10,qty:40},
    {type:"仕掛品",name:"製品X",lot:"5555",snp:10,qty:200},
    {type:"商品",  name:"製品W",lot:"6666",snp:10,qty:300}
  ].forEach(addRow);
  syncCards(); saveLots(); run(false);
  return JSON.stringify(lastSp.find(s=>s.name==="メイン").cols.map(c=>c.fills.map(f=>f.id+":"+f.count)));
})()
```

期待される出力:

```
[[],["0:7"],["0:7"],["0:7"],["0:7"],["3:7"],["3:7"],["3:6"],["2:3"],["1:2"],[]]
```

ロットidの対応は `部品A=0`（28P）/ `部品C=1`（2P）/ `部品B=2`（3P）/ `製品X=3`（20P）/ `製品W=4`（30P）。
合計 83P。メインの列番号 0 と 10 は通路。列 8 が `部品B`、列 9 が `部品C`。

**データ B（初期化）** — 保存を消して読み込み直す。

```js
Object.keys(localStorage).filter(k=>k.startsWith("palletApp.")).forEach(k=>localStorage.removeItem(k));
location.reload();
```

配置図タブをUI経由で開く手順は「入力タブ →『▶ 自動配置を作成』」。
コンソールからデータを流し込んだ場合は、画面上部の「配置図」タブを押してから
「ブロック図」ボタンを押す。

---

### Task 1: run() を分割して renderResult() と redraw() を切り出す

保存した手動調整を復元するときや、モードを切り替えたときに、`place()` を呼ばずに
画面を組み立て直す必要がある。`run()` の後半を切り出して共用する。
このタスクでは挙動を変えない。

**Files:**
- Modify: `files/index.html`（`run`）

**Interfaces:**
- Consumes: なし
- Produces:
  - `inputWarnHtml(unknown, typeMix) -> string` — 入力そのものへの警告HTML
  - `renderResult(lots, unknown, typeMix) -> void` — グローバルの `lastSp` を読んで画面を組み立てる。`lastColor` を更新する
  - `redraw() -> void` — 現在の `lastLots` / `lastSp` で描き直す。結果が無ければ何もしない
  - `run(goMap)` のシグネチャと挙動は変わらない

- [ ] **Step 1: 変更前の描画結果を記録する**

ローカルサーバを起動する。

```bash
python3 -m http.server 50999
```

`http://localhost:50999/files/index.html` を開き、コンソールで「データ A」を実行する。
続けて次を実行し、出力を控える。

```js
(function(){
  return JSON.stringify({
    msg:document.getElementById("messages").innerHTML.length,
    legend:document.getElementById("legend").innerHTML.length,
    near:document.getElementById("zone-near").innerHTML.length,
    far:document.getElementById("zone-far").innerHTML.length,
    sum:document.getElementById("summary").textContent
  });
})()
```

期待される出力（数値は控えるだけでよい。`sum` は次のとおり）:

```
{"msg":...,"legend":...,"near":...,"far":...,"sum":"合計 810個 → 83P ／ 配置済 83P ／ あふれ 0P"}
```

- [ ] **Step 2: run() を置き換える**

`/* ---------- 実行 ---------- */` から `function run(goMap){` の閉じ括弧までを探し、
次の4つの関数で置き換える。

変更前（先頭で位置を特定する。末尾は `if(goMap) switchTab('map');` と `}`）:

```js
/* ---------- 実行 ---------- */
function run(goMap){
  const {lots, unknown, typeMix}=readLots();
```

変更後:

```js
/* ---------- 実行 ---------- */
// 入力そのものへの警告（SNP未入力・種別の食い違い）。
// 自動配置の直後と、保存した手動調整の復元の両方から使う。
function inputWarnHtml(unknown, typeMix){
  let h="";
  if(typeMix && typeMix.length){
    h+=`<div class="msg warn">⚠ 同じ品名・ロットで種別（仕掛品／商品）が違う行があります：${
      typeMix.join(" / ")}。先に入力した行の種別でまとめています。</div>`;
  }
  if(unknown && unknown.length){
    h+=`<div class="msg warn">⚠ SNPが未入力のため計算できない荷物があります：${
      unknown.map(u=>`${u.name||"(品名なし)"}${u.lot?"／"+u.lot:""}（個数${u.qty}）`).join(" / ")
    }</div>`;
  }
  return h;
}

/* 配置結果を画面に出す。place() は呼ばない。
   配置は引数で受け取らずグローバルの lastSp を読む。
   ここから呼ぶ sheetEntries() と tailAreaOf() が lastSp / lastLots を直接見るため、
   引数で別の配置を渡しても実際には反映されない。渡せるように見せるほうが危険なので持たせない。 */
function renderResult(lots, unknown, typeMix){
  const sp=lastSp;
  const m=document.getElementById("messages");
  let warnHtml=inputWarnHtml(unknown, typeMix);

  const colorOf={}; lots.forEach((l,i)=>colorOf[l.id]=PALETTE[i%PALETTE.length]);
  lastColor=colorOf;

  const over=lots.filter(l=>l.rem>0);
  const usedAisle=sp.some(s=>s.cols.some(c=>c.aisle&&c.fills.length));
  const usedMix=sp.some(s=>s.cols.some(c=>c.fills.length>1));
  // 配置図の表は上段SHEET_TOP_SLOTS欄・下段SHEET_BOTTOM_SLOTS欄しかない。載りきらないロットは黙って消えるので知らせる。
  const overTop=sheetEntries(SHEET_TOP,null).length-SHEET_TOP_SLOTS;
  const overBottom=sheetEntries(SHEET_BOTTOM,"メイン").length-SHEET_BOTTOM_SLOTS;
  // 設定でスペース名を変えると SHEET_TOP/SHEET_BOTTOM のどちらにも属さないエリアができる。
  // そこに置かれたロットは欄自体が無く、上のカウントにも表れずに表から消える。
  const sheetNames=new Set([...SHEET_TOP, ...SHEET_BOTTOM]);
  const noSlotAreas=sp.filter(s=>!sheetNames.has(s.name) && s.cols.some(c=>c.fills.length)).map(s=>s.name);
  if(overTop>0 || overBottom>0 || noSlotAreas.length){
    const parts=[];
    if(overTop>0) parts.push(`軒下 ${overTop}件`);
    if(overBottom>0) parts.push(`倉庫内 ${overBottom}件`);
    if(noSlotAreas.length) parts.push(`表に欄のないエリア: ${noSlotAreas.join("・")}`);
    warnHtml+=`<div class="msg warn">⚠ 配置図の表に載りきらないロットがあります：${parts.join(" / ")}。ブロック図で確認してください。</div>`;
  }

  if(over.length){
    m.innerHTML=warnHtml+`<div class="msg warn">⚠ 入りきらない荷物があります：${over.map(l=>`${l.name}(${l.code}) 残${l.rem}P`).join(" / ")}</div>`;
  }else{
    let notes=[]; if(usedAisle)notes.push("通路へのはみ出しあり"); if(usedMix)notes.push("混載あり");
    m.innerHTML=warnHtml+`<div class="msg ok">✅ すべてのパレットを配置しました。${notes.length?"（"+notes.join("・")+"）":""}</div>`;
  }

  document.getElementById("legend").innerHTML=lots.map(l=>
    `<span><i class="swatch" style="background:${colorOf[l.id]}"></i>${esc(l.name)} / ${esc(l.lot)||"—"}　${l.pallets}P${l.parts>1?`（${l.parts}件）`:""}</span>`).join("");

  drawZone("zone-far", sp.filter(s=>s.zone==="far"), colorOf);
  drawZone("zone-near", sp.filter(s=>s.zone==="near"), colorOf);

  const total=lots.reduce((a,b)=>a+b.pallets,0);
  const rem=over.reduce((a,b)=>a+b.rem,0);
  const totalQty=lots.reduce((a,b)=>a+b.qty,0);
  document.getElementById("summary").textContent=`合計 ${totalQty}個 → ${total}P ／ 配置済 ${total-rem}P ／ あふれ ${rem}P`;

  showMapState();
}

// 今ある結果でそのまま描き直す。手動移動の後やモード切替から呼ぶ。
function redraw(){
  if(!hasResult || !lastLots) return;
  const {unknown, typeMix}=readLots();
  renderResult(lastLots, unknown, typeMix);
}

function run(goMap){
  const {lots, unknown, typeMix}=readLots();
  if(lots.length===0 && unknown.length===0){ alert("荷物を1件以上入力してください。"); return; }

  if(lots.length===0){
    hasResult=false; lastLots=null;
    document.getElementById("messages").innerHTML=inputWarnHtml(unknown, typeMix);
    showMapState();
    document.getElementById("mapEmpty").style.display="none";
    document.getElementById("mapBody").style.display="block";
    document.getElementById("legend").innerHTML="";
    document.getElementById("zone-far").innerHTML="";
    document.getElementById("zone-near").innerHTML="";
    document.getElementById("summary").textContent="";
    if(goMap) switchTab('map');
    return;
  }

  const allowMix=document.getElementById("mixChk").checked;
  lastSp=place(lots,allowMix); lastLots=lots; hasResult=true;

  renderResult(lots, unknown, typeMix);
  if(goMap) switchTab('map');
}
```

- [ ] **Step 3: 描画結果が変わっていないことを確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行してから、Step 1 と同じ計測を実行する。

```js
(function(){
  return JSON.stringify({
    msg:document.getElementById("messages").innerHTML.length,
    legend:document.getElementById("legend").innerHTML.length,
    near:document.getElementById("zone-near").innerHTML.length,
    far:document.getElementById("zone-far").innerHTML.length,
    sum:document.getElementById("summary").textContent
  });
})()
```

期待される結果: Step 1 で控えた値と**完全に一致**する。

- [ ] **Step 4: redraw() が同じ結果を出すことを確かめる**

続けてコンソールで実行する。

```js
(function(){
  const before=document.getElementById("zone-near").innerHTML;
  redraw();
  return document.getElementById("zone-near").innerHTML===before;
})()
```

期待される出力:

```
true
```

- [ ] **Step 5: 空入力の分岐を確かめる**

コンソールで実行する。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  addRow({type:"仕掛品",name:"部品A",lot:"111",snp:"",qty:100});
  syncCards(); run(false);
  return document.getElementById("messages").innerHTML.indexOf("SNPが未入力")>=0;
})()
```

期待される出力:

```
true
```

確認したらページを再読み込みして入力を元に戻す。

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "refactor: run() から renderResult() / redraw() / inputWarnHtml() を切り出す"
```

---

### Task 2: マスに data-lot / data-row を出す

選択とドラッグでマスを特定するため、`.cell` に属性を付ける。

**Files:**
- Modify: `files/index.html`（`cellsOf`, `drawZone`）

**Interfaces:**
- Consumes: なし
- Produces:
  - `cellsOf(col)` の各要素に `row`（列内の行番号 0 始まり）が付く
  - `.cell` に `data-row` が必ず、`data-lot`（ロットid）が中身のあるマスにだけ付く
  - スペース名と列番号は従来どおり親の `.colwrap[data-space][data-col]` から取る

- [ ] **Step 1: cellsOf に行番号を持たせる**

次の関数全体を探して置き換える。

変更前:

```js
function cellsOf(col){
  const arr=Array.from({length:col.h},()=>({id:null,seg:false,label:""}));
  let r=0;
  col.fills.forEach((f,fi)=>{
    for(let k=0;k<f.count;k++){ if(r<col.h){ arr[r]={id:f.id,seg:(k===0&&fi>0),label:""}; r++; } }
    if(r-1>=0) arr[r-1].label = f.id;
  });
  return arr;
}
```

変更後:

```js
// row は列内の行番号（0始まり）。選択とドラッグでマスを特定するために持たせる。
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

- [ ] **Step 2: セルのテンプレートに属性を足す**

次の1行を探して置き換える。

変更前:

```js
        cells+=`<div class="${cls.join(' ')}" style="${bg?'background:'+bg:''}">${label}</div>`;
```

変更後:

```js
        cells+=`<div class="${cls.join(' ')}" data-row="${a.row}"${filled?` data-lot="${a.id}"`:""}`
              +` style="${bg?'background:'+bg:''}">${label}</div>`;
```

- [ ] **Step 3: 属性が出ていることを確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行してから次を実行する。

```js
(function(){
  const all=document.querySelectorAll("#zone-near .cell, #zone-far .cell");
  const filled=document.querySelectorAll("#zone-near .cell[data-lot], #zone-far .cell[data-lot]");
  const noRow=[...all].filter(c=>c.dataset.row==null).length;
  const c=document.querySelector('#zone-near .colwrap[data-space="メイン"][data-col="8"] .cell[data-lot]');
  return JSON.stringify({filled:filled.length, noRow:noRow,
    col8:{lot:c.dataset.lot, row:c.dataset.row}});
})()
```

期待される出力（配置済み合計 83P、行番号の欠けなし、メイン列8は `部品B(id:2)` が row 0 から）:

```
{"filled":83,"noRow":0,"col8":{"lot":"2","row":"0"}}
```

- [ ] **Step 4: 表示が壊れていないことを目視する**

画面上部の「配置図」タブ →「ブロック図」を押す。
マスの色・ロット番号の表示・列下のキャプション（`7/7` や `0/5 通`）が従来どおりであること。

- [ ] **Step 5: コミット**

```bash
git add files/index.html
git commit -m "feat: ブロック図のマスに data-lot / data-row を出す"
```

---

### Task 3: 移動のデータ操作（純粋関数）

DOM に触らない関数として、選択の集計・ブロック数の計算・移動の適用・可否判定を作る。
このタスクではまだ UI から呼ばない。コンソールから直接呼んで検証する。

**Files:**
- Modify: `files/index.html`（`/* ---------- 通路編集 ---------- */` の直前に追加）

**Interfaces:**
- Consumes: 既存の `used(col)`、`clone(o)`、`AREA_GROUPS`
- Produces:
  - `selCounts(cells: Set<string>) -> {"スペース名|列番号": マス数}`
  - `areaKeyOf(name) -> string`
  - `blockCountOf(sp, lotId) -> number`
  - `normalizeFills(sp) -> void`（破壊的）
  - `movingCount(counts, destSpaceName, destColIndex) -> number`
  - `moveCells(next, lotId, counts, destSpaceName, destColIndex) -> number`（移動したマス数。破壊的）
  - `validateMove(sp, lotId, counts, destSpaceName, destColIndex) -> {ok, same?, reason?, needConfirm?, before?, after?, next?}`
    `ok:true` のとき `next` に移動適用済みのコピーが入る

- [ ] **Step 1: 関数を追加する**

`/* ---------- 通路編集 ---------- */` の行を探し、その**直前**に次を挿入する。

```js
/* ---------- ロットの手動移動（データ操作） ----------
   ここの関数は DOM に触らない。コンソールから直接呼んで検証できる。 */

// 選択（"スペース名|列番号|行番号" の集合）を「スペース名|列番号 → マス数」に集計する
function selCounts(cells){
  const n={};
  cells.forEach(k=>{
    const p=k.split("|");
    const key=p[0]+"|"+p[1];
    n[key]=(n[key]||0)+1;
  });
  return n;
}

// 運用上ひとつづきに使うエリア（AREA_GROUPS）は、分割の判定でも1つの束として扱う。
// 束にしないと 軒下①から軒下② への移動が毎回「2か所に分かれます」になる。
function areaKeyOf(name){
  const g=AREA_GROUPS.find(g=>g.includes(name));
  return g?g.join("+"):name;
}

// あるロットが何ブロックに分かれているかを数える。
// 束ごとに列を連結し、列番号が隣り合っていれば1ブロック。
// 間に挟まる列がすべて「空の通路列」の場合も1ブロックとみなす。
// 別の束にあれば必ず別ブロック。
function blockCountOf(sp, lotId){
  const groups={};
  sp.forEach(s=>{
    const k=areaKeyOf(s.name);
    (groups[k]=groups[k]||[]).push(...s.cols);
  });
  let total=0;
  Object.keys(groups).forEach(k=>{
    const cols=groups[k];
    const idx=[];
    cols.forEach((c,i)=>{ if(c.fills.some(f=>f.id===lotId)) idx.push(i); });
    if(!idx.length) return;
    let blocks=1;
    for(let j=1;j<idx.length;j++){
      let bridged=true;
      for(let i=idx[j-1]+1;i<idx[j];i++){
        const c=cols[i];
        if(!(c.aisle && c.fills.length===0)){ bridged=false; break; }
      }
      if(!bridged) blocks++;
    }
    total+=blocks;
  });
  return total;
}

// count が 0 以下の要素を捨て、同じ列で隣り合う同一ロットの要素を統合する。
// 隣り合っていない同一ロット（間に別ロットが挟まる形）は畳まない。
// 畳むと間のロットの位置が動いてしまうため。
function normalizeFills(sp){
  sp.forEach(s=>s.cols.forEach(col=>{
    const out=[];
    col.fills.forEach(f=>{
      if(f.count<=0) return;
      const last=out[out.length-1];
      if(last && last.id===f.id){ last.count+=f.count; return; }
      out.push(f);
    });
    col.fills=out;
  }));
}

// 実際に動くマス数。落とし先の列に既にあるマスは動かないので除く。
// これにより「2列に分かれたロットを全部選び、片方の列に落としてまとめる」が成立する。
function movingCount(counts, destSpaceName, destColIndex){
  const skip=destSpaceName+"|"+destColIndex;
  let n=0;
  Object.keys(counts).forEach(k=>{ if(k!==skip) n+=counts[k]; });
  return n;
}

// 移動を適用する。next は lastSp のコピーを渡すこと（破壊的に書き換える）。
// 移動先には自動配置の fillMix と同じく fills の先頭へ差し込む。
// 見た目でどちら側になるかはエリアによって違う
// （メインは上端、軒下②は下端、横向きのエリアは左端）。
function moveCells(next, lotId, counts, destSpaceName, destColIndex){
  const skip=destSpaceName+"|"+destColIndex;
  let total=0;
  Object.keys(counts).forEach(key=>{
    if(key===skip) return;                       // 落とし先に既にある分は動かさない
    const p=key.split("|");
    const s=next.find(x=>x.name===p[0]); if(!s) return;
    const col=s.cols[parseInt(p[1])]; if(!col) return;
    let need=counts[key];
    col.fills.forEach(f=>{
      if(need<=0 || f.id!==lotId) return;
      const take=Math.min(need, f.count);
      f.count-=take; need-=take; total+=take;
    });
  });
  const ds=next.find(x=>x.name===destSpaceName);
  const dc=ds.cols[destColIndex];
  const entry={id:lotId, count:total};
  if(dc.aisle) entry.ov=true;
  if(dc.fills.length) entry.mix=true;
  dc.fills.unshift(entry);
  normalizeFills(next);
  return total;
}

// 移動の可否を判定する。sp は書き換えない。
// ok:true のとき next に移動適用済みのコピーが入るので、呼び出し側はそれを lastSp に入れる。
function validateMove(sp, lotId, counts, destSpaceName, destColIndex){
  const ds=sp.find(x=>x.name===destSpaceName);
  if(!ds) return {ok:false, reason:"エリアが見つかりません"};
  const dc=ds.cols[destColIndex];
  if(!dc) return {ok:false, reason:"列が見つかりません"};
  const n=movingCount(counts, destSpaceName, destColIndex);
  if(n<=0) return {ok:false, same:true, reason:"動くマスがありません"};
  // used(dc) には落とし先に既にあるそのロットの分が含まれ、n からはその分が除かれているので
  // 二重に数えることはない。
  if(used(dc)+n > dc.h) return {ok:false, reason:"移動先の空きが足りません"};
  const before=blockCountOf(sp, lotId);
  const next=clone(sp);
  moveCells(next, lotId, counts, destSpaceName, destColIndex);
  const after=blockCountOf(next, lotId);
  return {ok:true, needConfirm: after>before, before, after, next};
}

```

- [ ] **Step 2: selCounts と blockCountOf を検証する**

ブラウザを再読み込みし、コンソールで実行する。

```js
(function(){
  const cnt=selCounts(new Set(["メイン|1|0","メイン|1|1","メイン|2|0"]));
  // 列0=通路(空) / 列1,2=id5 / 列3=空 / 列4=id5 → 1〜2 は連続、4 は飛び地で 2ブロック
  const sp1=[{name:"X",cols:[
    {h:6,aisle:true,fills:[]},
    {h:7,aisle:false,fills:[{id:5,count:7}]},
    {h:7,aisle:false,fills:[{id:5,count:7}]},
    {h:7,aisle:false,fills:[]},
    {h:7,aisle:false,fills:[{id:5,count:3}]}]}];
  // 列1=id5 / 列2=空の通路 / 列3=id5 → 通路をまたいで1ブロック
  const sp2=[{name:"X",cols:[
    {h:7,aisle:false,fills:[{id:5,count:7}]},
    {h:6,aisle:true, fills:[]},
    {h:7,aisle:false,fills:[{id:5,count:3}]}]}];
  // 束でないエリアに分かれていれば 2ブロック
  const sp3=[{name:"X",cols:[{h:7,aisle:false,fills:[{id:5,count:7}]}]},
             {name:"Y",cols:[{h:7,aisle:false,fills:[{id:5,count:2}]}]}];
  // 軒下①と軒下②は AREA_GROUPS の束なので、またいでも 1ブロック
  const sp4=[{name:"軒下①",cols:[{h:11,aisle:false,fills:[{id:5,count:11}]}]},
             {name:"軒下②",cols:[{h:4, aisle:false,fills:[{id:5,count:2}]}]}];
  return JSON.stringify({cnt, b1:blockCountOf(sp1,5), b2:blockCountOf(sp2,5),
    b3:blockCountOf(sp3,5), b4:blockCountOf(sp4,5)});
})()
```

期待される出力:

```
{"cnt":{"メイン|1":2,"メイン|2":1},"b1":2,"b2":1,"b3":2,"b4":1}
```

- [ ] **Step 3: moveCells と normalizeFills を検証する**

コンソールで実行する。

```js
(function(){
  // 列0の id5 から 3マスを、列2（既に id9 が入っている）へ移す
  const sp=[{name:"X",cols:[
    {h:7,aisle:false,fills:[{id:5,count:7}]},
    {h:7,aisle:false,fills:[]},
    {h:7,aisle:false,fills:[{id:9,count:2}]}]}];
  const moved=moveCells(sp, 5, {"X|0":3}, "X", 2);
  // 列0を空にして、その全部を通路の列1へ移す（ov フラグの確認）
  const sp2=[{name:"X",cols:[
    {h:7,aisle:false,fills:[{id:5,count:2}]},
    {h:6,aisle:true, fills:[]}]}];
  moveCells(sp2, 5, {"X|0":2}, "X", 1);
  return JSON.stringify({moved,
    col0:sp[0].cols[0].fills, col2:sp[0].cols[2].fills,
    aisle:sp2[0].cols[1].fills, emptied:sp2[0].cols[0].fills});
})()
```

期待される出力（移動分は列2の**先頭**に入り `mix:true` が付く。空になった列の要素は消える）:

```
{"moved":3,"col0":[{"id":5,"count":4}],"col2":[{"id":5,"count":3,"mix":true},{"id":9,"count":2}],"aisle":[{"id":5,"count":2,"ov":true}],"emptied":[]}
```

- [ ] **Step 4: validateMove を検証する**

コンソールで実行する。

```js
(function(){
  const sp=[{name:"X",cols:[
    {h:7,aisle:false,fills:[{id:5,count:7}]},
    {h:7,aisle:false,fills:[{id:9,count:6}]},
    {h:7,aisle:false,fills:[]},
    {h:7,aisle:false,fills:[]}]}];
  const brief=v=>({ok:v.ok,same:v.same,needConfirm:v.needConfirm,before:v.before,after:v.after,reason:v.reason});
  // 寄せて詰める：列0と列2から選んで列2に落とす → 列0の分だけが動く
  const sp2=[{name:"X",cols:[
    {h:7,aisle:false,fills:[{id:5,count:2}]},
    {h:7,aisle:false,fills:[]},
    {h:7,aisle:false,fills:[{id:5,count:1}]}]}];
  const g=validateMove(sp2,5,{"X|0":2,"X|2":1},"X",2);
  return JSON.stringify({
    full: brief(validateMove(sp,5,{"X|0":3},"X",1)),   // 列1の空きは1マス → 拒否
    same: brief(validateMove(sp,5,{"X|0":3},"X",0)),   // 選択がすべて落とし先 → 動かない
    near: brief(validateMove(sp,5,{"X|0":3},"X",2)),   // 隣の列 → 確認不要
    far:  brief(validateMove(sp,5,{"X|0":3},"X",3)),   // 離れた列 → 飛び地なので確認
    gather: brief(g),
    gatherCols: g.next[0].cols.map(c=>c.fills.map(f=>f.id+":"+f.count)),
    intact: JSON.stringify(sp[0].cols[0].fills)        // 元は書き換わっていない
  });
})()
```

期待される出力:

```
{"full":{"ok":false,"reason":"移動先の空きが足りません"},"same":{"ok":false,"same":true,"reason":"動くマスがありません"},"near":{"ok":true,"needConfirm":false,"before":1,"after":1},"far":{"ok":true,"needConfirm":true,"before":1,"after":2},"gather":{"ok":true,"needConfirm":false,"before":2,"after":1},"gatherCols":[[],[],["5:3"]],"intact":"[{\"id\":5,\"count\":7}]"}
```

`gather` が「2か所 → 1か所」になり、確認なしで列2にまとまることを確認する。

- [ ] **Step 5: 実データで往復させる**

コンソールで「データ A」を実行してから次を実行する。
メイン列9の `部品C(id:1, 2P)` を PC横 の列0へ全部移し、元に戻す。

```js
(function(){
  const v=validateMove(lastSp, 1, {"メイン|9":2}, "PC横", 0);
  const back=validateMove(v.next, 1, {"PC横|0":2}, "メイン", 9);
  return JSON.stringify({
    ok:v.ok, needConfirm:v.needConfirm,
    moved: v.next.find(s=>s.name==="PC横").cols[0].fills,
    src:   v.next.find(s=>s.name==="メイン").cols[9].fills,
    back:  back.next.find(s=>s.name==="メイン").cols[9].fills
  });
})()
```

期待される出力（ロット全部を移すので飛び地にならず `needConfirm:false`）:

```
{"ok":true,"needConfirm":false,"moved":[{"id":1,"count":2}],"src":[],"back":[{"id":1,"count":2}]}
```

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "feat: ロット移動のデータ操作（selCounts/blockCountOf/moveCells/validateMove）"
```

---

### Task 4: 「ロットを移動」モードとマスの選択

ボタンでモードに入り、マスのタップで選択できるようにする。まだ移動はしない。

**Files:**
- Modify: `files/index.html`（CSS、印刷CSS、配置図タブのヘッダHTML、`drawZone`、通路編集セクション）

**Interfaces:**
- Consumes: Task 1 の `redraw()`
- Produces:
  - `moveMode: boolean`、`sel: {lotId:number|null, cells:Set<string>}`、`dragMoved: boolean`
  - `setEditMode(on)` / `setMoveMode(on)` / `toggleEdit()` / `toggleMove()` / `clearSel()`
  - `cellKey(cellEl) -> "スペース名|列番号|行番号"`、`toggleCell(cellEl)`
  - CSS クラス `.cell.sel` / `.colwrap.drop-ok` / `.colwrap.drop-ng` / `.dragghost`

- [ ] **Step 1: CSS を足す**

次の行を探す。

変更前:

```css
  .cell.aisle-empty{background:#e5e7eb}
```

変更後:

```css
  .cell.aisle-empty{background:#e5e7eb}
  /* ---- ロットの手動移動 ---- */
  /* 選択中のマス。マスの背景はロットの色なので、色ではなく枠で示す。
     touch-action:none は「選択された時点」で必要。ドラッグ開始まで待つと
     ブラウザが先にパンを始めてしまい pointercancel で中断する。 */
  .cell.sel{box-shadow:inset 0 0 0 2px #fff, 0 0 0 2px #111827;border-color:#111827;
            touch-action:none}
  .colwrap.drop-ok .col,.colwrap.drop-ok .hrow{outline:3px solid #16a34a}
  .colwrap.drop-ng .col,.colwrap.drop-ng .hrow{outline:3px solid #dc2626}
  .dragghost{position:fixed;z-index:70;pointer-events:none;background:rgba(17,24,39,.9);color:#fff;
             border-radius:6px;padding:4px 8px;font-size:12px;font-weight:700;
             transform:translate(-50%,-160%);white-space:nowrap}
```

続けて `.cell` の定義に長押しの抑止を足す。

変更前:

```css
  .cell{width:var(--cell);height:var(--cell);border:1px solid #cbd5e1;border-radius:2px;background:#fff;overflow:hidden;
        display:flex;align-items:center;justify-content:center;font-weight:600;color:#1f2937;
        font-size:calc(var(--cell) * .3);line-height:1}
```

変更後:

```css
  .cell{width:var(--cell);height:var(--cell);border:1px solid #cbd5e1;border-radius:2px;background:#fff;overflow:hidden;
        display:flex;align-items:center;justify-content:center;font-weight:600;color:#1f2937;
        font-size:calc(var(--cell) * .3);line-height:1;
        user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
```

- [ ] **Step 2: 印刷でヒント文が出ないようにする**

`.hint` は現在の非表示リストに入っていない。このままだと移動モードのまま印刷したときに
「移動モード：…」の行と「選択解除」ボタンが紙に出る。

変更前:

```css
    header,.tabs,.actionbar,#updateBar,.sizectl,#mapBody,#messages,#regInfo,#saveStatus,.note{display:none !important}
```

変更後:

```css
    header,.tabs,.actionbar,#updateBar,.sizectl,#mapBody,#messages,#regInfo,#saveStatus,.note,.hint{display:none !important}
```

- [ ] **Step 3: ボタンとヒントを足す**

次を探す。

変更前:

```html
      <h2>配置図
        <button id="editBtn" class="btn btn-ghost" style="margin-left:auto" onclick="toggleEdit()">通路を編集</button>
      </h2>
      <div id="editHint" class="hint" style="display:none;margin-bottom:8px">✏ 編集モード：マスをタップするとその列が「通路（灰・破線）」⇔「通常」に切り替わります。</div>
```

変更後:

```html
      <h2>配置図
        <button id="moveBtn" class="btn btn-ghost" style="margin-left:auto" onclick="toggleMove()">ロットを移動</button>
        <button id="editBtn" class="btn btn-ghost" style="margin-left:8px" onclick="toggleEdit()">通路を編集</button>
      </h2>
      <div id="editHint" class="hint" style="display:none;margin-bottom:8px">✏ 編集モード：マスをタップするとその列が「通路（灰・破線）」⇔「通常」に切り替わります。</div>
      <div id="moveHint" class="hint" style="display:none;margin-bottom:8px">✋ 移動モード：同じロットのマスをタップして選び、選んだマスをドラッグして別の列へ運びます。
        <button class="btn-mini" onclick="clearSel()">選択解除</button></div>
```

- [ ] **Step 4: 再描画したら選択を捨てる**

`drawZone()` が走ると DOM ごと作り直されるため、`.sel` クラスは消えるが
`sel.cells` の中身だけが残ってしまう。設定タブの変更など、移動モードのまま
再描画される経路があるので、`drawZone()` の先頭で選択を捨てる。

変更前:

```js
function drawZone(elId, spaces, colorOf){
  const el=document.getElementById(elId); el.innerHTML="";
```

変更後:

```js
function drawZone(elId, spaces, colorOf){
  // 作り直すと .sel クラスは消えるので、選択の状態も一緒に捨てる
  if(typeof clearSel==="function") clearSel();
  const el=document.getElementById(elId); el.innerHTML="";
```

- [ ] **Step 5: モードと選択のロジックを入れる**

次の関数とリスナ全体を探して置き換える。

変更前:

```js
/* ---------- 通路編集 ---------- */
function toggleEdit(){
  editMode=!editMode;
  const b=document.getElementById("editBtn");
  b.className = "btn "+(editMode?"btn-on":"btn-ghost");
  b.textContent = editMode?"編集を終了":"通路を編集";
  document.getElementById("editHint").style.display = editMode?"block":"none";
  if(lastLots) run(false);
}
document.addEventListener("click",e=>{
  if(!editMode)return;
  const w=e.target.closest(".colwrap"); if(!w)return;
  const sp=SPACES.find(s=>s.name===w.dataset.space); if(!sp)return;
  sp.cols[parseInt(w.dataset.col)].aisle=!sp.cols[parseInt(w.dataset.col)].aisle;
  document.getElementById("cfgText").value=spacesToText();
  showCapacity(); run(false);
});
```

変更後:

```js
/* ---------- 通路編集 / ロット移動（モードと選択） ---------- */
let moveMode=false;
let sel={lotId:null, cells:new Set()};
// ドラッグの直後に飛んでくる click を無視するための印。Task 5 で立てる。
let dragMoved=false;

function setEditMode(on){
  editMode=on;
  const b=document.getElementById("editBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"編集を終了":"通路を編集";
  document.getElementById("editHint").style.display = on?"block":"none";
}
function setMoveMode(on){
  moveMode=on;
  const b=document.getElementById("moveBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"移動を終了":"ロットを移動";
  document.getElementById("moveHint").style.display = on?"block":"none";
  if(!on) clearSel();
}
// 2つのモードは排他。通路編集は前提そのものを変えるので、従来どおり配置し直す。
function toggleEdit(){
  setEditMode(!editMode);
  if(editMode) setMoveMode(false);
  if(lastLots) run(false);
}
// 移動モードの出入りでは配置し直さない。ただし editable クラスが DOM に焼き込まれているので
// 描き直して落とす。
function toggleMove(){
  setMoveMode(!moveMode);
  if(moveMode) setEditMode(false);
  redraw();
}
function clearSel(){
  sel.lotId=null; sel.cells.clear();
  document.querySelectorAll(".cell.sel").forEach(c=>c.classList.remove("sel"));
}
function cellKey(cellEl){
  const w=cellEl.closest(".colwrap");
  return w.dataset.space+"|"+w.dataset.col+"|"+cellEl.dataset.row;
}
// 1マス目でロットが決まり、以降は同じロットのマスしか選べない。
function toggleCell(cellEl){
  if(cellEl.dataset.lot==null) return;          // 空マスは選べない
  const id=parseInt(cellEl.dataset.lot);
  if(sel.lotId==null) sel.lotId=id;
  else if(sel.lotId!==id) return;               // 別ロットのマスは無視する
  const k=cellKey(cellEl);
  if(sel.cells.has(k)){ sel.cells.delete(k); cellEl.classList.remove("sel"); }
  else { sel.cells.add(k); cellEl.classList.add("sel"); }
  if(sel.cells.size===0) sel.lotId=null;
}

document.addEventListener("click",e=>{
  if(moveMode) return;
  if(!editMode)return;
  const w=e.target.closest(".colwrap"); if(!w)return;
  const sp=SPACES.find(s=>s.name===w.dataset.space); if(!sp)return;
  sp.cols[parseInt(w.dataset.col)].aisle=!sp.cols[parseInt(w.dataset.col)].aisle;
  document.getElementById("cfgText").value=spacesToText();
  showCapacity(); run(false);
});
document.addEventListener("click",e=>{
  if(!moveMode) return;
  if(dragMoved){ dragMoved=false; return; }     // ドラッグ直後の click は選択を動かさない
  const c=e.target.closest(".cell"); if(!c) return;
  if(!c.closest("#mapBody")) return;
  toggleCell(c);
});
```

- [ ] **Step 6: 選択の挙動を確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行する。
画面上部の「配置図」タブ →「ブロック図」→「ロットを移動」を押す。

メインの列8（`部品B` の緑）のマスを1つタップ → 白い内枠が付く。
同じ列のもう1マスをタップ → 2マスとも選択される。
列9（`部品C` の赤）のマスをタップ → **何も起きない**。
選択済みのマスをもう一度タップ → 解除される。

コンソールで確認する。

```js
JSON.stringify({lotId:sel.lotId, cells:[...sel.cells], dom:document.querySelectorAll(".cell.sel").length})
```

期待される出力の形（列8の2マスを選んだ状態）:

```
{"lotId":2,"cells":["メイン|8|0","メイン|8|1"],"dom":2}
```

- [ ] **Step 7: モードの排他を確かめる**

「通路を編集」を押す →「ロットを移動」のボタンが灰色（オフ）に戻り、選択が消えること。
もう一度「ロットを移動」を押す →「通路を編集」がオフに戻り、
列に hover してもオレンジの枠が出ないこと（`editable` が落ちている）。
移動モード中に列をタップしても通路が切り替わらないこと。

- [ ] **Step 8: 印刷でヒントが出ないことを確かめる**

移動モードのまま「配置図の表」に切り替え、印刷プレビューを開く。
「移動モード：…」の行が紙に出ないこと。確認したらプレビューを閉じる。

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "feat: ロット移動モードとマスの選択"
```

---

### Task 5: ドラッグ＆ドロップで移動する

選択済みのマスからドラッグして、別の列へ落とせるようにする。

**Files:**
- Modify: `files/index.html`（ロット移動セクションの末尾に追加）

**Interfaces:**
- Consumes: Task 3 の `selCounts` / `validateMove`、Task 4 の `sel` / `moveMode` / `clearSel` / `dragMoved`、Task 1 の `redraw`
- Produces:
  - `applyMove(spaceName, colIndex) -> void` — 検証して `lastSp` を更新し再描画する
  - `saveManual()` を呼ぶ（Task 6 で実装。**このタスクでは空の関数を先に置く**）

- [ ] **Step 1: ドラッグ処理を追加する**

Task 4 で書き換えた2つ目の `document.addEventListener("click", …)`（`if(!moveMode) return;` で始まる方）の**直後**に、次を挿入する。

```js
/* ---------- ロット移動（ドラッグ） ---------- */
let drag=null;                       // {id, x0, y0, started, ghost, target}
let lastDropKey=null;                // 直前に判定した列。同じ列に留まる間は判定を繰り返さない
let edge={x:0, y:0, raf:0};          // 端の自動スクロール

// Task 6 で中身を入れる。ここでは何もしない。
function saveManual(){}

function wrapAt(x,y){
  const el=document.elementFromPoint(x,y);
  const w=el?el.closest(".colwrap"):null;
  return (w && w.closest("#mapBody")) ? w : null;
}
function clearDropMark(){
  document.querySelectorAll(".colwrap.drop-ok,.colwrap.drop-ng")
    .forEach(w=>w.classList.remove("drop-ok","drop-ng"));
}
// 判定は内部で配置全体を clone するので、同じ列にいる間は結果を使い回す。
// pointermove ごとに回すとスマホで毎秒60〜120回の複製になる。
function highlightDrop(x,y){
  const w=wrapAt(x,y);
  const key=w?(w.dataset.space+"|"+w.dataset.col):"";
  if(key===lastDropKey) return;
  lastDropKey=key;
  clearDropMark();
  if(!w) return;
  const v=validateMove(lastSp, sel.lotId, selCounts(sel.cells), w.dataset.space, parseInt(w.dataset.col));
  if(v.same) return;                 // 動くマスが無い列には何も出さない
  w.classList.add(v.ok?"drop-ok":"drop-ng");
}
// 端の自動スクロールは rAF で回す。pointermove の中で送ると、
// 指を端で止めた瞬間にイベントが来なくなってスクロールも止まる。
function edgeTick(){
  if(!drag || !drag.started){ edge.raf=0; return; }
  const x=edge.x, y=edge.y;
  document.querySelectorAll("#mapBody .scroller").forEach(sc=>{
    const r=sc.getBoundingClientRect();
    if(y<r.top || y>r.bottom) return;
    if(x<r.left+40)       sc.scrollLeft-=8;
    else if(x>r.right-40) sc.scrollLeft+=8;
  });
  if(y<60) window.scrollBy(0,-8);
  else if(y>window.innerHeight-60) window.scrollBy(0,8);
  edge.raf=requestAnimationFrame(edgeTick);
}
function edgeScroll(x,y){
  edge.x=x; edge.y=y;
  if(!edge.raf) edge.raf=requestAnimationFrame(edgeTick);
}
function endDrag(){
  if(drag){
    if(drag.ghost) drag.ghost.remove();
    try{ drag.target.releasePointerCapture(drag.id); }catch(err){}
  }
  drag=null; lastDropKey=null;
  if(edge.raf){ cancelAnimationFrame(edge.raf); edge.raf=0; }
  clearDropMark();
}
// 検証して lastSp を更新する。動くマスが無い場合と容量不足は黙って中止する。
function applyMove(spaceName, colIndex){
  const counts=selCounts(sel.cells);
  const v=validateMove(lastSp, sel.lotId, counts, spaceName, colIndex);
  if(!v.ok) return;
  if(v.needConfirm){
    const lot=lastLots.find(l=>l.id===sel.lotId);
    const name=lot?`${lot.name} / ${lot.lot||"—"}`:"このロット";
    if(!confirm(`${name} が ${v.before}か所から ${v.after}か所に分かれます。このまま移動しますか？`)) return;
  }
  lastSp=v.next;
  saveManual();
  clearSel();
  redraw();
}

document.addEventListener("pointerdown",e=>{
  dragMoved=false;
  if(!moveMode || !sel.cells.size) return;
  if(e.button!=null && e.button!==0) return;    // 右クリック・中クリックでは始めない
  const c=e.target.closest(".cell"); if(!c) return;
  if(!c.classList.contains("sel")) return;      // 選択済みのマスからだけ掴める
  drag={id:e.pointerId, x0:e.clientX, y0:e.clientY, started:false, ghost:null, target:c};
});
document.addEventListener("pointermove",e=>{
  if(!drag || e.pointerId!==drag.id) return;
  if(!drag.started){
    if(Math.abs(e.clientX-drag.x0)<8 && Math.abs(e.clientY-drag.y0)<8) return;
    drag.started=true; dragMoved=true;
    try{ drag.target.setPointerCapture(drag.id); }catch(err){}
    const lot=lastLots?lastLots.find(l=>l.id===sel.lotId):null;
    drag.ghost=document.createElement("div");
    drag.ghost.className="dragghost";
    drag.ghost.textContent=`${lot?lot.name:""} ${sel.cells.size}P`;
    document.body.appendChild(drag.ghost);
  }
  drag.ghost.style.left=e.clientX+"px";
  drag.ghost.style.top =e.clientY+"px";
  highlightDrop(e.clientX, e.clientY);
  edgeScroll(e.clientX, e.clientY);
});
document.addEventListener("pointerup",e=>{
  if(!drag || e.pointerId!==drag.id) return;
  const started=drag.started, x=e.clientX, y=e.clientY;
  endDrag();
  if(!started) return;                          // 動いていなければタップ（click 側で処理）
  const w=wrapAt(x,y); if(!w) return;
  applyMove(w.dataset.space, parseInt(w.dataset.col));
});
document.addEventListener("pointercancel",endDrag);
document.addEventListener("lostpointercapture",endDrag);
```

- [ ] **Step 2: applyMove を単体で確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行する。
UI を使わず、選択状態を作って `applyMove` を直接呼ぶ。

```js
(function(){
  moveMode=true;
  sel.lotId=1; sel.cells=new Set(["メイン|9|0","メイン|9|1"]);   // 部品C の2マス
  applyMove("PC横", 0);
  return JSON.stringify({
    pc: lastSp.find(s=>s.name==="PC横").cols[0].fills,
    main9: lastSp.find(s=>s.name==="メイン").cols[9].fills,
    selCleared: sel.cells.size
  });
})()
```

期待される出力:

```
{"pc":[{"id":1,"count":2}],"main9":[],"selCleared":0}
```

- [ ] **Step 3: 表に反映されていることを確かめる**

続けてコンソールで実行する。

```js
(function(){
  setView('sheet');
  const t=document.querySelector("#sheetView").textContent;
  return JSON.stringify({pcNote:t.indexOf("※PC横")>=0, hasLot:t.indexOf("222")>=0});
})()
```

期待される出力（`部品C` の欄に「※PC横」の注記が付く）:

```
{"pcNote":true,"hasLot":true}
```

確認したら `setView('block')` でブロック図に戻す。

- [ ] **Step 4: 実際にドラッグして確かめる（PC）**

ブラウザを再読み込みし、コンソールで「データ A」を実行する。
「配置図」タブ →「ブロック図」→「ロットを移動」。

1. メイン列8（`部品B` の緑）のマスを3つ選ぶ
2. 選んだマスからドラッグして、メインの左端の通路列（`0/6 通`）の上へ運ぶ
   → ドラッグ中にゴースト「部品B 3P」が指に付いてくる。通路列が緑の枠になる
3. 離す → 通路列に3マス入り、キャプションが `3/6 通` になる。
   メッセージが「通路へのはみ出しあり」を含む

続けて次を確かめる。

4. `製品X` のマスを1つ選び、まだ空きのある列（`3/7` など）の上へドラッグ
   → 緑の枠。離すと列の**上側**に入り、破線の区切りが出る。メッセージに「混載あり」が入る
5. 5マス選んで、空きが1マスしかない列へドラッグ → **赤い枠**。離しても何も起きない。選択は残る
6. 選択したマスをドラッグして離れた列へ運ぶ → 分割の確認ダイアログが出る。
   キャンセルで何も起きず、OK で移動する
7. 選択していないマスからドラッグ → 従来どおり横スクロールする
8. マスを右クリックしたままドラッグ → 移動は始まらない
9. 選択したマスをドラッグしたまま画面の右端で**止める** → 止めている間もスクロールが続く

- [ ] **Step 5: 寄せて詰める操作を確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行する。
まず `部品B`（3P・メイン列8）を2列に分ける。

```js
(function(){
  moveMode=true;
  sel.lotId=2; sel.cells=new Set(["メイン|8|0"]);
  applyMove("メイン", 9);                          // 1マスだけ列9（部品C の列）へ混載して分割する
  return JSON.stringify({col8:lastSp.find(s=>s.name==="メイン").cols[8].fills,
                         col9:lastSp.find(s=>s.name==="メイン").cols[9].fills});
})()
```

期待される出力（`部品B(id:2)` が列8に2マス、列9に1マス）:

```
{"col8":[{"id":2,"count":2}],"col9":[{"id":2,"count":1,"mix":true},{"id":1,"count":2}]}
```

画面で「ロットを移動」に入り、`部品B` のマスを**全部**（列8の2マスと列9の1マス）選び、
**列8**へドロップする。

期待される結果: 列9の1マスだけが列8へ移り、`部品B` が列8に3マスでまとまる。
列8と列9は隣り合っているので分割数は1のままであり、確認ダイアログは出ない。
（2か所から1か所へまとまる場合の確認なしは Task 3 Step 4 の `gather` で検証済み。）

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "feat: 選択したマスをドラッグ＆ドロップで移動する"
```

---

### Task 6: 手動調整の保存と復元

入力と列構成が同じ間は、手動調整した配置を再読み込み後も保つ。

**Files:**
- Modify: `files/index.html`（`STORE_KEY`、ロット移動セクション、`toggleEdit`、`run`、配置ボタンのHTML、`initLots`）

**Interfaces:**
- Consumes: Task 1 の `redraw`、Task 5 の `saveManual` の呼び出し箇所
- Produces:
  - `STORE_KEY.manual = "palletApp.manual"`、`lastFp: string|null`
  - `inputFingerprint() -> string`、`saveManual()`、`clearManual()`、`hasManual() -> boolean`
  - `restoreManual() -> boolean`（復元したら true）
  - `runFromButton()` — 「▶ 自動配置を作成」から呼ぶ入口

- [ ] **Step 1: STORE_KEY にキーを足す**

変更前:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", view:"palletApp.view", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner"};
```

変更後:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", view:"palletApp.view", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual"};
```

- [ ] **Step 2: saveManual の仮実装を本実装に置き換える**

Task 5 で置いた仮の関数を探して置き換える。

変更前:

```js
// Task 6 で中身を入れる。ここでは何もしない。
function saveManual(){}
```

変更後:

```js
/* 手動調整の保存。
   指紋は「荷物の入力」と「列構成」を連結したもの。

   指紋は保存した瞬間ではなく run() を実行した時点のものを使う（lastFp）。
   荷物の入力欄を編集しても run() は呼ばれないため、
   「自動配置 → 入力を書き換える → 配置図に戻って手動移動」という順序が成立してしまう。
   保存時の入力を指紋にすると {編集後の指紋, 編集前の配置} という食い違った組が残り、
   リロード時に一致してしまって古い配置が復元される。

   列構成を含めるのは、SPACES が localStorage に保存されておらず
   リロードで DEFAULT_SPACES に戻るため。設定を変えてから調整すると
   復元した配置と SPACES のジオメトリが食い違う。 */
let lastFp=null;
function inputFingerprint(){ return JSON.stringify(readRowData())+"|#|"+spacesToText(); }
function saveManual(){
  if(lastFp==null) return;
  saveData(STORE_KEY.manual, {fp:lastFp, sp:lastSp, lots:lastLots});
}
function clearManual(){ saveData(STORE_KEY.manual, null); }
function hasManual(){ return !!loadData(STORE_KEY.manual); }
// 保存済みの手動調整を復元する。復元したら true。place() は呼ばない。
function restoreManual(){
  const d=loadData(STORE_KEY.manual);
  if(!d || !d.sp || !d.lots) return false;
  if(d.fp!==inputFingerprint()){ clearManual(); return false; }
  lastSp=d.sp; lastLots=d.lots; hasResult=true; lastFp=d.fp;
  redraw();
  return true;
}
// 「▶ 自動配置を作成」の入口。手動調整があるときだけ確認する。
function runFromButton(){
  if(hasManual() && !confirm("手動調整を破棄して自動配置し直します。よろしいですか？")) return;
  run(true);
}
```

- [ ] **Step 3: run() で指紋を記録し、手動調整を破棄する**

`run()` の中の次の行を探して置き換える。

変更前:

```js
  const allowMix=document.getElementById("mixChk").checked;
  lastSp=place(lots,allowMix); lastLots=lots; hasResult=true;
```

変更後:

```js
  const allowMix=document.getElementById("mixChk").checked;
  lastSp=place(lots,allowMix); lastLots=lots; hasResult=true;
  lastFp=inputFingerprint();   // この配置を作った時点の入力と列構成
  clearManual();               // 配置し直したので手動調整は捨てる
```

- [ ] **Step 4: 通路編集の開始時に確認を出す**

「通路を編集」はモードに入った時点で `run(false)` が走るため、
列を1つも変えなくても手動調整が全部消える。ボタンが「ロットを移動」のすぐ隣にあるので、
押し間違いを拾えるように確認を出す。

変更前:

```js
function toggleEdit(){
  setEditMode(!editMode);
  if(editMode) setMoveMode(false);
  if(lastLots) run(false);
}
```

変更後:

```js
function toggleEdit(){
  // 入るだけで配置し直すので、手動調整があるなら先に確認する
  if(!editMode && hasManual() &&
     !confirm("通路の編集に入ると自動配置し直すため、手動調整は破棄されます。よろしいですか？")) return;
  setEditMode(!editMode);
  if(editMode) setMoveMode(false);
  if(lastLots) run(false);
}
```

- [ ] **Step 5: 配置ボタンの入口を差し替える**

2か所ある。どちらも `run(true)` を `runFromButton()` に変える。

変更前（1か所目）:

```html
        <button class="btn btn-primary" id="runBtnInline" onclick="run(true)">▶ 自動配置を作成</button>
```

変更後:

```html
        <button class="btn btn-primary" id="runBtnInline" onclick="runFromButton()">▶ 自動配置を作成</button>
```

変更前（2か所目）:

```html
  <button class="btn btn-primary" onclick="run(true)">▶ 自動配置を作成</button>
```

変更後:

```html
  <button class="btn btn-primary" onclick="runFromButton()">▶ 自動配置を作成</button>
```

- [ ] **Step 6: 起動時に復元する**

変更前:

```js
    syncCards(); saveLots(); run(false);
  }else{
    SAMPLES.basic.forEach(addRow);
    syncCards(); saveLots(); run(false);
  }
```

変更後:

```js
    syncCards(); saveLots();
    // 入力と列構成が保存時と同じなら、手動調整した配置をそのまま出す
    if(!restoreManual()) run(false);
  }else{
    SAMPLES.basic.forEach(addRow);
    syncCards(); saveLots(); run(false);
  }
```

- [ ] **Step 7: 保存と復元を確かめる**

ブラウザを再読み込みし、コンソールで「データ A」を実行する。
「配置図」タブ →「ブロック図」→「ロットを移動」。
メイン列9の `部品C` の2マスを選び、PC横 の **8マスある行**へドラッグして移す。

コンソールで保存を確認する。

```js
(function(){
  const d=loadData(STORE_KEY.manual);
  return JSON.stringify({saved:!!d, fpMatch:d.fp===inputFingerprint(),
    pc:d.sp.find(s=>s.name==="PC横").cols.map(c=>c.fills.map(f=>f.id+":"+f.count))});
})()
```

期待される出力（`部品C(id:1)` が PC横 の 8マスの行に 2P）:

```
{"saved":true,"fpMatch":true,"pc":[["1:2"],[]]}
```

ページを再読み込みする（F5）。「配置図」タブ →「ブロック図」を開く。

```js
JSON.stringify(lastSp.find(s=>s.name==="PC横").cols.map(c=>c.fills.map(f=>f.id+":"+f.count)))
```

期待される出力: 再読み込み前と同じ（`部品C` が PC横 にいる）。

- [ ] **Step 8: 入力を変えたら自動配置に戻ることを確かめる**

「入力」タブで、どれか1行の個数を 1 だけ変える。ページを再読み込みする。
「配置図」タブ →「ブロック図」を開く。

```js
JSON.stringify({pc:lastSp.find(s=>s.name==="PC横").cols.map(c=>c.fills.length),
                manual:loadData(STORE_KEY.manual)})
```

期待される出力（PC横 は空に戻り、保存も消えている）:

```
{"pc":[0,0],"manual":null}
```

- [ ] **Step 9: 「配置を作った時点の指紋」が効いていることを確かめる**

これが `lastFp` を入れた理由の確認。**この検証を飛ばさないこと。**

コンソールで「データ A」を実行する。次に「入力」タブで `部品C` の個数を 12 から 50 に変える
（この時点では `run()` は走らないので配置図は古いまま）。
「配置図」タブ →「ブロック図」→「ロットを移動」で、どれか1マスを別の列へ移す。
ページを再読み込みする。

```js
JSON.stringify({manual:loadData(STORE_KEY.manual),
                lotC:lastLots.find(l=>l.name==="部品C").pallets})
```

期待される出力（保存は破棄され、新しい入力で自動配置し直されている。50個 → 5P）:

```
{"manual":null,"lotC":5}
```

保存した瞬間の入力を指紋にしていると、ここで古い 2P の配置が復元されてしまう。

- [ ] **Step 10: 破棄の確認ダイアログを確かめる**

再度「データ A」を実行し、ブロック図で1回移動する。
「入力」タブへ戻り「▶ 自動配置を作成」を押す。

- 確認ダイアログ「手動調整を破棄して自動配置し直します。よろしいですか？」が出ること
- キャンセル → 何も起きない（配置図は調整後のまま）
- OK → 自動配置に戻る

続けて、調整していない状態で「▶ 自動配置を作成」を押す → **確認は出ない**こと。

さらに、調整した状態で「通路を編集」を押す
→「通路の編集に入ると自動配置し直すため、手動調整は破棄されます」の確認が出ること。
キャンセルすると編集モードに入らず、調整も残ること。

- [ ] **Step 11: 列構成を変えたら復元しないことを確かめる**

「データ A」を実行 → ブロック図で1回移動 →「設定」タブでスペース定義の
どれか1行の列の高さを 1 変えて反映 → 再読み込み。

```js
JSON.stringify(loadData(STORE_KEY.manual))
```

期待される出力:

```
null
```

- [ ] **Step 12: コミット**

```bash
git add files/index.html
git commit -m "feat: 手動調整した配置を保存し、入力と列構成が同じ間は復元する"
```

---

### Task 7: キャッシュ更新と通し確認

**Files:**
- Modify: `files/sw.js`

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: なし

- [ ] **Step 1: CACHE_VERSION を上げる**

変更前:

```js
const CACHE_VERSION = "v15";
```

変更後:

```js
const CACHE_VERSION = "v16";
```

- [ ] **Step 2: 主動線で通し確認する**

localStorage を消して初期状態から始める。

```js
Object.keys(localStorage).filter(k=>k.startsWith("palletApp.")).forEach(k=>localStorage.removeItem(k));
location.reload();
```

コンソールから流し込むのではなく、画面の入力欄に「データ A」の6行を手で入れ、
「▶ 自動配置を作成」を押して配置図を開く。そのうえで下の表を上から順に実行する。

| # | 操作 | 期待結果 |
|---|---|---|
| 1 | `部品C` の2マスを選び PC横 へドロップ | メインから消え PC横 に入る。表の下段に「※PC横」が付く。確認ダイアログは出ない |
| 2 | `部品A` の3マスを選び左端の通路列へドロップ | 通路列に3マス入り `3/6 通`。「通路へのはみ出しあり」が出る。表の「半」マークが通路のマスに移る |
| 3 | 2マスを選び、空きのある列へドロップ | 列の上側に入り破線の区切りが出る。「混載あり」が出る |
| 4 | 5マス選び、空きが1マスの列へドラッグ | 赤い枠。離しても何も起きない。選択は残る |
| 5 | 選択を離れた列へドロップ | 分割の確認ダイアログ。キャンセルで無変化、OK で移動 |
| 6 | 2列に分かれたロットを全マス選び、マスが多いほうの列へドロップ | 1列にまとまる。確認ダイアログは出ない |
| 7 | 既に2か所に分かれたロットを、分割数を変えずに移す | 確認ダイアログが出ない |
| 8 | 別ロットのマスをタップ | 何も起きない |
| 9 | 「選択解除」を押す | 選択がすべて外れる |
| 10 | ページを再読み込み | 調整後の配置が復元される |
| 11 | 入力を1文字変えて再読み込み | 自動配置に戻る |
| 12 | 調整後に「▶ 自動配置を作成」 | 確認ダイアログが出る。OK で自動配置 |
| 13 | 調整後に「通路を編集」を押す | 確認ダイアログが出る。キャンセルで編集モードに入らず調整も残る |
| 14 | 「配置図の表」に切り替える | 品名・ロット・パレット数・注記・半マーク・引き出し線が調整後の内容 |
| 15 | 移動モードのまま印刷プレビューを開く | 表のみ。ヒント文・選択の枠・ゴーストは出ない |
| 16 | 「マスの大きさ」を 小/中/大 に変える | マスの大きさが変わる。`setCellSize` は CSS 変数を変えるだけで再描画しないため、選択は保持される |

- [ ] **Step 3: 実機で確認する**

`python3 -m http.server 50999 --bind 0.0.0.0` で起動し、同じ Wi-Fi のスマホから
`http://<PCのIP>:50999/files/index.html` を開く。

**iOS Safari**

- 選択していないマスから指を滑らせる → ブロック図が横スクロールする
- 選択したマスから指を滑らせる → **ページがスクロールせず**ゴーストが付いてくる
- マスを長押ししても選択ハンドルやコールアウトが出ない
- 画面の右端に指を置いて**止めた**まま待つ → スクロールが続き、PC横 まで運べる
- ドロップして配置が変わる。アプリを一度バックグラウンドに送って戻しても調整が残る
- 2本目の指を置いてもゴーストが画面に残らない

**Android Chrome** — 同上。

- [ ] **Step 4: コミット**

```bash
git add files/sw.js
git commit -m "chore: ロット移動の追加に合わせて CACHE_VERSION を v16 に上げる"
```

---

## 既知の制約（実装しないと決めたもの）

- **エリアをまたいで手動分割したロットの「半」マークが実物と違うエリアに出ることがある。**
  `tailAreaOf()` が「自動配置の詰め順で最後のエリアが末尾」という前提で書かれているため。
  発生条件は「端数あり」かつ「手動でエリアをまたいで分割」の両方が揃ったときだけ。
- **混載で押し下げられた既存ロットの引き出し線が斜めになることがある。** 既存の制約。
- **同じ列に同一ロットが2箇所に分かれる形が残ることがある。** `[{id:9},{id:5}]` の列に
  id5 を差し込むと `[{id:5},{id:9},{id:5}]` になる。畳むと間のロットが動くため畳まない。
- **「入りきらない荷物」は手動で置けない。** ブロック図にマスが無く選択できない。
- **キーボード操作は無い。**
- **取り消し／履歴は無い。** リセットは「▶ 自動配置を作成」のやり直し。
  誤操作への備えは「通路を編集」の開始時の確認だけ。

---

## 完了後

`superpowers:finishing-a-development-branch` に進む前に、次の E2E をユーザーに提示すること。
このプロジェクトにはテストランナーが無いため、E2E は Task 7 Step 2〜3 の手動確認が該当する。

```bash
python3 -m http.server 50999
```

`http://localhost:50999/files/index.html` を開き、Task 7 Step 2 の16シナリオと
Step 3 の実機確認を実行する。
