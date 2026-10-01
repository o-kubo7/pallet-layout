# 配置編集: 品目リストを盤の横に縦1列で出す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置編集タブの品目リスト（`#legend`）を、PC 幅（1280px 以上）で盤の左（または右）に縦1列で常時表示する。1件の見せ方も改める（入りきらない品目だけ2行、パレット数を太字、製品に「製」の印）。位置（左・上・右）と製品の印（表示・非表示）は表示設定で切り替えられるようにする。

**Architecture:** `#mapBody` を新しい外枠 `#editLayout` で囲む。PC 幅で左/右のときだけ、JS（`syncLegendSide()`）が `#legend` を外枠の直下へ移す。外枠は flex の2列（凡例の列 | 盤の列）で、盤の列は盤の中身ちょうどの幅にする。凡例の列は sticky でタブ列の直下に貼り付ける。それ以外のとき（1280px 未満・「上」）は、凡例を元の位置（`#mapBody` の中）へ戻し、今と同じ並びにする。帯（`#toolFlag`）は凡例の列を避ける。

**Tech Stack:** 単一ファイル `files/index.html`（HTML + CSS + 埋め込み JS）、PWA キャッシュ `files/sw.js`、テストは Node 組み込みの `node:test`（ソース文字列の検査）。

**Spec:** `docs/superpowers/specs/2026-09-27-edit-legend-left-column-design.md`

## Global Constraints

- 列にする画面幅の境目: `@media (min-width:1280px)`（JS では `matchMedia("(min-width:1280px)")`）。1280px 未満は、パレット数の太字と「製」の印以外の見た目・動作を変えない（実機 Pixel 9a、412px 幅）。
- 位置の値: `left` / `top` / `right`。既定は `left`。保存キーは `palletApp.legendPos`。
- 製品の印: 既定は表示。保存キーは `palletApp.legendMark`（真偽値）。読み書きは既存の `saveData()` / `loadData()` を使う。
- ページ幅: 凡例の列が出ているときだけ `.wrap` の最大幅を `1552px`（今は `1240px`）にする。付けるクラスは `.wrap.legend-side`。
- 帯と凡例の隙間: 16px（既存の退避スペースとの隙間と同じ）。
- 盤の文章要素 `.note`・`#summary`・`.stashlead`・`#stashBar` には、1280px 以上で `contain:inline-size` を付ける。
- `files/index.html` を変えたら `files/sw.js` の `CACHE_VERSION` を上げる（今は `"v76"` → `"v77"`）。
- CSS は既存の書き方（1行に詰める、セレクタと `{` の間に空白を入れない、`>` の前後にも空白を入れない）に合わせる。テストの正規表現はこの書き方を前提にしている。
- コメント・文言は日本語。既存コメントの文体（「〜する。」、理由を書く）に合わせる。
- テストの実行: `node --test tests/*.test.js`（計画作成時点で 447 件すべて成功）。

## 検証の共通手順（各タスクの「ブラウザで確かめる」で使う）

- サーバー: `.claude/launch.json` の `pallet-layout`（`python3 -m http.server 8765 --directory files`）。
- **開く URL は `http://127.0.0.1:8765/`**。`localhost:8765` とは localStorage が別なので、下の入力スクリプトで開発用データを消さずに済む。
- 画面の大きさ: 職場 PC 相当の **1349×620** を基準にする（1366×768 の Windows で、スクロールバーとブラウザ上部・タスクバーを除いた大きさ）。ブラウザパネルなら `resize_window`、Chrome 系なら DevTools のデバイスツールバーで指定する。
- 入力データ（長い品名入り）: 配置編集タブ以外を開いた状態で、コンソールに次を貼って実行する。現在の時間帯の入力を置き換え、「▶ 自動配置を作成」まで行う。

