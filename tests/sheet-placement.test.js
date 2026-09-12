const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

test("Service Workerは版付きキャッシュ名を使う", () => {
  const sw = fs.readFileSync("files/sw.js", "utf8");
  assert.match(sw, /const CACHE_VERSION = "v\d+"/);
  assert.match(sw, /const CACHE_NAME = "pallet-layout-" \+ CACHE_VERSION/);
  assert.match(sw, /const CACHE_VERSION = "v42"/);
});

test("配置編集には配置不可編集と再配置の操作がある", () => {
  assert.match(source, /id="blockedEditBtn"/);
  assert.match(source, /onclick="setBlockedEditMode\(true\)"/);
  assert.match(source, /id="blockedRunBtn"/);
  assert.match(source, /onclick="runFromBlockedEdit\(\)"/);
});

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

test("旧形式の時間帯データは配置不可セルなしとして読み込む", () => {
  const normalizeShift = new Function(
    "normalizeSlip", "normalizeSnapshot", "normalizeBlocked",
    functionSource("normalizeShift") + "; return normalizeShift;"
  )(
    value => value,
    value => value,
    () => []
  );
  const shift = normalizeShift({ slips: [], result: null, manual: null });
  assert.deepEqual(shift.blocked, []);
});

test("配置不可セルは重複を除き正規化する", () => {
  const normalizeBlocked = new Function(
    functionSource("normalizeBlocked") + "; return normalizeBlocked;"
  )();
  assert.deepEqual(
    normalizeBlocked(["メイン|1|2", "メイン|1|2", "PC横|0|0"]),
    ["メイン|1|2", "PC横|0|0"]
  );
});

test("セルキーはエリア名・列・行をパイプで連結する", () => {
  const blockedCellKey = new Function(
    functionSource("blockedCellKey") + "; return blockedCellKey;"
  )();
  assert.equal(blockedCellKey("メイン", 1, 2), "メイン|1|2");
});

test("配置不可行は指定されたエリアと列だけから抽出する", () => {
  const blockedRowsFor = new Function(
    functionSource("blockedCellKey") +
    functionSource("blockedRowsFor") + "; return blockedRowsFor;"
  )();
  assert.deepEqual(
    [...blockedRowsFor("メイン", 1, ["メイン|1|2", "メイン|1|0", "PC横|1|3", "メイン|0|4"])],
    [2, 0]
  );
});

test("配置表のメイン配置不可セルには斜線用クラスを出力する", () => {
  const gridRows = new Function(
    "lastSp", "sheetAreas", "gridWarn", "SHEET_GRID_ORDER", "overflowTable", "lastLots", "tailAreaOf",
    functionSource("gridRows") + "; return gridRows;"
  )(
    [{ name: "メイン", cols: [{ h: 1, fills: [], blockedRows: new Set([0]) }] }],
    () => ["メイン"],
    () => null,
    [{ c: 0 }],
    () => "",
    [],
    () => null
  );
  assert.match(gridRows(0, []).html, /<td class="g blocked">/);
});

test("配置表の配置不可セルは印刷用の斜線スタイルを持つ", () => {
  assert.match(
    source,
    /\.sheet td\.g\.blocked\{[^}]*repeating-linear-gradient[^}]*print-color-adjust:exact/s
  );
});

test("存在しない列または行の配置不可指定を除去する", () => {
  const pruneBlockedForSpaces = new Function(
    functionSource("normalizeBlocked") +
    functionSource("pruneBlockedForSpaces") + "; return pruneBlockedForSpaces;"
  )();
  const spaces = [{ name: "メイン", cols: [{ h: 2 }] }];
  assert.deepEqual(
    pruneBlockedForSpaces(["メイン|0|1", "メイン|0|2", "不存在|0|0"], spaces),
    ["メイン|0|1"]
  );
});

test("列途中の配置不可セルを飛ばしてロットを描画する", () => {
  const cellsOf = new Function(
    functionSource("cellsOf") + "; return cellsOf;"
  )();
  const cells = cellsOf({ h: 4, fills: [{ id: 7, count: 3 }] }, new Set([1]));
  assert.deepEqual(cells.map(cell => [cell.row, cell.id, cell.blocked]), [
    [0, 7, false], [1, null, true], [2, 7, false], [3, 7, false],
  ]);
});

test("配置不可セルは連続配置の容量に数えない", () => {
  const findRun = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("findRun") + "; return findRun;"
  )();
  const cols = [{ h: 3, fills: [], blockedRows: new Set([1]) }];
  assert.equal(findRun(cols, 3, false), null);
});

