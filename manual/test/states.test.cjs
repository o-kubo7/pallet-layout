const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const S=require('../lib/states.cjs');
const src=JSON.parse(fs.readFileSync(path.join(__dirname,'..','state','source-export.json'),'utf8'));
const sched=st=>JSON.parse(st['palletApp.schedule']);
const flat=st=>sched(st).shifts.am.slips.flatMap(s=>s.items);
const srcItems=JSON.parse(src['palletApp.schedule']).shifts.am.slips[0].items;

test('s2 は伝票を5枚に分け、品目の並びと中身を変えない',()=>{
  const st=S.makeFinal(src);
  const slips=sched(st).shifts.am.slips;
  assert.equal(slips.length,5);
  assert.deepEqual(slips.map(s=>s.items.map(i=>i.lot)),[
    ['111'],['222'],['111-1111','111-1112','111-1113'],['222-2222','222-2223','333-3333'],['333-3334','444-4444'],
  ]);
  assert.ok(slips.every(s=>s.status==='fax'));
  assert.deepEqual(flat(st),srcItems);
  assert.ok(sched(st).shifts.am.manual,'手動配置が残る');
  assert.ok(sched(st).shifts.am.result,'自動配置の結果が残る');
});

test('s1 は FAX⑤ を仮伝票にし、仕掛品4 を予定の 28500 にして配置を持たない',()=>{
  const st=S.makePlanned(src);
  const am=sched(st).shifts.am;
  assert.equal(am.slips[4].status,'provisional');
  assert.ok(am.slips.slice(0,4).every(s=>s.status==='fax'));
  const p4=flat(st).find(i=>i.lot==='444-4444');
  assert.equal(p4.qty,'28500');
  assert.equal(am.result,null);
  assert.equal(am.manual,null);
  assert.equal(am.resultFingerprint,null);
  assert.deepEqual(am.sheetEdits,{sig:'',marks:{}});
  // 品目IDと並びは s2 と同じ（受領後に指紋が一致するため）
  assert.deepEqual(flat(st).map(i=>i.id),srcItems.map(i=>i.id));
});

test('設定は 半表示 ON・分割確認 ON・半手動 OFF に固定する',()=>{
  for(const st of [S.makeFinal(src),S.makePlanned(src)]){
    assert.equal(st['palletApp.frac'],'true');
    assert.equal(st['palletApp.splitConfirm'],'true');
    assert.equal(st['palletApp.halfManual'],'false');
  }
});

test('stripManual は手動配置だけを外す',()=>{
  const st=S.stripManual(S.makeFinal(src));
  const am=sched(st).shifts.am;
  assert.equal(am.manual,null);
  assert.ok(am.result);
});

test('withSettings は指定したキーだけ変え、元を変更しない',()=>{
  const base=S.makeFinal(src);
  const st=S.withSettings(base,{'palletApp.halfManual':'true'});
  assert.equal(st['palletApp.halfManual'],'true');
  assert.equal(base['palletApp.halfManual'],'false');
});

test('書き出しデータが想定と違えば止める',()=>{
  const bad={...src,'palletApp.schedule':JSON.stringify({version:1,shifts:{am:{slips:[{items:[]}]}}})};
  assert.throws(()=>S.makeFinal(bad),/10品目/);
});
