// P6〜P9 の撮影。すべて s2（手動配置）から始め、場面ごとに開き直す
const fs=require('node:fs');
const path=require('node:path');
const P=require('../lib/paths.cjs');
const S=require('../lib/states.cjs');
const {openScene,loadState,gotoTab,shot,clipShot,unionRect,tailRect,appMainSig,mainSig}=require('../lib/scene.cjs');
const {expect,record}=require('../lib/verify.cjs');
const MAIN='#zone-near .space:has(.colwrap[data-space="メイン"])';
const col=c=>`#zone-near .colwrap[data-space="メイン"][data-col="${c}"]`;
// P7 4.3 の盤の図: 軒下②・出庫口横・軒下①（倉庫外）と、メイン（倉庫内）を別々に切り詰めて撮る。
// 1枚に収めると2列並びでも文字が小さいため、倉庫外／メインの2段・自動/手動の2列で計4枚にする
// （5棟壁際・PC横・EV横・退避は含めない）。
const BOARD_OUT_SEL=[
  '#zone-far .space:has(.colwrap[data-space="軒下②"])',
  '#zone-far .space:has(.colwrap[data-space="出庫口横"])',
  '#zone-far .space:has(.colwrap[data-space="軒下①"])',
].join(',');
const BOARD_MAIN_SEL=MAIN;

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

  // ---- P6 移動（3コマ）：隣の列へ。空きより多いと移動できない → 空きと同じ枚数で移動 ----
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
  // 列の外接矩形に加え、ドラッグ中の吹き出し（.dragghost、pointer 位置に
  // translate(-50%,-160%) で中央合わせ）がはみ出す分を左へ固定マージンで確保する。
  // 右側は固定マージンだと隣の列が途中で切れるため、列の境界で止まるように
  // 次の列が実在するときだけ、その列の幅ぶんだけ足す（無ければ足さない）。
  // 3コマ（select/drag/after）は同じ矩形を使う。
  const GHOST_MARGIN=60;
  const colRect=await colsRect(sc.page,plan.src,plan.dest);
  const hi=Math.max(plan.src,plan.dest);
  const rightExtra=await sc.page.evaluate(hi=>{
    const next=document.querySelector(`#zone-near .colwrap[data-space="メイン"][data-col="${hi+1}"]`);
    return next ? next.getBoundingClientRect().width : 0;
  },hi);
  const rect={x:colRect.x-GHOST_MARGIN,y:colRect.y,width:colRect.width+GHOST_MARGIN+rightExtra,height:colRect.height};
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
  await clipShot(sc.page,'move-3-after',rect);
  await shot(sc.page,'undo-toolbar','#toolFlag');
  await sc.context.close();

  // ---- P6 分割の確認：離れた列へ1枚動かし、confirm の文言だけを記録する（撮影しない） ----
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

  // ---- P7 4.3 自動配置と手動配置の盤 ----
  // 1枚（倉庫外＋壁＋メイン）だと2列並びでも文字が小さいため、倉庫外（軒下②・出庫口横・軒下①）と
  // メインを別々の画像に分ける。自動／手動の同じ段は同じ矩形で撮る（片方で求めた矩形を使い回す）。
  sc=await openScene(browser,{state:S.stripManual(s2),viewport:{width:1100,height:1200},tab:'配置編集'});
  out.autoMatchesResult=JSON.stringify(await appMainSig(sc.page))===JSON.stringify(mainSig(am.result.sp));
  expect(out.autoMatchesResult,'配置編集で開いた自動配置が入力タブの結果と一致しない',out.autoMatchesResult);
  const boardOutRect=await unionRect(sc.page,BOARD_OUT_SEL,6);
  const boardMainRect=await unionRect(sc.page,BOARD_MAIN_SEL,6);
  await clipShot(sc.page,'board-auto-out',boardOutRect);
  await clipShot(sc.page,'board-auto-main',boardMainRect);
  await sc.context.close();
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  await clipShot(sc.page,'board-manual-out',boardOutRect);
  await clipShot(sc.page,'board-manual-main',boardMainRect);
  await sc.context.close();

  // ---- P8 4.4 退避：仕掛品3 333-3334（id 8）を丸ごと退避 → 配置図に見出し「未定」の欄 ----
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
  // 見出し・説明文を除き、退避スペースのマスと「退避中：…」の行だけに切り詰める（p08 で大きく載せるため）。
  // #zone-stash・#stashBar はコンテナ自体が幅いっぱいに伸びるため、そのまま unionRect すると
  // 右側に空白が広く残る。実際に描かれた要素（.space・span）だけを対象にする。
  await clipShot(sc.page,'stash-floor',await unionRect(sc.page,'#zone-stash .space, #stashBar span',6));
  await gotoTab(sc.page,'配置図');
  // 退避は注釈「※未定」ではなく、上段の見出し「未定」の欄として載る（アプリの実際の挙動に合わせる）
  const head=await sc.page.evaluate(()=>{
    const td=[...document.querySelectorAll('#sheetView td')].find(t=>
      /^top\|g\d+\|head$/.test(t.getAttribute('data-ek')||'') && t.innerText.trim()==='未定');
    if(!td) return null;
    return {ek:td.getAttribute('data-ek')||''};
  });
  expect(!!head,'配置図に見出し「未定」が出ていない');
  // 見出しセルと、その下で横位置が重なる上段の欄（品名・ロット・P数・注釈）をまとめて撮る
  const stashRect=await sc.page.evaluate(headEk=>{
    const headEl=document.querySelector(`#sheetView td[data-ek="${headEk}"]`);
    const r0=headEl.getBoundingClientRect();
    const cells=[...document.querySelectorAll('#sheetView td')].filter(t=>
      /^top\|\d+\|(name|lot|pallet|note)$/.test(t.getAttribute('data-ek')||''));
    const under=cells.filter(t=>{
      const r=t.getBoundingClientRect();
      const cx=(r.left+r.right)/2;
      return cx>=r0.left && cx<=r0.right;
    });
    const rs=[r0,...under.map(t=>t.getBoundingClientRect())];
    const x=Math.min(...rs.map(v=>v.left)), y=Math.min(...rs.map(v=>v.top));
    const right=Math.max(...rs.map(v=>v.right)), bottom=Math.max(...rs.map(v=>v.bottom));
    const pad=3;
    return {x:x+scrollX-pad,y:y+scrollY-pad,width:(right-x)+pad*2,height:(bottom-y)+pad*2};
  },head.ek);
  await clipShot(sc.page,'sheet-stash-slot',stashRect);
  out.stash.sheetHead='未定';
  await sc.context.close();

  // ---- P8 4.5 配置不可：メインの1列を配置不可にして自動配置を実行 ----
  sc=await openScene(browser,{state:s2,viewport:{width:1100,height:1200},tab:'配置編集'});
  await sc.page.locator('#blockedEditBtn').click();
  const bc=sc.page.locator(`${col(1)} .cell`);
  const nb=await bc.count();
  for(let i=0;i<nb;i++) await bc.nth(i).click();
  await shot(sc.page,'blocked-main',MAIN);
  // 帯全体（#blockedEditActions）は幅いっぱいに伸びて文字が小さくなる。
  // ヒント文（#blockedEditHelp）は flex:1 で幅いっぱいに伸びる要素のため、
  // 含めると矩形も伸びてしまう。ボタン2つだけに切り詰める（P3 の input-actions と同じやり方）。
  await clipShot(sc.page,'blocked-actions',await unionRect(sc.page,'#blockedEditActions button',6));
  await sc.page.locator('#blockedRunBtn').click();
  await sc.page.waitForTimeout(800);
  // blocked-after.png はどのページでも使わないため撮らない。
  // 代わりに、配置不可にしたマスを避けて自動配置が成功したことだけを確かめる
  const blockedRun=await sc.page.evaluate(()=>{
    if(!hasResult||!lastSp) return {hasResult:false};
    const col=lastSp.find(s=>s.name==='メイン').cols[1];
    return {hasResult:true,blockedColFilled:col.fills.length>0};
  });
  expect(blockedRun.hasResult && !blockedRun.blockedColFilled,'配置不可のマスを避けた自動配置が実行できていない',blockedRun);
  out.blockedRun=blockedRun;
  await sc.context.close();

  // ---- P9 「半」：初期位置の印 → 設定 ON → 半を設定 → 半を自動に戻す ----
  sc=await openScene(browser,{state:S.withSettings(s2,{'palletApp.halfManual':'true'}),viewport:{width:1100,height:1200},tab:'配置編集'});
  const halfCol=`#zone-near .colwrap[data-space="メイン"]:has(.cell.half[data-lot="4"])`;
  expect(await sc.page.locator(halfCol).count()===1,'111-1113 の「半」の列が1つではない');
  const lot4=sc.page.locator(`${halfCol} .cell[data-lot="4"]`);
  // 列全体だと縦に長く「半」の印が小さくなるため、そのロットのマスだけに絞る
  const lot4Sel=`${halfCol} .cell[data-lot="4"]`;
  await clipShot(sc.page,'half-badge',await unionRect(sc.page,lot4Sel,4));
  // P9 4.6 の拡大図：最下段（「半」の印）とその上1マスを、画像を引き伸ばさず
  // deviceScaleFactor:4 で撮り直す。矩形は CSS px なので通常倍率の場面のものをそのまま使える
  const halfZoomRect=await tailRect(sc.page,lot4Sel,2,4);
  const scZoom=await openScene(browser,{state:S.withSettings(s2,{'palletApp.halfManual':'true'}),viewport:{width:1100,height:1200},tab:'配置編集',deviceScaleFactor:4});
  await clipShot(scZoom.page,'half-badge-zoom',halfZoomRect);
  await scZoom.context.close();
  const idxHalf=async()=>lot4.evaluateAll(es=>es.findIndex(e=>e.classList.contains('half')));
  const halfBefore=await idxHalf();
  await gotoTab(sc.page,'設定');
  await sc.page.locator('#subtab-display').click();
  expect(await sc.page.locator('#halfManualChk').isChecked(),'「半」の手動設定が ON になっていない');
  // 見出し「配置のしかた」は他のチェックボックスと共有のため含めない。#halfManualChk の行だけに絞る
  // （label.chk は inline-flex で文字幅に収まるので、そのまま使う。p03 の setting-frac と同じやり方）
  const placementRect=await sc.page.evaluate(()=>{
    const label=document.querySelector('label.chk:has(#halfManualChk)');
    const r=label.getBoundingClientRect();
    // 前後のチェックボックス・ヒント文と間隔が詰まっているため、pad は小さくする
    const pad=2;
    return {x:r.left+scrollX-pad,y:r.top+scrollY-pad,width:r.width+pad*2,height:r.height+pad*2};
  });
  await clipShot(sc.page,'setting-placement',placementRect);
  await gotoTab(sc.page,'配置編集');
  // 一番上のマス（「半」ではない）を選ぶ
  await lot4.nth(0).click();
  expect((await sc.page.locator('#halfBtnText').innerText()).trim()==='半を設定','ボタンが「半を設定」ではない');
  await clipShot(sc.page,'half-before',await unionRect(sc.page,lot4Sel,4));
  await shot(sc.page,'half-button','#toolFlag');
  await sc.page.locator('#halfBtn').click();
  await sc.page.waitForTimeout(300);
  const halfAfter=await idxHalf();
  expect(halfAfter===0 && halfBefore!==0,'「半」が選んだマスへ移っていない',{halfBefore,halfAfter});
  await clipShot(sc.page,'half-after',await unionRect(sc.page,lot4Sel,4));
  await lot4.nth(0).click();
  const autoLabel=(await sc.page.locator('#halfBtnText').innerText()).trim();
  expect(autoLabel==='半を自動に戻す','指定した「半」を選んでも「半を自動に戻す」にならない',autoLabel);
  await shot(sc.page,'half-auto-button','#toolFlag');
  out.half={before:halfBefore,after:halfAfter,autoLabel};
  await sc.context.close();

  record('edit',out);
};
