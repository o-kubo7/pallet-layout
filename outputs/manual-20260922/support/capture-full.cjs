const {chromium}=require('playwright');
const fs=require('node:fs');
const out='/Users/kenichihanada/web-app/pallet-layout/outputs/manual-20260922';
fs.mkdirSync(out+'/assets',{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context=await browser.newContext({viewport:{width:800,height:950},deviceScaleFactor:2,serviceWorkers:'block'});
 const p=await context.newPage();
 const report={};
 const shot=async(name,selector)=>{
  await p.evaluate(()=>document.activeElement?.blur());
  await p.mouse.move(0,0);
  await p.locator(selector).first().screenshot({path:out+'/assets/'+name+'.png'});
 };
 const slotShot=async(name,selector)=>{
  await p.locator(selector).first().scrollIntoViewIfNeeded();
  const box=await p.locator(selector).evaluateAll(es=>{
   const r=es.map(e=>e.getBoundingClientRect());const x=Math.min(...r.map(v=>v.x)),y=Math.min(...r.map(v=>v.y));
   return {x:x-2,y:y-2,width:Math.max(...r.map(v=>v.right))-x+4,height:Math.max(...r.map(v=>v.bottom))-y+4};
  });
  await p.screenshot({path:out+'/assets/'+name+'.png',clip:box});
 };
 p.on('dialog',d=>d.accept());
 await p.goto('file:///Users/kenichihanada/web-app/pallet-layout/files/index.html');
 await p.getByRole('button',{name:'設定',exact:true}).click();
 await p.getByRole('button',{name:'表示設定',exact:true}).click();
 await p.locator('#fracChk').check();
 await shot('half-setting','#fracChk >> xpath=../..');
 await p.getByRole('button',{name:'入力',exact:true}).click();
 await p.getByRole('button',{name:'入力をクリア',exact:true}).click();
 await p.locator('#dateInput').fill('2026-09-23');
 await p.locator('#dateInput').dispatchEvent('change');
 await p.getByRole('button',{name:'＋ FAX伝票を追加',exact:true}).click();
 const fill=async(row,type,name,lot,snp,qty)=>{
  await row.locator('select').selectOption(type);
  for(const [i,v] of [name,lot,String(snp),String(qty)].entries()) await row.locator('input').nth(i).fill(v);
  await row.locator('input').last().press('Tab');
 };
 await fill(p.locator('#slipList tbody tr').first(),'製品','製品1','111',500,4000);
 report.focusBefore=await p.evaluate(()=>document.activeElement?.outerHTML);
 await shot('input-head','.input-head');
 await shot('input-slip','#slipList .slip');
 report.focusAfter=await p.evaluate(()=>document.activeElement?.tagName);
 await shot('tabs','.tabs');
 await shot('input-actions','.input-add-actions');
 const slips=[
 [['製品','製品2','222',500,2750]],
 [['充填品','仕掛品1','111-1111',1500,24000],['充填品','仕掛品1','111-1112',1500,18000],['充填品','仕掛品2','222-2222',1500,15000]],
 [['充填品','仕掛品1','111-1113',1500,11250],['充填品','仕掛品2','222-2223',1500,15000],['充填品','仕掛品3','333-3333',2000,17500]],
 [['充填品','仕掛品3','333-3334',2000,14000],['充填品','仕掛品4','444-4444',2000,28500]]
 ];
 for(let i=0;i<slips.length;i++){
  await p.getByRole('button',{name:i===3?'＋ 仮伝票を追加':'＋ FAX伝票を追加',exact:true}).click();
  const slip=p.locator('#slipList .slip').last();
  for(let j=0;j<slips[i].length;j++){
   if(j) await slip.getByRole('button',{name:'＋ 品目を追加',exact:true}).click();
   await fill(slip.locator('tbody tr').nth(j),...slips[i][j]);
  }
 }
 const check=async(expected,count)=>{
  const got=await p.evaluate(()=>readLots().lots.reduce((n,l)=>n+l.pallets,0));
  const actual=await p.locator('#slipCount').innerText();
  if(got!==expected||actual!==count)throw Error(JSON.stringify({expected,got,count,actual}));
  return {pallets:got,count:actual};
 };
 const planned=await check(101,'FAX伝票 4枚 ／ 仮 1件');
 await shot('counts-planned','.input-head');
 await shot('multiple-slip','#slipList .slip:nth-child(3)');
 await shot('provisional','#slipList .slip:last-child');
 await p.locator('#runBtnInline').click();
 await p.getByRole('button',{name:'入力',exact:true}).click();
 const provisional=p.locator('#slipList .slip').last();
 await provisional.locator('tbody tr').last().locator('input').nth(3).fill('27000');
 await provisional.getByRole('button',{name:'FAX受領済みにする',exact:true}).click();
 const confirmed=await check(100,'FAX伝票 5枚 ／ 仮 0件');
 await shot('counts-confirmed','.input-head');
 await p.locator('#runBtnInline').click();
 await p.getByRole('button',{name:'配置図',exact:true}).click();
 if(await p.locator('#printBtn').isDisabled())throw Error('Print disabled');
 await shot('sheet-100p','#sheetView');
 await shot('sheet-toolbar','.sheet-toolbar');
 await slotShot('lot-slot-before','#sheetView td[data-ek^="top|0|"]');
 const base=await p.evaluate(()=>JSON.stringify(localStorage));
 const restore=async()=>{
  await p.evaluate(data=>{localStorage.clear(); for(const [k,v] of Object.entries(JSON.parse(data)))localStorage.setItem(k,v)},base);
  await p.reload();
 };
 // Editing the real generated note: 8P 半 + 7P = 16 pallet spaces.
 await p.locator('#sheetEditBtn').click();
 const note=p.locator('#sheetView td[data-ek="top|0|note"]');
 console.log('note count',await note.count());
 if(await note.count()){
  await note.click();
  const editor=note.locator('textarea,input');
  await editor.fill('（計16P）');
  await editor.press('Tab');
  await p.locator('#sheetEditBtn').click();
  await shot('sheet-text-edited','#sheetView');
  await slotShot('lot-slot-after','#sheetView td[data-ek^="top|0|"]');
  report.noteEdited=await p.locator('#sheetView').innerText();
 }
 // Inspect UI geometry once; subsequent screenshots use actual DOM locators.
 await restore();
 await p.getByRole('button',{name:'配置編集',exact:true}).click();
 await p.setViewportSize({width:1100,height:1200});
 await shot('edit-overview','#editCard');
 console.log('spaces',await p.locator('#zone-near .space').evaluateAll(xs=>xs.map(e=>({text:e.innerText.slice(0,70),w:e.offsetWidth,h:e.offsetHeight}))));
 console.log('lots',await p.evaluate(()=>lastLots.map(l=>({id:l.id,name:l.name,lot:l.lot,p:l.pallets}))));
 const main=p.locator('#zone-near .space').filter({has:p.locator('.colwrap[data-space="メイン"]')});
 await shot('main-before','#zone-near .space:has(.colwrap[data-space="メイン"])');
 // Select five pallets from one lot by real clicks.
 const cells=main.locator('.cell[data-lot="2"]');
 await cells.nth(0).click();
 if(await p.locator('#undoBtn').isDisabled())throw Error('First selection undo disabled');
 await shot('selection-one','#zone-near .space:has(.colwrap[data-space="メイン"])');
 for(let i=1;i<5;i++)await cells.nth(i).click({modifiers:['Shift']});
 const n=await p.evaluate(()=>sel.cells.size);
 if(n!==5)throw Error('Expected selection 5 got '+n);
 await shot('selection-five','#zone-near .space:has(.colwrap[data-space="メイン"])');
 await shot('undo-toolbar','#toolFlag');
 report.selectionFive=await p.evaluate(()=>sel.cells.size);
 const candidates=await p.evaluate(()=>lastSp.filter(s=>s.zone!=='stash').flatMap(s=>s.cols.map((c,i)=>({name:s.name,col:i,free:columnFreeCount(c,c.blockedRows)}))));
 const small=candidates.find(c=>c.free>0&&c.free<5&&c.name==='メイン');
 if(small){
  const before=await p.evaluate(()=>JSON.stringify(snapshotSpaces(lastSp)));
  await cells.first().dragTo(p.locator(`#mapBody .colwrap[data-space="${small.name}"][data-col="${small.col}"]`).first());
  report.insufficientMove={target:small,unchanged:before===await p.evaluate(()=>JSON.stringify(snapshotSpaces(lastSp)))};
  if(!report.insufficientMove.unchanged)throw Error('Unexpected partial move');
 }
 const dest=await p.evaluate(()=>{
  for(const s of lastSp.filter(s=>s.zone!=='stash'))for(let c=0;c<s.cols.length;c++){
   const v=validateMove(lastSp,sel.lotId,selCounts(sel.cells),s.name,c);
   if(v.ok){const before=s.cols[c].fills.reduce((n,f)=>n+f.count,0);const after=v.next.find(x=>x.name===s.name).cols[c].fills.reduce((n,f)=>n+f.count,0);if(after-before===5 && s.name==='メイン')return {name:s.name,col:c};}
  }return null;
 });
 console.log('destination',dest);
 if(dest){
  const target=p.locator('.colwrap').filter({has:p.locator('.cell')});
  const to=p.locator(`#mapBody .colwrap[data-space="${dest.name}"][data-col="${dest.col}"]`).first();
  await cells.first().dragTo(to);
  report.move={dest,selectionAfter:await p.evaluate(()=>sel.cells.size)};
  if(report.move.selectionAfter!==0)throw Error('Selection not cleared');
  await shot('main-after','#zone-near .space:has(.colwrap[data-space="メイン"])');
 }
 // Real marquee selection, from an empty cell into the adjacent same-lot cells.
 await restore();await p.getByRole('button',{name:'配置編集',exact:true}).click();
 await p.locator('#zone-near .space:has(.colwrap[data-space="メイン"])').scrollIntoViewIfNeeded();
 const sourceBox=await p.locator('#zone-near .colwrap[data-space="メイン"][data-col="3"] .cell').last().boundingBox();
 const endBox=await p.locator('#zone-near .colwrap[data-space="メイン"][data-col="3"] .cell[data-lot="2"]').first().boundingBox();
 if(sourceBox&&endBox){
  await p.mouse.move(sourceBox.x+2,sourceBox.y+sourceBox.height-2);await p.mouse.down();
  await p.mouse.move(endBox.x+endBox.width-2,endBox.y+2,{steps:12});
  report.marqueeDuring=await p.evaluate(()=>({selected:sel.cells.size,started:rubber?.started}));
  await p.mouse.up();report.marqueeSelected=await p.evaluate(()=>sel.cells.size);
  await shot('marquee','#zone-near .space:has(.colwrap[data-space="メイン"])');
  await p.locator('#zone-near .colwrap[data-space="メイン"][data-col="3"] .cell').last().click();
  report.emptyClickCleared=await p.evaluate(()=>sel.cells.size===0);
 }
 // Whole-lot move to stash, then verify undo and redo restore the counts.
 await restore();
 await p.getByRole('button',{name:'配置編集',exact:true}).click();
 const all=p.locator('#zone-near .cell[data-lot="4"]');
 const count=await all.count();
 await all.first().click();for(let i=1;i<count;i++)await all.nth(i).click({modifiers:['Shift']});
 await all.first().dragTo(p.locator('#stashDock'));
 const stashCount=()=>p.evaluate(()=>stashSpaces(lastSp).reduce((n,s)=>n+s.cols.reduce((m,c)=>m+used(c),0),0));
 report.stash={selected:count,after:await stashCount()};
 if(report.stash.after!==count)throw Error('Stash drag failed');
 await shot('stash-manual','.stashfloor');
 await shot('stash-pallets','#zone-stash .space');
 await p.locator('#undoBtn').click();report.stash.undo=await stashCount();
 await p.locator('#redoBtn').click();report.stash.redo=await stashCount();
 await p.getByRole('button',{name:'配置図',exact:true}).click();
 await shot('sheet-stash','#sheetView');
 await slotShot('stash-slot','#sheetView td[data-ek^="top|2|"], #sheetView td[data-ek="top|g2|head"]');
 // Separate scene: mark the main area unavailable by real clicks, then recalculate.
 await restore();await p.getByRole('button',{name:'配置編集',exact:true}).click();
 await p.locator('#blockedEditBtn').click();
 const blockCells=p.locator('#zone-near .colwrap[data-space="メイン"] .cell');
 for(let i=0;i<await blockCells.count();i++)await blockCells.nth(i).click();
 await shot('blocked-main','#zone-near .space:has(.colwrap[data-space="メイン"])');
 await shot('blocked-toolbar','#blockedEditActions');
 await p.locator('#blockedRunBtn').click();
 report.autoStash=await stashCount();
 await shot('stash-auto','.stashfloor');
 await shot('auto-stash-notice','#messages');
 // Save source state and final views for printing and settings.
 await restore();await p.getByRole('button',{name:'設定',exact:true}).click();
 await shot('settings-tabs','.subtabs');
 await p.getByRole('button',{name:'品目マスタ',exact:true}).click();
 await shot('master','#cfgpane-master');
 report.planned=planned;report.confirmed=confirmed;report.printEnabled=true;
 fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
 await browser.close();
 console.log(JSON.stringify({planned,confirmed,printEnabled:true}));
})().catch(e=>{console.error(e);process.exit(1)});