test("自動配置は配置不可セルを飛ばして容量まで追加する", () => {
  const placeLot = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("findRun") +
    functionSource("placeLot") + "; return placeLot;"
  )();
  const col = { h: 4, fills: [], blockedRows: new Set([1]) };
  const lot = { id: 7, pallets: 3 };
  assert.equal(placeLot(lot, [{ cols: [col], useAisle: false }]), 0);
  assert.deepEqual(col.fills, [{ id: 7, count: 3, ov: undefined }]);
});

test("手動移動先の配置不可セルを空き容量に含めない", () => {
  const columnFreeCount = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") + "; return columnFreeCount;"
  )();
  const col = { h: 4, fills: [{ id: 1, count: 1 }], blockedRows: new Set([2, 3]) };
  assert.equal(columnFreeCount(col, col.blockedRows), 1);
});

test("手動移動は配置不可セルを飛ばして描画される", () => {
  const moveCells = new Function(
    functionSource("normalizeFills") +
    functionSource("moveCells") + "; return moveCells;"
  )();
  const cellsOf = new Function(
    functionSource("cellsOf") + "; return cellsOf;"
  )();
  const next = [
    { name: "移動元", cols: [{ h: 2, fills: [{ id: 1, count: 1 }] }] },
    { name: "移動先", cols: [{ h: 3, fills: [], blockedRows: new Set([1]) }] },
  ];
  assert.equal(moveCells(next, 1, { "移動元|0": 1 }, "移動先", 0), 1);
  assert.deepEqual(
    cellsOf(next[1].cols[0]).map(cell => [cell.row, cell.id, cell.blocked]),
    [[0, 1, false], [1, null, true], [2, null, false]]
  );
});

test("手動移動は配置不可セルで減った容量を超えると拒否する", () => {
  const validateMove = new Function(
    "used", "columnFreeCount", "movingCount", "blockCountOf", "clone", "moveCells",
    functionSource("validateMove") + "; return validateMove;"
  )(
    col => col.fills.reduce((sum, fill) => sum + fill.count, 0),
    col => col.h - col.fills.reduce((sum, fill) => sum + fill.count, 0) - col.blockedRows.size,
    () => 2,
    () => 0,
    value => value,
    () => { throw new Error("容量不足では移動してはいけません"); }
  );
  const sp = [{ name: "移動先", cols: [{ h: 4, fills: [{ id: 1, count: 1 }], blockedRows: new Set([2, 3]) }] }];
  assert.deepEqual(
    validateMove(sp, 1, { "移動元|0": 2 }, "移動先", 0),
    { ok: false, reason: "移動先の空きが足りません" }
  );
});

test("分割配置は全セル配置不可の通常列と通路列に空fillを追加しない", () => {
  const placeLot = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("findRun") +
    functionSource("placeLot") + "; return placeLot;"
  )();
  const blockedNormal = { h: 2, fills: [], blockedRows: new Set([0, 1]) };
  const blockedAisle = { h: 2, aisle: true, fills: [], blockedRows: new Set([0, 1]) };
  const available = { h: 2, fills: [], blockedRows: new Set() };
  const lot = { id: 9, pallets: 3 };
  assert.equal(placeLot(lot, [{ cols: [blockedNormal, blockedAisle, available], useAisle: true }]), 1);
  assert.deepEqual(blockedNormal.fills, []);
  assert.deepEqual(blockedAisle.fills, []);
  assert.deepEqual(available.fills, [{ id: 9, count: 2, ov: undefined }]);
});

test("保存用snapshotは派生した配置不可行を含まない", () => {
  const snapshotSpaces = new Function(
    functionSource("clone") +
    functionSource("snapshotSpaces") + "; return snapshotSpaces;"
  )();
  const sp = [{ name: "メイン", cols: [{ h: 3, fills: [{ id: 1, count: 1 }], blockedRows: new Set([1]) }] }];
  assert.deepEqual(snapshotSpaces(sp), [
    { name: "メイン", cols: [{ h: 3, fills: [{ id: 1, count: 1 }] }] },
  ]);
  assert.deepEqual([...sp[0].cols[0].blockedRows], [1]);
});

test("配置不可で有効容量を超えたsnapshotは復元候補にしない", () => {
  const activePlacementSnapshot = new Function(
    "schedule", "inputFingerprint", "activeShift",
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("blockedCellKey") +
    functionSource("blockedRowsFor") +
    functionSource("snapshotFitsBlocked") +
    functionSource("activePlacementSnapshot") + "; return activePlacementSnapshot;"
  )(
    {},
    () => "fp",
    () => ({
      blocked: ["メイン|0|1"],
      manual: null,
      result: { fp: "fp", lots: [], sp: [{ name: "メイン", cols: [{ h: 3, fills: [{ id: 1, count: 3 }] }] }] },
    })
  );
  assert.equal(activePlacementSnapshot(), null);
});

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
