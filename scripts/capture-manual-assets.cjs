/* 説明書（PC版）用の実画面キャプチャを再生成するスクリプト。
   組み込みサンプルだけを使い、利用者の通常ブラウザとlocalStorageには触れない。

   前提: リポジトリの files/ をローカルサーバーで配信しておく。
     python3 -m http.server 8765 --directory files

   実行例:
     MANUAL_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     NODE_PATH="$RUNTIME_MODULES" "$RUNTIME_NODE" scripts/capture-manual-assets.cjs
*/
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const baseURL = process.env.MANUAL_BASE_URL || "http://127.0.0.1:8765/";
const outDir = path.resolve("files/manual-assets");
const chromePath = process.env.MANUAL_CHROME_PATH ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

fs.mkdirSync(outDir, { recursive: true });

async function capture(page, name, locator = "body") {
  await page.waitForTimeout(150);
  await page.locator(locator).first().screenshot({ path: path.join(outDir, name) });
  console.log("撮影:", name);
}

// 毎回まっさらな状態から、基本サンプルを読み込んだ既定の画面に戻す。
async function prepare(page) {
  await page.goto(baseURL, { waitUntil: "load" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.evaluate(() => {
    document.getElementById("dateInput").value = "2026-09-14";
    onHeadChange();
    loadSample("basic");
  });
  await page.waitForTimeout(200);
}

// 入力欄の説明用に、伝票1件・品目1件だけの状態にする。
async function showSingleSlip(page) {
  await page.evaluate(() => {
    activeShift().slips = [normalizeSlip({
      status: "fax",
      items: [normalizeItem(SAMPLES.basic[1])],
    })];
    renderSlips(activeShift().slips);
    saveSchedule();
    switchTab("input");
  });
  await page.waitForTimeout(150);
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  });
  const page = await context.newPage();

  // --- 画面の見取り図（ヘッダーとタブ） ---
  await prepare(page);
  await capture(page, "overview-tabs.png", ".tabs");

  // --- クイックスタート ---
  await showSingleSlip(page);
  await capture(page, "quick-input.png", "#tab-input .input-head");
  await capture(page, "quick-item.png", "#slipList .slip");
  await capture(page, "quick-run.png", ".input-add-actions");

  await prepare(page);
  await page.evaluate(() => { runFromButton(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => switchTab("edit"));
  await capture(page, "quick-edit.png", "#editCard");

  await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#mapBody .cell[data-lot='0']")].slice(0, 3);
    cells.forEach(toggleCell);
  });
  await capture(page, "edit-select.png", "#editCard");

  await page.evaluate(() => switchTab("sheet"));
  await page.waitForTimeout(300);
  await capture(page, "quick-sheet.png", "#sheetCard");
  await capture(page, "sheet-toolbar.png", "#sheetCard .sheet-toolbar");

  // --- 入力タブの詳細 ---
  await prepare(page);
  await capture(page, "input-slips.png", "#tab-input");

  await page.evaluate(() => {
    activeShift().slips = [normalizeSlip({
      status: "fax",
      items: [normalizeItem({ type: "充填品", name: "部品A", lot: "L-101", snp: 0, qty: 120 })],
    })];
    renderSlips(activeShift().slips);
    runFromButton();
  });
  await page.waitForTimeout(300);
  await capture(page, "input-error.png", "#tab-input");

  // --- 配置編集タブの詳細 ---
  await prepare(page);
  await page.evaluate(() => { runFromButton(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => switchTab("edit"));
  await page.evaluate(() => {
    clearSel();
    [...document.querySelectorAll("#zone-near .cell[data-lot='1']")].slice(0, 2).forEach(toggleCell);
    const stash = stashSpaces(lastSp)[0];
    if (stash) applyMove(stash.name, 0);
  });
  await page.waitForTimeout(250);
  await capture(page, "edit-stash.png", "#editCard");

  await page.evaluate(() => {
    setBlockedEditMode(true);
    const empty = [...document.querySelectorAll("#zone-near .cell:not([data-lot])")].slice(0, 4);
    empty.forEach(toggleBlockedCell);
  });
  await page.waitForTimeout(250);
  await capture(page, "edit-blocked.png", "#editCard");

  // --- 設定タブ ---
  await prepare(page);
  await page.evaluate(() => { switchTab("settings"); switchCfgTab("master"); });
  await page.waitForTimeout(200);
  await capture(page, "settings-master.png", "#cfgpane-master .card");
  await page.evaluate(() => switchCfgTab("spaces"));
  await page.waitForTimeout(200);
  await capture(page, "settings-spaces.png", "#cfgpane-spaces .card");
  await page.evaluate(() => switchCfgTab("display"));
  await page.waitForTimeout(200);
  await capture(page, "settings-display.png", "#cfgpane-display .card");

  await context.close();
  await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
