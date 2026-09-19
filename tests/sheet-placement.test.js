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
  assert.match(sw, /const CACHE_VERSION = "v55"/);
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

test("印刷の前に編集モードを閉じる。ショートカット経由も塞ぐ", () => {
  // Ctrl/Cmd+P とブラウザのメニューは printSheet() を通らず beforeprint だけが走る
  assert.match(functionSource("printSheet"), /exitSheetEditMode\(\)/);

  const beforeStart = source.indexOf("window.addEventListener('beforeprint'");
  assert.notEqual(beforeStart, -1);
  assert.match(source.slice(beforeStart, beforeStart + 400), /exitSheetEditMode\(\)/);
});

test("書き足しを全部戻すボタンは編集モードの間だけ出す", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  assert.match(source.slice(sheetStart, sheetEnd), /id="sheetClearBtn"[^>]*onclick="clearAllMarks\(\)"/);

  const fn = functionSource("applySheetEditMode");
  assert.match(fn, /sheetClearBtn/);
  assert.match(fn, /hidden/);
});

test("書き足しを全部戻すときは設定にかかわらず確認する", () => {
  const fn = functionSource("clearAllMarks");
  assert.match(fn, /confirm/);
  assert.doesNotMatch(fn, /sheetEditSilent/);
});

test("編集ツールバーのボタンは画面だけに出し、紙には出さない", () => {
  // .sheet-toolbar 自体は隠さない（#printBtn は既存どおり紙に出す）ので、
  // 新しく足した2つのボタンを名指しで消す必要がある
  assert.match(printBlock(), /#sheetEditBtn,#sheetClearBtn\{display:none/);
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

// @media print{...} だけを切り出す。固定長で切ると閉じ括弧の外まで含み、
// 印刷CSSの外に書いた指定でも印刷CSSのテストが緑になってしまう
function printBlock() {
  const start = source.indexOf("@media print{");
  assert.notEqual(start, -1, "@media print must exist");
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error("@media print has no closing brace");
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
    "normalizeSlip", "normalizeSnapshot", "normalizeBlocked", "normalizeSheetEdits",
    functionSource("normalizeShift") + "; return normalizeShift;"
  )(
    value => value,
    value => value,
    () => [],
    new Function(functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;")()
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

function buildPlacementForTier(topSlots, bottomSlots, stashed) {
  return new Function(
    "sheetSlots", "stashSlots", "sheetLayout", "slotAreaNote", "mergeLots", "sheetAreas",
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") + "; return sheetPlacement;"
  )(
    tier => tier === "top" ? topSlots : bottomSlots,
    () => stashed || [],
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

test("上段から下段へ回した欄の通知も pl.moved のガードごと固定する", () => {
  // pl.moved.length だけを見る検査では、ガードが外れても通ってしまう。
  // fitSheetText(pl) は外から配置オブジェクトを受け取る署名なので、
  // moved / movedBottom のどちらも同じ形で守られていることを固定する
  const fit = functionSource("fitSheetText");
  assert.match(fit, /pl\.moved\s*&&\s*pl\.moved\.length/);
  assert.match(fit, /上段に入りきらない \$\{lotsIn\(pl\.moved\)\} 件を/);
  assert.match(fit, /下段の空き欄に回しています。/);
});

test("退避が先に上段の欄を取り、残った空きにだけ下段のこぼれが入る", () => {
  // 設計書 2026-09-19 §3-3。退避は sheetPlacement() の冒頭で top の末尾に連結されるので、
  // 下段のこぼれ（手順3）が来る前に上段の欄を取る
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const stash = n => ({ lot: { id: "S" + n }, areas: ["退避"], note: "※未定", stash: true });
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" },
     { lot: { id: "T2" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "P2" }, areas: ["PC横"] },
     { lot: { id: "P3" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    [stash(1), stash(2), stash(3)]
  );
  const result = placement();
  // 上段6欄のうち5欄を 軒下2件＋退避3件 が埋め、残る1欄に下段のこぼれの先頭が入る
  assert.deepEqual(result.top.map(entry => entry.lot.id),
    ["T1", "T2", "S1", "S2", "S3", "P3"]);
  assert.deepEqual(result.movedBottom.map(entry => entry.lot.id), ["P3"]);
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), ["E1"]);
});

test("退避が上段の空きを使い切る日は下段のこぼれが回らない", () => {
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const stash = n => ({ lot: { id: "S" + n }, areas: ["退避"], note: "※未定", stash: true });
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" },
     { lot: { id: "T2" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     { lot: { id: "P1" }, areas: ["PC横"] }, { lot: { id: "P2" }, areas: ["PC横"] },
     { lot: { id: "P3" }, areas: ["PC横"] }, { lot: { id: "E1" }, areas: ["EV横"] }],
    [stash(1), stash(2), stash(3), stash(4)]
  );
  const result = placement();
  assert.deepEqual(result.top.map(entry => entry.lot.id),
    ["T1", "T2", "S1", "S2", "S3", "S4"]);
  assert.deepEqual(result.movedBottom, []);
  // 回せなかった分は追記欄へ。退避そのものは上段に収まっているので追記欄には出ない
  assert.deepEqual(result.overflow.map(entry => entry.lot.id), ["P3", "E1"]);
});

test("上段があふれる日は退避が下段へ救済され、下段からの回送は起きない", () => {
  // 退避は arrangeBottomSlots() の救済対象にはなるが、下段のこぼれを上段へ回す経路の
  // 対象外（!e.stash）。この2つを取り違えないよう、上段があふれる側も固定する
  const stash = n => ({ lot: { id: "S" + n }, areas: ["退避"], note: "※未定", stash: true });
  const top = n => ({ lot: { id: "T" + n }, areas: ["軒下①"], note: "※軒下①" });
  const placement = buildPlacementForTier(
    [top(1), top(2), top(3), top(4), top(5), top(6)],
    [{ lot: { id: "M1" }, areas: ["メイン"] }],
    [stash(1), stash(2)]
  );
  const result = placement();
  // top は欄数で切らずに全件返る。紙に出るのは先頭 lay.top 欄だけで、
  // そこから溢れた退避2件は下段の空き欄へ救済される
  assert.deepEqual(result.top.slice(0, result.lay.top).map(entry => entry.lot.id),
    ["T1", "T2", "T3", "T4", "T5", "T6"]);
  assert.deepEqual(result.moved.map(entry => entry.lot.id), ["S1", "S2"]);
  assert.deepEqual(result.movedBottom, []);
  // 救済された退避は下段の欄に入るので、追記欄には残らない
  assert.deepEqual(result.overflow, []);
});

test("lotsIn は欄の数ではなくまとめ欄の中のロット数を数える", () => {
  const lotsIn = new Function(functionSource("lotsIn") + "; return lotsIn;")();
  assert.equal(lotsIn([]), 0);
  assert.equal(lotsIn([{ lot: { id: "A" } }, { lot: { id: "B" } }]), 2);
  // まとめ欄は1欄で複数のロットを持つ。画面通知の件数は荷物の数で言う
  assert.equal(lotsIn([{ members: [1, 2, 3] }]), 3);
  assert.equal(lotsIn([{ members: [1, 2] }, { lot: { id: "A" } }]), 3);
});

test("まとめ欄が上段へ回っても movedBottom はその欄をそのまま持つ", () => {
  // 回送の件数は lotsIn() で数えるので、欄が複数のロットをまとめている日に
  // 「1件」と言ってしまわないことを、movedBottom の中身の側から固定する
  const lotsIn = new Function(functionSource("lotsIn") + "; return lotsIn;")();
  const main = n => ({ lot: { id: "M" + n }, areas: ["メイン"] });
  const merged = {
    lot: { id: "P1" }, areas: ["PC横"], note: "元の注釈",
    members: [{ lot: { id: "P1" } }, { lot: { id: "P2" } }]
  };
  const placement = buildPlacementForTier(
    [{ lot: { id: "T1" }, areas: ["軒下①"], note: "※軒下①" }],
    [main(1), main(2), main(3), main(4), main(5), main(6), main(7),
     main(8), main(9), merged]
  );
  const result = placement();
  // movedBottom は元の欄をそのまま持つ。注釈を作り直した複製が入るのは top のほう
  assert.equal(result.movedBottom.length, 1);
  assert.equal(result.movedBottom[0], merged);
  assert.equal(merged.note, "元の注釈");
  const placed = result.top[result.top.length - 1];
  assert.notEqual(placed, merged);
  assert.equal(placed.note, "※PC横");
  assert.equal(placed.members, merged.members);
  // 1欄だが荷物は2件。画面通知はこちらの数で言う
  assert.equal(lotsIn(result.movedBottom), 2);
});

test("上段の注釈は、2つ以上のエリアにまたがる欄にだけ出す", () => {
  // 見出しがエリアを代表するので、欄ごとの注釈は「見出しだけでは
  // 場所を特定できない欄」に絞る。areas[0] はグループキーそのものなので省く
  const topSlotNote = new Function(
    functionSource("topSlotNote") + "; return topSlotNote;"
  )();
  assert.equal(topSlotNote({ areas: ["軒下①"] }), "");
  assert.equal(topSlotNote({ areas: ["軒下①", "出庫口横"] }), "※出庫口横");
  assert.equal(
    topSlotNote({ areas: ["軒下①", "出庫口横", "5棟壁際"] }),
    "※出庫口横・5棟壁際"
  );
  // 退避は見出しが「未定」になるので欄の注釈は要らない
  assert.equal(topSlotNote({ areas: ["退避"], stash: true }), "");
  // areas が空でも落ちない（slotAreaNote と同じ保険）
  assert.equal(topSlotNote({ areas: [] }), "");
  assert.equal(topSlotNote(null), "");
});

test("上段の見出しは、先頭エリアだけの日と空の日は従来どおり「軒下」1つ", () => {
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();
  const at = name => ({ areas: [name] });

  // 日常。現場が毎日見る紙の見た目を変えない
  assert.deepEqual(topHeadGroups([at("軒下①"), at("軒下①")], 4, "軒下①"),
    [{ label: "軒下", slots: 4 }]);
  // 上段に荷物が無い日
  assert.deepEqual(topHeadGroups([], 4, "軒下①"),
    [{ label: "軒下", slots: 4 }]);
});

test("上段の見出しは、先頭エリア以外だけの日にそのエリア名を出す", () => {
  // ここを「軒下」にすると置き場所が紙から完全に消える（設計書 §3-3）
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();
  const at = name => ({ areas: [name] });

  assert.deepEqual(topHeadGroups([at("出庫口横")], 4, "軒下①"),
    [{ label: "出庫口横", slots: 4 }]);
  // 退避は「退避」ではなく「未定」。現場にとって退避は場所の名前ではない
  assert.deepEqual(topHeadGroups([{ areas: ["退避"], stash: true }], 4, "軒下①"),
    [{ label: "未定", slots: 4 }]);
  // 下段から上段へ回した欄
  assert.deepEqual(topHeadGroups([at("PC横")], 4, "軒下①"),
    [{ label: "PC横", slots: 4 }]);
});

test("上段の見出しはエリアごとに分かれ、欄数の合計は必ず count に一致する", () => {
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();
  const at = name => ({ areas: [name] });
  const sum = gs => gs.reduce((a, g) => a + g.slots, 0);

  const two = topHeadGroups([at("軒下①"), at("軒下①"), at("軒下②")], 4, "軒下①");
  assert.deepEqual(two.map(g => g.label), ["軒下①", "軒下②"]);
  // 余った1欄は末尾のグループに足す
  assert.deepEqual(two.map(g => g.slots), [2, 2]);
  assert.equal(sum(two), 4);

  const stash = topHeadGroups(
    [at("軒下①"), { areas: ["退避"], stash: true }], 4, "軒下①");
  assert.deepEqual(stash.map(g => g.label), ["軒下①", "未定"]);
  assert.equal(sum(stash), 4);
});

test("上段の見出しは、またがる欄のエリアもラベルに並べる", () => {
  // 3欄のうち1欄だけが出庫口横にもまたがる日、見出しで「出庫口横にもある」が読める
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();

  // またがる欄しか2つ目のエリアを使っていない日。グループは1つだがラベルは割れる
  assert.deepEqual(
    topHeadGroups([{ areas: ["軒下①", "軒下②"] }], 4, "軒下①"),
    [{ label: "軒下①・軒下②", slots: 4 }]
  );
  // 3エリア以上は先頭2つ＋「 ほか」で打ち切る。1欄ぶんの幅では折り返して
  // 見出し行が約18px伸びるため（設計書 §5-3 の実測）
  assert.deepEqual(
    topHeadGroups([{ areas: ["軒下①", "出庫口横", "5棟壁際"] }], 4, "軒下①"),
    [{ label: "軒下①・出庫口横 ほか", slots: 4 }]
  );
});

test("上段の見出しは、紙に出ない欄を数えない", () => {
  // top は lay.top を超えうる（sheetPlacement の omittedTop）。
  // 超えた分まで数えると colspan の合計が lay.cols を超えて表が崩れる
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();
  const at = name => ({ areas: [name] });
  const sum = gs => gs.reduce((a, g) => a + g.slots, 0);

  const over = topHeadGroups(
    [at("軒下①"), at("軒下①"), at("軒下②"), at("軒下②"),
     at("出庫口横"), at("5棟壁際")], 4, "軒下①");
  assert.equal(sum(over), 4);
  // 5件目以降（出庫口横・5棟壁際）は紙に出ないので見出しにも出さない
  assert.deepEqual(over.map(g => g.label), ["軒下①", "軒下②"]);

  // wide（上段6欄）でも合計が一致する
  const wide = topHeadGroups([at("軒下①"), at("軒下②")], 6, "軒下①");
  assert.equal(sum(wide), 6);

  // areas が空の欄が混ざっても落ちない
  const broken = topHeadGroups([{ areas: [] }, at("軒下②")], 4, "軒下①");
  assert.equal(sum(broken), 4);
});

test("欄のセルは、指定された index の左辺だけ太くする", () => {
  // グループの境目を見出し行から P数 の行まで縦に貫かせる。
  // 位置を欄の index で受け取るので、呼び出し側が4行で同じ集合を使える
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("A"), lot("B"), lot("C")], 3, "name", "bb2", new Set([1]));
  const tds = html.match(/<td class="[^"]*"/g) || [];
  assert.equal(tds.length, 3);
  assert.doesNotMatch(tds[0], /gsep/);
  assert.match(tds[1], /gsep/);
  assert.doesNotMatch(tds[2], /gsep/);

  // 省略時は従来どおり（既存の呼び出しを壊さない）
  const plain = render([lot("A"), lot("B")], 2, "name", "bb2");
  assert.doesNotMatch(plain, /gsep/);

  // 注釈行には引かない
  const note = render([lot("A"), lot("B")], 2, "note", null, new Set([1]));
  assert.doesNotMatch(note, /gsep/);
});

test("配置図の見出し行はグループごとのセルで、列数の合計が様式に一致する", () => {
  // colspan の合計が lay.cols からずれると table-layout:fixed が colgroup を無視し、
  // 盤のマスと欄の位置、引き出し線の座標が同時に狂う
  const topHeadGroups = new Function(
    functionSource("topHeadGroups") + "; return topHeadGroups;"
  )();
  const at = name => ({ areas: [name] });
  const cols = groups => 5 + 1 + groups.reduce((a, g) => a + g.slots * 2, 0);

  // normal: 14 列
  assert.equal(cols(topHeadGroups([at("軒下①")], 4, "軒下①")), 14);
  assert.equal(cols(topHeadGroups([at("軒下①"), at("軒下②")], 4, "軒下①")), 14);
  assert.equal(cols(topHeadGroups([], 4, "軒下①")), 14);
  // wide: 18 列
  assert.equal(cols(topHeadGroups([at("軒下①"), at("軒下②"), at("PC横")], 6, "軒下①")), 18);

  // renderSheet が topHeadGroups を通し、colspan をグループの欄数から作っていること
  const fn = functionSource("renderSheet");
  assert.match(fn, /topHeadGroups\(top,\s*lay\.top,\s*sheetAreas\("top"\)\[0\]\s*\|\|\s*null\)/);
  assert.match(fn, /colspan="\$\{g\.slots\*2\}"/);
  assert.doesNotMatch(fn, /colspan="\$\{lay\.top\*2\}">軒下/);
  // 見出しは圧縮の対象に入れ、警告で種類が分かるように data-fit を付ける
  assert.match(fn, /data-fit="head"/);
  assert.match(fn, /<span class="fit">\$\{esc\(label\)\}<\/span>/);
});

test("グループの境目のセルは左辺を2pxにする", () => {
  assert.match(source, /\.sheet td\.ttl\.gsep,\.sheet td\.slot\.gsep\{border-left-width:2px\}/);
});

test("グループの区切り線は上段の品名・ロット・P数の行にも通す", () => {
  // 見出し行だけ 2px、下の行が 1px だと線が途中で細くなる
  const fn = functionSource("renderSheet");
  assert.match(fn, /slotCells\(top,lay\.top,"name","bb2",gsep,"top",marks\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"lot",null,gsep,"top",marks\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"pallet",null,gsep,"top",marks\)/);
  // 下段にはグループの区切りを渡さない（sepAt が null）
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"name","bb2",null,"bottom",marks\)/);
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"lot",null,null,"bottom",marks\)/);
});

