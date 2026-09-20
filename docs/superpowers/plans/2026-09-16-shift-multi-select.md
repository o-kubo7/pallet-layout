# Shift による複数選択 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置編集の選択操作を Finder のデスクトップと同じ形にする。マウスでは余白からドラッグして矩形選択、Shift+クリックで追加選択。指の操作は 1 つも変えない。

**Architecture:** 「どの入力で、どこを掴んだか」を判定する純粋関数を 4 つ切り出し、既存の `pointerdown` / `click` ハンドラはその判定に従って分岐するだけにする。判定は DOM に触れないので `node:test` で検証できる。矩形の当たり判定は画面座標（`getBoundingClientRect()`）の重なりで行い、論理座標（列 index × 行 index）は使わない。盤の描画は `column-reverse` や `flip` で論理順と画面順が一致しないため。

**Tech Stack:** 素の HTML / CSS / JavaScript の 1 ファイル（`files/index.html`）。テストは `node:test`（`functionSource()` で関数本体を抜き出して `new Function` で実行する方式 + ソース文字列の正規表現マッチ）。

**Spec:** `docs/superpowers/specs/2026-09-16-shift-multi-select-design.md`

## Global Constraints

- 変更するのは `files/index.html`、`files/sw.js`、`tests/sheet-placement.test.js` の 3 つだけ
- **指（`pointerType!=="mouse"`）の操作は 1 つも変えない。** なぞり選択・タップのトグル・余白でのスクロールをすべて従来どおり残す
- 1 度に選べるのは 1 ロットのまま（`sel.lotId` の仕組みを変えない）
- **倉庫のマスと退避のマスを混ぜない。** 退避スペースは `#zone-stash`（`.floor.stashfloor` の中）と `#zone-stash-mini`（`#stashDock` の中）の 2 か所に描かれ、`cellKey()` は両方 `退避|…` で同一（`files/index.html:667, 697, 2332, 2334`）
- 矩形選択中に盤を**自動**スクロールしない。ただしホイール等で盤は動きうるので、マスの位置は `pointermove` のたびに測り直す
- 矩形は `document.body` に `position:fixed` で置く。`#mapBody` に `position` を足さない（`stashDock` の `sticky` と `float` に影響するため）
- `files/sw.js` の `CACHE_VERSION` を `v50` → `v51` に上げる（Task 6）
- テストの実行: `node --test tests/sheet-placement.test.js`
- 行番号は 5073 行時点のもの。着手時に `grep` で取り直すこと

## この計画がいちばん気をつけること

**純粋関数のテストが通っても、呼び出し側がその関数を使っていなければ何も起きていません。**

過去に同じ失敗があります（`~/claude-lessons/lessons.md` の [2026-08-23]）。
そのため各タスクで、純粋関数のテストに加えて
**呼び出し側のソースに実際の呼び出しが入っていること**を正規表現で確認します。

さらに、この機能はポインタイベントが主役でブラウザでしか本当の動きを確認できません。
Task 6 で実ブラウザと実機の検証を必ず行います。そこまでは「動いた」と言いません。

### すでに一度見つかった落とし穴

計画を `/dig` に掛けて見つかった、**実装すれば必ず壊れる**箇所です。
対応は各タスクに織り込み済みですが、実装中に元の形へ戻さないよう注意してください。

| # | 落とし穴 | 対応 |
|---|---|---|
| 1 | `pointerdown` で先に `selAdd()` すると、直後の `click` が同じマスを見て選択を消す | 選択はしきい値（6px）を超えてから。Task 2 |
| 2 | `clearSel()` は内部で `hideSweepUndo()` を呼び `sweepUndo` を捨てる。先に `clearSel()` すると取り消しが空を復元する | 控えを `clearSel()` の前に取る。Task 3 |
| 3 | 退避スペースは 2 か所に描かれる。`closest("#stashDock")` では切り分けられない | `#zone-stash, #zone-stash-mini` で判定。Task 3 |
| 4 | `setPointerCapture` が無いと、ウィンドウ外でボタンを離したとき `pointerup` が届かず盤が固まる（復帰はリロードのみ） | capture を掛ける。Task 3 |

