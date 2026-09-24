// 状態ファイルがアプリで想定どおりに開くかを確かめる（撮影はしない）
const fs=require('node:fs');
const path=require('node:path');
const P=require('../lib/paths.cjs');
const {openScene,loadState,inputInfo,mainSig,appMainSig}=require('../lib/scene.cjs');
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
