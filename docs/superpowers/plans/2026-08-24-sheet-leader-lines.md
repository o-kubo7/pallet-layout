# 配置図の表の引き出し線（矢印）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の表の下段各欄から、メイン配置図の対応するスペースへ実線の矢印を引く。

**Architecture:** 配置側は `fillMix` の押し込み方向を判定して混載時の矢印干渉を減らす。描画側は `<table>` を `position:relative` のラッパで包み、その中に SVG を絶対配置で重ねる。座標は `getBoundingClientRect()` を table 基準で取り、直線1本と回転矢頭を描く。既存の注記行 24px と gap 行 11px の合計 35px を矢印帯として使うため、表の高さは変わらない。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`）内のバニラ JavaScript、SVG、CSS。ビルドツールもテストランナーも無い。

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の2つのみ
- 印刷はモノクロ。色に頼った表現を追加しない
- 表の高さを変えない。`SHEET_W` / `SHEET_H` と印刷の `zoom:1.5` は据え置き
- **`offsetLeft` / `offsetTop` を座標に使わない。** `td.g` だけが `position:relative` を持つため
  `offsetParent` が他の td（TABLE 基準）と違い BODY 基準になる。実測で確認済み。
  座標は必ず `getBoundingClientRect()` の table 基準差分で取る
- **編集位置は行番号ではなくコード片で指定している。** 各ステップの「変更前」の文字列を検索して置き換えること
- 自動テストの基盤が無いため、各タスクの検証はブラウザでの手動確認とする
- 検証用のローカルサーバはリポジトリのルートで `python3 -m http.server 50999` を起動し、
  `http://localhost:50999/files/index.html` を開く
- 設計書は `docs/superpowers/specs/2026-08-24-sheet-leader-lines-design.md`

---

## File Structure

| ファイル | 責任 | このプランでの変更 |
|---|---|---|
| `files/index.html` | アプリ全体（HTML・CSS・JS が1ファイル） | 配置ロジックの判定、CSS 数行、`gridRows` の戻り値、引き出し線の描画関数の追加、矢頭トグルの UI と保存 |
| `files/sw.js` | Service Worker（キャッシュ） | `CACHE_VERSION` の更新のみ |

既存の構造に合わせ、新しいファイルは作らない。JS は既存のセクションコメントの区分に従って追記する。

---

## 検証用データ

DevTools のコンソールに貼り付けて実行する。以降のタスクで「データ B」のように参照する。

**データ A（標準サンプル）** — localStorage を消して再読み込みした初期状態。

```js
Object.keys(localStorage).filter(k=>k.startsWith("palletApp.")).forEach(k=>localStorage.removeItem(k));
location.reload();
```

**データ B（全エリア満杯 134P）** — メインに混載が2箇所発生する。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [
    {type:"完成品",name:"部品A",lot:"4779-4777",snp:10,qty:200},
    {type:"完成品",name:"部品B",lot:"4779-4679",snp:10,qty:200},
    {type:"完成品",name:"部品C",lot:"4777-4673",snp:10,qty:200},
    {type:"完成品",name:"部品D",lot:"4777-4779",snp:10,qty:150},
    {type:"完成品",name:"部品E",lot:"466-4771", snp:10,qty:300},
    {type:"完成品",name:"製品X",lot:"467-4772", snp:10,qty:80},
    {type:"完成品",name:"製品Y",lot:"467-4771", snp:10,qty:120},
    {type:"完成品",name:"製品Z",lot:"468-4775", snp:10,qty:100},
    {type:"完成品",name:"製品W",lot:"469-4776",snp:10,qty:50}
  ].forEach(addRow);
  syncCards(); run(false);
  return JSON.stringify(lastSp[0].cols.map(c=>c.fills));
})()
```

**データ C（少数の大口 2ロット）** — 矢印が浅い角度になるケース。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [
    {type:"完成品",name:"部品A",lot:"4779-4777",snp:10,qty:400},
    {type:"完成品",name:"部品B",lot:"4779-4679",snp:10,qty:250}
  ].forEach(addRow);
  syncCards(); run(false);
  return JSON.stringify(lastSp[0].cols.map(c=>c.fills));
})()
```

