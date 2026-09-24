// 撮影時の検証。食い違いは例外で止め、結果は dist/verification.json に残す
const fs=require('node:fs');
const path=require('node:path');
const P=require('./paths.cjs');
const FILE=path.join(P.DIST,'verification.json');

function load(){
  try{ return JSON.parse(fs.readFileSync(FILE,'utf8')); }catch{ return {}; }
}
function record(group,data){
  fs.mkdirSync(P.DIST,{recursive:true});
  const all=load();
  all[group]=data;
  fs.writeFileSync(FILE,JSON.stringify(all,null,2)+'\n');
}
function expect(ok,msg,detail){
  if(!ok) throw new Error(msg+(detail===undefined?'':' '+JSON.stringify(detail)));
}
module.exports={expect,record,load,FILE};
