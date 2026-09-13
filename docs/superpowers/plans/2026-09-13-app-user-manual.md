# パレット配置図アプリ 操作説明書 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 図解中心の利用者向け操作説明書をHTMLとPDFで作り、アプリから開け、印刷・オフライン利用・管理者向け参照にも対応させる。

**Architecture:** `files/manual.html` を唯一の本文原本とし、実画面画像は再生成可能なPlaywrightスクリプトから `files/manual-assets/` へ出力する。アプリはヘッダーの通常リンクから説明書を新しいタブまたはウィンドウで開き、Service WorkerはHTMLと必須画像を事前キャッシュする。配布用PDFは同じHTMLをPlaywrightでA4 PDF化し、Popplerで全ページを画像化して検証する。

**Tech Stack:** 静的HTML/CSS/JavaScript、Node.js `node:test`、同梱Playwright、Service Worker Cache API、Poppler (`pdfinfo`, `pdftoppm`)

**Spec:** `docs/superpowers/specs/2026-09-13-app-user-manual-design.md`

## Global Constraints

- 応答、説明書本文、テスト名、コミットメッセージは日本語にする。
- `files/manual.html` を本文の原本とし、PDFとHTMLへ別々の本文を書かない。
- 実画面画像は `DEFAULT_MASTER` と `SAMPLES.basic` / `SAMPLES.mix` の架空データだけで作り、実在の伝票・顧客・ロットを使わない。
- 撮影はPlaywrightから既存のGoogle Chromeをヘッドレス起動し、新規ブラウザコンテキストで行う。利用者の通常ブラウザとlocalStorageへ触れず、撮影コンテキストではService Workerを無効化する。
- Playwright同梱ブラウザは現環境に未導入なので、ブラウザのダウンロードや `npx playwright install` は行わない。`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` を `executablePath` に指定する。
- 1項目は原則1操作、説明本文は2〜3文を目安とし、操作対象は現行UIと同じ表記にする。
- PCとスマートフォンで表示または操作が異なる箇所だけ、両方の図を載せる。
- 図解は色だけに依存せず、番号、見出し、アイコン、実線・破線、キャプションを併用する。
- 説明書リンクはヘッダー右上に置き、`target="_blank" rel="noopener"` で開く。
- 説明書はA4縦、アプリの配置図は既存どおりA4横とし、アプリ側の印刷結果を変えない。
- `manual.html` と必須画像はService Workerの `PRECACHE` に含める。`manual.pdf` は含めない。
- `files/sw.js` を変更するときは `CACHE_VERSION` を `v50` から `v51` へ上げる。
- 実機プリンタは完了条件に含めない。ブラウザの印刷プレビュー、生成PDF、PDF全ページのレンダリングで確認する。
- 既存の未コミット変更は利用者の作業として扱い、各タスクで明記したファイルだけをステージする。
- `.superpowers/` は既存の `.gitignore` に含まれているため、ビジュアル検討ファイルはコミットしない。

## Runtime Commands

追加パッケージはインストールしない。実行時に `load_workspace_dependencies` で最新パスを再確認し、現環境では次を使う。

```bash
RUNTIME_NODE=/Users/kenichihanada/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node
RUNTIME_MODULES=/Users/kenichihanada/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules
RUNTIME_BIN=/Users/kenichihanada/.cache/codex-runtimes/codex-primary-runtime/dependencies/bin/override
RUNTIME_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
```

Playwrightスクリプトは次の形で実行する。

```bash
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/capture-manual-assets.cjs
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/build-manual-pdf.cjs
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/verify-manual.cjs
```

ローカルサーバーは別セッションでリポジトリルートから起動する。

```bash
python3 -m http.server 8765 --directory files
```

---

### Task 1: 説明書のテスト土台、HTML骨格、アプリ入口

**Files:**
- Create: `tests/manual.test.js`
- Create: `files/manual.html`
- Modify: `files/index.html:18-22, 538-564`

**Interfaces:**
- Consumes: 現行ヘッダー、既存の印刷CSS、`files/index.html` と `files/manual.html` の相対配置
- Produces: `.manual-link`、`manual.html` の見出しID、`#printManual`、`./index.html` への `.app-link`

- [ ] **Step 1: 構造テストを書く**

`tests/manual.test.js` を次の内容で作成する。

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const indexPath = "files/index.html";
const manualPath = "files/manual.html";

