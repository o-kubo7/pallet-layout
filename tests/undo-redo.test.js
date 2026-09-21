const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 関数をソースから切り出す。既存テスト（tests/sheet-placement.test.js:339）と同じ実装。
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

// 履歴の5関数をまとめて取り出して動かす。上限は定数なのでソースから読む。
function loadHistory() {
  const limit = source.match(/const HISTORY_LIMIT\s*=\s*(\d+)/);
  assert.notEqual(limit, null, "HISTORY_LIMIT must exist");
  const src = `const HISTORY_LIMIT=${limit[1]};`
    + functionSource("historyMake")
    + functionSource("historyPush")
    + functionSource("historyUndo")
    + functionSource("historyRedo")
    + functionSource("historyCanUndo")
    + functionSource("historyCanRedo")
    + "; return {HISTORY_LIMIT, historyMake, historyPush, historyUndo, historyRedo,"
    + " historyCanUndo, historyCanRedo};";
  return new Function(src)();
}

const step = (kind, tag) => ({kind, tag, sel:{lotId:null, cells:[]}, sp:[tag]});

test("新しい履歴は空でカーソルが -1", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.deepEqual(h.steps, []);
  assert.equal(h.cursor, -1);
});

test("push するとカーソルが末尾に進む", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(h.steps.length, 1);
  assert.equal(h.cursor, 0);
  H.historyPush(h, step("move", "b"));
  assert.equal(h.steps.length, 2);
  assert.equal(h.cursor, 1);
});

test("undo はひとつ前のステップを返す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  const got = H.historyUndo(h);
  assert.equal(got.tag, "a");
  assert.equal(h.cursor, 0);
});

test("redo は戻したステップに進み直す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  H.historyUndo(h);
  const got = H.historyRedo(h);
  assert.equal(got.tag, "b");
  assert.equal(h.cursor, 1);
});

test("先頭で undo しても何も返さずカーソルも動かない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyUndo(h), null);
  assert.equal(h.cursor, 0);
});

test("末尾で redo しても何も返さずカーソルも動かない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyRedo(h), null);
  assert.equal(h.cursor, 0);
});

test("空の履歴で undo と redo を呼んでも壊れない", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.equal(H.historyUndo(h), null);
  assert.equal(H.historyRedo(h), null);
  assert.equal(h.cursor, -1);
  assert.equal(h.steps.length, 0);
});

test("undo した後に push すると、やり直せる分が捨てられる", () => {
  const H = loadHistory();
  const h = H.historyMake();
  H.historyPush(h, step("move", "a"));
  H.historyPush(h, step("move", "b"));
  H.historyPush(h, step("move", "c"));
  H.historyUndo(h);                       // cursor=1（b）
  H.historyPush(h, step("move", "d"));
  assert.deepEqual(h.steps.map(s => s.tag), ["a", "b", "d"]);
  assert.equal(h.cursor, 2);
  assert.equal(H.historyCanRedo(h), false);
});

test("上限を超えると古いほうから落ち、カーソルも詰まる", () => {
  const H = loadHistory();
  const h = H.historyMake();
  for (let i = 0; i < H.HISTORY_LIMIT + 5; i++) H.historyPush(h, step("move", "s" + i));
  assert.equal(h.steps.length, H.HISTORY_LIMIT);
  assert.equal(h.cursor, H.HISTORY_LIMIT - 1);
  assert.equal(h.steps[0].tag, "s5");
  assert.equal(h.steps[h.steps.length - 1].tag, "s" + (H.HISTORY_LIMIT + 4));
});

test("上限で落ちた後も undo が正しいステップを返す", () => {
  const H = loadHistory();
  const h = H.historyMake();
  for (let i = 0; i < H.HISTORY_LIMIT + 1; i++) H.historyPush(h, step("move", "s" + i));
  // s0 が落ちて s1..sN が残る。末尾は sN なので、ひとつ戻ると s(N-1)
  const got = H.historyUndo(h);
  assert.equal(got.tag, "s" + (H.HISTORY_LIMIT - 1));
});