test("上段の注釈行は残し、またがる欄にだけ注釈を出す", () => {
  // 行そのものは残す。あとで足す配置図のテキスト編集で、
  // 上段にも自由記入できる欄として使うため（設計書 §3-5）
  const fn = functionSource("renderSheet");
  assert.match(fn, /<tr class="note-row"><td class="none" colspan="5"><\/td>/);
  assert.match(fn, /top\.slice\(0,lay\.top\)\.map\(e=>e\?\{\.\.\.e,note:topSlotNote\(e\)\}:e\)/);
  assert.match(fn, /slotCells\(topNotes,lay\.top,"note",null,null,"top",marks\)/);
  // 元の欄は書き換えない（浅い複製を渡す）
  assert.doesNotMatch(fn, /e\.note=topSlotNote/);

  // 実際に空欄になることを確かめる
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const note = e => ({ ...e, note: new Function(
    functionSource("topSlotNote") + "; return topSlotNote;")()(e) });
  const html = render(
    [note({ lot: { name: "A" }, areas: ["軒下①"] }),
     note({ lot: { name: "B" }, areas: ["軒下①", "出庫口横"] })],
    2, "note");
  const cells = html.match(/<td class="[^"]*snote[^"]*"[^>]*>([\s\S]*?)<\/td>/g) || [];
  assert.equal(cells.length, 2);
  assert.doesNotMatch(cells[0], /※/);          // 単独の欄は空
  assert.match(cells[1], /※出庫口横/);          // またがる欄だけ出る
});

