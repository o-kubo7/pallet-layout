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
