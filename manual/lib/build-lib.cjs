// ページ別HTML（pages/pNN.html）を1冊にまとめる部品
const fs=require('node:fs');
const path=require('node:path');
const CHAPTERS=['入力','配置編集','配置図'];

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function parsePage(text,file){
  const m=/^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/.exec(text);
  if(!m) throw new Error(file+': 先頭に <!--page {...} --> がありません');
  const meta=JSON.parse(m[1]);
  for(const k of ['title','lead']){
    if(typeof meta[k]!=='string') throw new Error(file+': '+k+' がありません');
  }
  return {meta:{tab:'',cls:'',...meta},body:text.slice(m[0].length)};
}
function renderPage({meta,body},index,total,footer){
  const nav=CHAPTERS.map(t=>t===meta.tab?`<span class="active">${t}</span>`:t).join(' → ');
  return `<article class="page ${meta.cls}" id="p${index}">`
    +`<div class="eyebrow"><span>パレット配置アプリ 操作マニュアル</span><span>${nav}</span></div>`
    +`<div class="content"><h1>${meta.title}</h1><p class="lead">${meta.lead}</p>${body}</div>`
    +`<footer class="footer"><span>${footer}</span><span>${index} / ${total}</span></footer></article>`;
}
// confirm() は画像に写らないので、撮影時に記録した文言から画面例を組む
function fillDialogs(html,dialogs){
  return html.replace(/<div class="dialog-example" data-dialog="([a-z]+)"><\/div>/g,(all,key)=>{
    const msg=dialogs[key];
    if(typeof msg!=='string'||!msg) throw new Error('確認ダイアログの文言がありません: '+key+'（先に capture を実行）');
    return '<div class="dialog-example">'
      +'<div class="dialog-title">画面例：確認ダイアログ（見た目はブラウザによって異なります）</div>'
      +`<div class="dialog-body">${esc(msg).replace(/\n/g,'<br>')}</div>`
      +'<div class="dialog-buttons"><span>キャンセル</span><span class="ok">OK</span></div></div>';
  });
}
function embedAssets(html,baseDir){
  return html.replace(/src="(assets\/[^"]+\.png)"/g,(all,rel)=>{
    const p=path.join(baseDir,rel);
    if(!fs.existsSync(p)) throw new Error('画像がありません: '+rel);
    return 'src="data:image/png;base64,'+fs.readFileSync(p).toString('base64')+'"';
  });
}
function buildHtml(pages,{css,footer}){
  const total=pages.length;
  const nav='<nav class="webnav">'+pages.map((_,i)=>`<a href="#p${i+1}">P${i+1}</a>`).join('')+'</nav>';
  return '<!doctype html><html lang="ja"><head><meta charset="utf-8">'
    +'<meta name="viewport" content="width=device-width, initial-scale=1">'
    +'<title>パレット配置アプリ 操作マニュアル</title><style>'+css+'</style></head><body>'
    +nav+pages.map((p,i)=>renderPage(p,i+1,total,footer)).join('')+'</body></html>';
}
module.exports={esc,parsePage,renderPage,fillDialogs,embedAssets,buildHtml};