## ファイル構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `files/index.html` | アプリ本体 | 判定関数 4 つを追加、`pointerdown` / `pointermove` / `pointerup` / `click` / `keydown` の分岐を差し替え、矩形の CSS とボタン文言を追加 |
| `files/sw.js` | PWA キャッシュ | `CACHE_VERSION` を上げるだけ |
| `tests/sheet-placement.test.js` | テスト | 判定関数のテストと、呼び出し側のソース確認を追記 |

判定関数は既存の選択まわり（`sel` / `selAdd` / `selDel`）のすぐ上、
`function toggleCell(` の直前に固めて置きます。

---

### Task 0: 判定ロジックを純粋関数として置く

この時点では既存のハンドラから呼びません。関数を置いてテストするだけです。
分岐の仕様をここで固定し、以降のタスクは「その仕様どおりに呼ぶ」だけにします。

**Files:**
- Modify: `files/index.html`（`function toggleCell(` の直前に挿入）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `rectsOverlap(a, b)` → `boolean`。`a` / `b` は `{left,right,top,bottom}`
  - `clickIntent(shiftKey, detail, lastPointerType)` → `"single"` | `"toggle"`
  - `pointerIntent(pointerType, hasLot, onSel)` → `"carry"` | `"carryOne"` | `"rubber"` | `"sweepUndecided"` | `"sweepPick"` | `"none"`
  - `cellsInRect(cells, rect, lockedLot)` → `{lotId, keys}`。`cells` は `{key, lotId, rect}` の配列

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-placement.test.js` の既存テスト群の末尾（`function functionSource(name)` の定義の直前）に足します。

```javascript
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`rectsOverlap must exist` で 4 件とも落ちる

- [ ] **Step 3: 判定関数を置く**

`files/index.html` の `// 1マス目でロットが決まり、以降は同じロットのマスしか選べない。`
というコメント（現在 2839 行付近、`function toggleCell(` の直前）の手前に入れます。