配置図タブを開くには次を実行する（タブの UI を経由しない場合）。

```js
document.getElementById("tab-input").style.display="none";
document.getElementById("tab-map").style.display="block";
setView('sheet');
```

---

### Task 1: 混載の向きを判定する

混載列で押し込む分を原則として上に置き、既存ロットがその列しか持たない場合だけ下に足す。

**Files:**
- Modify: `files/index.html`（`fillMix`）

**Interfaces:**
- Consumes: なし
- Produces: `fillMix(lot, cols, rem)` の引数と戻り値は変えない。`col.fills` の並び順だけが変わる

- [ ] **Step 1: 変更前の配置を記録する**

ローカルサーバを起動する。

```bash
python3 -m http.server 50999
```

`http://localhost:50999/files/index.html` を開き、コンソールで「データ B」を実行する。

期待される出力（変更前）— メイン列5と列8で、混載された `製品Z`（id:7）が2番目にある:

```
[[{"id":2,"count":6,"ov":true}],
 [{"id":4,"count":7,"ov":false}], …,
 [{"id":4,"count":2,"ov":false},{"id":7,"count":5,"mix":true}],   ← 列5
 …,
 [{"id":0,"count":6,"ov":false},{"id":7,"count":1,"mix":true}],   ← 列8
 …]
```

- [ ] **Step 2: 判定を入れる**

次の関数全体を探して置き換える。

変更前:

```js
/* 満杯のときだけ使う最終手段。空きのある列に品目を混ぜて押し込む。 */
function fillMix(lot, cols, rem){
  for(const c of cols){
    if(rem<=0)break;
    if(c.aisle)continue;
    const free=c.h-used(c); if(free<=0)continue;
    const put=Math.min(rem,free); c.fills.push({id:lot.id,count:put,mix:true}); rem-=put;
  }
  return rem;
}
```

変更後:

```js
/* 満杯のときだけ使う最終手段。空きのある列に品目を混ぜて押し込む。
   押し込む分は原則として列の上側に置く。下に回るロットは、たいてい先行する列に
   上端から入っている大口なので、引き出し線の終点はそちらの上端になり干渉しない。
   ただし今その列を使っているロットが他の列を持たない場合だけは、
   そのロットを上端に残すために下へ足す。 */
function fillMix(lot, cols, rem){
  for(const c of cols){
    if(rem<=0)break;
    if(c.aisle)continue;
    const free=c.h-used(c); if(free<=0)continue;
    const put=Math.min(rem,free);
    const holder=c.fills.length?c.fills[0].id:null;
    const alone = holder!=null && !cols.some(o=>o!==c && o.fills.some(f=>f.id===holder));
    if(alone) c.fills.push({id:lot.id,count:put,mix:true});
    else      c.fills.unshift({id:lot.id,count:put,mix:true});
    rem-=put;
  }
  return rem;
}
```

- [ ] **Step 3: 判定そのものを検証する**

ブラウザを再読み込みし、コンソールで実行する。
`fillMix` を直接呼んで、両方の分岐を確かめる。

```js
(function(){
  // ケース1: 既存ロット id:2 が列0にも列1にもある → 上に押し込む（unshift）
  const a=[{h:7,aisle:false,fills:[{id:2,count:7}]},
           {h:7,aisle:false,fills:[{id:2,count:2}]}];
  fillMix({id:9}, a, 3);
  // ケース2: 既存ロット id:2 が列1にしかない → 下に足す（push）
  const b=[{h:7,aisle:false,fills:[{id:1,count:7}]},
           {h:7,aisle:false,fills:[{id:2,count:2}]}];
  fillMix({id:9}, b, 3);
  return JSON.stringify({
    case1:a[1].fills.map(f=>f.id),
    case2:b[1].fills.map(f=>f.id)
  });
})()
```

期待される出力:

```
{"case1":[9,2],"case2":[2,9]}
```

`case1` は押し込んだ id:9 が先頭（上）に、`case2` は id:2 が先頭のまま（id:9 が下）になる。

- [ ] **Step 4: 満杯データで配置を確認する**

コンソールで「データ B」を実行する。