```js
(() => {
  const rows = [
    {type:"製品",  name:"製品A 業務用詰替パウチ 2kg",        lot:"1111-0001", snp:500,  qty:4000},
    {type:"製品",  name:"製品B",                              lot:"2222-0002", snp:500,  qty:2750},
    {type:"充填品",name:"仕掛品 高粘度ベース液（充填前）",    lot:"1111-1111", snp:1500, qty:24000},
    {type:"充填品",name:"仕掛品 高粘度ベース液（充填前）",    lot:"1111-1112", snp:1500, qty:18000},
    {type:"充填品",name:"仕掛品 高粘度ベース液（充填前）",    lot:"1111-1113", snp:1500, qty:11250},
    {type:"充填品",name:"仕掛品 低温保管用 希釈タイプ",        lot:"2222-2222", snp:1500, qty:15000},
    {type:"充填品",name:"仕掛品 低温保管用 希釈タイプ",        lot:"2222-2223", snp:1500, qty:15000},
    {type:"充填品",name:"仕掛品3",                            lot:"3333-3333", snp:2000, qty:17500},
    {type:"充填品",name:"仕掛品3",                            lot:"3333-3334", snp:2000, qty:14000},
    {type:"充填品",name:"仕掛品 詰替用原液 増量キャンペーン品",lot:"4444-4444", snp:2000, qty:27000},
  ];
  switchTab("input");
  const oc = window.confirm; window.confirm = () => true;
  try { clearLots(); } finally { window.confirm = oc; }
  addSlip("fax");
  const slip = document.querySelector("#slipList .slip:last-child");
  const add = slip.querySelector(".btn-slip-action-add");
  const set = (el, v, t) => { el.value = String(v); el.dispatchEvent(new Event(t, {bubbles:true})); };
  rows.forEach((r, i) => {
    if (i > 0) addItemRow(add);
    const c = slip.querySelectorAll("tbody tr")[i].querySelectorAll("select,input");
    set(c[0], r.type, "change"); set(c[1], r.name, "input"); set(c[2], r.lot, "input");
    set(c[3], r.snp, "input"); set(c[4], r.qty, "input");
  });
  runFromButton();
  switchTab("edit");
})();
```

- 見本: `.superpowers/legend-mockup/index.html` がユーザーと合意したモックアップ（git の対象外）。見た目に迷ったらこれと比べる。

## ファイル構成

- Modify: `files/index.html`
  - CSS（`<style>` 内）: `.legend span` の直後（74 行付近）に凡例1件の共通スタイル。`#mapBody.dock-bottom{padding-bottom:130px}` の直後に `@media (min-width:1280px)` と `@media (max-width:1279px)`。
  - HTML: `#mapBody` を `#editLayout` で囲む（879〜935 行付近）。表示設定 `#editCfg` に `#legendCtl` と `#markCtl`（862〜876 行付近）。
  - JS: `let legendPos`（1280 行付近）、凡例の描画（2770 行付近）、`run()`（2799 行付近）、`switchTab()`（3203 行付近）、`showMapState()`（3254 行付近）、`setCellSize()`（3287 行付近）、`syncFlagRect()`（4285 行付近）、`setDockPos()` の直前に `syncLegendSide()` / `setLegendPos()` / `setLegendMark()`、`initDockPrefs()`（4850 行付近）。
- Modify: `files/sw.js`（`CACHE_VERSION`）
- Create: `tests/edit-legend-column.test.js`

行番号は計画作成時点（ブランチ `feat/edit-legend-left-column`）の目安。編集は必ず文字列で位置を探して行う。

---

### Task 1: 凡例1件の中身を作り替える（全画面幅）

2行化・省略・「/」の出し分けのための入れ物を作り、パレット数の太字と製品の「製」の印を加える。この時点では列表示はまだなく、どの画面幅でも盤の上の横並び。見た目の変化は太字と「製」の印だけ。

**Files:**
- Modify: `files/index.html`
- Create: `tests/edit-legend-column.test.js`

**Interfaces:**
- Produces: 凡例1件の HTML 構造と CSS クラス
  - `.lg-mk`（製品の印。`.swframe` の中）
  - `.lg-body` > `.lg-name`（4文字超は `.lg-long` も付く）＋ `.lg-rest` > `.lg-sep` と `<b>パレット数</b>`
  - `#legend` に付くクラス `no-mk`（印を隠す。Task 4 で使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/edit-legend-column.test.js` を新規作成する。後のタスクもこのファイルに足していく。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/edit-legend-column.test.js`
Expected: 3 件とも FAIL

- [ ] **Step 3: 凡例1件の HTML を作り替える**

`renderResult()` の中で、次の行を探す。

```js
    `<span><span class="swframe"><i class="swatch" style="background:${colorOf[l.id]}">${l.id+1}</i></span>${esc(l.name)} / ${esc(l.lot)||"—"}　${l.pallets}P${l.parts>1?`（${l.parts}件）`:""}</span>`).join("");
```

次のように置き換える（1行）。

