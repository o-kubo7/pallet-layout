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
  assert.match(sw, /const CACHE_VERSION = "v53"/);
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

test("rectsOverlap は辺が接するだけでは重なりとみなさない", () => {
  const rectsOverlap = new Function("return " + functionSource("rectsOverlap"))();
  const base = {left:0, right:10, top:0, bottom:10};
  assert.equal(rectsOverlap(base, {left:5, right:15, top:5, bottom:15}), true);
  assert.equal(rectsOverlap(base, {left:10, right:20, top:0, bottom:10}), false);
  assert.equal(rectsOverlap(base, {left:0, right:10, top:10, bottom:20}), false);
  assert.equal(rectsOverlap(base, {left:-5, right:5, top:-5, bottom:5}), true);
  assert.equal(rectsOverlap(base, {left:20, right:30, top:20, bottom:30}), false);
  assert.equal(rectsOverlap(base, {left:2, right:4, top:2, bottom:4}), true);
});

test("clickIntent はキーボード由来と指を従来どおりのトグルに倒す", () => {
  const clickIntent = new Function("return " + functionSource("clickIntent"))();
  assert.equal(clickIntent(false, 0, "mouse"), "toggle");
  assert.equal(clickIntent(true, 0, "mouse"), "toggle");
  assert.equal(clickIntent(false, 1, "touch"), "toggle");
  assert.equal(clickIntent(true, 1, "touch"), "toggle");
  assert.equal(clickIntent(false, 1, "pen"), "toggle");
  assert.equal(clickIntent(false, 1, null), "toggle");
  assert.equal(clickIntent(false, 1, "mouse"), "single");
  assert.equal(clickIntent(true, 1, "mouse"), "toggle");
});

test("pointerIntent は指の経路を従来どおり残す", () => {
  const pointerIntent = new Function("return " + functionSource("pointerIntent"))();
  assert.equal(pointerIntent("touch", true, false), "sweepPick");
  assert.equal(pointerIntent("touch", true, true), "sweepUndecided");
  assert.equal(pointerIntent("touch", false, false), "none");
  assert.equal(pointerIntent("pen", true, false), "sweepPick");
  assert.equal(pointerIntent("mouse", true, true), "carry");
  assert.equal(pointerIntent("mouse", true, false), "carryOne");
  assert.equal(pointerIntent("mouse", false, false), "rubber");
});

test("cellsInRect は固定中のロットだけ拾い、抜けたら付け替える", () => {
  const cellsInRect = new Function(
    functionSource("rectsOverlap") + "; return " + functionSource("cellsInRect"))();
  const cells = [
    {key:"A|0|0", lotId:1, rect:{left:0, right:10, top:0, bottom:10}},
    {key:"A|0|1", lotId:1, rect:{left:0, right:10, top:10, bottom:20}},
    {key:"A|1|0", lotId:2, rect:{left:50, right:60, top:0, bottom:10}},
  ];
  const wide = {left:0, right:100, top:0, bottom:100};

  const first = cellsInRect(cells, wide, null);
  assert.equal(first.lotId, 1);
  assert.deepEqual(first.keys, ["A|0|0", "A|0|1"]);

  const locked = cellsInRect(cells, wide, 2);
  assert.equal(locked.lotId, 2);
  assert.deepEqual(locked.keys, ["A|1|0"]);

  // ロット1に固定したまま、矩形をロット2だけに動かす → 固定が外れて null を返す
  const movedAway = cellsInRect(cells, {left:45, right:65, top:0, bottom:10}, 1);
  assert.equal(movedAway.lotId, null);
  assert.deepEqual(movedAway.keys, []);

  const empty = cellsInRect(cells, {left:500, right:600, top:500, bottom:600}, null);
  assert.equal(empty.lotId, null);
  assert.deepEqual(empty.keys, []);
});

test("click は clickIntent の判定に従って単独選択とトグルを分ける", () => {
  const toggle = functionSource("toggleCell");
  assert.match(toggle, /function toggleCell\(cellEl, ?intent\)/);
  assert.match(toggle, /intent==="single"/);
  assert.match(toggle, /clearSel\(\)/);
  // 同じマスの再クリックで外す仕掛けは入れない（Finder は選択を保つ）
  assert.doesNotMatch(toggle, /sel\.cells\.size===1 ?&& ?sel\.cells\.has/);

  const start = source.indexOf('document.addEventListener("click",e=>{');
  assert.notEqual(start, -1);
  const end = source.indexOf('document.addEventListener("pointerdown"', start);
  const handler = source.slice(start, end);
  assert.match(handler, /clickIntent\(e\.shiftKey, ?e\.detail, ?lastPointerType\)/);
  assert.match(handler, /toggleCell\(c, ?intent\)/);
});