test("canUndo と canRedo が境界で正しい", () => {
  const H = loadHistory();
  const h = H.historyMake();
  assert.equal(H.historyCanUndo(h), false);
  assert.equal(H.historyCanRedo(h), false);
  H.historyPush(h, step("move", "a"));
  assert.equal(H.historyCanUndo(h), false);   // 1件だけなら戻れない
  H.historyPush(h, step("move", "b"));
  assert.equal(H.historyCanUndo(h), true);
  assert.equal(H.historyCanRedo(h), false);
  H.historyUndo(h);
  assert.equal(H.historyCanRedo(h), true);
});

test("履歴はあさ・ひるで別々に持つ", () => {
  assert.match(source, /let histories\s*=\s*\{\s*am:historyMake\(\)\s*,\s*pm:historyMake\(\)\s*\}/);
  assert.match(source, /function activeHistory\(\)\{[^}]*histories\[activeTiming\]/);
});

test("選択は配列に写して履歴へ入れる", () => {
  // sel.cells は Set。履歴には配列で入れ、戻すときに new Set() で復元する
  const fn = functionSource("selSnapshot");
  assert.match(fn, /lotId:\s*sel\.lotId/);
  assert.match(fn, /cells:\s*\[\.\.\.sel\.cells\]/);
});

test("移動のステップは新しい sp を持ち、選択のステップは前の sp を使い回す", () => {
  const move = functionSource("pushMoveStep");
  assert.match(move, /kind:"move"/);
  // 移動後の配置をそのまま持つ（呼ぶ側が控えた spBefore ではない）
  assert.match(move, /snapshotSpaces\(lastSp\)/);

  const sel = functionSource("pushSelectStep");
  assert.match(sel, /kind:"select"/);
  // 履歴が空のときの土台だけは実配置を控える。それ以外ではコピーしない（設計書 §4）
  assert.equal((sel.match(/snapshotSpaces\(/g) || []).length, 1);
  assert.match(sel, /currentStepSp\(\)\s*\|\|/);
  assert.match(sel, /currentStepSp\(\)/);
});

test("移動のステップは移動前の配置も積む", () => {
  // 1件目で戻れないと「動かした直後に戻す」ができない。
  // 履歴が空のときは、移動前の配置を先に1件積んでから移動後を積む。
  const fn = functionSource("pushMoveStep");
  assert.match(fn, /spBefore/);
});

test("履歴を捨てる関数がある", () => {
  const fn = functionSource("clearHistory");
  assert.match(fn, /historyMake\(\)/);
});

test("履歴の適用は配置をコピーしてから載せる", () => {
  const fn = functionSource("applyHistoryStep");
  // steps に入っている配列をそのまま lastSp にすると、以後の操作が履歴を壊す
  assert.match(fn, /lastSp\s*=\s*clone\(step\.sp\)/);
});

test("履歴の適用は配置不可をいまの値から合成する", () => {
  // 配置不可は履歴に持たない。戻した配置にいまの blocked を混ぜる
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /hydrateBlockedRows\(lastSp,\s*activeShift\(\)\.blocked\)/);
});

test("履歴の適用は選択を Set に戻す", () => {
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /sel\.cells\s*=\s*new Set\(/);
  assert.match(fn, /sel\.lotId\s*=/);
});

test("履歴の適用は手動調整の保存と描き直しまでやる", () => {
  const fn = functionSource("applyHistoryStep");
  assert.match(fn, /saveManual\(\)/);
  assert.match(fn, /redraw\(\)/);
});

test("入力が変わっていたら履歴を捨てて何もしない", () => {
  // 伝票を書き換えると isActiveFresh() が false になる。そのまま戻すと
  // saveManual() も redraw() も弾かれ、配置ごと消える
  assert.match(functionSource("historyUsable"), /isActiveFresh\(\)/);
  const u = functionSource("doUndo");
  assert.match(u, /historyUsable\(\)/);
  assert.match(u, /clearHistory\(\)/);
});

