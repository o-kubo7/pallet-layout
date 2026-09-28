const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 開き括弧 { から対応する閉じ括弧 } までの中身を返す（入れ子を数える）
function blockFrom(open) {
  let depth = 0;
  for (let j = open; j < source.length; j++) {
    if (source[j] === "{") depth++;
    else if (source[j] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, j);
    }
  }
  throw new Error("閉じ括弧が見つからない");
}
// 同じ @media 条件のブロックをすべてつないで返す
function mediaCss(query) {
  const parts = [];
  let i = 0;
  while ((i = source.indexOf(query, i)) !== -1) {
    parts.push(blockFrom(source.indexOf("{", i)));
    i += query.length;
  }
  return parts.join("\n");
}
function fnBody(name) {
  const start = source.indexOf("function " + name + "(");
  assert.notEqual(start, -1, name + " が見つからない");
  return blockFrom(source.indexOf("{", start));
}

test("凡例1件は品名・ロット・パレット数を入れ物に分け、パレット数を太字にする", () => {
  assert.match(
    source,
    /<span class="lg-body"><span class="lg-name\$\{\[\.\.\.l\.name\]\.length>4\?" lg-long":""\}">\$\{esc\(l\.name\)\}<\/span><span class="lg-rest"><span class="lg-sep">\/<\/span>\$\{esc\(l\.lot\)\|\|"—"\}　<b>\$\{l\.pallets\}P<\/b>/
  );
});

test("製品だけ、番号の枠の中に「製」の印を入れる", () => {
  assert.match(source, /\$\{l\.type==="製品"\?'<i class="lg-mk">製<\/i>':""\}<\/span><span class="lg-body">/);
});

test("凡例1件の共通スタイル（どの画面幅でも効く）", () => {
  // 新しい span に .legend span の背景・余白・inline-flex が付かないよう打ち消す
  assert.match(
    source,
    /\.legend \.lg-body,\.legend \.lg-name,\.legend \.lg-rest,\.legend \.lg-sep\{display:inline;padding:0;background:none;border-radius:0\}/
  );
  assert.match(source, /\.legend \.lg-sep\{margin:0 \.3em\}/);
  assert.match(source, /\.legend \.lg-rest b\{font-weight:800\}/);
  assert.match(source, /\.legend \.swframe\{position:relative\}/);
  const mk = source.match(/\.legend \.lg-mk\{[^}]*\}/);
  assert.notEqual(mk, null);
  assert.match(mk[0], /position:absolute/);
  assert.match(mk[0], /top:-8px/);
  assert.match(mk[0], /left:-8px/);
  assert.match(source, /\.legend\.no-mk \.lg-mk\{display:none\}/);
  // .legend{display:flex} が UA の [hidden] に勝つので明示する
  assert.match(source, /\.legend\[hidden\]\{display:none\}/);
});

test("#editLayout が #mapBody を囲み、凡例は HTML 上は #mapBody の中に残す", () => {
  const lay = source.indexOf('<div class="editlayout lg-left" id="editLayout">');
  const mb = source.indexOf('<div id="mapBody">');
  const flag = source.indexOf('<div class="toolflag" id="toolFlag">');
  const lg = source.indexOf('<div id="legend" class="legend"></div>');
  assert.notEqual(lay, -1);
  assert.ok(lay < mb, "#editLayout は #mapBody より前で開く");
  // スマホ幅の並びを変えないため、凡例は #mapBody の中（帯の後ろ）のまま
  assert.ok(mb < flag && flag < lg);
  assert.equal(source.split('id="legend"').length, 2, "#legend は1か所だけ");
});

