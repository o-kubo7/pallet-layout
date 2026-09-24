// P10〜P12 の撮影。s2 の配置図と設定タブ
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const P=require('../lib/paths.cjs');
const {openScene,loadState,clipShot,unionRect}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');

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
  // P10 5.1 の拡大図：最下段付近（行番号⑥⑦と「半」の丸、列番号）だけを
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

  // テキスト編集：仕掛品3 の2ロット（333-3334 7P、333-3333 8P 半）＝16枚分
  const slot=await sc.page.evaluate(()=>{
    for(let i=0;i<9;i++){
      const td=document.querySelector(`#sheetView td[data-ek="bottom|${i}|lot"]`);
      if(td && td.innerText.trim()==='333-3333') return i;
    }
    return -1;
  });
  expect(slot>0,'333-3333 の欄が見つからない',slot);
  // 333-3334（7P）・333-3333（8P 半）の2欄と、その下の注釈行だけに絞る（品名・ロットの行は含めない）。
  // 拡大率を上げるため、注釈が読めるぎりぎりまで範囲を狭くする
  const pairFields=[
    `bottom|${slot-1}|pallet`,`bottom|${slot-1}|note`,
    `bottom|${slot}|pallet`,`bottom|${slot}|note`,
  ];
  const pair=pairFields.map(k=>`#sheetView td[data-ek="${k}"]`).join(', ');
  await clipShot(sc.page,'text-edit-before',await unionRect(sc.page,pair,4));
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
  await clipShot(sc.page,'text-edit-after',await unionRect(sc.page,pair,4));
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
  // #cfgTabs はカード幅いっぱいのブロックになるため、ボタン群の外接矩形で切る
  await clipShot(sc.page,'settings-subtabs',await unionRect(sc.page,'#cfgTabs button',4));
  await sc.context.close();

  record('sheet',out);
};
