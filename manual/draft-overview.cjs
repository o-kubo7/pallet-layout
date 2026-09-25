// 画面の見取り図（試作）の組版。drafts/ov-*.html ＋ style.css → dist/見取り図案.html・.pdf・draft-preview/ovN.png
// 本編（pages/・build.cjs・render.cjs）とは別。札の位置は verification.json の overview から差し込む
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const B=require('./lib/build-lib.cjs');
const V=require('./lib/verify.cjs');
const {launch}=require('./lib/scene.cjs');

const FILES=['ov-input.html','ov-edit.html','ov-sheet.html'];
const DRAFTS=path.join(P.MANUAL,'drafts');
const OUT_HTML=path.join(P.DIST,'見取り図案.html');
const OUT_PDF=path.join(P.DIST,'見取り図案.pdf');
const PREV=path.join(P.DIST,'draft-preview');

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

(async()=>{
  const v=V.load();
  const ov=v.overview;
  if(!ov) throw new Error('札の位置が未記録です（先に node capture.cjs overview を実行）');
  const app=(v.states||{}).app||{};
  const pages=FILES.map(f=>{
    const p=B.parsePage(fs.readFileSync(path.join(DRAFTS,f),'utf8'),f);
    p.body=injectMarkers(p.body,ov,f);
    return p;
  });
  const css=fs.readFileSync(path.join(P.MANUAL,'style.css'),'utf8');
  let html=B.buildHtml(pages,{css,footer:`試作：画面の見取り図 ・ デモデータ使用（アプリ ${app.cacheVersion||'版不明'}）`});
  html=B.embedAssets(html,P.MANUAL);
  fs.mkdirSync(P.DIST,{recursive:true});
  fs.writeFileSync(OUT_HTML,html);

  const browser=await launch();
  try{
    const page=await browser.newPage({viewport:{width:1000,height:1300},deviceScaleFactor:1});
    await page.goto('file://'+OUT_HTML);
    await page.evaluate(()=>document.fonts.ready);
    await page.emulateMedia({media:'print'});
    const layout=await page.locator('.page').evaluateAll(ps=>ps.map((e,i)=>{
      const c=e.querySelector('.content').getBoundingClientRect();
      const f=e.querySelector('.footer').getBoundingClientRect();
      // 札が紙面（.page）の外へはみ出していないか
      const pr=e.getBoundingClientRect();
      const tagsOut=[...e.querySelectorAll('.ov-tag')].filter(t=>{
        const r=t.getBoundingClientRect();
        return r.left<pr.left||r.right>pr.right||r.top<c.top-40||r.bottom>f.top;
      }).map(t=>t.textContent);
      return {page:i+1,spaceToFooter:Math.round(f.top-c.bottom),
        images:[...e.querySelectorAll('img')].every(x=>x.complete&&x.naturalWidth>0),tagsOut};
    }));
    fs.rmSync(PREV,{recursive:true,force:true});
    fs.mkdirSync(PREV,{recursive:true});
    const els=page.locator('.page');
    for(let i=0;i<layout.length;i++) await els.nth(i).screenshot({path:path.join(PREV,'ov'+(i+1)+'.png')});
    await page.pdf({path:OUT_PDF,preferCSSPageSize:true,printBackground:true});
    console.log(JSON.stringify(layout));
    const bad=layout.filter(l=>l.spaceToFooter<0||!l.images||l.tagsOut.length);
    if(bad.length){ console.error('はみ出し・画像欠け・札のはみ出し:',JSON.stringify(bad)); process.exitCode=1; }
  }finally{
    await browser.close();
  }
})().catch(e=>{ console.error(e); process.exit(1); });