test("アプリのヘッダーから説明書を新しい画面で安全に開く", () => {
  const index = fs.readFileSync(indexPath, "utf8");
  assert.match(
    index,
    /<a class="manual-link" href="\.\/manual\.html" target="_blank" rel="noopener">？ 説明書<\/a>/
  );
  assert.match(index, /@media print\{[\s\S]*?\.manual-link[\s\S]*?display:none !important/);
});

test("説明書は日本語の章構造と操作ボタンを持つ", () => {
  assert.equal(fs.existsSync(manualPath), true);
  const manual = fs.readFileSync(manualPath, "utf8");
  assert.match(manual, /<html lang="ja">/);
  assert.match(manual, /id="quick-start"/);
  assert.match(manual, /id="input-guide"/);
  assert.match(manual, /id="auto-placement"/);
  assert.match(manual, /id="edit-guide"/);
  assert.match(manual, /id="sheet-guide"/);
  assert.match(manual, /id="troubleshooting"/);
  assert.match(manual, /id="admin-guide"/);
  assert.match(manual, /id="printManual"[^>]*onclick="window\.print\(\)"/);
  assert.match(manual, /class="app-link" href="\.\/index\.html"/);
});
```

- [ ] **Step 2: テストが期待どおり失敗することを確認する**

Run:

```bash
node --test tests/manual.test.js
```

Expected: `manual-link` が存在せず、`files/manual.html` も存在しないためFAIL。

- [ ] **Step 3: `files/manual.html` の骨格を作る**

次の要素をすべて実装する。

```html
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>パレット配置図 操作説明書</title>
</head>
<body>
  <header class="manual-header">
    <div><p class="eyebrow">操作説明書</p><h1>パレット配置図 自動作成</h1></div>
    <div class="manual-actions">
      <a class="app-link" href="./index.html">アプリを開く</a>
      <button id="printManual" type="button" onclick="window.print()">印刷する</button>
    </div>
  </header>
  <div class="manual-shell">
    <nav class="manual-nav" aria-label="説明書の目次">
      <a href="#quick-start">クイックスタート</a>
      <a href="#input-guide">入力する</a>
      <a href="#auto-placement">自動配置を作る</a>
      <a href="#edit-guide">配置を編集する</a>
      <a href="#sheet-guide">配置図を確認・印刷する</a>
      <a href="#troubleshooting">困ったとき</a>
      <a href="#admin-guide">管理者向け</a>
    </nav>
    <main>
      <section id="quick-start"><h2>1. クイックスタート</h2></section>
      <section id="input-guide"><h2>2. 入力する</h2></section>
      <section id="auto-placement"><h2>3. 自動配置を作る</h2></section>
      <section id="edit-guide"><h2>4. 配置を編集する</h2></section>
      <section id="sheet-guide"><h2>5. 配置図を確認・印刷する</h2></section>
      <section id="troubleshooting"><h2>6. 困ったとき</h2></section>
      <section id="admin-guide"><h2>7. 管理者向け：設定と運用</h2></section>
    </main>
  </div>
</body>
</html>
```

同じファイルの `<style>` に次を実装する。

- 本文最大幅 `1120px`、本文行長は `72ch` 以下
- PCは目次と本文の2列、`720px` 以下は1列
- リンクとボタンの最小高さ `44px`
- `.step`、`.callout`、`.notice.info`、`.notice.warn`、`.notice.danger`、`.screen-figure`、`.diagram` の共通部品
- `@page { size: A4 portrait; margin: 12mm; }`
- `@media print` で `.manual-nav`、`.manual-actions` を非表示
- `@media print` で `.step`、`.screen-figure`、`.notice` に `break-inside: avoid`
- `print-color-adjust: exact` と `-webkit-print-color-adjust: exact` を補助指定するが、枠線と文字を常に残す

初期CSSは次を使い、後続タスクではこの部品へ追記する。

```css
:root{--navy:#163f5d;--blue:#176fa8;--orange:#df762d;--ink:#24313b;--muted:#60717e;--line:#cdd8e0;--paper:#fff;--bg:#eef2f5}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:-apple-system,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif;background:var(--bg);color:var(--ink);line-height:1.75}
a{color:var(--blue)}
button,a{min-height:44px}
.manual-header{background:var(--navy);color:#fff;padding:18px max(18px,calc((100% - 1120px)/2));display:flex;justify-content:space-between;gap:16px;align-items:center}
.manual-header h1,.manual-header p{margin:0}.eyebrow{font-size:12px;color:#c9dce8}
.manual-actions{display:flex;gap:8px}.manual-actions a,.manual-actions button{display:inline-flex;align-items:center;border:1px solid #8eb0c5;border-radius:7px;padding:8px 12px;background:#fff;color:var(--navy);font:inherit;text-decoration:none;cursor:pointer}
.manual-shell{width:min(1120px,calc(100% - 32px));margin:20px auto;display:grid;grid-template-columns:230px minmax(0,1fr);gap:22px;align-items:start}
.manual-nav{position:sticky;top:16px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px}.manual-nav a{display:flex;align-items:center;padding:8px;border-radius:6px;text-decoration:none}
main{min-width:0}main section{background:#fff;border:1px solid var(--line);border-radius:12px;padding:24px;margin-bottom:20px}main p,main li{max-width:72ch}
.step,.screen-figure,.diagram,.notice{break-inside:avoid}.step{margin:22px 0}.screen-figure{margin:14px 0}.screen-wrap{position:relative}.screen-figure img{display:block;width:100%;height:auto;border:1px solid #91a4b2;border-radius:8px}.callout-marker{position:absolute;display:grid;place-items:center;width:30px;height:30px;border:2px solid #fff;border-radius:50%;background:#bd2f2f;color:#fff;font-weight:800;box-shadow:0 2px 6px #4b5964}
.notice{border:2px solid;padding:12px 14px;border-radius:8px}.notice.info{border-color:#4b89af}.notice.warn{border-color:#a66b08}.notice.danger{border-color:#a52b2b}.notice strong{display:block}
@media(max-width:720px){.manual-header{align-items:flex-start}.manual-shell{grid-template-columns:1fr}.manual-nav{position:static;display:flex;overflow-x:auto}.manual-nav a{flex:0 0 auto}.manual-actions{flex-direction:column}.manual-header h1{font-size:20px}}
@page{size:A4 portrait;margin:12mm}
@media print{body{background:#fff;font-size:10.5pt}.manual-actions,.manual-nav{display:none!important}.manual-shell{display:block;width:auto;margin:0}main section{border:0;padding:0;margin:0}.step,.screen-figure,.diagram,.notice{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
```

- [ ] **Step 4: `files/index.html` に入口を追加する**

`header` を相対配置にし、`h1` と説明文を覆わない右上位置へ `.manual-link` を追加する。狭幅では文字を `？ 説明書` のまま保ち、ヘッダー説明文に右余白を確保する。

```css
header{position:relative;background:#111827;color:#fff;padding:12px 124px 12px 16px}
.manual-link{position:absolute;right:16px;top:12px;display:inline-flex;align-items:center;min-height:40px;padding:6px 10px;border:1px solid #94a3b8;border-radius:7px;color:#fff;text-decoration:none;font-size:13px;font-weight:700}
.manual-link:hover{background:#263244}
@media(max-width:480px){header{padding-right:112px}.manual-link{right:10px;font-size:12px}}
```

```html
<header>
  <h1>パレット配置図 自動作成</h1>
  <p>個数 ÷ SNP でパレット数を自動計算（切り上げ）／ ロットごとにまとめて配置</p>
  <a class="manual-link" href="./manual.html" target="_blank" rel="noopener">？ 説明書</a>
</header>
```

既存の `@media print` の非表示対象へ `.manual-link` を加える。配置図印刷時の `.sheet`、`@page { size:A4 landscape }`、倍率 `1.4` は変更しない。

- [ ] **Step 5: テストを通す**

Run:

```bash
node --test tests/manual.test.js tests/sheet-placement.test.js
```

Expected: 新規テスト2件と既存49件がすべてPASS。

- [ ] **Step 6: Task 1をコミットする**

```bash
git add tests/manual.test.js files/manual.html files/index.html
git diff --cached --check
git commit -m "feat: アプリに操作説明書の入口を追加"
```

---

### Task 2: 再生成可能な実画面キャプチャ

**Files:**
- Create: `scripts/capture-manual-assets.cjs`
- Create: `files/manual-assets/quick-start-input-desktop.png`
- Create: `files/manual-assets/quick-start-placement-desktop.png`
- Create: `files/manual-assets/quick-start-edit-desktop.png`
- Create: `files/manual-assets/quick-start-sheet-desktop.png`
- Create: `files/manual-assets/input-slips-mobile.png`
- Create: `files/manual-assets/input-error-mobile.png`
- Create: `files/manual-assets/edit-sweep-mobile.png`
- Create: `files/manual-assets/edit-stash-mobile.png`
- Create: `files/manual-assets/edit-blocked-mobile.png`
- Create: `files/manual-assets/settings-master-desktop.png`
- Create: `files/manual-assets/settings-spaces-desktop.png`
- Create: `files/manual-assets/settings-display-desktop.png`
- Modify: `tests/manual.test.js`

**Interfaces:**
- Consumes: `http://127.0.0.1:8765/`、`SAMPLES.basic`、公開済みの画面関数 `loadSample`, `switchTab`, `switchCfgTab`, `setBlockedEditMode`
- Produces: 上記12枚の固定名PNG、後続タスクが使う `files/manual-assets/`

- [ ] **Step 1: 画像資産テストを追加する**

`tests/manual.test.js` へ次を追加する。

```js
const path = require("node:path");

const manualImages = [
  "quick-start-input-desktop.png",
  "quick-start-placement-desktop.png",
  "quick-start-edit-desktop.png",
  "quick-start-sheet-desktop.png",
  "input-slips-mobile.png",
  "input-error-mobile.png",
  "edit-sweep-mobile.png",
  "edit-stash-mobile.png",
  "edit-blocked-mobile.png",
  "settings-master-desktop.png",
  "settings-spaces-desktop.png",
  "settings-display-desktop.png",
];

test("説明書の実画面画像はすべてPNGとして生成済み", () => {
  for (const name of manualImages) {
    const file = path.join("files/manual-assets", name);
    assert.equal(fs.existsSync(file), true, `${name} が必要`);
    const data = fs.readFileSync(file);
    assert.equal(data.subarray(1, 4).toString("ascii"), "PNG", `${name} はPNG`);
    assert.ok(data.length > 10_000, `${name} が空画像ではない`);
  }
});
```

- [ ] **Step 2: 画像がないためFAILすることを確認する**

Run: `node --test tests/manual.test.js`

Expected: `quick-start-input-desktop.png が必要` でFAIL。

- [ ] **Step 3: 撮影スクリプトを作る**

`scripts/capture-manual-assets.cjs` は次の動作を実装する。

```js
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseURL = process.env.MANUAL_BASE_URL || "http://127.0.0.1:8765/";
const outDir = path.resolve("files/manual-assets");
const chromePath = process.env.MANUAL_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
fs.mkdirSync(outDir, { recursive: true });

async function capture(page, name, locator = "body") {
  await page.locator(locator).screenshot({ path: path.join(outDir, name) });
}

async function prepare(page) {
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => {
    document.getElementById("dateInput").value = "2026-09-14";
    onHeadChange();
    loadSample("basic");
  });
}

async function showSingleSlip(page) {
  await page.evaluate(() => {
    activeShift().slips = [normalizeSlip({ status: "fax", items: [normalizeItem(SAMPLES.basic[1])] })];
    renderSlips(activeShift().slips);
    saveSchedule();
    switchTab("input");
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const desktop = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const page = await desktop.newPage();
  await prepare(page);

  await showSingleSlip(page);
  await capture(page, "quick-start-input-desktop.png", "#tab-input");
  await prepare(page);
  await page.evaluate(() => switchTab("edit"));
  await capture(page, "quick-start-placement-desktop.png", "#editCard");

  await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#mapBody .cell[data-lot='0']")].slice(0, 2);
    cells.forEach(toggleCell);
  });
  await capture(page, "quick-start-edit-desktop.png", "#editCard");
  await page.evaluate(() => switchTab("sheet"));
  await capture(page, "quick-start-sheet-desktop.png", "#sheetCard");

  await page.evaluate(() => { switchTab("settings"); switchCfgTab("master"); });
  await capture(page, "settings-master-desktop.png", "#tab-settings");
  await page.evaluate(() => switchCfgTab("spaces"));
  await capture(page, "settings-spaces-desktop.png", "#tab-settings");
  await page.evaluate(() => switchCfgTab("display"));
  await capture(page, "settings-display-desktop.png", "#tab-settings");

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    serviceWorkers: "block",
  });
  const phone = await mobile.newPage();
  await prepare(phone);
  await showSingleSlip(phone);
  await capture(phone, "input-slips-mobile.png", "#tab-input");

  await phone.evaluate(() => {
    schedule.shifts[activeTiming].slips = [normalizeSlip({
      status: "fax",
      items: [normalizeItem({ type: "充填品", name: "部品A", lot: "L-101", snp: 0, qty: 120 })],
    })];
    renderSlips(activeShift().slips);
    runFromButton();
  });
  await capture(phone, "input-error-mobile.png", "#tab-input");

  await prepare(phone);
  await phone.evaluate(() => switchTab("edit"));
  await phone.evaluate(() => {
    [...document.querySelectorAll("#mapBody .cell[data-lot='0']")].slice(0, 3).forEach(toggleCell);
  });
  await capture(phone, "edit-sweep-mobile.png", "#editCard");

  await phone.evaluate(() => {
    clearSel();
    [...document.querySelectorAll("#zone-near .cell[data-lot='0']")].slice(0, 2).forEach(toggleCell);
    applyMove("退避", 0);
  });
  await capture(phone, "edit-stash-mobile.png", "#editCard");

  await phone.evaluate(() => {
    setBlockedEditMode(true);
    const empty = document.querySelector("#zone-near .cell:not([data-lot])");
    if (empty) toggleBlockedCell(empty);
  });
  await capture(phone, "edit-blocked-mobile.png", "#editCard");

  await desktop.close();
  await mobile.close();
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
```

キャプチャ対象が画面外へ伸びる場合は、説明内容を失わない範囲で対象locatorを `.card` や `.slip` に狭める。固定ピクセルで切り抜かずDOM要素単位で撮る。

- [ ] **Step 4: サーバーを起動して画像を生成する**

Terminal A:

```bash
python3 -m http.server 8765 --directory files
```

Terminal B:

```bash
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/capture-manual-assets.cjs
```

Expected: `files/manual-assets/` に12枚のPNGが作られ、スクリプトが終了コード0で完了。

- [ ] **Step 5: 画像を目視し、テストを通す**

`view_image` で12枚を確認し、次を満たさない画像はlocatorまたは準備状態を直して再生成する。

- 現行UIの文字が読める
- ブラウザやOSの個人情報が写っていない
- 組み込みサンプル以外の伝票データがない
- 対象操作が画像内にある
- 空白だけ、途中で切れた状態、古いキャッシュではない

Run: `node --test tests/manual.test.js`

Expected: 画像テストを含む全テストがPASS。

- [ ] **Step 6: Task 2をコミットする**

```bash
git add scripts/capture-manual-assets.cjs files/manual-assets tests/manual.test.js
git diff --cached --check
git commit -m "docs: 説明書用の実画面画像を生成"
```

---

### Task 3: 利用者向け本文と図解

**Files:**
- Modify: `files/manual.html`
- Modify: `tests/manual.test.js`

**Interfaces:**
- Consumes: Task 1のHTML部品、Task 2の12枚のPNG
- Produces: `#quick-start` から `#sheet-guide` までの利用者向け本文、番号付き実画面図、インライン模式図

- [ ] **Step 1: 必須内容とアクセシビリティのテストを追加する**

`tests/manual.test.js` へ次を追加する。

```js
test("利用者向けの主要操作と注意を説明する", () => {
  const manual = fs.readFileSync(manualPath, "utf8");
  for (const text of [
    "FAX伝票を追加", "仮伝票を追加", "FAX受領済みにする",
    "満杯時に混載を許可", "自動配置を作成", "入力を変更した後は再配置",
    "なぞり", "退避スペース", "配置不可エリア", "自動配置を実行",
    "退避スペースに残っている荷物は配置図に出ません",
    "表示倍率", "選択中の時間帯だけを印刷",
  ]) assert.match(manual, new RegExp(text));
});

test("説明書内の画像には空でない代替テキストとキャプションがある", () => {
  const manual = fs.readFileSync(manualPath, "utf8");
  const images = [...manual.matchAll(/<img\b([^>]*)>/g)];
  assert.ok(images.length >= 12);
  for (const [, attrs] of images) assert.match(attrs, /alt="[^"]+"/);
  const figures = [...manual.matchAll(/<figure\b[\s\S]*?<\/figure>/g)];
  assert.ok(figures.length >= 12);
  for (const [figure] of figures) assert.match(figure, /<figcaption>/);
});

test("図解の意味を色だけに依存させない", () => {
  const manual = fs.readFileSync(manualPath, "utf8");
  assert.match(manual, /class="callout-marker"[^>]*>1</);
  assert.match(manual, /class="notice warn"[\s\S]*?>注意</);
  assert.match(manual, /class="notice danger"[\s\S]*?>重要</);
});
```

- [ ] **Step 2: テストが本文不足でFAILすることを確認する**

Run: `node --test tests/manual.test.js`

Expected: 「FAX伝票を追加」または画像数不足のアサーションでFAIL。

- [ ] **Step 3: クイックスタートを完成させる**

`#quick-start` に次をこの順で書く。

1. 「このアプリで行うこと」: `入力 → 自動配置 → 配置編集 → 配置図 → 印刷` の5段階模式図
2. 「1 搬入日と時間帯を選ぶ」: 搬入日と「あさ／ひる」を図上番号で示す
3. 「2 FAX伝票を入力する」: `部品A / L-101 / SNP 10 / 個数 120 / 12P` の例を使う
4. 「3 自動配置を作る」: `満杯時に混載を許可` と `▶ 自動配置を作成` を示す
5. 「4 配置を1回直す」: 同じ番号の2マスを選び、空き列へ動かす前後図を示す
6. 「5 配置図を確認して印刷する」: 時間帯、警告欄、印刷ボタンを示す
7. 「印刷前の3点確認」: `退避が空 / あふれ0P / 正しい時間帯` のチェック図

クイックスタート冒頭に「この章は最初の一回を成功させるための案内です。詳しい操作は2章以降で調べられます。」と明記する。

- [ ] **Step 4: 入力と自動配置の章を完成させる**

`#input-guide` と `#auto-placement` に設計書4-2、4-3の全項目を書く。特に次の文言は意味を変えず明記する。

- FAX用紙1枚につき「＋ FAX伝票を追加」を1回使い、同じFAXの2品目目以降は「＋ 品目を追加」を使う
- 仮伝票はロット空欄のまま配置でき、「FAX受領済みにする」だけでは配置は変わらない
- 空ロットの品目は、品名が同じでも別々に配置される
- パレット数は `個数 ÷ SNP` を切り上げる
- 品名、SNP、個数が不足すると赤枠になり、自動配置は実行されない
- 入力変更後は再配置が必要で、元の入力へ戻せば条件が一致する保存結果を復元できる場合がある
- `越` は通路へのはみ出し、`混` は混載を表す

実画面画像へ `.screen-figure` 内の割合座標で `.callout-marker` を重ね、番号に対応する説明リストを画像直後へ置く。

各操作項目は次のマークアップを使う。マーカーの `left` と `top` は画像を目視して対象部品の中心へ合わせた割合を入れ、各図の表示確認で補正する。

```html
<article class="step">
  <h3><span class="step-number">1</span>FAX伝票を追加する</h3>
  <p>FAX用紙1枚につき「＋ FAX伝票を追加」を1回押します。同じFAXの2品目目以降は、伝票内の「＋ 品目を追加」を使います。</p>
  <figure class="screen-figure">
    <div class="screen-wrap">
      <img src="./manual-assets/quick-start-input-desktop.png" alt="入力画面でFAX伝票を追加する場所">
      <span class="callout-marker" style="left:24%;top:68%">1</span>
    </div>
    <figcaption>①「＋ FAX伝票を追加」を押します。</figcaption>
  </figure>
</article>
```

- [ ] **Step 5: 配置編集と配置図の章を完成させる**

`#edit-guide` と `#sheet-guide` に設計書4-4、4-5の全項目を書く。次の注意は `.notice danger` または `.notice warn` で目立たせる。

- 退避スペースに残っている荷物は配置図に出ない
- 配置不可セルに荷物が残る表示は再配置待ちであり、「自動配置を実行」が必要
- 自動配置し直すと手動調整を破棄する確認が出る場合がある
- 印刷は選択中の「あさ／ひる」だけに作用する
- 配置図の警告がある場合は、印刷前に内容を確認する

なぞり操作は `指を置く → 同じロット上をなぞる → 選択外へ出して運ぶ` の3コマ模式図にする。配置不可編集は `編集開始 → セルをタップ／なぞる → 自動配置を実行` の3段階模式図にする。

- [ ] **Step 6: 利用者向け本文のテストと表示確認を行う**

Run:

```bash
node --test tests/manual.test.js tests/sheet-placement.test.js
```

Expected: 全テストPASS。

ブラウザで `http://127.0.0.1:8765/manual.html` を1280px幅と390px幅で開き、目次、図、注意枠、横はみ出し、44pxタップ対象を確認する。

- [ ] **Step 7: Task 3をコミットする**

```bash
git add files/manual.html tests/manual.test.js
git diff --cached --check
git commit -m "docs: 図解中心の利用者向け操作説明を追加"
```

---

### Task 4: 逆引き、管理者向け章、README

**Files:**
- Modify: `files/manual.html`
- Modify: `files/README.md:1-20, data and deployment sections`
- Modify: `tests/manual.test.js`

**Interfaces:**
- Consumes: 現行localStorage保存仕様、品目マスタJSON仕様、設定タブ、Service Worker更新バー
- Produces: `#troubleshooting`、`#admin-guide`、READMEの説明書リンク

- [ ] **Step 1: 逆引き・管理者内容のテストを追加する**

`tests/manual.test.js` へ次を追加する。

```js
test("困ったときと管理者向けの保存範囲を正確に説明する", () => {
  const manual = fs.readFileSync(manualPath, "utf8");
  for (const text of [
    "この端末に保存", "PCとスマートフォンでは別々に保存",
    "サイトデータを削除すると消えます", "品目マスタをJSON保存",
    "伝票入力、配置結果、配置マス、表示設定は含まれません",
    "配置マス", "行の順番には意味があります", "表示設定",
    "新しいバージョンがあります", "更新する", "GitHub Pages",
  ]) assert.match(manual, new RegExp(text));
});

test("READMEから利用者向け説明書へ移動できる", () => {
  const readme = fs.readFileSync("files/README.md", "utf8");
  assert.match(readme, /\[利用者向け操作説明書\]\(\.\/manual\.html\)/);
});
```

- [ ] **Step 2: テストが不足内容でFAILすることを確認する**

Run: `node --test tests/manual.test.js`

Expected: 保存範囲またはREADMEリンクのアサーションでFAIL。

- [ ] **Step 3: `#troubleshooting` を完成させる**

次の質問を見出しにし、結論を最初の1文に書く。

- 「入力を変えたら配置編集・配置図が開けない」→ 入力に合わせて自動配置し直す
- 「荷物が配置図に出ない」→ 退避、あふれ、配置マスの掲載先を順に確認する
- 「古い画面が表示される」→ 更新バーの「更新する」を押し、出ない場合は再読込する
- 「別の端末にデータがない」→ 端末・ブラウザごとの保存であり自動同期しない
- 「データが消えた」→ サイトデータ削除後は品目マスタJSON以外を復元できない
- 「紙で色や図が見づらい」→ 印刷プレビューと背景グラフィック設定を確認する。色なしでも番号と枠で読めることを併記する

- [ ] **Step 4: `#admin-guide` を完成させる**

設計書4-7を画面順に書く。品目マスタJSONについては、含まれるものを「品名、SNP」、含まれないものを「伝票入力、配置結果、配置マス、表示設定」と対比図で示す。

配置マス設定は次を表で説明する。

| 項目 | 説明 |
|---|---|
| 名前 | 画面と配置図に表示するエリア名 |
| 区分 | `near`=倉庫内、`far`=倉庫外 |
| 向き | `v`=縦列、`h`=横行 |
| ブロック列数 | 1品目が連続して使える列数 |
| 各列の高さ | 数字がマス数、末尾`*`は通路 |
| 掲載先 | `top`=上段、`bottom`=下段、`over`=あふれブロック |

`over` は新しい荷物の配置対象外で、既存荷物が残る場合も配置図には出ないこと、行順を変えると自動配置順・配置図基準・手動調整へ影響することを警告する。

更新手順は `index.html / manual.html / manual-assets / manual.pdf / sw.jsのCACHE_VERSION` の確認順をチェックリストで示す。

- [ ] **Step 5: READMEへ説明書リンクを追加する**

冒頭説明の直後へ追加する。

```markdown
## 操作説明書

図解入りの詳しい使い方は、[利用者向け操作説明書](./manual.html)を参照してください。
初めて使う場合は「クイックスタート」から入力、配置編集、配置図の印刷までを確認できます。
```

既存のGitHub Pages、ホーム画面追加、更新、保存、恒久レイアウト変更の章は削除しない。

- [ ] **Step 6: テストと内容照合を行う**

Run:

```bash
node --test tests/manual.test.js tests/sheet-placement.test.js
```

Expected: 全テストPASS。

`files/index.html` のボタン名・警告文、`files/README.md` の保存範囲、設計書4章を横に並べ、説明漏れと用語揺れがないことを確認する。UI上のタブ名は「配置図」で統一する。

- [ ] **Step 7: Task 4をコミットする**

```bash
git add files/manual.html files/README.md tests/manual.test.js
git diff --cached --check
git commit -m "docs: 逆引きと管理者向け説明を追加"
```

---

### Task 5: Service Worker、PDF生成、配布物検証

Task 5の開始時に `pdf:pdf` スキルを読み、PDFの生成・レンダリング・目視確認手順を適用する。

**Files:**
- Create: `scripts/build-manual-pdf.cjs`
- Create: `files/manual.pdf`
- Modify: `files/sw.js:1-20`
- Modify: `tests/manual.test.js`

**Interfaces:**
- Consumes: 完成した `files/manual.html` と12枚の画像、`http://127.0.0.1:8765/manual.html`
- Produces: A4縦の `files/manual.pdf`、`v51` のオフラインキャッシュ

- [ ] **Step 1: キャッシュとPDFの失敗テストを追加する**

`tests/manual.test.js` へ次を追加する。

```js
test("Service Workerは説明書と全画像を事前キャッシュする", () => {
  const sw = fs.readFileSync("files/sw.js", "utf8");
  assert.match(sw, /const CACHE_VERSION = "v51"/);
  assert.match(sw, /"\.\/manual\.html"/);
  for (const name of manualImages) {
    assert.match(sw, new RegExp(`"\\.\\/manual-assets\\/${name.replaceAll(".", "\\.")}"`));
  }
  assert.doesNotMatch(sw, /"\.\/manual\.pdf"/);
});

test("配布用PDFが生成済み", () => {
  const pdf = fs.readFileSync("files/manual.pdf");
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 100_000);
});
```

- [ ] **Step 2: 現在のキャッシュ版とPDF不足でFAILすることを確認する**

Run: `node --test tests/manual.test.js`

Expected: `v51` と `files/manual.pdf` のテストがFAIL。

- [ ] **Step 3: `files/sw.js` を更新する**

- `CACHE_VERSION` を `v51` にする
- `PRECACHE` の `./index.html` の直後へ `./manual.html` を追加する
- Task 2の12画像を `./manual-assets/<filename>` で列挙する
- `./manual.pdf` は列挙しない
- HTMLのネットワーク優先、非HTMLのキャッシュ優先、更新通知の仕組みは変更しない

- [ ] **Step 4: PDF生成スクリプトを作る**

`scripts/build-manual-pdf.cjs` を次の内容で作る。

```js
const { chromium } = require("playwright");
const path = require("node:path");

const manualURL = process.env.MANUAL_URL || "http://127.0.0.1:8765/manual.html";
const output = path.resolve("files/manual.pdf");
const chromePath = process.env.MANUAL_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(manualURL, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: output,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: "0", right: "0", bottom: "0", left: "0" },
  });
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
```

- [ ] **Step 5: PDFを生成し、機械検査を通す**

サーバー起動中に実行する。

```bash
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/build-manual-pdf.cjs
"$RUNTIME_BIN/pdfinfo" files/manual.pdf
node --test tests/manual.test.js
```

Expected: PDFはA4 `595 x 842 pts`、ページ数1以上、PDFテストとキャッシュテストがPASS。

- [ ] **Step 6: PDF全ページを画像化して目視確認する**

```bash
MANUAL_RENDER_DIR=/private/tmp/pallet-manual-render
mkdir -p "$MANUAL_RENDER_DIR"
"$RUNTIME_BIN/pdftoppm" -png -r 120 files/manual.pdf "$MANUAL_RENDER_DIR/page"
```

全PNGを `view_image` で確認し、次を満たすまで `manual.html` の印刷CSSを修正してPDFを再生成する。

- 空白ページがない
- 見出しだけがページ末尾に残らない
- 操作項目、図、キャプション、注意枠が分断されない
- 画像と文字が用紙から切れない
- 本文と注釈が読める大きさである
- カラーとグレースケールの両方で番号、注意、禁止が区別できる
- ブラウザ用の目次・ボタンが紙面に出ない

- [ ] **Step 7: Task 5をコミットする**

```bash
git add scripts/build-manual-pdf.cjs files/manual.pdf files/manual.html files/sw.js tests/manual.test.js
git diff --cached --check
git commit -m "docs: 操作説明書のPDFとオフライン配信を追加"
```

---

### Task 6: ブラウザE2Eと最終回帰確認

**Files:**
- Create: `scripts/verify-manual.cjs`
- Modify: `files/manual.html` only if verification finds an in-scope layout/accessibility defect
- Modify: `tests/manual.test.js` only if verification exposes a missing regression assertion

**Interfaces:**
- Consumes: 完成したアプリ、説明書、Service Worker、PDF
- Produces: 再実行可能なオンライン・オフライン・印刷表示スモークテスト

- [ ] **Step 1: ブラウザ検証スクリプトを作る**

`scripts/verify-manual.cjs` は次を確認する。

```js
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const baseURL = process.env.MANUAL_BASE_URL || "http://127.0.0.1:8765/";
const chromePath = process.env.MANUAL_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const app = await context.newPage();
  await app.goto(baseURL, { waitUntil: "networkidle" });
  await app.evaluate(async () => { await navigator.serviceWorker.ready; });
  if (!(await app.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await app.reload({ waitUntil: "networkidle" });
  }

  const popupPromise = context.waitForEvent("page");
  await app.locator(".manual-link").click();
  const manual = await popupPromise;
  await manual.waitForLoadState("networkidle");
  assert.match(await manual.title(), /操作説明書/);
  assert.equal(await app.locator("#tabbtn-input").getAttribute("class"), "tab active");

  await manual.setViewportSize({ width: 390, height: 844 });
  assert.equal(await manual.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await manual.locator("nav a").first().isVisible(), true);

  await manual.emulateMedia({ media: "print" });
  assert.equal(await manual.locator(".manual-actions").evaluate(el => getComputedStyle(el).display), "none");

  await context.setOffline(true);
  await manual.close();
  const offlinePopupPromise = context.waitForEvent("page");
  await app.locator(".manual-link").click();
  const offlineManual = await offlinePopupPromise;
  await offlineManual.waitForLoadState("domcontentloaded");
  assert.match(await offlineManual.title(), /操作説明書/);

  await browser.close();
  console.log("manual E2E: PASS");
})().catch(error => { console.error(error); process.exitCode = 1; });
```

`navigator.serviceWorker.ready` 後も初回ページが未制御なら、上記の `navigator.serviceWorker.controller` 判定でアプリを1回だけ再読込する。無条件のsleepは使わない。

- [ ] **Step 2: ローカルキャッシュを消した状態でE2Eを実行する**

Playwrightの新規コンテキストを使うため、普段のブラウザのService Workerやデータは削除しない。

```bash
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/verify-manual.cjs
```

Expected: `manual E2E: PASS`、終了コード0。

- [ ] **Step 3: 静的テストと回帰テストを実行する**

```bash
node --test tests/manual.test.js tests/sheet-placement.test.js
git diff --check
```

Expected: 全テストPASS、`git diff --check` の出力なし。既存テストは49件以上、新規manualテストも全件成功。

- [ ] **Step 4: 利用者の主動線を画面で確認する**

Playwrightの独立コンテキストで次を順に操作する。

1. 入力タブで基本サンプルを読み込む
2. 「▶ 自動配置を作成」を押す
3. 配置編集で2マス選択し、空き列へ移動する
4. 配置不可エリア編集で空きセルを1つ指定し、「自動配置を実行」を押す
5. 配置図タブを開き、退避警告・あふれ警告がないことを確認する
6. 説明書を開き、元のアプリが配置図タブのまま残ることを確認する
7. 配置図の印刷プレビューが既存どおりA4横、説明書の印刷プレビューがA4縦であることを確認する

期待結果: 説明書記載のボタン名・画面遷移・注意が現行UIと一致し、アプリ側の配置・印刷に回帰がない。

- [ ] **Step 5: 最終差分をレビューする**

- `git status --short` で本計画外の既存変更と本計画の変更を区別する
- `git diff c219e5a..HEAD -- files/index.html files/manual.html files/sw.js files/README.md tests/manual.test.js scripts files/manual-assets` で設計コミット以降のコード・文言・資産を確認する
- PDFを再生成した最終 `manual.html` と同じコミットに含める
- 実データ、秘密情報、絶対ローカルパスが `files/` 配下へ混入していないことを `rg` と目視で確認する

- [ ] **Step 6: Task 6をコミットする**

```bash
git add scripts/verify-manual.cjs files/manual.html tests/manual.test.js
git diff --cached --check
git commit -m "test: 操作説明書のブラウザ検証を追加"
```

ファイルに変更がなく、`scripts/verify-manual.cjs` が既に別タスクへ含まれている場合だけ、空コミットは作らず検証結果を作業報告へ記録する。

## Final Verification

```bash
node --test tests/manual.test.js tests/sheet-placement.test.js
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/capture-manual-assets.cjs
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/build-manual-pdf.cjs
MANUAL_CHROME_PATH="$RUNTIME_CHROME" NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/verify-manual.cjs
"$RUNTIME_BIN/pdfinfo" files/manual.pdf
git diff --check
git status --short
```

Expected:

- 静的テストと既存配置テストがすべてPASS
- 12枚のPNGが再生成できる
- PDFがA4で再生成でき、全ページの目視確認が完了
- オンライン・オフラインの説明書リンク、390px表示、印刷表示がPASS
- 本計画のファイル以外に新たな変更がない
- 実機プリンタ固有の余白・濃度は未検証として最終報告へ明記

## Execution Handoff

この計画はタスク間で同じHTML・テスト・生成物を段階的に更新するため、同一セッション内でタスクごとに実装者とレビューを切り替える subagent-driven 方式で実行する。
