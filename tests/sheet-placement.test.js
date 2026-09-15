const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

test("入力ヘッダーでは日付の直後に時間帯切替を表示する", () => {
  const inputStart = source.indexOf('<div id="tab-input"');
  const inputEnd = source.indexOf('<!-- ===== 配置編集タブ', inputStart);
  assert.notEqual(inputStart, -1);
  assert.notEqual(inputEnd, -1);
  const inputTab = source.slice(inputStart, inputEnd);

  assert.match(
    inputTab,
    /id="dowHint"><\/span><div class="timing-switch" data-timing-switch><\/div>/
  );
});

test("PCの伝票では種別・SNP・個数・パレット数を各100pxにする", () => {
  assert.match(
    source,
    /\.slip-table \.c-type\{width:100px\}\.slip-table \.c-snp,\.slip-table \.c-qty,\.slip-table \.c-pal\{width:100px\}/
  );
});

test("入力タブの主要コンテナは1000px以下で中央寄せする", () => {
  assert.match(source, /#tab-input\{max-width:1000px;margin:0 auto\}/);
});

test("メインタブは16pxで、区切り線とhover表示を持つ", () => {
  assert.match(source, /\.tab\{[^}]*font-size:16px/);
  assert.match(source, /\.tab:not\(:last-child\)::before\{[^}]*width:1px[^}]*background:var\(--line\)/);
  assert.match(source, /\.tab:hover\{[^}]*background:#eff6ff[^}]*color:#1d4ed8/);
});

test("入力画面に登録品目数と保存状態の表示を置かない", () => {
  assert.doesNotMatch(source, /id="regInfo"/);
  assert.doesNotMatch(source, /id="saveStatus"/);
  const updateRegCount = functionSource("updateRegCount");
  assert.match(updateRegCount, /if\(!info\)return;/);
});

test("配置表は時間帯切替の右に112px幅の印刷ボタンを置く", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  assert.notEqual(sheetStart, -1);
  assert.notEqual(sheetEnd, -1);
  const sheetTab = source.slice(sheetStart, sheetEnd);
  assert.match(sheetTab, /<div class="sheet-toolbar">[\s\S]*?data-timing-switch[\s\S]*?class="btn btn-ghost sheet-print"/);
  assert.doesNotMatch(sheetTab, /<h2>配置表/);
  assert.match(source, /\.sheet-print\{width:112px;margin-left:auto\}/);
  assert.match(source, /id="tabbtn-sheet"[^>]*>配置図</);
});

