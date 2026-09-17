# 退避スペースとあふれ荷物の兼用 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 倉庫に入りきらなかった荷物を退避スペースへ自動で逃がし、配置図（紙）に「置き場未定」として必ず記載する。

**Architecture:** 退避エリア（`zone:"stash"`）の中身から紙の欄を作る `stashSlots()` を新設し、`sheetPlacement()` が上段の欄の末尾へ連結する。これで既存の「上段 → 下段の空き → 追記欄 → 警告」の階段にそのまま乗る。追記欄は3件以上あるとき2枠目を「まとめ欄」にして残り全部を縦積みし、紙から荷物が消えないようにする。`run()` は自動配置のあとに `lot.rem` を退避へ積む。

**Tech Stack:** 単一ファイルの PWA（`files/index.html` に HTML・CSS・JavaScript をすべて埋め込む）。ビルド無し。テストは `node --test`（`files/index.html` を文字列として読み、正規表現でソースを照合する方式）。

**Spec:** `docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md`

## Global Constraints

- 対象ファイルは `files/index.html`（全 5282 行、2026-09-17 時点）と `files/sw.js` のみ。新しい依存は足さない
- テストの実行は `node --test tests/stash-overflow.test.js`。**`node --test tests/` はこの Node（v22.15.0）ではディレクトリを解決できず失敗する**ので使わない
- 既存のテスト `tests/sheet-placement.test.js`（119 件）を壊さない。各タスクの最後に両方を通す
- 保存形式は変えない（`SPACES_SAVE_VERSION`、`STORE_KEY`、属性値 `over`、`sheet:"none"` はそのまま）
- 紙の注釈の文言は **`※置き場未定`**（このとおりの文字。「置き場所未定」でも「置場未定」でもない）
- 用語: 荷物は「あふれ」、紙の欄は「追記欄」。「あふれ受け（出庫口横・5棟壁際）」は荷物の側の語なので残す
- 関数名 `arrangeOverflowSlots` / `overflowTable` と CSS クラス `.overflow-table` `.overflow-host` `.overflow-gap` は変えない
- コメントと画面の文言は日本語で書く。既存のコメントの文体（理由を書く）に合わせる
- 触らないもの: `place` / `placeLot` / `fillMix` / `areaCandidates` / `validateMove` / `moveCells` / `normalizeFills` / `gridRows` / `gridShift` / `sheetGridAnchors` / `drawLeaders` / `tailAreaOf` / `repackStash` / `returnSelToWarehouse`

---

## File Structure

| ファイル | 役割 | このプランでの扱い |
|---|---|---|
| `files/index.html` | アプリ本体（HTML・CSS・JS を埋め込む単一ファイル） | すべてのタスクで変更する |
| `files/sw.js` | Service Worker。`CACHE_VERSION` を上げないと実機に新版が届かない | Task 6 で `v51` → `v52` |
| `tests/stash-overflow.test.js` | **新規**。この機能のソース照合テスト | Task 1 で作り、以降のタスクで足す |
| `tests/sheet-placement.test.js` | 既存の 119 件。触らない | 各タスクで回帰確認だけする |
| `docs/superpowers/specs/2026-09-03-stash-space-and-sweep-select-design.md` | 退避スペースの設計書。§2-4 の前提が今回変わる | Task 6 で追記 |
| `docs/superpowers/specs/2026-09-15-next-features-notes.md` | 要件メモ。§3 が済み、項目枠線が別件として残る | Task 6 で更新 |

テストを既存ファイルに足さず新しいファイルにするのは、`tests/sheet-placement.test.js` が
すでに 119 件・約 1,700 行あり、この機能の回帰だけを回したい場面が多いため。

---

## Task 1: 用語の改名

紙の欄を指す「あふれブロック」を「追記欄」に直し、掲載先 `over` のラベルを実態に合わせる。
**最初にやる。** 後続のタスクが同じ行を触るので、先に文言を確定させておくと衝突しない。

**Files:**
- Create: `tests/stash-overflow.test.js`
- Modify: `files/index.html`（11 箇所：495 / 774 / 843 / 911 / 2134 / 2291 / 2294 / 2300 / 4478 / 4732 / 4849 行付近）

**Interfaces:**
- Consumes: なし
- Produces: 画面の文言 `配置図の追記欄にも記載できない項目があります` / `掲載先を「掲載しない」にした次のエリアには、新しく荷物を置きません` / 設定タブの説明の `over＝掲載しない`

- [ ] **Step 1: Write the failing test**

