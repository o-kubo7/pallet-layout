# 品目マスタエクスポートと伝票視認性改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定タブの品名/SNPリストをJSONでバックアップできるようにし、入力タブのFAX伝票・仮伝票・伝票内アクションの視認性を上げる。

**Architecture:** 既存の単一HTMLアプリ構成を維持し、`files/index.html` にCSS、ボタンのクラス、品目マスタJSON生成/ダウンロード関数を追加する。Service Workerのキャッシュ更新要件に従い、`files/sw.js` の `CACHE_VERSION` も上げる。

**Tech Stack:** 静的HTML/CSS/JavaScript、localStorage、Blob、URL.createObjectURL、`<a download>`、Service Worker、Node.js `node:test`

**Spec:** この会話で確定した仕様（2026-09-10〜2026-09-11）。対象モック: `/Users/kenichihanada/.codex/visualizations/2026/09/09/01a0886a-cac2-7dc3-9258-9b3ce77d0827/slip-mock-v2.html`

## Global Constraints

- 常に日本語で応答する。
- 既存の単一ファイル構成を維持し、`files/index.html` を不必要に分割しない。
- JSONバックアップ対象は、設定タブの品目マスタ（品名とSNPのリスト）だけに限定する。伝票、配置結果、スペース設定、表示設定は含めない。
- 仮伝票追加ボタン、仮伝票カード、`FAX受領済みにする` ボタンはオレンジ基調にする。
- FAX伝票追加ボタン、FAX伝票カード、`＋ 品目を追加` ボタンは既存の青基調に合わせる。
- 削除ボタンと入力不備の赤系スタイルは、現在の意味を維持し、オレンジと混同させない。
- 入力不備の `.err` と `.slip-head.err-slip` は、FAX/仮伝票の色分けより優先して赤く表示されること。
- PWA更新配信のため、`files/index.html` を変えたら `files/sw.js` の `CACHE_VERSION` を必ず上げる。
- ブラウザAPI制約: `Blob`、`URL.createObjectURL`、`HTMLAnchorElement.download` を使う。生成したJSONのローカル保存だけに使い、外部送信はしない。
- 印刷用の配置表には触れない。今回の色分けは入力タブの画面表示だけを対象にする。
- 既存の未コミット変更はユーザー作業として扱い、関係ないファイルは戻さない。

---

## File Structure

- Modify: `files/index.html`
  - CSS: 伝票追加ボタン、伝票カード、伝票内アクション、品目マスタエクスポートボタンの見た目。
  - HTML: 仮伝票追加ボタンに専用クラスを追加し、品目マスタの行アクションにJSONバックアップボタンを追加。
  - JavaScript: `masterExportData()` と `exportMasterJson()` を追加し、現在の `MASTER` をJSON化してダウンロードする。
- Modify: `files/README.md`
  - データ保存の説明に、品目マスタだけをJSONで保存できることを追記する。
- Modify: `files/sw.js`
  - `CACHE_VERSION` を `v37` から `v38` に上げる。
- Modify: `tests/sheet-placement.test.js`
  - 既存の `node:test` に、品目マスタエクスポートのデータ形状とUIフックを検証するテストを追加する。

---

### Task 1: 品目マスタJSONバックアップ

**Files:**
- Modify: `files/index.html:696-708`
- Modify: `files/index.html:1160-1208`
- Modify: `files/README.md:82-90`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: 既存の `MASTER` 配列、`readMaster()`、`esc()`。
- Produces: `masterExportData(nowIso?: string): {version:number, exportedAt:string, items:Array<{name:string,snp:number}>}` と `exportMasterJson(): void`。

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/sheet-placement.test.js`:

```js
test("品目マスタJSONバックアップは品名とSNPだけを含む", () => {
  const exportData = new Function(
    "MASTER",
    functionSource("masterExportData") + "; return masterExportData;"
  );
  const data = exportData([
    { name: "カップ麺A", snp: 24, extra: "ignored" },
    { name: "ゼリーC", snp: 30 },
  ])("2026-09-11T00:00:00.000Z");
  assert.deepEqual(data, {
    version: 1,
    exportedAt: "2026-09-11T00:00:00.000Z",
    items: [
      { name: "カップ麺A", snp: 24 },
      { name: "ゼリーC", snp: 30 },
    ],
  });
});

