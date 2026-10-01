const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const B=require('../lib/build-lib.cjs');

test('parsePage は先頭のメタ情報と本文を分ける',()=>{
  const p=B.parsePage('<!--page {"title":"3. 入力（1）","lead":"リード","tab":"入力"} -->\n<p>本文</p>\n','p03.html');
  assert.deepEqual(p.meta,{tab:'入力',cls:'',nav:true,title:'3. 入力（1）',lead:'リード'});
  assert.equal(p.body,'<p>本文</p>\n');
});

test('parsePage はメタ情報が無ければファイル名付きで止める',()=>{
  assert.throws(()=>B.parsePage('<p>本文</p>','p05.html'),/p05\.html/);
  assert.throws(()=>B.parsePage('<!--page {"lead":"x"} -->','p06.html'),/p06\.html: title/);
});

test('renderPage は章の位置・見出し・ページ番号を付ける',()=>{
  const html=B.renderPage({meta:{title:'T',lead:'L',tab:'配置図',cls:'dense'},body:'<p>b</p>'},8,11,'フッター');
  assert.match(html,/<article class="page dense" id="p8">/);
  assert.match(html,/入力 → 配置編集 → <span class="active">配置図<\/span>/);
  assert.match(html,/<h1>T<\/h1><p class="lead">L<\/p><p>b<\/p>/);
  assert.match(html,/<span>8 \/ 11<\/span>/);
});

test('fillDialogs は記録した文言を画面例にし、改行を保ち、HTMLを無害化する',()=>{
  const out=B.fillDialogs('<div class="dialog-example" data-dialog="split"></div>',{split:'A <b> が\n2か所'});
  assert.match(out,/画面例：確認ダイアログ（見た目はブラウザによって異なります）/);
  assert.match(out,/A &lt;b&gt; が<br>2か所/);
});

test('fillDialogs は文言が無ければ止める',()=>{
  assert.throws(()=>B.fillDialogs('<div class="dialog-example" data-dialog="register"></div>',{}),/register/);
});

test('embedAssets は画像を data URI にし、無ければ止める',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-build-'));
  fs.mkdirSync(path.join(dir,'assets'));
  fs.writeFileSync(path.join(dir,'assets','a.png'),Buffer.from([1,2,3]));
  assert.equal(B.embedAssets('<img src="assets/a.png">',dir),'<img src="data:image/png;base64,AQID">');
  assert.throws(()=>B.embedAssets('<img src="assets/none.png">',dir),/none\.png/);
});

test('buildHtml はページ数ぶんの目次リンクとページを並べる',()=>{
  const pages=[1,2].map(i=>({meta:{title:'T'+i,lead:'',tab:'',cls:''},body:''}));
  const html=B.buildHtml(pages,{css:'x{}',footer:'F'});
  assert.match(html,/<a href="#p1">P1<\/a><a href="#p2">P2<\/a>/);
  assert.equal((html.match(/<article /g)||[]).length,2);
  assert.match(html,/<span>2 \/ 2<\/span>/);
});

test('parsePage は nav の既定を true にする',()=>{
  const p=B.parsePage('<!--page {"title":"T","lead":"L"} -->\n','px.html');
  assert.equal(p.meta.nav,true);
});

test('renderPage は nav:false のとき章の位置表示を出さない',()=>{
  const html=B.renderPage({meta:{title:'T',lead:'L',tab:'',cls:'',nav:false},body:''},1,2,'F');
  assert.doesNotMatch(html,/入力 → 配置編集/);
  assert.match(html,/パレット配置アプリ 操作マニュアル/);
});

test('pageRefs は P数字と範囲を拾い、SNP やタグの中は拾わない',()=>{
  const html='<p>詳しくは（P9）。入力 P3〜5。SNP12 は数えない。</p><img alt="P99" src="assets/p1.png">';
  assert.deepEqual(B.pageRefs(html),[9,3,5]);
});

test('checkPageRefs は範囲外の参照で止める',()=>{
  const pages=[{meta:{},body:'<p>P2</p>'},{meta:{},body:'<p>P3</p>'}];
  assert.throws(()=>B.checkPageRefs(pages,['p01.html','p02.html']),/p02\.html: ページ参照 P3 が範囲外（全2 ページ）/);
  assert.doesNotThrow(()=>B.checkPageRefs([{meta:{},body:'<p>P1</p>'}],['p01.html']));
});

test('injectMarkers は札と細枠を差し込み、表と札の食い違いで止める',()=>{
  const ov={input:{markers:[{key:'A',label:'搬入日',x:10,y:20,side:'t',box:{x:5,y:15,w:10,h:5}}]}};
  const ok='<div class="ov" data-ov="input"><img src="assets/x.png"></div>'
    +'<table><tr data-key="A"><td>A</td><td>搬入日</td><td>説明</td></tr></table>';
  const out=B.injectMarkers(ok,ov,'p03.html');
  assert.match(out,/<span class="ov-tag t" style="left:10%;top:20%">A<\/span>/);
  assert.match(out,/class="ov-box"/);
  assert.throws(()=>B.injectMarkers(ok.replace('搬入日</td><td>説明','日付</td><td>説明'),ov,'p03.html'),/表の名前が札と一致しません/);
  assert.throws(()=>B.injectMarkers(ok,{},'p03.html'),/札の位置がありません: input/);
});