test("上段の注釈行の列数のコメントが様式と合っている", () => {
  // wide は 5+1+6×2=18 列。「5+1+5×2=16 列」は誤り
  assert.match(source, /normal は 5\+1\+4×2=14 列、wide は 5\+1\+6×2=18 列/);
});

test("見出しが入りきらないときは、品名ではなくエリア名の短縮を案内する", () => {
  // 見出しは --fs-* の対象外なので表示設定では小さくならず、品名でもない。
  // 既存の文言をそのまま出すと、書いてある対処法がどちらも効かない
  assert.match(source, /const FIT_LABEL = \{[^}]*head:"見出し"/);
  const fn = functionSource("fitSheetText");
  assert.match(fn, /「配置マス」でエリア名を短くしてください/);
  // 欄の側の案内は残す
  assert.match(fn, /「表示設定」で文字を小さくするか、品名を短くしてください/);
  // 見出しだけがあふれた日に、品名の案内を出さない
  assert.match(fn, /hasSlot/);
  assert.match(fn, /hasHead/);
});

test("見出しと欄の案内が、それぞれ正しい条件にぶら下がっている", () => {
  // hasSlot と hasHead を取り違えても、上の「文言が両方ある」テストは通ってしまう。
  // 取り違えると見出しがあふれた日に「品名を短くしてください」と出て、
  // 書いてある対処法が効かない元の不具合に戻る
  const fn = functionSource("fitSheetText");
  assert.match(fn, /if\(hasSlot\) how\+="設定タブの「表示設定」/);
  assert.match(fn, /if\(hasHead\) how\+="見出しは設定タブの「配置マス」/);
  // head は欄の側に数えない（見出しだけの日に品名の案内を出さないため）
  assert.match(fn, /const hasSlot=Object\.keys\(over\)\.some\(k=>k!=="head"\)/);
});

test("上段の注釈行の高さは16pxのまま", () => {
  // 注釈の中身は見出しへ移して普段は空になったが、行は高さごと残す。
  // あとで足す配置図のテキスト編集が、上段の自由記入欄としてこの行を使う（設計書 §3-5）
  assert.match(source, /\.sheet tr\.note-row td\.none\{height:16px\}/);
});

test("書き足しの署名は材料が1つ変われば変わる", () => {
  const hash = new Function(functionSource("sheetEditHash") + "; return sheetEditHash;")();
  const sigFrom = new Function(
    "sheetEditHash",
    functionSource("sheetEditSigFrom") + "; return sheetEditSigFrom;"
  )(hash);

  const base = {
    fp: '{"items":[{"itemId":"i1"}]}',
    lots: [{ id: "l1", pallets: 3 }],
    sp: [{ name: "軒下①", cells: ["l1"] }],
    spacesText: "軒下① | far | v | 1 | 3,3 | top",
    mergeLots: true,
    fracMode: false,
    layName: "normal",
  };
  const sig = sigFrom(base);

  assert.equal(sigFrom({ ...base }), sig);
  assert.notEqual(sigFrom({ ...base, fp: '{"items":[{"itemId":"i2"}]}' }), sig);
  assert.notEqual(sigFrom({ ...base, lots: [{ id: "l1", pallets: 4 }] }), sig);
  assert.notEqual(sigFrom({ ...base, sp: [{ name: "軒下①", cells: ["l2"] }] }), sig);
  assert.notEqual(sigFrom({ ...base, mergeLots: false }), sig);
  assert.notEqual(sigFrom({ ...base, fracMode: true }), sig);
  assert.notEqual(sigFrom({ ...base, layName: "wide" }), sig);
});

test("書き足しの署名は掲載先が変われば変わる", () => {
  // fingerprintFor() が使う spacesToText(false) は掲載先を含まないので、
  // 掲載先を署名の材料に入れておかないと、上段・下段の欄が総入れ替えに
  // なっても署名が一致したまま書き足しが別の荷物の欄に貼りつく
  const hash = new Function(functionSource("sheetEditHash") + "; return sheetEditHash;")();
  const sigFrom = new Function(
    "sheetEditHash",
    functionSource("sheetEditSigFrom") + "; return sheetEditSigFrom;"
  )(hash);

  const base = {
    fp: "fp", lots: [], sp: [],
    spacesText: "軒下① | far | v | 1 | 3,3 | bottom",
    mergeLots: true, fracMode: false, layName: "normal",
  };
  const moved = { ...base, spacesText: "軒下① | far | v | 1 | 3,3 | top" };
  assert.notEqual(sigFrom(moved), sigFrom(base));
});

test("書き足しのキーは段・位置・種別で引く", () => {
  const key = new Function(functionSource("sheetEditKey") + "; return sheetEditKey;")();
  const headKey = new Function(functionSource("sheetHeadKey") + "; return sheetHeadKey;")();

  assert.equal(key("top", 2, "name"), "top|2|name");
  assert.equal(key("bottom", 5, "note"), "bottom|5|note");
  assert.equal(key("over", 0, "pallet"), "over|0|pallet");
  assert.equal(headKey(0), "top|g0|head");
  assert.equal(headKey(1), "top|g1|head");
});

test("書き足しの値は前後の空白を落とし、空白だけなら捨てる", () => {
  const norm = new Function(
    functionSource("normalizeMarkValue") + "; return normalizeMarkValue;"
  )();

  assert.equal(norm("  部品A  "), "部品A");
  assert.equal(norm(""), "");
  assert.equal(norm("   "), "");
  assert.equal(norm("　　"), "");
  assert.equal(norm("\n\n"), "");
  assert.equal(norm(null), "");
  assert.equal(norm(undefined), "");

  assert.equal(norm(" A \n B "), "A\nB");
  assert.equal(norm("A\n\nB"), "A\nB");
  assert.equal(norm("A\n  \nB"), "A\nB");
});

test("シフトの初期値は空の書き足しを持つ", () => {
  const emptyShift = new Function(functionSource("emptyShift") + "; return emptyShift;")();
  assert.deepEqual(emptyShift().sheetEdits, { sig: "", marks: {} });
});

test("壊れた書き足しは空に落とす", () => {
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();

  assert.deepEqual(normalizeSheetEdits(null), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits("abc"), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits([]), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({}), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({ sig: 1, marks: {} }), { sig: "", marks: {} });
  assert.deepEqual(normalizeSheetEdits({ sig: "a", marks: "x" }), { sig: "a", marks: {} });

  // 文字列でない値と空文字の値は落とす
  assert.deepEqual(
    normalizeSheetEdits({ sig: "a", marks: { "top|0|name": "A", "top|1|name": 5, "top|2|name": "" } }),
    { sig: "a", marks: { "top|0|name": "A" } }
  );
});

test("署名が空なら書き足しも空にする", () => {
  // {sig:"", marks:{中身あり}} を通すと、紙にも出ず件数の案内にも出ない
  // 見えない残骸が保存に残る（activeSheetMarks も hiddenMarkCount も
  // sig が空のときは 0 を返すため）
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();
  assert.deepEqual(
    normalizeSheetEdits({ sig: "", marks: { "top|0|name": "孤児" } }),
    { sig: "", marks: {} }
  );
});

test("シフトの正規化は書き足しを通す", () => {
  const normalizeSheetEdits = new Function(
    functionSource("normalizeSheetEdits") + "; return normalizeSheetEdits;"
  )();
  const normalizeShift = new Function(
    "normalizeSlip", "normalizeSnapshot", "normalizeBlocked", "emptyShift", "normalizeSheetEdits",
    functionSource("normalizeShift") + "; return normalizeShift;"
  )(
    x => x,
    () => null,
    () => [],
    () => ({ slips: [], result: null, manual: null, resultFingerprint: null, blocked: [], sheetEdits: { sig: "", marks: {} } }),
    normalizeSheetEdits
  );

  const out = normalizeShift({ sheetEdits: { sig: "s1", marks: { "top|0|name": "手書き" } } });
  assert.deepEqual(out.sheetEdits, { sig: "s1", marks: { "top|0|name": "手書き" } });
  assert.deepEqual(normalizeShift({}).sheetEdits, { sig: "", marks: {} });
});

test("署名の材料の sp は snapshotSpaces を通した形にする", () => {
  // リロードすると lastSp は clone(snapshot.sp) に hydrateBlockedRows() を
  // 掛けて復元される。hydrateBlockedRows() は全スペースの全列に blockedRows を
  // 入れるが、buildWork() が作った生の lastSp では退避スペースの列だけ
  // blockedRows を持たない。2026-09-19 の実測（サンプル9件・normal）:
  //   JSON.stringify(lastSp)                    3063 バイト
  //   JSON.stringify(復元後の lastSp)            3080 バイト  ← 一致しない
  //   JSON.stringify(snapshotSpaces(どちらも))   2536 バイト  ← 一致する
  // 生の lastSp を材料にすると、リロードした瞬間に全部の書き足しが消える
  const snapshotSpaces = new Function(
    "clone",
    functionSource("snapshotSpaces") + "; return snapshotSpaces;"
  )(v => JSON.parse(JSON.stringify(v)));
  const hydrateBlockedRows = new Function(
    "blockedRowsFor",
    functionSource("hydrateBlockedRows") + "; return hydrateBlockedRows;"
  )(() => new Set());

  // 生の lastSp を模す。退避スペースの列だけ blockedRows を持たない
  const raw = [
    { name: "メイン", cols: [{ h: 3, fills: [], blockedRows: new Set() }] },
    { name: "退避",   cols: [{ h: 4, fills: [] }] },
  ];
  // リロード後を模す。hydrateBlockedRows が全列に入れる
  const restored = JSON.parse(JSON.stringify(snapshotSpaces(raw)));
  hydrateBlockedRows(restored, []);

  // 生のままでは一致しない
  assert.notEqual(JSON.stringify(raw), JSON.stringify(restored));
  // snapshotSpaces を通せば一致する
  assert.equal(JSON.stringify(snapshotSpaces(raw)), JSON.stringify(snapshotSpaces(restored)));

  // currentSheetSig が生の lastSp を渡していないことは、この下の
  // 「署名の sp は snapshotSpaces を通す」で実装に対して固定している
});

test("署名の sp は snapshotSpaces を通す", () => {
  // 上の「署名の材料の sp は snapshotSpaces を通した形にする」で測った理由を、
  // currentSheetSig の実装そのものに対して固定する
  assert.match(functionSource("currentSheetSig"), /snapshotSpaces\(lastSp\)/);
  assert.doesNotMatch(functionSource("currentSheetSig"), /sp:\s*lastSp\b/);
});

test("書き足しがあれば自動計算の値より優先する", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A"), lot("部品B")], 2, "name", null, null,
                      "top", { "top|1|name": "手書きの品名" });
  assert.match(html, /部品A/);
  assert.match(html, /手書きの品名/);
  assert.doesNotMatch(html, />部品B</);
});