test("入力画面の操作と伝票本文は14px、ヘッダーは16pxで表示する", () => {
  assert.match(source, /\.btn-mini\{[^}]*font-size:14px/);
  assert.match(source, /\.sizebtn\{[^}]*font-size:14px/);
  assert.match(source, /\.input-head \.date-field\{flex-wrap:nowrap\}/);
  assert.match(source, /\.input-head \.date-field label,\.input-head #dowHint,\.input-head \.slip-count\{font-size:16px/);
  assert.match(source, /\.slip-head\{[^}]*font-size:16px/);
  assert.match(source, /\.slip-table th,\.slip-table td input,\.slip-table td select,\.slip-table \.pallet-cell\{font-size:14px/);
});

test("Service Workerは版付きキャッシュ名を使う", () => {
  const sw = fs.readFileSync("files/sw.js", "utf8");
  assert.match(sw, /const CACHE_VERSION = "v\d+"/);
  assert.match(sw, /const CACHE_NAME = "pallet-layout-" \+ CACHE_VERSION/);
  assert.match(sw, /const CACHE_VERSION = "v50"/);
});

test("配置編集には配置不可編集と再配置の操作がある", () => {
  assert.match(source, /id="blockedEditBtn"/);
  assert.match(source, /onclick="setBlockedEditMode\(true\)"/);
  assert.match(source, /id="blockedRunBtn"/);
  assert.match(source, /onclick="runFromBlockedEdit\(\)"/);
});

test("スマホの選択ガイドはビューポート座標で配置する", () => {
  assert.doesNotMatch(source, /--flagtopm", Math\.round\(ctlRect\.bottom\+window\.scrollY\+8\)/);
  const sync = functionSource("syncFlagTop");
  assert.match(sync, /const top=Math\.round\(tabsBottom\+8\)\+"px"/);
  assert.match(sync, /setProperty\("--flagtopm", top\)/);
});

test("配置不可編集は指先直下のセルをなぞり対象にする", () => {
  const start = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(!blockedEditMode) return;');
  const end = source.indexOf('/* ---------- ロット移動（ドラッグ） ---------- */', start);
  assert.notEqual(start, -1);
  assert.match(source.slice(start, end), /const c=cellAt\(e\.clientX,e\.clientY\)/);
  assert.match(source, /blockedEditPointerId=e\.pointerId/);
  assert.match(source, /setPointerCapture\(e\.pointerId\)/);
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

// gridRows は lastSp / lastLots など外の値を見るので、注入して組み立てる
function makeGridRows(cols, order) {
  return new Function(
    "lastSp", "sheetAreas", "gridWarn", "SHEET_GRID_ORDER", "overflowTable", "lastLots", "tailAreaOf",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("sheetGridAnchors") +
    functionSource("gridRows") + "; return gridRows;"
  )(
    [{ name: "メイン", cols }],
    () => ["メイン"],
    () => null,
    order,
    () => "",
    [],
    () => null
  );
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
    // gridRows は内部で gridShift を呼ぶようになったため、依存元も注入する
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("sheetGridAnchors") + functionSource("gridRows") + "; return gridRows;"
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
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
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
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
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
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
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

test("メインロットはグリッド位置に最も近い下段欄へ置く", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const mainLeft = { lot: { id: 1 }, areas: ["メイン"] };
  const mainRight = { lot: { id: 2 }, areas: ["メイン"] };
  const result = arrange([mainLeft, mainRight], 7, { 1: 1, 2: 9 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    [1, null, null, null, 2, null, null]);
});

test("PC横とEV横はメイン項目に挟まず右端へ連続配置する", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const mainLeft = { lot: { id: 1 }, areas: ["メイン"] };
  const mainRight = { lot: { id: 2 }, areas: ["メイン"] };
  const pc = { lot: { id: 3 }, areas: ["PC横"] };
  const ev = { lot: { id: 4 }, areas: ["EV横"] };
  const result = arrange([mainLeft, pc, mainRight, ev], 7, { 1: 1, 2: 9 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    [1, null, null, null, 2, 3, 4]);
});

test("右端を予約してもメインロットは物理的に最短の下段欄へ置く", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const main = { lot: { id: 1 }, areas: ["メイン"] };
  const pc = { lot: { id: 2 }, areas: ["PC横"] };
  const ev = { lot: { id: 3 }, areas: ["EV横"] };
  const result = arrange([main, pc, ev], 7, { 1: 10 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    [null, null, null, null, 1, 2, 3]);
});

test("sheetPlacementはグリッドセル中心に近い下段欄へメインロットを置く", () => {
  const placement = new Function(
    "sheetSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas", "lastSp", "SHEET_GRID_ORDER",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("sheetGridAnchors") +
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const main = { lot: { id: 1 }, areas: ["メイン"] };
  const computeSheetPlacement = placement(
    tier => tier === "top" ? [] : [main],
    () => ({ top: 4, bottom: 7 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン"] : [],
    [{ name: "メイン", cols: [
      { h: 1, fills: [] }, { h: 1, fills: [] }, { h: 1, fills: [{ id: 1, count: 1 }] },
    ] }],
    [{ c: 0 }, { c: 1 }, { c: 2 }]
  );
  assert.deepEqual(computeSheetPlacement().bottom.map(entry => entry && entry.lot.id),
    [null, 1, null, null, null, null, null]);
});

test("右端予約で欄数が減ってもあふれたメイン項目は入力順を保つ", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const right = { lot: { id: 1 }, areas: ["メイン"] };
  const left = { lot: { id: 2 }, areas: ["メイン"] };
  const middle = { lot: { id: 3 }, areas: ["メイン"] };
  const pc = { lot: { id: 4 }, areas: ["PC横"] };
  const ev = { lot: { id: 5 }, areas: ["EV横"] };
  const result = arrange([right, left, middle, pc, ev], 4, { 1: 9, 2: 1, 3: 5 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id), [2, 1, 4, 5]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), [3]);
});

test("入力順が逆でもメイン項目はグリッドの左から右へ並ぶ", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const right = { lot: { id: 2 }, areas: ["メイン"] };
  const left = { lot: { id: 1 }, areas: ["メイン"] };
  const result = arrange([right, left], 7, { 1: 1, 2: 9 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    [1, null, null, null, 2, null, null]);
});

test("最短の組合せを選びメイン項目の矢印を交差させない", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const left = { lot: { id: 1 }, areas: ["メイン"] };
  const right = { lot: { id: 2 }, areas: ["メイン"] };
  const result = arrange([left, right], 2, { 1: 9, 2: 11 });
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id), [1, 2]);
});

test("グリッド座標がない場合はメイン項目を左から順に置く", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const first = { lot: { id: 1 }, areas: ["メイン"] };
  const second = { lot: { id: 2 }, areas: ["メイン"] };
  const result = arrange([first, second], 7, null);
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    [1, 2, null, null, null, null, null]);
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

test("作業用の列に緊急用マスと上方向の飛び出しを引き継ぐ", () => {
  const buildWork = new Function(
    "SPACES", "blockedRowsFor",
    functionSource("buildWork") + "; return buildWork;"
  )(
    [{ name: "メイン", zone: "near", orient: "v", block: 3, align: "top",
       cols: [{ h: 9, up: 1, aisleRows: [8] }, { h: 8, aisleRows: [7] }] }],
    () => new Set()
  );
  const work = buildWork([]);
  assert.deepEqual(work[0].cols[0].aisleRows, [8]);
  assert.equal(work[0].cols[0].up, 1);
  assert.deepEqual(work[0].cols[1].aisleRows, [7]);
  assert.equal(work[0].cols[1].up, undefined);
});

test("自動配置は緊急用の通路マスを空きに数えない", () => {
  const autoFreeCount = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") + "; return autoFreeCount;"
  )();
  assert.equal(autoFreeCount({ h: 8, fills: [], aisleRows: [7] }), 7);
});

test("手動移動は緊急用の通路マスを空きに数える", () => {
  const columnFreeCount = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") + "; return columnFreeCount;"
  )();
  assert.equal(columnFreeCount({ h: 8, fills: [], aisleRows: [7] }), 8);
});

test("緊急用の通路マスは列の高さの外を指していたら数えない", () => {
  const aisleRowCount = new Function(
    functionSource("aisleRowCount") + "; return aisleRowCount;"
  )();
  assert.equal(aisleRowCount({ h: 3, aisleRows: [2, 9, -1] }), 1);
  assert.equal(aisleRowCount({ h: 3 }), 0);
});

test("配置不可と重なった緊急用マスは二重に引かない", () => {
  const autoFreeCount = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") + "; return autoFreeCount;"
  )();
  // 下端が緊急用マスであり、同じ行が配置不可にも塗られている
  const col = { h: 8, fills: [], aisleRows: [7], blockedRows: new Set([7]) };
  assert.equal(autoFreeCount(col, col.blockedRows), 7);
});

test("連続配置の窓は緊急用の通路マスを含めない", () => {
  const findRun = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
    functionSource("findRun") + "; return findRun;"
  )();
  const cols = [{ h: 8, fills: [], aisleRows: [7] }];
  assert.equal(findRun(cols, 8, false), null);
  assert.deepEqual(findRun(cols, 7, false), [0, 0]);
});

