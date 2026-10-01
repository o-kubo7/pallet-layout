// 画面の見取り図（試作）の撮影。入力・配置編集・配置図の3画面を撮り、
// 札（A、B、C…）を付ける要素の位置を、画像に対する % で verification.json の overview に残す。
// 札の位置は組版（build.cjs が lib/build-lib.cjs の injectMarkers 経由で）ここから差し込む。手で座標を書かない。
const path=require('node:path');
const P=require('../lib/paths.cjs');
const {openScene,loadState,unionRect}=require('../lib/scene.cjs');
const S=require('../lib/states.cjs');
const {expect,record}=require('../lib/verify.cjs');

// 要素のページ座標の矩形。pick:
//  'first'   … 一致した最初の要素
//  'union'   … 一致したすべての要素の外接矩形
//  'text'    … 最初の要素の中の文字の幅（ブロック要素が幅いっぱいに伸びるとき）
//  'firstcol'… 一致した要素のうち、最も左の列（left が同じもの）だけの外接矩形
async function rectOf(page,m){
  let loc=page.locator(m.sel);
  if(m.hasText) loc=loc.filter({hasText:m.hasText});
  const n=await loc.count();
  expect(n>0,'見取り図の札の対象が見つからない',{key:m.key,sel:m.sel,hasText:m.hasText});
  return loc.evaluateAll((els,{pick,nonEmpty})=>{
    const vis=els.filter(e=>{ const r=e.getBoundingClientRect(); return r.width>0&&r.height>0&&(!nonEmpty||e.textContent.trim()!==''); });
    if(!vis.length) return null;
    let rs;
    if(pick==='union') rs=vis.map(e=>e.getBoundingClientRect());
    else if(pick==='text'){ const r=document.createRange(); r.selectNodeContents(vis[0]); rs=[r.getBoundingClientRect()]; }
    else if(pick==='firstcol'){
      const all=vis.map(e=>e.getBoundingClientRect());
      const left=Math.min(...all.map(r=>Math.round(r.left)));
      rs=all.filter(r=>Math.round(r.left)===left);
    }else rs=[vis[0].getBoundingClientRect()];
    const x=Math.min(...rs.map(v=>v.left)), y=Math.min(...rs.map(v=>v.top));
    const right=Math.max(...rs.map(v=>v.right)), bottom=Math.max(...rs.map(v=>v.bottom));
    return {x:x+scrollX,y:y+scrollY,width:right-x,height:bottom-y};
  },{pick:m.pick||'first',nonEmpty:!!m.nonEmpty});
}
// 札ごとに、対象の矩形（画像に対する %）と札を置く向きを返す。
// x,y は札の基準点（向き side の側の辺の中点）。box は対象を囲む細枠に使う
async function measure(page,clip,list){
  const out=[];
  const pct=(v,base,len)=>+(((v-base)/len)*100).toFixed(2);
  for(const m of list){
    const r=await rectOf(page,m);
    expect(!!r,'見取り図の札の対象が表示されていない',{key:m.key,sel:m.sel});
    const inside=r.x>=clip.x-1&&r.y>=clip.y-1&&r.x+r.width<=clip.x+clip.width+1&&r.y+r.height<=clip.y+clip.height+1;
    expect(inside,'見取り図の札の対象が画像の外にある',{key:m.key,r,clip});
    const box={x:pct(r.x,clip.x,clip.width),y:pct(r.y,clip.y,clip.height),
      w:pct(r.x+r.width,clip.x,clip.width)-pct(r.x,clip.x,clip.width),
      h:pct(r.y+r.height,clip.y,clip.height)-pct(r.y,clip.y,clip.height)};
    const side=m.side||'l';
    const cx=box.x+box.w/2, cy=box.y+box.h/2;
    const pt={l:[box.x,cy],r:[box.x+box.w,cy],t:[cx,box.y],b:[cx,box.y+box.h]}[side];
    expect(!!pt,'札の向きが不正',{key:m.key,side});
    out.push({key:m.key,label:m.label,x:+pt[0].toFixed(2),y:+pt[1].toFixed(2),side,box});
  }
  const keys=out.map(o=>o.key);
  expect(new Set(keys).size===keys.length,'札の記号が重複している',keys);
  return out;
}
// 札の位置と画像を同じ描画から取るため、fullPage を使わずに撮る。
// fullPage はビューポートを一時的に広げるので、日付欄の幅や配置図の自動倍率が
// 実測したときと変わり、札がずれる（実測で日付欄が 143px→169px になった）。
// 矩形はビューポートの中に収まっていること（スクロールは 0 のまま）
async function viewShot(page,name,clip){
  const vp=page.viewportSize();
  const sc=await page.evaluate(()=>({x:scrollX,y:scrollY}));
  expect(sc.x===0&&sc.y===0,'撮影前にスクロールが 0 になっていない',sc);
  expect(clip.x>=0&&clip.y>=0&&clip.x+clip.width<=vp.width&&clip.y+clip.height<=vp.height,
    '見取り図の撮影範囲がビューポートからはみ出す（viewport を大きくする）',{name,clip,vp});
  await page.evaluate(()=>{ const a=document.activeElement; if(a&&a.blur) a.blur(); });
  await page.mouse.move(0,0);
  await page.waitForTimeout(150);
  await page.screenshot({path:path.join(P.ASSETS,name+'.png'),clip});
}
async function top(page){
  await page.evaluate(()=>scrollTo(0,0));
  await page.waitForTimeout(150);
}

