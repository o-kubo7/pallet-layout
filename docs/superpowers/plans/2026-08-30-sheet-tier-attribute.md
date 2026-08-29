# スペースの掲載先属性と設定の永続化 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スペースに「掲載先」の属性を持たせて配置表のハードコード配列を廃止し、スペース設定を localStorage に保存して恒久設定にする。

**Architecture:** `SPACES` の各要素に `sheet`（`"top"` / `"bottom"` / `"over"`）を追加し、配置表と警告はこの属性から導出する。`SPACES` の配列全体をバージョン付きで localStorage に保存する。掲載先だけを変えたときは再配置を走らせず、ブロック図で手動調整した配置を残す。

**Tech Stack:** 単一 HTML ファイルの PWA。ビルドツールなし、テストランナーなし、依存パッケージなし。素の JavaScript と localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-08-29-sheet-tier-attribute-design.md`

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の 2 つだけ。他のファイルは変更しない。
- 掲載先の値は `"top"` / `"bottom"` / `"over"` の 3 つ。`"none"`（表示しない）は作らない。
- あふれブロックの描画と欄の流し込みは範囲外。実装しない。
- `SHEET_TOP_SLOTS`（4）と `SHEET_BOTTOM_SLOTS`（7）は変更しない。
- `FLOOR_POS` と `AREA_GROUPS` は変更しない。
- 「段」は倉庫の段数の意味だけで使う。配置表のブロックは「掲載先」と呼ぶ。
- `files/index.html` を変更したら、最後に `files/sw.js` の `CACHE_VERSION` を `"v18"` から `"v19"` に上げる（Task 5）。上げないとインストール済みの PWA に更新が届かない。
- 既存の関数名・引数の並びは変えない。`spacesToText()` への引数追加は既定値付きで後方互換にする。

## 検証の方針

このプロジェクトにはテストランナーが無い。各タスクの検証は、ブラウザで開いたページに対して
`javascript_tool`（`mcp__Claude_Browser__javascript_tool`）で検証スクリプトを実行し、
返り値の `ok` が `true` であることを確認する形で行う。

**必ず守ること:**

- `applyConfig()` は `alert()` を呼ぶ。`alert()` は `javascript_tool` の実行をブロックするので、
  検証スクリプトの先頭で必ず `window.alert` を差し替える。各タスクの検証スクリプトに含めてある。
- 合成イベントは `isTrusted:false` で既定動作を持たないため、ボタンのクリックは再現しない。
  `applyConfig()` / `resetConfig()` / `run(false)` はハンドラを直接呼ぶ。
- textarea への入力は `.value=` の直代入で行う。今回の変更対象に `change` に依存する処理は無い。
- Service Worker は cache-first なので、`index.html` を編集したら
  検証の前に必ず登録解除とキャッシュ削除を行う（Task 0 の手順）。行わないと旧版を見続ける。

---

## Task 0: 検証環境の用意

**Files:**
- Create: `.claude/launch.json`

**Interfaces:**
- Produces: `http://localhost:8765/` で `files/` を配信する preview サーバ。以降の全タスクがこれを使う。

`file://` で開くと localStorage と Service Worker の挙動がブラウザごとに違う。
以降のタスクは localStorage の保存と復元を検証するので、http で配信する。

- [ ] **Step 1: `.claude/launch.json` を作る**

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "pallet-layout",
      "runtimeExecutable": "python3",
      "runtimeArgs": ["-m", "http.server", "8765", "--directory", "files"],
      "port": 8765
    }
  ]
}
```

- [ ] **Step 2: サーバを起動してページを開く**

`mcp__Claude_Browser__preview_start` を `{"name": "pallet-layout"}` で呼ぶ。
`http://localhost:8765/` が Browser pane に開くことを確認する。

- [ ] **Step 3: Service Worker とキャッシュを消す**

`javascript_tool` で次を実行する。これは `index.html` を編集するたびに毎回行う。

```js
const regs = await navigator.serviceWorker.getRegistrations();
await Promise.all(regs.map(r => r.unregister()));
const keys = await caches.keys();
await Promise.all(keys.map(k => caches.delete(k)));
({ unregistered: regs.length, cachesDeleted: keys.length });
```

- [ ] **Step 4: リロードして現状の動作を記録する**

`javascript_tool` で次を実行し、変更前の基準値を控える。Task 1 でこれと突き合わせる。

```js
location.reload();
```

