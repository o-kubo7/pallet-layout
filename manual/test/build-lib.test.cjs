const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const B=require('../lib/build-lib.cjs');

test('parsePage は先頭のメタ情報と本文を分ける',()=>{
  const p=B.parsePage('<!--page {"title":"3. 入力（1）","lead":"リード","tab":"入力"} -->\n<p>本文</p>\n','p03.html');
  assert.deepEqual(p.meta,{tab:'入力',cls:'',title:'3. 入力（1）',lead:'リード'});
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
