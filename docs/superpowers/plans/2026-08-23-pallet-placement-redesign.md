# パレット自動配置の再設計と表の集約 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 同一ロットが連続した列にまとまって配置されるようにし、配置図の表では1ロット1欄に集約する。

**Architecture:** 配置ロジックを「候補リスト生成（`areaCandidates`）」「連続窓探索（`findRun`）」「1ロットの割り当て（`placeLot`）」の3つに分割する。既存の `fillNormalAisle`（`block:3` 制限と通路条件を内包）は削除し、`place()` は薄いオーケストレータにする。表は `lotsInSpace()`（エリア単位）を `sheetEntries()`（ロット単位）に置き換える。

**Tech Stack:** 単一HTMLのPWA（`files/index.html`）。ビルドなし、外部ライブラリなし、テストランナーなし。

## Global Constraints

- 対象ファイルは `files/index.html` のみ。他ファイルは作らない
- 単一HTML構成を壊さない（JSの外部ファイル分離はしない）
- 設定タブのテキスト形式 `名前 | zone | orient | block | 列` は変更しない
- `zone`（near/far）はブロック図の描画グループとして維持。配置の分岐には使わない
- `block`（3）はブロック図の島区切り描画に使う。配置の列数制限には使わない
- エリア優先順は `SPACES` の配列順に従う（ハードコードしない）
- 混載処理（`fillMix`）は最終手段として維持する

## テストについて

このコードベースにはテストランナーがない。各タスクの検証は**ブラウザ上で関数を直接呼んで期待値と比較する**方法で行う。

**検証の手順（全タスク共通）:**

1. ブラウザで `files/index.html` を開く（ファイルを編集したら再読み込み）
2. DevTools のコンソールに検証コードを貼り付けて実行
3. 期待値と一致することを確認

各タスクの「検証」ステップに、貼り付けるコードと期待される出力を書いてある。

---

### Task 1: スペース定義を優先順に並べ替え、軒下の連結を定義する

配置エンジンは `SPACES` の配列順を優先順として読む。先に定義側を新しい順に直す。この時点では配置ロジックは旧のままなので、描画とサンプルが壊れないことだけ確認する。

**Files:**
- Modify: `files/index.html:387-405`（`DEFAULT_SPACES` と `FLOOR_POS`）

**Interfaces:**
- Produces: `DEFAULT_SPACES`（メイン → 軒下① → 軒下② → PC横 → EV横 の順）、`AREA_GROUPS`（`[["軒下①","軒下②"]]`）

- [ ] **Step 1: `DEFAULT_SPACES` を優先順に並べ替え、`AREA_GROUPS` を追加**

`files/index.html` の `const DEFAULT_SPACES = [` から `];` までを、次で置き換える（`FLOOR_POS` の定義はその下にあるので消さないこと）。

```js
const DEFAULT_SPACES = [
  // 配列の順＝自動配置でエリアを試す順（メイン ＞ 軒下 ＞ PC横・EV横）。
  // zone はブロック図の倉庫内／外の並べ分けにだけ使う。
  {name:"メイン", zone:"near", orient:"v", block:3, align:"top", cols:[
     {h:6,aisle:true},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:7},{h:5,aisle:true}]},
  {name:"軒下①", zone:"far", orient:"h", block:99, cols:[{h:11},{h:11},{h:8}]},
  {name:"軒下②", zone:"far", orient:"v", block:99, cols:[{h:4},{h:4}]},
  {name:"PC横", zone:"near", orient:"h", block:99, cols:[{h:8},{h:4}]},
  {name:"EV横", zone:"near", orient:"h", block:99, cols:[{h:6},{h:4}]},
];
// 運用上ひとつづきに使うエリア。①が埋まったら②へ、と列を連結して連続窓を探す。
// 設定でスペース名を変えるとこの連結は外れ、別エリア扱いになる。
const AREA_GROUPS = [["軒下①","軒下②"]];
```

- [ ] **Step 2: 検証（描画とサンプルが壊れていないこと）**

ブラウザで `files/index.html` を再読み込みし、コンソールで実行:

