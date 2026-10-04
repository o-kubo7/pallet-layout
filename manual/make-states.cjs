// state/source-export.json → s1-planned.json / s2-final.json
// source-export.json は旧エリア名のまま残し、読み込み後に毎回 renameSpaces で新名にする
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const S=require('./lib/states.cjs');
const src=S.renameSpaces(JSON.parse(fs.readFileSync(path.join(P.STATE,'source-export.json'),'utf8')));
const write=(name,obj)=>fs.writeFileSync(path.join(P.STATE,name),JSON.stringify(obj,null,1)+'\n');
write('s1-planned.json',S.makePlanned(src));
write('s2-final.json',S.makeFinal(src));
console.log('states: s1-planned.json, s2-final.json');
