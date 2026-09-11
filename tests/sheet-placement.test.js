const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

test("PC横・EV横ではEV横を右端に配置する", () => {
  const placement = new Function(
    "sheetSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const main = { lot: { id: 1 }, areas: ["メイン"] };
  const pc = { lot: { id: 2 }, areas: ["PC横"] };
  const ev = { lot: { id: 3 }, areas: ["EV横"] };
  const computeSheetPlacement = placement(
    tier => tier === "top" ? [] : [main, pc, ev],
    () => ({ top: 4, bottom: 7 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : []
  );
  const result = computeSheetPlacement();
  assert.deepEqual(
    result.bottom.map(entry => entry && entry.lot.id),
    [1, null, null, null, null, 2, 3]
  );
});

test("配置表からあふれた先頭2項目をあふれブロックへ記載する", () => {
  const placement = new Function(
    "sheetSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const top = Array.from({ length: 7 }, (_, index) => ({ lot: { id: index + 1 }, areas: ["軒下①"] }));
  const bottom = Array.from({ length: 8 }, (_, index) => ({ lot: { id: index + 101 }, areas: ["メイン"] }));
  const computeSheetPlacement = placement(
    tier => tier === "top" ? top : bottom,
    () => ({ top: 5, bottom: 8 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : []
  );
  const result = computeSheetPlacement();
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), [6, 7]);
  assert.deepEqual(result.unlisted, []);
});

test("3項目以上のあふれでは3項目目以降を警告対象にする", () => {
  const placement = new Function(
    "sheetSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const top = Array.from({ length: 8 }, (_, index) => ({ lot: { id: index + 1 }, areas: ["軒下①"] }));
  const bottom = Array.from({ length: 8 }, (_, index) => ({ lot: { id: index + 101 }, areas: ["メイン"] }));
  const computeSheetPlacement = placement(
    tier => tier === "top" ? top : bottom,
    () => ({ top: 5, bottom: 8 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : []
  );
  const result = computeSheetPlacement();
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), [6, 7]);
  assert.deepEqual(result.unlisted.map(entry => entry.lot.id), [8]);
});

test("あふれブロックの2項目の間に6pxの隙間を入れる", () => {
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  );
  const html = renderOverflow(
    value => String(value),
    () => "6P",
    () => "※軒下①"
  )([
    { lot: { name: "品目1", lot: "L-1" }, areas: ["軒下①"] },
    { lot: { name: "品目2", lot: "L-2" }, areas: ["軒下①"] },
  ]);
  assert.match(html, /class="overflow-gap"/);
});

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

test("品目マスタJSON読込は品名とSNPだけを受け入れる", () => {
  const parseImport = new Function(
    functionSource("parseMasterImportData") + "; return parseMasterImportData;"
  )();
  const items = parseImport(JSON.stringify({
    version: 1,
    exportedAt: "2026-09-11T00:00:00.000Z",
    items: [
      { name: "カップ麺A", snp: 24 },
      { name: "  ゼリーC  ", snp: 30 },
    ],
  }));
  assert.deepEqual(items, [
    { name: "カップ麺A", snp: 24 },
    { name: "ゼリーC", snp: 30 },
  ]);
});

test("品目マスタJSON読込は不正なJSONを拒否する", () => {
  const parseImport = new Function(
    functionSource("parseMasterImportData") + "; return parseMasterImportData;"
  )();
  assert.throws(
    () => parseImport(JSON.stringify({ version: 1, items: [] })),
    /品目マスタが空です/
  );
  assert.throws(
    () => parseImport(JSON.stringify({ version: 2, items: [{ name: "A", snp: 1 }] })),
    /対応していない品目マスタJSON/
  );
  assert.throws(
    () => parseImport(JSON.stringify({ version: 1, items: [{ name: "", snp: 1 }] })),
    /品目データが不正/
  );
  assert.throws(
    () => parseImport(JSON.stringify({ version: 1, items: [{ name: "A", snp: "1" }] })),
    /品目データが不正/
  );
  assert.throws(
    () => parseImport(JSON.stringify({ version: 1, items: [{ name: "A", snp: 1.5 }] })),
    /品目データが不正/
  );
});

test("品目マスタにJSON読込ボタンとファイル入力がある", () => {
  assert.match(source, /onclick="chooseMasterJson\(\)"/);
  assert.match(source, />品目マスタをJSON読込</);
  assert.match(source, /id="masterImportFile"[^>]*type="file"[^>]*accept="\.json,application\/json"/);
  assert.match(source, /onchange="importMasterJson\(this\)"/);
});

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

test("エラー伝票ヘッダー内の件数表示は赤で明示上書きする", () => {
  assert.match(
    source,
    /\.slip \.slip-head\.err-slip \.item-count\s*\{[^}]*color:#b91c1c[^}]*\}/
  );
});

test("伝票カードはモック同様に白い本体へ部分的な濃淡を付ける", () => {
  const faxRule = source.match(/\.slip\[data-status="fax"\]\s*\{([^}]*)\}/);
  assert.ok(faxRule, "FAX伝票カードの状態別ルールが必要");
  assert.match(faxRule[1], /border-color:#2563eb/);
  assert.doesNotMatch(faxRule[1], /background\s*:/);
  assert.match(source, /\.slip\[data-status="fax"\] \.slip-head\s*\{[^}]*background:#eff6ff[^}]*border-bottom-color:#2563eb[^}]*color:#1d4ed8[^}]*\}/);
  assert.match(source, /\.slip\[data-status="fax"\] \.slip-table th\s*\{[^}]*background:#f8fafc[^}]*color:#475569[^}]*\}/);
  assert.match(source, /\.slip\[data-status="fax"\] \.pallet-cell\s*\{[^}]*background:#f1f5f9[^}]*\}/);
  assert.match(source, /\.slip\[data-status="fax"\] \.slip-actions\s*\{[^}]*background:#fff(?:;|})[^}]*border-top:2px solid #dbeafe[^}]*\}/);
});

test("仮伝票カードはFAXと同じ濃淡構造をオレンジ系にする", () => {
  const provisionalRule = source.match(/\.slip\[data-status="provisional"\]\s*\{([^}]*)\}/);
  assert.ok(provisionalRule, "仮伝票カードの状態別ルールが必要");
  assert.match(provisionalRule[1], /border-color:#f97316/);
  assert.doesNotMatch(provisionalRule[1], /background\s*:/);
  assert.match(source, /\.slip\[data-status="provisional"\] \.slip-head\s*\{[^}]*background:#ffedd5[^}]*border-bottom-color:#f97316[^}]*color:#9a3412[^}]*\}/);
  assert.match(source, /\.slip\[data-status="provisional"\] \.slip-table th\s*\{[^}]*background:#fff3df[^}]*border-color:#fed7aa[^}]*color:#9a3412[^}]*\}/);
  assert.match(source, /\.slip\[data-status="provisional"\] \.pallet-cell\s*\{[^}]*background:#ffe9c4[^}]*color:#9a3412[^}]*\}/);
  assert.match(source, /\.slip\[data-status="provisional"\] \.slip-actions\s*\{[^}]*background:#fff(?:;|})[^}]*border-top-color:#fed7aa[^}]*\}/);
});