test("直前の pointerdown の pointerType を控える", () => {
  assert.match(source, /let lastPointerType=null;/);
  assert.match(source, /lastPointerType=e\.pointerType;/);
});

test("盤の pointerdown は pointerIntent の判定で振り分ける", () => {
  const start = source.indexOf('  if(sweep||drag||rubber) return;\n  if(!moveMode) return;');
  assert.notEqual(start, -1);
  const end = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(blockedEditMode) return;', start);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);

  assert.match(handler, /pointerIntent\(e\.pointerType, ?!!c ?&& ?c\.dataset\.lot!=null, ?onSel\)/);
  assert.match(handler, /if\(intent==="none"\) return;/);
  assert.match(handler, /if\(intent==="rubber"\)\{ ?startRubber\(e\); ?return; ?\}/);
  // 指のなぞりは残っている
  assert.match(handler, /mode: ?intent==="sweepPick" ?\? ?"pick" ?: ?null/);
  // マウスはもう sweep の拾いに入らない
  assert.doesNotMatch(handler, /e\.pointerType!=="mouse" ?&& ?tool!=="sweep"/);
});

test("掴んだ1マスの選択はしきい値を超えてから行う", () => {
  const start = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(blockedEditMode) return;');
  assert.notEqual(start, -1);
  const end = source.indexOf('function endSweep(){', start);
  const handler = source.slice(start, end);
  // started になった後のブロックの中で選ぶ
  assert.match(handler, /if\(sweep\.mode==="pick"\) selAdd\(sweep\.target\);\s*\n\s*if\(sweep\.carryOne\)\{ ?clearSel\(\); ?selAdd\(sweep\.target\); ?\}/);
  assert.match(handler, /if\(sweep\.straightToMove\)\{ ?toMove\(e\.clientX,e\.clientY\); ?return; ?\}/);
});