期待される出力 — 列5と列8で `製品Z`（id:7）が先頭に来る:

```
 [{"id":7,"count":5,"mix":true},{"id":4,"count":2,"ov":false}],   ← 列5
 [{"id":7,"count":1,"mix":true},{"id":0,"count":6,"ov":false}],   ← 列8
```

- [ ] **Step 5: メイン内の全ロットが上端から始まることを確認する**

続けてコンソールで実行する。

```js
(function(){
  const sp=lastSp[0], bad=[], seen=new Set();
  sp.cols.forEach((col,ci)=>{
    let r=0;
    col.fills.forEach(f=>{
      if(!seen.has(f.id)){ seen.add(f.id); if(r!==0) bad.push({id:f.id,col:ci,row:r}); }
      r+=f.count;
    });
  });
  return JSON.stringify(bad);
})()
```

期待される出力: `"[]"`（途中から始まるロットが無い）

- [ ] **Step 6: 「半」の位置を確認する**

`fills` の順序が変わると、`isHalf` が参照するマス一覧の順序も変わる。
「データ B」の `qty` のうち1件を `195` に変えて実行し、配置図の表タブを開く。

「半」マークが、そのロットの最後のマス（通路にはみ出しているならその通路のマス）に
付いていることを目視で確認する。

- [ ] **Step 7: 標準サンプルで回帰が無いことを確認する**

「データ A」を実行する。配置図の表が従来どおり表示され、
コンソールにエラーが出ず、あふれ警告も出ないことを確認する。

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "fix: 混載で押し込むパレットの上下を既存ロットの列数で決める"
```

---

### Task 2: 番号の廃止・○の灰色化・注記の左寄せ

引き出し線に置き換わる番号表示を消し、○を灰色にして線を前面に出す。
注記は矢印とぶつかりにくいよう左寄せにする。

**Files:**
- Modify: `files/index.html`（`.sheet td.g .mk` / `.sheet td.g .num` / `.sheet td.snote` の CSS、`numOf`、`gridRows`）

**Interfaces:**
- Consumes: Task 1 の `fills` 並び順
- Produces: `gridRows()` — 引数なしになる。戻り値はこのタスクでは従来どおり `<tr>` の HTML 文字列

- [ ] **Step 1: ○を灰色にし、番号の CSS を消す**

変更前:

```css
  .sheet td.g .mk{display:inline-flex;align-items:center;justify-content:center;
                  width:22px;height:22px;border:2px solid #000;border-radius:50%;
                  font-size:11px;font-weight:700}
  .sheet td.g .num{position:absolute;top:0;left:2px;font-size:9px;font-weight:700}
```

変更後:

```css
  /* ○は引き出し線より奥に見えるよう灰色にする */
  .sheet td.g .mk{display:inline-flex;align-items:center;justify-content:center;
                  width:22px;height:22px;border:2px solid #999;border-radius:50%;
                  font-size:11px;font-weight:700}
```

`.sheet td.g{height:30px;position:relative;padding:0}` の `position:relative` は
**消さないこと**。`.num` が無くなっても、この行はそのまま残す。

- [ ] **Step 2: 注記を左寄せにする**

変更前:

```css
  .sheet td.snote{display:table-cell;font-size:10px;color:#333;height:24px;
                  border:0;background:transparent}
```

変更後:

```css
  /* 注記行は引き出し線と同じ帯を通るので、線が通る欄の中心を避けて左に寄せる */
  .sheet td.snote{display:table-cell;text-align:left;font-size:10px;color:#333;height:24px;
                  border:0;background:transparent}
```

- [ ] **Step 3: `numOf` の算出を消す**

次の1行を探して削除する。

```js
  const numOf={}; bottom.forEach((e,i)=>{ numOf[e.lot.id]=i+1; });
