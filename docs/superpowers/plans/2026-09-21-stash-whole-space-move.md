# 退避スペースへの移動を「スペース全体」にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 退避スペースへ荷物を落とすとき、落とし先を1つの列ではなくスペース全体にして、22枚以上が無反応になる不具合を直す。

**Architecture:** 退避が宛先のときだけ専用経路（`applyMoveToStash()` / `validateStashMove()`）へ委譲する。倉庫側の `validateMove()` / `moveCells()` / `movingCount()` は触らない。容量の上限は定数をやめ、その日の入力総パレット数から計算する。

**Tech Stack:** 素の HTML/CSS/JavaScript（単一ファイル `files/index.html` に埋め込み）。テストは `node --test`（外部ライブラリなし）。PWA（`files/sw.js`）。

**Spec:** `docs/superpowers/specs/2026-09-21-stash-whole-space-move-design.md`

## Global Constraints

- 行番号はすべて `9604f45` 時点のもの。着手時にずれていたら周辺のコードで探すこと
- コード内のコメントは日本語。既存のコメントの語り口（「なぜそうしたか」を書く）に合わせる
- `files/index.html` を変更したら `files/sw.js` の `CACHE_VERSION` を上げる（現在 `v68` → `v69`）。上げるのは最後のタスクで1回だけ
- テストは `node --test 'tests/*.test.js'`。着手前に一度通し、**317件 全パス**を確認してから始める
- テストに運用で変わる具体値を直書きしない（倉庫総容量 178P、基本サンプルの 98P、`CACHE_VERSION` の数字）。関係や形式で検証する
- コード検索に semble MCP を使わない（`grep` / `Glob` / serena のシンボル検索を使う）
- コミットメッセージの末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を入れる
- 計画外の設計変更が必要になったら、独断で進めず停止して相談する

## ファイル構成

| ファイル | 役割 | 変更 |
|---|---|---|
| `files/index.html` | アプリ本体（埋め込み JS 約4,200行） | 修正 |
| `files/sw.js` | PWA のキャッシュ版数 | 修正（最終タスク） |
| `tests/stash-space-move.test.js` | 今回の経路のテスト | 新規 |
| `tests/stash-grow.test.js` | `growStashCol` のテスト | 削除（対象関数が消える） |
| `tests/stash-overflow.test.js` | あふれ経路のテスト | 1テストを修正 |
| `docs/superpowers/specs/2026-09-03-stash-space-and-sweep-select-design.md` | 退避スペースの設計書 | §7 を訂正 |
| `docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md` | あふれの紙面設計書 | §3-3 を訂正 |

---

### Task 1: `cloneSpaces()` を切り出す

`clone()` は JSON 経由なので `blockedRows`(Set) が消える。`validateMove()` は複製の直後に Set を貼り直しているが、同じ処理が新しい検証にも要る。先に共通化する。振る舞いは変えない。

**Files:**
- Modify: `files/index.html:3172-3177`（`validateMove` の中の複製処理）
- Create: `tests/stash-space-move.test.js`

**Interfaces:**
- Consumes: `clone(o)`（`files/index.html:6237`）
- Produces: `cloneSpaces(sp) -> spaces`。`sp` と同じ形の配列を返し、各列の `blockedRows` は独立した `Set`。元の配列とは何も共有しない

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` を新規作成する。ヘルパーは `tests/stash-grow.test.js` の同名のものと同じ実装を使う。

```js
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

function constant(name) {
  const m = source.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  assert.notEqual(m, null, `${name} must exist`);
  return m[1];
}

/* 本体から関数だけを取り出して動かす。names に挙げた関数はすべて本物を使う。
   関数宣言は巻き上げられるので、names の順番は結果に影響しない。 */
function load(names, { spaces = [], lots = [] } = {}) {
  const src = `
    const STASH_COL_H=${constant("STASH_COL_H")};
    let lastSp=spaces, lastLots=lots;
    ${names.map(functionSource).join("\n")}
    return { ${names.join(", ")}, spaces: () => lastSp };
  `;
  return new Function("spaces", "lots", src)(spaces, lots);
}

test("cloneSpaces は blockedRows を Set のまま複製する", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const sp = [{ name: "棟A", cols: [{ h: 4, fills: [], blockedRows: new Set([1, 2]) }] }];
  const next = cloneSpaces(sp);
  assert.ok(next[0].cols[0].blockedRows instanceof Set, "Set が復元されていない");
  assert.deepEqual([...next[0].cols[0].blockedRows], [1, 2]);
  next[0].cols[0].blockedRows.add(3);
  assert.equal(sp[0].cols[0].blockedRows.has(3), false, "元の Set と共有している");
});

test("blockedRows が無い列でも空の Set になる", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const next = cloneSpaces([{ name: "棟A", cols: [{ h: 4, fills: [] }] }]);
  assert.ok(next[0].cols[0].blockedRows instanceof Set);
  assert.equal(next[0].cols[0].blockedRows.size, 0);
});