```js
document.getElementById('runBtnInline').click();
JSON.stringify({
  順: SPACES.map(s=>s.name),
  グループ: AREA_GROUPS,
  軒下1の列: SPACES.find(s=>s.name==="軒下①").cols.map(c=>c.h),
})
```

期待:
```
{"順":["メイン","軒下①","軒下②","PC横","EV横"],"グループ":[["軒下①","軒下②"]],"軒下1の列":[11,11,8]}
```

- [ ] **Step 3: 検証（ブロック図の見た目が変わっていないこと）**

「配置図」タブ → 「ブロック図」を開き、次を目視で確認する:

- 倉庫外に 軒下②（左・縦2列）と 軒下①（右・横3段）が出る
- 倉庫内に メイン（右上）、PC横（左下）、EV横（右下）が出る
- 壁の黒帯が倉庫外と倉庫内の間にある

- [ ] **Step 4: 検証（設定タブが新しい順で出ること）**

「設定」タブを開き、テキストエリアの中身が次の順であることを確認:

```
メイン | near | v | 3 | 6*,7,7,7,7,7,7,7,7,7,5*
軒下① | far | h | 99 | 11,11,8
軒下② | far | v | 99 | 4,4
PC横 | near | h | 99 | 8,4
EV横 | near | h | 99 | 6,4
```

- [ ] **Step 5: コミット**

```bash
git add files/index.html
git commit -m "refactor: スペース定義を配置の優先順に並べ替え、軒下の連結を定義

配置エンジンが SPACES の配列順を優先順として読めるようにする。
AREA_GROUPS は軒下①②を1つのエリアとして扱うための定義。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 連続窓を探す `findRun()` を追加する

「連続した空き列にロットが丸ごと入るか」を判定する関数。この時点では誰からも呼ばれないので、既存の動作は一切変わらない。

**Files:**
- Modify: `files/index.html:813` 付近（`function used(c)` の直後に追加）

**Interfaces:**
- Consumes: `buildWork()` が作る作業用の列オブジェクト `{h, aisle, fills:[]}`
- Produces: `findRun(cols, rem, useAisle)` → `[開始index, 終了index]` または `null`

- [ ] **Step 1: `findRun()` を追加**

`files/index.html` の `function used(c){return c.fills.reduce((a,f)=>a+f.count,0);}` の**直後**に、次を挿入する。

```js
/* 連続した空き列で rem パレットが丸ごと入る窓を探す。
   cols     : buildWork() が作った作業用の列配列
   rem      : 置きたいパレット数
   useAisle : true なら通路列も窓に含める
   戻り値   : 丸ごと入る最初の窓 [開始index, 終了index]。無ければ null */
function findRun(cols, rem, useAisle){
  const usable = i => {
    const c = cols[i];
    if(c.fills.length > 0) return false;     // 使用済みの列は窓を分断する
    if(c.aisle && !useAisle) return false;   // 通路を使わない段では通路も分断する
    return true;
  };
  for(let s=0; s<cols.length; s++){
    if(!usable(s)) continue;
    let cap = 0;
    for(let e=s; e<cols.length; e++){
      if(!usable(e)) break;
      cap += cols[e].h;
      if(cap >= rem) return [s, e];
    }
  }
  return null;
}
```

- [ ] **Step 2: 検証（連続窓の探索）**

再読み込みし、コンソールで実行:

```js
const col=(h,aisle,used)=>({h,aisle:!!aisle,fills:used?[{id:9,count:used}]:[]});
// a: 通常列7P×4本。2本目だけ使用済み（空きは 0番、2〜3番）
const a=[col(7),col(7,false,7),col(7),col(7)];
// b: 通路6P + 通常7P×3（21P）+ 通路5P。すべて空き
const b=[col(6,true),col(7),col(7),col(7),col(5,true)];
JSON.stringify({
  先頭1列に収まる:      findRun(a,7,false),
  使用済みをまたがない:  findRun(a,10,false),
  容量不足はnull:       findRun(a,20,false),
  通常列だけで足りる:    findRun(b,14,false),
  通常列を使い切る:      findRun(b,21,false),
  通常列では足りない:    findRun(b,22,false),
  通路を含めれば入る:    findRun(b,22,true),
})
```

期待:
```
{"先頭1列に収まる":[0,0],"使用済みをまたがない":[2,3],"容量不足はnull":null,"通常列だけで足りる":[1,2],"通常列を使い切る":[1,3],"通常列では足りない":null,"通路を含めれば入る":[0,3]}
```

**確認の要点:**
- `使用済みをまたがない` が `[2,3]` であること（`[0,3]` なら使用済みの列をまたいでいるのでバグ）
- `通常列では足りない` が `null`、`通路を含めれば入る` が `[0,3]` であること（`useAisle` の切り替えが効いている。累積容量は列0〜3で 6+7+7+7=27P に達するので最小窓は `[0,3]`）

- [ ] **Step 3: 検証（既存動作が変わっていないこと）**

「入力」タブで「基本サンプル」を読み込み → 「▶ 自動配置を作成」。
「✅ すべてのパレットを配置しました。」が出て、ブロック図が今までどおり表示されることを確認する。

- [ ] **Step 4: コミット**

```bash
git add files/index.html
git commit -m "feat: 連続した空き列を探す findRun() を追加