test("欄には data-ek と data-auto を付ける", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A"), lot("部品B")], 2, "name", null, null,
                      "top", { "top|1|name": "手書き" });
  const tds = html.match(/<td [^>]*>/g) || [];
  assert.equal(tds.length, 2);
  // data-ek は編集モードが OFF でも常に付ける
  assert.match(tds[0], /data-ek="top\|0\|name"/);
  assert.match(tds[1], /data-ek="top\|1\|name"/);
  // data-auto は書き足しがある欄にも、自動計算の値が入る。
  // これが無いと自動値を知るために表を描き直すことになり、
  // タップされた td が DOM から切り離されて入力欄が出なくなる
  assert.match(tds[0], /data-auto="部品A"/);
  assert.match(tds[1], /data-auto="部品B"/);
  // edited は書き足した欄だけ
  assert.doesNotMatch(tds[0], /edited/);
  assert.match(tds[1], /edited/);
});

test("空欄にも書き足しを差し込める", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");

  const html = render([], 2, "note", null, null, "top", { "top|0|note": "臨時の置き場" });
  assert.match(html, /臨時の置き場/);
  assert.match(html, /data-ek="top\|0\|note"/);
});

test("改行を含む書き足しは縦積みに組み立てる", () => {
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");

  const html = render([], 1, "lot", null, null, "top", { "top|0|lot": "L1\nL2\nL3" });
  assert.match(html, /<span class="fitcol">/);
  const inner = html.match(/<span class="fit">[^<]*<\/span>/g) || [];
  assert.equal(inner.length, 3);
  assert.match(inner[0], /L1/);
  assert.match(inner[2], /L3/);

  const one = render([], 1, "lot", null, null, "top", { "top|0|lot": "L1" });
  assert.doesNotMatch(one, /fitcol/);
});

