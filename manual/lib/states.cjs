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