ロットが丸ごと入る場所を判定するための純関数。まだ呼び出し元はない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 配置エンジンを差し替える

`areaCandidates()` と `placeLot()` を追加し、`place()` を書き換える。`fillNormalAisle()` は削除する。ここで配置結果が変わる。

**Files:**
- Modify: `files/index.html:820-856`（`fillNormalAisle`、`fillMix`、`place`）

**Interfaces:**
- Consumes: `findRun(cols, rem, useAisle)`、`AREA_GROUPS`、`buildWork()`、`used(c)`
- Produces: `areaCandidates(sp)` → `[{cols, useAisle}]`、`placeLot(lot, cands)` → 残パレット数、`place(lots, allowMix)` → 作業用スペース配列（戻り値の形は従来どおり）

- [ ] **Step 1: `fillNormalAisle` を削除し、新しい3関数を書く**

`function fillNormalAisle(lot,sp,rem){` から `function place(lots,allowMix){ ... return sp;\n}` までの**全体**を、次で置き換える。

```js
/* 優先順に「どの列を対象に、通路を使うか」の候補を並べる。
   同じエリアを (通路なし) → (通路あり) の順で2回出すことで、
   「メインを使い切ったら軒下より先にメインの通路を使う」を表現する。
   AREA_GROUPS のエリアは列を連結して1つの候補にする（軒下①が埋まったら②へ）。 */
function areaCandidates(sp){
  const byName={}; sp.forEach(s=>byName[s.name]=s);
  const done=new Set(), out=[];
  const push=members=>{
    const cols=[];
    members.forEach(s=>s.cols.forEach(c=>cols.push(c)));
    out.push({cols, useAisle:false});
    if(cols.some(c=>c.aisle)) out.push({cols, useAisle:true});
  };
  sp.forEach(s=>{
    if(done.has(s.name)) return;
    const g=AREA_GROUPS.find(g=>g.includes(s.name));
    const members = g ? g.map(n=>byName[n]).filter(Boolean) : [s];
    members.forEach(m=>done.add(m.name));
    push(members);
  });
  return out;
}

/* 1ロットを候補の優先順に割り当てる。
   まず「連続した空き列に丸ごと入る」場所を探し、
   どこにも無ければ候補を頭からたどり直して空き列に詰める（分割）。
   戻り値は置ききれなかったパレット数。 */
function placeLot(lot, cands){
  let rem=lot.pallets;
  for(const c of cands){
    const run=findRun(c.cols, rem, c.useAisle);
    if(!run) continue;
    for(let i=run[0]; i<=run[1] && rem>0; i++){
      const col=c.cols[i];
      const put=Math.min(rem, col.h);
      col.fills.push({id:lot.id, count:put, ov:col.aisle});
      rem-=put;
    }
    return 0;
  }
  for(const c of cands){
    if(rem<=0) break;
    for(const col of c.cols){
      if(rem<=0) break;
      if(col.fills.length>0) continue;
      if(col.aisle && !c.useAisle) continue;
      const put=Math.min(rem, col.h);
      col.fills.push({id:lot.id, count:put, ov:col.aisle});
      rem-=put;
    }
  }
  return rem;
}

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

function place(lots,allowMix){
  const sp=buildWork();
  const cands=areaCandidates(sp);
  // 仕掛品を先に処理してメインを確保させる。各グループ内は大口順。
  // 大口から置くほど連続した列を取りやすい。
  const order=[...lots].sort((a,b)=>{
    const ta=(a.type==="仕掛品")?0:1, tb=(b.type==="仕掛品")?0:1;
    if(ta!==tb) return ta-tb;
    return b.pallets-a.pallets;
  });
  for(const lot of order){ lot.rem=placeLot(lot, cands); }
  if(allowMix){
    for(const lot of order){
      if(lot.rem<=0) continue;
      let rem=lot.rem;
      for(const c of cands){
        if(rem<=0) break;
        if(c.useAisle) continue;        // 同じ列を二度見ないよう通路なしの段だけ回す
        rem=fillMix(lot, c.cols, rem);
      }
      lot.rem=rem;
    }
  }
  return sp;
}
```

