// P1〜P5 の撮影。s2 から完成図、s1 から入力の場面を撮る
const {openScene,loadState,gotoTab,shot,clipShot,unionRect,inputInfo}=require('../lib/scene.cjs');
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

  // P3〜P5: s1（FAX①〜④＋仮1件）
  sc=await openScene(browser,{state:loadState('s1-planned.json'),tab:'入力'});
  const planned=await inputInfo(sc.page);
  expect(planned.total===101,'s1 の合計が101Pではない',planned);
  expect(planned.slipCount==='FAX伝票 4枚 ／ 仮 1件','s1 の伝票枚数',planned.slipCount);
  out.planned={total:planned.total,slipCount:planned.slipCount};
  await shot(sc.page,'input-head','.input-head');
  // ボタンが並ぶ部分だけを撮る（右側の余白を切る）
  await clipShot(sc.page,'input-actions',await unionRect(sc.page,'.input-add-actions button',4));
  await shot(sc.page,'slip-fax1','#slipList .slip:nth-child(1)');
  await shot(sc.page,'slip-fax2','#slipList .slip:nth-child(2)');
  await shot(sc.page,'slip-fax3','#slipList .slip:nth-child(3)');
  await shot(sc.page,'slip-provisional','#slipList .slip:nth-child(5)');
  await shot(sc.page,'run-button','#runBtnInline');

  // 「半」表示の設定
  await gotoTab(sc.page,'設定');
  await sc.page.locator('#subtab-display').click();
  // 見出しとチェックボックスの行だけを撮る（横の余白を切る）。
  // h3 はブロック要素で幅いっぱいに広がるため、Range で文字そのものの幅を測る。
  // label.chk は inline-flex で文字幅に収まるのでそのまま使う。
  const fracRect=await sc.page.evaluate(()=>{
    const h3=document.querySelector('.cfgsec:has(#fracChk) h3');
    const label=document.querySelector('.cfgsec:has(#fracChk) label.chk');
    const textRect=el=>{ const r=document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const rs=[textRect(h3),label.getBoundingClientRect()];
    const x=Math.min(...rs.map(v=>v.left)), y=Math.min(...rs.map(v=>v.top));
    const right=Math.max(...rs.map(v=>v.right)), bottom=Math.max(...rs.map(v=>v.bottom));
    const pad=6;
    return {x:x+scrollX-pad,y:y+scrollY-pad,width:(right-x)+pad*2,height:(bottom-y)+pad*2};
  });
  await clipShot(sc.page,'setting-frac',fracRect);
  await gotoTab(sc.page,'入力');

  // 自動配置 → 未登録品目の登録確認（confirm。文言を記録）
  await sc.page.locator('#runBtnInline').click();
  await sc.page.waitForTimeout(800);
  const reg=sc.dialogs.find(m=>m.startsWith('次の品目が未登録です'));
  expect(!!reg,'未登録品目の確認が出ていない',sc.dialogs);
  out.dialogs={register:reg};

  // FAX⑤ 到着：仮伝票にロットを入力してから、仕掛品4 を 27000 に直して受領
  await gotoTab(sc.page,'入力');
  const prov=sc.page.locator('#slipList .slip').last();
  const rows=prov.locator('tbody tr');
  const lot1=rows.nth(0).locator('input').nth(1);
  await lot1.fill('333-3334');
  await lot1.press('Tab');
  const lot2=rows.nth(1).locator('input').nth(1);
  await lot2.fill('444-4444');
  await lot2.press('Tab');
  const qty=rows.last().locator('input').nth(3);
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
