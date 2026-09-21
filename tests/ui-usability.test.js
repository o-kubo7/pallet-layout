const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

/* ===== 1. 更新バナーが「自動配置を作成」を覆わない ===== */

test("更新バナーが出ている間は下部バーを押し上げる", () => {
  // #updateBar（z-index:60）と .actionbar（z-index:40）はどちらも bottom:0 に固定
  // されているので、バナーが出るとボタンが押せなくなる。バナーの高さぶん上げる。
  const css = source.match(/body\.has-update \.actionbar\{[^}]*\}/);
  assert.notEqual(css, null, "body.has-update .actionbar の指定がない");
  assert.match(css[0], /bottom:var\(--updatebar-h\)/);
});

test("更新バナーの高さは実測して CSS 変数に入れる", () => {
  // safe-area を含む実際の高さは端末で変わるので、固定値を書かない
  assert.match(source, /setProperty\("--updatebar-h"/);
});

test("更新バナーを出すときに has-update を付ける", () => {
  assert.match(source, /classList\.add\("has-update"\)/);
});

test("更新バナーぶんだけ本文の下余白も増やす", () => {
  // 押し上げた .actionbar に最下部のカードが隠れないようにする
  const css = source.match(/body\.has-update \.wrap\{[^}]*\}/);
  assert.notEqual(css, null, "body.has-update .wrap の指定がない");
  assert.match(css[0], /--updatebar-h/);
});

/* ===== 2. 入力済みの品目行は確認してから消す ===== */

test("入力済みの品目行を消すときは確認する", () => {
  const fn = source.match(/function removeItemRow\(button\)\{[\s\S]*?\n\}/);
  assert.notEqual(fn, null);
  assert.match(fn[0], /confirm\(/);
});

test("空の品目行は確認せずに消す", () => {
  // 品名・ロット・SNP・個数がどれも空の行は、消しても失うものがない
  const fn = source.match(/function removeItemRow\(button\)\{[\s\S]*?\n\}/);
  assert.notEqual(fn, null);
  assert.match(fn[0], /itemRowIsEmpty\(tr\)/);
  assert.match(source, /function itemRowIsEmpty\(tr\)\{/);
});

/* ===== 3. 列の残量表示（colcap）を読める大きさにする ===== */

test("列の残量は14px以上で出す", () => {
  const css = source.match(/\n  \.colcap\{[^}]*\}/);
  assert.notEqual(css, null);
  assert.match(css[0], /font-size:14px/);
});

test("列の残量の文字色は薄すぎない", () => {
  // #9ca3af は白地でコントラスト約2.5:1（WCAG AA の 4.5:1 に届かない）
  const css = source.match(/\n  \.colcap\{[^}]*\}/);
  assert.notEqual(css, null);
  assert.equal(css[0].includes("#9ca3af"), false);
});

test("列キャップは残量だけを出す", () => {
  // 通路は見た目で分かる。列そのものが通路なら破線の枠、列の中の緊急用の
  // 通路マスなら灰色のマス。メインの列は幅44pxしかないので文字を足さない
  const cap = source.match(/const cap = `<div class="colcap">[\s\S]*?<\/div>`;/);
  assert.notEqual(cap, null, "列キャップを組み立てるコードが見つからない");
  assert.match(cap[0], /\$\{used\(col\)\}\/\$\{usableCount\(col,col\.blockedRows\)\}<\/div>/);
  assert.equal(cap[0].includes("通"), false);
});

/* ===== 4. 設定タブのバッジは出さない ===== */

test("設定タブに件数バッジを出さない", () => {
  // 「23」だけでは何の数か分からない。件数は設定タブの中の #regInfo で足りる
  assert.equal(source.includes('id="regDot"'), false);
  assert.equal(source.includes("regDot"), false);
});

/* ===== 5. 「満杯時に混載を許可」は設定タブに置いて保存する ===== */

test("混載の設定は設定タブにある", () => {
  const settings = source.slice(
    source.indexOf('<div id="tab-settings"'),
    source.indexOf('<div class="actionbar"')
  );
  assert.match(settings, /id="mixChk"/);
});

test("混載の設定は入力タブから消す", () => {
  const input = source.slice(
    source.indexOf('<div id="tab-input"'),
    source.indexOf('<div id="tab-edit"')
  );
  assert.equal(input.includes("mixChk"), false);
});

test("混載の設定はこの端末に保存する", () => {
  // 今は保存されておらず、読み込むたびに「許可」へ戻ってしまう
  assert.match(source, /mix:"palletApp\.mix"/);
  assert.match(source, /function toggleMix\(\)\{/);
  assert.match(source, /saveData\(STORE_KEY\.mix/);
  assert.match(source, /loadData\(STORE_KEY\.mix\)/);
});

/* ===== 6. 入力タブの配置ルールは畳んでおく ===== */

test("配置のルールは折りたたみの中に入れる", () => {
  const details = source.match(/<details class="note-fold">[\s\S]*?<\/details>/);
  assert.notEqual(details, null, "配置のルールを包む <details> がない");
  assert.match(details[0], /<summary>配置のルール<\/summary>/);
  assert.match(details[0], /<div class="note">/);
});

test("配置のルールは既定で閉じておく", () => {
  const details = source.match(/<details class="note-fold"[^>]*>/);
  assert.notEqual(details, null);
  assert.equal(details[0].includes("open"), false);
});