test("戻すと進むは履歴の関数を呼ぶ", () => {
  assert.match(functionSource("doUndo"), /historyUndo\(activeHistory\(\)\)/);
  assert.match(functionSource("doRedo"), /historyRedo\(activeHistory\(\)\)/);
});

test("履歴の適用は redraw のあとに選択を戻す", () => {
  // drawZone が clearSel() を呼ぶので、redraw より前に戻した選択は消える
  const fn = functionSource("applyHistoryStep");
  const redrawAt = fn.indexOf("redraw()");
  const selAt = fn.indexOf("sel.cells = new Set(");
  const paintAt = fn.indexOf("repaintSel()");
  assert.notEqual(redrawAt, -1);
  assert.notEqual(selAt, -1);
  assert.notEqual(paintAt, -1);
  assert.ok(redrawAt < selAt, "redraw() より前に選択を戻している");
  assert.ok(selAt < paintAt, "repaintSel() より後に選択を戻している");
});

test("移動は lastSp を差し替える前に配置を控える", () => {
  // かつては growStashCol が lastSp の列を直接書き換えていたため、
  // 検証より前に控えないと「列が伸びた後の状態」しか戻せなかった
  // （このテストは元は growStashCol を基準にしていた）。
  // 退避への移動を専用の経路（applyMoveToStash）に切り出し、退避スペース全体を
  // 落とし先にしたことで growStashCol 自体が無くなり、lastSp が検証の前に
  // 書き換わる状態そのものが消えた。ただし「控えるのは書き換えより前」という
  // 不変条件は変わらず両方の経路に残るので、lastSp=v.next を基準に見る。
  ["applyMove", "applyMoveToStash"].forEach(name => {
    const fn = functionSource(name);
    const before = fn.indexOf("snapshotSpaces(lastSp)");
    const assign = fn.indexOf("lastSp=v.next");
    assert.notEqual(before, -1, `${name}: 移動前の配置を控えていない`);
    assert.notEqual(assign, -1, `${name}: lastSp を差し替えていない`);
    assert.ok(before < assign, `${name}: 控えるのが lastSp の差し替えより後になっている`);
  });
});

test("移動後のステップは選択を空で積む", () => {
  // 移動前の選択を持たせると、やり直したときに荷物の無いマスのキーが戻り、
  // 帯に「NP」だけが出る実体のない選択になる
  const fn = functionSource("pushMoveStep");
  assert.match(fn, /sel:\{lotId:null,\s*cells:\[\]\}/);
  // 土台（動かす前）のステップには、動かす前の選択を持たせる
  assert.match(fn, /sel:selBefore/);
});

test("移動が確定してから履歴に積む", () => {
  // 退避への移動も同じ順序を守る必要がある（applyMoveToStash も同じ後始末を持つ）
  ["applyMove", "applyMoveToStash"].forEach(name => {
    const fn = functionSource(name);
    const assign = fn.indexOf("lastSp=v.next");
    const push = fn.indexOf("pushMoveStep(");
    assert.ok(assign !== -1 && push !== -1, `${name}: 差し替えか履歴の呼び出しが無い`);
    assert.ok(assign < push, `${name}: 配置が確定する前に積んでいる`);
  });
});

test("タップの選択を履歴に積む", () => {
  const fn = functionSource("toggleCell");
  assert.match(fn, /pushSelectStep\(\)/);
  // intent==="single" の枝でも積む（どちらも選択が変わるため）
  assert.equal((fn.match(/pushSelectStep\(\)/g) || []).length, 2);
});

test("なぞりと矩形はストロークが成立したときだけ積む", () => {
  const sweep = functionSource("endSweep");
  assert.match(sweep, /sweep\.started/);
  assert.match(sweep, /pushSelectStep\(\)/);
  const rubber = functionSource("endRubber");
  assert.match(rubber, /started/);
  assert.match(rubber, /pushSelectStep\(\)/);
});

test("自動配置は履歴を捨てる", () => {
  assert.match(functionSource("run"), /clearHistory\(\)/);
});