test("品目マスタにJSONバックアップボタンがある", () => {
  assert.match(source, /onclick="exportMasterJson\(\)"/);
  assert.match(source, />品目マスタをJSON保存</);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/sheet-placement.test.js`

Expected: FAIL because `masterExportData` and `exportMasterJson()` do not exist yet.

- [ ] **Step 3: Add the export button**

In the `#cfgpane-master` `.row-actions` block, change it to include a JSON save button:

```html
<div class="row-actions">
  <button class="btn btn-ghost" onclick="addMasterRow();onMasterChange()">＋ 品目を追加</button>
  <button class="btn btn-ghost" onclick="loadMaster()">サンプル品目を読込</button>
  <button class="btn btn-ghost" onclick="exportMasterJson()">品目マスタをJSON保存</button>
</div>
```

- [ ] **Step 4: Add the export functions**

Place these functions after `readMaster()` and before `snpsOf(name)`:

```js
function masterExportData(nowIso){
  return {
    version:1,
    exportedAt:nowIso || new Date().toISOString(),
    items:MASTER.map(m=>({name:String(m.name||""),snp:Number(m.snp)||0}))
      .filter(m=>m.name && m.snp>0),
  };
}
function exportMasterJson(){
  onMasterChange();
  const data=masterExportData();
  const json=JSON.stringify(data,null,2);
  const blob=new Blob([json],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const date=(headDate||defaultHeadDate()).replace(/-/g,"");
  const a=document.createElement("a");
  a.href=url;
  a.download=`pallet-master-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test tests/sheet-placement.test.js`

Expected: PASS.

- [ ] **Step 6: Update README**

In `files/README.md`, under `## データの保存について`, add this bullet after the saved-data bullet list:

```markdown
設定タブの「品目マスタをJSON保存」から、品名とSNPのリストだけをJSONファイルとして保存できます。
伝票入力、配置結果、スペース設定、表示設定はこのJSONには含まれません。
```

- [ ] **Step 7: Commit this task**

```bash
git add files/index.html files/README.md tests/sheet-placement.test.js
git commit -m "feat: export item master backup"
```

---

### Task 2: 伝票カードと伝票内ボタンの視認性改善

**Files:**
- Modify: `files/index.html:48-52`
- Modify: `files/index.html:333-341`
- Modify: `files/index.html:555-556`
- Modify: `files/index.html:1258-1260`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: 既存の `.btn`, `.btn-slip-add`, `.btn-ghost`, `.slip`, `.slip-head`, `.slip-actions`, `data-status="provisional"`。
- Produces: CSS hooks `.btn-slip-add-provisional`, `.btn-slip-action-add`, `.btn-slip-action-receive` and enhanced selectors `.slip[data-status="fax"]`, `.slip[data-status="provisional"]`。

- [ ] **Step 1: Write the failing tests**

Append these tests to `tests/sheet-placement.test.js`:

```js
test("仮伝票追加と伝票内アクションに視認性用クラスがある", () => {
  assert.match(source, /class="btn btn-slip-add btn-slip-add-provisional"/);
  assert.match(source, /class="btn btn-ghost btn-slip-action-add"/);
  assert.match(source, /class="btn btn-ghost btn-slip-action-receive"/);
});

test("FAX伝票と仮伝票のカード色分けCSSがある", () => {
  assert.match(source, /\.slip\[data-status="fax"\]/);
  assert.match(source, /\.slip\[data-status="provisional"\]/);
  assert.match(source, /\.slip\[data-status="provisional"\] \.slip-head/);
  assert.match(source, /\.slip \.slip-head\.err-slip/);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/sheet-placement.test.js`

Expected: FAIL because the new CSS hooks are not present yet.

- [ ] **Step 3: Update global/add button CSS**

Near the existing button CSS, replace the single `.btn-slip-add` line with:

```css
  .btn-slip-add{background:#eff6ff;color:#1d4ed8;border:2px solid #2563eb;padding:9px 14px}
  .btn-slip-add-provisional{background:#fff7ed;color:#9a3412;border-color:#f97316}
```

- [ ] **Step 4: Update slip/card CSS**

Replace the existing slip block with:

```css
  .slip{border:2px solid #cbd5e1;border-radius:10px;background:#fff;margin-bottom:14px;overflow:hidden;min-width:0}
  .slip[data-status="fax"]{border-color:#2563eb;background:#eff6ff}
  .slip[data-status="provisional"]{border-color:#f97316;background:#fff7ed}
  .slip-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc;border-bottom:2px solid #cbd5e1}
  .slip[data-status="fax"] .slip-head{background:#eff6ff;border-bottom-color:#2563eb;color:#1d4ed8}
  .slip[data-status="provisional"] .slip-head{background:#ffedd5;border-bottom-color:#f97316;color:#9a3412}
  .slip-head .item-count{font-size:12px;color:var(--muted)}
  .slip[data-status="provisional"] .slip-head .item-count{color:#9a3412}
  .slip-head .unreceived{font-size:11px;background:#f97316;color:#fff;border-radius:99px;padding:2px 8px;font-weight:700}
```

Then replace the existing error header rule with a selector that beats the status-specific header selectors:

```css
  .slip .slip-head.err-slip{background:#fef2f2;color:#b91c1c;border-bottom-color:#fecaca}
```

- [ ] **Step 5: Update slip action CSS**

After `.slip-actions`, add:

```css
  .btn-slip-action-add{background:#eff6ff;color:#1d4ed8;border:2px solid #2563eb}
  .btn-slip-action-receive{background:#f97316;color:#fff;border:2px solid #f97316}
```

- [ ] **Step 6: Update input add buttons**

Change the input tab buttons to:

```html
<button class="btn btn-slip-add" onclick="addSlip('fax')">＋ FAX伝票を追加</button>
<button class="btn btn-slip-add btn-slip-add-provisional" onclick="addSlip('provisional')">＋ 仮伝票を追加</button>
```

- [ ] **Step 7: Update renderSlips action buttons**

Change the generated action buttons inside `renderSlips()` to:

```js
<button class="btn btn-ghost btn-slip-action-add" onclick="addItemRow(this)">＋ 品目を追加</button>
${provisional?'<button class="btn btn-ghost btn-slip-action-receive" data-receive onclick="receiveSlip(this)">FAX受領済みにする</button>':""}
```

- [ ] **Step 8: Run tests to verify pass**

Run: `node --test tests/sheet-placement.test.js`

Expected: PASS.

- [ ] **Step 9: Commit this task**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "style: highlight provisional slips"
```

---

### Task 3: PWAキャッシュ更新と手動確認

**Files:**
- Modify: `files/sw.js:6`
- Verify: `files/index.html`
- Verify: `files/README.md`

**Interfaces:**
- Consumes: `files/sw.js` `CACHE_VERSION = "v37"`。
- Produces: `CACHE_VERSION = "v38"` so installed PWA clients receive the edited `index.html`.

- [ ] **Step 1: Update Service Worker cache version**

Change:

```js
const CACHE_VERSION = "v37";
```

to:

```js
const CACHE_VERSION = "v38";
```

- [ ] **Step 2: Run all automated tests**

Run: `node --test tests/sheet-placement.test.js`

Expected: PASS.

- [ ] **Step 3: Start local preview**

Run: `python3 -m http.server 8765 --directory files`

Expected: server starts at `http://localhost:8765`.

- [ ] **Step 4: Manual browser verification**

Open `http://localhost:8765?cachebust=20260911-master-export-slip-visuals`.

Verify:
- `＋ 仮伝票を追加` is orange-based.
- `＋ FAX伝票を追加` remains blue-based.
- FAX slip cards have a clear blue border and blue header treatment.
- Provisional slip cards have orange border/background/header treatment and retain the `FAX未着` badge.
- `＋ 品目を追加` is no longer visually flat; it matches the blue add-action family.
- `FAX受領済みにする` is orange and prominent inside provisional slips.
- `伝票を削除` remains red and is not visually confused with receive/action buttons.
- Mobile width around 390px keeps all buttons wrapped without text overlap.
- Settings > 品目マスタ has `品目マスタをJSON保存`.
- Clicking `品目マスタをJSON保存` downloads a `.json` file whose `items` array contains only `{name,snp}` objects.
- `files/README.md` documents that the JSON backup contains only 品名/SNP and does not include slips or layout settings.

- [ ] **Step 5: Stop local preview**

Stop the `python3 -m http.server` process with Ctrl-C.

- [ ] **Step 6: Check git diff**

Run: `git diff -- files/index.html files/sw.js tests/sheet-placement.test.js`

Expected: Only the export, slip visual styling, cache version, and tests changed.

- [ ] **Step 7: Commit this task**

```bash
git add files/index.html files/sw.js tests/sheet-placement.test.js
git commit -m "chore: refresh app cache for slip visuals"
```

---

## Completion Criteria

- `node --test tests/sheet-placement.test.js` passes.
- Local preview shows the approved visual direction from the latest mock.
- 品目マスタJSON contains only `version`, `exportedAt`, and `items:[{name,snp}]`.
- No network request or external upload is introduced.
- `files/sw.js` cache version is incremented.
- Existing unrelated changes remain untouched.

## E2E Command For User Before Merge

This project has no Playwright or npm E2E setup. Before merge, run this local preview command and manually verify the checklist in Task 3:

```bash
python3 -m http.server 8765 --directory files
```