```js
    `<span><span class="swframe"><i class="swatch" style="background:${colorOf[l.id]}">${l.id+1}</i>${l.type==="製品"?'<i class="lg-mk">製</i>':""}</span><span class="lg-body"><span class="lg-name${[...l.name].length>4?" lg-long":""}">${esc(l.name)}</span><span class="lg-rest"><span class="lg-sep">/</span>${esc(l.lot)||"—"}　<b>${l.pallets}P</b>${l.parts>1?`（${l.parts}件）`:""}</span></span></span>`).join("");
```

さらに、この `document.getElementById("legend").innerHTML=lots.map(l=>` の行の直前に、次のコメントを足す。

```js
  // 1件は「番号の枠（製品は左上に「製」）＋ 品名 ＋ /ロット・パレット数」。
  // 品名と残りを分けておくのは、PC 幅の列表示で、入りきらない品目だけ2行にし、
  // 品名だけを省略するため（設計書 5-2）。[...l.name] は全角も1文字と数えるため
```

- [ ] **Step 4: 共通スタイルを足す**

次の行を探す。

```css
  .legend span{display:inline-flex;align-items:center;gap:6px;font-size:16px;background:#f3f4f6;border-radius:6px;padding:5px 10px}
```

この直後に、次のブロックを足す。

```css
  .legend[hidden]{display:none}
  /* 1件の中の入れ物（品名・ロット側・「/」）。.legend span の背景・余白・inline-flex を
     打ち消し、1行のときは今までどおり「品名 / ロット　パレット数」と流れるようにする */
  .legend .lg-body,.legend .lg-name,.legend .lg-rest,.legend .lg-sep{display:inline;padding:0;background:none;border-radius:0}
  .legend .lg-sep{margin:0 .3em}
  .legend .lg-rest b{font-weight:800}
  /* 製品の印。充填品との2種類しかないので、製品にだけ付ける。番号の枠の左上に重ね、
     品名の文字にかぶらないようにする。位置は absolute なので1件の幅は変わらない */
  .legend .swframe{position:relative}
  .legend .lg-mk{position:absolute;top:-8px;left:-8px;width:17px;height:17px;display:flex;align-items:center;justify-content:center;border:1.5px solid #111;border-radius:3px;background:#fff;color:#111;font-size:11px;font-weight:800;font-style:normal;line-height:1}
  .legend.no-mk .lg-mk{display:none}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS（`legend-chip.test.js` を含む。fail 0）

- [ ] **Step 6: ブラウザで確かめる**

「検証の共通手順」でデータを入れ、次の2つの幅で配置編集タブを見る。

1. 1349×620: 凡例は今までどおり盤の上に横並び。各品目が「品名 / ロット　**パレット数**」の1行で、パレット数だけ太字。1・2番（製品）だけ、番号の枠の左上に「製」が出る。
2. 412×800（スマホ幅）: 同じく横並びで、太字と「製」の印以外は変更前と同じ並び。「製」の印が上の段の品目に重ならない。

コンソールで次を実行し、構造を確かめる。

```js
[...legend.children].slice(0,2).map(s=>({mk:!!s.querySelector(".lg-mk"), name:s.querySelector(".lg-name").className, b:s.querySelector(".lg-rest b").textContent}))
```

期待値: 1件目 `{mk:true, name:"lg-name lg-long", b:"8P"}`、2件目 `{mk:true, name:"lg-name", b:"6P"}`。

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/edit-legend-column.test.js
git commit -m "feat: 品目リストのパレット数を太字にし、製品に「製」の印を付ける"
```

---

### Task 2: PC 幅で凡例を盤の左に縦1列で出す

**Files:**
- Modify: `files/index.html`
- Modify: `tests/edit-legend-column.test.js`

**Interfaces:**
- Consumes: Task 1 の `.lg-body` / `.lg-name` / `.lg-long` / `.lg-rest` / `.lg-sep`
- Produces:
  - `let legendPos="left";`（トップレベル。値は `"left"|"top"|"right"`）
  - `function syncLegendSide()`（引数なし、戻り値なし）
  - HTML の `<div class="editlayout lg-left" id="editLayout">`（`#mapBody` を囲む）
  - CSS のクラス `.lg-left` / `.lg-right` / `.lg-top`（`#editLayout` に付く）、`.wrap.legend-side`

- [ ] **Step 1: 失敗するテストを足す**

`tests/edit-legend-column.test.js` の末尾に足す。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/edit-legend-column.test.js`
Expected: 新しい 4 件が FAIL、Task 1 の 3 件は PASS

- [ ] **Step 3: CSS を足す**

`#mapBody.dock-bottom{padding-bottom:130px}` の行を探し、その直後に次のブロックを足す。

