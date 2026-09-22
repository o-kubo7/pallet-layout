const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// files/index.html から1つの関数の本文を切り出す。
// tests/sheet-placement.test.js の同名ヘルパーと同じ実装。
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
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}") { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`${name} must be balanced`);
}

test("紙の欄を指す語を「追記欄」に統一する", () => {
  // 荷物の側の「あふれ」「あふれ受け」は残す。紙の欄の呼び名だけを直す
  assert.doesNotMatch(source, /あふれブロック/);
  assert.match(source, /配置図の追記欄にも記載できない項目があります/);
  assert.match(source, /あふれ受け\(出庫口横・5棟壁際\)/);
});

test("掲載先 over のラベルは実態に合わせて「掲載しない」にする", () => {
  // over は「配置の対象から外し、紙にも出さない」であって追記欄とは別物
  assert.match(source, /over＝掲載しない/);
  assert.match(source, /掲載先を「掲載しない」にした次のエリアには、新しく荷物を置きません/);
});

test("退避スペースの中身から紙の欄を作る", () => {
  const fn = functionSource("stashSlots");
  // 退避エリアだけを見る
  assert.match(fn, /stashSpaces\(/);
  // 注釈はエリア名ではなく固定の文言
  assert.match(fn, /※未定/);
  // 後続の分岐が見る目印
  assert.match(fn, /stash:\s*true/);
  // 通常の欄と同じくまとめる。まとめない設定にも従う
  assert.match(fn, /mergeLots/);
  assert.match(fn, /mergeEntries\(/);
});

test("退避の欄を上段の欄の末尾に連結する", () => {
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /sheetSlots\("top"\)\.concat\(stashSlots\(\)\)/);
});

test("下段へ回した退避の欄は注釈を作り直さない", () => {
  // slotAreaNote() を通すと ※退避 に化ける
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /e\.stash\s*\?\s*e\.note\s*:\s*slotAreaNote\(e\.areas\)/);
});

test("追記欄には欄数超過を先に入れ、退避の欄を後ろへ回す", () => {
  const fn = functionSource("sheetPlacement");
  assert.match(fn, /omittedTop\.filter\(e=>!e\.stash\)/);
  assert.match(fn, /droppedOther, omittedTop\.filter\(e=>e\.stash\)/);
});

test("追記欄は4件までそのまま載せ、5件以上で4枠目にまとめる", () => {
  const fn = functionSource("arrangeOverflowSlots");
  // 追記欄を2列にしたので枠は4つある。4件以内は1件ずつ通常の欄に載る
  assert.match(fn, /entries\.length<=4/);
  // 5件以上は4枠目を group にする
  assert.match(fn, /group:\s*entries\.slice\(3\)/);
  // 紙に出ない項目は出さない
  assert.match(fn, /unlisted:\s*\[\]/);
});

test("まとめ欄は品名・ロット・パレット数を縦積みで書く", () => {
  const fn = functionSource("overflowTable");
  assert.match(fn, /e\.group\s*\|\|\s*\[e\]/);
  assert.match(fn, /fitcol/);
});

