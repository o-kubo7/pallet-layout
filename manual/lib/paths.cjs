// マニュアル制作で使う場所。テストでは MANUAL_DIST で出力先を差し替える
const path=require('node:path');
const MANUAL=path.resolve(__dirname,'..');
const ROOT=path.resolve(MANUAL,'..');
module.exports={
  MANUAL,
  ROOT,
  APP_URL:'file://'+path.join(ROOT,'files','index.html'),
  STATE:path.join(MANUAL,'state'),
  ASSETS:path.join(MANUAL,'assets'),
  DIST:process.env.MANUAL_DIST||path.join(MANUAL,'dist'),
  PAGES:path.join(MANUAL,'pages'),
};