```css

  /* ---- 配置編集: 品目リストを盤の横に列で出す（PC 幅・表示設定が左/右のとき） ----
     凡例を確かめるたびに上までスクロールする手間をなくす。#legend は syncLegendSide() が
     #editLayout の直下（#mapBody の前）へ移す。盤の列は盤の中身ちょうどの幅にし、
     余った幅を凡例の列へ回す。先に縮むのは凡例の列（flex-shrink を大きく）で、
     入りきらない品目から2行になり、それでも長い品名は「…」で省略する。
     境目 1280px は、1024px では盤が横スクロールになり品名が消えたため（設計書 4-3 の5）。 */
  @media (min-width:1280px){
    .editlayout.lg-left,.editlayout.lg-right{display:flex;gap:12px;align-items:flex-start}
    .editlayout.lg-left>#legend,.editlayout.lg-right>#legend{flex:0 1000 auto;min-width:min-content;margin:0;padding-top:7px;
      flex-direction:column;flex-wrap:nowrap;align-items:flex-start;
      position:sticky;top:var(--docktop,56px);max-height:calc(100vh - var(--docktop,56px) - 16px);overflow-y:auto}
    .editlayout.lg-left>#legend:empty,.editlayout.lg-right>#legend:empty{display:none}
    .editlayout.lg-left>#legend>span,.editlayout.lg-right>#legend>span{max-width:100%}
    /* 品名とロット側を折り返せる入れ物にする。1行に入らない品目だけロット側が2行目へ回る */
    .editlayout>#legend .lg-body{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:calc(1em + 2px);row-gap:0;min-width:0;flex:0 1 auto;line-height:1.35;overflow:hidden}
    /* 品名は1行で切り詰める。white-space:nowrap だと品名全体が最小幅になり列が縮まない
       （試作で 513px まで広がった）ので、折り返し可能にしたうえで line-clamp で1行にする */
    .editlayout>#legend .lg-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;word-break:break-all;flex:0 1 auto}
    .editlayout>#legend .lg-name.lg-long{min-width:4em}
    /* 「/」は 1em の箱に入れ、ロット側ごと 1em 左へずらす。1行のときは品名との間に収まり、
       2行目の先頭に来たときは入れ物（overflow:hidden）の外へ出て見えなくなる */
    .editlayout>#legend .lg-rest{margin-left:-1em;white-space:nowrap}
    .editlayout>#legend .lg-sep{display:inline-block;width:1em;margin:0;text-align:center}
    .editlayout.lg-left>#mapBody,.editlayout.lg-right>#mapBody{flex:0 1 auto;min-width:0}
    /* 盤の下の文章は、折り返さない1行の長さを幅として要求する。そのままだと盤の列が
       文章に合わせて広がり、右の空きが消えない（試作で 930px のはずが 1057px になった）。
       幅の計算から外し、盤の幅で折り返させる */
    #mapBody .note,#mapBody #summary,#mapBody .stashlead{contain:inline-size}
    #mapBody #stashBar{contain:inline-size}
    /* 凡例の列のぶんページを広げ、盤の幅を保つ */
    .wrap.legend-side{max-width:1552px}
  }
```

- [ ] **Step 4: HTML を囲む**

次の2行を探す。

```html
      <div id="messages"></div>
      <div id="mapBody">
```

次のように置き換える。

```html
      <div id="messages"></div>
      <!-- 品目リスト（#legend）と盤（#mapBody）の外枠。PC 幅（1280px 以上）で表示設定の
           位置が左/右のときだけ、syncLegendSide() が #legend をここ（#mapBody の前）へ移し、
           2列に並べる。それ以外のときは #legend を #mapBody の中の元の位置へ戻す
           （HTML で外に出さないのは、スマホで凡例が退避スペースの横に並ぶ今の見た目を保つため）。 -->
      <div class="editlayout lg-left" id="editLayout">
      <div id="mapBody">
```

次に、`#mapBody` の終わりを探す。

```html
        <div class="summary" id="summary"></div>
      </div>
    </div>
  </div>
```

次のように置き換える（`#editLayout` の閉じタグを1行足す）。

