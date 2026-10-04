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
  // 仮伝票はFAX未着時点の入力なのでロットは空欄（FAX到着後に受領操作で入力する）
  am.slips[4].items.forEach(i=>{i.lot='';});
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
// 画面の見取り図（試作）用。s1 から先頭のFAX伝票と仮伝票だけを残し、入力画面を1ページに収める。
// 途中の伝票を省くだけで、残す伝票の中身・順番・設定は変えない
function overviewInput(state){
  const sch=JSON.parse(state['palletApp.schedule']);
  const am=sch.shifts.am;
  const fax=am.slips.find(s=>s.status==='fax');
  const prov=am.slips.find(s=>s.status==='provisional');
  if(!fax||!prov) throw new Error('見取り図用の状態には、FAX伝票と仮伝票が1つずつ要ります');
  am.slips=[fax,prov];
  return {...state,'palletApp.schedule':JSON.stringify(sch)};
}
// アプリのエリア名変更（軒下①→軒下、軒下②→軒下奥）に合わせ、状態の文字列を置き換える。
// 指紋（manual.fp など）にも名前が入るので、単純置換で手動配置の復元も保てる
const SPACE_RENAMES=[['軒下②','軒下奥'],['軒下①','軒下']];
function renameSpaces(state){
  if(Object.prototype.hasOwnProperty.call(state,'palletApp.spaces')){
    throw new Error('palletApp.spaces があります。保存版の扱いを決めてから使ってください');
  }
  const out={};
  for(const [k,v] of Object.entries(state)){
    out[k]=typeof v==='string'?SPACE_RENAMES.reduce((t,[a,b])=>t.split(a).join(b),v):v;
  }
  return out;
}
module.exports={renameSpaces,SPACE_RENAMES,SLIP_GROUPS,makeFinal,makePlanned,stripManual,withSettings,overviewInput};