```

- [ ] **Step 4: `gridRows` の宣言から引数を消す**

変更前:

```js
// メインのグリッド行（○／半／太枠／番号）
function gridRows(numOf){
```

変更後:

```js
// メインのグリッド行（○／半／太枠）
function gridRows(){
```

- [ ] **Step 5: 番号の出力を消す**

変更前:

```js
      const half=isHalf[o.c+"_"+ri];
      const showNum = id!=null && at(o.c,ri-1)!==id && numOf[id];
      tds+=`<td class="${cls.join(" ")}">`
         + (showNum?`<span class="num">${numOf[id]}</span>`:"")
         + (id!=null?`<span class="mk">${half?"半":""}</span>`:"")
         + `</td>`;
```

変更後:

```js
      const half=isHalf[o.c+"_"+ri];
      tds+=`<td class="${cls.join(" ")}">`
         + (id!=null?`<span class="mk">${half?"半":""}</span>`:"")
         + `</td>`;
```

- [ ] **Step 6: 呼び出し側を直す**

変更前:

```js
  // グリッド（メイン）
  rows+=gridRows(numOf);
```

変更後:

```js
  // グリッド（メイン）
  rows+=gridRows();
```

- [ ] **Step 7: 表示を確認する**

「データ A」を実行し、配置図の表タブを見る。

- グリッドのマス左上にあった小さい数字が消えている
- ○の枠線が黒から灰色になっている
- 「半」の文字は黒のまま読める
- 太枠（3px の黒線）は変わっていない
- 注記（「※PC横」など）が欄の左端に寄っている

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "refactor: 配置図の表のロット番号を廃止し○を灰色・注記を左寄せにする"
```

---

### Task 3: 引き出し線の描画

下段の各欄から、メイン配置図の対応する列へ直線と矢頭を描く。

**Files:**
- Modify: `files/index.html`（`.sheet` の CSS、下段パレット数行、`gridRows`、`renderSheet`）

**Interfaces:**
- Consumes: Task 2 で引数を無くした `gridRows()`
- Produces:
  - `gridRows()` → `{html: string, anchors: Array<{id:number, k:number, row:number}>}`
    - `id` はロットの id、`k` は表示上14列の何番目か（0始まり）、`row` はグリッドの行（0始まり）
    - メインのスペースが見つからない場合は `{html:"", anchors:[]}` を返す
  - `drawLeaders(anchors, slotIds)` → `void`。`slotIds` は下段の欄順に並んだロット id の配列

- [ ] **Step 1: ラッパと SVG の CSS を足す**

変更前:

```css
  .sheet{background:#fff;color:#000;padding:10px;overflow-x:auto;width:max-content;max-width:100%;
         zoom:var(--sheet-zoom,1)}
```

変更後:

```css
  .sheet{background:#fff;color:#000;padding:10px;overflow-x:auto;width:max-content;max-width:100%;
         zoom:var(--sheet-zoom,1)}
  /* 引き出し線の基準。.sheet の padding は印刷時に 0 になるので、
     表にぴったり重なるこのラッパを座標の原点にする */
  .sheet .sheetbox{position:relative;width:max-content}
  .sheet .leaders{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
```

- [ ] **Step 2: 下段のパレット数の行に目印を付ける**

変更前:

```js
  rows+=`<tr>${slotCells(bottom,SHEET_BOTTOM_SLOTS,"pallet")}</tr>`;
```

変更後:

```js
  // この行の各セルの下辺が引き出し線の起点になる
  rows+=`<tr class="btmp">${slotCells(bottom,SHEET_BOTTOM_SLOTS,"pallet")}</tr>`;
```

- [ ] **Step 3: グリッドの行に目印を付ける**

`gridRows` の中の次の1行を探して置き換える。

変更前:

```js
    rows+=`<tr>${tds}</tr>`;
```

変更後:

```js
    rows+=`<tr class="grow">${tds}</tr>`;
```

- [ ] **Step 4: メインが無いときの戻り値を直す**

変更前:

```js
function gridRows(){
  const sp=lastSp.find(s=>s.name==="メイン");
  if(!sp) return "";
```

変更後:

```js
function gridRows(){
  const sp=lastSp.find(s=>s.name==="メイン");
  // 設定でエリア名を変えると「メイン」が無くなることがある
  if(!sp) return {html:"", anchors:[]};
```

- [ ] **Step 5: 終点を求める関数を足す**

`gridRows` の中、次の1行を探す。

```js
  const at=(ci,ri)=>(colCells[ci]&&colCells[ci][ri])?colCells[ci][ri].id:null;
```

この行の**直後**に追加する。

```js
  // 引き出し線の終点。そのロットが始まる最初の連続ブロックの中央列を選ぶ。
  // 段番号列は左右のレーンが同じロットなら連続とみなすが、終点の候補にはしない。
  // 飛び地は最初のブロックだけを見る。全体の中心を取ると表を横断する斜線になるうえ、
  // 下段の欄順（左の列から順）と終点の左右順が食い違って矢印が交差する。
  // row は通常 0 になるが、同じ列に2ロット以上が混載された場合は 0 より大きくなり、
  // そのときは開始マスの上辺が終点になって線が上のロットを斜めに横切る。
  const anchorOf=(id, order)=>{
    const list=[]; let row=0;
    for(let k=0;k<order.length;k++){
      const o=order[k];
      if(o.lab){
        if(!list.length) continue;
        const bridged = o.l!=null && at(o.l,row)===id && at(o.r,row)===id;
        if(!bridged) break;
        continue;
      }
      let r0=null;
      for(let r=0;r<sp.cols[o.c].h;r++) if(at(o.c,r)===id){ r0=r; break; }
      if(r0==null){ if(list.length) break; continue; }
      if(!list.length){ row=r0; list.push(k); }
      else if(r0===row) list.push(k);
      else break;
    }
    if(!list.length) return null;
    return {id, k:list[Math.floor((list.length-1)/2)], row};
  };
```

- [ ] **Step 6: `gridRows` が終点も返すようにする**

変更前:

```js
  // 列番号
  let nums="";
  order.forEach(o=>{ nums+=`<td class="colno">${(o.lab||o.aisle)?"":o.c}</td>`; });
  return rows+`<tr>${nums}</tr>`;
}
```

変更後:

```js
  // 列番号
  let nums="";
  order.forEach(o=>{ nums+=`<td class="colno">${(o.lab||o.aisle)?"":o.c}</td>`; });

  // メインに置かれている全ロットの終点を集める
  const anchors=[];
  new Set(Object.keys(norm).concat(Object.keys(aisle))).forEach(key=>{
    const a=anchorOf(Number(key), order);
    if(a) anchors.push(a);
  });

  return {html: rows+`<tr>${nums}</tr>`, anchors};
}
```

- [ ] **Step 7: 描画関数を足す**

`gridRows` の直後、`/* ---------- utils ---------- */` の手前に追加する。

```js
/* 下段の欄からメインのスペースへ引き出し線を引く。
   表を差し込んだ直後に呼ぶ（セルの位置を実測するため）。
   座標は必ず getBoundingClientRect() で table 基準にそろえる。
   offsetLeft は td.g だけ position:relative のせいで基準が違うので使わない。
   anchors : gridRows() が返す [{id, k, row}]
   slotIds : 下段の欄順に並んだロット id */
function drawLeaders(anchors, slotIds){
  const sheet=document.querySelector("#sheetView .sheet");
  const box=sheet && sheet.querySelector(".sheetbox");
  const table=box && box.querySelector("table");
  if(!table) return;
  const from=box.querySelectorAll("tr.btmp td");
  const grid=box.querySelectorAll("tr.grow");
  if(!from.length || !grid.length) return;

  const base=table.getBoundingClientRect();
  if(!base.width) return;              // タブ非表示中は測れないので描かない
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const rectOf=el=>{
    const r=el.getBoundingClientRect();
    return {x:(r.left-base.left)/z, y:(r.top-base.top)/z, w:r.width/z, h:r.height/z};
  };

  const NS="http://www.w3.org/2000/svg";
  const svg=document.createElementNS(NS,"svg");
  svg.setAttribute("class","leaders");
  svg.setAttribute("width", base.width/z);
  svg.setAttribute("height", base.height/z);

  const byId={}; anchors.forEach(a=>{ byId[a.id]=a; });
  slotIds.forEach((id,i)=>{
    const a=byId[id], src=from[i];
    if(!a || !src) return;                      // メイン外のロットには線を引かない
    const row=grid[a.row]; if(!row) return;
    const dst=row.children[a.k]; if(!dst) return;

    const s=rectOf(src), d=rectOf(dst);
    const x0=s.x+s.w/2, y0=s.y+s.h;
    const x1=d.x+d.w/2, y1=d.y-2;
    if(y1<=y0) return;

    const p=document.createElementNS(NS,"path");
    p.setAttribute("d",`M${x0} ${y0}L${x1} ${y1}`);
    p.setAttribute("stroke","#000");
    p.setAttribute("stroke-width","1.6");
    p.setAttribute("fill","none");
    svg.appendChild(p);

    const ang=-Math.atan2(x1-x0, y1-y0)*180/Math.PI;   // 真下が0度
    const h=document.createElementNS(NS,"path");
    h.setAttribute("d","M-4.5 -8L0 0L4.5 -8");
    h.setAttribute("stroke","#000");
    h.setAttribute("stroke-width","1.6");
    h.setAttribute("fill","none");
    h.setAttribute("stroke-linecap","round");
    h.setAttribute("stroke-linejoin","round");
    h.setAttribute("transform",`translate(${x1},${y1}) rotate(${ang})`);
    svg.appendChild(h);
  });

  box.appendChild(svg);
}
```

- [ ] **Step 8: `renderSheet` から呼ぶ**

変更前:

```js
  // グリッド（メイン）
  rows+=gridRows();

  host.innerHTML=`<div class="sheet"><table>
    <colgroup>${Array(14).fill('<col style="width:48px">').join("")}</colgroup>
    ${rows}</table></div>`;
  applySheetZoom();
```

変更後:

```js
  // グリッド（メイン）
  const grid=gridRows();
  rows+=grid.html;

  host.innerHTML=`<div class="sheet"><div class="sheetbox"><table>
    <colgroup>${Array(14).fill('<col style="width:48px">').join("")}</colgroup>
    ${rows}</table></div></div>`;
  drawLeaders(grid.anchors, bottom.map(e=>e.lot.id));
  applySheetZoom();
```

- [ ] **Step 9: 標準サンプルで矢印を確認する**

「データ A」を実行し、配置図の表タブを見る。

- 下段の各欄からグリッドへ直線が引かれ、先端に矢頭が付いている
- 矢頭が線の傾きに沿って回転している
- 線が表の高さを増やしていない（グリッドの位置が Task 2 と変わっていない）

- [ ] **Step 10: 終点が正しいロットの列を指しているか検証する**

コンソールで実行する。各矢印の終点にあるマスが、その欄のロットのものかを突き合わせる。

```js
(function(){
  const box=document.querySelector("#sheetView .sheetbox");
  const grid=box.querySelectorAll("tr.grow");
  const anchors=gridRows().anchors;
  const bottom=sheetEntries(SHEET_BOTTOM,"メイン");
  const byId={}; anchors.forEach(a=>{ byId[a.id]=a; });
  const out=bottom.map(e=>{
    const a=byId[e.lot.id];
    return {name:e.lot.name, k:a?a.k:null, row:a?a.row:null};
  });
  const ks=out.filter(o=>o.k!=null).map(o=>o.k);
  const monotonic=ks.every((v,i)=>i===0||v>ks[i-1]);
  return JSON.stringify({rows:out, monotonic});
})()
```

期待:
- `k` が `null` なのはメイン外のロットだけ
- `row` はすべて 0（Task 1 の判定が効いている）
- `monotonic` が `true`（終点が左から右へ並び、矢印が交差しない）

- [ ] **Step 11: 満杯データで確認する**

「データ B」を実行し、配置図の表タブを見る。

- メインに置かれた4ロット（部品C・部品E・製品Z・部品A）に矢印がある
- メイン外の3ロット（部品D・製品X・製品Y）には矢印が無く、注記だけが出ている
- 全ての矢頭が列の上端に刺さっている
- 部品E の矢印が、そのロットが占める列の中央付近（左から2列目）に刺さっている

Step 10 の検証スクリプトもこのデータで実行し、`monotonic` が `true` であることを確認する。

- [ ] **Step 12: 少数の大口で確認する**

「データ C」を実行し、配置図の表タブを見る。

- 矢印が2本引かれている
- 部品B の矢印は水平に近い浅い線になる（設計書の「既知の割り切り」のとおり。不具合ではない）
- 線が表からはみ出していない

- [ ] **Step 13: 表示倍率に追随するか確認する**

表示倍率を 100% / 150% / 200% / 自動 の順に切り替える。
どの倍率でも矢印が表と同じ大きさで拡大され、起点と終点がずれないことを確認する。

- [ ] **Step 14: 印刷プレビューで位置を確認する**

印刷ボタンを押してプレビューを開く。

- 表が1ページに収まっている
- 矢印が出力されている
- **矢印の起点と終点が画面表示と同じセルを指している**（`.sheet` の padding が
  印刷時に 0 になるため、ここがずれていないことが `.sheetbox` を使った意味になる）

- [ ] **Step 15: 異常系でエラーが出ないことを確認する**

3つとも、コンソールにエラーが出ないことを確認する。

1. 荷物入力の行をすべて削除して実行する
2. 設定タブでスペース定義のエリア名「メイン」を別の名前に変えて実行する
3. 入力タブを開いたまま搬入日と あさ/ひる を変える
   （`onHeadChange` と `setTiming` は `sheetMode` を見ずに `renderSheet` を呼ぶため、
   非表示のまま描画が走る。その後で配置図タブを開き、矢印が正しく出ることも確認する）

- [ ] **Step 16: 下段があふれる状態を確認する**

ロットを8件以上メインに入る量で投入し、あふれ警告が出る状態にする。
8件目以降の欄が存在せず、矢印も引かれないこと、既存の警告文と矛盾しないことを確認する。

- [ ] **Step 17: コミット**

```bash
git add files/index.html
git commit -m "feat: 配置図の表の下段からメイン配置図へ引き出し線を引く"
```

---

### Task 4: 矢頭の on/off

矢頭を消して実線だけにできるトグルを付ける。

**Files:**
- Modify: `files/index.html`（`zoomCtl` の HTML、`STORE_KEY`、`drawLeaders`、初期化）

**Interfaces:**
- Consumes: Task 3 の `drawLeaders(anchors, slotIds)`
- Produces: `setArrowHead(on: boolean)` — グローバル関数。`arrowHead` を切り替えて再描画する

- [ ] **Step 1: 保存キーを足す**

変更前:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", view:"palletApp.view", zoom:"palletApp.zoom"};
```

変更後:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", view:"palletApp.view", zoom:"palletApp.zoom", arrow:"palletApp.arrow"};
```

- [ ] **Step 2: UI を足す**

変更前:

```html
        <button class="sizebtn" data-zoom="2" onclick="setSheetZoom('2')">200%</button>
        <span class="lbl" id="zoomNow"></span>
```

変更後:

```html
        <button class="sizebtn" data-zoom="2" onclick="setSheetZoom('2')">200%</button>
        <span class="lbl" style="margin-left:12px">矢印の先</span>
        <button class="sizebtn on" data-arrow="1" onclick="setArrowHead(true)">あり</button>
        <button class="sizebtn" data-arrow="0" onclick="setArrowHead(false)">なし</button>
        <span class="lbl" id="zoomNow"></span>
```

- [ ] **Step 3: 状態と切り替え関数を足す**

次のコメント行を探す。

```js
/* ---------- 配置図の表の表示倍率 ---------- */
```

この行の**直前**に追加する。

```js
/* ---------- 引き出し線の矢頭 ---------- */
let arrowHead=true;   // false なら実線だけにする

function setArrowHead(on){
  arrowHead=!!on;
  document.querySelectorAll(".sizebtn[data-arrow]").forEach(b=>
    b.classList.toggle("on", (b.dataset.arrow==="1")===arrowHead));
  saveData(STORE_KEY.arrow, arrowHead);
  if(sheetMode && hasResult) renderSheet();
}
```

- [ ] **Step 4: `drawLeaders` が矢頭を出し分けるようにする**

Task 3 で足した `drawLeaders` の中を変える。

変更前:

```js
    const ang=-Math.atan2(x1-x0, y1-y0)*180/Math.PI;   // 真下が0度
```

変更後:

```js
    if(!arrowHead) return;                             // 実線だけにする
    const ang=-Math.atan2(x1-x0, y1-y0)*180/Math.PI;   // 真下が0度
```

`slotIds.forEach` のコールバック内なので、`return` はその1本の矢頭だけを飛ばす。

- [ ] **Step 5: 復元処理を足す**

次の関数全体を探す。

```js
// 配置図の表の表示倍率：保存があれば復元
(function initZoom(){
  const z=loadData(STORE_KEY.zoom);
  if(z) sheetZoom=z;
  document.querySelectorAll(".sizebtn[data-zoom]").forEach(b=>
    b.classList.toggle("on", b.dataset.zoom===sheetZoom));
  applySheetZoom();
})();
```

この関数の**直後**に追加する。

```js
// 引き出し線の矢頭：保存があれば復元
(function initArrowHead(){
  const a=loadData(STORE_KEY.arrow);
  if(a===false) arrowHead=false;
  document.querySelectorAll(".sizebtn[data-arrow]").forEach(b=>
    b.classList.toggle("on", (b.dataset.arrow==="1")===arrowHead));
})();
```

- [ ] **Step 6: 動作を確認する**

「データ A」を実行し、配置図の表タブを開く。

- 「矢印の先」の「なし」を押すと矢頭が消え、直線だけになる
- 「あり」を押すと矢頭が戻る
- 「なし」の状態で再読み込みしても「なし」のままになっている
- ブロック図タブに切り替えるとトグルごと隠れる（`zoomCtl` の表示制御に乗る）
- 「なし」の状態で印刷プレビューを開いても矢頭が出ない

- [ ] **Step 7: コミット**

```bash
git add files/index.html
git commit -m "feat: 引き出し線の矢頭を切り替えられるようにする"
```

---

### Task 5: キャッシュ更新と通し確認

**Files:**
- Modify: `files/sw.js`（`CACHE_VERSION`）

**Interfaces:**
- Consumes: Task 1〜4 のすべて
- Produces: なし

- [ ] **Step 1: `CACHE_VERSION` を上げる**

変更前:

```js
const CACHE_VERSION = "v11";
```

変更後:

```js
const CACHE_VERSION = "v12";
```

- [ ] **Step 2: 設計書の確認項目を通しで実行する**

`docs/superpowers/specs/2026-08-24-sheet-leader-lines-design.md` の「確認項目」13件を上から順に確認する。

1. 標準サンプルで、メインに配置された全ロットに矢印が引かれ、正しい列を指している
2. 満杯データ（全エリア134P）で混載が上詰めになり、全矢印が列の上端に刺さる
3. 満杯データで「半」の位置が配置内容と一致している
4. メイン外のロット（PC横・EV横のみ）に矢印が引かれていない
5. 矢頭 off で実線のみになり、再読み込み後も設定が保持される
6. 表示倍率 100% / 150% / 200% / 自動 のいずれでも矢印が表に追随する
7. 印刷プレビューで1ページに収まり、矢印が画面と同じ位置に出力される
8. ロットが1つもない状態、およびメインが空の状態でエラーが出ない
9. 設定でエリア名を変更し「メイン」という名前のエリアが存在しない状態でエラーが出ない
10. 下段が7欄を超える状態で、8件目以降に矢印が出ず既存の警告と矛盾しない
11. `fillMix` の向き判定が、既存ロットの列数に応じて上下を切り替えている
12. ロットが少ない日（データ C）でも矢印が読み取れる
13. 入力タブを開いたまま搬入日や あさ/ひる を変えてもエラーが出ず、表を開くと矢印が正しく出る

「メインが空の状態」は、通路を編集してメインの列をすべて通路にするか、
荷物を軒下だけに収まる量にして再現する。

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "chore: 引き出し線の追加に合わせて CACHE_VERSION を v12 に上げる"
```

---

## 完了後

このプロジェクトには自動テストの設定（`package.json`、Playwright 等）が無いため、
実行できる E2E テストコマンドは存在しない。
Task 5 Step 2 の通し確認をもって検証とする。
