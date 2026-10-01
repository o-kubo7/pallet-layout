// dist/操作マニュアル.html → PDF、紙面検査（layout-check.json）、ページのプレビュー画像
const fs=require('node:fs');
const path=require('node:path');
const P=require('./lib/paths.cjs');
const {launch}=require('./lib/scene.cjs');

(async()=>{
  const browser=await launch();
  const page=await browser.newPage({viewport:{width:1000,height:1300},deviceScaleFactor:1});
  await page.goto('file://'+path.join(P.DIST,'操作マニュアル.html'));
  await page.evaluate(()=>document.fonts.ready);
  await page.emulateMedia({media:'print'});
  const layout=await page.locator('.page').evaluateAll(ps=>ps.map((e,i)=>{
    const c=e.querySelector('.content').getBoundingClientRect();
    const f=e.querySelector('.footer').getBoundingClientRect();
    const pr=e.getBoundingClientRect();
    const tagsOut=[...e.querySelectorAll('.ov-tag')].filter(t=>{
      const r=t.getBoundingClientRect();
      return r.left<pr.left||r.right>pr.right||r.top<c.top-40||r.bottom>f.top;
    }).map(t=>t.textContent);
    return {page:i+1,spaceToFooter:Math.round(f.top-c.bottom),
      images:[...e.querySelectorAll('img')].every(x=>x.complete&&x.naturalWidth>0),tagsOut};
  }));
  fs.writeFileSync(path.join(P.DIST,'layout-check.json'),JSON.stringify(layout,null,2)+'\n');
  const prev=path.join(P.DIST,'preview');
  fs.rmSync(prev,{recursive:true,force:true});
  fs.mkdirSync(prev,{recursive:true});
  const els=page.locator('.page');
  for(let i=0;i<layout.length;i++){
    await els.nth(i).screenshot({path:path.join(prev,'p'+String(i+1).padStart(2,'0')+'.png')});
  }
  await page.pdf({path:path.join(P.DIST,'操作マニュアル.pdf'),preferCSSPageSize:true,printBackground:true});
  await browser.close();
  console.log(JSON.stringify(layout));
  const bad=layout.filter(l=>l.spaceToFooter<0||!l.images||l.tagsOut.length);
  if(bad.length){ console.error('はみ出し・画像欠け・札のはみ出し:',JSON.stringify(bad)); process.exit(1); }
})().catch(e=>{ console.error(e); process.exit(1); });