- [ ] **Step 2: 検証（候補リストの並び）**

再読み込みし、コンソールで実行:

```js
const w=buildWork(), c=areaCandidates(w);
JSON.stringify(c.map(x=>({
  列数:x.cols.length, 通路:x.useAisle, 容量:x.cols.reduce((a,y)=>a+y.h,0)
})))
```

期待（メインが通路なし／ありの2件、軒下は①②連結で38P、PC横12P、EV横10P）:
```
[{"列数":11,"通路":false,"容量":74},{"列数":11,"通路":true,"容量":74},{"列数":5,"通路":false,"容量":38},{"列数":2,"通路":false,"容量":12},{"列数":2,"通路":false,"容量":10}]
```

- [ ] **Step 3: 検証（仕様書の期待どおりに配置されること）**

「入力」タブで「入力をクリア」してから、次の5件を手入力する（全て種別＝仕掛品、SNP=10）。

| 品名 | ロット | 個数 | → P数 |
|---|---|---|---|
| 部品A | 111 | 280 | 28P |
| 部品C | 222 | 20 | 2P |
| 部品B | 333 | 30 | 3P |
| 製品X | 5555 | 200 | 20P |
| 製品W | 6666 | 300 | 30P |

「▶ 自動配置を作成」してから、コンソールで実行:

```js
JSON.stringify(lastSp.map(s=>({
  エリア:s.name,
  列:s.cols.map(c=>c.fills.map(f=>lastLots.find(l=>l.id===f.id).lot+":"+f.count).join("+")||"-")
})),null,1)
```

期待:
- メイン: 通常列9本に `6666` が5本連続（7+7+7+7+2）、`111` が4本連続で入り通常列が満杯になる。残った通路2本には `333:3`（左6P）、`222:2`（右5P）が入る
- 軒下①: `5555:11`、`5555:9`、`-`
- 軒下②: `-`、`-`
- PC横・EV横: すべて `-`

**確認の要点:** 同じロットが連続した列に固まっていること。`111` が通路に飛んでいないこと。`6666` が1エリアに収まっていること。通常列が満杯になった後、`333`・`222` がメインの通路に入り、軒下には回らないこと。

- [ ] **Step 4: 検証（既存サンプルが壊れないこと）**

「基本サンプル」「混載デモ」をそれぞれ読み込んで「▶ 自動配置を作成」。
どちらも例外が出ず、メッセージ欄に結果が表示されることを確認する。コンソールにエラーが出ていないことも確認する。

- [ ] **Step 5: 検証（あふれと混載が動くこと）**

「入力をクリア」して、部品A / ロット `999` / SNP 10 / 個数 `10000`（1000P）を1件入力し「▶ 自動配置を作成」。

期待: 「⚠ 入りきらない荷物があります」の警告が出て、残Pが表示される。全エリアが埋まっている。

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "feat: ロットを連続した空き列に丸ごと配置するようにした