`tests/stash-overflow.test.js` を新規に作る。

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stash-overflow.test.js`
Expected: FAIL（`あふれブロック` が 11 箇所残っているため、1件目も2件目も落ちる）

- [ ] **Step 3: 画面の文言とコメントを直す**

次の 11 箇所を直す（774 行は同じ行の中の2つの文言を直すので、表は 12 行ある）。
行番号は 2026-09-17 時点の実測値。`grep -n 'あふれブロック' files/index.html` で
現在位置を確かめてから直すこと。

| 行 | 現 | 新 |
|---|---|---|
| 495 | `あふれブロックは wide 様式の右端2列に縦積みする。` | `追記欄は wide 様式の右端2列に縦積みする。` |
| 774 | `over＝あふれブロック` | `over＝掲載しない` |
| 774 | `<b>あふれブロックは未実装</b>なので、over にしたエリアには新しく荷物を置きません。` | `<b>「掲載しない」にしたエリアには新しく荷物を置きません。</b>` |
| 843 | `over＝あふれブロック` | `over＝掲載しない` |
| 911 | `後日あふれブロックが入る用地。` | `あふれた項目を書く追記欄に使う。` |
| 2134 | `掲載先が「あふれブロック」のエリアは配置図の表に欄が無い。` | `掲載先が「掲載しない」のエリアは配置図の表に欄が無い。` |
| 2291 | `⚠ 配置図のあふれブロックにも記載できない項目があります：` | `⚠ 配置図の追記欄にも記載できない項目があります：` |
| 2294 | `掲載先 over のエリアは、表の欄数超過で使う「あふれブロック」とは別の設定値。` | `掲載先 over のエリアは、表の欄数超過で使う「追記欄」とは別の設定値。` |
| 2300 | `⚠ 掲載先を「あふれブロック」にした次のエリアには、` | `⚠ 掲載先を「掲載しない」にした次のエリアには、` |
| 4478 | `通常欄から漏れた項目は、あふれブロックに先頭2項目だけ記載する。` | `通常欄から漏れた項目は、追記欄に先頭2項目だけ記載する。` |
| 4732 | `あふれブロックの1項目は、右端2列の中で` | `追記欄の1項目は、右端2列の中で` |
| 4849 | `この2列を縦2項目のあふれブロックに使う。` | `この2列を縦2項目の追記欄に使う。` |

774 行は設定タブの説明文で、`over` が未実装であることを述べている部分も実態に合わせて書き直す。
`over` の機能そのものは今回も実装しないので、「新しく荷物を置かない」「表には出ない」という
説明の中身は変えず、呼び名だけを直す。

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/stash-overflow.test.js`
Expected: PASS（2 件）

- [ ] **Step 5: 既存のテストが壊れていないことを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（119 件）

既存のテストが文言を照合していて落ちた場合は、**テストの側を新しい文言に直す**。
改名は決定事項なので、実装を戻さない。

- [ ] **Step 6: Commit**