test("矩形の対象は退避の2か所を1つのまとまりとして切り分ける", () => {
  const cells = functionSource("rubberCells");
  // #stashDock ではなく、退避が描かれる2つのコンテナで判定する
  assert.match(cells, /#zone-stash, ?#zone-stash-mini/);
  assert.doesNotMatch(cells, /closest\("#stashDock"\)/);
  assert.match(cells, /getBoundingClientRect\(\)/);
});

test("矩形選択は取り消し用の控えを clearSel より前に取る", () => {
  const start = functionSource("startRubber");
  const undoAt = start.indexOf("undo=");
  const clearAt = start.indexOf("clearSel()");
  assert.notEqual(undoAt, -1);
  assert.notEqual(clearAt, -1);
  assert.ok(undoAt < clearAt, "clearSel() は sweepUndo を捨てるので控えを先に取る");
  // ウィンドウ外で離しても取りこぼさない
  assert.match(start, /setPointerCapture/);
  // 盤と退避のあいだでは Shift でも足さない
  assert.match(start, /stashSide/);
});

test("矩形選択はマスの位置を毎回測り直す", () => {
  const move = functionSource("moveRubber");
  assert.match(move, /rubberCells\(rubber\.stashSide\)/);
  assert.match(move, /cellsInRect\(/);
  assert.match(move, /userSelect/);
  // repaintSel が showSelCount まで面倒を見るので afterSelChange は呼ばない
  assert.doesNotMatch(move, /afterSelChange\(\)/);
});

test("矩形選択は枠と捕捉と user-select を必ず後始末する", () => {
  const release = functionSource("releaseRubber");
  assert.match(release, /box\.remove\(\)/);
  assert.match(release, /releasePointerCapture/);
  assert.match(release, /userSelect=""/);
  // 終了も取り消しも同じ後始末を通す
  const end = functionSource("endRubber");
  assert.match(end, /releaseRubber\(\)/);
  assert.match(end, /rubber=null/);
  const cancel = functionSource("cancelRubber");
  assert.match(cancel, /releaseRubber\(\)/);
  assert.match(cancel, /repaintSel\(\)/);
  assert.match(cancel, /rubber=null/);
});

test("矩形の枠は fixed で置き、mapBody に position を足さない", () => {
  assert.match(source, /\.rubberbox\{[^}]*position:fixed/);
  assert.match(source, /\.rubberbox\{[^}]*pointer-events:none/);
  assert.doesNotMatch(source, /#mapBody\{[^}]*position:relative/);
});

test("盤の pointermove / pointerup / Escape は矩形選択を通す", () => {
  assert.match(source, /if\(rubber && e\.pointerId===rubber\.id\)\{ ?moveRubber\(e\); ?return; ?\}/);
  assert.match(source, /if\(rubber && e\.pointerId===rubber\.id\) endRubber\(\);/);
  assert.match(source, /e\.key==="Escape" ?&& ?rubber/);
});


test("ボタンと帯と見出しの上では矩形を始めない", () => {
  const start = source.indexOf('  if(sweep||drag||rubber) return;\n  if(!moveMode) return;');
  assert.notEqual(start, -1);
  const end = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(blockedEditMode) return;', start);
  const handler = source.slice(start, end);
  assert.match(handler, /closest\("button, ?\.toolflag, ?\.sb-head"\)/);
  // ドックの中だからという理由では除外しない（退避側でも矩形は引ける）
  assert.doesNotMatch(handler, /closest\("#stashDock"\) return/);
});

test("取り消しボタンはなぞり以外の選択にも使える文言にする", () => {
  assert.match(source, /id="sweepUndoBtn"[\s\S]{0,200}↩ いまの選択を取り消す/);
  assert.doesNotMatch(source, /↩ いまのなぞりを取り消す/);
});
test("矩形の側判定は退避の余白（ドックとフロア）も退避側とみなす", () => {
  const start = functionSource("startRubber");
  // #zone-stash / #zone-stash-mini はマスを並べる要素で、余白を含まない。
  // ドックの .sb-body やフロアの .scroller から引いても退避側になること。
  assert.match(start, /closest\("#zone-stash, ?#zone-stash-mini, ?#stashDock, ?\.floor\.stashfloor"\)/);
  // マスの選別は従来どおり2つの spaces だけを見る
  const cells = functionSource("rubberCells");
  assert.match(cells, /#zone-stash, ?#zone-stash-mini/);
  assert.doesNotMatch(cells, /#stashDock/);
});

test("ネイティブのスクロールバーをつまんでも矩形を始めない", () => {
  const start = source.indexOf('  if(sweep||drag||rubber) return;\n  if(!moveMode) return;');
  assert.notEqual(start, -1);
  const end = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(blockedEditMode) return;', start);
  assert.notEqual(end, -1);
  const handler = source.slice(start, end);
  assert.match(handler, /e\.offsetX>e\.target\.clientWidth \|\| e\.offsetY>e\.target\.clientHeight/);
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

// DEFAULT_SPACES は配列リテラルなので、宣言ごと切り出して評価する
function defaultSpaces() {
  const start = source.indexOf("const DEFAULT_SPACES = [");
  assert.notEqual(start, -1);
  const end = source.indexOf("\n];", start);
  assert.notEqual(end, -1);
  return new Function(source.slice(start, end + 3) + "; return DEFAULT_SPACES;")();
}
function defaultSpace(name) {
  const found = defaultSpaces().find(space => space.name === name);
  assert.ok(found, `${name} must exist`);
  return found;
}

// gridRows は lastSp / lastLots など外の値を見るので、注入して組み立てる
function makeGridRows(cols, order) {
  return new Function(
    "lastSp", "sheetAreas", "gridWarn", "SHEET_GRID_ORDER", "overflowTable", "lastLots", "tailAreaOf",
    functionSource("aisleRowCount") +
    functionSource("fillOrder") +
    functionSource("gridShift") +
    functionSource("fillOrder") + functionSource("sheetGridAnchors") +
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
    functionSource("fillOrder") + functionSource("sheetGridAnchors") + functionSource("gridRows") + "; return gridRows;"
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
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
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
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
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
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const main = { lot: { id: 1 }, areas: ["メイン"] };
  const pc = { lot: { id: 2 }, areas: ["PC横"] };
  const ev = { lot: { id: 3 }, areas: ["EV横"] };
  const computeSheetPlacement = placement(
    tier => tier === "top" ? [] : [main, pc, ev],
    () => [],
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
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas", "lastSp", "SHEET_GRID_ORDER",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("fillOrder") + functionSource("sheetGridAnchors") +
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const main = { lot: { id: 1 }, areas: ["メイン"] };
  const computeSheetPlacement = placement(
    tier => tier === "top" ? [] : [main],
    () => [],
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

test("右端予約で欄数が減ってもメイン項目はグリッド順に並ぶ", () => {
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
  // 基準エリア優先にしたのでメイン3件が先に欄を取り、右詰めに残るのは1欄。
  // 並び順の先頭の PC横 が残り、EV横 がこぼれる（設計書 2026-09-19 §3-2）
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id), [2, 3, 1, 4]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), [5]);
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
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const top = Array.from({ length: 7 }, (_, index) => ({ lot: { id: index + 1 }, areas: ["軒下①"] }));
  const bottom = Array.from({ length: 8 }, (_, index) => ({ lot: { id: index + 101 }, areas: ["メイン"] }));
  const computeSheetPlacement = placement(
    tier => tier === "top" ? top : bottom,
    () => [],
    () => ({ top: 5, bottom: 8 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : []
  );
  const result = computeSheetPlacement();
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), [6, 7]);
  assert.deepEqual(result.unlisted, []);
});

test("5項目以上のあふれでは4枠目をまとめ欄にする", () => {
  const placement = new Function(
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  );
  const top = Array.from({ length: 10 }, (_, index) => ({ lot: { id: index + 1 }, areas: ["軒下①"] }));
  const bottom = Array.from({ length: 8 }, (_, index) => ({ lot: { id: index + 101 }, areas: ["メイン"] }));
  const computeSheetPlacement = placement(
    tier => tier === "top" ? top : bottom,
    () => [],
    () => ({ top: 5, bottom: 8 }),
    areas => `※${areas.join("・")}`,
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : []
  );
  const result = computeSheetPlacement();
  // 追記欄は 78px×2列×2段の4枠。5件以上あふれた日だけ4枠目がまとめ欄（{group:[...]}）になり、
  // 紙から荷物が消えないよう unlisted は常に空になる
  assert.equal(result.overflow.length, 4);
  assert.deepEqual(result.overflow.slice(0, 3).map(entry => entry.lot.id), [6, 7, 8]);
  assert.deepEqual(result.overflow[3].group.map(entry => entry.lot.id), [9, 10]);
  assert.deepEqual(result.unlisted, []);
});

test("追記欄の段と段の間に6pxの隙間を入れる", () => {
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  );
  const entry = (name, lot) => ({ lot: { name, lot }, areas: ["軒下①"] });
  // 追記欄は1行に2欄ずつ並ぶので、隙間が入るのは3件目以降＝2段目ができる日
  const html = renderOverflow(
    value => String(value),
    () => "6P",
    () => "※軒下①"
  )([entry("品目1", "L-1"), entry("品目2", "L-2"), entry("品目3", "L-3")]);
  assert.match(html, /class="overflow-gap"/);
  // 1段だけの日は隙間が要らない
  const oneRow = renderOverflow(
    value => String(value),
    () => "6P",
    () => "※軒下①"
  )([entry("品目1", "L-1"), entry("品目2", "L-2")]);
  assert.doesNotMatch(oneRow, /class="overflow-gap"/);
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
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
  )();
  const cells = cellsOf({ h: 3, fills: [{ id: 5, count: 3 }], aisleRows: [2] });
  assert.deepEqual(cells.map(cell => [cell.row, cell.id, cell.aisleRow]), [
    [0, 5, false], [1, 5, false], [2, 5, true],
  ]);
});

// 現場の要望で、緊急用マスの見た目は両サイドの通路（aisle-empty）と揃えた。
// 空の間はグレーで通路だと分かり、荷物が入ればロットの色に変わって
// 通常マスと同じに見える（aisle-empty と全く同じ考え方）
test("緊急用の通路マスは両サイドの通路と同じグレーにする", () => {
  assert.match(source, /\.cell\.aisle-cell\{background:#e5e7eb\}/);
});

test("盤のマスは緊急用の通路マスが空の間だけクラスを付ける", () => {
  assert.match(source, /if\(!filled&&a\.aisleRow\)cls\.push\("aisle-cell"\)/);
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

// 使っている日だけずらす案も試したが、使っていない日は逆に「upの無い列の
// 下端が浮く」形になり、下端が不揃いに見えた。up列を基準に他を下げる
// 常時表示のほうが、使用の有無に関わらず下端が常に揃うので採用している
test("盤は使用の有無に関わらず常にup基準でずらす", () => {
  assert.match(source, /const topOff=topAlign\?colTopOffset\(sp,col\):0;/);
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
    // 准緊急用マス(row0)は通常の7マスを使い切ってから埋まる。count:8で届く
    { h: 9, up: 1, fills: [{ id: 0, count: 8 }], aisleRows: [8] },
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
    { h: 9, up: 1, fills: [{ id: 0, count: 8 }], aisleRows: [8] },
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

test("8行の日はgrid8、wide様式の日はwideの印を紙に付ける", () => {
  // wide は総幅が normal より広い。CSS 側で幅を切り替えるための印
  assert.match(source, /const gridCls = \(\(grid\.rows>7\) \? " grid8" : ""\)/);
  assert.match(source, /\+ \(\(lay\.cols>SHEET_LAYOUTS\.normal\.cols\) \? " wide" : ""\);/);
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
  // 太枠の有無は別のテストで見る。ここは○表示だけを確かめる
  assert.match(gridRows(0, []).html, /<td class="colno aisle g[^"]*"><span class="mk">0<\/span><\/td>/);
});

test("緊急用マスの直上と同じロットなら太枠でつなげる", () => {
  const gridRows = makeGridRows([
    { h: 8, fills: [{ id: 0, count: 8 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  const html = gridRows(0, []).html;
  // グリッド本体の最終行と同じロットが緊急用マスまで続くので、上辺は内側（bt無し）。
  // 端の列なので左右は外側、最下段なので下辺は常に閉じる
  assert.match(html, /<td class="colno aisle g bb bl br"><span class="mk">0<\/span><\/td>/);
});

test("緊急用マスが別のロットなら太枠を切る", () => {
  const gridRows = makeGridRows([
    { h: 8, fills: [{ id: 0, count: 7 }, { id: 1, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  const html = gridRows(0, []).html;
  // ○の中身は列番号のまま（isHalf が無ければ o.c）。ロットが変わったことは太枠の有無で示す
  assert.match(html, /<td class="colno aisle g bt bb bl br"><span class="mk">0<\/span><\/td>/);
});

test("緊急用マスの列番号行は常に通常の白背景にする（現場の要望でグレー表示を撤去）", () => {
  assert.doesNotMatch(source, /\.sheet td\.colno\.aisle\{/);
});

test("引き出し線の行は紙の行番号で返す", () => {
  const sheetGridAnchors = new Function(
    "lastLots",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    functionSource("fillOrder") + functionSource("sheetGridAnchors") + "; return sheetGridAnchors;"
  )([]);
  // 0列目は上に飛び出す列。准緊急用マス(row0)まで埋めるにはcount:8必要。
  // 1列目は飛び出さない列で、先頭(row0)に荷物がある
  const sp = { name: "メイン", cols: [
    { h: 9, up: 1, fills: [{ id: 0, count: 8 }], aisleRows: [8] },
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
    functionSource("fillOrder") + functionSource("sheetGridAnchors") + "; return sheetGridAnchors;"
  )([]);
  const sp = { name: "メイン", cols: [
    { h: 9, up: 1, fills: [], aisleRows: [8] },
    { h: 8, fills: [{ id: 1, count: 1 }], aisleRows: [7] },
  ] };
  const anchors = sheetGridAnchors(sp, [{ c: 0 }, { c: 1 }]);
  assert.equal(anchors.find(a => a.id === 1).row, 0);
});

test("追記欄のrowspanはグリッドの行数から決める", () => {
  assert.doesNotMatch(source, /rowspan="8">\$\{overflowTable/);
  assert.match(source, /rowspan="\$\{g\.rows\+1\}">\$\{overflowTable/);
});

test("緊急用マスに荷物があると通路へのはみ出しとして知らせる", () => {
  const start = source.indexOf("const usedAisle=");
  assert.notEqual(start, -1);
  assert.match(source.slice(start, start + 260), /aisleRowCount\(c,c\.blockedRows\)/);
});

test("収容能力は緊急用の通路マスを数えない", () => {
  assert.match(functionSource("showCapacity"), /x\+c\.h-aisleRowCount\(c\)/);
});

test("退避から戻すときは緊急用の通路マスを使わない", () => {
  assert.match(functionSource("returnSelToWarehouse"), /autoFreeCount\(c,c\.blockedRows\)>=n/);
});

test("保存する列に緊急用マスと上方向の飛び出しを含める", () => {
  const normalizeSpaces = new Function(
    "DEFAULT_SPACES",
    functionSource("normalizeSpaces") + "; return normalizeSpaces;"
  )([]);
  const out = normalizeSpaces([{
    name: "メイン", zone: "near", orient: "v", block: 3, align: "top", sheet: "bottom",
    cols: [{ h: 9, aisle: false, up: 1, aisleRows: [8] }],
  }]);
  assert.deepEqual(out[0].cols[0].aisleRows, [8]);
  assert.equal(out[0].cols[0].up, 1);
});

test("古い保存に新しい属性が無くても既定の形に寄せる", () => {
  const normalizeSpaces = new Function(
    "DEFAULT_SPACES",
    functionSource("normalizeSpaces") + "; return normalizeSpaces;"
  )([]);
  const out = normalizeSpaces([{
    name: "メイン", zone: "near", orient: "v", block: 3, align: "top", sheet: "bottom",
    cols: [{ h: 7, aisle: false }],
  }]);
  assert.equal(out[0].cols[0].aisleRows, undefined);
  assert.equal(out[0].cols[0].up, undefined);
});

test("緊急用マスは列の下端1マスだけを認める", () => {
  const validSpaces = new Function(
    "SPACES_MAX_AREAS", "SPACES_MAX_COLS", "SPACES_MAX_COL_H", "SPACES_MAX_ROW", "SPACES_MAX_OFF", "isPlainObject",
    functionSource("validSpaces") + "; return validSpaces;"
  )(99, 99, 99, 99, 99, v => !!v && typeof v === "object" && !Array.isArray(v));
  const make = aisleRows => ([{
    name: "メイン", zone: "near", orient: "v", block: 3, align: "top", sheet: "bottom",
    cols: [{ h: 8, aisle: false, aisleRows }],
  }]);
  assert.equal(validSpaces(make([7])), true);
  assert.equal(validSpaces(make([6])), false);      // 下端ではない
  assert.equal(validSpaces(make([6, 7])), false);   // 2 マスは認めない
});

test("配置マスを更新したので保存バージョンを上げる", () => {
  assert.match(source, /const SPACES_SAVE_VERSION = 4;/);
});

test("版が変わったら配置不可セルも一緒に解除する", () => {
  const start = source.indexOf("if(d.v!==SPACES_SAVE_VERSION){");
  assert.notEqual(start, -1);
  assert.match(source.slice(start, start + 460), /clearAllBlocked\(\)/);
});

test("列の高さを変えて緊急用マスが消えたら設定タブで知らせる", () => {
  assert.match(functionSource("applyConfig"), /緊急用の通路マス/);
});

test("メインの中央9列は下端に緊急用マスを持つ", () => {
  const main = defaultSpace("メイン");
  const mid = main.cols.slice(1, 10);
  assert.equal(mid.length, 9);
  mid.forEach((col, i) => {
    assert.deepEqual(col.aisleRows, [col.h - 1], `${i + 1}列目`);
  });
});

test("メインの4/5/6/8列は上に1マス飛び出す", () => {
  const main = defaultSpace("メイン");
  [4, 5, 6, 8].forEach(i => {
    assert.equal(main.cols[i].up, 1, `${i}列目`);
    assert.equal(main.cols[i].h, 9, `${i}列目の高さ`);
  });
  [1, 2, 3, 7, 9].forEach(i => {
    assert.equal(main.cols[i].up, undefined, `${i}列目`);
    assert.equal(main.cols[i].h, 8, `${i}列目の高さ`);
  });
});

test("PC横は8マス列の左に1マス空けて2マス持つ", () => {
  const pc = defaultSpace("PC横");
  assert.equal(pc.cols.length, 3);
  assert.deepEqual(pc.cols[2], { h: 2, row: 2, off: 9 });
});

test("EV横は5マス列の左に1マス空けて2マス持つ", () => {
  const ev = defaultSpace("EV横");
  assert.equal(ev.cols.length, 5);
  assert.deepEqual(ev.cols[0], { h: 5, row: 2, off: 3 });
  assert.deepEqual(ev.cols[4], { h: 2, row: 2, off: 0 });
});

// 合成オブジェクトのテストだけでは、実行時に属性が落ちていても気づけない。
// 既定値から作業用の列を作り、自動配置まで通して確かめる
test("既定の配置マスから自動配置まで通すと緊急用マスが空く", () => {
  const run = new Function(
    "SPACES", "blockedRowsFor",
    functionSource("used") +
    functionSource("usableCount") +
    functionSource("columnFreeCount") +
    functionSource("aisleRowCount") +
    functionSource("autoFreeCount") +
    functionSource("findRun") +
    functionSource("placeLot") +
    functionSource("buildWork") +
    "; return {buildWork, placeLot};"
  )(defaultSpaces(), () => new Set());
  const work = run.buildWork([]);
  const main = work.find(s => s.name === "メイン");
  const col = main.cols[1];                    // h:8、下端が緊急用
  assert.deepEqual(col.aisleRows, [7]);        // buildWork が落としていない
  const rem = run.placeLot({ id: 0, pallets: 8 }, [{ cols: [col], useAisle: false }]);
  assert.equal(rem, 1);                        // 緊急用マスには置かない
  // buildWork() が aisle を !!c.aisle で真偽値化するため、通路でない列は ov:false になる
  assert.deepEqual(col.fills, [{ id: 0, count: 7, ov: false }]);
});

// at() は endOf の外（緊急用マスの行）を見ない。本体の最終行の bb は、
// 代わりに列番号行と共有する aisleId で緊急用マスの実際のロットと比べる。
// 同じロットなら内側にして、緊急用マスの列番号行（常に bb を持つ）まで
// 太枠をつなげる。でないと本体側だけ先に線が引かれ、枠が途中で途切れる
test("最終行と緊急用マスが同じロットなら本体の最終行の太枠を内側にする", () => {
  const gridRows = makeGridRows([
    // rows 0-5 は別ロット(9)で埋め、rows 6-7(本体の最終行と緊急用マス)を
    // 同じロット(0)にする。本体は endOf=7 なので表示される最終行は r=6
    { h: 8, fills: [{ id: 9, count: 6 }, { id: 0, count: 2 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  const out = gridRows(0, []);
  const growRows = out.html.split("<tr").filter(r => r.includes('class="grow"'));
  const lastRow = growRows[growRows.length - 1];
  assert.doesNotMatch(lastRow, /<td class="[^"]*\bbb\b[^"]*">/);
});

test("最終行と緊急用マスが別ロットなら本体の最終行に太枠を引く", () => {
  const gridRows = makeGridRows([
    // row 6(本体の最終行)がロット0、row 7(緊急用マス)がロット9で別物
    { h: 8, fills: [{ id: 0, count: 7 }, { id: 9, count: 1 }], aisleRows: [7] },
  ], [{ c: 0 }]);
  const out = gridRows(0, []);
  const growRows = out.html.split("<tr").filter(r => r.includes('class="grow"'));
  const lastRow = growRows[growRows.length - 1];
  assert.match(lastRow, /<td class="[^"]*\bbb\b[^"]*">/);
});

// up の列（准緊急用マス）は、通常の詰め方だと画面上いちばん上（row 0）から
// 埋まってしまい、追加した分を最初に使ってしまう。現場の運用は逆で、
// 元の7マスを使い切ってから准緊急用マスに手を伸ばしたいので、up がある
// 列だけ「up の行を後回しにする」順番で詰める（表示位置そのものは変えない）
test("up の列は通常マスを先に詰め、准緊急用マス(上端)は最後に埋める", () => {
  const cellsOf = new Function(
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
  )();
  // h9・up1・aisleRows[8]。7個入れても上端(row0)は空のまま
  const cells7 = cellsOf({ h: 9, up: 1, fills: [{ id: 0, count: 7 }], aisleRows: [8] });
  assert.equal(cells7[0].id, null);
  assert.deepEqual(cells7.slice(1, 8).map(c => c.id), Array(7).fill(0));
  // 8個目でようやく上端(row0)が埋まる
  const cells8 = cellsOf({ h: 9, up: 1, fills: [{ id: 0, count: 8 }], aisleRows: [8] });
  assert.equal(cells8[0].id, 0);
});

test("up が無い列は今までどおり row 0 から詰める", () => {
  const cellsOf = new Function(
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
  )();
  const cells = cellsOf({ h: 8, fills: [{ id: 0, count: 3 }], aisleRows: [7] });
  assert.deepEqual(cells.slice(0, 3).map(c => c.id), [0, 0, 0]);
  assert.equal(cells[3].id, null);
});

test("up の列で准緊急用マスまで埋まったら緊急用マスは使わない", () => {
  const cellsOf = new Function(
    functionSource("fillOrder") + functionSource("cellsOf") + "; return cellsOf;"
  )();
  const cells = cellsOf({ h: 9, up: 1, fills: [{ id: 0, count: 8 }], aisleRows: [8] });
  assert.equal(cells[8].id, null); // 緊急用マス(row8)は自動配置の対象外、8個では届かない
});

test("下段の欄は基準エリアのロットが先に取る", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const pc = n => ({ lot: { id: "P" + n }, areas: ["PC横"] });
  const ev = n => ({ lot: { id: "E" + n }, areas: ["EV横"] });
  const result = arrange(
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     pc(1), pc(2), pc(3), ev(1)], 9, null);
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "P1", "P2"]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), ["P3", "E1"]);
});

test("右詰めに1欄しか残らない日は並び順の先頭を残す", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const result = arrange(
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7), main(8),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    9, null);
  assert.equal(result.slots[8].lot.id, "P1");
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), ["E1"]);
});

test("基準エリアが欄数を超えたら基準エリア以外は全部こぼれる", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const result = arrange(
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7), main(8), main(9),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    9, null);
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    ["M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8", "M9"]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), ["P1", "E1"]);
});

test("両方が下段に残る日は右詰めとEV横最右を保つ", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const result = arrange(
    [main(1), main(2), main(3), main(4), main(5), main(6),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    9, null);
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    ["M1", "M2", "M3", "M4", "M5", "M6", null, "P1", "E1"]);
  assert.deepEqual(result.dropped, []);
});

test("上段からの救済は基準エリア以外より後ろに置く", () => {
  const arrange = new Function(
    "sheetAreas",
    functionSource("arrangeBottomSlots") + "; return arrangeBottomSlots;"
  )(() => ["メイン", "PC横", "EV横"]);
  const rescued = { lot: { id: "R1" }, areas: ["軒下①"], fromTop: true };
  const result = arrange(
    [{ lot: { id: "M1" }, areas: ["メイン"] }, { lot: { id: "M2" }, areas: ["メイン"] },
     rescued,
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    7, null);
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id),
    ["M1", "M2", "R1", null, null, "P1", "E1"]);
});

function buildPlacementForTier(topSlots, bottomSlots) {
  return new Function(
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  )(
    tier => tier === "top" ? topSlots : bottomSlots,
    () => [],
    () => ({ top: 6, bottom: 9 }),
    areas => "※" + areas.join("・"),
    false,
    tier => tier === "bottom" ? ["メイン", "PC横", "EV横"] : ["軒下①"]
  );
}

test("下段のこぼれのうち基準エリア以外は上段の空き欄へ回る", () => {
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "P2" }, areas: ["PC横"] },
     { lot: { id: "P3" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }]
  );
  const result = placement();
  assert.deepEqual(result.top.map(entry => entry.lot.id), ["T1", "P3", "E1"]);
  // 回した欄は基準エリアを省かない注釈に作り直す
  assert.deepEqual(result.top.slice(1).map(entry => entry.note), ["※PC横", "※EV横"]);
});

test("基準エリアのこぼれは上段へ回さず追記欄へ行く", () => {
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7), main(8), main(9), main(10),
     { lot: { id: "P1" }, areas: ["PC横"] }]
  );
  const result = placement();
  // 上段へ回るのは PC横 だけ。メインのこぼれは追記欄へ直行する
  assert.deepEqual(result.top.map(entry => entry.lot.id), ["T1", "P1"]);
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), ["M10"]);
});

test("下段があふれた日は上段から下段への救済が起きない", () => {
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "P2" }, areas: ["PC横"] },
     { lot: { id: "P3" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }]
  );
  assert.deepEqual(placement().moved, []);
});

test("下段から上段へ回した欄を画面にだけ知らせる", () => {
  const fit = functionSource("fitSheetText");
  assert.match(fit, /pl\.movedBottom\s*&&\s*pl\.movedBottom\.length/);
  assert.match(fit, /下段に入りきらない \$\{lotsIn\(pl\.movedBottom\)\} 件を/);
  assert.match(fit, /上段の空き欄に回しています。/);
});