```javascript
/* ---------- 選択操作の判定 ----------
   どの入力で、どこを掴んだかだけを見て「何を始めるか」を決める。
   DOM に触れないので node:test から呼べる。 */

// 2つの矩形が重なるか。辺が接するだけは重なりに数えない。
// 数えると、マスとマスの隙間に矩形を置いただけで両側が選ばれてしまう。
function rectsOverlap(a,b){
  return a.left<b.right && b.left<a.right && a.top<b.bottom && b.top<a.bottom;
}

// click したとき何をするか。
// detail===0 はキーボード（Enter / Space）由来で、pointerdown が先行しない。
// 控えてある lastPointerType は前の操作のまま残っているので当てにしない。
function clickIntent(shiftKey, detail, lastPointerType){
  if(detail===0) return "toggle";                  // キーボード
  if(lastPointerType!=="mouse") return "toggle";   // 指・ペン・不明
  return shiftKey ? "toggle" : "single";
}

// pointerdown したとき何を始めるか。
//   carry          … 選択中の全マスを運ぶ
//   carryOne       … 掴んだ1マスだけを選んで運ぶ
//   rubber         … 矩形選択
//   sweepUndecided … 既存のなぞり（外すか運ぶか未定）
//   sweepPick      … 既存のなぞり（拾う）
//   none           … 何も始めない（余白。指はここで盤をスクロールする）
function pointerIntent(pointerType, hasLot, onSel){
  const mouse = pointerType==="mouse";
  if(onSel) return mouse ? "carry" : "sweepUndecided";
  if(mouse) return hasLot ? "carryOne" : "rubber";
  return hasLot ? "sweepPick" : "none";
}

// 矩形に重なるマスを選ぶ。cells は {key, lotId, rect} の配列。
// lockedLot に値があればそのロットだけを拾う。固定中のロットが1マスも
// 入らなくなったら null を返し、呼び出し側が固定を解けるようにする
// （次の pointermove で、そこに居る別のロットへ付け替わる）。
function cellsInRect(cells, rect, lockedLot){
  const hit=cells.filter(c=>rectsOverlap(c.rect, rect));
  if(!hit.length) return {lotId:null, keys:[]};
  const lot = lockedLot!=null ? lockedLot : hit[0].lotId;
  const keys = hit.filter(c=>c.lotId===lot).map(c=>c.key);
  if(!keys.length) return {lotId:null, keys:[]};
  return {lotId:lot, keys:keys};
}
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（既存のテストもすべて通ること）

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 選択操作の判定を純粋関数に切り出す

矩形の重なり・click の意図・pointerdown の意図・矩形に入るマスの選別を
DOM から独立させ、node:test で検証できるようにする。
呼び出しは後続のタスクで差し替える。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: click をマウス・指・キーボードで分ける

マウスの Shift 無しクリックを単独選択にします。指とキーボードは従来どおりトグルのままです。

**単独選択は「前の選択を捨てて 1 マスだけ選ぶ」だけです。**
同じマスをもう一度クリックしても外れません（Finder と同じ）。
外すのは Shift+クリックの役目です。

**Files:**
- Modify: `files/index.html`（`toggleCell`（2840 付近）、`click` ハンドラ（2853 付近）、配置不可編集の `pointerdown`（2871 付近））
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `clickIntent(shiftKey, detail, lastPointerType)`（Task 0）
- Produces:
  - `lastPointerType`（モジュール変数。直前の `pointerdown` の `e.pointerType`）
  - `toggleCell(cellEl, intent)` — `intent` は `"single"` または `"toggle"`。省略時は `"toggle"`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`toggleCell` の引数が 1 つのままで正規表現に合わない

- [ ] **Step 3: 実装する**

まず `lastPointerType` を、`let sel={lotId:null, cells:new Set()};`（2824 付近）のすぐ下に足します。

```javascript
// click イベントは pointerType を持たないので、直前の pointerdown で控えておく。
// キーボード（Enter / Space）の click には pointerdown が先行せず、ここが
// 前の操作のまま残る。clickIntent が e.detail===0 で弾く。
let lastPointerType=null;
```

次に `toggleCell` を差し替えます。

```javascript
// 1マス目でロットが決まり、以降は同じロットのマスしか選べない。
// intent="single" は前の選択を捨てて1マスだけ選ぶ（マウスの Shift 無しクリック）。
//   同じマスをもう一度クリックしても外れない。外すのは Shift+クリック。
// intent="toggle" は従来どおり足す／外す（指のタップ、Shift+クリック、キーボード）。
function toggleCell(cellEl, intent){
  if(cellEl.dataset.lot==null) return;          // 空マスは選べない
  const id=parseInt(cellEl.dataset.lot);
  if(intent==="single"){
    clearSel();
    sel.lotId=id;
    sel.cells.add(cellKey(cellEl));
    cellEl.classList.add("sel");
    showSelCount();
    hideSweepUndo();
    return;
  }
  if(sel.lotId==null) sel.lotId=id;
  else if(sel.lotId!==id) return;               // 別ロットのマスは無視する
  const k=cellKey(cellEl);
  if(sel.cells.has(k)){ sel.cells.delete(k); cellEl.classList.remove("sel"); }
  else { sel.cells.add(k); cellEl.classList.add("sel"); }
  if(sel.cells.size===0) sel.lotId=null;
  showSelCount();
  hideSweepUndo();          // タップで選び直したら、なぞりの取り消しは出さない
}
```

`click` ハンドラの末尾（2866〜2868 付近）を差し替えます。

```javascript
  const c=e.target.closest(".cell"); if(!c) return;
  if(!c.closest("#mapBody")) return;
  const intent=clickIntent(e.shiftKey, e.detail, lastPointerType);
  toggleCell(c, intent);
});
```

最後に、`pointerdown` で `lastPointerType` を控えます。
配置不可編集用の `pointerdown`（2871 付近）の**先頭**、`if(!blockedEditMode ...)` より前に入れます。
早期 return より前に置かないと、通常モードのときに控えられません。

```javascript
document.addEventListener("pointerdown",e=>{
  lastPointerType=e.pointerType;
  if(!blockedEditMode || e.button!=null && e.button!==0) return;
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: マウスのクリックを単独選択にする

指のタップとキーボードの Enter / Space は従来どおりトグルのまま残す。
click は pointerType を持たないので直前の pointerdown で控え、
キーボード由来は e.detail===0 で弾く。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: マウスで荷物マスを掴んだら運搬にする

マウスのなぞり選択を外し、`pointerIntent` の判定に従わせます。
指の経路（`sweepPick` / `sweepUndecided` / `none`）は今までと同じ結果になります。

**`carryOne` の選択は `pointerdown` ではなく、しきい値（6px）を超えてから行います。**
`pointerdown` で選ぶと、動かさずに離したときに飛ぶ `click` が
「すでに選ばれている同じマス」を見ることになり、単独選択と噛み合いません。
既存の `mode:"pick"` が `selAdd(sweep.target)` を呼ぶ位置と同じです。

**Files:**
- Modify: `files/index.html`（ロット移動の `pointerdown`（3677 付近）と `pointermove`（3693 付近））
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `pointerIntent(pointerType, hasLot, onSel)`（Task 0）、`toMove(x,y)`、`selAdd(c)`、`clearSel()`（既存）
- Produces:
  - `rubber`（モジュール変数。Task 3 で中身が入る）
  - `startRubber(e)`（Task 3 で中身が入る）
  - `sweep.straightToMove` / `sweep.carryOne`（マウスの運搬を表す印）

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`pointerIntent` の呼び出しが無い

- [ ] **Step 3: `rubber` の置き場所を先に作る**

`let sweepUndo=null;`（3514 付近）の下に足します。中身は Task 3 で入れます。

```javascript
let rubber=null;                 // 矩形選択。中身は下の「矩形選択」節で作る
function startRubber(e){}        // 仮。Task 3 で実装する
```

- [ ] **Step 4: `pointerdown` を差し替える**

3677 付近のハンドラ全体を差し替えます。
`if(c.dataset.lot==null) return;`（空マスからは始めない）の行は**消します**。
空マスは矩形選択の開始点になるためです。

```javascript
document.addEventListener("pointerdown",e=>{
  if(blockedEditMode) return;
  if(sweep||drag||rubber) return;
  if(!moveMode) return;
  if(e.button!=null && e.button!==0) return;
  const c=e.target.closest(".cell");
  // 余白から始めることがあるので、マスが無くても #mapBody の中なら通す
  if(!e.target.closest || !e.target.closest("#mapBody")) return;
  const onSel = !!c && c.classList.contains("sel");
  const intent = pointerIntent(e.pointerType, !!c && c.dataset.lot!=null, onSel);

  if(intent==="none") return;                   // 指の余白。盤のスクロールに譲る

  if(intent==="rubber"){ startRubber(e); return; }

  if(intent==="carry" || intent==="carryOne"){
    // マウスは「外すか運ぶか」を迷わない。掴んだらそのまま運ぶ。
    // carryOne の選択はしきい値を超えてから（pointermove 側）。ここで選ぶと
    // 動かさずに離したときの click が「選択済みの同じマス」を見てしまう。
    sweep={id:e.pointerId, x0:e.clientX, y0:e.clientY, started:false, target:c,
           mode:null, erased:[], lotId0:sel.lotId,
           straightToMove:true, carryOne:intent==="carryOne"};
    return;
  }

  // 指のなぞり。従来どおり。
  sweep={id:e.pointerId, x0:e.clientX, y0:e.clientY, started:false, target:c,
         mode: intent==="sweepPick" ? "pick" : null,
         erased:[], lotId0:sel.lotId};
});
```

`tool` 変数と `setTool()` は残したままです。いまは誰も読まなくなりますが、
配置不可エリアの設定で「いま何を選んでいるのか」の切り替えに使う予定があります
（`files/index.html:3505` 付近のコメント）。将来必要になったら
`pointerIntent` に引数を足してください。

- [ ] **Step 5: `pointermove` に運搬の入口を足す**

3693 付近の `if(!sweep.started){ ... }` ブロックの**中**、
`if(sweep.mode==="pick") selAdd(sweep.target);` の直後に 1 行足し、
ブロックを抜けた直後にもう 1 行足します。

```javascript
  if(!sweep.started){
    if(Math.abs(e.clientX-sweep.x0)<6 && Math.abs(e.clientY-sweep.y0)<6) return;
    sweep.started=true;
    dragMoved=true;                               // 直後の click で選択を戻さない
    sweepUndo={lotId:sel.lotId, cells:[...sel.cells]};
    try{ sweep.target.setPointerCapture(sweep.id); }catch(err){}
    if(sweep.mode==="pick") selAdd(sweep.target);
    if(sweep.carryOne){ clearSel(); selAdd(sweep.target); }
  }
  // マウスで掴んだら、外すか運ぶかを迷わずそのまま運ぶ
  if(sweep.straightToMove){ toMove(e.clientX,e.clientY); return; }
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: マウスで荷物マスを掴んだら運搬に入る

マウスのなぞり選択を外し、pointerIntent の判定に従わせる。
未選択のマスを掴んだ場合は、しきい値を超えた時点でその1マスを選んでから運ぶ。
指のなぞり・余白でのスクロールは従来どおり。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 盤と退避スペースの矩形選択（ラバーバンド）

余白と空マスから引く矩形を実装します。Shift を押しながらなら今の選択に足します。

**Files:**
- Modify: `files/index.html`（CSS に `.rubberbox`、Task 2 で置いた `rubber` / `startRubber` の差し替え、`pointermove` / `pointerup` / `pointercancel` / `keydown` の分岐）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `cellsInRect`、`rectsOverlap`（Task 0）、`cellKey`、`clearSel`、`repaintSel`、`showSweepUndo`、`hideSweepUndo`、`afterSelChange`（既存）
- Produces:
  - `rubberCells(stashSide)` → `{key, lotId, rect, el}` の配列
  - `startRubber(e)` / `moveRubber(e)` / `endRubber()` / `cancelRubber()`

- [ ] **Step 1: 失敗するテストを書く**

```javascript
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`rubberCells must exist`

- [ ] **Step 3: CSS を足す**

`.cell.sel{...}`（147 付近）の下に入れます。

```css
  /* 矩形選択の枠。position:fixed で画面座標のまま置く。
     #mapBody に position を足すと stashDock の sticky と float に響くため。 */
  .rubberbox{position:fixed;z-index:70;pointer-events:none;
             border:1px solid #1d4ed8;background:rgba(29,78,216,.12);border-radius:2px}
```

- [ ] **Step 4: 矩形選択の本体を書く**

Task 2 で置いた `let rubber=null;` と `function startRubber(e){}` の 2 行を、
次のまとまりで置き換えます。

```javascript
/* ---------- 矩形選択（ラバーバンド） ----------
   マウスでだけ動く。当たり判定は画面座標（getBoundingClientRect）の重なり。
   論理座標（列 index × 行 index）は使えない。盤は .col が column-reverse で
   row=0 が下端、PC横は flip と off で列位置を JS 側から反転しており、
   論理の並びと画面の並びが一致しないため（設計書 §3-1）。 */
let rubber=null;   // {id,x0,y0,started,box,lotId,base,stashSide,undo,capture}

/* 矩形の対象になるマスを集める。
   退避スペースは画面の2か所に描かれている（files/index.html:667, 697）。
   #zone-stash-mini は右上のドックの中、#zone-stash は .floor.stashfloor の中で
   #stashDock の外にある。cellKey は両方 "退避|…" で同じなので、
   2つをまとめて「退避側」として扱う。#stashDock だけを見ると、
   フロアに描かれたほうが倉庫のマスに混ざってしまう。 */
function rubberCells(stashSide){
  const out=[];
  document.querySelectorAll("#mapBody .cell[data-lot]").forEach(el=>{
    const stash=!!el.closest("#zone-stash, #zone-stash-mini");
    if(stash!==stashSide) return;
    out.push({key:cellKey(el), lotId:parseInt(el.dataset.lot),
              rect:el.getBoundingClientRect(), el:el});
  });
  return out;
}

function startRubber(e){
  const stashSide=!!e.target.closest("#zone-stash, #zone-stash-mini");
  // clearSel() は中で hideSweepUndo() を呼んで sweepUndo を捨てる。
  // 取り消し用の控えは、その前に取らないと空を復元することになる。
  const undo={lotId:sel.lotId, cells:[...sel.cells]};
  // Shift を押していても、盤と退避のあいだでは足さない。混ざった選択は
  // 運搬でも「倉庫へ戻す」でも成立しない（設計書 §3-3）。
  const selSide = sel.cells.size ? [...sel.cells][0].split("|")[0]==="退避" : stashSide;
  const keep = e.shiftKey && selSide===stashSide;
  if(!keep) clearSel();
  rubber={id:e.pointerId, x0:e.clientX, y0:e.clientY, started:false, box:null,
          lotId:keep?sel.lotId:null, base:keep?[...sel.cells]:[],
          baseLot:keep?sel.lotId:null, stashSide:stashSide, undo:undo, capture:null};
  // 捕捉しないと、ウィンドウの外でボタンを離したとき pointerup が届かず、
  // 枠が残ったまま rubber が居座って以後のクリックが全部無視される。
  try{ e.target.setPointerCapture(e.pointerId); rubber.capture=e.target; }catch(err){}
}

function moveRubber(e){
  if(!rubber.started){
    // 既存のドラッグ判定と同じしきい値。超えなければクリック扱いのまま。
    if(Math.abs(e.clientX-rubber.x0)<6 && Math.abs(e.clientY-rubber.y0)<6) return;
    rubber.started=true;
    dragMoved=true;                        // 直後の click で選択を戻さない
    sweepUndo={lotId:rubber.undo.lotId, cells:rubber.undo.cells};
    // .cell にしか user-select:none が無いので、余白から引くと見出しが反転する
    document.body.style.userSelect="none";
    rubber.box=document.createElement("div");
    rubber.box.className="rubberbox";
    document.body.appendChild(rubber.box);
  }
  const r={left:Math.min(rubber.x0,e.clientX), right:Math.max(rubber.x0,e.clientX),
           top:Math.min(rubber.y0,e.clientY), bottom:Math.max(rubber.y0,e.clientY)};
  rubber.box.style.left=r.left+"px";
  rubber.box.style.top=r.top+"px";
  rubber.box.style.width=(r.right-r.left)+"px";
  rubber.box.style.height=(r.bottom-r.top)+"px";

  // マスの位置は毎回測り直す。自動スクロールは入れていないが、ホイールや
  // スクロールバーで盤は動くし、退避ドックは選択が生まれた瞬間に
  // 「◀ 倉庫へ戻す」が出て中身が縮む（設計書 §3-4）。
  const res=cellsInRect(rubberCells(rubber.stashSide), r, rubber.lotId);
  // 固定中のロットが抜けたら null が返り、次の move でそこに居るロットへ移る。
  rubber.lotId = res.lotId!=null ? res.lotId : rubber.baseLot;

  sel.cells=new Set(rubber.base);
  res.keys.forEach(k=>sel.cells.add(k));
  sel.lotId = sel.cells.size ? rubber.lotId : null;
  repaintSel();          // 中で showSelCount() → updateFlag() まで面倒を見る
}

function releaseRubber(){
  if(rubber && rubber.box) rubber.box.remove();
  if(rubber && rubber.capture){
    try{ rubber.capture.releasePointerCapture(rubber.id); }catch(err){}
  }
  document.body.style.userSelect="";
}

function endRubber(){
  if(!rubber) return;
  const started=rubber.started;
  releaseRubber();
  rubber=null;
  if(started && sweepUndo) showSweepUndo();
}

// 引き始めてからやめる逃げ道。Escape で引く前の選択に戻す。
function cancelRubber(){
  if(!rubber) return;
  const undo=rubber.undo;
  releaseRubber();
  rubber=null;
  sel.lotId=undo.lotId;
  sel.cells=new Set(undo.cells);
  repaintSel();
  hideSweepUndo();
}
```

- [ ] **Step 5: ハンドラから呼ぶ**

`pointermove`（3693 付近）の先頭、`if(!sweep || e.pointerId!==sweep.id) return;` の**前**に足します。

```javascript
document.addEventListener("pointermove",e=>{
  if(blockedEditMode) return;
  if(rubber && e.pointerId===rubber.id){ moveRubber(e); return; }
  if(!sweep || e.pointerId!==sweep.id) return;
```

`pointerup` / `pointercancel` / `lostpointercapture`（3745〜3747 付近）を差し替えます。

```javascript
document.addEventListener("pointerup",e=>{
  if(rubber && e.pointerId===rubber.id) endRubber();
  if(sweep && e.pointerId===sweep.id) endSweep();
});
document.addEventListener("pointercancel",e=>{
  if(rubber && e.pointerId===rubber.id) endRubber();
  if(sweep && e.pointerId===sweep.id) endSweep();
});
document.addEventListener("lostpointercapture",e=>{
  if(rubber && e.pointerId===rubber.id) endRubber();
  if(sweep && e.pointerId===sweep.id) endSweep();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape" && rubber) cancelRubber();
});
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 余白から引く矩形選択を足す

当たり判定は画面座標の重なりで行う。論理座標は column-reverse と flip で
画面の並びと一致しないため使わない。退避スペースは2か所に描かれるので
#zone-stash と #zone-stash-mini でまとめて切り分け、倉庫のマスと混ぜない。
ポインタを捕捉し、Escape と後始末で盤が固まらないようにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 矩形を始めない場所を決める

`#mapBody` の中にはマスと余白のほかに、押すためのものが入っています。
掴んだつもりが矩形選択に化けると押せなくなるので、そこでは始めません。

**Files:**
- Modify: `files/index.html`（Task 2 で書いた `pointerdown`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `startRubber(e)`（Task 3）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```javascript
test("ボタンと帯と見出しの上では矩形を始めない", () => {
  const start = source.indexOf('  if(sweep||drag||rubber) return;\n  if(!moveMode) return;');
  assert.notEqual(start, -1);
  const end = source.indexOf('document.addEventListener("pointermove",e=>{\n  if(blockedEditMode) return;', start);
  const handler = source.slice(start, end);
  assert.match(handler, /closest\("button, ?\.toolflag, ?\.sb-head"\)/);
  // ドックの中だからという理由では除外しない（退避側でも矩形は引ける）
  assert.doesNotMatch(handler, /closest\("#stashDock"\) return/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 実装する**

Task 2 で書いた `pointerdown` の、`const onSel = ...` の**前**に足します。

```javascript
  // 押すものの上では何も始めない。ドックの「⤢」「◀ 倉庫へ戻す」、
  // 盤の上端に貼りつく帯、ドックの見出しを掴んでも選択が消えないようにする。
  if(!c && e.target.closest("button, .toolflag, .sb-head")) return;
```

マスの上（`c` がある）ではこの判定を通しません。マスがボタンの中に
入ることはなく、通すと運搬が始められなくなるためです。

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
fix: ボタンと帯と見出しの上では矩形選択を始めない

掴んだつもりが矩形に化けると押せなくなるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 取り消しボタンの文言を選択全体に合わせる

矩形選択のあとにも同じボタンが出るため、「なぞり」に限定した文言を変えます。

**Files:**
- Modify: `files/index.html`（679 付近のボタン）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `sweepUndo`、`showSweepUndo()`、`undoSweep()`（既存）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```javascript
test("取り消しボタンはなぞり以外の選択にも使える文言にする", () => {
  assert.match(source, /id="sweepUndoBtn"[\s\S]{0,200}↩ いまの選択を取り消す/);
  assert.doesNotMatch(source, /↩ いまのなぞりを取り消す/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: 実装する**

679 付近のボタンの文言を変えます。

```html
          <button class="flagundo" id="sweepUndoBtn" style="display:none"
                  onclick="undoSweep()">↩ いまの選択を取り消す</button>
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
fix: 取り消しボタンの文言を選択全体に合わせる

矩形選択のあとにも同じボタンが出るため、なぞりに限定した文言を改める。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: キャッシュを上げて実ブラウザと実機で確かめる

ここまでのテストはソース文字列と純粋関数しか見ていません。
**このタスクを終えるまで「動いた」と言いません。**

**Files:**
- Modify: `files/sw.js`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

既存の「Service Workerは版付きキャッシュ名を使う」テストの `v50` を `v51` に変えます。

```javascript
  assert.match(sw, /const CACHE_VERSION = "v51"/);
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL

- [ ] **Step 3: CACHE_VERSION を上げる**

`files/sw.js:6` を `const CACHE_VERSION = "v51";` にします。

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（すべてのテストが通ること）

- [ ] **Step 5: PC のブラウザで選択と運搬を確かめる**

`python3 -m http.server 8765 --directory files` で開き、配置編集タブへ進みます。
Service Worker のキャッシュを切ってから見ること（DevTools の "Update on reload"、
または登録解除。過去の教訓 [2026-07-09]）。

- [ ] 余白からドラッグ → 矩形が出て、重なった同ロットのマスが選ばれる
- [ ] 矩形を広げて別ロットに重ねる → 拾わない
- [ ] 矩形をロット A から完全に外してロット B へ移す → B に付け替わる
- [ ] 矩形を縮めて 1 マスも入らなくする → 選択が空になる
- [ ] Shift+ドラッグ → いまの選択に足される
- [ ] Shift+クリック（未選択マス）→ 足される
- [ ] Shift+クリック（選択済みマス）→ 外れる
- [ ] Shift 無しでクリック → 前の選択を捨てて 1 マスだけ選ばれる
- [ ] **同じマスをもう一度クリック → 選ばれたまま（外れない）**
- [ ] 未選択の荷物マスをドラッグ → その 1 マスが持ち上がり、離した列へ移る
- [ ] 選択済みマスをドラッグ → 選択中の全マスを運ぶ
- [ ] 矩形選択のあとに取り消しボタン → **引く前の選択へ戻る（空にならない）**

- [ ] **Step 6: 退避スペースを確かめる（2 か所とも）**

- [ ] 退避ドック内の余白からドラッグ → 退避のマスだけが選ばれる
- [ ] **退避スペースのフロア（ドックではない下側）で矩形を引く** → 退避のマスだけが選ばれる
- [ ] その矩形を盤側へはみ出させる → 倉庫のマスは拾わない
- [ ] 盤で引いた矩形をドックの下へ通す → 退避のマスは拾わない
- [ ] **盤で引いた矩形を退避スペースのフロアまで下ろす** → 退避のマスは拾わない
- [ ] 倉庫のマスを選んだ状態で退避側を Shift+ドラッグ → 混ざらない
- [ ] ドック内で矩形を引いている最中に「◀ 倉庫へ戻す」が現れても、選ばれるマスがずれない
- [ ] 退避のマスを選んで「倉庫へ戻す」→ 従来どおり動く
- [ ] ドックの「⤢」と「◀ 倉庫へ戻す」→ 矩形が出ずに押せる

- [ ] **Step 7: 取りこぼしと巻き込みを確かめる**

- [ ] 矩形を引いたままウィンドウの外でボタンを離す → 枠が消え、次のクリックが効く
- [ ] 矩形を引いている最中にホイールで盤をスクロール → 選ばれるマスがずれない
- [ ] 余白からドラッグ → 見出しの文字が青く反転しない
- [ ] 矩形を引いている最中に Escape → 引く前の選択に戻り、枠が消える
- [ ] 盤の上端の帯の文字を掴んでドラッグ → 矩形が出ず、選択も消えない

- [ ] **Step 8: キーボード経路を確かめる**

- [ ] マウスでマスをクリックして選択する（`lastPointerType` が `"mouse"` になる）
- [ ] コンソールで次を実行し、単独選択ではなくトグルになること

```javascript
const c=document.querySelector('#mapBody .cell[data-lot]');
c.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:0}));
```

- [ ] **Step 9: 実機（Pixel 9a / Android Chrome）で確かめる**

**指の操作が 1 つも変わっていないこと**を見ます。ここが最重要です。

- [ ] 荷物マスをなぞる → 通ったマスが選ばれる
- [ ] 選択の中をなぞる → 外れる
- [ ] 選択の外へドラッグ → 運搬に入る
- [ ] マスをタップ → トグル（2 マス目を足せる）
- [ ] 余白を指でなぞる → 盤がスクロールする（矩形は出ない）
- [ ] 退避ドックへドラッグ → 従来どおり退避できる
- [ ] 退避スペースのフロアでも従来どおり選べる

- [ ] **Step 10: コミット**

```bash
git add files/sw.js tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
chore: PWA キャッシュの版を上げる

インストール済みの端末へ選択操作の変更を届ける。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 完了後

すべてのタスクが終わったら、ユーザーがターミナルで実行する E2E の手順を示します。
このプロジェクトには E2E のテストランナーがないため、次の 2 つになります。

```bash
node --test tests/sheet-placement.test.js
```

```bash
python3 -m http.server 8765 --directory files
```

実機での確認は Task 6 Step 9 のチェックリストをそのまま使います。