test("書き足しを渡さなければ従来どおりの出力になる", () => {
  // slotCells を実行しているテストは位置引数で呼ぶので、tier と marks は
  // undefined になる。この経路が従来どおりであることを回帰として残す
  const render = new Function(
    "esc", "palSlotTextOf",
    functionSource("slotCells") + "; return slotCells;"
  )(v => String(v), () => "3P");
  const lot = name => ({ lot: { name, lot: "L" } });

  const html = render([lot("部品A")], 1, "name", "bb2");
  assert.match(html, /部品A/);
  assert.doesNotMatch(html, /edited/);
  // tier が無いときはキーが作れないので data-ek を付けない
  assert.doesNotMatch(html, /data-ek/);
});

test("追記欄の書き足しは gridRows を経由して届く", () => {
  // overflowTable を呼ぶのは renderSheet ではなく gridRows の中。
  // gridRows 自身も new Function で実行されるので、marks は引数で通す
  const fn = functionSource("gridRows");
  assert.match(fn, /overflowTable\(overflow,\s*marks\)/);
  const render = functionSource("renderSheet");
  assert.match(render, /gridRows\([^)]*marks\)/);
});

test("追記欄にも書き足しを差し込める。余り欄には付けない", () => {
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  )(v => String(v), () => "3P", () => "※未定");

  const entry = n => ({ lot: { name: n, lot: "L" }, areas: ["退避"], note: "※未定" });
  // 件数が奇数。右側は blank で埋まる
  const html = renderOverflow([entry("部品A")], { "over|0|name": "書き足し" });
  assert.match(html, /書き足し/);
  assert.doesNotMatch(html, />部品A</);
  assert.match(html, /data-ek="over\|0\|name"/);
  // 余り欄（blank）は荷物の欄ではないのでキーを与えない。
  // 与えると件数が1つ増えたとき埋め草が本物の欄に変わり、書き足しがずれる
  const blanks = html.match(/<td class="none"[^>]*>/g) || [];
  blanks.forEach(td => assert.doesNotMatch(td, /data-ek/));

  // 2件目にも正しい index が付く
  const two = renderOverflow([entry("A"), entry("B")], {});
  assert.match(two, /data-ek="over\|0\|name"/);
  assert.match(two, /data-ek="over\|1\|name"/);

  // 渡さなければ従来どおり
  const plain = renderOverflow([entry("部品A")]);
  assert.match(plain, />部品A</);
  assert.doesNotMatch(plain, /data-ek/);
});

