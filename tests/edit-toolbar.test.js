const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

test("配置不可エリアのボタンは「設定」と呼ぶ", () => {
  // ボタンの文言と、押している間の文言の2か所が同じ言い方になっていること
  assert.match(source, /onclick="setBlockedEditMode\(true\)">配置不可エリアを設定<\/button>/);
  assert.match(
    source,
    /blockedEditMode \? "配置不可エリアを設定中" : "配置不可エリアを設定"/
  );
  assert.equal(source.includes("配置不可エリアを編集</button>"), false);
  assert.equal(source.includes("配置不可エリアを編集中"), false);
});

test("配置編集タブの「あさ／ひる」と操作ボタンは同じ行に並べる", () => {
  // .edit-toolbar が .timing-switch と #editCtl の両方を囲んでいること
  const start = source.indexOf('<div class="edit-toolbar">');
  assert.notEqual(start, -1);
  const head = source.slice(start, start + 400);
  assert.match(head, /<div class="timing-switch" data-timing-switch><\/div>/);
  assert.match(head, /<div class="editctl" id="editCtl">/);

  const css = source.match(/\.edit-toolbar\{[^}]*\}/);
  assert.notEqual(css, null);
  assert.match(css[0], /display:flex/);
  assert.match(css[0], /align-items:center/);
  // 入りきらない幅では折り返す（スマホ幅で横にはみ出さないため）
  assert.match(css[0], /flex-wrap:wrap/);
  // 操作ボタンは右詰め
  assert.match(source, /\.edit-toolbar \.editctl\{[^}]*margin-left:auto/);
});

// 開始タグから対応する閉じタグまでを切り出す（div のネストを数える）
function innerHtmlOf(html, openTag) {
  const start = html.indexOf(openTag);
  assert.notEqual(start, -1, `${openTag} が見つからない`);
  let i = start + openTag.length;
  let depth = 1;
  const re = /<div\b[^>]*>|<\/div>/g;
  re.lastIndex = i;
  let m;
  while ((m = re.exec(html))) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return html.slice(i, m.index);
  }
  throw new Error(`${openTag} の閉じタグが見つからない`);
}

test("設定中の操作帯はツールバーの外に置く", () => {
  // .blocked-edit-actions は width:100%。#editCtl の中に入れると、
  // 設定中に #editCtl の幅が行いっぱいになり、.edit-toolbar の行に
  // 収まらず #editCtl ごと次の行へ落ちて「あさ／ひる」だけが取り残される
  const toolbar = innerHtmlOf(source, '<div class="edit-toolbar">');
  assert.equal(toolbar.includes('id="blockedEditActions"'), false);
  assert.match(source, /<div class="blocked-edit-actions" id="blockedEditActions" hidden>/);
});
