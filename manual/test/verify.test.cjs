const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');

test('expect は条件が偽なら詳細付きで例外を投げる',()=>{
  const {expect}=require('../lib/verify.cjs');
  assert.doesNotThrow(()=>expect(true,'ok'));
  assert.throws(()=>expect(false,'合計が違う',{got:99}),/合計が違う \{"got":99\}/);
});

test('record はグループ単位で上書きし、他のグループを残す',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'manual-verify-'));
  process.env.MANUAL_DIST=dir;
  delete require.cache[require.resolve('../lib/paths.cjs')];
  delete require.cache[require.resolve('../lib/verify.cjs')];
  const V=require('../lib/verify.cjs');
  V.record('input',{a:1});
  V.record('edit',{b:2});
  V.record('input',{a:3});
  assert.deepEqual(V.load(),{input:{a:3},edit:{b:2}});
  delete process.env.MANUAL_DIST;
  delete require.cache[require.resolve('../lib/paths.cjs')];
  delete require.cache[require.resolve('../lib/verify.cjs')];
});

test('paths は manual/ とリポジトリのルートを指す',()=>{
  const P=require('../lib/paths.cjs');
  assert.ok(fs.existsSync(path.join(P.ROOT,'files','index.html')));
  assert.equal(path.basename(P.MANUAL),'manual');
  assert.ok(P.APP_URL.startsWith('file://')&&P.APP_URL.endsWith('/files/index.html'));
});