test("配置表のツールバーに文字を編集するトグルを置く", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  const sheetTab = source.slice(sheetStart, sheetEnd);
  assert.match(sheetTab, /id="sheetEditBtn"[^>]*onclick="toggleSheetEditMode\(\)"/);
  assert.match(sheetTab, /✏ 文字を編集/);
});

test("編集モードの印は画面だけに出し、紙には出さない", () => {
  // 背景色はブラウザが既定で印刷しないので print-color-adjust を付けないことが
  // 紙に出さない手段になる。念のため @media print でも消す
  assert.match(source, /\.sheet td\.edited\{background:#fffbe6\}/);
  assert.match(printBlock(), /\.sheet td\.edited\{background:transparent/);
  assert.doesNotMatch(source, /td\.edited\{[^}]*print-color-adjust/);
});

test("表を描き直しても横スクロール位置を戻す", () => {
  // .sheet ごと作り直すので、確定のたびに紙が左端へ飛ぶと
  // 右側の欄を続けて直せない（実機は幅412px・表672pxで必ず横スクロール）
  assert.match(functionSource("renderSheet"), /scrollLeft/);
});

test("表を描き直す前に編集中の入力を保存する。早期returnでも後始末する", () => {
  // onHeadChange / setArrowHead / applyDisplay / showMapState はいずれも
  // 編集中でも走り、開いている入力欄を無言で捨てる。
  // 早期 return の経路では末尾の applySheetEditMode() に届かない
  const fn = functionSource("renderSheet");
  const flushAt = fn.indexOf("flushSheetEdit()");
  const guardAt = fn.indexOf("!isActiveFresh()");
  assert.notEqual(flushAt, -1);
  assert.notEqual(guardAt, -1);
  assert.ok(flushAt < guardAt, "保存は早期 return より前に置くこと");
  assert.match(fn, /applySheetEditMode\(\)/);
  // commitSheetEdit() は renderSheet() を呼ぶので、ここから呼ぶと
  // 1回の確定で表を2回組み立てることになる
  assert.doesNotMatch(fn, /commitSheetEdit\(\)/);
});

test("あさとひるを切り替える前に編集を閉じる", () => {
  // setActiveTiming は activeTiming を切り替えた後に showMapState →
  // renderSheet を呼びうる。そこで確定すると、あさで開いていた入力が
  // ひるの marks に保存される
  const fn = functionSource("setActiveTiming");
  const exitAt = fn.indexOf("exitSheetEditMode()");
  const switchAt = fn.indexOf("activeTiming=key");
  assert.notEqual(exitAt, -1);
  assert.ok(exitAt < switchAt, "確定は activeTiming を変える前に置くこと");
});

test("セル内編集は圧縮を外し、文字の大きさに下限を置く", () => {
  // 追記欄のまとめ欄は font-size:55% ≒ 7px でそのままでは打てない。
  // 編集中だけ実用サイズに上げ、確定したら元に戻す
  assert.match(source, /\.sheet td\.editing-cell \.fit\{transform:none/);
  assert.match(source, /\.sheet td\.editing-cell (input|textarea)/);
  assert.match(source, /font-size:max\(13px,/);
});

test("セル内編集の印も画面だけに出し、紙には出さない", () => {
  // 入力欄の青い枠は背景ではないので、ブラウザの「背景を印刷しない」では消えない。
  // transform:none も残ると圧縮が外れて欄からあふれる。
  // 印刷時に editing-cell が残らないのは印刷の経路の実装頼みなので、CSS 側で断つ
  const print = printBlock();
  assert.match(print, /\.sheet td\.editing-cell input,\.sheet td\.editing-cell textarea\{border:0 !important/);
  assert.match(print, /\.sheet td\.editing-cell \.fit\{transform:revert !important\}/);
  assert.doesNotMatch(source, /td\.editing-cell[^{]*\{[^}]*print-color-adjust/);
});

test("IMEの変換確定のEnterで欄を閉じない", () => {
  // Android Chrome では変換確定の Enter が keydown に届く。
  // e.key === "Enter" だけで判定すると変換しただけで閉じる
  assert.match(functionSource("openInlineEditor"), /isComposing/);
});

test("欄は mousedown で開く", () => {
  // click を待つと、前の欄の blur → commitSheetEdit → renderSheet で
  // DOM が総入れ替えになり、mouseup の時点でクリック対象が消えている。
  // 別の欄へ移るのに2タップ必要になる
  assert.match(source, /addEventListener\("mousedown",[\s\S]{0,400}?data-ek/);
});

test("自動計算の値は data-auto から読む", () => {
  // 表を描き直して読もうとすると、タップされた td が DOM から切り離されて
  // 入力欄が出ず、focus() も効かない。しかもこれが起きるのは
  // 「すでに書き足した欄をもう一度直す」＝最も普通の用途
  const fn = functionSource("openInlineEditor");
  assert.match(fn, /dataset\.auto/);
  assert.doesNotMatch(fn, /renderSheet\(\)/);
});

test("書き足しは空文字か自動計算値と同じならキーを消す", () => {
  const norm = new Function(
    functionSource("normalizeMarkValue") + "; return normalizeMarkValue;"
  )();
  const save = new Function(
    "activeShift", "saveSchedule", "normalizeMarkValue", "ensureSheetEditSig",
    functionSource("saveSheetMark") + "; return saveSheetMark;"
  );
  const shift = { sheetEdits: { sig: "s1", marks: { "top|0|name": "既存" } } };
  const run = save(() => shift, () => {}, norm, () => true);

  run("top|0|name", "", "自動値");
  assert.equal(shift.sheetEdits.marks["top|0|name"], undefined);

  shift.sheetEdits.marks["top|1|name"] = "何か";
  run("top|1|name", "  自動値  ", "自動値");
  assert.equal(shift.sheetEdits.marks["top|1|name"], undefined);

  run("top|2|name", "  手書き  ", "自動値");
  assert.equal(shift.sheetEdits.marks["top|2|name"], "手書き");
});

test("確定の経路に確認を挟まない", () => {
  // printSheet と beforeprint が exitSheetEditMode → flushSheetEdit →
  // saveSheetMark と辿る。ここで confirm を出すと紙が白紙になる
  assert.doesNotMatch(functionSource("saveSheetMark"), /confirm\(/);
  assert.doesNotMatch(functionSource("flushSheetEdit"), /confirm\(/);
  assert.doesNotMatch(functionSource("exitSheetEditMode"), /confirm\(/);
});

test("欄を開くときは、描き直したあとの td をキーで引き直す", () => {
  // openSheetEditor は先頭で commitSheetEdit() を呼ぶ。そこで renderSheet() が
  // 走ると、引数で受け取った td は DOM から切り離される
  // （isConnected===false）。切り離されたノードに入力欄を差し込んでも
  // 画面に出ず focus() も効かない。編集中に別の欄をタップする＝最も普通の
  // 操作で必ず起きる
  const fn = functionSource("openSheetEditor");
  const keyAt = fn.indexOf("td.dataset.ek");
  const commitAt = fn.indexOf("commitSheetEdit()");
  assert.notEqual(keyAt, -1);
  assert.notEqual(commitAt, -1);
  assert.ok(keyAt < commitAt, "キーは描き直す前に控えること");
  assert.match(fn, /querySelector\('#sheetView td\[data-ek="'\s*\+\s*key/);
  // 引数の td をそのまま渡していないこと
  assert.doesNotMatch(fn, /open(Bar|Inline)Editor\(td\)/);
});

test("見出しの欄キーは sheetHeadKey と同じ形にする", () => {
  // renderSheet は見出しのキーをその場で組み立てる（文字列照合されるだけの
  // 関数なので sheetHeadKey() を呼んでもよいが、Task 3 はインラインで書いた）。
  // sheetHeadKey 側だけ変えても誰も落ちず、見出しの編集が静かに効かなくなる
  assert.match(functionSource("renderSheet"), /\["top","g"\+i,"head"\]\.join\("\|"\)/);
});

test("スマホ用の編集バーを配置表タブに置く", () => {
  const sheetStart = source.indexOf('<div id="tab-sheet"');
  const sheetEnd = source.indexOf('<!-- ===== 設定タブ', sheetStart);
  const sheetTab = source.slice(sheetStart, sheetEnd);
  assert.match(sheetTab, /id="sheetEditBar"/);
  assert.match(sheetTab, /id="sheetEditInput"/);
  assert.match(sheetTab, /id="sheetEditLabel"/);
  assert.match(sheetTab, /onclick="commitSheetEdit\(\)"/);
  assert.match(sheetTab, /onclick="cancelSheetEdit\(\)"/);
});

test("編集バーは hidden で隠れる", () => {
  // #sheetEditBar の display:flex は ID セレクタの作者スタイルなので
  // UA の [hidden]{display:none} に勝つ。属性セレクタを書かないと
  // bar.hidden=true が効かずバーが出っぱなしになる。
  // このリポジトリは .ac-list[hidden] など3か所で同じ回避をしている
  assert.match(source, /#sheetEditBar\[hidden\]\{display:none\}/);
});

test("編集バーはソフトキーボードの上に留まる", () => {
  // Chrome 108 以降の Android はキーボードで Layout Viewport をリサイズせず
  // Visual Viewport だけ縮める。既存の acPosition() と同じ計算を使う。
  // 可視領域の下端に置く。上端だとハイライトした td をバーが覆いうる
  const fn = functionSource("positionSheetEditBar");
  assert.match(fn, /visualViewport/);
  assert.match(fn, /offsetTop/);
  assert.match(fn, /height/);
});

test("編集バーは印刷しない", () => {
  assert.match(printBlock(), /#sheetEditBar/);
});

test("幅で方式を分け、両方の入力欄を同時に置かない", () => {
  // 非表示側の要素に focus() を呼んでも何も起きない（2026-08-27 の教訓）
  const fn = functionSource("openSheetEditor");
  assert.match(fn, /compactInputMq\.matches/);
  assert.match(fn, /openBarEditor/);
  assert.match(fn, /openInlineEditor/);
});

test("欄を開く入口は mousedown だけ。touchstart を足さない", () => {
  // タッチでも touchstart のあと合成の mousedown が発火する。両方に登録すると
  // 同じ欄で openSheetEditor が2回走り、2回目は mousedown ハンドラの
  // preventDefault() を通らないまま既定のフォーカス移動が起きて、
  // 開いたばかりの入力欄から blur ＝確定してしまう
  const opens = source.match(/addEventListener\("(mousedown|touchstart)"[\s\S]{0,400}?data-ek/g) || [];
  assert.equal(opens.length, 1, "欄を開くリスナは1つだけ");
  assert.match(opens[0], /mousedown/);
});

test("確認なしで書き足しを捨てる設定を置く", () => {
  assert.match(source, /sheetEditSilent:"palletApp\.sheetEditSilent"/);
  const cfgStart = source.indexOf('<div id="cfgpane-display"');
  const pane = source.slice(cfgStart, cfgStart + 4000);
  assert.match(pane, /id="sheetEditSilentChk"[^>]*onchange="toggleSheetEditSilent\(\)"/);
  assert.match(pane, /確認なしで書き足しを捨てる/);
});

test("署名が合わない状態で書き始めたら古い書き足しを捨てる", () => {
  const ensure = new Function(
    "activeShift", "currentSheetSig", "sheetEditSilent", "confirm", "saveSchedule",
    functionSource("ensureSheetEditSig") + "; return ensureSheetEditSig;"
  );

  // 署名が合っていれば何もしない
  const same = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => same, () => "s1", false, () => false, () => {})(), true);
  assert.deepEqual(same.sheetEdits.marks, { "top|0|name": "A" });

  // 署名が違い、確認で OK なら marks を空にして新しい署名にする
  const diff = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => diff, () => "s2", false, () => true, () => {})(), true);
  assert.deepEqual(diff.sheetEdits.marks, {});
  assert.equal(diff.sheetEdits.sig, "s2");

  // キャンセルなら何も変えず false（欄を開かない）
  const kept = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  assert.equal(ensure(() => kept, () => "s2", false, () => false, () => {})(), false);
  assert.deepEqual(kept.sheetEdits.marks, { "top|0|name": "A" });

  // 設定が ON なら確認せずに捨てる
  const silent = { sheetEdits: { sig: "s1", marks: { "top|0|name": "A" } } };
  let asked = false;
  assert.equal(ensure(() => silent, () => "s2", true, () => { asked = true; return false; }, () => {})(), true);
  assert.equal(asked, false);
  assert.deepEqual(silent.sheetEdits.marks, {});

  // 書き足しが元から空なら確認せずに署名だけ更新する
  const empty = { sheetEdits: { sig: "s1", marks: {} } };
  let asked2 = false;
  assert.equal(ensure(() => empty, () => "s2", false, () => { asked2 = true; return false; }, () => {})(), true);
  assert.equal(asked2, false);
  assert.equal(empty.sheetEdits.sig, "s2");
});

test("確認は欄を開くときに出す。確定の経路には置かない", () => {
  // 確定側に置くと printSheet / beforeprint → exitSheetEditMode →
  // flushSheetEdit → confirm となり、紙が白紙になる
  assert.match(functionSource("openSheetEditor"), /ensureSheetEditSig\(\)/);
  assert.doesNotMatch(functionSource("saveSheetMark"), /ensureSheetEditSig/);
  assert.doesNotMatch(functionSource("flushSheetEdit"), /confirm\(/);
});

test("紙に出ていない書き足しの件数を画面に知らせる", () => {
  // #sheetMsg は印刷CSSで display:none なので紙には出ない
  const fn = functionSource("fitSheetText");
  assert.match(fn, /前の配置に対する書き足し/);
  assert.match(fn, /dropHiddenMarks\(\)/);
});

test("案内は innerHTML への代入より前で組む", () => {
  // fitSheetText は末尾で box.innerHTML = html と上書きし、applyDisplay からも
  // 呼ばれる。renderSheet の末尾で後から足すと、表示設定を触った瞬間に消える
  const fn = functionSource("fitSheetText");
  const assignAt = fn.lastIndexOf("box.innerHTML=html");
  const noticeAt = fn.indexOf("前の配置に対する書き足し");
  assert.notEqual(assignAt, -1);
  assert.notEqual(noticeAt, -1);
  assert.ok(noticeAt < assignAt);
});

test("書き足しであふれたときは書き足しを短くするよう案内する", () => {
  // 既存の「品名を短くしてください」「エリア名を短くしてください」は
  // 書き足し由来のあふれには当てはまらない
  const fn = functionSource("fitSheetText");
  assert.match(fn, /書き足した文字を短くしてください/);
  // 既存の2つの文言と条件には触れない
  assert.match(fn, /品名を短くしてください/);
  assert.match(fn, /エリア名を短くしてください/);
});

test("自分で押す破棄は設定にかかわらず確認する", () => {
  const fn = functionSource("dropHiddenMarks");
  assert.match(fn, /confirm\(/);
  assert.doesNotMatch(fn, /sheetEditSilent/);
});
