// pages/pNN.html ＋ style.css → dist/操作マニュアル.html（画像は埋め込み）
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const B=require('./lib/build-lib.cjs');
const V=require('./lib/verify.cjs');

const files=fs.readdirSync(P.PAGES).filter(f=>/^p\d\d\.html$/.test(f)).sort();
if(!files.length) throw new Error('pages/ にページがありません');
const pages=files.map(f=>B.parsePage(fs.readFileSync(path.join(P.PAGES,f),'utf8'),f));
const css=fs.readFileSync(path.join(P.MANUAL,'style.css'),'utf8');
const v=V.load();
const dialogs={...((v.input||{}).dialogs||{}),...((v.edit||{}).dialogs||{})};
const app=(v.states||{}).app||{};
if(!app.cacheVersion) throw new Error('アプリ版が未記録です（先に node capture.cjs states を実行）');
let html=B.buildHtml(pages,{css,footer:`PC操作用 ・ デモデータ使用 ／ 2026年9月版（アプリ ${app.cacheVersion}）`});
html=B.fillDialogs(html,dialogs);
html=B.embedAssets(html,P.MANUAL);
fs.mkdirSync(P.DIST,{recursive:true});
fs.writeFileSync(path.join(P.DIST,'操作マニュアル.html'),html);
console.log('build:',files.length,'pages');