test("まとめ欄の注記は重複を畳む", () => {
  // 注記が3件あっても ※未定 は1回だけ書く
  const fn = functionSource("overflowTable");
  assert.match(fn, /new Set\(/);
});

test("あふれた分を退避スペースへ入れる", () => {
  const fn = functionSource("run");
  assert.match(fn, /l\.rem>0/);
  assert.match(fn, /putToStash\(lastSp,\s*l\.id,/);
  // 前回の退避を積み戻したあとに置く（先に置くと前回分の居場所を食う）
  const back = fn.indexOf("putToStash(lastSp,l.id,l.stashed)");
  const auto = fn.indexOf("l.rem>0");
  assert.ok(back !== -1 && auto !== -1 && back < auto,
    "あふれの投入は退避の積み戻しより後に置くこと");
});

test("まとめ欄は値が空でも4列の行数をそろえる", () => {
  // ロット番号の無い荷物が混ざると、その列だけ行が繰り上がって
  // 品名と別の件のロット番号が横並びになる。空欄でも1行を残すこと
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  );
  const entry = (name, lot) => ({ lot: { name, lot }, areas: ["退避"], note: "※未定" });
  const html = renderOverflow(
    value => String(value),
    () => "3P",
    () => "※未定"
  )([
    { group: [entry("部品A", "L1"), entry("部品B", ""), entry("部品C", "L3")] },
  ]);
  const cellOf = kind => {
    const m = html.match(new RegExp(`<td class="[^"]*c-${kind}[^"]*"[^>]*>([\\s\\S]*?)</td>`));
    assert.ok(m, `${kind} の欄があること`);
    return m[1];
  };
  const rowsOf = kind => cellOf(kind).match(/<span class="fit">([\s\S]*?)<\/span>/g) || [];
  const names = rowsOf("name"), lots = rowsOf("lot");
  assert.equal(names.length, 3);
  assert.equal(lots.length, 3);
  // 3件目どうしが同じ行に来る＝列が対応している
  assert.match(names[2], /部品C/);
  assert.match(lots[2], /L3/);
  // 2件目のロットは空だが行は残る
  assert.doesNotMatch(lots[1], /L3/);
});

test("退避の実効容量はその日の入力総パレット数から数える", () => {
  const fn = functionSource("stashFreeRoom");
  // 列数では数えない。列は repackStash() が中身から決める
  assert.match(fn, /stashCapacity\(/);
  assert.match(fn, /stashTotal\(/);
  assert.doesNotMatch(fn, /STASH_MAX_COLS/);
});

test("退避にも入りきらない分は知らせる", () => {
  const fn = functionSource("run");
  assert.match(fn, /noRoom/);
  const render = functionSource("renderResult");
  assert.match(render, /退避スペースに入りきらない荷物があります/);
});

test("退避に荷物が残る日は「すべてのパレットを配置しました」を出さない", () => {
  const fn = functionSource("renderResult");
  assert.match(fn, /倉庫に置く分はすべて配置しました/);
});

test("退避の知らせは紙に載ることを伝える", () => {
  const fn = functionSource("renderResult");
  assert.match(fn, /配置図に「未定」として載ります/);
  assert.doesNotMatch(fn, /配置図の表には出ません。倉庫内・倉庫外へ戻してください/);
});

test("タブボタンは leaveEdit を通す", () => {
  assert.match(source, /id="tabbtn-input" onclick="leaveEdit\('input'\)"/);
  assert.match(source, /id="tabbtn-edit" onclick="leaveEdit\('edit'\)"/);
  assert.match(source, /id="tabbtn-sheet" onclick="leaveEdit\('sheet'\)"/);
  assert.match(source, /id="tabbtn-settings" onclick="leaveEdit\('settings'\)"/);
});

test("印刷の経路には確認を挟まない", () => {
  // printSheet() と beforeprint は switchTab を直に呼ぶ。
  // ここに confirm が入ると紙が白紙になる
  const fn = functionSource("printSheet");
  assert.match(fn, /switchTab\('sheet'\)/);
  assert.doesNotMatch(fn, /leaveEdit/);
  const sw = functionSource("switchTab");
  assert.doesNotMatch(sw, /confirm\(/);
});

test("退避に荷物が残る日だけ確認する", () => {
  const fn = functionSource("leaveEdit");
  assert.match(fn, /stashTotal\(lastSp\)/);
  assert.match(fn, /name!=="edit"/);
  assert.match(fn, /confirm\(/);
  assert.match(fn, /配置図に「未定」として載ります/);
});

test("まとめ欄の td には roll クラスを付ける", () => {
  const fn = functionSource("overflowTable");
  // 1項目の欄には付けない。まとめ欄だけを縮める目印。
  // if(e.group){...}else{ の中、まとめ欄の autoInner を組み立てた直後に
  // cls+=" roll"; が来ることを見る（else 側に付いても素通りしないように
  // 順序つきで、if(e.group) のブロック内に限定して照合する）。
  // 書き足しを足したときに inner → autoInner へ改名した。inner は
  // 「書き足しがあればそちら、無ければ autoInner」を入れる変数になっている
  assert.match(
    fn,
    /if\(e\.group\)\{[\s\S]*?autoInner=`<span class="fitcol">\$\{vals\.map\(span\)\.join\(""\)\}<\/span>`;\s*cls\+=" roll";\s*\}else\{/
  );
});

test("まとめ欄は注記を除いて文字と行間を詰める", () => {
  // 件数だけ縦に伸びるのは品名・ロット・P数の3列。注記は重複を畳むので伸びない。
  // 注記まで縮めると、隣の通常の欄と同じ文言なのに大きさだけ違って見える
  assert.match(source, /\.sheet \.overflow-table td\.roll:not\(\.c-note\)\{padding:0\}/);
  assert.match(source, /\.sheet \.overflow-table td\.roll:not\(\.c-note\) \.fit\{font-size:55%;line-height:1\.05\}/);
});

test("荷物が多い日の様式は18列×39pxで上段6欄・下段9欄", () => {
  // 紙の総幅を 672→702px に広げ、欄を1列ぶん増やす。
  // 1欄は2列ぶんなので、18列なら下段9欄、日付ブロック5列と空1列を除いた上段は6欄
  assert.match(source, /wide:\s*\{cols:18,\s*colW:39,\s*top:6,\s*bottom:9\}/);
  assert.match(source, /width:702px;min-width:702px;max-width:702px/);
});

test("追記欄は1行に2欄ずつ並べる", () => {
  // 18列だと追記欄は4列ぶん（156px）取れる。78px×2列に割ると
  // 1欄の幅が下段の通常欄と同じになり、まとめ欄へ落ちる件数が減る
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  );
  const entry = (name, lot) => ({ lot: { name, lot }, areas: ["メイン"] });
  const html = renderOverflow(
    value => String(value),
    () => "4P",
    areas => `※${areas.join("・")}`
  )([entry("品目1", "L-1"), entry("品目2", "L-2"), entry("品目3", "L-3"), entry("品目4", "L-4")]);

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  const nameRows = rows.filter(r => /c-name/.test(r));
  assert.equal(nameRows.length, 2, "4欄なら品名の行は2本（1行に2欄ずつ）");
  for (const row of nameRows) {
    assert.equal((row.match(/<td/g) || []).length, 2, "1行に td が2つ並ぶこと");
  }
  // 1行目に1件目と2件目、2行目に3件目と4件目が来る
  assert.match(nameRows[0], /品目1[\s\S]*品目2/);
  assert.match(nameRows[1], /品目3[\s\S]*品目4/);
  // 2行のあいだに隙間の行が入る
  assert.match(html, /class="overflow-gap"/);
});

test("追記欄の欄数が奇数なら右側を空欄にする", () => {
  // 空の td を置かないと、表が崩れて残り1件が横に広がる
  const renderOverflow = new Function(
    "esc", "palSlotTextOf", "slotAreaNote",
    functionSource("overflowTable") + "; return overflowTable;"
  );
  const entry = (name, lot) => ({ lot: { name, lot }, areas: ["メイン"] });
  const html = renderOverflow(
    value => String(value),
    () => "4P",
    areas => `※${areas.join("・")}`
  )([entry("品目1", "L-1"), entry("品目2", "L-2"), entry("品目3", "L-3")]);

  const nameRows = (html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []).filter(r => /c-name/.test(r));
  assert.equal(nameRows.length, 2);
  assert.equal((nameRows[1].match(/<td/g) || []).length, 2, "3件目の行にも td が2つあること");
  assert.match(nameRows[1], /品目3/);
  assert.match(nameRows[1], /class="none"/, "余った側は罫線の無い空欄にすること");
});