```html
        <div class="summary" id="summary"></div>
      </div>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: `legendPos` と `syncLegendSide()` を足す**

次の行を探す。

```js
let SPACES = clone(DEFAULT_SPACES);
```

この直後に、次の3行を足す。

```js
// 配置編集の品目リストの位置（表示設定）。"left"|"top"|"right"。PC 幅（1280px 以上）だけ効く。
// 初期化中の showMapState() → syncLegendSide() から読まれるので、let の宣言前アクセスで落ちないよう早い位置で宣言する
let legendPos="left";
```

次に、`function setDockPos(v){` の行を探し、その直前に次の関数を足す。

```js
/* 品目リスト（#legend）の置き場所をそろえる。
   PC 幅（1280px 以上）で位置が左/右のときは #editLayout の直下（#mapBody の前）へ移して列にし、
   それ以外は #mapBody の中の元の位置（帯 #toolFlag の直後）へ戻す。
   凡例が #mapBody の外にあると盤と一緒に隠れないので、盤を隠している間は hidden も付ける。
   .wrap.legend-side（ページ幅の拡大）は、列が実際に見えているときだけ付ける。 */
function syncLegendSide(){
  const lg=document.getElementById("legend"), mb=document.getElementById("mapBody");
  const lay=document.getElementById("editLayout"), flag=document.getElementById("toolFlag");
  const tab=document.getElementById("tab-edit"), wrap=document.querySelector(".wrap");
  if(!lg || !mb || !lay || !flag || !tab || !wrap) return;
  const column = window.matchMedia("(min-width:1280px)").matches && legendPos!=="top";
  if(column){ if(lg.parentNode!==lay) lay.insertBefore(lg, mb); }
  else if(lg.previousElementSibling!==flag){ flag.after(lg); }
  const boardShown = mb.style.display!=="none";
  lg.hidden = !boardShown;
  wrap.classList.toggle("legend-side",
    column && boardShown && tab.style.display!=="none" && lg.children.length>0);
}
```

- [ ] **Step 6: 呼び出しを足す**

(a) `switchTab()` の中で、次の行を探す。

```js
  if(name==="edit") syncFlagRect();
```

次のように置き換える（直前に2行足す）。

```js
  // 配置編集タブの出入りでページ幅（.wrap.legend-side）が変わるので、帯を測る前にそろえる
  syncLegendSide();
  if(name==="edit") syncFlagRect();
```

(b) `showMapState()` の中で、次の行を探す。

```js
  document.getElementById("mapBody").style.display    = fresh?"block":"none";
```

この直後に、次の3行を足す。

```js
  // 盤の出し入れに凡例（盤の外にいることがある）とページ幅を合わせ、幅が変わった帯を測り直す。
  // renderResult() は最後にここを通るので、凡例の幅が変わったときもここで追いつく
  syncLegendSide(); syncFlagRect();
```

(c) `run()` の中で、次の行を探す（`renderResult()` の中の `innerHTML=lots.map(` とは別の行で、`=""` で終わる）。

```js
    document.getElementById("legend").innerHTML="";
```

この直後に、次の行を足す。

```js
    syncLegendSide();
```

- [ ] **Step 7: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS（fail 0）

- [ ] **Step 8: ブラウザで確かめる**

「検証の共通手順」でデータを入れ、1349×620 で配置編集タブを開く。コンソールで次を実行する。

```js
const r=e=>{const b=e.getBoundingClientRect();return [Math.round(b.left),Math.round(b.width)]};
const sc=id=>{const s=document.querySelector(id).closest(".scroller");return s.scrollWidth>s.clientWidth};
({legendParent:legend.parentNode.id, legend:r(legend), mapBody:r(mapBody),
  wrapSide:document.querySelector(".wrap").classList.contains("legend-side"),
  nearScroll:sc("#zone-near"), farScroll:sc("#zone-far"),
  twoLine:[...legend.children].filter(s=>s.getBoundingClientRect().height>49).length,
  sepShown:[...legend.querySelectorAll(".lg-sep")].map(e=>e.getBoundingClientRect().left>=e.closest(".lg-body").getBoundingClientRect().left)})
```

期待値:
- `legendParent` が `"editLayout"`、`legend` の幅が約 326、`mapBody` の幅が約 930、`wrapSide` が `true`。
- `nearScroll` と `farScroll` がともに `false`。
- `twoLine` が 7 前後。
- `sepShown` は、2行になった品目で `false`、1行の品目（2・8・9番）で `true`。

目でも確かめる:
1. 2行の品目は、1行目が品名、2行目が「ロット　**パレット数**」で、2行目に「/」が無い。
2. 一番上の品目の「製」の印が切れていない。
3. 下へスクロールしても、凡例の列がタブ列の直下に残る。

続けて、次の2つを確かめる。
- 412×800 にして再読み込みする。期待値: `legend.parentNode.id` が `"mapBody"`、`legend.previousElementSibling.id` が `"toolFlag"`、凡例は盤の上に横並び（Task 1 と同じ見た目）。
- 1349×620 に戻し、入力タブで数量を1つ変えてから配置編集タブへ戻る（配置が古くなり、盤が隠れる状態）。期待値: `legend.hidden` が `true`、`.wrap` に `legend-side` が付いていない。

- [ ] **Step 9: コミット**

```bash
git add files/index.html tests/edit-legend-column.test.js
git commit -m "feat: 配置編集の品目リストをPC幅で盤の左に縦1列で出す"
```

---

### Task 3: 帯（`#toolFlag`）が凡例の列に重ならないようにする

**Files:**
- Modify: `files/index.html`（`syncFlagRect()`、`setCellSize()`）
- Modify: `tests/edit-legend-column.test.js`

**Interfaces:**
- Consumes: `legendPos`、凡例が列のときの親 `#editLayout`（Task 2）
- Produces: なし（既存関数の中身だけを変える）

- [ ] **Step 1: 失敗するテストを足す**

`tests/edit-legend-column.test.js` の末尾に足す。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/edit-legend-column.test.js`
Expected: 新しい 2 件が FAIL、ほかは PASS

- [ ] **Step 3: `syncFlagRect()` に凡例を避ける処理を足す**

`syncFlagRect()` の中で、次の行を探す。

```js
  let left=cr.left+padL, width=cr.width-padL-padR;
```

この直後に、次のブロックを足す。

```js
  // 品目リストを盤の横に列で出しているとき（PC 幅・表示設定が左/右）は、帯をその列に
  // 重ねない。列も sticky でタブ列の直下に貼りつくので、上下では避けられない。
  // 退避スペース（左上）を避ける下の処理は、ここで詰めた left を起点にさらに詰める。
  // 非表示タブや盤が隠れているときは幅0になるので、そのときは何もしない。
  const lg=document.getElementById("legend");
  if(lg && lg.parentNode && lg.parentNode.id==="editLayout"){
    const lr=lg.getBoundingClientRect();
    if(lr.width>0){
      const lgGap=16;
      if(legendPos==="right"){
        width=Math.min(width, lr.left-lgGap-left);
      }else{
        const newLeft=lr.right+lgGap;
        width=Math.min(width,(left+width)-newLeft);
        left=newLeft;
      }
    }
  }
```

- [ ] **Step 4: `setCellSize()` の最後で帯を測り直す**

`setCellSize()` の中で、次の行を探す。

```js
  saveData(STORE_KEY.cell, px);
}
```

次のように置き換える。

```js
  saveData(STORE_KEY.cell, px);
  // マスの大きさで盤と品目リストの列の幅が変わる。帯（fixed）の左端・幅を測り直さないと、
  // 「大」→「中」で帯が品目リストに重なる（/dig で発見）
  syncFlagRect();
}
```

- [ ] **Step 5: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 6: ブラウザで確かめる**

1349×620・長い品名のデータで配置編集タブを開き、盤のマスを1つタップして帯を出す。コンソールで次を実行する。

```js
const f=toolFlag.getBoundingClientRect(), l=legend.getBoundingClientRect();
({flagLeft:Math.round(f.left), legendRight:Math.round(l.right), ok:f.left>=l.right+15})
```

期待値は `ok` が `true`。次の3つの状態でも、同じコードで `ok` が `true` になることを確かめる。

1. 下へスクロールした後。
2. ⚙ 表示設定でマスを「大」→「中」に切り替えた後。
3. 退避スペースを「左上」にした後。このときは、帯の左端が退避スペースの右端より右にあることも確かめる（`toolFlag.getBoundingClientRect().left >= stashDock.getBoundingClientRect().right`）。

確認後、退避スペースを「右上」に戻す。

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/edit-legend-column.test.js
git commit -m "feat: 選択の帯が品目リストの列に重ならないようにする"
```