module.exports=async function(browser){
  const out={};

  // ---- 入力：s1 から先頭のFAX伝票と仮伝票だけを残した状態（途中の伝票を省いて1ページに収める） ----
  let sc=await openScene(browser,{state:S.overviewInput(loadState('s1-planned.json')),tab:'入力'});
  const slipCount=(await sc.page.locator('#slipCount').innerText()).trim();
  expect(slipCount==='FAX伝票 1枚 ／ 仮 1件','見取り図（入力）の伝票枚数',slipCount);
  await top(sc.page);
  const S1='#slipList .slip:nth-child(1)', S2='#slipList .slip:nth-child(2)';
  let clip=await unionRect(sc.page,'.input-head, #slipList, .input-add-actions',6);
  const input=await measure(sc.page,clip,[
    {key:'A',label:'搬入日',sel:'#dateInput',side:'t'},
    {key:'B',label:'あさ／ひる',sel:'.input-head [data-timing-switch]',pick:'union',side:'t'},
    {key:'C',label:'入力をクリア',sel:'.input-head .clear-input',side:'t'},
    {key:'D',label:'伝票の枚数',sel:'#slipCount',pick:'text',side:'r'},
    {key:'E',label:'伝票の入力欄',sel:`${S1} tr > :nth-child(-n+5)`,pick:'union',side:'t'},
    {key:'F',label:'パレット数',sel:`${S1} tr > :nth-child(6)`,pick:'union',side:'t'},
    {key:'G',label:'×（行の削除）',sel:`${S1} tbody tr:first-child td:nth-child(7) button`,side:'r'},
    {key:'H',label:'＋ 品目を追加',sel:`${S1} .btn-slip-action-add`,side:'r'},
    {key:'I',label:'伝票を削除',sel:`${S1} .slip-actions .btn-mini`,side:'l'},
    {key:'J',label:'FAX未着',sel:`${S2} .unreceived`,side:'r'},
    {key:'K',label:'FAX受領済みにする',sel:`${S2} [data-receive]`,side:'r'},
    {key:'L',label:'＋ FAX伝票を追加',sel:'.input-add-actions .btn-slip-add:not(.btn-slip-add-provisional)',side:'b'},
    {key:'M',label:'＋ 仮伝票を追加',sel:'.input-add-actions .btn-slip-add-provisional',side:'b'},
    {key:'N',label:'▶ 自動配置を作成',sel:'#runBtnInline',side:'b'},
  ]);
  await viewShot(sc.page,'overview-input',clip);
  out.input={image:'overview-input.png',slipCount,clip,markers:input};
  await sc.context.close();

  // ---- 配置編集：s2。1マスを選んで、戻す・進むの帯（選択数つき）を出す ----
  // 盤全体は縦に長く1ページに入らないため、2枚に分ける。
  //  overview-edit.png      … 上部（あさ／ひる・ボタン・帯・凡例・退避スペース）
  //  overview-edit-main.png … 倉庫内のメイン（マスの表示の説明に使う）
  // 幅 1200 にすると凡例が3段に収まり、上部の画像が低くなる
  sc=await openScene(browser,{state:loadState('s2-final.json'),viewport:{width:1200,height:1600},tab:'配置編集'});
  await top(sc.page);
  await sc.page.locator('#zone-far .cell[data-lot="0"]').first().click();
  await sc.page.waitForTimeout(300);
  const flag=await sc.page.evaluate(()=>({display:getComputedStyle(document.querySelector('#toolFlag')).display,
    count:document.querySelector('#toolFlagCount').textContent.trim(),sel:sel.cells.size}));
  expect(flag.display!=='none'&&flag.sel===1,'配置編集で帯が出ていない',flag);
  clip=await unionRect(sc.page,'#editCard .edit-toolbar, #messages, #legend, #stashDock',4);
  const edit=await measure(sc.page,clip,[
    {key:'A',label:'あさ／ひる',sel:'#editCard .edit-toolbar [data-timing-switch]',pick:'union',side:'r'},
    {key:'B',label:'配置不可エリアを設定',sel:'#blockedEditBtn',side:'b'},
    {key:'C',label:'⚙ 表示設定',sel:'#cfgToggleBtn',side:'b'},
    {key:'D',label:'戻す・進むの帯',sel:'#toolFlag',side:'r'},
    {key:'E',label:'凡例',sel:'#legend > span',pick:'union',side:'r'},
    {key:'F',label:'退避スペース',sel:'#stashDock',side:'l'},
  ]);
  await viewShot(sc.page,'overview-edit',clip);
  out.edit={image:'overview-edit.png',viewport:1200,clip,toolFlag:flag,markers:edit};
  const MAIN='#zone-near .colwrap[data-space="メイン"]';
  const mainClip=await unionRect(sc.page,'#zone-near .space:has(.colwrap[data-space="メイン"])',8);
  const editMain=await measure(sc.page,mainClip,[
    {key:'G',label:'エリア名',sel:'#zone-near .space:has(.colwrap[data-space="メイン"]) > .name',pick:'text',side:'r'},
    {key:'H',label:'マスの番号',sel:`${MAIN}[data-col="1"] .cell[data-lot]`,side:'t'},
    {key:'I',label:'列の下の分数',sel:`${MAIN}[data-col="1"] .colcap`,side:'b'},
    {key:'J',label:'点線の枠の列',sel:`${MAIN}.aisle .col`,side:'l'},
    {key:'K',label:'灰色のマス',sel:`${MAIN} .cell.aisle-cell`,side:'l'},
    {key:'L',label:'破線の区切り',sel:`${MAIN} .cell.segline, ${MAIN} .cell.segline-after`,side:'r'},
    {key:'M',label:'「半」の印',sel:`${MAIN} .cell.half .halfbadge`,side:'r'},
  ]);
  await viewShot(sc.page,'overview-edit-main',mainClip);
  out.editMain={image:'overview-edit-main.png',viewport:1200,clip:mainClip,markers:editMain};
  await sc.context.close();

  // ---- 配置図：s2 ----
  sc=await openScene(browser,{state:loadState('s2-final.json'),tab:'配置図'});
  await top(sc.page);
  const notice=(await sc.page.locator('#sheetMsg').innerText()).trim();
  expect(notice.includes('下段に入りきらない'),'配置図の通知が出ていない',notice);
  clip=await unionRect(sc.page,'#sheetCard',0);
  const sheet=await measure(sc.page,clip,[
    {key:'A',label:'あさ／ひる',sel:'#sheetCard .sheet-toolbar [data-timing-switch]',pick:'union',side:'t'},
    {key:'B',label:'表示倍率',sel:'#zoomCtl',side:'t'},
    {key:'C',label:'✏ テキスト編集',sel:'#sheetEditBtn',side:'t'},
    {key:'D',label:'🖨 印刷',sel:'#printBtn',side:'t'},
    {key:'E',label:'通知',sel:'#sheetMsg .msg',pick:'text',side:'r'},
    {key:'F',label:'日付・合計・あさ／ひる',sel:'#sheetView td.hd, #sheetView td.dow',pick:'union',side:'l'},
    {key:'G',label:'上段の表',sel:'#sheetView td[data-ek^="top|"]',pick:'union',side:'r'},
    {key:'H',label:'下段の表',sel:'#sheetView td[data-ek^="bottom|"]',pick:'union',side:'r'},
    {key:'I',label:'引き出し線',sel:'#sheetView svg.leaders path',side:'r'},
    {key:'J',label:'○（パレット）',sel:'#sheetView tr.grow td.g:not(.aisle) .mk',side:'l'},
    {key:'K',label:'「半」の丸',sel:'#sheetView tr.grow td.g .mk',hasText:'半',side:'r'},
    {key:'L',label:'行番号',sel:'#sheetView tr.grow td.lab',pick:'firstcol',side:'b'},
    {key:'M',label:'列番号',sel:'#sheetView td.colno:not(.g)',nonEmpty:true,side:'b'},
    {key:'N',label:'灰色のマス',sel:'#sheetView tr.grow td.g.aisle',side:'l'},
    {key:'O',label:'灰色の数字の丸',sel:'#sheetView td.colno.aisle.g .mk',side:'b'},
  ]);
  await viewShot(sc.page,'overview-sheet',clip);
  out.sheet={image:'overview-sheet.png',clip,notice,markers:sheet};
  await sc.context.close();

  record('overview',out);
};