test("時間帯の切替では履歴を捨てない", () => {
  // あさ・ひるで別々に持つので、切り替えただけで消してはいけない
  assert.equal(functionSource("setActiveTiming").includes("clearHistory()"), false);
});

test("帯の古い中身を消す", () => {
  assert.equal(source.includes('id="flagClearBtn"'), false);
  assert.equal(source.includes('id="sweepUndoBtn"'), false);
  assert.equal(source.includes("sweepUndo"), false);
  assert.equal(source.includes("undoSweep"), false);
  // 説明文は帯に出さない
  assert.equal(source.includes("toolFlagText"), false);
  // 説明文が無くなると「案内 表示／非表示」は制御対象を失う
  assert.equal(source.includes("navShow"), false);
  assert.equal(source.includes("setNav"), false);
});

test("帯に戻すと進むのボタンを置く", () => {
  assert.match(source, /<button[^>]*id="undoBtn"[^>]*onclick="doUndo\(\)"/);
  assert.match(source, /<button[^>]*id="redoBtn"[^>]*onclick="doRedo\(\)"/);
  // 記号だけでも読み上げと長押しで意味が分かるようにする
  assert.match(source, /id="undoBtn"[^>]*aria-label="元に戻す"/);
  assert.match(source, /id="redoBtn"[^>]*aria-label="やり直す"/);
});

test("ボタンは入れ物にまとめて帯の左端に置く", () => {
  // 選択数の文言が「3P」「3P 選択中」「3P 運搬中」と伸び縮みしても
  // ボタンの位置が動かないようにする。押し間違えを防ぐのが目的
  const css = source.match(/\.flagbtns\{[^}]*\}/);
  assert.notEqual(css, null, ".flagbtns の指定がない");
  assert.match(css[0], /flex:none/);
  // 右端に寄せる指定は外した。左端は帯の justify-content:flex-start で決まる
  assert.equal(css[0].includes("margin-left:auto"), false);
  const btn = source.match(/\.flagbtns button\{[^}]*\}/);
  assert.notEqual(btn, null);
  assert.match(btn[0], /min-width:44px/);
  // マークアップも .flagbtns が選択数より先に来ること
  const flag = source.match(/<div class="toolflag" id="toolFlag">[\s\S]*?<\/div>/);
  assert.notEqual(flag, null);
  assert.ok(flag[0].indexOf('class="flagbtns"') < flag[0].indexOf('id="toolFlagCount"'),
    "マークアップでボタンが選択数より後ろにある");
});