test("validateMove は cloneSpaces を使う", () => {
  assert.match(functionSource("validateMove"), /cloneSpaces\(/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: `cloneSpaces must exist` で失敗。

- [ ] **Step 3: `cloneSpaces()` を足す**

`files/index.html` の `validateMove()` の直前（3159行の `// 移動の可否を判定する。` のコメントの上）に足す。

```js
/* clone() は JSON 経由なので blockedRows(Set) が消える。
   落としたまま空き判定に使うと、配置不可の行を無視して緩くなる。
   複製したらその場で貼り直す。 */
function cloneSpaces(sp){
  const next=clone(sp);
  sp.forEach((space,spaceIndex)=>space.cols.forEach((col,colIndex)=>{
    next[spaceIndex].cols[colIndex].blockedRows=col.blockedRows instanceof Set ? new Set(col.blockedRows) : new Set();
  }));
  return next;
}
```

- [ ] **Step 4: `validateMove()` を差し替える**

3172-3177行の次の3行（`const next=clone(sp);` と、その後に続く `sp.forEach(...)` の貼り直し）を1行にする。

```js
  const next=cloneSpaces(sp);
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス（317件 + 新規3件 = 320件）。

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/stash-space-move.test.js && git commit -m "$(printf 'refactor: 配置の複製と blockedRows の貼り直しをまとめる\n\n退避スペース用の検証でも同じ処理が要る。2か所に同じコードを\n置かないよう、validateMove の中から cloneSpaces として切り出す。\n振る舞いは変えない。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 2: 退避の上限を「その日の入力総パレット数」にする

**Files:**
- Modify: `files/index.html:3766-3773`（`stashFreeRoom` とその上のコメント）
- Modify: `tests/stash-overflow.test.js:136-141`（「退避の実効容量は列数×列高から数える」）
- Modify: `tests/stash-space-move.test.js`（テストを追加）

**Interfaces:**
- Consumes: `stashTotal(sp)`（`files/index.html:3761`）、グローバル `lastLots`（各ロットは `pallets` を持つ）
- Produces:
  - `stashCapacity(lots?) -> number` … 引数を省くと `lastLots` を見る
  - `stashFreeRoom(sp) -> number` … 呼び出し方は今までと同じ（引数は `sp` 1つ）

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` の末尾に足す。

```js
// 退避スペース1つ。count を入れた列を持つ
function stashWith(count) {
  const cols = [];
  let rem = count;
  while (rem > 0) {
    const put = Math.min(rem, 4);
    cols.push({ h: 4, aisle: false, fills: [{ id: "L1", count: put }] });
    rem -= put;
  }
  if (!cols.length) cols.push({ h: 4, aisle: false, fills: [] });
  return [{ name: "退避", zone: "stash", cols }];
}

test("退避の上限はその日の入力総パレット数", () => {
  const spaces = stashWith(6);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 20 }, { pallets: 10 }] }
  );
  // 入力は 30P、退避には 6P 入っているので残り 24P
  assert.equal(stashFreeRoom(spaces), 24);
});

test("入力より多く入っていても空きは負にならない", () => {
  const spaces = stashWith(12);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 4 }] }
  );
  assert.equal(stashFreeRoom(spaces), 0);
});

test("上限を列数から数えない", () => {
  const fn = functionSource("stashFreeRoom");
  assert.match(fn, /stashCapacity\(/);
  assert.doesNotMatch(fn, /STASH_MAX_COLS/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: `stashCapacity must exist` で失敗。

- [ ] **Step 3: `stashCapacity()` を足し、`stashFreeRoom()` を書き換える**

`files/index.html:3766-3773` のコメントと関数を、まるごと次で置き換える。

```js
/* 退避に積める上限は、その日の入力にあるパレット数。
   盤に乗っている荷物と退避にある荷物の合計は必ずこれ以下なので、
   「倉庫にあるものを全部退避へ逃がす」がどの日でも成立する。
   列数では数えない（列は repackStash() が中身から決めるので、
   何列になるかは上限の根拠にならない。120列まで描画が崩れないことは
   2026-09-21-stash-whole-space-move-design.md §8-1 で実測した）。 */
function stashCapacity(lots){
  return (lots||lastLots||[]).reduce((a,l)=>a+(l.pallets||0),0);
}
function stashFreeRoom(sp){
  return Math.max(0, stashCapacity()-stashTotal(sp));
}
```

- [ ] **Step 4: 既存テストを新しい根拠に合わせる**

`tests/stash-overflow.test.js:136-141` のテストを次で置き換える。

```js
test("退避の実効容量はその日の入力総パレット数から数える", () => {
  const fn = functionSource("stashFreeRoom");
  // 列数では数えない。列は repackStash() が中身から決める
  assert.match(fn, /stashCapacity\(/);
  assert.match(fn, /stashTotal\(/);
  assert.doesNotMatch(fn, /STASH_MAX_COLS/);
});
```

- [ ] **Step 5: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/stash-space-move.test.js tests/stash-overflow.test.js && git commit -m "$(printf 'feat: 退避の上限をその日の入力総パレット数にする\n\n56P（14列×4段）という上限に技術的な裏付けが無かった。列が増えても\n描画は崩れず（120列まで実測）、列数は上限の根拠にならない。\n\n盤に乗っている荷物と退避にある荷物の合計は必ず入力総数以下なので、\n入力総数を上限にすると「倉庫にあるものを全部逃がす」がどの日でも\n成立する。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 3: `STASH_MAX_COLS` を消す

上限がパレット数で決まるので、列数の歯止めは要らなくなる。

**Files:**
- Modify: `files/index.html:3747`（定数の削除）
- Modify: `files/index.html:3775-3789`（`putToStash`）
- Modify: `files/index.html:3843-3852`（`ensureStashRoom`）
- Modify: `tests/stash-space-move.test.js`

**Interfaces:**
- Consumes: `stashFreeRoom(sp)`（Task 2）
- Produces: `putToStash(sp, lotId, count)` … 上限を超える分は積まない。列数では止まらない

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` の末尾に足す。

```js
function emptyStash() {
  return [{ name: "退避", zone: "stash", cols: [{ h: 4, aisle: false, fills: [] }] }];
}

const STASH_PIECES = ["clone", "used", "stashSpaces", "stashTotal", "stashCapacity",
  "stashFreeRoom", "normalizeFills", "putToStash"];

test("putToStash は列数の上限で止まらない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 100 }] });
  putToStash(spaces, "L1", 100);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 100, "100P 入っていない");
  assert.equal(spaces[0].cols.length, 25, "h:4 の列が 25 本にならない");
});

test("putToStash は上限を超えては積まない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 30 }] });
  putToStash(spaces, "L1", 40);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 30, "上限を超えて積んでいる");
});

test("ensureStashRoom は容量が残っていれば末尾に空き列を残す", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 20 }] }
  );
  ensureStashRoom(spaces);
  const cols = spaces[0].cols;
  assert.equal(cols[cols.length - 1].fills.length, 0, "末尾に空き列が無い");
});

test("ensureStashRoom は満杯なら空き列を足さない", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 8 }] }
  );
  ensureStashRoom(spaces);
  assert.equal(spaces[0].cols.length, 2, "満杯なのに空き列を足している");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: 「putToStash は列数の上限で止まらない」が `STASH_MAX_COLS is not defined` で失敗（`load` が定数を渡していないため）。

- [ ] **Step 3: `putToStash()` から列数の上限を外す**

`files/index.html:3775-3789` を次で置き換える。

```js
// 退避スペースへ直に積む。自動配置のあとと、退避への移動から呼ぶ
function putToStash(sp,lotId,count){
  const s=stashSpaces(sp)[0]; if(!s) return;
  // 上限を超える分は積まない。呼び出し側が数えていても、ここでも止める
  let rem=Math.min(count, stashFreeRoom(sp));
  while(rem>0){
    let col=s.cols.find(c=>used(c)<c.h);
    if(!col){ col={h:STASH_COL_H,aisle:false,fills:[]}; s.cols.push(col); }
    const put=Math.min(rem,col.h-used(col));
    col.fills.push({id:lotId,count:put}); rem-=put;
  }
  normalizeFills(sp);
}
```

- [ ] **Step 4: `ensureStashRoom()` の条件を替える**

`files/index.html:3850-3851` の2行を次で置き換える。

```js
    if((!last || used(last)>0) && stashFreeRoom(sp)>0)
      s.cols.push({h:STASH_COL_H,aisle:false,fills:[]});
```

- [ ] **Step 5: 定数を消す**

`files/index.html:3747` の行を削除する。

```js
const STASH_MAX_COLS=14;        // 際限なく伸ばさない
```

- [ ] **Step 6: 参照が残っていないことを確認する**

```bash
grep -n "STASH_MAX_COLS" files/index.html tests/*.js docs/superpowers/specs/*.md
```

期待: `files/index.html` と `tests/` に一致なし（`docs/` の設計書は Task 7 で直すので残っていてよい）。

- [ ] **Step 7: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。

- [ ] **Step 8: コミット**

```bash
git add files/index.html tests/stash-space-move.test.js && git commit -m "$(printf 'refactor: 退避の列数の上限をやめる\n\n上限はパレット数で見るので、列数の歯止めは要らない。列は\nrepackStash() が中身から決める。putToStash は上限を超える分を\n積まないよう、自分でも空きを見る。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 4: `validateStashMove()` を足す

**Files:**
- Modify: `files/index.html`（`putToStash` の直後に新設）
- Modify: `tests/stash-space-move.test.js`

**Interfaces:**
- Consumes: `cloneSpaces(sp)`（Task 1）、`stashFreeRoom(sp)`（Task 2）、`putToStash(sp, lotId, count)`（Task 3）、`stashSpaces(sp)`
- Produces: `validateStashMove(sp, lotId, counts) -> {ok, same?, reason?, next?}`
  - `counts` は `selCounts()` の形（キーは `"エリア名|列番号"`、値はマス数）
  - `sp` は書き換えない。`ok:true` のとき `next` に適用済みの複製が入る

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` の末尾に足す。

```js
const VALIDATE_PIECES = [...STASH_PIECES, "cloneSpaces", "validateStashMove"];

// 倉庫1エリアと退避スペース。棟A の列0 に 25 枚入っている
function warehouseAndStash(count = 25) {
  return [
    { name: "棟A", zone: "near", cols: [{ h: 30, aisle: false, fills: [{ id: "L1", count }] }] },
    { name: "退避", zone: "stash", cols: [{ h: 4, aisle: false, fills: [] }] },
  ];
}

function stashTotalOf(sp) {
  return sp.find(s => s.zone === "stash").cols
    .reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
}

test("空の退避に22枚を落とせる", () => {
  const spaces = warehouseAndStash(25);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 22 });
  assert.equal(v.ok, true, v.reason);
  assert.equal(stashTotalOf(v.next), 22);
  assert.equal(stashTotalOf(spaces), 0, "元の配置を書き換えている");
});

test("1列に積める枚数を超えても入る", () => {
  const spaces = warehouseAndStash(60);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 60 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 60 });
  assert.equal(v.ok, true, v.reason);
  assert.equal(stashTotalOf(v.next), 60);
});

test("上限を超える選択は1マスも動かさず、空き容量を理由に出す", () => {
  const spaces = warehouseAndStash(25);
  // 入力は 10P しかないので、25 枚は入らない
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 10 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 25 });
  assert.equal(v.ok, false);
  assert.equal(v.same, undefined, "「動くマスが無い」と混同している");
  assert.match(v.reason, /25P/, "選んだ枚数が理由に無い");
  assert.match(v.reason, /10P/, "空き容量が理由に無い");
  assert.equal(v.next, undefined, "動かさないのに配置を返している");
});

test("退避の中のマスだけを選んでも動かない", () => {
  const spaces = warehouseAndStash(25);
  spaces[1].cols[0].fills.push({ id: "L1", count: 3 });
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "退避|0": 3 });
  assert.equal(v.ok, false);
  assert.equal(v.same, true, "「動くマスが無い」になっていない");
});

test("倉庫と退避が混ざった選択では倉庫側だけが動く", () => {
  const spaces = warehouseAndStash(25);
  spaces[1].cols[0].fills.push({ id: "L1", count: 3 });
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 28 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 5, "退避|0": 3 });
  assert.equal(v.ok, true, v.reason);
  // 退避にあった 3 枚はそのまま、倉庫から 5 枚が増えて 8 枚
  assert.equal(stashTotalOf(v.next), 8);
  const warehouse = v.next.find(s => s.name === "棟A").cols[0];
  assert.equal(warehouse.fills.reduce((a, f) => a + f.count, 0), 20);
});

test("退避への移動では分割の確認を出さない", () => {
  const spaces = warehouseAndStash(25);
  const { validateStashMove } = load(VALIDATE_PIECES, { spaces, lots: [{ pallets: 25 }] });
  const v = validateStashMove(spaces, "L1", { "棟A|0": 10 });
  assert.equal(v.needConfirm, false);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: `validateStashMove must exist` で失敗。

- [ ] **Step 3: `validateStashMove()` を足す**

`files/index.html` の `putToStash()` の直後に足す。

```js
/* 退避スペースへの移動の可否を判定する。sp は書き換えない。
   退避は倉庫に実在しないので、落とし先は列ではなくスペース全体になる。
   空きは全体で見て、積み方は putToStash() と同じにする。
   ok:true のとき next に移動適用済みのコピーが入るので、呼び出し側はそれを lastSp に入れる。 */
function validateStashMove(sp, lotId, counts){
  const s=stashSpaces(sp)[0];
  if(!s) return {ok:false, reason:"退避スペースがありません"};
  // すでに退避にあるマスは動かない（退避の中では位置に意味が無い）
  let n=0;
  Object.keys(counts).forEach(k=>{ if(k.split("|")[0]!==s.name) n+=counts[k]; });
  if(n<=0) return {ok:false, same:true, reason:"動くマスがありません"};
  const room=stashFreeRoom(sp);
  // 入りきらないときは1マスも動かさない。理由は呼び出し側が出す
  if(n>room) return {ok:false, reason:`退避スペースに入りきりません。\n選んだのは ${n}P、いま空いているのは ${room}P です。`};
  const next=cloneSpaces(sp);
  Object.keys(counts).forEach(key=>{
    const p=key.split("|");
    if(p[0]===s.name) return;
    const space=next.find(x=>x.name===p[0]); if(!space) return;
    const col=space.cols[parseInt(p[1])]; if(!col) return;
    let need=counts[key];
    col.fills.forEach(f=>{
      if(need<=0 || f.id!==lotId) return;
      const take=Math.min(need, f.count);
      f.count-=take; need-=take;
    });
  });
  putToStash(next, lotId, n);
  // 退避は blockCountOf() が数えないので、倉庫側の箇所数が増えることはない。
  // したがって分割の確認は原理的に出ない
  return {ok:true, needConfirm:false, next};
}
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/stash-space-move.test.js && git commit -m "$(printf 'feat: 退避スペース全体を落とし先にする検証を足す\n\n落とし先を列ではなくスペース全体として数える。すでに退避にある\nマスは動かさず、倉庫と退避が混ざった選択でも倉庫側だけを動かす。\n入りきらないときは1マスも動かさず、空き容量を理由に返す。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 5: `applyMoveToStash()` を足し、古い経路を消す

**Files:**
- Modify: `files/index.html:3666-3686`（`applyMove`）
- Modify: `files/index.html:3732-3736`（受け皿に落とす経路）
- Modify: `files/index.html:3748`（`STASH_COL_MAX_H` の削除）
- Modify: `files/index.html:3789-3794`（`firstFreeStashCol` の削除）
- Modify: `files/index.html:3798-3808`（`growStashCol` の削除）
- Delete: `tests/stash-grow.test.js`
- Modify: `tests/stash-space-move.test.js`

**Interfaces:**
- Consumes: `validateStashMove(sp, lotId, counts)`（Task 4）、`snapshotSpaces(sp)`、`selSnapshot()`、`pushMoveStep(spBefore, selBefore)`、`saveManual()`、`clearSel()`、`redraw()`、`isActiveFresh()`、`refreshFreshness()`
- Produces: `applyMoveToStash()` … 引数なし。`sel` と `lastSp` を見て退避へ移す

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` の末尾に足す。

```js
/* applyMoveToStash を実際に動かす。検証の中身は Task 4 のテストの範囲なので、
   ここでは validateStashMove の返り値を差し替えて、後始末だけを見る。 */
function loadApplyToStash({ spaces, validate }) {
  const log = { alerted: [], pushed: 0, saved: 0, redrawn: 0, cleared: 0 };
  const src = `
    let lastSp=spaces;
    const sel={lotId:"L1", cells:new Set(["棟A|0"])};
    ${functionSource("stashSpaces")}
    ${functionSource("applyMoveToStash")}
    function isActiveFresh(){ return true; }
    function refreshFreshness(){}
    function selCounts(){ return { "棟A|0": 1 }; }
    function selSnapshot(){ return null; }
    function snapshotSpaces(sp){ return sp; }
    function validateStashMove(){ return validate; }
    function alert(m){ log.alerted.push(m); }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){ log.cleared++; }
    function redraw(){ log.redrawn++; }
    return { applyMoveToStash, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "validate", "log", src)(spaces, validate, log);
  return { ...made, log };
}

test("入りきらないときは理由を出して、何も変えない", () => {
  const spaces = emptyStash();
  const app = loadApplyToStash({
    spaces,
    validate: { ok: false, reason: "退避スペースに入りきりません。\n選んだのは 30P、いま空いているのは 12P です。" },
  });
  app.applyMoveToStash();
  assert.equal(app.log.alerted.length, 1, "理由を出していない");
  assert.match(app.log.alerted[0], /入りきりません/);
  assert.equal(app.log.pushed, 0);
  assert.equal(app.log.saved, 0);
  assert.equal(app.spaces(), spaces, "配置を差し替えている");
});

test("動くマスが無いときは黙って中止する", () => {
  const app = loadApplyToStash({
    spaces: emptyStash(),
    validate: { ok: false, same: true, reason: "動くマスがありません" },
  });
  app.applyMoveToStash();
  assert.equal(app.log.alerted.length, 0, "退避の中で動かすたびにダイアログが出る");
  assert.equal(app.log.pushed, 0);
});

test("成立したら検証後の配置を採り、履歴に積む", () => {
  const next = [{ name: "退避", zone: "stash", cols: [] }];
  const app = loadApplyToStash({ spaces: emptyStash(), validate: { ok: true, next } });
  app.applyMoveToStash();
  assert.equal(app.spaces(), next, "検証後の配置を採っていない");
  assert.equal(app.log.pushed, 1, "履歴に積んでいない");
  assert.equal(app.log.saved, 1);
  assert.equal(app.log.cleared, 1);
  assert.equal(app.log.redrawn, 1);
});

test("applyMove は退避が宛先なら専用の経路へ渡す", () => {
  const fn = functionSource("applyMove");
  assert.match(fn, /applyMoveToStash\(\)/);
  assert.match(fn, /stashSpaces\(/);
});

test("受け皿に落とす経路は列を渡さない", () => {
  assert.doesNotMatch(source, /firstFreeStashCol/);
});

test("退避の列を伸ばす仕掛けは残っていない", () => {
  assert.doesNotMatch(source, /growStashCol/);
  assert.doesNotMatch(source, /STASH_COL_MAX_H/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: `applyMoveToStash must exist` で失敗。

- [ ] **Step 3: `applyMoveToStash()` を足す**

`files/index.html` の `applyMove()` の直前に足す。

```js
/* 退避スペースへの移動。落とし先は列ではなくスペース全体なので、
   applyMove() とは別の経路にする（倉庫側の移動処理には触らない）。
   applyMove() と同じ後始末（履歴・保存・選択解除・描き直し）をここでも行う。 */
function applyMoveToStash(){
  if(!isActiveFresh()){ refreshFreshness(); return; }
  const counts=selCounts(sel.cells);
  const spBefore=snapshotSpaces(lastSp), selBefore=selSnapshot();
  const v=validateStashMove(lastSp, sel.lotId, counts);
  if(!v.ok){
    // 入りきらないときは理由を出す。黙って中止すると壊れたように見える。
    // 「動くマスが無い」は退避の中で動かしたときに必ず起きるので出さない
    if(!v.same) alert(v.reason);
    return;
  }
  lastSp=v.next;
  pushMoveStep(spBefore, selBefore);
  saveManual();
  clearSel();
  redraw();
}
```

- [ ] **Step 4: `applyMove()` を書き換える**

`files/index.html:3665-3686`（コメント行を含む）を次で置き換える。

```js
// 検証して lastSp を更新する。動くマスが無い場合と容量不足は黙って中止する。
function applyMove(spaceName, colIndex){
  // 退避スペースは倉庫に実在せず、どの列に置くかは何の情報も持たない。
  // 列ではなくスペース全体を落とし先にする
  if(stashSpaces(lastSp).some(s=>s.name===spaceName)){ applyMoveToStash(); return; }
  if(!isActiveFresh()){ refreshFreshness(); return; }
  const counts=selCounts(sel.cells);
  const spBefore=snapshotSpaces(lastSp), selBefore=selSnapshot();
  const v=validateMove(lastSp, sel.lotId, counts, spaceName, colIndex);
  if(!v.ok) return;
  if(v.needConfirm){
    const lot=lastLots.find(l=>l.id===sel.lotId);
    const name=lot?`${lot.name} / ${lot.lot||"—"}`:"このロット";
    if(!confirm(`${name} が ${v.before}か所から ${v.after}か所に分かれます。このまま移動しますか？`)) return;
  }
  lastSp=v.next;
  pushMoveStep(spBefore, selBefore);
  saveManual();
  clearSel();
  redraw();
}
```

- [ ] **Step 5: 受け皿に落とす経路を直す**

`files/index.html:3732-3736` の `if(onDock){ ... }` を次で置き換える。

```js
  if(onDock){ applyMoveToStash(); return; }
```

- [ ] **Step 6: 要らなくなった定数と関数を消す**

次の3つを削除する。

- `files/index.html:3748` の `const STASH_COL_MAX_H=21; // 1列に積める上限（架空の場所なので倉庫より緩い）`
- `files/index.html:3789-3794` の `firstFreeStashCol()` 全体
- `files/index.html:3798-3808` の `growStashCol()` 全体（その上の複数行コメントも一緒に）

- [ ] **Step 7: 古いテストを消す**

```bash
git rm tests/stash-grow.test.js
```

`growStashCol` が無くなるため、このファイルの3テストはすべて対象を失う。同じ範囲は Task 4・Task 5 のテストが見ている。

- [ ] **Step 8: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。`growStashCol` / `firstFreeStashCol` / `STASH_COL_MAX_H` への参照が残っていれば、Step 1 で足した3つのテストが落ちる。

- [ ] **Step 9: コミット**

```bash
git add -A files/index.html tests/ && git commit -m "$(printf 'feat: 退避への移動を列ではなくスペース全体にする\n\n空の退避に22枚以上を落とすと無反応になっていた。落とし先を1つの\n列に決め打ちし、その列を21段までしか伸ばせなかったため、検証が\n「移動先の空きが足りません」で移動を丸ごと中止していた。\n\n退避が宛先のときは専用の経路へ渡し、空いている列へ自動で詰める。\n入りきらないときは理由を出す。列を伸ばす仕掛けは要らなくなった。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 6: ドラッグ中の色付けを合わせる

`highlightDrop()` は列の空きで緑／赤を出す。直さないと「赤いのに落ちる」「緑なのに落ちない」が起きる。

**Files:**
- Modify: `files/index.html:3622-3632`（`highlightDrop`）
- Modify: `tests/stash-space-move.test.js`

**Interfaces:**
- Consumes: `validateStashMove(sp, lotId, counts)`（Task 4）、`validateMove(...)`（既存）

- [ ] **Step 1: 失敗するテストを書く**

`tests/stash-space-move.test.js` の末尾に足す。

```js
test("ドラッグ中の色付けは退避なら退避用の検証を使う", () => {
  const fn = functionSource("highlightDrop");
  assert.match(fn, /validateStashMove\(/, "退避用の検証を呼んでいない");
  assert.match(fn, /stashSpaces\(/, "宛先が退避かを見ていない");
  assert.match(fn, /validateMove\(/, "倉庫側の検証を失っている");
});
```

- [ ] **Step 2: テストが失敗することを確認する**

```bash
node --test tests/stash-space-move.test.js
```

期待: 「退避用の検証を呼んでいない」で失敗。

- [ ] **Step 3: `highlightDrop()` を直す**

`files/index.html:3629` の1行を次で置き換える。

```js
  // 退避は列ではなくスペース全体が落とし先なので、判定も退避用のものを使う。
  // 列の空きで出すと、実際の可否と食い違う
  const v = stashSpaces(lastSp).some(s=>s.name===w.dataset.space)
    ? validateStashMove(lastSp, sel.lotId, selCounts(sel.cells))
    : validateMove(lastSp, sel.lotId, selCounts(sel.cells), w.dataset.space, parseInt(w.dataset.col));
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/stash-space-move.test.js && git commit -m "$(printf 'fix: 退避へドラッグ中の緑と赤を実際の可否に合わせる\n\n列の空きで判定していたため、スペース全体なら入るのに赤く出る、\n逆に列は空いているのに全体では入らない、という食い違いが出る。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 7: 設計書の訂正とキャッシュ版数

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-stash-space-and-sweep-select-design.md:217-218`
- Modify: `docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md:105-129`
- Modify: `files/sw.js:6`

- [ ] **Step 1: 2026-09-03 設計書 §7 を訂正する**

217-218行の次の2行を、

```markdown
- **退避に入りきらない**: `STASH_MAX_COLS`(14) と `STASH_COL_MAX_H`(21) で頭打ち。
  超える分は落ちない（`validateMove` が弾く）
```

次で置き換える。

```markdown
- **退避に入りきらない**: 上限は**その日の入力総パレット数**。超えるときは
  **1マスも動かさず**、空き容量を `alert` で知らせる（`validateStashMove`）。
  `STASH_MAX_COLS`(14) と `STASH_COL_MAX_H`(21) は
  `2026-09-21-stash-whole-space-move-design.md` で廃止した
```

- [ ] **Step 2: 2026-09-17 設計書 §3-3 を訂正する**

105-129行の「### 3-3. 退避の実効容量は 56P（定数から計算しないこと）」の節全体を、次で置き換える。

```markdown
### 3-3. 退避の実効容量はその日の入力総パレット数

**2026-09-21 訂正。** この節はもともと「実効容量は 56P（`STASH_MAX_COLS` × `STASH_COL_H`）」
とし、その根拠を「65P を入れると 17 列に再梱包され、`STASH_MAX_COLS`(14) を超えて
隅の小さな盤の描画が崩れる」と書いていた。**この根拠は誤りである。**

受け皿（`#stashDock` の `.sb-body`）は `overflow:auto` なので、列が増えても横スクロールに
なるだけで外形は変わらない。実測では 17 列・30 列・60 列・120 列（480P）のいずれでも、
PC 幅（1024）とスマホ幅（375）の両方で描画は崩れず、ページの横あふれも起きなかった。
詳細は `2026-09-21-stash-whole-space-move-design.md` §8-1 を参照。

現在の上限は**その日の入力総パレット数**（`stashCapacity()`）である。盤に乗っている荷物と
退避にある荷物の合計は必ず入力総数以下なので、「倉庫にあるものを全部退避へ逃がす」が
どの日でも成立する。

投入の前に `stashFreeRoom()` で空きを確かめる点は変わらない。

- 入る分だけ `putToStash()` で入れる
- 入らなかった分は `lot.rem` に残したまま、専用の警告を出す

```
⚠ 退避スペースに入りきりません：部品A(001) NP。配置図にも出ません。
```

上限が入力総数になったため、この警告は通常運用では出ない（あふれた分は必ず入る）。
分岐は想定外の入口に対する守りとして残している。
```

- [ ] **Step 3: キャッシュ版数を上げる**

`files/sw.js:6` を次に変える。

```js
const CACHE_VERSION = "v69";
```

- [ ] **Step 4: テストが通ることを確認する**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。

- [ ] **Step 5: コミット**

```bash
git add docs/ files/sw.js && git commit -m "$(printf 'docs: 退避の容量の根拠を訂正し、キャッシュ版数を上げる\n\n2026-09-17 設計書 §3-3 の「17列で隅の盤の描画が崩れる」は誤り。\n受け皿は overflow:auto で横スクロールするだけで、120列まで崩れない\nことを実測した。2026-09-03 設計書 §7 の「超える分は落ちない」も\n実装と食い違っていたので直す。\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>')"
```

---

### Task 8: ブラウザで通しの確認をする

自動テストは関数を切り出して動かすため、**本物の入口（ドラッグ）を一度も通らない**。
`~/claude-lessons/lessons.md` の「[2026-09-21] 寸法ばかり測り、機能が動く最初の1回を試していなかった」に従い、ここで通しの確認を行う。

**Files:** なし（確認のみ。不具合が出たら該当タスクへ戻る）

- [ ] **Step 1: ローカルサーバーを起動する**

```bash
python3 -m http.server 8765 --directory files
```

- [ ] **Step 2: 条件を作る**

ブラウザで `http://localhost:8765/` を開く。前回の退避の中身が残っているので、開発者ツールのコンソールで次を実行して初期化する。

```js
Object.keys(localStorage).filter(k=>k.startsWith("palletApp")).forEach(k=>localStorage.removeItem(k)); location.reload();
```

設定タブで「入力タブに『基本サンプル』『混載デモ』を出す」を入れ、入力タブで「基本サンプル」→「▶ 自動配置を作成」。

- [ ] **Step 3: 最初の1回を、本物のドラッグで試す**

配置編集タブで 部品C / L-103（25P）の列をなぞって全部選び、**指／マウスで**退避スペースの受け皿へドラッグして離す。

期待: 25 枚とも退避に入る（修正前は無反応）。退避スペースの表示が「退避スペース 25P」になる。

**合成イベントでは代用しないこと。** `left_click_drag` は中間の `pointermove` を出さないため、なぞりもドラッグも成立しない。どうしても自動で確かめる必要がある場合は `applyMoveToStash()` を直接呼び、**報告に「ドラッグではなくアプリ自身の移動関数を直接呼んだ」と明記する**。

- [ ] **Step 4: 残りの操作を確かめる**

1. 戻す（↩）を押す → 移動前の形に戻る。進む（↪）で再び退避へ入る
2. 別のロットを選び、退避スペースの**列の枠**の上で離す → 受け皿に落としたときと同じように入る
3. ドラッグ中、退避の上にいるあいだ枠が緑になる（赤にならない）
4. 入力総数を超える量を落とす → 何も動かず、`alert` に「選んだのは NP、いま空いているのは NP です」が出る
   - 条件の作り方: 入力タブでロットのパレット数を小さくしてから「▶ 自動配置を作成」し、退避にあらかじめ荷物を入れておく
5. 退避スペースの表示が崩れない（ウィンドウ幅 1024 と 375 の両方）
6. 配置図タブを開き、退避の中身が「※未定」として載る

- [ ] **Step 5: 実機（Pixel 9a / Android Chrome）で確かめる**

PC の IP を調べる。

```bash
ipconfig getifaddr en0
```

同じ LAN の Pixel 9a で `http://<表示された IP>:8765/` を開き、Step 3 と Step 4 の 1〜3 を指で行う。指でのなぞり選択とドラッグは PC のマウスと判定経路が違うため、必ず実機でも通す。

- [ ] **Step 6: サーバーを止める**

サーバーを起動したターミナルで `Ctrl+C`。

- [ ] **Step 7: 最終確認**

```bash
node --test 'tests/*.test.js'
```

期待: 全パス。この時点で `git status` がクリーンであること。

---

## 自己レビュー

**設計書の項目と担当タスク**

| 設計書 | 担当 |
|---|---|
| §3 宛先の扱い（委譲） | Task 5 |
| §3-1 呼び出し元4か所 | Task 5（受け皿・列枠・倉庫へ戻す）、Task 6（色付け） |
| §3-2 引き継ぐ責務5つ | Task 5 |
| §3-3 分割確認は出ない | Task 4 |
| §4 容量の決め方 | Task 2 |
| §4-1 副作用（`noRoom`） | Task 7（設計書に記録） |
| §4-2 列数の上限を持たない | Task 3 |
| §5 検証 | Task 4 |
| §5-1 `clone()` の `blockedRows` 落ち | Task 1 |
| §6 入りきらないときの見せ方 | Task 4（文言）、Task 5（`alert`） |
| §7 消すもの4つ | Task 3（`STASH_MAX_COLS`）、Task 5（他3つ） |
| §8-5 キャッシュ版数 | Task 7 |
| §9 テスト | Task 1〜6 に分散、`tests/stash-grow.test.js` の削除は Task 5 |
| §10 既存設計書の訂正 | Task 7 |
| §12 動作確認の手順 | Task 8 |

**型と名前の一致**

- `cloneSpaces(sp)` … Task 1 で定義、Task 4 で使用
- `stashCapacity(lots?)` / `stashFreeRoom(sp)` … Task 2 で定義、Task 3・Task 4 で使用
- `putToStash(sp, lotId, count)` … 既存、Task 3 で変更、Task 4 で使用
- `validateStashMove(sp, lotId, counts)` … Task 4 で定義、Task 5・Task 6 で使用
- `applyMoveToStash()` … Task 5 で定義、Task 5（`applyMove`・受け皿）で使用