種別による倉庫内／外の固定と block:3 の列数制限を廃止し、
エリアの優先順（メイン＞軒下＞PC横・EV横）に沿って
連続した空き列に丸ごと入る場所を探すようにする。
仕掛品を先に大口順で処理するため、競合時は仕掛品がメインを取る。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 配置図の表をロット単位に集約する

`lotsInSpace()` を `sheetEntries()` に置き換え、同じロットが同じ段の複数エリアにまたがっても1欄にまとめる。

**Files:**
- Modify: `files/index.html:1119-1138`（`lotsInSpace` と `renderSheet` の冒頭）
- Modify: `files/index.html:1190-1210` 付近（`slotCells` のパレット数）

**Interfaces:**
- Consumes: `lastSp`、`lastLots`、`SHEET_TOP`、`SHEET_BOTTOM`
- Produces: `sheetEntries(names, baseArea)` → `[{lot, pallets, note}]`

- [ ] **Step 1: `lotsInSpace()` を `sheetEntries()` に置き換える**

`function lotsInSpace(spName){ ... }` の**全体**を、次で置き換える。

```js
/* 配置図の表の欄をロット単位で作る。
   同じロットが同じ段の複数エリアにまたがっても1欄にまとめ、
   パレット数はその段での合計にする。
   names    : この段に含めるエリア名（先に書いたエリアから順に見る）
   baseArea : 注釈を出さない基準エリア。null ならこの段は注釈なし */
function sheetEntries(names, baseArea){
  if(!lastSp || !lastLots) return [];
  const order=[], byId={};
  names.forEach(n=>{
    const sp=lastSp.find(s=>s.name===n);
    if(!sp) return;
    sp.cols.forEach(c=>c.fills.forEach(f=>{
      let e=byId[f.id];
      if(!e){
        const lot=lastLots.find(l=>l.id===f.id);
        if(!lot) return;
        e=byId[f.id]={lot, pallets:0, areas:[]};
        order.push(e);
      }
      e.pallets+=f.count;
      if(!e.areas.includes(n)) e.areas.push(n);
    }));
  });
  return order.map(e=>{
    const extra = baseArea ? e.areas.filter(n=>n!==baseArea) : [];
    return {lot:e.lot, pallets:e.pallets, note: extra.length ? ("※"+extra.join("・")) : ""};
  });
}
```

- [ ] **Step 2: `renderSheet()` の欄の作り方を差し替える**

`renderSheet()` の中の次の6行

```js
  // 上段：軒下（①→②の順） / 下段：メイン→PC横→EV横
  const top=[];
  SHEET_TOP.forEach(n=>lotsInSpace(n).forEach(l=>top.push({lot:l})));
  const bottom=[];
  SHEET_BOTTOM.forEach(n=>lotsInSpace(n).forEach(l=>
    bottom.push({lot:l, note:(n==="メイン"?"":"※"+n)})));
```

を、次で置き換える。

```js
  // 上段：軒下（①→②の順・注釈なし） / 下段：メイン→PC横→EV横（メイン以外を注釈に）
  const top=sheetEntries(SHEET_TOP, null);
  const bottom=sheetEntries(SHEET_BOTTOM, "メイン");
```

- [ ] **Step 3: パレット数をその段の合計にする**

`slotCells()` の中の

```js
    else if(kind==="pallet") v=l?(l.pallets+"P"):"";
```

を、次で置き換える。

```js
    else if(kind==="pallet") v=e?(e.pallets+"P"):"";
```

- [ ] **Step 4: 検証（1ロット1欄になること）**

再読み込みし、Task 3 Step 3 と同じ5件を入力して「▶ 自動配置を作成」。
コンソールで実行:

```js
JSON.stringify({
  上段:sheetEntries(SHEET_TOP,null).map(e=>e.lot.lot+" "+e.pallets+"P"+(e.note||"")),
  下段:sheetEntries(SHEET_BOTTOM,"メイン").map(e=>e.lot.lot+" "+e.pallets+"P"+(e.note||"")),
})
```

期待:
```
{"上段":["5555 20P"],"下段":["333 3P","6666 30P","111 28P","222 2P"]}
```

**確認の要点:** 同じロットが2回現れないこと。パレット数が入力どおりであること。