test("帯は中身ぶんの幅にし、--flagwidth は上限としてだけ使う", () => {
  // width に入れると「3P」と小さなボタン2個しか無くても #editCard の端まで
  // 伸びて横に間延びする（1024px で 554px、中身は 216.6px しかない）
  const css = source.match(/\.toolflag\{position:fixed[\s\S]*?\}/);
  assert.notEqual(css, null);
  assert.match(css[0], /width:max-content/);
  assert.match(css[0], /max-width:var\(--flagwidth/);
  // max-width: の一部を拾わないよう直前の1文字も見る
  assert.equal(/[^-]width:var\(--flagwidth/.test(css[0]), false);
  // PC 幅の ⚙ 回避も width ではなく上限
  assert.match(source, /max-width:calc\(var\(--flagwidth,600px\) - 134px\)/);
  // ここも max-width: の一部を拾わないよう直前の1文字を見る
  assert.equal(/[^-]width:calc\(var\(--flagwidth,600px\) - 134px\)/.test(source), false);
});

test("帯は折り返さず、選択数のほうが縮む", () => {
  // wrap のままだと、幅が足りないときに選択数が縮まずに折り返し、
  // ボタンが2行目へ回って 38px 跳ねる（実測）
  const wrap = source.match(/\n  \.toolflag\{flex-wrap:nowrap\}/);
  assert.notEqual(wrap, null, "@media の外に .toolflag{flex-wrap:nowrap} がない");
  const css = source.match(/\.toolflag \.flagcount\{[^}]*\}/);
  assert.notEqual(css, null);
  // width:max-content の帯では基準を 0 にすると意図が濁る。
  // ふだんは中身ぶん、上限に当たったときだけ縮む
  assert.match(css[0], /flex:0 1 auto/);
  assert.match(css[0], /min-width:0/);
  assert.match(css[0], /text-overflow:ellipsis/);
});

test("選択数に絵文字を使わない", () => {
  const fn = functionSource("updateFlag");
  assert.equal(fn.includes("✋"), false);
  // 数字から先に書く。帯が狭いと後ろから … で切れるため
  assert.match(fn, /n\+"P"/);
  assert.match(fn, /n\+"P 運搬中"/);
});

test("押せないときは消さずに disabled にする", () => {
  const fn = functionSource("updateFlag");
  assert.match(fn, /historyCanUndo\(activeHistory\(\)\)/);
  assert.match(fn, /historyCanRedo\(activeHistory\(\)\)/);
  assert.match(fn, /\.disabled\s*=/);
  // 消すと位置がずれて押し間違える
  assert.equal(/undoBtn[^\n]*style\.display/.test(fn), false);
});

test("履歴があるときは選択が無くても帯を出す", () => {
  const fn = functionSource("updateFlag");
  // 移動の直後は選択が解除される。そこで帯が消えると「戻す」を押せない。
  // n===0 だけで消していないか（§7-3 の退行）を直接見る
  assert.match(fn, /if\(n===0 && !canU && !canR\)/);
});

test("ボタンに文字を付ける設定が設定タブにある", () => {
  const settings = source.slice(
    source.indexOf('<div id="tab-settings"'),
    source.indexOf('<div class="actionbar"')
  );
  assert.match(settings, /id="undoLabelChk"/);
  assert.match(settings, /onchange="toggleUndoLabel\(\)"/);
});

test("ボタンの文字の設定はこの端末に保存する", () => {
  assert.match(source, /undoLabel:"palletApp\.undoLabel"/);
  assert.match(source, /saveData\(STORE_KEY\.undoLabel/);
  assert.match(source, /loadData\(STORE_KEY\.undoLabel\)/);
});

test("文字を付けても aria-label は変えない", () => {
  const fn = functionSource("applyUndoLabel") + functionSource("fillUndoBtn");
  // ボタンの中身だけ差し替える。読み上げと長押しの説明はどちらでも同じ
  assert.match(fn, /textContent/);
  assert.equal(fn.includes("aria-label"), false);
});

test("記号のときと文字のときの両方の表記がある", () => {
  const fn = functionSource("applyUndoLabel");
  assert.match(fn, /"↩"/);
  assert.match(fn, /"↪"/);
  assert.match(fn, /"戻す"/);
  assert.match(fn, /"進む"/);
});

test("矢印は span.ar に入れて矢印だけ大きくする", () => {
  // textContent へ "↩ 戻す" と入れると矢印と「戻す」が同じ大きさになる。
  // 矢印だけ 20px にするため、矢印を別の要素にする
  const fn = functionSource("fillUndoBtn");
  assert.match(fn, /className="ar"/);
  assert.match(fn, /createElement\("span"\)/);
  // 文字を足すときも矢印は span のまま（innerHTML でまとめて入れない）
  assert.match(fn, /createTextNode/);
  assert.equal(fn.includes("innerHTML"), false);
  const css = source.match(/\.flagundo \.ar\{[^}]*\}/);
  assert.notEqual(css, null, ".flagundo .ar の指定がない");
  assert.match(css[0], /font-size:20px/);
  // 20px の行送りでボタンの高さが増えないようにする
  assert.match(css[0], /line-height:1/);
  // マークアップ側の初期値にも span.ar を入れておく
  assert.match(source, /id="undoBtn"[\s\S]*?<span class="ar">↩<\/span>/);
  assert.match(source, /id="redoBtn"[\s\S]*?<span class="ar">↪<\/span>/);
});

test("PC 幅では選択数に「選択中」まで出す", () => {
  const fn = functionSource("updateFlag");
  // 判定は CSS の PC 分岐と同じ 700px。ずれると文言だけ先に変わる
  assert.match(fn, /matchMedia\("\(min-width:700px\)"\)/);
  assert.match(fn, /"P 選択中"/);
  assert.match(fn, /"P 運搬中"/);
});

test("選択数が入りきらないときは実測して消す", () => {
  // 必要量は文言（「3P」「3P 選択中」「12P 運搬中」）とボタンの太さ
  // （記号 98px・文字 161.8px）の両方で変わり、画面の幅だけでは決まらない。
  // 実測（選択3P、必要量＝帯の左右padding 24 ＋ボタン＋gap 10 ＋文言）:
  //   記号  「3P」169.9  「3P 運搬中」216.6
  //   文字  「3P」233.7  「3P 選択中」280.4
  // 帯の上限は 375px→186.3 / 412px→211.0 / 500px→270.0 / 1024px→554.0。
  // 記号のままでも 375・412px では「運搬中」が入らない。
  const fn = functionSource("fitFlagCount");
  // 上限は帯の max-width をそのまま読む。PC 幅では ⚙ のぶん 134px 引いた値で
  // 上書きされるので、--flagwidth を直接見ると PC 幅だけ過大になる
  assert.match(fn, /parseFloat\(cs\.maxWidth\)/);
  assert.match(fn, /paddingLeft/);
  assert.match(fn, /columnGap/);
  assert.match(fn, /c\.hidden = need>cap/);
  // 文言が空のときは :empty が消す。ここで hidden を立てると戻らなくなる
  assert.match(fn, /if\(!c\.textContent\)\{ c\.hidden=false; return; \}/);
  // updateFlag から必ず通る
  assert.match(functionSource("updateFlag"), /fitFlagCount\(\)/);
  // 幅の境を CSS に書く方式はやめた
  assert.equal(source.includes(".toolflag.lbl"), false);
});

test("選択数の幅は使い回す控えで測る", () => {
  // 測るたびに DOM を作ると増え続ける。.flagcount を付けて本物と同じ
  // font-size・font-weight・padding にし、帯の外に置いて縮まない幅を出す
  const fn = functionSource("flagCountWidth");
  assert.match(fn, /if\(!flagProbe\)/);
  assert.match(fn, /className="flagcount"/);
  assert.match(fn, /visibility:hidden/);
  assert.match(fn, /white-space:nowrap/);
});

test("履歴を積んだ関数が帯を描き直す", () => {
  // 呼ぶ側に任せると必ず漏れる（実測）。toggleCell() は showSelCount()（中で
  // updateFlag）を先に呼んでから積むため、帯はいつも1操作ぶん古い履歴を映す。
  // 最初の1マスを選んだときは積む前の cursor が -1 で historyCanUndo が false に
  // なり、履歴は cursor:1 まで正しく積まれているのに「戻す」が押せないまま残った。
  // endRubber() と endSweep() は pushSelectStep() が最後の文で、なぞり終わりに
  // 描き直す機会がそもそも無かった。
  const sel = functionSource("pushSelectStep");
  const mv = functionSource("pushMoveStep");
  assert.match(sel, /updateFlag\(\);?\s*\}\s*$/, "pushSelectStep の最後で updateFlag していない");
  assert.match(mv, /updateFlag\(\)/, "pushMoveStep で updateFlag していない");
  // 積む前に返る経路では呼ばない（履歴が変わっていないため）
  assert.match(sel, /if\(!sp\) return;/);
});

test("選択を積む3つの入口はすべて pushSelectStep を通る", () => {
  // 描き直しを pushSelectStep に持たせたので、ここを通らない入口があると
  // また帯だけが古いままになる
  assert.match(functionSource("toggleCell"), /pushSelectStep\(\)/);
  assert.match(functionSource("endRubber"), /pushSelectStep\(\)/);
  assert.match(functionSource("endSweep"), /pushSelectStep\(\)/);
});