```bash
git add tests/stash-overflow.test.js files/index.html
git commit -m "$(cat <<'MSG'
refactor: 紙の欄の呼び名を「追記欄」に統一する

荷物の「あふれ」と紙の欄の「あふれブロック」が同じ画面に出るため、
紙の欄の側を「追記欄」に改める。掲載先 over のラベルは追記欄とは
別物なので、実態に合わせて「掲載しない」にする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 2: 退避スペースの中身から紙の欄を作る

`stashSlots()` を新設し、`sheetPlacement()` が上段の欄の末尾に連結する。
この時点では退避に荷物を入れる経路は手動（既存のドラッグ）だけなので、
手で逃がした荷物が紙に出るようになる。

**Files:**
- Modify: `files/index.html`
  - `sheetSlots()` の直後（4409 行付近）に `stashSlots()` を足す
  - `sheetPlacement()`（4494-4515 行）の 3 箇所
- Test: `tests/stash-overflow.test.js`

**Interfaces:**
- Consumes: `stashSpaces(sp)`（3283 行）、`lastSp` / `lastLots`、`mergeEntries(entries, baseArea)`（4388 行）、`mergeLots`（1623 行）、`tailAreaOf(id)`（4337 行）
- Produces: `stashSlots()` → 欄の配列。各欄は `{lot, pallets, half, areas:["退避"], note:"※置き場未定", stash:true}`（`mergeEntries()` を通したあとは `members` が付き、`lot` は代表のロット）。Task 3 と Task 4 がこの `stash` フラグを見る

- [ ] **Step 1: Write the failing test**

`tests/stash-overflow.test.js` に足す。

```js
test("退避スペースの中身から紙の欄を作る", () => {
  const fn = functionSource("stashSlots");
  // 退避エリアだけを見る
  assert.match(fn, /stashSpaces\(/);
  // 注釈はエリア名ではなく固定の文言
  assert.match(fn, /※置き場未定/);
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
  assert.match(fn, /filter\(e=>!e\.stash\)\.concat\(/);
  assert.match(fn, /filter\(e=>e\.stash\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stash-overflow.test.js`
Expected: FAIL（`stashSlots must exist` で1件目が落ちる）

- [ ] **Step 3: `stashSlots()` を足す**

`sheetSlots()` の直後（4409 行付近）に置く。

```js
/* 退避スペースの中身を配置図の欄にする。
   退避は倉庫に実在しないので掲載先（sheet）を持たず、sheetAreas() には出てこない。
   欄を作る経路だけをここに分けてある。sheet:"top" に変えて既存経路へ乗せると、
   sheetEntries() がエリア名を注釈に出し、mergeEntries() の基準エリア判定にも
   退避が混ざるため、分岐がかえって増える。
   注釈は「※置き場未定」で固定する。現場にとって「退避」は場所の名前ではない。 */
function stashSlots(){
  if(!lastSp || !lastLots) return [];
  const order=[], byId={};
  stashSpaces(lastSp).forEach(s=>s.cols.forEach(c=>c.fills.forEach(f=>{
    let e=byId[f.id];
    if(!e){
      const lot=lastLots.find(l=>l.id===f.id);
      if(!lot) return;
      e=byId[f.id]={lot, pallets:0};
      order.push(e);
    }
    e.pallets+=f.count;
  })));
  const entries=order.map(e=>{
    // 「半」はロットの末尾のマスに付く。tailAreaOf() は lastSp の並びで
    // 最後にそのロットを持つスペースを返し、退避は DEFAULT_SPACES の末尾にある。
    // したがって退避に1枚でもあるロットの「半」はこの欄に出る（設計書 §7(f)）
    const half = (tailAreaOf(e.lot.id)==="退避") ? Math.min(e.lot.half||0, e.pallets) : 0;
    return {lot:e.lot, pallets:e.pallets, half, areas:["退避"],
            note:"※置き場未定", stash:true};
  });
  if(!mergeLots) return entries;
  // 退避の欄はメイン（下段の基準エリア）に乗っていないので、まとめてよい。
  // 基準エリアを渡さないことで、まとめの除外条件に引っかからない
  return mergeEntries(entries, null).map(g=>({...g, note:"※置き場未定", stash:true}));
}
```

`mergeEntries()` は `{lot, members, areas, note}` を作るので、
まとめたあとに `note` と `stash` を付け直している（`mergeEntries()` は
先頭の欄の `note` を引き継ぐが、明示しておくほうが後から読んで分かる）。

- [ ] **Step 4: `sheetPlacement()` の 3 箇所を直す**

```js
function sheetPlacement(){
  // 退避スペースの中身を上段の欄の末尾に足す。エリアの欄が先、退避の欄が後になり、
  // 「欄が足りないぶんを回す」既存の階段（下段の空き → 追記欄 → 警告）にそのまま乗る
  const top=sheetSlots("top").concat(stashSlots());
  const base=sheetSlots("bottom");
  const lay=sheetLayout(top, base);
  const free=Math.max(0, lay.bottom-base.length);
  const over=Math.max(0, top.length-lay.top);
  // 退避の欄は注釈が唯一の情報なので、slotAreaNote() で作り直さない（※退避 に化ける）
  const moved=top.slice(lay.top, lay.top+Math.min(free, over))
    .map(e=>({...e, fromTop:true, note: e.stash ? e.note : slotAreaNote(e.areas)}));
  const bottomAll=base.concat(moved);
  let positions=null;
  if(typeof lastSp!=="undefined" && typeof SHEET_GRID_ORDER!=="undefined" &&
     typeof sheetGridAnchors==="function"){
    const sp=lastSp && lastSp.find(s=>s.name===sheetAreas("bottom")[0]);
    const anchors=sheetGridAnchors(sp, SHEET_GRID_ORDER);
    if(anchors) positions=Object.fromEntries(anchors.map(anchor=>[anchor.id, anchor.k+.5]));
  }
  const arranged=arrangeBottomSlots(bottomAll, lay.bottom, positions);
  const omittedTop=top.slice(lay.top+moved.length);
  // 追記欄は欄数超過を先に載せる。退避の欄は top の末尾に居るので、
  // 並べ直さないと下段の欄数超過（arranged.dropped）を押し出してしまう
  const rest=omittedTop.concat(arranged.dropped);
  const ordered=rest.filter(e=>!e.stash).concat(rest.filter(e=>e.stash));
  const overflowed=arrangeOverflowSlots(ordered);
  return {lay, top, bottom:arranged.slots, bottomAll, droppedBottom:arranged.dropped,
          overflow:overflowed.overflow, unlisted:overflowed.unlisted, moved};
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/stash-overflow.test.js`
Expected: PASS（6 件）

- [ ] **Step 6: 既存のテストが壊れていないことを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（119 件）

- [ ] **Step 7: ブラウザで手動確認**

```bash
python3 -m http.server 8765 --directory files
```

`http://localhost:8765` を開き、次を確かめる。

1. 荷物を数件入力して「▶ 自動配置を作成」
2. 配置編集タブで、盤のマスを選んで退避スペースへドラッグする
3. 配置図タブを開く → **退避した荷物の欄が出て、注釈が `※置き場未定`** になっている
4. その欄に**引き出し線が引かれていない**（下段へ回った場合）
5. 退避を空にすると、紙の形が元どおりになる

- [ ] **Step 8: Commit**

```bash
git add tests/stash-overflow.test.js files/index.html
git commit -m "$(cat <<'MSG'
feat: 退避スペースの中身を配置図に「置き場未定」として載せる

退避エリアの fills から欄を作る stashSlots() を足し、上段の欄の末尾へ
連結する。これで既存の「下段の空きへ回す → 追記欄 → 警告」の階段に
そのまま乗る。下段へ回った欄は注釈が ※退避 に化けないようにする。

追記欄に入る順は、欄数超過が先・退避が後になるよう並べ直す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 3: 追記欄のまとめ欄

追記欄は2項目しか無い。3件以上あふれた日に紙から荷物が消えないよう、
2枠目を「まとめ欄」にして残り全部を縦積みする。

**Files:**
- Modify: `files/index.html`
  - `arrangeOverflowSlots()`（4480 行付近）
  - `overflowTable()`（4733 行付近）
- Test: `tests/stash-overflow.test.js`

**Interfaces:**
- Consumes: Task 2 の `stash` フラグ（注記の出し分けに使う）
- Produces: まとめ欄は `{group:[欄, 欄, ...]}` という形の要素。`overflowTable()` だけがこれを解釈する。`arrangeOverflowSlots()` の戻り値の形（`{overflow, unlisted}`）は変えない

- [ ] **Step 1: Write the failing test**

```js
test("追記欄は3件以上あるとき2枠目にまとめて記載する", () => {
  const fn = functionSource("arrangeOverflowSlots");
  // 2件以内は従来どおり
  assert.match(fn, /entries\.length<=2/);
  // 3件以上は2枠目を group にする
  assert.match(fn, /group:\s*entries\.slice\(1\)/);
  // 紙に出ない項目は出さない
  assert.match(fn, /unlisted:\s*\[\]/);
});

test("まとめ欄は品名・ロット・パレット数を縦積みで書く", () => {
  const fn = functionSource("overflowTable");
  assert.match(fn, /e\.group\s*\|\|\s*\[e\]/);
  assert.match(fn, /fitcol/);
});

test("まとめ欄の注記は重複を畳む", () => {
  // 置き場未定が3件あっても ※置き場未定 は1回だけ書く
  const fn = functionSource("overflowTable");
  assert.match(fn, /new Set\(/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stash-overflow.test.js`
Expected: FAIL（`arrangeOverflowSlots` に `entries.length<=2` が無い）

- [ ] **Step 3: `arrangeOverflowSlots()` を直す**

```js
/* 通常欄から漏れた項目は追記欄に記載する。枠は2つしかないので、
   3件以上ある日は2枠目を「まとめ欄」にして残り全部を縦積みする。
   置き場所の無い荷物を紙から落とすと現場に伝わらないため、
   文字が小さくなっても載せるほうを選ぶ（設計書 §4-5）。 */
function arrangeOverflowSlots(entries){
  if(entries.length<=2) return {overflow:entries, unlisted:[]};
  return {overflow:[entries[0], {group:entries.slice(1)}], unlisted:[]};
}
```

`unlisted` は空配列のままにする。返す形は変えないので、
`renderResult()` の `pl.unlisted.length` を見る警告（2290 行付近）は
そのまま残り、条件が成り立たなくなるだけになる。

- [ ] **Step 4: `overflowTable()` を直す**

```js
// 追記欄の1項目は、右端2列の中で品名・ロット・P数・注記を縦に記載する。
// まとめ欄（{group:[...]}）は、その4種それぞれを件数ぶん縦積みにする。
function overflowTable(entries){
  if(!entries.length) return "";
  const span=v=>v?`<span class="fit">${esc(v)}</span>`:"";
  const cell=(e,kind)=>{
    const gs=e.group||[e];
    const textOf=(g)=>{
      const l=g.lot, ms=g.members||[g];
      if(kind==="name")   return l.name||"";
      if(kind==="lot")    return ms.map(m=>m.lot.lot).filter(Boolean).join("/");
      if(kind==="pallet") return palSlotTextOf(ms);
      return g.note||slotAreaNote(g.areas);
    };
    let cls="slot";
    let inner;
    if(e.group){
      // まとめ欄。注記は同じ文言が並ぶので重複を畳む
      const texts=gs.map(textOf).filter(Boolean);
      const vals=(kind==="note") ? [...new Set(texts)] : texts;
      inner=`<span class="fitcol">${vals.map(span).join("")}</span>`;
    }else{
      // 1項目の欄。ロット番号が3つ以上あるときだけ従来どおり縦積みにする
      const ms=gs[0].members||[gs[0]];
      const lots=(kind==="lot") ? ms.map(m=>m.lot.lot).filter(Boolean) : null;
      inner=(lots && lots.length>=3)
        ? `<span class="fitcol">${lots.map(span).join("")}</span>`
        : span(textOf(gs[0]));
    }
    if(kind==="note") cls+=" c-note";
    else cls+=" c-"+({name:"name",lot:"lot",pallet:"pal"}[kind]);
    const edge=kind==="name"?"bt2 bb2 bl2 br2":kind==="note"?"bl2 br2 bb2":"bl2 br2";
    const fit={name:"name",lot:"lot",pallet:"pal",note:"note"}[kind];
    return `<tr><td class="${cls} ${edge}" data-fit="${fit}">${inner}</td></tr>`;
  };
  const records=entries.map(e=>["name","lot","pallet","note"].map(k=>cell(e,k)).join(""));
  return `<table class="overflow-table">${records.join('<tr class="overflow-gap"><td></td></tr>')}</table>`;
}
```

元の実装との違いは次の3点だけで、1項目の欄の見た目は変わらない。

- `e.group` があるときは4種すべてを縦積みにする
- 注記の縦積みだけ重複を畳む
- `cls` の組み立てを `if/else` に分けた（元は `kind!=="note"` の1行）

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/stash-overflow.test.js`
Expected: PASS（9 件）

- [ ] **Step 6: 既存のテストが壊れていないことを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（119 件）

- [ ] **Step 7: ブラウザで手動確認 —— まとめ欄が出る日を作る**

1. 上段（軒下）と下段（メイン）の欄が埋まるだけの荷物を入力する
2. さらに荷物を足し、退避へ3件以上の別ロットを逃がす
3. 配置図タブ → 追記欄の**1枠目に1項目、2枠目に残り全部が縦積み**で出る
4. 2枠目の注記が `※置き場未定` 1行だけになっている（3件あっても3行並ばない）
5. **ブラウザの印刷プレビューを開き、1ページに収まることを確かめる**（`Cmd/Ctrl+P`）
   - 収まらない場合は、まとめ欄の件数が多い日にどれだけ高さが伸びるかを記録し、
     実装を止めて相談する。`PRINT_ZOOM` や行高の調整は設計の判断が要る

- [ ] **Step 8: Commit**

```bash
git add tests/stash-overflow.test.js files/index.html
git commit -m "$(cat <<'MSG'
feat: 追記欄が足りない日は2枠目にまとめて記載する

追記欄は2項目しかないため、3件以上あふれた日は紙から荷物が消えていた。
2枠目をまとめ欄にし、残り全部の品名・ロット・パレット数を縦積みする。
注記は同じ文言が並ぶので重複を畳む。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 4: あふれ荷物を退避へ自動で入れる

`run()` の自動配置のあとに `lot.rem` を退避へ積む。
退避の実効容量（56P）を超える分は入れずに知らせる。あわせて `renderResult()` の文言を直す。

**Files:**
- Modify: `files/index.html`
  - `stashTotal()` の直後（3298 行付近）に `stashFreeRoom()` を足す
  - `run()`（2392 行付近）
  - `renderResult()`（2316-2327 行付近）
  - 退避スペースの説明文（700 行付近）
- Test: `tests/stash-overflow.test.js`

**Interfaces:**
- Consumes: `putToStash(sp,lotId,count)`（3300 行）、`stashTotal(sp)`（3294 行）、`STASH_MAX_COLS`(14) / `STASH_COL_H`(4)（3279-3280 行）、`lot.rem`（`place()` が立てる）
- Produces: `stashFreeRoom(sp)` → 退避にあと何枚積めるか（整数）。`lot.noRoom` → 退避にも入らなかった枚数。`renderResult()` がこれを読む

- [ ] **Step 1: Write the failing test**

```js
test("あふれた分を退避スペースへ入れる", () => {
  const fn = functionSource("run");
  assert.match(fn, /l\.rem>0/);
  assert.match(fn, /putToStash\(lastSp,\s*l\.id,/);
  // 前回の退避を積み戻したあとに置く（先に置くと前回分の居場所を食う）
  const back = fn.indexOf("l.stashed");
  const auto = fn.indexOf("l.rem>0");
  assert.ok(back !== -1 && auto !== -1 && back < auto,
    "あふれの投入は退避の積み戻しより後に置くこと");
});

test("退避の実効容量は列数×列高から数える", () => {
  const fn = functionSource("stashFreeRoom");
  // 初期列は h:7 だが repackStash() が h:4 で積み直すので、実効は 14×4=56P
  assert.match(fn, /STASH_MAX_COLS\s*\*\s*STASH_COL_H/);
  assert.match(fn, /stashTotal\(/);
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
  assert.match(fn, /置き場未定として配置図に載ります/);
  assert.doesNotMatch(fn, /配置図の表には出ません。倉庫内・倉庫外へ戻してください/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stash-overflow.test.js`
Expected: FAIL（`stashFreeRoom must exist`、`run` に `l.rem>0` が無い）

- [ ] **Step 3: `stashFreeRoom()` を足す**

`stashTotal()` の直後（3298 行付近）に置く。

```js
/* 退避にあと何枚積めるか。
   DEFAULT_SPACES の退避は初期3列が h:7 なので putToStash() だけなら 65P 入るが、
   描画の前に走る ensureStashRoom() → repackStash() が全部の列を h:4 で積み直し、
   そのとき列数の上限を見ない。65P を入れると 17 列になって STASH_MAX_COLS(14) を超え、
   隅の小さな盤の描画が崩れる。したがって実効の上限は 14×4=56P で数える。 */
function stashFreeRoom(sp){
  return Math.max(0, STASH_MAX_COLS*STASH_COL_H - stashTotal(sp));
}
```

- [ ] **Step 4: `run()` にあふれの投入を足す**

`lots.forEach(l=>{ if(l.stashed){ ... } });`（2392 行）の**直後**に足す。

```js
  // あふれた分は退避スペースへ逃がす。倉庫に置き場所が無い荷物は
  // 紙に「置き場未定」として載せる必要があり、退避がその受け皿になる。
  // 前回の退避を積み戻したあとに置くこと。先に置くと前回分の居場所を食う。
  lots.forEach(l=>{
    l.noRoom=0;
    if(!(l.rem>0)) return;
    const put=Math.min(l.rem, stashFreeRoom(lastSp));
    if(put>0) putToStash(lastSp,l.id,put);
    l.noRoom=l.rem-put;                 // 退避にも入らなかった分。紙にも出ない
  });
```

`lot.rem` は 0 にしない。入力タブの「あふれ NP」と警告文がこの値を読むため
（設計書 §3-2。翌回の `run()` では退避分が `pallets` から引かれるので `rem` は 0 になる）。

- [ ] **Step 5: `renderResult()` の文言を直す**

2316-2327 行を次のように置き換える。

```js
  // 退避に残っている荷物は「置き場未定」として紙に載る（stashSlots）。
  // 現物がどこにあるか決まっていないので、残っていること自体は知らせ続ける。
  const stashN=stashTotal(sp);
  if(stashN>0){
    warnHtml+=`<div class="msg warn">⚠ 退避スペースに ${stashN}P 残っています。置き場未定として配置図に載ります。倉庫に空きができたら戻してください。</div>`;
  }
  // 退避にも入らなかった分は盤にも紙にも出ない。ここでしか知らせる場所がない
  const noRoom=lots.filter(l=>l.noRoom>0);
  if(noRoom.length){
    warnHtml+=`<div class="msg warn">⚠ 退避スペースに入りきらない荷物があります：${
      noRoom.map(l=>`${l.name}(${l.code}) ${l.noRoom}P`).join(" / ")}。配置図にも出ません。</div>`;
  }
  if(over.length){
    m.innerHTML=warnHtml+`<div class="msg warn">⚠ 入りきらない荷物があります：${
      over.map(l=>`${l.name}(${l.code}) ${l.rem}P`).join(" / ")
    }。退避スペースへ移し、置き場未定として配置図に載せます。</div>`;
  }else{
    let notes=[]; if(usedAisle)notes.push("通路へのはみ出しあり"); if(usedMix)notes.push("混載あり");
    const tail=notes.length?"（"+notes.join("・")+"）":"";
    // 退避に残っている日は「すべて配置した」と言えない。倉庫に置いた分の話だと明示する
    m.innerHTML=warnHtml+(stashN>0
      ? `<div class="msg ok">✅ 倉庫に置く分はすべて配置しました。${tail}</div>`
      : `<div class="msg ok">✅ すべてのパレットを配置しました。${tail}</div>`);
  }
```

`renderResult()` は `redraw()` からも引数付きで呼ばれるが、`lots` はどちらの経路でも渡る。
`l.noRoom` が未定義の経路（保存した手動配置の復元）では `undefined>0` が false になるので、
`noRoom` は空配列になり、警告は出ない。

- [ ] **Step 6: 退避スペースの説明文を直す**

700 行付近。

```html
<p class="stashlead">倉庫には無い、画面の上だけの置き場。編集のあいだ荷物を逃がして、倉庫の側を空けるために使います。ここに残った荷物は、配置図に「置き場未定」として載ります。</p>
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test tests/stash-overflow.test.js`
Expected: PASS（14 件）

- [ ] **Step 8: 既存のテストが壊れていないことを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（119 件）

既存のテストが「⚠ 退避スペースに NP 残っています。配置図の表には出ません。」や
「✅ すべてのパレットを配置しました」を照合していて落ちた場合は、
**テストの側を新しい文言に直す**。

- [ ] **Step 9: ブラウザで手動確認**

1. 倉庫の収容能力を超える量を入力して「▶ 自動配置を作成」
   - 収容能力は配置編集タブの ⚙ に出る（`showCapacity`）
2. **あふれた分が退避スペースに現れる**。合計が入力と合う
3. 配置図タブ → あふれた荷物が `※置き場未定` の欄で出る
4. もう一度「▶ 自動配置を作成」を押す
   - 退避の中身が残る。入力タブの「あふれ NP」が 0 になる（設計書 §3-2）
   - ✅ ではなく「✅ 倉庫に置く分はすべて配置しました」が出て、退避の警告が併記される
5. 56P を超える量があふれる入力を作る
   - 入る分だけ入り、残りが「⚠ 退避スペースに入りきらない荷物があります」に出る
   - **盤の退避スペースの列が 14 本を超えない**

- [ ] **Step 10: Commit**

```bash
git add tests/stash-overflow.test.js files/index.html
git commit -m "$(cat <<'MSG'
feat: 倉庫に入りきらない荷物を退避スペースへ逃がす

自動配置であふれた分を退避へ積み、配置図に「置き場未定」として
載せる。退避の実効容量は repackStash() が h:4 で積み直すため 56P で、
超える分は入れずに知らせる（黙って荷物が消える経路を残さない）。

退避に荷物が残る日は「すべてのパレットを配置しました」と言えないので、
倉庫に置いた分の話だと明示する文言に分ける。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 5: 配置編集タブを離れるときの確認

タブボタンの `onclick` に `leaveEdit()` を挟む。`switchTab()` には入れない。

**Files:**
- Modify: `files/index.html`
  - タブボタン 4 個（583-586 行）
  - `switchTab()` の直前（2549 行付近）に `leaveEdit()` を足す
- Test: `tests/stash-overflow.test.js`

**Interfaces:**
- Consumes: `switchTab(name)`（2549 行）、`stashTotal(sp)`（3294 行）、`lastSp`（972 行で `null` に初期化済み）
- Produces: `leaveEdit(name)` → タブボタンの新しい入口

- [ ] **Step 1: Write the failing test**

```js
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
  assert.match(fn, /置き場未定として配置図に載ります/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/stash-overflow.test.js`
Expected: FAIL（タブボタンがまだ `switchTab` を直に呼んでいる）

- [ ] **Step 3: `leaveEdit()` を足す**

`switchTab()` の直前（2549 行付近）に置く。

```js
/* タブを人が押したときの入口。退避に荷物が残っているなら一度止めて聞く。
   switchTab() の側には置かないこと。printSheet() と beforeprint のハンドラが
   switchTab('sheet') を直に呼んでおり、そこに confirm を挟むと
   タブが切り替わらないまま印刷が走って白紙になる。
   beforeprint の中の confirm はブラウザに抑止されることもある。 */
function leaveEdit(name){
  const edit=document.getElementById("tab-edit");
  const onEdit=edit && edit.style.display!=="none";
  const n=stashTotal(lastSp);
  if(onEdit && name!=="edit" && n>0 &&
     !confirm(`退避スペースに ${n}P 残っています。\n置き場未定として配置図に載ります。このまま移動しますか？`)) return;
  switchTab(name);
}
```

- [ ] **Step 4: タブボタンを差し替える**

583-586 行。

```html
  <button class="tab active" id="tabbtn-input" onclick="leaveEdit('input')">入力</button>
  <button class="tab" id="tabbtn-edit" onclick="leaveEdit('edit')">配置編集</button>
  <button class="tab" id="tabbtn-sheet" onclick="leaveEdit('sheet')">配置図</button>
  <button class="tab" id="tabbtn-settings" onclick="leaveEdit('settings')">設定<span class="dot" id="regDot">0</span></button>
```

`run(goMap)` の末尾の `switchTab('edit')`（2401 行）は変えない。
配置編集タブへ**入る**方向なので確認は要らない。

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/stash-overflow.test.js`
Expected: PASS（17 件）

- [ ] **Step 6: 既存のテストが壊れていないことを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（119 件）

タブボタンの `onclick` を照合しているテストがあれば `leaveEdit` に直す。

- [ ] **Step 7: ブラウザで手動確認**

1. 退避に荷物を残したまま「配置図」タブを押す → 確認が出る
2. キャンセル → **配置編集タブのまま**。選択も帯も残っている
3. OK → 配置図タブへ移る
4. 退避が空のときはタブを押しても確認が出ない
5. **印刷ボタンを押す** → 確認が出ず、紙が出る（白紙でない）
6. **配置編集タブで `Cmd/Ctrl+P`** → 確認が出ず、配置図が紙に出る（白紙でない）

5 と 6 は今回の変更でいちばん壊れやすい。必ず両方やること。

- [ ] **Step 8: Commit**

```bash
git add tests/stash-overflow.test.js files/index.html
git commit -m "$(cat <<'MSG'
feat: 退避を残したままタブを離れるときに確認する

タブボタンの onclick に leaveEdit() を挟む。switchTab() には入れない。
printSheet() と beforeprint が switchTab('sheet') を直に呼んでおり、
そこで止めると印刷が白紙になるため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## Task 6: 仕上げ —— キャッシュの版と設計書の追従

**Files:**
- Modify: `files/sw.js`（6 行）
- Modify: `docs/superpowers/specs/2026-09-03-stash-space-and-sweep-select-design.md`（§2-4）
- Modify: `docs/superpowers/specs/2026-09-15-next-features-notes.md`（§3・§用語）
- Modify: `docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md`（§10-1 のコマンド）

**Interfaces:**
- Consumes: Task 1〜5 の実装
- Produces: なし（ドキュメントと配布の手当て）

- [ ] **Step 1: `CACHE_VERSION` を上げる**

`files/sw.js:6`

```js
const CACHE_VERSION = "v52";
```

上げないと実機（Pixel 9a / Android Chrome）に古い版が出続ける。

- [ ] **Step 2: 退避スペースの設計書に追記する**

`docs/superpowers/specs/2026-09-03-stash-space-and-sweep-select-design.md` の
§2-4「紙に出ないことを知らせる」の末尾に足す。

```markdown
**2026-09-17 追記**: この前提は変わった。退避の中身は配置図に
「置き場未定」として載るようになった（`docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md`）。
`sheet:"none"` は残っているが、欄は `stashSlots()` という別経路で作る。
警告の趣旨も「出ないから戻せ」から「置き場未定として出る」に変わった。
§2-5（設定テキストから外す）は変わらない。
```

- [ ] **Step 3: 要件メモを更新する**

`docs/superpowers/specs/2026-09-15-next-features-notes.md`

- §3 の見出しに実装済みであることと設計書の場所を書く
- §用語 の「掲載先の属性値 `over` のラベルもこれに合わせる」に取り消し線か注記を入れ、
  実際には `over＝掲載しない` にしたことと、その理由（`over` は追記欄とは別物）を書く
- 「項目単位の枠線」を未着手の別件として残す（2026-09-17 のブレストで範囲外にしたもの）

- [ ] **Step 4: 設計書のテストコマンドを直す**

`docs/superpowers/specs/2026-09-17-stash-overflow-sheet-design.md` の §10-1。

```bash
node --test tests/sheet-placement.test.js tests/stash-overflow.test.js
```

`node --test tests/` は Node v22.15.0 ではディレクトリを解決できず失敗する。

- [ ] **Step 5: すべてのテストを通す**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`
Expected: PASS（119 + 17 件）

- [ ] **Step 6: Commit**

```bash
git add files/sw.js docs/
git commit -m "$(cat <<'MSG'
chore: PWA キャッシュの版を上げ、設計書を追従させる

退避の中身が紙に載るようになったので、2026-09-03 の設計書 §2-4 の
前提に追記する。要件メモの §3 を実装済みにし、over のラベルについて
決定を上書きした経緯を残す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## 実機での確認（マージ前）

ターミナルで次を実行し、Pixel 9a / Android Chrome から開く。

```bash
python3 -m http.server 8765 --directory files
```

`http://<このPCのIP>:8765` を実機で開き、次を確かめる。

1. 倉庫を超える量を入力して自動配置 → あふれが退避に入る
2. 配置図が読める。`※置き場未定` の欄がある
3. 追記欄のまとめ欄が出る日、文字が読める大きさで出ている
4. 実機から印刷（または PDF 出力）して1ページに収まる
5. 退避を残したままタブを押すと確認が出る

自動テストは次のコマンドで回す。

```bash
node --test tests/sheet-placement.test.js tests/stash-overflow.test.js
```