- [ ] **Step 5: 検証（またがった時の注釈）**

「入力をクリア」して、次の2件を入力（種別＝仕掛品、SNP 10）:

| 品名 | ロット | 個数 | → P数 |
|---|---|---|---|
| 部品A | AAA | 740 | 74P |
| 部品B | BBB | 220 | 22P |

「▶ 自動配置を作成」してからコンソールで実行:

```js
JSON.stringify(sheetEntries(SHEET_BOTTOM,"メイン").map(e=>e.lot.lot+" "+e.pallets+"P "+(e.note||"(注釈なし)")))
```

74Pがメインを丸ごと（通路込み74P）使い、22Pが軒下に回る。下段にはメインの1件だけが出る。

期待:
```
["AAA 74P (注釈なし)"]
```

続けて、PC横とEV横にまたがるケースを確認する。「入力をクリア」して、次の3件を入力:

| 品名 | ロット | 個数 | → P数 |
|---|---|---|---|
| 部品A | AAA | 740 | 74P |
| 部品B | BBB | 380 | 38P |
| 部品C | CCC | 220 | 22P |

期待: AAA がメイン（74P）、BBB が軒下（38P）、CCC は22Pでどこにも丸ごと入らないため分割され、PC横12P＋EV横10P に入る。

```js
JSON.stringify(sheetEntries(SHEET_BOTTOM,"メイン").map(e=>e.lot.lot+" "+e.pallets+"P "+(e.note||"(注釈なし)")))
```

期待:
```
["AAA 74P (注釈なし)","CCC 22P ※PC横・EV横"]
```

**確認の要点:** CCC が1欄にまとまり、注釈が `※PC横・EV横` になること。

- [ ] **Step 6: 検証（表の見た目）**

「配置図」タブ → 「配置図の表」を開き、下段に同じ品名・ロットの欄が重複していないこと、注釈行に `※PC横・EV横` が出ていることを目視で確認する。

- [ ] **Step 7: コミット**

```bash
git add files/index.html
git commit -m "feat: 配置図の表をロット単位に集約

エリアごとに欄を作っていたため同じロットが複数回出ていた。
段ごとに1欄へまとめ、メイン以外のエリアを ※PC横・EV横 の形で注釈にする。
パレット数はその段での合計を出す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 欄数超過の警告と、古い説明文の修正

表に載りきらないロットがあることを警告し、種別ルールを前提にした文言を直す。

**Files:**
- Modify: `files/index.html:226`（ヘッダの説明文）
- Modify: `files/index.html:302-304`（入力タブ下部のルール表記）
- Modify: `files/index.html:898-903` 付近（`run()` のメッセージ生成）

**Interfaces:**
- Consumes: `sheetEntries(names, baseArea)`、`SHEET_TOP`、`SHEET_BOTTOM`

- [ ] **Step 1: ヘッダの説明文を直す**

`files/index.html` の

```html
  <p>個数 ÷ SNP でパレット数を自動計算（切り上げ）／ 仕掛品=倉庫内・商品=倉庫外</p>
```

を、次で置き換える。

```html
  <p>個数 ÷ SNP でパレット数を自動計算（切り上げ）／ ロットごとにまとめて配置</p>
```

- [ ] **Step 2: 入力タブ下部のルール表記を直す**

```html
        <span><b>ルール:</b> 仕掛品→倉庫内 / 商品→倉庫外</span>
        <span>原則 1列＝1品目</span>
        <span>④の通路は大口の余りのみ使用</span>
```

を、次で置き換える。

```html
        <span><b>ルール:</b> メイン → 軒下 → PC横・EV横 の順に配置</span>
        <span>原則 1列＝1品目</span>
        <span><b>ロット単位</b>で連続した列にまとめる</span>
        <span>通路はメインが埋まってから使用</span>
        <span>仕掛品を先に配置（メインが競合したとき仕掛品を優先）</span>