test("自動配置は緊急用の通路マスの手前で止まる", () => {
  const placeLot = new Function(
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
    functionSource("findRun") +
    functionSource("placeLot") + "; return placeLot;"
  )();
  const col = { h: 8, fills: [], aisleRows: [7] };
  const lot = { id: 3, pallets: 8 };
  assert.equal(placeLot(lot, [{ cols: [col], useAisle: false }]), 1);
  assert.deepEqual(col.fills, [{ id: 3, count: 7, ov: undefined }]);
});

test("緊急用の通路マスには印を付け、荷物は飛ばさずに入れる", () => {
  const cellsOf = new Function(
    functionSource("cellsOf") + "; return cellsOf;"
  )();
  const cells = cellsOf({ h: 3, fills: [{ id: 5, count: 3 }], aisleRows: [2] });
  assert.deepEqual(cells.map(cell => [cell.row, cell.id, cell.aisleRow]), [
    [0, 5, false], [1, 5, false], [2, 5, true],
  ]);
});

test("緊急用の通路マスは配置不可セルと違う見た目にする", () => {
  assert.match(source, /\.cell\.aisle-cell\{background:#e5e7eb/);
  assert.match(source, /\.cell\.aisle-cell\[data-lot\]\{box-shadow:inset 0 0 0 2px #9ca3af/);
});

test("盤のマスは緊急用の通路マスにクラスを付ける", () => {
  assert.match(source, /if\(a\.aisleRow\)cls\.push\("aisle-cell"\)/);
});

test("緊急用マスがある列の列キャップにも通の印を付ける", () => {
  assert.match(source, /col\.aisle\|\|aisleRowCount\(col,col\.blockedRows\)\?' 通':''/);
});

test("上に飛び出す列は下げず、飛び出さない列を1マス下げる", () => {
  const colTopOffset = new Function(
    functionSource("colTopOffset") + "; return colTopOffset;"
  )();
  const sp = { cols: [{ h: 9, up: 1 }, { h: 8 }] };
  assert.equal(colTopOffset(sp, sp.cols[0]), 0);
  assert.equal(colTopOffset(sp, sp.cols[1]), 1);
});

test("上に飛び出す列が無いエリアはどの列も下げない", () => {
  const colTopOffset = new Function(
    functionSource("colTopOffset") + "; return colTopOffset;"
  )();
  const sp = { cols: [{ h: 7 }, { h: 7 }] };
  assert.equal(colTopOffset(sp, sp.cols[0]), 0);
  assert.equal(colTopOffset(sp, sp.cols[1]), 0);
});

test("盤は飛び出さない列にマス1つ分のマージンを与える", () => {
  assert.match(source, /margin-top:calc\(\(var\(--cell\) \+ 2px\) \* \$\{topOff\}\)/);
});

test("上に飛び出したマスに荷物がある日は8行になる", () => {
  const gridShift = new Function(
    functionSource("aisleRowCount") +
    functionSource("gridShift") + "; return gridShift;"
  )();
  const sp = { cols: [{ h: 9, up: 1, aisleRows: [8] }, { h: 8, aisleRows: [7] }] };
  const colCells = [
    [{ id: 0 }, { id: 0 }, null, null, null, null, null, null, null],
    [{ id: 1 }, null, null, null, null, null, null, null],
  ];
  const g = gridShift(sp, colCells);
  assert.equal(g.upUsed, true);
  assert.equal(g.rows, 8);
  assert.equal(g.shiftOf(0), 0);
  assert.equal(g.shiftOf(1), 1);
  assert.equal(g.startOf(0), 0);
  assert.equal(g.startOf(1), 0);
});

test("上に飛び出したマスが空の日は7行のまま", () => {
  const gridShift = new Function(
    functionSource("aisleRowCount") +
    functionSource("gridShift") + "; return gridShift;"
  )();
  const sp = { cols: [{ h: 9, up: 1, aisleRows: [8] }, { h: 8, aisleRows: [7] }] };
  const colCells = [
    [null, { id: 0 }, null, null, null, null, null, null, null],
    [{ id: 1 }, null, null, null, null, null, null, null],
  ];
  const g = gridShift(sp, colCells);
  assert.equal(g.upUsed, false);
  assert.equal(g.rows, 7);
  assert.equal(g.shiftOf(0), 0);
  assert.equal(g.startOf(0), 1);   // 飛び出した空きを飛ばして描く
  assert.equal(g.startOf(1), 0);
});

test("上に飛び出す列が無いエリアは今までどおり", () => {
  const gridShift = new Function(
    functionSource("aisleRowCount") +
    functionSource("gridShift") + "; return gridShift;"
  )();
  const sp = { cols: [{ h: 7 }, { h: 7 }] };
  const colCells = [[{ id: 0 }], [{ id: 1 }]];
  const g = gridShift(sp, colCells);
  assert.equal(g.rows, 7);
  assert.equal(g.shiftOf(0), 0);
  assert.equal(g.startOf(0), 0);
});

test("下端の緊急用マスはグリッド本体の行数に入れない", () => {
  const gridShift = new Function(
    functionSource("aisleRowCount") +
    functionSource("gridShift") + "; return gridShift;"
  )();
  const sp = { cols: [{ h: 8, aisleRows: [7] }] };
  const g = gridShift(sp, [[{ id: 0 }]]);
  assert.equal(g.rows, 7);
});

test("上に飛び出したマスに荷物がある日のグリッドは8行", () => {
  const gridRows = makeGridRows([
    { h: 9, up: 1, fills: [{ id: 0, count: 2 }], aisleRows: [8] },
    { h: 8, fills: [{ id: 0, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }, { c: 1 }]);
  const out = gridRows(0, []);
  assert.equal(out.rows, 8);
  // 飛び出さない列の0行目は空セル
  const firstRow = out.html.split("<tr")[1];
  assert.match(firstRow, /<td class="none"><\/td>/);
});

test("上に飛び出したマスが空の日のグリッドは7行", () => {
  const gridRows = makeGridRows([
    { h: 9, up: 1, fills: [], aisleRows: [8] },
    { h: 8, fills: [{ id: 0, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }, { c: 1 }]);
  assert.equal(gridRows(0, []).rows, 7);
});

test("上に飛び出したマスには段番号を振らない", () => {
  const gridRows = makeGridRows([
    { h: 9, up: 1, fills: [{ id: 0, count: 2 }], aisleRows: [8] },
    { h: 8, fills: [{ id: 0, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }, { lab: true }, { c: 1 }]);
  const rows = gridRows(0, []).html.split("<tr");
  assert.match(rows[1], /<td class="lab"><\/td>/);   // 飛び出した行は空欄
  assert.match(rows[2], /①/);                        // その下が①
});

test("端の列でも太枠の左右判定で落ちない", () => {
  const gridRows = makeGridRows([
    { h: 8, fills: [{ id: 0, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  assert.doesNotThrow(() => gridRows(0, []));
});

test("8行の日は○を小さくして行高を詰める", () => {
  assert.match(source, /\.sheet\.grid8 td\.g\{height:26px\}/);
  assert.match(source, /\.sheet\.grid8 td\.g \.mk\{width:19px;height:19px\}/);
});

test("8行の日だけ紙にgrid8の印を付ける", () => {
  assert.match(source, /const gridCls = \(grid\.rows>7\) \? " grid8" : "";/);
});

test("緊急用マスが空なら列番号行は数字のまま", () => {
  const gridRows = makeGridRows([
    { h: 8, fills: [{ id: 0, count: 7 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  assert.match(gridRows(0, []).html, /<td class="colno aisle">0<\/td>/);
});

test("緊急用マスに荷物があると○の中に列番号を出す", () => {
  const gridRows = makeGridRows([
    { h: 8, fills: [{ id: 0, count: 8 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  assert.match(gridRows(0, []).html, /<td class="colno aisle g"><span class="mk">0<\/span><\/td>/);
});

test("列番号行の緊急用マスは印刷でも灰色を出す", () => {
  assert.match(
    source,
    /\.sheet td\.colno\.aisle\{[^}]*background:#d9d9d9[^}]*print-color-adjust:exact/s
  );
});

test("引き出し線の行は紙の行番号で返す", () => {
  const sheetGridAnchors = new Function(
    "lastLots",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("sheetGridAnchors") + "; return sheetGridAnchors;"
  )([]);
  // 0列目は上に飛び出す列。1列目は飛び出さない列で、どちらも先頭に荷物がある
  const sp = { name: "メイン", cols: [
    { h: 9, up: 1, fills: [{ id: 0, count: 1 }], aisleRows: [8] },
    { h: 8, fills: [{ id: 1, count: 1 }], aisleRows: [7] },
  ] };
  const anchors = sheetGridAnchors(sp, [{ c: 0 }, { c: 1 }]);
  const a0 = anchors.find(a => a.id === 0);
  const a1 = anchors.find(a => a.id === 1);
  // 上に飛び出す列の荷物は紙の0行目、飛び出さない列の荷物は紙の1行目
  assert.equal(a0.row, 0);
  assert.equal(a1.row, 1);
});

test("上に飛び出したマスが空の日は行がずれない", () => {
  const sheetGridAnchors = new Function(
    "lastLots",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("sheetGridAnchors") + "; return sheetGridAnchors;"
  )([]);
  const sp = { name: "メイン", cols: [
    { h: 9, up: 1, fills: [], aisleRows: [8] },
    { h: 8, fills: [{ id: 1, count: 1 }], aisleRows: [7] },
  ] };
  const anchors = sheetGridAnchors(sp, [{ c: 0 }, { c: 1 }]);
  assert.equal(anchors.find(a => a.id === 1).row, 0);
});