---

### Task 4: 表示設定に「品目リストの位置」と「製品の印」を足す

**Files:**
- Modify: `files/index.html`
- Modify: `tests/edit-legend-column.test.js`

**Interfaces:**
- Consumes: `legendPos`・`syncLegendSide()`（Task 2）、`syncFlagRect()` の右側の処理（Task 3）、`.legend.no-mk`（Task 1）
- Produces:
  - `function setLegendPos(v)`（`v` は `"left"|"top"|"right"`。それ以外は `"left"` に丸める。戻り値なし）
  - `function setLegendMark(on)`（`on` は真偽値。戻り値なし）

- [ ] **Step 1: 失敗するテストを足す**

`tests/edit-legend-column.test.js` の末尾に足す。

```js
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
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `node --test tests/edit-legend-column.test.js`
Expected: 新しい 4 件が FAIL、ほかは PASS

- [ ] **Step 3: 表示設定の HTML を足す**

次の塊を探す（`#dockCtl` の終わり）。

```html
          <button class="sizebtn" id="dockBtBtn" onclick="setDockPos('bottom')">下</button>
        </span>
      </div>
```

この直後に、次のブロックを足す。

```html
      <!-- 品目リストの位置。PC 幅（1280px 以上）だけ効くので、それ未満では行ごと隠す。
           保存した値は残り、PC で開けば効く -->
      <div class="sizectl" id="legendCtl">
        <span class="grp"><span class="lbl">品目リストの位置</span>
          <button class="sizebtn on" id="legendLBtn" onclick="setLegendPos('left')">左</button>
          <button class="sizebtn" id="legendTBtn" onclick="setLegendPos('top')">上</button>
          <button class="sizebtn" id="legendRBtn" onclick="setLegendPos('right')">右</button>
        </span>
      </div>
      <!-- 品目リストの番号の左上に出す「製」の印。どの画面幅でも付くので、この行は常に出す -->
      <div class="sizectl" id="markCtl">
        <span class="grp"><span class="lbl">製品の印</span>
          <button class="sizebtn on" id="markOnBtn" onclick="setLegendMark(true)">表示</button>
          <button class="sizebtn" id="markOffBtn" onclick="setLegendMark(false)">非表示</button>
        </span>
      </div>
```