```

- [ ] **Step 3: 欄数超過の警告を追加する**

`run()` の中の

```js
  if(over.length){
    m.innerHTML=warnHtml+`<div class="msg warn">⚠ 入りきらない荷物があります：${over.map(l=>`${l.name}(${l.code}) 残${l.rem}P`).join(" / ")}</div>`;
  }else{
    let notes=[]; if(usedAisle)notes.push("通路へのはみ出しあり"); if(usedMix)notes.push("混載あり");
    m.innerHTML=warnHtml+`<div class="msg ok">✅ すべてのパレットを配置しました。${notes.length?"（"+notes.join("・")+"）":""}</div>`;
  }
```

を、次で置き換える。

```js
  // 配置図の表は上段4欄・下段7欄しかない。載りきらないロットは黙って消えるので知らせる。
  const overTop=sheetEntries(SHEET_TOP,null).length-4;
  const overBottom=sheetEntries(SHEET_BOTTOM,"メイン").length-7;
  if(overTop>0 || overBottom>0){
    const parts=[];
    if(overTop>0) parts.push(`軒下 ${overTop}件`);
    if(overBottom>0) parts.push(`倉庫内 ${overBottom}件`);
    warnHtml+=`<div class="msg warn">⚠ 配置図の表に載りきらないロットがあります：${parts.join(" / ")}。ブロック図で確認してください。</div>`;
  }

  if(over.length){
    m.innerHTML=warnHtml+`<div class="msg warn">⚠ 入りきらない荷物があります：${over.map(l=>`${l.name}(${l.code}) 残${l.rem}P`).join(" / ")}</div>`;
  }else{
    let notes=[]; if(usedAisle)notes.push("通路へのはみ出しあり"); if(usedMix)notes.push("混載あり");
    m.innerHTML=warnHtml+`<div class="msg ok">✅ すべてのパレットを配置しました。${notes.length?"（"+notes.join("・")+"）":""}</div>`;
  }
```

`warnHtml` は `let` で宣言されていること、`lastSp` と `lastLots` の代入がこの位置より前にあることを確認する（`sheetEntries()` はこの2つを参照する）。

- [ ] **Step 4: 検証（超過の警告が出ること）**

再読み込みし「入力をクリア」してから、**8件**を入力する（種別＝仕掛品、SNP 10、個数はすべて `20`＝2P、ロットは `L01`〜`L08` と全て別にする）。

「▶ 自動配置を作成」。

期待: 8件すべてメインに入るため下段が8欄になり、「⚠ 配置図の表に載りきらないロットがあります：倉庫内 1件」が表示される。

- [ ] **Step 5: 検証（通常時に警告が出ないこと）**

「基本サンプル」を読み込んで「▶ 自動配置を作成」。
超過の警告が出ないことを確認する。

- [ ] **Step 6: 検証（文言）**

- ヘッダに「ロットごとにまとめて配置」と出ている
- 入力タブ下部に「メイン → 軒下 → PC横・EV横 の順に配置」と出ている
- 「仕掛品→倉庫内 / 商品→倉庫外」「④の通路は大口の余りのみ使用」がどこにも残っていない

```bash
grep -n "仕掛品→倉庫内\|大口の余りのみ\|仕掛品=倉庫内" files/index.html
```

期待: 何も出力されない。

- [ ] **Step 7: コミット**

```bash
git add files/index.html
git commit -m "feat: 表に載りきらないロットを警告し、古い配置ルールの説明を修正

配置図の表は上段4欄・下段7欄しかなく、超過分は黙って消えていた。
種別で倉庫内／外を分けていた頃の説明文も新しいルールに合わせる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 全体の受け入れ確認

全タスク完了後、ブラウザで通しで確認する。

- [ ] 仕様書の期待どおりの配置になる（Task 3 Step 3 の5件）
- [ ] 表に同じロットが2回現れない（Task 4 Step 4）
- [ ] またがった時の注釈が `※PC横・EV横` になる（Task 4 Step 5）
- [ ] 「基本サンプル」「混載デモ」が例外なく動く
- [ ] あふれ・混載・通路はみ出しの警告が出る
- [ ] 印刷プレビューで表が1ページに収まる（`window.print()`）
- [ ] 設定タブでスペースの順を入れ替える → 配置の優先順が変わる
- [ ] ブロック図の表示（フロア配置、壁、PC横・EV横の上下反転）が壊れていない
