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
  return {meta:{tab:'',cls:'',nav:true,...meta},body:text.slice(m[0].length)};
}
function renderPage({meta,body},index,total,footer){
  const nav=meta.nav===false?'':CHAPTERS.map(t=>t===meta.tab?`<span class="active">${t}</span>`:t).join(' → ');
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
// 本文中のページ参照（P9、P3〜5）。タグの中と、英字に続く P（SNP など）は数えない
function pageRefs(html){
  const text=html.replace(/<[^>]*>/g,' ');
  const out=[];
  for(const m of text.matchAll(/(?<![A-Za-z])P(\d+)(?:〜(\d+))?/g)){
    out.push(+m[1]);
    if(m[2]) out.push(+m[2]);
  }
  return out;
}
function checkPageRefs(pages,files){
  const total=pages.length;
  pages.forEach((p,i)=>{
    for(const n of pageRefs(p.body)){
      if(n<1||n>total) throw new Error(`${files[i]}: ページ参照 P${n} が範囲外（全${total} ページ）`);
    }
  });
}
// <div class="ov" data-ov="…"><img …></div> に、細枠と札を差し込む。
// ページ内の札（図の順）と、表（tr data-key）の記号・名前が一致しなければ止める
function injectMarkers(html,ov,file){
  const labels=new Map();
  const out=html.replace(/<div class="ov" data-ov="([A-Za-z]+)">([\s\S]*?)<\/div>/g,(all,name,inner)=>{
    const g=ov[name];
    if(!g||!Array.isArray(g.markers)) throw new Error(file+': 札の位置がありません: '+name+'（先に node capture.cjs overview）');
    for(const m of g.markers){
      if(labels.has(m.key)&&labels.get(m.key)!==m.label) throw new Error(file+': 札の記号が重複しています: '+m.key);
      labels.set(m.key,m.label);
    }
    const boxes=g.markers.map(m=>`<span class="ov-box" style="left:calc(${m.box.x}% - 3px);top:calc(${m.box.y}% - 3px);width:calc(${m.box.w}% + 6px);height:calc(${m.box.h}% + 6px)"></span>`).join('');
    const tags=g.markers.map(m=>`<span class="ov-tag ${m.side}" style="left:${m.x}%;top:${m.y}%">${m.key}</span>`).join('');
    return `<div class="ov" data-ov="${name}">${inner}${boxes}${tags}</div>`;
  });
  if(!labels.size) throw new Error(file+': 見取り図の図（div.ov）がありません');
  const rows=[...html.matchAll(/<tr data-key="([A-Z])"><td>[\s\S]*?<\/td><td>([\s\S]*?)<\/td>/g)].map(r=>[r[1],r[2]]);
  const want=[...labels.keys()];
  if(rows.map(r=>r[0]).join()!==want.join()) throw new Error(file+': 表の記号が札と一致しません: 表='+rows.map(r=>r[0]).join()+' 札='+want.join());
  for(const [k,label] of rows){
    if(label!==labels.get(k)) throw new Error(file+': 表の名前が札と一致しません: '+k+' 表='+label+' 札='+labels.get(k));
  }
  return out;
}
module.exports={esc,parsePage,renderPage,fillDialogs,embedAssets,buildHtml,injectMarkers,pageRefs,checkPageRefs};
