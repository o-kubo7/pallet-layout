// 撮影。node capture.cjs [states|input|edit|sheet|overview|all]
const {launch}=require('./lib/scene.cjs');
const ORDER=['states','input','edit','sheet','overview'];
(async()=>{
  const arg=process.argv[2]||'all';
  const names=arg==='all'?ORDER:[arg];
  for(const n of names) if(!ORDER.includes(n)) throw new Error('不明なグループ: '+n);
  const browser=await launch();
  try{
    for(const n of names){
      console.log('capture:',n);
      await require('./capture/'+n+'.cjs')(browser);
    }
  }finally{
    await browser.close();
  }
})().catch(e=>{ console.error(e); process.exit(1); });
