const {chromium}=require('playwright');
const fs=require('node:fs');
const dir='/Users/kenichihanada/web-app/pallet-layout/outputs/manual-20260922';
(async()=>{
const b=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const p=await b.newPage({viewport:{width:1000,height:1300},deviceScaleFactor:1});
await p.goto('file://'+dir+'/操作マニュアル.html');await p.evaluate(()=>document.fonts.ready);await p.emulateMedia({media:'print'});
const layout=await p.locator('.page').evaluateAll(ps=>ps.map((e,i)=>{const c=e.querySelector('.content').getBoundingClientRect(), f=e.querySelector('.footer').getBoundingClientRect();return {page:i+1,spaceToFooter:Math.round(f.top-c.bottom),images:[...e.querySelectorAll('img')].every(x=>x.complete&&x.naturalWidth>0)}}));
console.log(JSON.stringify(layout));
fs.writeFileSync(dir+'/layout-check.json',JSON.stringify(layout,null,2));
await p.pdf({path:dir+'/操作マニュアル.pdf',preferCSSPageSize:true,printBackground:true});
await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