- [ ] **Step 4: CSS を足す**

Task 2 で足した `@media (min-width:1280px){` ブロックの中で、次の行を探す。

```css
    .editlayout.lg-left,.editlayout.lg-right{display:flex;gap:12px;align-items:flex-start}
```

この直後に、次の2行を足す。

```css
    /* 右は並び順だけを入れ替える（幅・sticky・省略は左と共通）。row-reverse では主軸の
       始点が右になるので、flex-end で盤を左端へ寄せる */
    .editlayout.lg-right{flex-direction:row-reverse;justify-content:flex-end}
```

さらに、その `@media (min-width:1280px){ … }` ブロックの閉じ括弧の直後に、次のブロックを足す。

```css
  /* 品目リストの位置は PC 幅だけ効くので、それ未満では表示設定の行ごと隠す */
  @media (max-width:1279px){
    #legendCtl{display:none}
  }
```

- [ ] **Step 5: `setLegendPos()` / `setLegendMark()` と初期化を足す**

Task 2 で足した `function syncLegendSide(){ … }` の直後（`function setDockPos(v){` の直前）に、次の2つの関数を足す。

```js
/* 品目リストの位置を切り替える。左は盤の左、右は盤の右に縦1列、上は今までどおり盤の上に
   横並び。退避スペースの位置（setDockPos）と同じく、選んだら覚えておく。 */
function setLegendPos(v){
  legendPos=(v==="top"||v==="right")?v:"left";
  const lay=document.getElementById("editLayout");
  if(lay){ ["left","top","right"].forEach(k=>lay.classList.toggle("lg-"+k, k===legendPos)); }
  [["legendLBtn","left"],["legendTBtn","top"],["legendRBtn","right"]].forEach(function(x){
    const b=document.getElementById(x[0]);
    if(b) b.classList.toggle("on", legendPos===x[1]);
  });
  saveData("palletApp.legendPos", legendPos);
  // 置き場所とページ幅が変わってから帯を測り直す（先に測ると古い位置を見てしまう）
  syncLegendSide(); syncFlagRect();
}
/* 製品の「製」の印を出すか。印は absolute で幅を取らないので、帯の測り直しは要らない */
function setLegendMark(on){
  on=!!on;
  const lg=document.getElementById("legend");
  if(lg) lg.classList.toggle("no-mk", !on);
  const onBtn=document.getElementById("markOnBtn"), offBtn=document.getElementById("markOffBtn");
  if(onBtn) onBtn.classList.toggle("on", on);
  if(offBtn) offBtn.classList.toggle("on", !on);
  saveData("palletApp.legendMark", on);
}
```

