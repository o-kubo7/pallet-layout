// P14〜P17 の撮影。s2 の配置図と設定タブ
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const P=require('../lib/paths.cjs');
const {openScene,loadState,gotoTab,clipShot,unionRect}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');
// 倉庫外（軒下）の列。#zone-far 側は #zone-near と同じ colwrap の作りなので
// data-space・data-col で選べる（capture/edit.cjs の col() と同じやり方）
const FAR_COL=c=>`#zone-far .colwrap[data-space="軒下"][data-col="${c}"]`;
async function selectCells(page,locator,n){
  await locator.nth(0).click();
  for(let i=1;i<n;i++) await locator.nth(i).click({modifiers:['Shift']});
}

module.exports=async function(browser){
  const out={};
  const s2=loadState('s2-final.json');

  let sc=await openScene(browser,{state:s2,tab:'配置図'});
  // ツールバー全体は表示倍率セレクトと右側のボタン群の間に大きな空白ができる
  // （margin-left:auto）。PC表示のまま、右側のボタン群（テキスト編集・印刷）
  // だけを切り出す（p11 で使うのはこの2ボタン）
  // sheetClearBtn は hidden のため対象から外す（矩形が0になり union が崩れる）
  await clipShot(sc.page,'sheet-toolbar',await unionRect(sc.page,'#sheetEditBtn, #printBtn',4));
  out.notice=(await sc.page.locator('#sheetMsg').innerText()).trim();
  expect(out.notice.includes('下段に入りきらない'),'上段へ回した通知が出ていない',out.notice);
  // #sheetMsg はカード幅いっぱいのブロックになるため、中の文字幅で切る
  const noticeRect=await sc.page.evaluate(()=>{
    const el=document.querySelector('#sheetMsg .msg')||document.querySelector('#sheetMsg');
    const r=document.createRange();
    r.selectNodeContents(el);
    const tr=r.getBoundingClientRect();
    const er=el.getBoundingClientRect();
    const pad=8;
    return {x:tr.left+scrollX-pad,y:er.top+scrollY-pad,width:(tr.right-tr.left)+pad*2,height:(er.bottom-er.top)+pad*2};
  });
  await clipShot(sc.page,'sheet-notice',noticeRect);
  // 上段（日付の表を除く、軒下・PC横の表）
  await clipShot(sc.page,'sheet-top',await unionRect(sc.page,'#sheetView td[data-ek^="top|"]',3));
  // 111-1113（7P 半）の欄と、その下のメイン列（「半」の印）
  const r=await sc.page.evaluate(()=>{
    const q=k=>document.querySelector(`#sheetView td[data-ek="${k}"]`).getBoundingClientRect();
    const a=q('bottom|2|name');
    const sv=document.querySelector('#sheetView').getBoundingClientRect();
    return {x:a.left+scrollX-2,y:a.top+scrollY-2,width:a.width+4,height:sv.bottom-a.top+4};
  });
  await clipShot(sc.page,'sheet-half-column',r);
  // P14 7.1 の拡大図：最下段付近（行番号⑥⑦と「半」の丸、列番号）だけを
  // deviceScaleFactor:4 で撮り直す。r と同じ列（横位置）の、下から3行分（⑥⑦＋列番号行）に絞る
  const rZoom=await sc.page.evaluate(r=>{
    const cx0=r.x-scrollX, cx1=cx0+r.width;
    const cells=[...document.querySelectorAll('#sheetView td.lab, #sheetView td.g, #sheetView td.colno')]
      .filter(td=>{ const b=td.getBoundingClientRect(); const cx=(b.left+b.right)/2; return cx>=cx0-2 && cx<=cx1+2; });
    const tops=[...new Set(cells.map(td=>Math.round(td.getBoundingClientRect().top)))].sort((a,b)=>a-b);
    const lastTops=tops.slice(-3); // ⑥⑦の2行＋列番号行
    const picked=cells.filter(td=>lastTops.includes(Math.round(td.getBoundingClientRect().top)));
    const rs=picked.map(td=>td.getBoundingClientRect());
    const x=Math.min(...rs.map(v=>v.left)), y=Math.min(...rs.map(v=>v.top));
    const right=Math.max(...rs.map(v=>v.right)), bottom=Math.max(...rs.map(v=>v.bottom));
    const pad=3;
    return {x:x+scrollX-pad,y:y+scrollY-pad,width:(right-x)+pad*2,height:(bottom-y)+pad*2};
  },r);
  const scZoom=await openScene(browser,{state:s2,tab:'配置図',deviceScaleFactor:4});
  await clipShot(scZoom.page,'sheet-half-column-zoom',rZoom);
  await scZoom.context.close();

  // テキスト編集：s2 とは別に開き、配置編集で 仕掛品3 の2ロット
  // （333-3334 7枚＝data-lot=8、333-3333 9枚＝data-lot=7）を、倉庫外の軒下の
  // 空きへすべて移す。s2 の軒下は、他ロットが一部入っている列（0・1）を避けて、
  // 空の列だけ（列2＝空き2、列3＝空き2、列4＝空き11）を使う（ちょうど16枚分）。
  // 2ロットとも軒下だけに乗ると、mergeEntries() が1つの欄にまとめる（files/index.html）。
  let scEd=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  const farFree=await scEd.page.evaluate(()=>{
    const sp=lastSp.find(s=>s.name==='軒下');
    return sp.cols.map((c,i)=>({i,free:columnFreeCount(c,c.blockedRows),empty:c.fills.length===0}));
  });
  const emptyCols=farFree.filter(c=>c.empty).sort((a,b)=>b.free-a.free);
  expect(emptyCols.length>=3 && emptyCols.slice(0,3).reduce((n,c)=>n+c.free,0)>=16,
    '軒下 の空きが16枚に届かない（BLOCKED）',farFree);
  const [c11,c3,c2]=emptyCols;

  const lot8cells=scEd.page.locator('#zone-near .cell[data-lot="8"]');
  expect(await lot8cells.count()===7,'333-3334 のマスが7枚ではない');
  await selectCells(scEd.page,lot8cells,7);
  await lot8cells.nth(0).dragTo(scEd.page.locator(FAR_COL(c11.i)));
  await scEd.page.waitForTimeout(300);

  // 333-3333（9枚）を、空いている枠（列c11の残り・列c3・列c2）に順に分けて移す
  const moveLot7=async(n,colSel)=>{
    const cells=scEd.page.locator('#zone-near .cell[data-lot="7"]');
    expect(await cells.count()>=n,'333-3333 の残りマスが足りない',{n,count:await cells.count()});
    await selectCells(scEd.page,cells,n);
    await cells.nth(0).dragTo(scEd.page.locator(colSel));
    await scEd.page.waitForTimeout(300);
  };
  await moveLot7(c11.free-7,FAR_COL(c11.i));
  await moveLot7(c3.free,FAR_COL(c3.i));
  await moveLot7(c2.free,FAR_COL(c2.i));

  await gotoTab(scEd.page,'配置図');
  const slot=await scEd.page.evaluate(()=>{
    const cells=[...document.querySelectorAll('#sheetView td[data-ek^="top|"][data-ek$="|name"]')];
    for(const td of cells){
      if(td.innerText.trim()==='仕掛品3'){
        const m=/^top\|(\d+)\|name$/.exec(td.getAttribute('data-ek'));
        if(m) return +m[1];
      }
    }
    return -1;
  });
  expect(slot>=0,'配置図に仕掛品3の欄が見つからない（BLOCKED）');
  const lotText=(await scEd.page.locator(`#sheetView td[data-ek="top|${slot}|lot"]`).innerText()).trim();
  const palText=(await scEd.page.locator(`#sheetView td[data-ek="top|${slot}|pallet"]`).innerText()).trim();
  expect(lotText.includes('333-3333') && lotText.includes('333-3334') && palText.includes('/'),
    '仕掛品3 の2ロットが1つの欄にまとまっていない（BLOCKED）',{lotText,palText});

  // 見出しは含めず、品名・ロット・P数・注釈の各行だけを撮る
  const fields=['name','lot','pallet','note'].map(k=>`#sheetView td[data-ek="top|${slot}|${k}"]`).join(', ');
  await clipShot(scEd.page,'text-edit-before',await unionRect(scEd.page,fields,4));
  await scEd.page.locator('#sheetEditBtn').click();
  const note=scEd.page.locator(`#sheetView td[data-ek="top|${slot}|note"]`);
  await note.click();
  const editor=note.locator('textarea,input,.cell-editor');
  await editor.fill('（合計16P）');
  await editor.press('Tab');
  await scEd.page.locator('#sheetEditBtn').click();
  await scEd.page.waitForTimeout(300);
  const noteText=(await scEd.page.locator(`#sheetView td[data-ek="top|${slot}|note"]`).innerText()).trim();
  expect(noteText.includes('（合計16P）'),'注釈に書き足せていない',noteText);
  await clipShot(scEd.page,'text-edit-after',await unionRect(scEd.page,fields,4));
  out.textEdit={slot,tier:'top',note:'（合計16P）',pallets:palText};

  // 太字：仕掛品1 の 111-1112 の欄で、ロットの末尾1文字「2」だけを太字にする
  const boldEk=await scEd.page.evaluate(()=>{
    const tds=[...document.querySelectorAll('#sheetView td[data-ek$="|lot"]')];
    const td=tds.find(t=>t.innerText.includes('111-1112'));
    return td?td.getAttribute('data-ek'):null;
  });
  expect(boldEk,'仕掛品1 の 111-1112 の欄が見つからない（BLOCKED）');
  const boldSel=`#sheetView td[data-ek="${boldEk}"]`;
  await scEd.page.locator('#sheetEditBtn').click();
  await scEd.page.locator(boldSel).click();
  const boldEditor=scEd.page.locator('.cell-editor');
  await boldEditor.waitFor({state:'visible'});
  const sel=await scEd.page.evaluate(()=>{
    const ed=document.querySelector('.cell-editor');
    const w=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);
    let n,hit=null;
    while((n=w.nextNode())){
      const i=n.data.lastIndexOf('111-1112');
      if(i>=0) hit={n,i};
    }
    if(!hit) return {ok:false,text:ed.textContent};
    const pos=hit.i+'111-1112'.length-1;
    const r=document.createRange();
    r.setStart(hit.n,pos); r.setEnd(hit.n,pos+1);
    const s=window.getSelection();
    s.removeAllRanges(); s.addRange(r);
    return {ok:true,text:ed.textContent,picked:s.toString(),exactEnd:hit.n.data.length===pos+1};
  });
  expect(sel.ok && sel.picked==='2','編集欄で 2 を選べていない',sel);
  await scEd.page.locator('#sheetBoldBtn').click();
  // clipShot は撮る前に activeElement を blur する（編集が確定して B が消える）ため使えない。
  // 編集中のまま撮るので page.screenshot を直接使う
  await scEd.page.waitForTimeout(150);
  await scEd.page.screenshot({path:path.join(P.ASSETS,'bold-editing.png'),clip:await unionRect(scEd.page,`${boldSel}, #sheetBoldBtn`,4),fullPage:true});
  await scEd.page.keyboard.press('Tab');
  await scEd.page.locator('#sheetEditBtn').click();
  await scEd.page.waitForTimeout(300);
  const boldHtml=await scEd.page.locator(boldSel).innerHTML();
  expect(boldHtml.includes('<b>2</b>'),'太字が付いていない',boldHtml);
  await clipShot(scEd.page,'bold-after',await unionRect(scEd.page,boldSel,4));
  out.bold={key:boldEk,lot:'111-1112',boldChar:'2',editorText:sel.text,lastCharOfEditor:sel.exactEnd};
  await scEd.context.close();

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
  // #cfgTabs はカード幅いっぱいのブロックになるため、ボタン群の外接矩形で切る
  await clipShot(sc.page,'settings-subtabs',await unionRect(sc.page,'#cfgTabs button',4));
  await sc.context.close();

  record('sheet',out);
};