test("1280px 以上で、左/右のときは凡例を縦1列の sticky な列にする", () => {
  const css = mediaCss("@media (min-width:1280px)");
  assert.match(css, /\.editlayout\.lg-left,\.editlayout\.lg-right\{[^}]*display:flex/);
  assert.match(css, /\.editlayout\.lg-right>#legend\{[^}]*position:sticky/);
  assert.match(css, /\.editlayout\.lg-right>#legend\{[^}]*top:var\(--docktop,56px\)/);
  assert.match(css, /\.editlayout\.lg-right>#legend\{[^}]*flex-direction:column/);
  assert.match(css, /\.editlayout\.lg-right>#legend\{[^}]*min-width:min-content/);
  // 一番上の品目の「製」の印（上へ 8px はみ出す）が overflow で切れないように
  assert.match(css, /\.editlayout\.lg-right>#legend\{[^}]*padding-top:7px/);
  // 入りきらない品目だけ2行にする（ロット側が折り返す）
  assert.match(css, /\.editlayout>#legend \.lg-body\{[^}]*flex-wrap:wrap/);
  assert.match(css, /\.editlayout>#legend \.lg-body\{[^}]*overflow:hidden/);
  // 品名は1行で切り詰める。nowrap では最小幅が効かないため line-clamp を使う
  assert.match(css, /\.editlayout>#legend \.lg-name\{[^}]*-webkit-line-clamp:1/);
  assert.match(css, /\.editlayout>#legend \.lg-name\.lg-long\{min-width:4em\}/);
  // 2行目の先頭に来た「/」を入れ物の外へ押し出して隠す
  assert.match(css, /\.editlayout>#legend \.lg-rest\{margin-left:-1em;white-space:nowrap\}/);
  assert.match(css, /\.editlayout>#legend \.lg-sep\{display:inline-block;width:1em;margin:0;text-align:center\}/);
  assert.match(css, /\.editlayout\.lg-right>#mapBody\{[^}]*min-width:0/);
  assert.match(css, /#mapBody #stashBar\{contain:inline-size\}/);
  assert.match(css, /\.wrap\.legend-side\{max-width:1552px\}/);
});

test("syncLegendSide が凡例の置き場所・hidden・ページ幅をそろえる", () => {
  assert.match(source, /let legendPos="left";/);
  const body = fnBody("syncLegendSide");
  assert.match(body, /matchMedia\("\(min-width:1280px\)"\)/);
  assert.match(body, /insertBefore\(lg, *mb\)/);
  assert.match(body, /flag\.after\(lg\)/);
  assert.match(body, /lg\.hidden *=/);
  assert.match(body, /classList\.toggle\("legend-side"/);
});

test("syncLegendSide は盤の表示が切り替わる所から呼ぶ", () => {
  assert.match(fnBody("switchTab"), /syncLegendSide\(\)/);
  assert.match(fnBody("showMapState"), /syncLegendSide\(\);\s*syncFlagRect\(\);/);
  assert.match(fnBody("run"), /syncLegendSide\(\)/);
});

test("帯は凡例の列を避け、退避スペースを避ける処理より前で左右を詰める", () => {
  const body = fnBody("syncFlagRect");
  const lgAt = body.indexOf('getElementById("legend")');
  const dockAt = body.indexOf('if(dockPos!=="bottom")');
  assert.notEqual(lgAt, -1, "syncFlagRect が #legend を測っていない");
  assert.ok(lgAt < dockAt, "凡例を避ける処理は退避スペースの処理より前に置く");
  // 列になっているとき（親が #editLayout）だけ避ける。スマホ幅・「上」では避けない
  assert.match(body, /lg\.parentNode\.id==="editLayout"/);
  // 非表示タブでは幅0になる（2026-08-23 の教訓）。そのときは避けない
  assert.match(body, /lr\.width>0/);
  assert.match(body, /legendPos==="right"/);
});

test("マスの大きさを変えたら帯を測り直す（盤と凡例の幅が変わるため）", () => {
  assert.match(fnBody("setCellSize"), /syncFlagRect\(\)/);
});

test("表示設定に品目リストの位置（左／上／右）を置き、選んだ値を保存する", () => {
  const start = source.indexOf('<div class="sizectl" id="legendCtl">');
  assert.notEqual(start, -1);
  const html = source.slice(start, start + 600);
  assert.match(html, /品目リストの位置/);
  assert.match(html, /onclick="setLegendPos\('left'\)">左<\/button>/);
  assert.match(html, /onclick="setLegendPos\('top'\)">上<\/button>/);
  assert.match(html, /onclick="setLegendPos\('right'\)">右<\/button>/);
  // 退避スペースの位置（#dockCtl）の次に並べる
  assert.ok(source.indexOf('id="dockCtl"') < start);

  const body = fnBody("setLegendPos");
  assert.match(body, /saveData\("palletApp\.legendPos", *legendPos\)/);
  assert.match(body, /syncLegendSide\(\);\s*syncFlagRect\(\);/);
  assert.match(fnBody("initDockPrefs"), /setLegendPos\(loadData\("palletApp\.legendPos"\) *\|\| *"left"\)/);
});

test("表示設定に製品の印（表示／非表示）を置き、選んだ値を保存する", () => {
  const start = source.indexOf('<div class="sizectl" id="markCtl">');
  assert.notEqual(start, -1);
  const html = source.slice(start, start + 500);
  assert.match(html, /製品の印/);
  assert.match(html, /onclick="setLegendMark\(true\)">表示<\/button>/);
  assert.match(html, /onclick="setLegendMark\(false\)">非表示<\/button>/);

  const body = fnBody("setLegendMark");
  assert.match(body, /classList\.toggle\("no-mk", *!on\)/);
  assert.match(body, /saveData\("palletApp\.legendMark", *on\)/);
  // 未保存（null）のときは表示にする
  assert.match(fnBody("initDockPrefs"), /setLegendMark\(loadData\("palletApp\.legendMark"\) *!== *false\)/);
});

test("右のときは並び順だけを入れ替え、1280px 未満では位置の行を出さない", () => {
  const wide = mediaCss("@media (min-width:1280px)");
  assert.match(wide, /\.editlayout\.lg-right\{flex-direction:row-reverse;justify-content:flex-end\}/);
  const narrow = mediaCss("@media (max-width:1279px)");
  assert.match(narrow, /#legendCtl\{display:none\}/);
  // 製品の印はスマホにも付くので、その行は隠さない
  assert.equal(narrow.includes("markCtl"), false);
});

test("画面幅が 1280px をまたいだら凡例の置き場所を直す", () => {
  assert.match(
    fnBody("initDockPrefs"),
    /matchMedia\("\(min-width:1280px\)"\)\.addEventListener\("change"/
  );
});
