# 操作マニュアル 11ページ版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codex版10ページのマニュアルを、現行アプリの実画面とユーザーの手動配置で11ページ版として作り直し、状態生成・撮影・組版・PDF化をコマンドで再実行できるようにする。

**Architecture:** `manual/` に、状態ファイルの生成（`make-states.cjs`）、Playwright による撮影（`capture.cjs` と `capture/*.cjs`）、ページ別HTMLの組版（`build.cjs`）、PDF化と紙面検査（`render.cjs`）を置く。本文の原本は `manual/pages/pNN.html`。撮影は保存データを `localStorage` に入れてアプリを開き、画面操作は最小限にする。確認ダイアログの文言は撮影時に記録し、組版時に「画面例」として差し込む。

**Tech Stack:** Node.js 22（CommonJS）、`playwright-core`（導入済み）＋インストール済み Google Chrome、`node:test`、macOS の `sips`（PDF→PNG）

**Spec:** `docs/superpowers/specs/2026-09-24-manual-11pages-design.md`

## Global Constraints

- アプリ本体（`files/`）は変更しない。`files/sw.js` の `CACHE_VERSION` も上げない。
- 図はすべてアプリの実画面。模式図（「●」の並び、AAA/BBB の文字図）を作らない。
- 見出しの番号は普通の数字（`4.2`）。図と対応する操作手順だけ丸数字（①②③）。
- 本文の文字サイズを縮めてページに収めない。収まらなければ画像の最大高さ（`h40`〜`h115` クラス）を変えるか、止めて相談する。
- デモの日付は 2026-09-25（金）あさ。合計は仮伝票の段階で 101P、受領後 100P。
- 状態ファイルの設定: `palletApp.frac`=ON、`palletApp.splitConfirm`=ON、`palletApp.halfManual`=OFF（P7 の撮影場面だけ ON）。
- 品目の並び順は書き出しデータ（`manual/state/source-export.json`）のまま変えない。変えると手動配置が復元されない。
- 伝票の分け方: FAX①=[0]、FAX②=[1]、FAX③=[2,3,4]、FAX④=[5,6,7]、FAX⑤=[8,9]（書き出しデータの品目の添字）。
- 確認ダイアログ（`confirm()`）は画像に写らない。文言は撮影時に記録し、`build.cjs` が「画面例：確認ダイアログ（見た目はブラウザによって異なります）」として組む。文言を手で書き写さない。
- 撮影は `serviceWorkers:'block'` のコンテキストで行う。タブはボタン（`#tabbtn-input` など）を押して切り替えてから撮る。
- 戻す・進むの表記は「戻す」「進む」（矢印ボタン ↪ ↩）。「元に戻す」「やり直す」と書かない。
- 移動の説明は「移動先の列の空きに入る枚数を選んでから移動する。選んだ枚数が空きより多い列には移動できない」。
- Codex版の `outputs/manual-*`、`docs/manual-*.md` は変更・削除しない。
- マニュアル本文（pages/*.html）とコメントは通常の日本語で書く。
- コミットメッセージは既存の形式（`docs:` / `feat:` など＋日本語）で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` を付ける。

## 実行前の注意（全タスク共通）

- 作業はブランチ `feat/manual-11pages` で行う（main に直接コミットしない。GitHub Pages は main への push ごとにデプロイされるため）。Task 1 の最初に作る。
- `manual/dist/`（PDF・画像を埋め込んだ HTML・プレビュー画像・検証結果）は **Task 8 の最後に1回だけ** コミットする。途中のタスクでは `git add` しない。途中のレビューでは PDF をファイルとしてユーザーに直接送る。
- `manual/assets/`（撮影した画像）は各タスクでコミットする。

- コマンドはリポジトリのルート（`/Users/kenichihanada/web-app/pallet-layout`）で実行する。`npm` は `--prefix manual` を付ける。
- 撮影は1回数十秒かかる。失敗したら `dist/verification.json` と例外メッセージを読み、計画外の変更が必要なら止めて報告する。
- 画像を見て確認する手順では、Read ツールで PNG を開いて目視する。

---

### Task 1: manual/ の骨組みと共通処理

**Files:**
- Move: `pallet-state-manual.json` → `manual/state/source-export.json`
- Modify: `.gitignore`
- Modify: `manual/package.json`（導入済み。scripts を追加）
- Create: `manual/lib/paths.cjs`
- Create: `manual/lib/verify.cjs`
- Create: `manual/lib/scene.cjs`
- Create: `manual/test/verify.test.cjs`

**Interfaces:**
- Produces:
  - `paths.cjs`: `{MANUAL, ROOT, APP_URL, STATE, ASSETS, DIST, PAGES}`（すべて絶対パス文字列。`APP_URL` は `file://…/files/index.html`）
  - `verify.cjs`: `expect(ok:boolean, msg:string, detail?:any):void`（false なら Error を投げる）、`record(group:string, data:object):void`（`dist/verification.json` の `group` キーを上書き保存）、`load():object`、`FILE:string`
  - `scene.cjs`: `launch():Promise<Browser>`、`loadState(name:string):object`、`openScene(browser,{state, viewport?, tab?}):Promise<{context,page,dialogs:string[]}>`、`gotoTab(page, name:'入力'|'配置編集'|'配置図'|'設定')`、`shot(page,name,selector)`、`clipShot(page,name,rect)`、`unionRect(page, selector, pad?):Promise<{x,y,width,height}>`、`inputInfo(page):Promise<{total:number, slipCount:string, fp:string}>`、`mainSig(sp:Array):string[]`、`appMainSig(page):Promise<string[]|null>`

- [ ] **Step 1: ブランチを作り、書き出しデータを移し、.gitignore を整える**

```bash
git switch -c feat/manual-11pages
mkdir -p manual/state manual/lib manual/test manual/capture manual/pages manual/assets manual/dist
mv pallet-state-manual.json manual/state/source-export.json
printf '\n# 操作マニュアルの制作用\nmanual/node_modules/\n' >> .gitignore
git status --short
```

Expected: `pallet-state-manual.json` が消え、`manual/` と `.gitignore` の変更が出る。

- [ ] **Step 2: package.json に scripts を足す**

`manual/package.json` を次の内容にする（`devDependencies` のバージョンは現在のファイルの値を残す）。

```json
{
  "name": "pallet-layout-manual",
  "private": true,
  "description": "操作マニュアルの撮影・組版・PDF化",
  "scripts": {
    "test": "node --test test/",
    "states": "node make-states.cjs",
    "capture": "node capture.cjs",
    "build": "node build.cjs",
    "render": "node render.cjs",
    "all": "npm run states && npm run capture && npm run build && npm run render"
  },
  "devDependencies": {
    "playwright-core": "（現在の値のまま）"
  }
}
```

- [ ] **Step 3: 失敗するテストを書く**

`manual/test/verify.test.cjs`:

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

test('expect は条件が偽なら詳細付きで例外を投げる',()=>{
  const {expect}=require('../lib/verify.cjs');
  assert.doesNotThrow(()=>expect(true,'ok'));
  assert.throws(()=>expect(false,'合計が違う',{got:99}),/合計が違う \{"got":99\}/);
});

test('record はグループ単位で上書きし、他のグループを残す',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-verify-'));
  process.env.MANUAL_DIST=dir;
  delete require.cache[require.resolve('../lib/paths.cjs')];
  delete require.cache[require.resolve('../lib/verify.cjs')];
  const V=require('../lib/verify.cjs');
  V.record('input',{a:1});
  V.record('edit',{b:2});
  V.record('input',{a:3});
  assert.deepEqual(V.load(),{input:{a:3},edit:{b:2}});
  delete process.env.MANUAL_DIST;
  delete require.cache[require.resolve('../lib/paths.cjs')];
  delete require.cache[require.resolve('../lib/verify.cjs')];
});

test('paths は manual/ とリポジトリのルートを指す',()=>{
  const P=require('../lib/paths.cjs');
  assert.ok(fs.existsSync(path.join(P.ROOT,'files','index.html')));
  assert.equal(path.basename(P.MANUAL),'manual');
  assert.ok(P.APP_URL.startsWith('file://')&&P.APP_URL.endsWith('/files/index.html'));
});
```

- [ ] **Step 4: テストが失敗することを確かめる**

Run: `npm --prefix manual test`
Expected: FAIL（`Cannot find module '../lib/verify.cjs'`）

- [ ] **Step 5: paths.cjs と verify.cjs を書く**

`manual/lib/paths.cjs`:

```js
// マニュアル制作で使う場所。テストでは MANUAL_DIST で出力先を差し替える
const path=require('node:path');
const MANUAL=path.resolve(__dirname,'..');
const ROOT=path.resolve(MANUAL,'..');
module.exports={
  MANUAL,
  ROOT,
  APP_URL:'file://'+path.join(ROOT,'files','index.html'),
  STATE:path.join(MANUAL,'state'),
  ASSETS:path.join(MANUAL,'assets'),
  DIST:process.env.MANUAL_DIST||path.join(MANUAL,'dist'),
  PAGES:path.join(MANUAL,'pages'),
};
```

`manual/lib/verify.cjs`:

```js
// 撮影時の検証。食い違いは例外で止め、結果は dist/verification.json に残す
const fs=require('node:fs');
const path=require('node:path');
const P=require('./paths.cjs');
const FILE=path.join(P.DIST,'verification.json');

function load(){
  try{ return JSON.parse(fs.readFileSync(FILE,'utf8')); }catch{ return {}; }
}
function record(group,data){
  fs.mkdirSync(P.DIST,{recursive:true});
  const all=load();
  all[group]=data;
  fs.writeFileSync(FILE,JSON.stringify(all,null,2)+'\n');
}
function expect(ok,msg,detail){
  if(!ok) throw new Error(msg+(detail===undefined?'':' '+JSON.stringify(detail)));
}
module.exports={expect,record,load,FILE};
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `npm --prefix manual test`
Expected: PASS（3 tests）

- [ ] **Step 7: scene.cjs を書く**

`manual/lib/scene.cjs`:

```js
// アプリを保存データ付きで開き、撮影する共通処理。
// ・Service Worker は止める（cache-first で古い index.html を返すため）
// ・保存データは最初の読み込みの前に1回だけ入れる（アプリは保存が無いとサンプルを自動で読む）
// ・confirm() は文言を記録してから承諾する（画像に写らないので本文で「画面例」にする）
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');
const P=require('./paths.cjs');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TAB_ID={'入力':'input','配置編集':'edit','配置図':'sheet','設定':'settings'};

function launch(){
  return chromium.launch({headless:true,executablePath:CHROME});
}
function loadState(name){
  return JSON.parse(fs.readFileSync(path.join(P.STATE,name),'utf8'));
}
async function openScene(browser,{state,viewport={width:1000,height:950},tab=null}){
  const context=await browser.newContext({viewport,deviceScaleFactor:2,serviceWorkers:'block'});
  await context.addInitScript(data=>{
    if(sessionStorage.getItem('manual-seeded')) return;
    localStorage.clear();
    for(const [k,v] of Object.entries(data)) localStorage.setItem(k,v);
    sessionStorage.setItem('manual-seeded','1');
  },state);
  const page=await context.newPage();
  const dialogs=[];
  page.on('dialog',async d=>{ dialogs.push(d.message()); await d.accept(); });
  await page.goto(P.APP_URL);
  // 起動時の描画は非同期。結果の復元を待つ
  await page.waitForFunction(()=>typeof hasResult!=='undefined');
  await page.waitForTimeout(600);
  if(tab) await gotoTab(page,tab);
  return {context,page,dialogs};
}
async function gotoTab(page,name){
  const id=TAB_ID[name];
  if(!id) throw new Error('不明なタブ: '+name);
  await page.locator('#tabbtn-'+id).click();
  await page.waitForTimeout(500);
}
function assetPath(name){
  fs.mkdirSync(P.ASSETS,{recursive:true});
  return path.join(P.ASSETS,name+'.png');
}
async function settle(page){
  await page.evaluate(()=>{ const a=document.activeElement; if(a&&a.blur) a.blur(); });
  await page.mouse.move(0,0);
  await page.waitForTimeout(150);
}
async function shot(page,name,selector){
  const el=page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await settle(page);
  await el.screenshot({path:assetPath(name)});
}
// rect はページ座標（スクロール量を足した値）
async function clipShot(page,name,rect){
  await settle(page);
  await page.screenshot({path:assetPath(name),clip:rect,fullPage:true});
}
async function unionRect(page,selector,pad=2){
  const r=await page.locator(selector).evaluateAll(els=>{
    if(!els.length) return null;
    const rs=els.map(e=>e.getBoundingClientRect());
    const x=Math.min(...rs.map(v=>v.left)), y=Math.min(...rs.map(v=>v.top));
    const right=Math.max(...rs.map(v=>v.right)), bottom=Math.max(...rs.map(v=>v.bottom));
    return {x:x+scrollX,y:y+scrollY,width:right-x,height:bottom-y};
  });
  if(!r) throw new Error('要素がありません: '+selector);
  return {x:r.x-pad,y:r.y-pad,width:r.width+pad*2,height:r.height+pad*2};
}
async function inputInfo(page){
  return page.evaluate(()=>({
    total:readLots().lots.reduce((n,l)=>n+l.pallets,0),
    slipCount:document.querySelector('#slipCount').innerText.trim(),
    fp:inputFingerprint(),
  }));
}
function mainSig(sp){
  const main=sp.find(s=>s.name==='メイン');
  return main.cols.map(c=>c.fills.map(f=>f.id+':'+f.count).join(','));
}
async function appMainSig(page){
  return page.evaluate(()=>{
    if(!lastSp) return null;
    const main=lastSp.find(s=>s.name==='メイン');
    return main.cols.map(c=>c.fills.map(f=>f.id+':'+f.count).join(','));
  });
}
module.exports={launch,loadState,openScene,gotoTab,shot,clipShot,unionRect,inputInfo,mainSig,appMainSig};
```

- [ ] **Step 8: Chrome が起動することを確かめる**

Run: `node -e "require('./manual/lib/scene.cjs').launch().then(async b=>{console.log(b.version());await b.close()})"`
Expected: `153.` で始まるバージョンが出る。

- [ ] **Step 9: Commit**

```bash
git add .gitignore manual/package.json manual/package-lock.json manual/state/source-export.json manual/lib manual/test
git commit -m "feat: 操作マニュアル制作の骨組みと共通処理を追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 状態ファイルの生成と、手動配置が復元されることの検証

**Files:**
- Create: `manual/lib/states.cjs`
- Create: `manual/make-states.cjs`
- Create: `manual/test/states.test.cjs`
- Create: `manual/state/s1-planned.json`, `manual/state/s2-final.json`（生成物）
- Create: `manual/capture.cjs`
- Create: `manual/capture/states.cjs`

**Interfaces:**
- Consumes: Task 1 の `scene.cjs`・`verify.cjs`・`paths.cjs`
- Produces:
  - `states.cjs`: `SLIP_GROUPS:number[][]`、`makeFinal(src:object):object`、`makePlanned(src:object):object`、`stripManual(state:object):object`、`withSettings(state:object, over:object):object`（いずれも新しいオブジェクトを返し、引数を変更しない。state は `{"palletApp.xxx": string}` 形式）
  - `capture.cjs`: `node capture.cjs [states|input|edit|sheet|all]`。グループは `capture/<name>.cjs` の `module.exports=async function(browser)` を遅延 require で呼ぶ
  - `dist/verification.json` の `states` キー: `{s2:{total,slipCount,mainRestored:true}, s1:{total,slipCount}, received:{total,slipCount,fpMatchesS2:true}, app:{cacheVersion:string, commit:string}}`

- [ ] **Step 1: 失敗するテストを書く**

`manual/test/states.test.cjs`:

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../lib/states.cjs');
const src=JSON.parse(fs.readFileSync(path.join(__dirname,'..','state','source-export.json'),'utf8'));
const sched=st=>JSON.parse(st['palletApp.schedule']);
const flat=st=>sched(st).shifts.am.slips.flatMap(s=>s.items);
const srcItems=JSON.parse(src['palletApp.schedule']).shifts.am.slips[0].items;

test('s2 は伝票を5枚に分け、品目の並びと中身を変えない',()=>{
  const st=S.makeFinal(src);
  const slips=sched(st).shifts.am.slips;
  assert.equal(slips.length,5);
  assert.deepEqual(slips.map(s=>s.items.map(i=>i.lot)),[
    ['111'],['222'],['111-1111','111-1112','111-1113'],['222-2222','222-2223','333-3333'],['333-3334','444-4444'],
  ]);
  assert.ok(slips.every(s=>s.status==='fax'));
  assert.deepEqual(flat(st),srcItems);
  assert.ok(sched(st).shifts.am.manual,'手動配置が残る');
  assert.ok(sched(st).shifts.am.result,'自動配置の結果が残る');
});

test('s1 は FAX⑤ を仮伝票にし、仕掛品4 を予定の 28500 にして配置を持たない',()=>{
  const st=S.makePlanned(src);
  const am=sched(st).shifts.am;
  assert.equal(am.slips[4].status,'provisional');
  assert.ok(am.slips.slice(0,4).every(s=>s.status==='fax'));
  const p4=flat(st).find(i=>i.lot==='444-4444');
  assert.equal(p4.qty,'28500');
  assert.equal(am.result,null);
  assert.equal(am.manual,null);
  assert.equal(am.resultFingerprint,null);
  assert.deepEqual(am.sheetEdits,{sig:'',marks:{}});
  // 品目IDと並びは s2 と同じ（受領後に指紋が一致するため）
  assert.deepEqual(flat(st).map(i=>i.id),srcItems.map(i=>i.id));
});

test('設定は 半表示 ON・分割確認 ON・半手動 OFF に固定する',()=>{
  for(const st of [S.makeFinal(src),S.makePlanned(src)]){
    assert.equal(st['palletApp.frac'],'true');
    assert.equal(st['palletApp.splitConfirm'],'true');
    assert.equal(st['palletApp.halfManual'],'false');
  }
});

test('stripManual は手動配置だけを外す',()=>{
  const st=S.stripManual(S.makeFinal(src));
  const am=sched(st).shifts.am;
  assert.equal(am.manual,null);
  assert.ok(am.result);
});

test('withSettings は指定したキーだけ変え、元を変更しない',()=>{
  const base=S.makeFinal(src);
  const st=S.withSettings(base,{'palletApp.halfManual':'true'});
  assert.equal(st['palletApp.halfManual'],'true');
  assert.equal(base['palletApp.halfManual'],'false');
});

test('書き出しデータが想定と違えば止める',()=>{
  const bad={...src,'palletApp.schedule':JSON.stringify({version:1,shifts:{am:{slips:[{items:[]}]}}})};
  assert.throws(()=>S.makeFinal(bad),/10品目/);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm --prefix manual test`
Expected: FAIL（`Cannot find module '../lib/states.cjs'`）

- [ ] **Step 3: states.cjs を書く**

`manual/lib/states.cjs`:

```js
// 書き出しデータ（palletApp.* の localStorage）から撮影用の状態を作る。
// 品目の並び順を変えると lot の id がずれ、手動配置が復元されない（設計書 4-4）
const SLIP_GROUPS=[[0],[1],[2,3,4],[5,6,7],[8,9]];
const EXPECTED_LOTS=['111','222','111-1111','111-1112','111-1113','222-2222','222-2223','333-3333','333-3334','444-4444'];
const SETTINGS={'palletApp.frac':'true','palletApp.splitConfirm':'true','palletApp.halfManual':'false'};

const clone=o=>JSON.parse(JSON.stringify(o));

function sourceItems(src){
  const sch=JSON.parse(src['palletApp.schedule']);
  const slips=sch.shifts.am.slips;
  const items=slips.flatMap(s=>s.items);
  const lots=items.map(i=>i.lot);
  if(items.length!==10 || lots.join()!==EXPECTED_LOTS.join()){
    throw new Error('書き出しデータが想定の10品目と違います: '+lots.join(','));
  }
  return {sch,items};
}
function splitSlips(items,status){
  return SLIP_GROUPS.map((g,i)=>({
    id:'s-manual-'+(i+1),
    status:status(i),
    items:g.map(k=>clone(items[k])),
  }));
}
function withSettings(state,over){
  return {...state,...over};
}
function makeFinal(src){
  const {sch,items}=sourceItems(src);
  const next=clone(sch);
  next.shifts.am.slips=splitSlips(items,()=>'fax');
  return withSettings({...src,'palletApp.schedule':JSON.stringify(next)},SETTINGS);
}
function makePlanned(src){
  const {sch,items}=sourceItems(src);
  const next=clone(sch);
  const am=next.shifts.am;
  am.slips=splitSlips(items,i=>i===4?'provisional':'fax');
  am.slips[4].items.find(i=>i.lot==='444-4444').qty='28500';
  am.result=null;
  am.manual=null;
  am.resultFingerprint=null;
  am.blocked=[];
  am.sheetEdits={sig:'',marks:{}};
  return withSettings({...src,'palletApp.schedule':JSON.stringify(next)},SETTINGS);
}
function stripManual(state){
  const sch=JSON.parse(state['palletApp.schedule']);
  sch.shifts.am.manual=null;
  return {...state,'palletApp.schedule':JSON.stringify(sch)};
}
module.exports={SLIP_GROUPS,makeFinal,makePlanned,stripManual,withSettings};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm --prefix manual test`
Expected: PASS（verify 3 ＋ states 6）

- [ ] **Step 5: make-states.cjs を書いて状態ファイルを作る**

`manual/make-states.cjs`:

```js
// state/source-export.json → s1-planned.json / s2-final.json
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const S=require('./lib/states.cjs');
const src=JSON.parse(fs.readFileSync(path.join(P.STATE,'source-export.json'),'utf8'));
const write=(name,obj)=>fs.writeFileSync(path.join(P.STATE,name),JSON.stringify(obj,null,1)+'\n');
write('s1-planned.json',S.makePlanned(src));
write('s2-final.json',S.makeFinal(src));
console.log('states: s1-planned.json, s2-final.json');
```

Run: `npm --prefix manual run states`
Expected: `states: s1-planned.json, s2-final.json`

- [ ] **Step 6: capture.cjs と states グループを書く**

`manual/capture.cjs`:

```js
// 撮影。node capture.cjs [states|input|edit|sheet|all]
const {launch}=require('./lib/scene.cjs');
const ORDER=['states','input','edit','sheet'];
(async()=>{
  const arg=process.argv[2]||'all';
  const names=arg==='all'?ORDER:[arg];
  for(const n of names) if(!ORDER.includes(n)) throw new Error('不明なグループ: '+n);
  const browser=await launch();
  try{
    for(const n of names){
      console.log('capture:',n);
      await require('./capture/'+n+'.cjs')(browser);
    }
  }finally{
    await browser.close();
  }
})().catch(e=>{ console.error(e); process.exit(1); });
```

`manual/capture/states.cjs`:

```js
// 状態ファイルがアプリで想定どおりに開くかを確かめる（撮影はしない）
const fs=require('node:fs');
const path=require('node:path');
const P=require('../lib/paths.cjs');
const {openScene,loadState,inputInfo,mainSig,appMainSig,gotoTab}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');

module.exports=async function(browser){
  const src=JSON.parse(fs.readFileSync(path.join(P.STATE,'source-export.json'),'utf8'));
  const manualSp=JSON.parse(src['palletApp.schedule']).shifts.am.manual.sp;
  const out={};

  // s2: 手動配置が復元され、100P・FAX5枚
  let sc=await openScene(browser,{state:loadState('s2-final.json'),tab:'入力'});
  const s2=await inputInfo(sc.page);
  expect(s2.total===100,'s2 の合計が100Pではない',s2);
  expect(s2.slipCount==='FAX伝票 5枚 ／ 仮 0件','s2 の伝票枚数',s2.slipCount);
  const sig=await appMainSig(sc.page);
  expect(JSON.stringify(sig)===JSON.stringify(mainSig(manualSp)),'s2 で手動配置が復元されていない',{app:sig,want:mainSig(manualSp)});
  out.s2={total:s2.total,slipCount:s2.slipCount,mainRestored:true};
  await sc.context.close();

  // s1: 101P・FAX4枚＋仮1件。受領操作後に指紋が s2 と一致する
  sc=await openScene(browser,{state:loadState('s1-planned.json'),tab:'入力'});
  const s1=await inputInfo(sc.page);
  expect(s1.total===101,'s1 の合計が101Pではない',s1);
  expect(s1.slipCount==='FAX伝票 4枚 ／ 仮 1件','s1 の伝票枚数',s1.slipCount);
  out.s1={total:s1.total,slipCount:s1.slipCount};
  const prov=sc.page.locator('#slipList .slip').last();
  const qty=prov.locator('tbody tr').last().locator('input').nth(3);
  await qty.fill('27000');
  await qty.press('Tab');
  await prov.getByRole('button',{name:'FAX受領済みにする',exact:true}).click();
  await sc.page.waitForTimeout(300);
  const rec=await inputInfo(sc.page);
  expect(rec.total===100,'受領後の合計が100Pではない',rec);
  expect(rec.slipCount==='FAX伝票 5枚 ／ 仮 0件','受領後の伝票枚数',rec.slipCount);
  expect(rec.fp===s2.fp,'受領後の入力の指紋が s2 と一致しない',{received:rec.fp,s2:s2.fp});
  out.received={total:rec.total,slipCount:rec.slipCount,fpMatchesS2:true};
  await sc.context.close();

  // どのアプリ版で撮ったかを残す（アプリ更新でマニュアルが古くなったことに気づくため）
  const {execFileSync}=require('node:child_process');
  const sw=fs.readFileSync(path.join(P.ROOT,'files','sw.js'),'utf8');
  out.app={
    cacheVersion:(/CACHE_VERSION\s*=\s*"([^"]+)"/.exec(sw)||[])[1]||null,
    commit:execFileSync('git',['-C',P.ROOT,'log','-1','--format=%h','--','files/']).toString().trim(),
  };
  expect(!!out.app.cacheVersion,'files/sw.js の CACHE_VERSION が読めない');
  record('states',out);
};
```

- [ ] **Step 7: 検証を走らせる**

Run: `node manual/capture.cjs states && cat manual/dist/verification.json`
Expected: 例外なし。`states.s2.mainRestored: true`、`states.s1.total: 101`、`states.received.fpMatchesS2: true`、`states.app.cacheVersion`（2026-09-24 時点 `v76`）と `states.app.commit`。

失敗したとき: `受領後の入力の指紋が s2 と一致しない` なら、受領で品目IDか並びが変わっている。数量欄の位置（`input` の nth(3)）が個数欄でない可能性もあるので、`prov.locator('tbody tr').last().locator('input')` の各 `value` を出して確かめる。計画外の対応が要るなら止めて報告する。

- [ ] **Step 8: Commit**

```bash
git add manual/lib/states.cjs manual/make-states.cjs manual/test/states.test.cjs manual/state manual/capture.cjs manual/capture/states.cjs
git commit -m "feat: マニュアル用の状態ファイルを生成し、手動配置の復元を検証する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 組版（build）と PDF化（render）

**Files:**
- Create: `manual/lib/build-lib.cjs`
- Create: `manual/test/build-lib.test.cjs`
- Create: `manual/build.cjs`
- Create: `manual/render.cjs`
- Create: `manual/style.css`

**Interfaces:**
- Consumes: Task 1 の `paths.cjs`・`verify.cjs`・`scene.cjs`（`launch`）
- Produces:
  - `build-lib.cjs`: `parsePage(text, file):{meta:{title,lead,tab,cls},body}`、`renderPage(page, index, total, footer):string`、`fillDialogs(html, dialogs:{[key]:string}):string`、`embedAssets(html, baseDir):string`、`buildHtml(pages, {css, footer}):string`、`esc(s):string`
  - ページ断片の書式: 先頭行 `<!--page {"title":"…","lead":"…","tab":"入力|配置編集|配置図|（空）","cls":"（任意のクラス）"} -->`、以降が本文HTML
  - 画面例の差し込み口: `<div class="dialog-example" data-dialog="register"></div>` / `data-dialog="split"`
  - `dist/操作マニュアル.html`、`dist/操作マニュアル.pdf`、`dist/layout-check.json`（`[{page, spaceToFooter, images}]`）、`dist/preview/pNN.png`
  - `render.cjs` は、いずれかのページで `spaceToFooter<0` または `images:false` なら終了コード1

- [ ] **Step 1: 失敗するテストを書く**

`manual/test/build-lib.test.cjs`:

```js
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const B=require('../lib/build-lib.cjs');

test('parsePage は先頭のメタ情報と本文を分ける',()=>{
  const p=B.parsePage('<!--page {"title":"3. 入力（1）","lead":"リード","tab":"入力"} -->\n<p>本文</p>\n','p03.html');
  assert.deepEqual(p.meta,{tab:'入力',cls:'',title:'3. 入力（1）',lead:'リード'});
  assert.equal(p.body,'<p>本文</p>\n');
});

test('parsePage はメタ情報が無ければファイル名付きで止める',()=>{
  assert.throws(()=>B.parsePage('<p>本文</p>','p05.html'),/p05\.html/);
  assert.throws(()=>B.parsePage('<!--page {"lead":"x"} -->','p06.html'),/p06\.html: title/);
});

test('renderPage は章の位置・見出し・ページ番号を付ける',()=>{
  const html=B.renderPage({meta:{title:'T',lead:'L',tab:'配置図',cls:'dense'},body:'<p>b</p>'},8,11,'フッター');
  assert.match(html,/<article class="page dense" id="p8">/);
  assert.match(html,/入力 → 配置編集 → <span class="active">配置図<\/span>/);
  assert.match(html,/<h1>T<\/h1><p class="lead">L<\/p><p>b<\/p>/);
  assert.match(html,/<span>8 \/ 11<\/span>/);
});

test('fillDialogs は記録した文言を画面例にし、改行を保ち、HTMLを無害化する',()=>{
  const out=B.fillDialogs('<div class="dialog-example" data-dialog="split"></div>',{split:'A <b> が\n2か所'});
  assert.match(out,/画面例：確認ダイアログ（見た目はブラウザによって異なります）/);
  assert.match(out,/A &lt;b&gt; が<br>2か所/);
});

test('fillDialogs は文言が無ければ止める',()=>{
  assert.throws(()=>B.fillDialogs('<div class="dialog-example" data-dialog="register"></div>',{}),/register/);
});

test('embedAssets は画像を data URI にし、無ければ止める',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-build-'));
  fs.mkdirSync(path.join(dir,'assets'));
  fs.writeFileSync(path.join(dir,'assets','a.png'),Buffer.from([1,2,3]));
  assert.equal(B.embedAssets('<img src="assets/a.png">',dir),'<img src="data:image/png;base64,AQID">');
  assert.throws(()=>B.embedAssets('<img src="assets/none.png">',dir),/none\.png/);
});

test('buildHtml はページ数ぶんの目次リンクとページを並べる',()=>{
  const pages=[1,2].map(i=>({meta:{title:'T'+i,lead:'',tab:'',cls:''},body:''}));
  const html=B.buildHtml(pages,{css:'x{}',footer:'F'});
  assert.match(html,/<a href="#p1">P1<\/a><a href="#p2">P2<\/a>/);
  assert.equal((html.match(/<article /g)||[]).length,2);
  assert.match(html,/<span>2 \/ 2<\/span>/);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm --prefix manual test`
Expected: FAIL（`Cannot find module '../lib/build-lib.cjs'`）

- [ ] **Step 3: build-lib.cjs を書く**

`manual/lib/build-lib.cjs`:

```js
// ページ別HTML（pages/pNN.html）を1冊にまとめる部品
const fs=require('node:fs');
const path=require('node:path');
const CHAPTERS=['入力','配置編集','配置図'];

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function parsePage(text,file){
  const m=/^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/.exec(text);
  if(!m) throw new Error(file+': 先頭に <!--page {...} --> がありません');
  const meta=JSON.parse(m[1]);
  for(const k of ['title','lead']){
    if(typeof meta[k]!=='string') throw new Error(file+': '+k+' がありません');
  }
  return {meta:{tab:'',cls:'',...meta},body:text.slice(m[0].length)};
}
function renderPage({meta,body},index,total,footer){
  const nav=CHAPTERS.map(t=>t===meta.tab?`<span class="active">${t}</span>`:t).join(' → ');
  return `<article class="page ${meta.cls}" id="p${index}">`
    +`<div class="eyebrow"><span>パレット配置アプリ 操作マニュアル</span><span>${nav}</span></div>`
    +`<div class="content"><h1>${meta.title}</h1><p class="lead">${meta.lead}</p>${body}</div>`
    +`<footer class="footer"><span>${footer}</span><span>${index} / ${total}</span></footer></article>`;
}
// confirm() は画像に写らないので、撮影時に記録した文言から画面例を組む
function fillDialogs(html,dialogs){
  return html.replace(/<div class="dialog-example" data-dialog="([a-z]+)"><\/div>/g,(all,key)=>{
    const msg=dialogs[key];
    if(typeof msg!=='string'||!msg) throw new Error('確認ダイアログの文言がありません: '+key+'（先に capture を実行）');
    return '<div class="dialog-example">'
      +'<div class="dialog-title">画面例：確認ダイアログ（見た目はブラウザによって異なります）</div>'
      +`<div class="dialog-body">${esc(msg).replace(/\n/g,'<br>')}</div>`
      +'<div class="dialog-buttons"><span>キャンセル</span><span class="ok">OK</span></div></div>';
  });
}
function embedAssets(html,baseDir){
  return html.replace(/src="(assets\/[^"]+\.png)"/g,(all,rel)=>{
    const p=path.join(baseDir,rel);
    if(!fs.existsSync(p)) throw new Error('画像がありません: '+rel);
    return 'src="data:image/png;base64,'+fs.readFileSync(p).toString('base64')+'"';
  });
}
function buildHtml(pages,{css,footer}){
  const total=pages.length;
  const nav='<nav class="webnav">'+pages.map((_,i)=>`<a href="#p${i+1}">P${i+1}</a>`).join('')+'</nav>';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width, initial-scale=1">'
    +'<title>パレット配置アプリ 操作マニュアル</title><style>'+css+'</style></head><body>'
    +nav+pages.map((p,i)=>renderPage(p,i+1,total,footer)).join('')+'</body></html>';
}
module.exports={esc,parsePage,renderPage,fillDialogs,embedAssets,buildHtml};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm --prefix manual test`
Expected: PASS（verify 3 ＋ states 6 ＋ build-lib 7）

- [ ] **Step 5: build.cjs と render.cjs を書く**

`manual/build.cjs`:

```js
// pages/pNN.html ＋ style.css → dist/操作マニュアル.html（画像は埋め込み）
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const B=require('./lib/build-lib.cjs');
const V=require('./lib/verify.cjs');

const files=fs.readdirSync(P.PAGES).filter(f=>/^p\d\d\.html$/.test(f)).sort();
if(!files.length) throw new Error('pages/ にページがありません');
const pages=files.map(f=>B.parsePage(fs.readFileSync(path.join(P.PAGES,f),'utf8'),f));
const css=fs.readFileSync(path.join(P.MANUAL,'style.css'),'utf8');
const v=V.load();
const dialogs={...((v.input||{}).dialogs||{}),...((v.edit||{}).dialogs||{})};
const app=(v.states||{}).app||{};
if(!app.cacheVersion) throw new Error('アプリ版が未記録です（先に node capture.cjs states を実行）');
let html=B.buildHtml(pages,{css,footer:`PC操作用 ・ デモデータ使用 ／ 2026年9月版（アプリ ${app.cacheVersion}）`});
html=B.fillDialogs(html,dialogs);
html=B.embedAssets(html,P.MANUAL);
fs.mkdirSync(P.DIST,{recursive:true});
fs.writeFileSync(path.join(P.DIST,'操作マニュアル.html'),html);
console.log('build:',files.length,'pages');
```

`manual/render.cjs`:

```js
// dist/操作マニュアル.html → PDF、紙面検査（layout-check.json）、ページのプレビュー画像
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const {launch}=require('./lib/scene.cjs');

(async()=>{
  const browser=await launch();
  const page=await browser.newPage({viewport:{width:1000,height:1300},deviceScaleFactor:1});
  await page.goto('file://'+path.join(P.DIST,'操作マニュアル.html'));
  await page.evaluate(()=>document.fonts.ready);
  await page.emulateMedia({media:'print'});
  const layout=await page.locator('.page').evaluateAll(ps=>ps.map((e,i)=>{
    const c=e.querySelector('.content').getBoundingClientRect();
    const f=e.querySelector('.footer').getBoundingClientRect();
    return {page:i+1,spaceToFooter:Math.round(f.top-c.bottom),
      images:[...e.querySelectorAll('img')].every(x=>x.complete&&x.naturalWidth>0)};
  }));
  fs.writeFileSync(path.join(P.DIST,'layout-check.json'),JSON.stringify(layout,null,2)+'\n');
  const prev=path.join(P.DIST,'preview');
  fs.rmSync(prev,{recursive:true,force:true});
  fs.mkdirSync(prev,{recursive:true});
  const els=page.locator('.page');
  for(let i=0;i<layout.length;i++){
    await els.nth(i).screenshot({path:path.join(prev,'p'+String(i+1).padStart(2,'0')+'.png')});
  }
  await page.pdf({path:path.join(P.DIST,'操作マニュアル.pdf'),preferCSSPageSize:true,printBackground:true});
  await browser.close();
  console.log(JSON.stringify(layout));
  const bad=layout.filter(l=>l.spaceToFooter<0||!l.images);
  if(bad.length){ console.error('はみ出し・画像欠け:',JSON.stringify(bad)); process.exit(1); }
})().catch(e=>{ console.error(e); process.exit(1); });
```

- [ ] **Step 6: style.css を書く**

`manual/style.css`（Codex版の紙面を踏襲し、模式図用のクラスを除いた。`h40`〜`h115` は画像の最大高さ、`fit` は縦長の画像を中央寄せで縮めるときに使う）:

```css
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#e8ecee;color:#24313a;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;font-size:10.5pt;line-height:1.56}
.page{width:210mm;height:297mm;margin:20px auto;background:#fff;padding:12mm 16mm 15mm;position:relative;break-after:page;overflow:hidden}
.page:last-child{break-after:auto}
.eyebrow{font-size:8.7pt;color:#476070;letter-spacing:.035em;display:flex;justify-content:space-between;border-bottom:1px solid #bac7cb;padding-bottom:7px}
.active{font-weight:700;color:#155c63}
h1{font-size:24pt;line-height:1.2;margin:15px 0 7px}
h1 small{font-size:12pt;font-weight:500;color:#61717a;margin-left:6px}
h2{font-size:13pt;margin:14px 0 6px;color:#155c63}
p{margin:6px 0}
.lead{color:#55616b;margin-bottom:10px}
.intro{font-size:13pt;line-height:1.7}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;align-items:start}
.cols p,.cols3 p{margin-top:0}
.shot{display:block;width:100%;height:auto;border:1px solid #d5dddf;border-radius:4px}
.shot.fit{width:auto;max-width:100%;margin:0 auto;object-fit:contain}
.h40{max-height:40mm}.h50{max-height:50mm}.h60{max-height:60mm}.h70{max-height:70mm}
.h80{max-height:80mm}.h95{max-height:95mm}.h115{max-height:115mm}
figure{margin:7px 0}
figcaption,.caption{font-size:9pt;color:#536973;margin:4px 0;line-height:1.5}
.muted{font-size:9.5pt;color:#65757c}
.num{font-weight:700;color:#155c63}
.steps p{margin:5px 0}
.tbl{border-collapse:collapse;width:100%;font-size:10pt;margin:7px 0}
.tbl th{background:#edf3f3;color:#36565c;text-align:left;font-weight:600}
.tbl td,.tbl th{border-bottom:1px solid #d3dedf;padding:6px 9px;vertical-align:top}
.tbl td.r,.tbl th.r{text-align:right}
aside{background:#f0f5f4;border-left:3px solid #538d8b;padding:8px 12px;margin:9px 0;font-size:10pt}
aside.warn{background:#fdf6ec;border-left-color:#c98a2e}
.flow{display:flex;align-items:center;gap:10px;margin:12px 0}
.flow>div{flex:1;border:1px solid #a7c2c3;border-top:4px solid #548b8e;padding:12px 9px;text-align:center;background:#f8fbfb}
.flow b{display:block;font-size:15pt;color:#155c63}
.flow span{display:block;margin:6px 0;font-size:10pt}
.flow small{font-size:9pt;color:#596d73}
.flow i{font-style:normal;color:#77908e}
.inline-tool{display:flex;gap:14px;align-items:center;margin:7px 0}
.inline-tool img{width:40%}
.inline-tool p{font-size:9.5pt;margin:0}
/* アプリと同じく ↪ ↩ を180度回して、画面の矢印と向きを揃える */
.arrot{display:inline-block;transform:rotate(180deg)}
.dialog-example{border:1px solid #9aa9ae;border-radius:8px;background:#fafbfb;padding:10px 14px;margin:8px 0;font-size:10pt;box-shadow:2px 2px 0 #e2e8ea}
.dialog-title{font-size:8.5pt;color:#65757c;margin-bottom:6px}
.dialog-buttons{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.dialog-buttons span{border:1px solid #9aa9ae;border-radius:5px;padding:2px 14px;font-size:9pt;background:#fff}
.dialog-buttons .ok{background:#2563eb;border-color:#2563eb;color:#fff}
.checklist p{margin:7px 0}
.check-section{border-bottom:1px solid #c4d3d4;padding-bottom:10px;margin-bottom:10px}
.check-section h2 small{float:right;font-weight:400;color:#65757c;font-size:9pt;padding-top:4px}
.closing{font-size:15pt;color:#155c63;text-align:center;padding:12px 0}
.closing small{font-size:10pt;color:#65757c}
.footer{position:absolute;bottom:10mm;left:16mm;right:16mm;border-top:1px solid #bdc9cc;padding-top:6px;display:flex;justify-content:space-between;font-size:8pt;color:#60717a}
.webnav{max-width:210mm;margin:15px auto;font-size:10pt;display:flex;flex-wrap:wrap;gap:8px}
.webnav a{color:#155c63;background:#fff;padding:5px 10px;border-radius:3px;text-decoration:none}
@media print{body{background:#fff}.page{margin:0}.webnav{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
@media screen and (max-width:800px){.page{margin:0 auto 14px}}
```

- [ ] **Step 7: 仮のページで build と render が通ることを確かめる**

`manual/pages/p01.html` を一時的に次の内容で作る（Task 4 で本文に置き換える）。

```html
<!--page {"title":"1. はじめに","lead":"組版の確認用"} -->
<p>組版の確認用です。</p>
```

Run: `npm --prefix manual run build && npm --prefix manual run render`
Expected: `build: 1 pages`、続けて `[{"page":1,"spaceToFooter":…(正の数),"images":true}]`。`manual/dist/操作マニュアル.pdf` と `manual/dist/preview/p01.png` ができる。

- [ ] **Step 8: Commit**

```bash
git add manual/lib/build-lib.cjs manual/test/build-lib.test.cjs manual/build.cjs manual/render.cjs manual/style.css manual/pages/p01.html
git commit -m "feat: マニュアルのページ別HTMLを組版しPDF化する仕組みを追加する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: P1〜P4（はじめに・流れ・入力）の撮影と本文 ＋ ユーザーレビュー

**Files:**
- Create: `manual/capture/input.cjs`
- Create/Replace: `manual/pages/p01.html`〜`p04.html`
- Create: `manual/assets/*.png`（撮影物）

**Interfaces:**
- Consumes: Task 1〜3 のすべて
- Produces:
  - 画像: `sheet-final`, `sheet-item-group`, `tabs`, `input-head`, `input-actions`, `slip-fax1`, `slip-fax2`, `slip-fax3`, `setting-frac`, `slip-provisional`, `slip-provisional-fixed`, `input-head-confirmed`, `run-button`
  - `verification.json` の `input` キー: `{planned:{total:101,slipCount}, confirmed:{total:100,slipCount}, dialogs:{register:string}, itemGroupNames:string[]}`

- [ ] **Step 1: input グループを書く**

`manual/capture/input.cjs`:

```js
// P1〜P4 の撮影。s2 から完成図、s1 から入力の場面を撮る
const {openScene,loadState,gotoTab,shot,clipShot,inputInfo}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');

module.exports=async function(browser){
  const out={};

  // P1・P2: s2 の配置図
  let sc=await openScene(browser,{state:loadState('s2-final.json'),tab:'配置図'});
  await shot(sc.page,'sheet-final','#sheetView');
  // P2: 下段の見出し「仕掛品1」3欄と、その下のメイン列（品目の境目の太罫まで）
  out.itemGroupNames=await sc.page.evaluate(()=>[0,1,2].map(i=>
    document.querySelector(`#sheetView td[data-ek="bottom|${i}|name"]`).innerText.trim()));
  expect(out.itemGroupNames.every(n=>n==='仕掛品1'),'下段の先頭3欄が仕掛品1ではない',out.itemGroupNames);
  const rect=await sc.page.evaluate(()=>{
    const q=k=>document.querySelector(`#sheetView td[data-ek="${k}"]`).getBoundingClientRect();
    const a=q('bottom|0|name'), c=q('bottom|2|name'), d=q('bottom|3|name');
    const sv=document.querySelector('#sheetView').getBoundingClientRect();
    // 右端は4欄目の左端から少し入った位置まで（品目の境目の太罫を写す）
    return {x:a.left+scrollX-2,y:a.top+scrollY-2,width:(d.left+6)-a.left+2,height:sv.bottom-a.top+4};
  });
  await clipShot(sc.page,'sheet-item-group',rect);
  await gotoTab(sc.page,'入力');
  await shot(sc.page,'tabs','.tabs');
  await sc.context.close();

  // P3・P4: s1（FAX①〜④＋仮1件）
  sc=await openScene(browser,{state:loadState('s1-planned.json'),tab:'入力'});
  const planned=await inputInfo(sc.page);
  expect(planned.total===101,'s1 の合計が101Pではない',planned);
  expect(planned.slipCount==='FAX伝票 4枚 ／ 仮 1件','s1 の伝票枚数',planned.slipCount);
  out.planned={total:planned.total,slipCount:planned.slipCount};
  await shot(sc.page,'input-head','.input-head');
  await shot(sc.page,'input-actions','.input-add-actions');
  await shot(sc.page,'slip-fax1','#slipList .slip:nth-child(1)');
  await shot(sc.page,'slip-fax2','#slipList .slip:nth-child(2)');
  await shot(sc.page,'slip-fax3','#slipList .slip:nth-child(3)');
  await shot(sc.page,'slip-provisional','#slipList .slip:nth-child(5)');
  await shot(sc.page,'run-button','#runBtnInline');

  // 「半」表示の設定
  await gotoTab(sc.page,'設定');
  await sc.page.locator('#subtab-display').click();
  await shot(sc.page,'setting-frac','.cfgsec:has(#fracChk)');
  await gotoTab(sc.page,'入力');

  // 自動配置 → 未登録品目の登録確認（confirm。文言を記録）
  await sc.page.locator('#runBtnInline').click();
  await sc.page.waitForTimeout(800);
  const reg=sc.dialogs.find(m=>m.startsWith('次の品目が未登録です'));
  expect(!!reg,'未登録品目の確認が出ていない',sc.dialogs);
  out.dialogs={register:reg};

  // FAX⑤ 到着：仕掛品4 を 27000 に直して受領
  await gotoTab(sc.page,'入力');
  const prov=sc.page.locator('#slipList .slip').last();
  const qty=prov.locator('tbody tr').last().locator('input').nth(3);
  await qty.fill('27000');
  await qty.press('Tab');
  await shot(sc.page,'slip-provisional-fixed','#slipList .slip:last-child');
  await prov.getByRole('button',{name:'FAX受領済みにする',exact:true}).click();
  await sc.page.waitForTimeout(300);
  const confirmed=await inputInfo(sc.page);
  expect(confirmed.total===100,'受領後の合計が100Pではない',confirmed);
  expect(confirmed.slipCount==='FAX伝票 5枚 ／ 仮 0件','受領後の伝票枚数',confirmed.slipCount);
  out.confirmed={total:confirmed.total,slipCount:confirmed.slipCount};
  await shot(sc.page,'input-head-confirmed','.input-head');
  await sc.context.close();

  record('input',out);
};
```

- [ ] **Step 2: 撮影して画像を目視する**

Run: `node manual/capture.cjs input`
Expected: 例外なし。`manual/assets/` に13枚。`input-head.png` に「FAX伝票 4枚 ／ 仮 1件」が写っていること。

Read ツールで `sheet-final.png`、`sheet-item-group.png`、`slip-fax3.png`、`slip-provisional-fixed.png` を開き、次を確かめる。
- `sheet-final`: 9月25日・100P・軒下①／PC横・メインに「半」2か所（ユーザーのスクリーンショットと同じ配置）
- `sheet-item-group`: 下段の仕掛品1 の3欄と、その下のメイン列1〜3。右端に品目の境目の太罫が写る。左右が切れていたら `rect` の計算を直す
- `slip-fax3`: 仕掛品1 の3行
- `slip-provisional-fixed`: 仕掛品4 の個数 27000、「FAX受領済みにする」ボタン

- [ ] **Step 3: P1〜P4 の本文を書く**

`manual/pages/p01.html`（Task 3 の仮ページを置き換える）:

```html
<!--page {"title":"1. はじめに","lead":"発送伝票から、チームに配る配置図を作る。"} -->
<p class="intro">荷物やロットが多い日の、<strong>ロット別の集計と配置図の記入</strong>を省力化するアプリです。</p>
<figure><img class="shot fit h115" src="assets/sheet-final.png" alt="完成した配置図"><figcaption>完成した配置図の例（9月25日 あさ・100P）。本書では、この日の搬入を例に説明します。</figcaption></figure>
<h2>手書きで行っていた作業を、画面上で進めます</h2>
<table class="tbl"><thead><tr><th>これまでの作業</th><th>アプリを使うと</th></tr></thead><tbody>
<tr><td>個数とSNPからパレット数を手計算する</td><td>入力内容から自動計算する</td></tr>
<tr><td>品目・ロットごとに集計し、配置を考える</td><td>自動配置を確認し、現場に合わせて調整する</td></tr>
<tr><td>所定の用紙に配置を記入する</td><td>配置図を作成して印刷する</td></tr>
</tbody></table>
<p>FAXと予定表を確認して入力し、配置を整えたら印刷します。人数分のコピーと配布は、これまでと同じです。</p>
<aside><b>自動配置の後も、確認して仕上げます。</b><br>品目・ロットのまとまりと列への収まりを見て、現場で使いやすい配置に整えます。</aside>
<p class="muted">PCのマウス・キーボードでの操作を説明します。品名・ロット・数量は架空のデモデータです。</p>
```

`manual/pages/p02.html`:

```html
<!--page {"title":"2. 作業の流れと配置の基本","lead":"作業の目的を知ってから、3つのタブへ。"} -->
<h2>2.1 作業は3つのタブで進める</h2>
<figure><img class="shot" src="assets/tabs.png" alt="タブ"><figcaption>「設定」は必要なときだけ使います（P10）。</figcaption></figure>
<div class="flow">
<div><b>入力</b><span>伝票を入力<br>自動配置を作成</span><small>P3〜4</small></div><i>→</i>
<div><b>配置編集</b><span>荷物を動かす<br>まとまりを整える</span><small>P5〜7</small></div><i>→</i>
<div><b>配置図</b><span>表記を確認<br>印刷して配布</span><small>P8〜9</small></div>
</div>
<h2>2.2 品目ごと、その中でロットごとにまとめる</h2>
<p>作業者は品目・ロットごとに、パレットのバーコードと積載数を登録します。事務方による入庫設定は品目ごとに完了するため、まず品目をまとめ、その中で同じロットを近づけます。</p>
<div class="cols">
<figure><img class="shot fit h80" src="assets/sheet-item-group.png" alt="仕掛品1の3ロット"></figure>
<div><p>左は完成した配置図の一部です。仕掛品1 の3ロット（111-1112、111-1111、111-1113）を、メインの左側に並べています。</p><p>配置図の下段では、品目が変わる境目の縦線が太くなります。同じ品目の中のロットの境目は細い線です。</p><p class="muted">1マスはパレット1枚分の場所です。エリアの中では、列を単位に配置を考えます。</p></div>
</div>
<h2>2.3 充填品を優先して倉庫内へ置く</h2>
<p>製品は入庫前に検査があることが多く、入庫設定が遅くなりがちです。そのため、充填品を入庫口に近い倉庫内へ優先して配置します。</p>
<p>パレット数の多い荷物を入口に近づけることを基本に、収まりとまとまりを見て調整します。すべての品目が合計枚数の順に自動で並ぶわけではありません。</p>
```

`manual/pages/p03.html`:

```html
<!--page {"title":"3. 入力 <small>（1）</small>","lead":"FAXを1枚ずつ、伝票として入力します。","tab":"入力"} -->
<h2>3.1 その日の入力を始める</h2>
<figure><img class="shot" src="assets/input-head.png" alt="入力画面の上部"></figure>
<div class="steps">
<p><span class="num">①</span> 「あさ／ひる」を確認し、前回分が残っていれば「入力をクリア」を押します。クリアされるのは選んでいる側だけです。</p>
<p><span class="num">②</span> 搬入日を確認します。搬入日は朝・昼で共通です。本書では 9月25日（金）の朝搬入分を例にします。</p>
</div>
<h2>3.2 FAXを見て入力する</h2>
<div class="cols">
<div class="steps">
<p><span class="num">③</span> 「＋ FAX伝票を追加」で、実物のFAX1枚につき1伝票を作ります。</p>
<p><span class="num">④</span> 種別（製品／充填品）を選び、FAXの品名・ロット・個数と、予定表のSNPを入力します。</p>
<p><span class="num">⑤</span> 同じFAXに別の品目・ロットがあれば、伝票の中の「＋ 品目を追加」で行を増やします。次のFAXは別の伝票にします。</p>
</div>
<figure><img class="shot" src="assets/input-actions.png" alt="伝票を追加するボタン"></figure>
</div>
<figure><img class="shot" src="assets/slip-fax1.png" alt="FAX①の伝票"><figcaption>FAX①（製品1）。1品目の伝票です。</figcaption></figure>
<figure><img class="shot" src="assets/slip-fax3.png" alt="FAX③の伝票"><figcaption>FAX③（仕掛品1 の3ロット）。1枚に複数のロットがあるときは行を増やします。</figcaption></figure>
<h2>3.3 SNP・「半」・伝票枚数を確認する</h2>
<div class="cols">
<div><p>同じ品目でもSNPが違う場合があります。自動で入っても予定表と照合してください。</p>
<p>「設定」→「表示設定」の「入力画面での端数を『半』で表示」をオンにすると、端数が「半」で出ます。製品2（SNP 500・2,750個）は「5P 半」で、置き場所は6枚分です。</p></div>
<figure><img class="shot" src="assets/setting-frac.png" alt="半の表示設定"></figure>
</div>
<figure><img class="shot" src="assets/slip-fax2.png" alt="FAX②の伝票"><figcaption>FAX②（製品2）。パレット数の欄が「5P 半」になります。</figcaption></figure>
<p>画面上部の「FAX伝票 ◯枚」（3.1 の図）を、手元のFAXの枚数と照合します。この時点は「FAX伝票 4枚 ／ 仮 1件」です。仮伝票は「仮 ◯件」として別に数えます。</p>
```

`manual/pages/p04.html`:

```html
<!--page {"title":"3. 入力 <small>（2）</small>","lead":"未着分は仮伝票に。届いたら照合して受領済みにします。","tab":"入力"} -->
<h2>3.4 FAX未着分を仮伝票で入力する</h2>
<p>「＋ 仮伝票を追加」を押し、予定表の内容を入力します。仮伝票は、未着の荷物を配置に含めるための入力枠です。個数は予定値なので、後から届くFAXと違うことがあります。</p>
<figure><img class="shot" src="assets/slip-provisional.png" alt="仮伝票"><figcaption>FAX⑤（未着）の仮伝票。仕掛品4 は予定表の 28,500 個で入力しています。</figcaption></figure>
<p>画面上部は「FAX伝票 4枚 ／ 仮 1件」（P3 の図）、合計は 101P です。</p>
<h2>3.5 自動配置と品目登録</h2>
<div class="cols">
<div><p>入力を確認し「▶ 自動配置を作成」を押します。入力に不備があれば赤枠で示されるので直します。</p>
<p>登録されていない品目があると、登録するかを聞かれます。品名・SNPを確かめて「OK」を押すと登録され、次回から品名の候補とSNPの自動入力が使えます。「キャンセル」しても配置図は作成されます。</p></div>
<div><figure><img class="shot" src="assets/run-button.png" alt="自動配置を作成"></figure>
<div class="dialog-example" data-dialog="register"></div></div>
</div>
<h2>3.6 FAX到着後に照合・修正する</h2>
<div class="steps">
<p><span class="num">①</span> 届いたFAXと仮伝票を照合し、違う個数を直します。</p>
<p><span class="num">②</span> 「FAX受領済みにする」を押します。同じ荷物を二重に入力しないためです。</p>
<p><span class="num">③</span> 数量を変えたら、もう一度「▶ 自動配置を作成」を押して配置を確認します。</p>
</div>
<div class="cols">
<figure><img class="shot" src="assets/slip-provisional-fixed.png" alt="個数を直した仮伝票"></figure>
<table class="tbl"><thead><tr><th>仕掛品4（SNP 2,000）</th><th class="r">予定表</th><th class="r">届いたFAX</th></tr></thead><tbody>
<tr><td>個数</td><td class="r">28,500</td><td class="r">27,000</td></tr>
<tr><td>パレット数</td><td class="r">15P</td><td class="r">14P（13P 半）</td></tr>
<tr><td>全体の合計</td><td class="r">101P</td><td class="r">100P</td></tr>
</tbody></table>
</div>
<figure><img class="shot fit h40" src="assets/input-head-confirmed.png" alt="FAX伝票5枚・仮0件"><figcaption>受領後は「FAX伝票 5枚 ／ 仮 0件」です。</figcaption></figure>
<aside class="warn">自動配置を作り直すと、手動で整えた配置と「半」の位置の指定は破棄されます。確認画面を読んでから実行してください。</aside>
```

- [ ] **Step 4: 組版して紙面を確かめる**

Run: `npm --prefix manual run build && npm --prefix manual run render`
Expected: 4ページ。全ページ `spaceToFooter` が0以上、`images:true`。

Read ツールで `manual/dist/preview/p01.png`〜`p04.png` を開き、文字の欠け・図の切れ・画面例の文言を確かめる。はみ出したページは、そのページの画像の `h` クラスを小さくする（文字は縮めない）。それでも収まらなければ止めて報告する。

- [ ] **Step 5: Commit**

```bash
git add manual/capture/input.cjs manual/pages manual/assets
git commit -m "docs: マニュアルのP1〜P4を実画面で作り直す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: ユーザーレビュー（停止）**

ここで止め、`manual/dist/操作マニュアル.pdf`（P1〜P4）を SendUserFile でユーザーに送り、レビューを依頼する。文字の大きさ、図と説明のバランス、文言の直しを受け、反映してから Task 5 へ進む。

---

### Task 5: P5〜P7（配置編集）の撮影

**Files:**
- Create: `manual/capture/edit.cjs`
- Create: `manual/assets/*.png`（撮影物）

**Interfaces:**
- Consumes: Task 1・2 の `scene.cjs`・`verify.cjs`・`states.cjs`（`stripManual`、`withSettings`）
- Produces:
  - 画像: `move-1-select`, `move-2-drag`, `move-3-after`, `undo-toolbar`, `board-auto`, `board-manual`, `stash-floor`, `sheet-stash-slot`, `blocked-main`, `blocked-actions`, `blocked-after`, `half-badge`, `setting-placement`, `half-before`, `half-button`, `half-after`, `half-auto-button`
  - `verification.json` の `edit` キー: `{move:{src,dest,free,lot,insufficientUnchanged:true,moved:true,selectionCleared:true}, splitMove:{src,dest,lot}, dialogs:{split:string}, autoMatchesResult:boolean, stash:{lot,count}, half:{before:number,after:number,autoLabel:'半を自動に戻す'}}`

- [ ] **Step 1: edit グループを書く**

`manual/capture/edit.cjs`:

```js
// P5〜P7 の撮影。すべて s2（手動配置）から始め、場面ごとに開き直す
const fs=require('node:fs');
const path=require('node:path');
const P=require('../lib/paths.cjs');
const S=require('../lib/states.cjs');
const {openScene,loadState,gotoTab,shot,clipShot,unionRect,appMainSig,mainSig}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');
const MAIN='#zone-near .space:has(.colwrap[data-space="メイン"])';
const col=c=>`#zone-near .colwrap[data-space="メイン"][data-col="${c}"]`;

async function selectCells(page,locator,n){
  await locator.nth(0).click();
  for(let i=1;i<n;i++) await locator.nth(i).click({modifiers:['Shift']});
}
async function colsRect(page,a,b){
  const lo=Math.min(a,b), hi=Math.max(a,b);
  const sel=[];
  for(let c=lo;c<=hi;c++) sel.push(col(c));
  return unionRect(page,sel.join(','),4);
}

module.exports=async function(browser){
  const out={};
  const s2=loadState('s2-final.json');
  const src=JSON.parse(fs.readFileSync(path.join(P.STATE,'source-export.json'),'utf8'));
  const am=JSON.parse(src['palletApp.schedule']).shifts.am;

  // ---- P5 移動（3コマ）：隣の列へ。空きより多いと移動できない → 空きと同じ枚数で移動 ----
  // 分割の確認は隣の列への移動では出ない（隣接は1か所と数える）。確認は次の場面で別に記録する
  let sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  const plan=await sc.page.evaluate(()=>{
    const sp=lastSp.find(s=>s.name==='メイン');
    for(let c=0;c<sp.cols.length;c++){
      const free=columnFreeCount(sp.cols[c],sp.cols[c].blockedRows);
      if(free<2||free>4) continue;
      for(const s of [c-1,c+1]){
        if(s<0||s>=sp.cols.length) continue;
        for(const f of sp.cols[s].fills){
          if(f.count>=free+1) return {dest:c,free,src:s,lot:f.id};
        }
      }
    }
    return null;
  });
  expect(!!plan,'隣の列への移動の例に使える列が見つからない（止めて報告）');
  const cells=sc.page.locator(`${col(plan.src)} .cell[data-lot="${plan.lot}"]`);
  // 空きより1枚多く選ぶ → 移動できないことを確かめる
  await selectCells(sc.page,cells,plan.free+1);
  const before=await appMainSig(sc.page);
  await cells.nth(0).dragTo(sc.page.locator(col(plan.dest)));
  await sc.page.waitForTimeout(300);
  const insufficientUnchanged=JSON.stringify(await appMainSig(sc.page))===JSON.stringify(before);
  expect(insufficientUnchanged,'空きが足りない列へ移動できてしまった',plan);
  // 1枚外して、空きと同じ枚数にする
  await cells.nth(plan.free).click({modifiers:['Shift']});
  expect(await sc.page.evaluate(()=>sel.cells.size)===plan.free,'選択数が空きと一致しない');
  const rect=await colsRect(sc.page,plan.src,plan.dest);
  await clipShot(sc.page,'move-1-select',rect);
  // ドラッグ中を撮る
  const from=await cells.nth(0).boundingBox();
  const to=await sc.page.locator(col(plan.dest)).boundingBox();
  await sc.page.mouse.move(from.x+from.width/2,from.y+from.height/2);
  await sc.page.mouse.down();
  await sc.page.mouse.move(to.x+to.width/2,to.y+to.height/3,{steps:15});
  await sc.page.waitForTimeout(200);
  await sc.page.screenshot({path:path.join(P.ASSETS,'move-2-drag.png'),clip:rect,fullPage:true});
  await sc.page.mouse.up();
  await sc.page.waitForTimeout(400);
  const destCount=await sc.page.evaluate(({dest,lot})=>{
    const c=lastSp.find(s=>s.name==='メイン').cols[dest];
    return c.fills.filter(f=>f.id===lot).reduce((n,f)=>n+f.count,0);
  },plan);
  const beforeDest=before[plan.dest].split(',').filter(x=>x.startsWith(plan.lot+':')).reduce((n,x)=>n+(+x.split(':')[1]),0);
  expect(destCount===beforeDest+plan.free,'移動先に選んだ枚数が入っていない',{destCount,beforeDest,plan});
  const selectionCleared=await sc.page.evaluate(()=>sel.cells.size===0);
  expect(selectionCleared,'移動後に選択が解除されていない');
  out.move={...plan,insufficientUnchanged,moved:true,selectionCleared};
  await clipShot(sc.page,'move-3-after',await colsRect(sc.page,plan.src,plan.dest));
  await shot(sc.page,'undo-toolbar','#toolFlag');
  await sc.context.close();

  // ---- P5 分割の確認：離れた列へ1枚動かし、confirm の文言だけを記録する（撮影しない） ----
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  const far=await sc.page.evaluate(()=>{
    const sp=lastSp.find(s=>s.name==='メイン');
    const has=(c,id)=>c>=0&&c<sp.cols.length&&sp.cols[c].fills.some(f=>f.id===id);
    for(let s=0;s<sp.cols.length;s++){
      for(const f of sp.cols[s].fills){
        if(f.count<2) continue;
        for(let c=0;c<sp.cols.length;c++){
          if(Math.abs(s-c)<3) continue;
          if(columnFreeCount(sp.cols[c],sp.cols[c].blockedRows)<1) continue;
          if(has(c,f.id)||has(c-1,f.id)||has(c+1,f.id)) continue;
          return {src:s,dest:c,lot:f.id};
        }
      }
    }
    return null;
  });
  expect(!!far,'分割の確認を出せる移動が見つからない（止めて報告）');
  const one=sc.page.locator(`${col(far.src)} .cell[data-lot="${far.lot}"]`).last();
  await one.click();
  await one.dragTo(sc.page.locator(col(far.dest)));
  await sc.page.waitForTimeout(400);
  const split=sc.dialogs.find(m=>m.includes('分かれます'));
  expect(!!split,'ロット分割の確認が出ていない',{far,dialogs:sc.dialogs});
  out.dialogs={split};
  out.splitMove=far;
  await sc.context.close();

  // ---- P6 4.3 自動配置と手動配置の盤 ----
  sc=await openScene(browser,{state:S.stripManual(s2),viewport:{width:1100,height:1200},tab:'配置編集'});
  out.autoMatchesResult=JSON.stringify(await appMainSig(sc.page))===JSON.stringify(mainSig(am.result.sp));
  // 盤全体（倉庫外・壁・倉庫内）。退避スペースは含めない
  await shot(sc.page,'board-auto','.floor:not(.stashfloor)');
  await sc.context.close();
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  await shot(sc.page,'board-manual','.floor:not(.stashfloor)');
  await sc.context.close();

  // ---- P6 4.4 退避：仕掛品3 333-3334（id 8）を丸ごと退避 → 配置図に「※未定」 ----
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  const lot8=sc.page.locator('#zone-near .cell[data-lot="8"]');
  const n8=await lot8.count();
  expect(n8===7,'333-3334 のマスが7枚ではない',n8);
  await selectCells(sc.page,lot8,n8);
  await lot8.nth(0).dragTo(sc.page.locator('#stashDock'));
  await sc.page.waitForTimeout(400);
  const stashed=await sc.page.evaluate(()=>stashSpaces(lastSp).reduce((n,s)=>n+s.cols.reduce((m,c)=>m+used(c),0),0));
  expect(stashed===7,'退避に7枚入っていない',stashed);
  out.stash={lot:8,count:stashed};
  await shot(sc.page,'stash-floor','.stashfloor');
  await gotoTab(sc.page,'配置図');
  const cell=await sc.page.evaluate(()=>{
    const td=[...document.querySelectorAll('#sheetView td')].find(t=>t.innerText.includes('※未定'));
    if(!td) return null;
    return {ek:td.getAttribute('data-ek')||''};
  });
  expect(!!cell,'配置図に「※未定」が出ていない');
  if(/^(top|bottom)\|\d+\|note$/.test(cell.ek)){
    const [tier,i]=cell.ek.split('|');
    await clipShot(sc.page,'sheet-stash-slot',await unionRect(sc.page,`#sheetView td[data-ek^="${tier}|${i}|"]`,3));
  }else{
    // 追記欄（表の外の小さな表）に載った場合は、その表ごと撮る
    const t=sc.page.locator('#sheetView table').filter({hasText:'※未定'}).last();
    await t.scrollIntoViewIfNeeded();
    await t.screenshot({path:path.join(P.ASSETS,'sheet-stash-slot.png')});
  }
  await sc.context.close();

  // ---- P6 4.5 配置不可：メインの1列を配置不可にして自動配置を実行 ----
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  await sc.page.locator('#blockedEditBtn').click();
  const bc=sc.page.locator(`${col(1)} .cell`);
  const nb=await bc.count();
  for(let i=0;i<nb;i++) await bc.nth(i).click();
  await shot(sc.page,'blocked-main',MAIN);
  await shot(sc.page,'blocked-actions','#blockedEditActions');
  await sc.page.locator('#blockedRunBtn').click();
  await sc.page.waitForTimeout(800);
  await shot(sc.page,'blocked-after',MAIN);
  await sc.context.close();

  // ---- P7 「半」：初期位置の印 → 設定 ON → 半を設定 → 半を自動に戻す ----
  sc=await openScene(browser,{state:S.withSettings(s2,{'palletApp.halfManual':'true'}),viewport:{width:1100,height:1200},tab:'配置編集'});
  const halfCol=`#zone-near .colwrap[data-space="メイン"]:has(.cell.half[data-lot="4"])`;
  expect(await sc.page.locator(halfCol).count()===1,'111-1113 の「半」の列が1つではない');
  await shot(sc.page,'half-badge',halfCol);
  const lot4=sc.page.locator(`${halfCol} .cell[data-lot="4"]`);
  const idxHalf=async()=>lot4.evaluateAll(es=>es.findIndex(e=>e.classList.contains('half')));
  const halfBefore=await idxHalf();
  await gotoTab(sc.page,'設定');
  await sc.page.locator('#subtab-display').click();
  expect(await sc.page.locator('#halfManualChk').isChecked(),'「半」の手動設定が ON になっていない');
  await shot(sc.page,'setting-placement','.cfgsec:has(#halfManualChk)');
  await gotoTab(sc.page,'配置編集');
  // 一番上のマス（「半」ではない）を選ぶ
  await lot4.nth(0).click();
  expect((await sc.page.locator('#halfBtnText').innerText()).trim()==='半を設定','ボタンが「半を設定」ではない');
  await shot(sc.page,'half-before',halfCol);
  await shot(sc.page,'half-button','#toolFlag');
  await sc.page.locator('#halfBtn').click();
  await sc.page.waitForTimeout(300);
  const halfAfter=await idxHalf();
  expect(halfAfter===0 && halfBefore!==0,'「半」が選んだマスへ移っていない',{halfBefore,halfAfter});
  await shot(sc.page,'half-after',halfCol);
  await lot4.nth(0).click();
  const autoLabel=(await sc.page.locator('#halfBtnText').innerText()).trim();
  expect(autoLabel==='半を自動に戻す','指定した「半」を選んでも「半を自動に戻す」にならない',autoLabel);
  await shot(sc.page,'half-auto-button','#toolFlag');
  out.half={before:halfBefore,after:halfAfter,autoLabel};
  await sc.context.close();

  record('edit',out);
};
```

- [ ] **Step 2: 撮影する**

Run: `node manual/capture.cjs edit`
Expected: 例外なし。`manual/assets/` に17枚が増える。`verification.json` の `edit.move.insufficientUnchanged: true`、`edit.dialogs.split` に「分かれます」を含む文言、`edit.half.autoLabel: "半を自動に戻す"`。

失敗したとき:
- `隣の列への移動の例に使える列が見つからない` / `分割の確認を出せる移動が見つからない`: s2 の配置では条件に合う列が無い。条件を緩めず、止めて報告する。
- `ロット分割の確認が出ていない`: 離れた列への1枚の移動でも置き場所が増えたと判定されなかった。`far` と `sc.dialogs` を添えて止めて報告する。
- `333-3334 のマスが7枚ではない`: `data-lot="8"` のマスが盤の別のエリアにもある。メイン以外のマスが混ざっていないかを確かめる。
- 上記以外で計画外の変更が要るなら止めて報告する。

- [ ] **Step 3: 画像を目視する**

`board-auto`・`board-manual` は、ユーザーが示した配置編集の前後の画面（軒下①②・出庫口横・倉庫内）と同じ範囲であること。製品1・製品2 が自動配置では軒下②とメイン左端、手動配置では軒下①にあることを確かめる。p06 の①〜③の説明と画像が食い違えば、説明を画像に合わせて直す。

Read ツールで `move-1-select`・`move-2-drag`・`move-3-after`・`board-auto`・`board-manual`・`sheet-stash-slot`・`half-before`・`half-after` を開き、次を確かめる。
- `move-*`: 3枚とも同じ範囲（隣り合う2列）。①で選択、②でドラッグ中の表示、③で移動先に入っている
- `sheet-stash-slot`: 「※未定」が読める
- `half-before` / `half-after`: 「半」の印が最下段から最上段へ移っている

`autoMatchesResult` が false でも止めない（自動配置の図であることは変わらない）。値は Task 6 の本文には使わない。

- [ ] **Step 4: Commit**

```bash
git add manual/capture/edit.cjs manual/assets
git commit -m "docs: マニュアルの配置編集（P5〜P7）の画面を撮影する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: P5〜P7 の本文

**Files:**
- Create: `manual/pages/p05.html`, `p06.html`, `p07.html`

**Interfaces:**
- Consumes: Task 5 の画像と `verification.json` の `edit.dialogs.split`

- [ ] **Step 1: p05.html を書く**

```html
<!--page {"title":"4. 配置編集 <small>（1）選択と移動</small>","lead":"同じロットのパレットを選び、移動先の列へ動かします。","tab":"配置編集"} -->
<h2>4.1 パレットを選ぶ</h2>
<p><b>選択と移動はロットごとです。違うロットを同時には選べません。</b>盤の1マスはパレット1枚分です。</p>
<table class="tbl"><thead><tr><th>したいこと</th><th>操作</th></tr></thead><tbody>
<tr><td>1枚を選ぶ</td><td>クリック</td></tr>
<tr><td>同じロットの複数枚を選ぶ</td><td>Shift＋クリック、または荷物のない位置からドラッグして囲む</td></tr>
<tr><td>1枚を選択から外す</td><td>選んでいるパレットを Shift＋クリック</td></tr>
<tr><td>すべて外す</td><td>荷物のない位置をクリック</td></tr>
</tbody></table>
<h2>4.2 移動先に入る枚数を選んでから移動する</h2>
<p>移動先の列の空きを数え、<b>空きに入る枚数だけ</b>を選んでからドラッグします。選んだ枚数が空きより多い列には移動できません（何も起きません）。</p>
<div class="cols3">
<figure><img class="shot fit h70" src="assets/move-1-select.png" alt="選択"><figcaption><span class="num">①</span> 空きと同じ枚数を選ぶ</figcaption></figure>
<figure><img class="shot fit h70" src="assets/move-2-drag.png" alt="ドラッグ"><figcaption><span class="num">②</span> 移動先の列へドラッグ</figcaption></figure>
<figure><img class="shot fit h70" src="assets/move-3-after.png" alt="移動後"><figcaption><span class="num">③</span> 移動後は選択が外れる</figcaption></figure>
</div>
<p>残りを動かすときは、もう一度選び直します。</p>
<h2>ロットが分かれるときは確認が出る</h2>
<div class="cols">
<div><p>移動でロットの置き場所が増えるときは、確認が出ます。まとまりを崩してよいかを確かめてから「OK」を押します。</p><p class="muted">確認を出さない設定もあります（P10）。</p></div>
<div class="dialog-example" data-dialog="split"></div>
</div>
<h2>戻す・進む</h2>
<div class="inline-tool"><img class="shot" src="assets/undo-toolbar.png" alt="戻す・進む"><p>盤の上の帯にある矢印で、直前の操作を戻す（<span class="arrot">↪</span>）・戻した操作を進める（<span class="arrot">↩</span>）ことができます。設定で「戻す」「進む」の文字を付けられます（P10）。</p></div>
```

- [ ] **Step 2: p06.html を書く**

```html
<!--page {"title":"4. 配置編集 <small>（2）配置を整える</small>","lead":"品目・ロットのまとまりを保ちながら、列の空きを使います。","tab":"配置編集"} -->
<h2>4.3 自動配置から、手動で整える</h2>
<div class="cols">
<figure><img class="shot fit h80" src="assets/board-auto.png" alt="自動配置"><figcaption>自動配置の直後</figcaption></figure>
<figure><img class="shot fit h80" src="assets/board-manual.png" alt="手動で整えた配置"><figcaption>手動で整えた後（完成図の配置）</figcaption></figure>
</div>
<p>この例では、自動配置の結果を次のように整えました。</p>
<div class="steps">
<p><span class="num">①</span> 製品（製品1・製品2）を倉庫外の軒下①へ集めた。</p>
<p><span class="num">②</span> 軒下①にあった充填品の仕掛品3 を、倉庫内のメインへ入れた（2.3 の「充填品を倉庫内へ」）。</p>
<p><span class="num">③</span> 品目の境目の列では、仕掛品2 の2ロットを1列に混載して空きを使った。</p>
</div>
<p class="muted">自動配置は出発点です。最後は現場の置き方に合わせて整えます。</p>
<h2>4.4 退避スペースを使う</h2>
<div class="cols">
<figure><img class="shot" src="assets/stash-floor.png" alt="退避スペース"><figcaption>例：仕掛品3（333-3334）の7枚を丸ごと退避した場面</figcaption></figure>
<div><p>組み替えの途中で、ロット全体を選んで退避スペースへ移せます。自動配置で置き場が無い荷物も、退避スペースに入ります。</p>
<p>退避に残った荷物は、配置図に「※未定」として載ります。当日は入庫できる荷物から入庫し、空きができたら現場の判断で置きます。</p>
<figure><img class="shot fit h40" src="assets/sheet-stash-slot.png" alt="※未定の欄"></figure></div>
</div>
<h2>4.5 使えない場所を避ける</h2>
<div class="cols">
<div><p>「配置不可エリアを設定」を押し、使えないマスをクリック（またはなぞって）指定します。「自動配置を実行」で、そのマスを避けて配置し直します。</p>
<p class="muted">必須の操作ではありません。手動で配置を整えてもかまいません。自動配置を実行すると手動の調整は破棄されるので、結果を確認します。</p>
<figure><img class="shot" src="assets/blocked-actions.png" alt="配置不可の操作"></figure></div>
<figure><img class="shot" src="assets/blocked-main.png" alt="配置不可にしたマス"><figcaption>例：メインの1列を配置不可にした場面</figcaption></figure>
</div>
```

- [ ] **Step 3: p07.html を書く**

```html
<!--page {"title":"4. 配置編集 <small>（3）「半」の位置</small>","lead":"端数のパレットを置く場所を、配置図で示します。","tab":"配置編集"} -->
<h2>4.6 「半」はロットの下側に付く</h2>
<div class="cols">
<figure><img class="shot fit h95" src="assets/half-badge.png" alt="半の印"></figure>
<div><p>端数のあるロットは、メインの盤でロットのまとまりの<b>下側</b>のマスに「半」の印が付きます。配置図のメインのグリッドでも同じ位置に「半」が出ます。</p>
<p>メイン以外のエリアでは、配置図の表の「○P 半」の表記で示します。</p></div>
</div>
<h2>4.7 「半」の位置を指定する</h2>
<p>現物の置き方に合わせて、「半」を付けるマスを変えられます。</p>
<div class="steps">
<p><span class="num">①</span> 「設定」→「表示設定」で「配置編集で『半』の位置を手動で設定する」をオンにします（初期値はオフ）。</p>
<p><span class="num">②</span> 配置編集で、メインの「半」を付けたいマスを1つだけ選びます。</p>
<p><span class="num">③</span> 帯に出る「半を設定」を押します。「半」がそのマスへ移ります。</p>
</div>
<figure><img class="shot" src="assets/setting-placement.png" alt="配置のしかたの設定"></figure>
<div class="cols3">
<figure><img class="shot fit h80" src="assets/half-before.png" alt="指定前"><figcaption><span class="num">②</span> 一番上のマスを選ぶ</figcaption></figure>
<figure><img class="shot fit h40" src="assets/half-button.png" alt="半を設定"><figcaption><span class="num">③</span> 「半を設定」</figcaption></figure>
<figure><img class="shot fit h80" src="assets/half-after.png" alt="指定後"><figcaption>「半」が上へ移った</figcaption></figure>
</div>
<aside><b>指定を取り消すとき・消えるとき</b><br>指定した「半」のマスを選ぶと「半を自動に戻す」になり、押すとそのロットの指定が消えます。<br>そのロットを移動したとき、自動配置を作り直したときも、指定は消えて下側に戻ります。「半を設定」は戻す・進むの対象です。</aside>
<figure><img class="shot fit h40" src="assets/half-auto-button.png" alt="半を自動に戻す"></figure>
```

- [ ] **Step 4: 組版して紙面を確かめる**

Run: `npm --prefix manual run build && npm --prefix manual run render`
Expected: 7ページ。全ページ `spaceToFooter` が0以上、`images:true`。

Read ツールで `manual/dist/preview/p05.png`〜`p07.png` を開き、図の読みやすさ、画面例の文言、はみ出しを確かめる。はみ出したら画像の `h` クラスを小さくするか、`cols`（横並び）に変える。文字は縮めない。それでも収まらなければ止めて報告する。

- [ ] **Step 5: Commit**

```bash
git add manual/pages
git commit -m "docs: マニュアルの配置編集（P5〜P7）の本文を書く

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: P8〜P10（配置図・設定）の撮影

**Files:**
- Create: `manual/capture/sheet.cjs`
- Create: `manual/assets/*.png`（撮影物）

**Interfaces:**
- Consumes: Task 1・2 の共通処理
- Produces:
  - 画像: `sheet-toolbar`, `sheet-notice`, `sheet-top`, `sheet-half-column`, `text-edit-before`, `text-edit-after`, `print-a4`, `settings-subtabs`
  - `verification.json` の `sheet` キー: `{notice:string, textEdit:{slot:number,note:'（計16P）'}, print:{width:number,height:number}}`

- [ ] **Step 1: sheet グループを書く**

`manual/capture/sheet.cjs`:

```js
// P8〜P10 の撮影。s2 の配置図と設定タブ
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const P=require('../lib/paths.cjs');
const {openScene,loadState,gotoTab,shot,clipShot,unionRect}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');

module.exports=async function(browser){
  const out={};
  const s2=loadState('s2-final.json');

  let sc=await openScene(browser,{state:s2,tab:'配置図'});
  await shot(sc.page,'sheet-toolbar','.sheet-toolbar');
  out.notice=(await sc.page.locator('#sheetMsg').innerText()).trim();
  expect(out.notice.includes('下段に入りきらない'),'上段へ回した通知が出ていない',out.notice);
  await shot(sc.page,'sheet-notice','#sheetMsg');
  // 上段（日付の表を除く、軒下①・PC横の表）
  await clipShot(sc.page,'sheet-top',await unionRect(sc.page,'#sheetView td[data-ek^="top|"]',3));
  // 111-1113（7P 半）の欄と、その下のメイン列（「半」の印）
  const r=await sc.page.evaluate(()=>{
    const q=k=>document.querySelector(`#sheetView td[data-ek="${k}"]`).getBoundingClientRect();
    const a=q('bottom|2|name');
    const sv=document.querySelector('#sheetView').getBoundingClientRect();
    return {x:a.left+scrollX-2,y:a.top+scrollY-2,width:a.width+4,height:sv.bottom-a.top+4};
  });
  await clipShot(sc.page,'sheet-half-column',r);

  // テキスト編集：仕掛品3 の2ロット（333-3334 7P、333-3333 8P 半）＝16枚分
  const slot=await sc.page.evaluate(()=>{
    for(let i=0;i<9;i++){
      const td=document.querySelector(`#sheetView td[data-ek="bottom|${i}|lot"]`);
      if(td && td.innerText.trim()==='333-3333') return i;
    }
    return -1;
  });
  expect(slot>0,'333-3333 の欄が見つからない',slot);
  const pair=`#sheetView td[data-ek^="bottom|${slot-1}|"], #sheetView td[data-ek^="bottom|${slot}|"]`;
  await clipShot(sc.page,'text-edit-before',await unionRect(sc.page,pair,3));
  await sc.page.locator('#sheetEditBtn').click();
  const note=sc.page.locator(`#sheetView td[data-ek="bottom|${slot}|note"]`);
  await note.click();
  const editor=note.locator('textarea,input');
  await editor.fill('（計16P）');
  await editor.press('Tab');
  await sc.page.locator('#sheetEditBtn').click();
  await sc.page.waitForTimeout(300);
  const noteText=(await sc.page.locator(`#sheetView td[data-ek="bottom|${slot}|note"]`).innerText()).trim();
  expect(noteText.includes('（計16P）'),'注釈に書き足せていない',noteText);
  await clipShot(sc.page,'text-edit-after',await unionRect(sc.page,pair,3));
  out.textEdit={slot,note:'（計16P）'};
  await sc.context.close();

  // 印刷イメージ（A4横）：アプリの印刷用CSSで PDF にし、1ページ目を PNG にする
  sc=await openScene(browser,{state:s2,tab:'配置図'});
  const tmpPdf=path.join(P.DIST,'print-a4.pdf');
  fs.mkdirSync(P.DIST,{recursive:true});
  await sc.page.pdf({path:tmpPdf,preferCSSPageSize:true,printBackground:true});
  // 印刷時の高さ予算はアプリ側が警告する。ここでは、A4横の1ページ目が出力されることだけを確かめる
  execFileSync('sips',['-s','format','png','-Z','1600',tmpPdf,'--out',path.join(P.ASSETS,'print-a4.png')]);
  const dim=execFileSync('sips',['-g','pixelWidth','-g','pixelHeight',path.join(P.ASSETS,'print-a4.png')]).toString();
  const w=+(/pixelWidth: (\d+)/.exec(dim)||[])[1], h=+(/pixelHeight: (\d+)/.exec(dim)||[])[1];
  out.print={width:w,height:h};
  expect(w>h,'印刷イメージが横向きではない',out.print);
  const warn=await sc.page.locator('#sheetMsg .msg.warn').count();
  expect(warn===0,'配置図に警告が出ている（1ページに収まらない可能性）');
  fs.rmSync(tmpPdf);
  await sc.context.close();

  // 設定タブ
  sc=await openScene(browser,{state:s2,tab:'設定'});
  await shot(sc.page,'settings-subtabs','#cfgTabs');
  await sc.context.close();

  record('sheet',out);
};
```

- [ ] **Step 2: 撮影する**

Run: `node manual/capture.cjs sheet`
Expected: 例外なし。`verification.json` の `sheet.notice` に「下段に入りきらない」、`sheet.print.width` が `height` より大きい。

失敗したとき:
- `注釈に書き足せていない`: 欄をクリックしたときの編集欄が `textarea,input` 以外の可能性がある。`note.innerHTML` を出して確かめる。
- `配置図に警告が出ている`: s2 の配置図に高さ超過などの警告がある。止めて報告する。

- [ ] **Step 3: 画像を目視する**

Read ツールで `sheet-top`・`sheet-half-column`・`text-edit-after`・`print-a4` を開き、次を確かめる。
- `sheet-top`: 軒下①（製品2 5P 半、製品1 8P）と PC横（仕掛品4 13P 半）
- `sheet-half-column`: 111-1113 7P 半の欄と、下のメイン列の最下段の「半」
- `text-edit-after`: 333-3333 の注釈欄に「（計16P）」
- `print-a4`: A4横1ページに配置図全体。灰色のマス（通路・緊急用）が写っている

- [ ] **Step 4: Commit**

```bash
git add manual/capture/sheet.cjs manual/assets
git commit -m "docs: マニュアルの配置図・設定（P8〜P10）の画面を撮影する

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: P8〜P11 の本文、通しの実行、README

**Files:**
- Create: `manual/pages/p08.html`〜`p11.html`
- Create: `manual/README.md`

**Interfaces:**
- Consumes: Task 4・5・7 の画像、Task 1〜3 のコマンド

- [ ] **Step 1: p08.html を書く**

```html
<!--page {"title":"5. 配置図 <small>（1）読む・整える</small>","lead":"紙に出す前に、画面で内容を確かめます。","tab":"配置図"} -->
<h2>5.1 配置図を読む</h2>
<p>搬入日・あさ／ひる・合計パレット数、品名・ロット・パレット数、置き場所（矢印の先）を確かめます。画面で読みにくければ「表示倍率」を変えます。</p>
<figure><img class="shot" src="assets/sheet-top.png" alt="上段の表"></figure>
<div class="cols">
<figure><img class="shot fit h80" src="assets/sheet-half-column.png" alt="半の印"></figure>
<div>
<p><b>「5P 半」</b>は、満載5枚と端数1枚です。置き場所は6枚分です。</p>
<p><b>メインのグリッドの「半」</b>は、端数のパレットを置くマスです（P7）。</p>
<p><b>「各10P」「9P/7P」</b>は、同じ品目の複数ロットを1つの欄にまとめた表記です。「各」はロットそれぞれの枚数です。メインに置いた荷物はまとめません。</p>
<p><b>「※未定」</b>は、退避スペースに残っている荷物です（P6）。</p>
</div>
</div>
<figure><img class="shot" src="assets/sheet-notice.png" alt="上段へ回した通知"><figcaption>下段の欄が足りないときは、上段の空き欄に回して、この通知が出ます。</figcaption></figure>
<h2>5.2 必要なら表記を整える</h2>
<p>「✏ テキスト編集」を押すと、欄の文字を書き足し・書き換えできます。下の例では、仕掛品3 の2ロットの注釈に「（計16P）」を足しています。7P と 8P 半（端数の1枚も数えて9枚分）で、置き場所は合わせて16枚分です。</p>
<div class="cols">
<figure><img class="shot" src="assets/text-edit-before.png" alt="編集前"><figcaption>編集前</figcaption></figure>
<figure><img class="shot" src="assets/text-edit-after.png" alt="編集後"><figcaption>編集後</figcaption></figure>
</div>
<aside class="warn">これは表記だけの編集です。個数や配置を変えるときは、入力・配置編集で直します。配置を変えると、書き足した文字は破棄されることがあります。表記は配置が決まってから整えます。</aside>
```

- [ ] **Step 2: p09.html を書く**

```html
<!--page {"title":"5. 配置図 <small>（2）印刷と配布</small>","lead":"確認してから、A4横で印刷します。","tab":"配置図"} -->
<h2>5.3 印刷前に確認する</h2>
<div class="checklist">
<p>□ 搬入日・あさ／ひるは合っていますか。</p>
<p>□ FAXの枚数と内容を照合しましたか。未着分は予定値として確認しましたか。</p>
<p>□ 品目・ロット・パレット数は合っていますか（例の確定値は100P）。</p>
<p>□ 品目・ロットのまとまりと置き場所は分かりやすいですか。</p>
<p>□ 「半」の位置は、現物の置き方と合っていますか。</p>
<p>□ 退避している荷物（※未定）も表に載っていますか。</p>
<p>□ 書き足した注釈に誤りはありませんか。</p>
</div>
<h2>5.4 印刷・コピー・配布</h2>
<figure><img class="shot" src="assets/sheet-toolbar.png" alt="印刷ボタン"></figure>
<div class="steps">
<p><span class="num">①</span> 「🖨 印刷」を押します。</p>
<p><span class="num">②</span> 印刷画面で用紙がA4・横向きになっていることを確かめ、プレビューで図や文字の欠けがないか見ます。</p>
<p><span class="num">③</span> 印刷した配置図を人数分コピーし、チームに配ります。</p>
</div>
<figure><img class="shot fit h95" src="assets/print-a4.png" alt="印刷イメージ"><figcaption>印刷イメージ（A4横）。灰色のマスは通路・緊急用のマスです。</figcaption></figure>
<p>昼搬入の分は「ひる」に切り替えて、別に作成・印刷します。このマニュアルはA4縦、配置図はA4横です。</p>
```

- [ ] **Step 3: p10.html を書く**

```html
<!--page {"title":"6. 保存と設定","lead":"データの保存先と、設定で変えられることです。"} -->
<h2>6.1 作業データの保存</h2>
<p>入力・配置・設定は、使っているブラウザの中に自動で保存されます。別のPCや別のブラウザには共有されません。ブラウザのサイトデータを削除すると、保存内容も消えます。</p>
<h2>6.2 入力や配置を変えたら</h2>
<p>数量などを変えたら、自動配置を作り直して確認します。作り直すと、手動で整えた配置と「半」の位置の指定は破棄されます。配置を変えると、配置図のテキスト編集も破棄されることがあるので、表記まで確認してください。</p>
<h2>6.3 設定で変えられること</h2>
<figure><img class="shot fit h40" src="assets/settings-subtabs.png" alt="設定のサブタブ"></figure>
<table class="tbl"><thead><tr><th>場所</th><th>項目</th><th>初期値</th></tr></thead><tbody>
<tr><td>品目マスタ</td><td>品名・SNPの登録と修正、JSONでの保存・読込（伝票や配置は含みません）</td><td>—</td></tr>
<tr><td>配置マス</td><td>置き場（エリア・列）の設定</td><td>—</td></tr>
<tr><td>表示設定：配置図の表の文字</td><td>品名・ロット・パレット数・注釈・月日・総パレット数の大きさと太さ</td><td>—</td></tr>
<tr><td>表示設定：矢印と囲み枠線の角</td><td>矢印の先、角の丸み</td><td>矢印あり</td></tr>
<tr><td>表示設定：端数の書き方</td><td>入力画面での端数を「半」で表示</td><td>オフ（推奨はオン）</td></tr>
<tr><td>表示設定：配置のしかた</td><td>満杯時に混載を許可</td><td>オン</td></tr>
<tr><td></td><td>ロットが複数箇所に分かれるとき確認する</td><td>オン</td></tr>
<tr><td></td><td>配置編集で「半」の位置を手動で設定する</td><td>オフ</td></tr>
<tr><td>表示設定：戻す・進む</td><td>ボタンに文字を付ける</td><td>オフ</td></tr>
<tr><td>表示設定：ロットのまとめ</td><td>同じ品名のロットを1つの欄にまとめる</td><td>オン</td></tr>
<tr><td>表示設定：サンプル読込</td><td>入力タブに「基本サンプル」「混載デモ」を出す</td><td>オフ</td></tr>
<tr><td>表示設定：テキスト編集の破棄</td><td>配置が変わったら、確認無しでテキスト編集を破棄する</td><td>オフ</td></tr>
</tbody></table>
<p class="muted">設定はこの端末のブラウザに保存されます。品目マスタのJSONは作業データ全体のバックアップではありません。</p>
```

- [ ] **Step 4: p11.html を書く**

```html
<!--page {"title":"7. 毎日の作業チェック","lead":"印刷前に、このページで確認します。"} -->
<div class="check-section"><h2>7.1 始めるとき <small>入力 P3</small></h2>
<p>□ 前回分をクリアした（あさ・ひるをそれぞれ確認）。</p>
<p>□ 搬入日と、あさ／ひるを確認した。</p></div>
<div class="check-section"><h2>7.2 入力するとき <small>入力 P3〜4</small></h2>
<p>□ 実物のFAX1枚につき1伝票として入力し、画面上部の枚数と照合した。</p>
<p>□ 種別・品名・ロット・個数を確認した。SNPは自動で入っても予定表と照合した。</p>
<p>□ 未着分は仮伝票にし、FAXが届いたら照合・修正して受領済みにした。</p></div>
<div class="check-section"><h2>7.3 配置を整えるとき <small>配置編集 P5〜7</small></h2>
<p>□ 品目・ロットがまとまり、列に収まっている。</p>
<p>□ 「半」の位置が、現物の置き方と合っている。</p>
<p>□ 使えない場所と、退避中の荷物を確認した。</p>
<p>□ 作り直した場合は、手動の調整と表記を見直した。</p></div>
<div class="check-section"><h2>7.4 配布するとき <small>配置図 P8〜9</small></h2>
<p>□ 日付・あさ／ひる・数量・置き場所・※未定・注釈を最終確認した。</p>
<p>□ A4横の印刷プレビューで欠けがないことを確認した。</p>
<p>□ 印刷し、人数分コピーして配布した。</p></div>
<div class="closing">入力 → 配置編集 → 配置図<br><small>保存と設定は P10 へ。</small></div>
```

- [ ] **Step 5: README.md を書く**

`manual/README.md`:

````markdown
# 操作マニュアルの制作

本文の原本は `pages/pNN.html`。画像・PDF はコマンドで作り直す。

## 準備（初回のみ）

```bash
npm --prefix manual install
```

Google Chrome（`/Applications/Google Chrome.app`）を使う。ブラウザ本体はダウンロードしない。

## 作り直す

```bash
npm --prefix manual run all
```

個別に実行する場合:

- `npm --prefix manual run states`: `state/source-export.json` から `s1-planned.json`（101P・仮伝票あり）と `s2-final.json`（100P・手動配置）を作る
- `npm --prefix manual run capture`: 撮影。`node manual/capture.cjs input` のように場面（states / input / edit / sheet）を指定できる
- `npm --prefix manual run build`: `dist/操作マニュアル.html` を作る
- `npm --prefix manual run render`: `dist/操作マニュアル.pdf`、`dist/layout-check.json`、`dist/preview/pNN.png` を作る。はみ出しがあると失敗する
- `npm --prefix manual test`: 単体テスト

## デモデータを差し替えるとき

アプリで手動配置を整えたブラウザの DevTools コンソールで `palletApp.*` を書き出し、`state/source-export.json` を置き換える。品目は10件・この並び（製品1, 製品2, 仕掛品1×3, 仕掛品2×2, 仕掛品3×2, 仕掛品4）である必要がある。並びが変わると手動配置が復元されない（設計書 4-4）。

## 注意

- 確認ダイアログ（未登録品目、ロット分割）は画像に写らないので、撮影時に記録した文言から「画面例」を組む。`pages/` に文言を書き写さない。
- 本文の文字は縮めない。はみ出したら画像の `h40`〜`h115` クラスで高さを調整する。
- 設計書: `docs/superpowers/specs/2026-09-24-manual-11pages-design.md`
````

- [ ] **Step 6: 通しで実行する**

Run: `npm --prefix manual test && npm --prefix manual run all`
Expected: テスト 16 件が PASS。続けて撮影・組版・PDF化が例外なく終わり、`layout-check.json` が11ページすべて `spaceToFooter` 0以上・`images:true`。

- [ ] **Step 7: 全ページを目視する**

Read ツールで `manual/dist/preview/p01.png`〜`p11.png` を順に開き、次を確かめる。
- 文字の欠け、図の切れ、フッターとの重なりがない
- 見出しの番号が普通の数字、操作手順が丸数字
- 「元に戻す」「やり直す」「●」「AAA」の文字が本文に無い（`grep -nE '元に戻す|やり直す|●|AAA' manual/pages/*.html` が何も出さない）
- P4・P5 の画面例に、記録された文言が入っている

はみ出し・欠けがあれば該当ページの画像の `h` クラスを直して `npm --prefix manual run build && npm --prefix manual run render` をやり直す。文字を縮めない。

- [ ] **Step 8: Commit（dist はここで初めてコミットする）**

```bash
git add manual/pages manual/README.md manual/assets manual/dist
git commit -m "docs: マニュアルのP8〜P11を書き、11ページ版を通しで作る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 9: ユーザーレビュー（停止）**

`manual/dist/操作マニュアル.pdf` を SendUserFile でユーザーに送り、開く方法（`open manual/dist/操作マニュアル.pdf`）も示して、全11ページのレビューを依頼する。main へのマージは、レビュー後に superpowers:finishing-a-development-branch で決める。