リロード後、あらためて次を実行する。

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
switchTab('sheet');   // 表はタブが表示されて初めて描かれる（showMapState 参照）
const sheet = document.querySelector('#sheetView .sheet');
({
  ok: !!sheet,
  sheetHtmlLength: sheet ? sheet.innerHTML.length : 0,
  messages: document.getElementById('messages').textContent.trim(),
  cfgText: document.getElementById('cfgText').value,
});
```

期待: `ok` が `true`。`cfgText` が 5 項目の行 5 本。
返り値の `sheetHtmlLength` と `cfgText` を控えておく。

- [ ] **Step 5: コミット**

```bash
git add .claude/launch.json
git commit -m "chore: 検証用のローカルサーバ設定を追加する"
```

---

## Task 1: 掲載先の属性と導出関数を入れる

既定値では動作が変わらないことを保証しながら、エリア名のハードコードを属性からの導出に置き換える。
あわせて、あふれ指定のエリアを配置の対象から外す。

**Files:**
- Modify: `files/index.html`
  - `DEFAULT_SPACES`（499-509 行目付近）
  - `SHEET_TOP` / `SHEET_BOTTOM` の定義（521-522 行目付近）
  - `areaCandidates()`（1328-1343 行目付近）
  - `renderResult()` 内の警告（1458-1470 行目付近）
  - `showCapacity()`（2069-2075 行目付近）
  - `renderSheet()` の冒頭（2213-2215 行目付近）
  - `gridRows()`（2297-2300 行目付近）

**Interfaces:**
- Produces:
  - `SPACES[i].sheet` … `"top"` / `"bottom"` / `"over"` のいずれか
  - `sheetAreas(tier)` … `tier` に属するエリア名の配列を、`SPACES` の並び順で返す
  - 掲載先が `"over"` のエリアには `place()` が荷物を置かない

- [ ] **Step 1: `DEFAULT_SPACES` に `sheet` を足す**

499-509 行目付近を次に置き換える。既定値は現行の `SHEET_TOP` / `SHEET_BOTTOM` と同じ割り当てにする。

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

- [ ] **Step 2: `SHEET_TOP` / `SHEET_BOTTOM` を消して `sheetAreas()` を置く**

521-523 行目付近を次に置き換える。`SHEET_TOP_SLOTS` / `SHEET_BOTTOM_SLOTS` はそのまま残す。

```js
// 「配置図の表」での欄の割り当て。エリア名は SPACES の sheet 属性から引く。
// 返す順は SPACES の並び順。下段の先頭が基準エリアで、注釈を付けず、グリッドを描く。
function sheetAreas(tier){ return SPACES.filter(s=>(s.sheet||"bottom")===tier).map(s=>s.name); }
const SHEET_TOP_SLOTS = 4, SHEET_BOTTOM_SLOTS = 7; // 紙のレイアウトで決まる欄数。renderSheet と欄数超過の警告で共有
```

- [ ] **Step 3: `areaCandidates()` であふれ指定のエリアを候補から外す**

1328-1330 行目付近、`function areaCandidates(sp){` の先頭 2 行を次に置き換える。

変更前:

```js
function areaCandidates(sp){
  const byName={}; sp.forEach(s=>byName[s.name]=s);
```

変更後:

```js
function areaCandidates(sp){
  // 掲載先が「あふれブロック」のエリアは配置図の表に欄が無い。
  // 荷物を置くと「倉庫にはあるのに紙のどこにも無い」ロットになるので、配置の対象から外す。
  // buildWork() ではなくここで外すのは、エリア自体は倉庫に実在するのでブロック図には
  // 空のまま残したいため。AREA_GROUPS の連結も byName に入らないことで自然に外れる。
  const overNames=new Set(sheetAreas("over"));
  sp=sp.filter(s=>!overNames.has(s.name));
  const byName={}; sp.forEach(s=>byName[s.name]=s);
```

以降の `sp.forEach(s=>{...})` は書き換えた `sp` を見るので、そのままでよい。

- [ ] **Step 4: `renderResult()` 内の警告を書き換える**

1458-1470 行目付近を次に置き換える。
`noSlotAreas`（どちらの段にも属さないエリア）は矯正により発生しなくなるので消す。
「軒下」「倉庫内」という語はエリア名に依存していて掲載先が変わると合わなくなるので、
「上段」「下段」に変える。

```js
  // 配置図の表は上段SHEET_TOP_SLOTS欄・下段SHEET_BOTTOM_SLOTS欄しかない。載りきらないロットは黙って消えるので知らせる。
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  const overTop=sheetEntries(topAreas,null).length-SHEET_TOP_SLOTS;
  const overBottom=sheetEntries(bottomAreas, bottomAreas[0]||null).length-SHEET_BOTTOM_SLOTS;
  if(overTop>0 || overBottom>0){
    const parts=[];
    if(overTop>0) parts.push(`上段 ${overTop}件`);
    if(overBottom>0) parts.push(`下段 ${overBottom}件`);
    warnHtml+=`<div class="msg warn">⚠ 配置図の表に載りきらないロットがあります：${parts.join(" / ")}。ブロック図で確認してください。</div>`;
  }
  // あふれブロックの描画が未実装なので、掲載先が over のエリアは配置の対象から外してある
  // （areaCandidates 参照）。使えない場所があることを知らせる。
  const overAreas=sheetAreas("over");
  if(overAreas.length){
    warnHtml+=`<div class="msg warn">⚠ あふれブロックは未実装のため、次のエリアには荷物を置きません：${overAreas.join("・")}</div>`;
  }
```

- [ ] **Step 5: `showCapacity()` からあふれ指定のエリアを除く**

2069-2075 行目付近を次に置き換える。配置の対象から外したエリアの容量を
収容能力に数えたままにすると、使えない容量を表示することになる。

```js
function showCapacity(){
  // 掲載先が over のエリアは配置の対象外なので、収容能力からも除く。
  const overNames=new Set(sheetAreas("over"));
  const live=SPACES.filter(s=>!overNames.has(s.name));
  const sum=(z,f)=>live.filter(s=>s.zone===z).reduce((a,s)=>a+s.cols.filter(f).reduce((x,c)=>x+c.h,0),0);
  const excluded=[...overNames].length?`　（あふれ指定のため除外：${[...overNames].join("・")}）`:"";
  document.getElementById("capacity").textContent=
    `収容能力 — 倉庫内: 通常${sum("near",c=>!c.aisle)}P＋通路${sum("near",c=>c.aisle)}P ／ `+
    `倉庫外: 通常${sum("far",c=>!c.aisle)}P＋通路${sum("far",c=>c.aisle)}P`+excluded;
}
```

- [ ] **Step 6: `renderSheet()` の冒頭を書き換える**

2213-2215 行目付近を次に置き換える。エリア名の直書きを消す。

```js
  // 上段・下段に出すエリアは掲載先の属性から引く。下段の先頭エリアは注釈を付けない基準にする。
  const topAreas=sheetAreas("top"), bottomAreas=sheetAreas("bottom");
  const top=sheetEntries(topAreas, null);
  const bottom=sheetEntries(bottomAreas, bottomAreas[0]||null);
```

- [ ] **Step 7: `gridRows()` の「メイン」直書きを消す**

2297-2300 行目付近を次に置き換える。

変更前:

```js
// メインのグリッド行（○／半／太枠）
function gridRows(){
  const sp=lastSp.find(s=>s.name==="メイン");
  // 設定でエリア名を変えると「メイン」が無くなることがある
  if(!sp) return {html:"", anchors:[]};
```

変更後:

```js
// 下段の先頭エリアのグリッド行（○／半／太枠）。
// drawLeaders() は下段の欄からこのグリッドへ線を引くので、
// 欄の基準エリア（sheetEntries の baseArea）と必ず同じエリアにする。
// ここを固定名にしておくと、基準エリアの掲載先を変えたときに
// 欄とグリッドが別のエリアを指し、引き出し線が的外れになる。
function gridRows(){
  const sp=lastSp.find(s=>s.name===sheetAreas("bottom")[0]);
  // 下段が空、または設定でエリア名を変えて見つからないことがある
  if(!sp) return {html:"", anchors:[]};
```

- [ ] **Step 8: Service Worker を消してリロードし、既定値で動作が変わっていないことを確認する**

`javascript_tool` で Task 0 Step 3 のスクリプトを実行してから `location.reload()`。
リロード後に次を実行する。

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
switchTab('sheet');   // 表はタブが表示されて初めて描かれる（showMapState 参照）
const sheet = document.querySelector('#sheetView .sheet');
const top = sheetAreas('top'), bottom = sheetAreas('bottom'), over = sheetAreas('over');
({
  ok: JSON.stringify(top) === JSON.stringify(['軒下①','軒下②'])
   && JSON.stringify(bottom) === JSON.stringify(['メイン','PC横','EV横'])
   && over.length === 0
   && !!sheet && typeof SHEET_TOP === 'undefined'
   && !document.getElementById('capacity').textContent.includes('除外'),
  top, bottom, over,
  sheetHtmlLength: sheet ? sheet.innerHTML.length : 0,
  leaders: sheet ? sheet.querySelectorAll('svg path').length : 0,
  capacity: document.getElementById('capacity').textContent,
  messages: document.getElementById('messages').textContent.trim(),
});
```

期待: `ok` が `true`。`sheetHtmlLength` が Task 0 Step 4 で控えた値と一致する。

`typeof SHEET_TOP === 'undefined'` は const を消し忘れていないかの確認。
消し忘れていると `undefined` にならず `ok` が `false` になる。
`leaders` は引き出し線の本数。0 でないことを目で確かめる。

- [ ] **Step 9: 掲載先を動かして、表とグリッドと配置が追随することを確認する**

```js
window.alert = () => {}; window.confirm = () => true;
// basic は 98P でメイン(74P)と軒下(30P)に収まり PC横 に届かない。
// エリアごとの挙動を見るには PC横・EV横 まで埋まる mix(130P) を使う。
loadSample('mix');
run(false);

// (a) PC横 を上段に移すと、上段のエリアになる
SPACES.find(s => s.name === 'PC横').sheet = 'top';
run(false);
const a = sheetAreas('top').includes('PC横') && !sheetAreas('bottom').includes('PC横');

// (b) PC横 を over にすると、荷物が置かれず、警告が出て、収容能力から外れる
SPACES.find(s => s.name === 'PC横').sheet = 'over';
run(false); showCapacity();
const pc = lastSp.find(s => s.name === 'PC横');
const b = pc && pc.cols.every(c => c.fills.length === 0)
       && document.getElementById('messages').textContent.includes('荷物を置きません')
       && document.getElementById('capacity').textContent.includes('除外：PC横');

// (c) 基準エリア（メイン）を上段に移すと、グリッドが次の下段先頭（EV横）に切り替わる
SPACES.find(s => s.name === 'PC横').sheet = 'bottom';
SPACES.find(s => s.name === 'メイン').sheet = 'top';
run(false); switchTab('sheet');
const c = sheetAreas('bottom')[0] === 'PC横'
       && gridRows().anchors.every(x => lastSp.find(s => s.name === 'PC横').cols
            .some(col => col.fills.some(f => f.id === x.id)));

// 後始末
SPACES.find(s => s.name === 'メイン').sheet = 'bottom';
run(false);
({ ok: a && b && c, a, b, c, capacity: document.getElementById('capacity').textContent });
```

期待: `ok` が `true`。

(c) は「グリッドのアンカーが下段の先頭エリアのロットだけを指している」ことの確認。
`gridRows()` が固定名のままだと、アンカーがメインのロットを指すので `false` になる。

このスクリプトは `SPACES` を直接いじって元に戻すだけで、保存には触らない。

- [ ] **Step 10: コミット**

```bash
git add files/index.html
git commit -m "feat: スペースに掲載先の属性を持たせ、配置表と配置対象をそこから引く"
```

---

## Task 2: 設定の 6 項目目として掲載先を入出力する

**Files:**
- Modify: `files/index.html`
  - 設定カードの hint（473 行目付近）
  - `spacesToText()`（2038-2043 行目付近）
  - `applyConfig()`（2044-2062 行目付近）

**Interfaces:**
- Consumes: Task 1 の `SPACES[i].sheet`
- Produces:
  - `spacesToText(withSheet = true)` … `withSheet` が偽なら 5 項目、真なら 6 項目の文字列を返す
  - `applyConfig()` … 6 項目目をパースし、省略時は同名の現 `SPACES` から引き継ぐ

- [ ] **Step 1: hint の文言を更新する**

473 行目付近の `<div class="hint" style="margin-bottom:8px">` の中身を次に置き換える。

```html
      <div class="hint" style="margin-bottom:8px">各行：<b>名前 | 区分(near/far) | 向き(v/h) | ブロック列数 | 各列の高さ(カンマ区切り、末尾*=通路) | 掲載先(top/bottom/over)</b><br>掲載先は配置図の表のどこに欄を書くかです。top＝上段、bottom＝下段、over＝あふれブロック。省略すると今の設定を引き継ぎます。<b>あふれブロックは未実装</b>なので、over にしたエリアには荷物を置きません。<br><b>行の順番には意味があります。</b>上の行から順に自動配置で試します。また bottom の先頭の行が配置図の表の基準になり、その欄には注釈が付かず、大きなグリッドもそのエリアを描きます。並べ替えると配置のしかたが変わり、手動で調整した配置は破棄されます。</div>
```

- [ ] **Step 2: `spacesToText()` に引数を足す**

2038-2043 行目付近を次に置き換える。

```js
/* 設定テキストへの書き出し。
   withSheet を偽にすると掲載先を除いた 5 項目になる。
   inputFingerprint() が使う。掲載先は紙のどこに書くかであって倉庫の形ではないので、
   手動調整を残すかどうかの判定には入れない。 */
function spacesToText(withSheet=true){
  return SPACES.map(s=>{
    const cols=s.cols.map(c=>c.h+(c.aisle?"*":"")).join(",");
    const base=`${s.name} | ${s.zone} | ${s.orient||"v"} | ${s.block||99} | ${cols}`;
    return withSheet ? `${base} | ${s.sheet||"bottom"}` : base;
  }).join("\n");
}
```

- [ ] **Step 3: `applyConfig()` に 6 項目目のパースを足す**

2044-2062 行目付近の `for` ループの中、`if(!cols.length){...}` の次の 2 行を次に置き換える。

変更前:

```js
    const prev=SPACES.find(s=>s.name===p[0]);
    out.push({name:p[0], zone:p[1], orient, block, align:prev?prev.align:undefined, cols});
```

変更後:

```js
    const prev=SPACES.find(s=>s.name===p[0]);
    // 掲載先は省略できる。省略したら今の設定を引き継ぎ、無ければ下段にする。
    const sheetRaw=(p[5]||"").trim();
    let sheet;
    if(sheetRaw===""){ sheet=(prev&&prev.sheet)?prev.sheet:"bottom"; }
    else if(["top","bottom","over"].includes(sheetRaw)){ sheet=sheetRaw; }
    else { alert("掲載先は top / bottom / over のどれか:\n"+ln); return; }
    out.push({name:p[0], zone:p[1], orient, block, align:prev?prev.align:undefined, cols, sheet});
```

`if(p.length<5)` のチェックはそのまま残す。6 項目目は任意なので条件を変えない。

- [ ] **Step 4: 空の設定と同名エリアを拒否する**

`applyConfig()` の `for` ループの直後、`SPACES=out;` の直前に次を足す。

どちらも改修前からある穴だが、設定が永続化されると壊れた状態が固定されるのでここで塞ぐ。
空を通すと `SPACES=[]` が保存され、リロード時に `validSpaces([])` が偽になって
「読み込めなかった」と嘘の理由が出る。同名を通すと 2 行目が黙って死ぬ
（`SPACES.find` も `lastSp.find` も先頭しか拾わない）。

```js
  if(!out.length){alert("設定が空です。1行以上必要です。");return;}
  const dup=out.map(s=>s.name).find((n,i,a)=>a.indexOf(n)!==i);
  if(dup){alert("同じ名前のエリアが2行あります:\n"+dup);return;}
```

- [ ] **Step 5: Service Worker を消してリロードし、書き出しを確認する**

Task 0 Step 3 のスクリプトを実行してから `location.reload()`。リロード後に次を実行する。

```js
const withSheet = spacesToText();
const without = spacesToText(false);
({
  ok: withSheet.split('\n')[0].endsWith('| bottom')
   && withSheet.split('\n')[1].endsWith('| top')
   && without.split('\n').every(l => l.split('|').length === 5)
   && document.getElementById('cfgText').value === withSheet,
  first: withSheet.split('\n')[0],
  withoutFirst: without.split('\n')[0],
});
```

期待: `ok` が `true`。`first` が `メイン | near | v | 3 | 6*,7,7,7,7,7,7,7,7,7,5* | bottom`。

- [ ] **Step 6: 6 項目目のパースを確認する**

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
const el = document.getElementById('cfgText');

// (a) 明示した掲載先が効く
el.value = spacesToText().replace('PC横 | near | h | 99 | 8,4 | bottom', 'PC横 | near | h | 99 | 8,4 | top');
applyConfig();
const a = sheetAreas('top').includes('PC横');

// (b) 6 項目目を省略すると引き継ぐ
el.value = spacesToText(false);
applyConfig();
const b = SPACES.find(s => s.name === 'PC横').sheet === 'top';

// (c) 未知の値は拒否され、SPACES が変わらない
let alerted = '';
window.alert = m => { alerted = m; };
el.value = spacesToText().replace('| top', '| middle');
applyConfig();
const c = alerted.includes('掲載先は top / bottom / over') && SPACES.find(s => s.name === 'PC横').sheet === 'top';

// (d) 空と同名は拒否される
let alerted2 = '';
window.alert = m => { alerted2 = m; };
const keep = spacesToText();
el.value = '';
applyConfig();
const dEmpty = alerted2.includes('設定が空です') && SPACES.length === 5;
el.value = keep + '\n' + keep.split('\n')[0];
applyConfig();
const dDup = alerted2.includes('同じ名前のエリアが2行') && SPACES.length === 5;

// 後始末
window.alert = () => {}; window.confirm = () => true;
resetConfig();
({ ok: a && b && c && dEmpty && dDup, a, b, c, dEmpty, dDup, alerted });
```

期待: `ok` が `true`。

(b) は「省略した行の掲載先が変わらない」ことの確認。直前の (a) で `PC横` を `top` にしてあるので、
5 項目のテキストを流し込んでも `top` のまま残る。

- [ ] **Step 7: コミット**

```bash
git add files/index.html
git commit -m "feat: スペース設定の6項目目で掲載先を指定できるようにする"
```

---

## Task 3: スペース設定を保存して復元する

**Files:**
- Modify: `files/index.html`
  - 設定カードの HTML（471-472 行目付近。バッジと `#cfgNote`）
  - `STORE_KEY`（575 行目付近）
  - `applyConfig()` の末尾（2060 行目付近）
  - `resetConfig()`（2064-2068 行目付近）
  - init（`cfgText` を埋める行の直前。2474 行目付近）

**Interfaces:**
- Consumes: Task 2 の `spacesToText()` / `applyConfig()`
- Produces:
  - `STORE_KEY.spaces` … `"palletApp.spaces"`
  - `SPACES_SAVE_VERSION` … 数値。`DEFAULT_SPACES` を更新したら上げる
  - `validSpaces(a)` … 真偽値を返す。名前と列が壊れていたら偽
  - `normalizeSpaces(a)` … 検証を通った配列を矯正して返す
  - 保存の形 … `{v: SPACES_SAVE_VERSION, spaces: SPACES}`

- [ ] **Step 1: 設定カードのバッジを変えて `#cfgNote` を足す**

471-472 行目付近の `<h2>` の行を次に置き換える。`<h2>` の直後に `#cfgNote` を置く。

```html
      <h2>スペース設定 <span class="badge" id="cfgBadge">この端末に保存</span></h2>
      <div class="hint" id="cfgNote" style="margin-bottom:8px;color:#b45309" hidden></div>
```

バッジに `id` を付けるのは、localStorage が使えない環境で「この端末に保存」が嘘になるため。
次のステップで `updateSaveStatus()` から書き換える。

- [ ] **Step 1b: 保存できない環境でバッジの文言を変える**

`updateSaveStatus()`（592 行目付近）の末尾に次を足す。

```js
  const badge=document.getElementById("cfgBadge");
  if(badge) badge.textContent = storageOK ? "この端末に保存" : "この環境では保存されません";
```

- [ ] **Step 2: `STORE_KEY` に `spaces` を足して保存バージョンを置く**

575 行目付近の `const STORE_KEY={...}` の行を次に置き換える。

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual", spaces:"palletApp.spaces"};
// DEFAULT_SPACES をコード側で変えたらこの番号を上げる。
// 古い保存はバージョン不一致で捨てられ、更新した既定値が既存の端末にも届く。
const SPACES_SAVE_VERSION = 1;
```

- [ ] **Step 3: 検証と矯正の関数を足す**

`function showCapacity(){` の直前（2069 行目付近）に次を足す。

```js
/* 保存された SPACES の検証。
   loadData() は JSON.parse の失敗しか握らないので、JSON として正しく構造が壊れている
   保存は素通りする。単一 script なので drawZone() で例外が飛ぶとそこから下
   （Service Worker の登録を含む）が丸ごと実行されなくなる。ここで止める。
   必須は名前と列だけ。それ以外は normalizeSpaces() で矯正して読む。 */
function validSpaces(a){
  if(!Array.isArray(a) || !a.length) return false;
  return a.every(s=>
       s && typeof s==="object" && !Array.isArray(s)
    && typeof s.name==="string" && s.name!==""
    && Array.isArray(s.cols) && s.cols.length
    && s.cols.every(c=>c && Number.isFinite(c.h) && c.h>0));
}
// 欠けた値・知らない値を既定に寄せる。捨てるのは validSpaces() が偽のときだけ。
function normalizeSpaces(a){
  const SHEETS=["top","bottom","over"];
  return a.map(s=>{
    const def=DEFAULT_SPACES.find(d=>d.name===s.name);
    return {
      name:s.name,
      zone:(s.zone==="near"||s.zone==="far")?s.zone:(def?def.zone:"near"),
      orient:(s.orient==="h")?"h":"v",
      block:Number.isFinite(s.block)?s.block:99,
      align:s.align,
      cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle})),
      sheet:SHEETS.includes(s.sheet)?s.sheet:"bottom",
    };
  });
}
```

- [ ] **Step 4: `applyConfig()` で保存し、`resetConfig()` で破棄する**

2060-2068 行目付近を次に置き換える。

変更前:

```js
  SPACES=out; showCapacity();
  if(lastLots) run(false);
  alert("設定を反映しました。");
}
function resetConfig(){
  SPACES=clone(DEFAULT_SPACES);
  document.getElementById("cfgText").value=spacesToText();
  showCapacity(); if(lastLots) run(false);
}
```

変更後:

```js
  SPACES=out;
  saveData(STORE_KEY.spaces, {v:SPACES_SAVE_VERSION, spaces:SPACES});
  clearCfgNote();
  showCapacity();
  if(lastLots) run(false);
  alert("設定を反映しました。");
}
function resetConfig(){
  SPACES=clone(DEFAULT_SPACES);
  saveData(STORE_KEY.spaces, null);   // 「初期値に戻す」は保存も消す
  clearCfgNote();
  document.getElementById("cfgText").value=spacesToText();
  showCapacity(); if(lastLots) run(false);
}
```

あわせて、`function validSpaces(a){` の直前に次を足す。
入れ忘れると、ユーザーが設定を直した後もリロードするまで知らせが出っぱなしになる。

```js
// 起動時に出した「読み込めなかった」の知らせを消す。設定を直したら用済みになる。
function clearCfgNote(){
  const note=document.getElementById("cfgNote");
  if(note){ note.textContent=""; note.hidden=true; }
}
function showCfgNote(msg){
  const note=document.getElementById("cfgNote");
  if(note){ note.textContent=msg; note.hidden=false; }
}
```

Task 4 でこの `run(false)` の呼び方をさらに変える。ここではまだ変えない。

- [ ] **Step 5: 起動時の復元を足す**

2473-2474 行目付近、`/* ---------- init ---------- */` の直後、
`document.getElementById("cfgText").value=spacesToText();` の**直前**に次を足す。
`initMaster()` などと同じ IIFE の形にする。

```js
// スペース設定：保存があれば復元。壊れていたら捨てて初期値に戻し、その旨を設定タブに出す。
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

この位置でないと、`cfgText` に古い内容が入ったままになる。

- [ ] **Step 5b: 起動時の `run(false)` を try/catch で囲む**

`initLots()`（2502-2506 行目付近）には `run(false)` の呼び出しが 2 つある
（保存された入力を復元する側と、保存が無くてサンプルを読む側）。両方を囲む。

保存される前は、設定を壊してもリロードすれば `DEFAULT_SPACES` に戻った。保存されるように
なると、`validSpaces()` を通ってしまう程度に壊れた設定は毎回再現する。ここは単一 script の
途中なので、例外が飛ぶとそこから下（Service Worker の登録を含む）が実行されない。
そうなると「初期値に戻す」ボタンにも到達できず、Service Worker は cache-first なので
新しい HTML も届かない。

変更前:

```js
    syncCards(); saveLots();
    // 入力と列構成が保存時と同じなら、手動調整した配置をそのまま出す
    if(!restoreManual()) run(false);
  }else{
    SAMPLES.basic.forEach(addRow);
    syncCards(); saveLots(); run(false);
  }
```

変更後:

```js
    syncCards(); saveLots();
    // 入力と列構成が保存時と同じなら、手動調整した配置をそのまま出す
    bootDraw(()=>{ if(!restoreManual()) run(false); });
  }else{
    SAMPLES.basic.forEach(addRow);
    syncCards(); saveLots(); bootDraw(()=>run(false));
  }
```

`bootDraw()` は `function clearCfgNote(){` の直前（Task 3 Step 4 で足した場所）に置く。

```js
/* 起動時の描画を包む。保存された設定が壊れていて描画に失敗すると、
   単一 script なのでここから下（Service Worker の登録を含む）が全部実行されない。
   そうなると「初期値に戻す」ボタンにも届かず、SW は cache-first なので
   新しい HTML も落ちてこない。保存を捨てて、次のリロードで初期値に戻れるようにする。 */
function bootDraw(fn){
  try{ fn(); }
  catch(e){
    saveData(STORE_KEY.spaces, null);
    clearManual();
    showCfgNote("保存されていた設定で配置図を作れませんでした。設定タブの「初期値に戻す」を押すか、画面を再読み込みしてください。");
  }
}
```

- [ ] **Step 6: Service Worker を消してリロードし、保存と復元を確認する**

Task 0 Step 3 のスクリプトを実行してから `location.reload()`。リロード後に次を実行する。

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
const el = document.getElementById('cfgText');
el.value = spacesToText().replace('| 8,4 | bottom', '| 8,4 | top');
applyConfig();
const saved = JSON.parse(localStorage.getItem('palletApp.spaces'));
({
  ok: saved && saved.v === 1 && Array.isArray(saved.spaces)
   && saved.spaces.find(s => s.name === 'PC横').sheet === 'top',
  v: saved && saved.v,
  pcSheet: saved && saved.spaces.find(s => s.name === 'PC横').sheet,
});
```

期待: `ok` が `true`。

続けてリロードし、復元されていることを確認する。

```js
location.reload();
```

リロード後:

```js
({
  ok: SPACES.find(s => s.name === 'PC横').sheet === 'top'
   && document.getElementById('cfgText').value.includes('| 8,4 | top')
   && document.getElementById('cfgNote').hidden === true,
  pcSheet: SPACES.find(s => s.name === 'PC横').sheet,
});
```

期待: `ok` が `true`。

- [ ] **Step 7: 「初期値に戻す」で保存が消えることを確認する**

```js
window.alert = () => {}; window.confirm = () => true;
resetConfig();
const raw = localStorage.getItem('palletApp.spaces');
({
  ok: (raw === null || raw === 'null')
   && SPACES.find(s => s.name === 'PC横').sheet === 'bottom',
  raw,
});
```

期待: `ok` が `true`。

- [ ] **Step 8: 壊れた保存を読んでも落ちないことを確認する**

```js
localStorage.setItem('palletApp.spaces', JSON.stringify({v:1, spaces:[{name:"x"}]}));
location.reload();
```

リロード後:

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
const note = document.getElementById('cfgNote');
({
  ok: SPACES.length === 5
   && note.hidden === false
   && note.textContent.includes('読み込めなかった')
   && localStorage.getItem('palletApp.spaces') === 'null'
   && document.getElementById('zone-near').children.length > 0
   && (switchTab('sheet'), !!document.querySelector('#sheetView .sheet')),
  spacesLen: SPACES.length,
  note: note.textContent,
});
```

期待: `ok` が `true`。`cols` の無い保存が捨てられ、初期値に戻り、
ブロック図と配置表がどちらも描画されている。

続けて、設定を直すと知らせが消えることを確認する。

```js
window.alert = () => {}; window.confirm = () => true;
const note = document.getElementById('cfgNote');
const before = note.hidden;
applyConfig();
({ ok: before === false && note.hidden === true, before, after: note.hidden });
```

期待: `ok` が `true`。入れ忘れると、直した後もリロードするまで出っぱなしになる。

- [ ] **Step 9: バージョン不一致でも捨てられることを確認する**

```js
localStorage.setItem('palletApp.spaces', JSON.stringify({v:0, spaces:clone(DEFAULT_SPACES)}));
location.reload();
```

リロード後:

```js
const note = document.getElementById('cfgNote');
({
  ok: note.hidden === false && localStorage.getItem('palletApp.spaces') === 'null',
  note: note.textContent,
});
```

期待: `ok` が `true`。

- [ ] **Step 10: コミット**

```bash
git add files/index.html
git commit -m "feat: スペース設定を localStorage に保存して復元する"
```

---

## Task 4: 掲載先だけを変えたときに手動調整を残す

`run()` は「配置し直したので手動調整は捨てる」として `clearManual()` を呼ぶ。
`applyConfig()` が必ず `run(false)` を呼ぶため、このままでは掲載先しか変えていなくても
手動調整が消える。指紋から掲載先を外すだけでは効果が無い。2 つをまとめて入れる。

**Files:**
- Modify: `files/index.html`
  - `inputFingerprint()` の直前のコメントと本体（1839-1852 行目付近）
  - `applyConfig()` の末尾（2060 行目付近）
  - `resetConfig()`（2064 行目付近）

**Interfaces:**
- Consumes: Task 2 の `spacesToText(withSheet)`、既存の `redraw()`
- Produces: `inputFingerprint()` の返り値が掲載先を含まなくなる。文字列は改修前と同一

- [ ] **Step 1: 指紋のコメントを直して掲載先を外す**

1839-1852 行目付近を次に置き換える。コメントの「保存されておらず」は今回の変更で嘘になるので書き換える。

```js
/* 手動調整の保存。
   指紋は「荷物の入力」と「列構成」を連結したもの。

   指紋は保存した瞬間ではなく run() を実行した時点のものを使う（lastFp）。
   荷物の入力欄を編集しても run() は呼ばれないため、
   「自動配置 → 入力を書き換える → 配置図に戻って手動移動」という順序が成立してしまう。
   保存時の入力を指紋にすると {編集後の指紋, 編集前の配置} という食い違った組が残り、
   リロード時に一致してしまって古い配置が復元される。

   列構成を含めるのは、列の数や高さが変わると復元した配置がそのまま乗らないため。
   掲載先（sheet）は含めない。紙のどこに欄を書くかであって倉庫の形ではないので、
   変えても保存済みの配置はそのまま使える。spacesToText(false) で 5 項目に落とす。 */
let lastFp=null;
function inputFingerprint(){ return JSON.stringify(readRowData())+"|#|"+spacesToText(false); }
```

- [ ] **Step 2: `applyConfig()` の末尾で幾何を比べて分岐する**

Task 3 Step 4 で書き換えた `applyConfig()` の末尾を、さらに次に置き換える。

変更前:

```js
  SPACES=out;
  saveData(STORE_KEY.spaces, {v:SPACES_SAVE_VERSION, spaces:SPACES});
  showCapacity();
  if(lastLots) run(false);
  alert("設定を反映しました。");
}
```

変更後:

```js
  // 掲載先だけの変更なら再配置しない。run() は clearManual() を呼ぶので、
  // 通すとブロック図で手動調整した配置が消える。
  const geomBefore=spacesToText(false);
  SPACES=out;
  saveData(STORE_KEY.spaces, {v:SPACES_SAVE_VERSION, spaces:SPACES});
  showCapacity();
  if(lastLots){
    if(spacesToText(false)===geomBefore) redraw();
    else run(false);
  }
  alert("設定を反映しました。");
}
```

`geomBefore` は `SPACES=out` より前に取る。順序を間違えると常に一致してしまう。

- [ ] **Step 3: `resetConfig()` も同じ分岐にする**

Task 3 Step 4 で書き換えた `resetConfig()` を、さらに次に置き換える。

```js
function resetConfig(){
  const geomBefore=spacesToText(false);
  SPACES=clone(DEFAULT_SPACES);
  saveData(STORE_KEY.spaces, null);   // 「初期値に戻す」は保存も消す
  document.getElementById("cfgText").value=spacesToText();
  showCapacity();
  if(lastLots){
    if(spacesToText(false)===geomBefore) redraw();
    else run(false);
  }
}
```

- [ ] **Step 4: Service Worker を消してリロードし、掲載先の変更で手動調整が残ることを確認する**

Task 0 Step 3 のスクリプトを実行してから `location.reload()`。リロード後に次を実行する。

```js
window.alert = () => {}; window.confirm = () => true;
localStorage.removeItem('palletApp.spaces');
location.reload();
```

リロード後:

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
// 手動調整を作る。applyMove の代わりに lastSp を直接いじって saveManual する。
// ここで見たいのは「手動調整の保存が残るか」であって、ドラッグ操作そのものではない。
lastSp[0].__probe = 'manual-marker';
saveManual();
const before = !!loadData('palletApp.manual');

// 掲載先だけを変える
const el = document.getElementById('cfgText');
el.value = spacesToText().replace('| 8,4 | bottom', '| 8,4 | top');
applyConfig();

const after = loadData('palletApp.manual');
({
  ok: before === true && !!after && after.sp[0].__probe === 'manual-marker'
   && sheetAreas('top').includes('PC横'),
  before, kept: !!after, probe: after && after.sp[0].__probe,
});
```

期待: `ok` が `true`。掲載先が `top` に変わったうえで、保存された手動調整が残っている。

- [ ] **Step 5: リロードしても手動調整が復元されることを確認する**

```js
location.reload();
```

リロード後:

```js
({
  ok: hasResult === true && !!lastSp && lastSp[0].__probe === 'manual-marker'
   && SPACES.find(s => s.name === 'PC横').sheet === 'top',
  probe: lastSp && lastSp[0].__probe,
  pcSheet: SPACES.find(s => s.name === 'PC横').sheet,
});
```

期待: `ok` が `true`。指紋が一致して `restoreManual()` が通っている。

- [ ] **Step 6: 列の高さを変えると手動調整が破棄されることを確認する**

```js
window.alert = () => {}; window.confirm = () => true;
const el = document.getElementById('cfgText');
el.value = spacesToText().replace('PC横 | near | h | 99 | 8,4', 'PC横 | near | h | 99 | 8,5');
applyConfig();
const raw = localStorage.getItem('palletApp.manual');
({
  ok: (raw === null || raw === 'null'),
  raw,
});
```

期待: `ok` が `true`。幾何が変わったので `run(false)` が走り、`clearManual()` で捨てられている。

- [ ] **Step 7: 後始末**

```js
window.alert = () => {}; window.confirm = () => true;
resetConfig();
localStorage.removeItem('palletApp.manual');
localStorage.removeItem('palletApp.spaces');
({ ok: true });
```

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "fix: 掲載先だけを変えたときに手動調整を捨てないようにする"
```

---

## Task 5: キャッシュのバージョンを上げて通しで確認する

**Files:**
- Modify: `files/sw.js`（6 行目）

**Interfaces:**
- Consumes: Task 1 から 4 までのすべて

- [ ] **Step 1: `CACHE_VERSION` を上げる**

`files/sw.js` の 6 行目を次に置き換える。

```js
const CACHE_VERSION = "v19";
```

- [ ] **Step 2: 保存を全部消して、まっさらな状態から通しで確認する**

Task 0 Step 3 のスクリプトを実行してから次を実行する。

```js
localStorage.clear();
location.reload();
```

リロード後、設計書 §13 の完了判定を順に確認する。

```js
window.alert = () => {}; window.confirm = () => true;
loadSample('basic');
run(false);
const el = document.getElementById('cfgText');

// 1. 新しいエリアを bottom で足すと下段に出る
el.value = spacesToText() + '\n倉庫裏 | near | h | 99 | 4,4 | bottom';
applyConfig();
const t1 = sheetAreas('bottom').includes('倉庫裏') && SPACES.length === 6;

// 2. top に変えると上段に出る
el.value = spacesToText().replace('倉庫裏 | near | h | 99 | 4,4 | bottom', '倉庫裏 | near | h | 99 | 4,4 | top');
applyConfig();
const t2 = sheetAreas('top').includes('倉庫裏');

// 3. over にすると表に出ず、警告が出る（荷物が置かれている場合）
el.value = spacesToText().replace('| 4,4 | top', '| 4,4 | over');
applyConfig();
const t3 = sheetAreas('over').includes('倉庫裏')
        && !sheetAreas('top').includes('倉庫裏')
        && !sheetAreas('bottom').includes('倉庫裏');

// 9. 6 項目目を省略しても掲載先が変わらない
el.value = spacesToText(false);
applyConfig();
const t9 = SPACES.find(s => s.name === '倉庫裏').sheet === 'over';

({ ok: t1 && t2 && t3 && t9, t1, t2, t3, t9 });
```

期待: `ok` が `true`。

- [ ] **Step 3: 4 と 5（保存とリセット）を確認する**

```js
location.reload();
```

リロード後:

```js
window.alert = () => {}; window.confirm = () => true;
const t4 = SPACES.length === 6 && SPACES.find(s => s.name === '倉庫裏').sheet === 'over';
resetConfig();
const t5 = SPACES.length === 5 && !SPACES.some(s => s.name === '倉庫裏');
({ ok: t4 && t5, t4, t5 });
```

期待: `ok` が `true`。

- [ ] **Step 4: 印刷レイアウトが壊れていないことを目で確認する**

配置表タブを開き、既定の設定でスクリーンショットを撮る。
上段 4 欄・下段 7 欄の見た目が改修前と変わっていないことを確認する。

```js
switchTab('sheet');
({ ok: !!document.querySelector('#sheetView .sheet') });
```

`mcp__Claude_Browser__computer` の `screenshot` で見た目を確認する。

- [ ] **Step 5: コミット**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v19 に上げる"
```

---

## 完了後にやること

1. 設計書 §13 の完了判定 6・7・8 は Task 3 と Task 4 で確認済み。
   通しでもう一度確認したい場合は Task 4 Step 4 から Step 6 を再実行する。
2. `superpowers:finishing-a-development-branch` スキルで `main` への統合方法を決める。
3. このタスクの後、メモ §4 の実装順序に戻る。次は「場所の洗い出し → `DEFAULT_SPACES` を更新」。
   `DEFAULT_SPACES` を更新するときは `SPACES_SAVE_VERSION` を 2 に上げること。