次に、`initDockPrefs()` の中で次の行を探す。

```js
  setDockPos(loadData("palletApp.stashPos") || "tr");
```

この直後に、次の行を足す。

```js
  setLegendPos(loadData("palletApp.legendPos") || "left");
  setLegendMark(loadData("palletApp.legendMark") !== false);
  // 画面幅が 1280px をまたいだら、凡例を列にするか盤の中へ戻すかを決め直す
  window.matchMedia("(min-width:1280px)").addEventListener("change", function(){
    syncLegendSide(); syncFlagRect();
  });
```

- [ ] **Step 6: テストが通ることを確かめる**

Run: `node --test tests/*.test.js`
Expected: すべて PASS

- [ ] **Step 7: ブラウザで確かめる**

1349×620・長い品名のデータで配置編集タブを開き、⚙ 表示設定を開く。

1. 「品目リストの位置」の「右」を押す。期待値:
   - 凡例の列が盤の右に出る（`legend.getBoundingClientRect().left > mapBody.getBoundingClientRect().right`）。
   - 盤は `#editCard` の左端に寄る。
   - マスを1つ選んで帯を出すと、帯の右端が凡例の左端より左にある（`toolFlag.getBoundingClientRect().right <= legend.getBoundingClientRect().left`）。
2. 「上」を押す。期待値: 凡例が盤の上に横並びで出る（`legend.parentNode.id==="mapBody"`）。`.wrap` に `legend-side` が付かない。
3. 「右」を選んだまま再読み込みする。期待値: 右のまま（`localStorage.getItem("palletApp.legendPos")` が `"\"right\""`）。
4. 1279px 幅にする。期待値: 表示設定に「品目リストの位置」の行が出ない（「製品の印」の行は出る）。凡例は盤の上に横並び。1349px に戻すと、再読み込みなしで右の列に戻る。
5. 「製品の印」の「非表示」を押す。期待値: 「製」の印が消える。再読み込み後も消えたまま。412px 幅でも消えている。「表示」に戻すと再び出る。
6. 確認後、位置を「左」、製品の印を「表示」に戻す。

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/edit-legend-column.test.js
git commit -m "feat: 表示設定で品目リストの位置と製品の印を切り替えられるようにする"
```

---

### Task 5: キャッシュ更新と通し確認

**Files:**
- Modify: `files/sw.js`

**Interfaces:**
- Consumes: Task 1〜4 の成果すべて
- Produces: なし

- [ ] **Step 1: `CACHE_VERSION` を上げる**

`files/sw.js` の次の行を探す。

```js
const CACHE_VERSION = "v76";
```

次のように置き換える。

```js
const CACHE_VERSION = "v77";
```

計画作成後にほかのブランチで上がっていた場合は、そのときの値より1つ上にする。

- [ ] **Step 2: 全テスト**

Run: `node --test tests/*.test.js`
Expected: すべて PASS（fail 0）

- [ ] **Step 3: 通しの動作確認（ブラウザ、長い品名のデータ）**

設計書 8-2 の項目を順に確かめる。Task 1〜4 で済ませた項目は省いてよい。残りは次のとおり。

1. 1349×620・退避スペースを右上・左上・下のそれぞれにして、次を操作する。どの設定でも今までどおり動くこと。
   - マスをタップして選ぶ。
   - 選んだマスを退避スペースへドラッグして移す。
   - 帯の「元に戻す」「やり直す」を押す。
2. 1349×620・マス「小」と「大」: 凡例の列と盤が並んで出る。倉庫外に横スクロールが出るのは想定どおり（設計書 3章、受け入れ済み）。帯が凡例に重ならない。
3. 412×800（スマホ幅）: 変更前との違いが、パレット数の太字と「製」の印だけであること。比べるときは `main` のファイルを別に開く。
   1. `git worktree add .worktrees/legend-compare-main main` で比較用の作業コピーを作る。
   2. `python3 -m http.server 8766 --directory .worktrees/legend-compare-main/files` で開く。
   3. 比べる画面は、両方とも `http://127.0.0.1:…` で開く。オリジンが違うと localStorage が別になるので、8766 側にも「検証の共通手順」のスクリプトで同じデータを入れる。
   4. 比べ終わったら、サーバーを止めてから `git worktree remove .worktrees/legend-compare-main` で片付ける。

- [ ] **Step 4: コミット**

```bash
git add files/sw.js
git commit -m "chore: 品目リストの列表示に合わせてキャッシュ版を上げる"
```
