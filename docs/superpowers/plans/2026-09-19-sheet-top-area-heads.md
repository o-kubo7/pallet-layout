# 配置図 上段のエリア見出し 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の上段で、いま注釈行に散っている置き場所の情報を見出し行のグループへまとめ、グループの境目を 2px の縦罫で区切る。

**Architecture:** 純粋関数を2つ（`topHeadGroups()` / `topSlotNote()`）新設し、`renderSheet()` はその結果を並べるだけにする。`slotCells()` には「左辺を太くする欄の index」を受け取る引数を1つ足し、見出し・品名・ロット・P数の4行で同じ位置に縦罫を通す。注釈行は行ごと残し、見出しのエリアだけでは特定できない欄にだけ注釈を出す。

**Tech Stack:** 単一 HTML ファイルに埋め込んだ素の JavaScript / CSS。テストは Node 標準の `node:test`。`functionSource()` で関数本体を抜き出し `new Function()` に流すサンドボックス方式。

**Spec:** `docs/superpowers/specs/2026-09-19-sheet-top-area-heads-design.md`

## Global Constraints

- 変更するファイルは `files/index.html`、`files/sw.js`、`tests/sheet-placement.test.js` の3つだけ
- テストの実行コマンドは `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`。**`node --test tests/` は Node v22.15.0 ではディレクトリを解決できず失敗する**ので使わない
- 着手前のベースラインは **157 件パス**
- エリア名（「軒下①」「PC横」など）をコードの条件式に書かない。エリアは `e.areas` と `sheetAreas("top")[0]` から引く
- 例外は2つだけ。固定文字 **`"軒下"`**（グループが1つでキーが先頭エリアのとき、および上段が空のとき）と、退避のラベル **`"未定"`**。どちらも設計書 §5-2 で承認済み
- 行1の `colspan` の合計は `5 + 1 + Σ(slots*2)` が `lay.cols`（normal 14 / wide 18）に**必ず**一致すること。ずれると `table-layout:fixed` が `colgroup` の幅を無視して列を詰め、盤のマスと欄の位置と引き出し線が同時に狂う
- 注釈行（`tr.note-row`）は削除しない。行の高さ 16px を維持する
- 触らないもの: `sheetPlacement()` の戻り値と引数 / `sheetSlots()` / `sheetEntries()` / `mergeEntries()` / `stashSlots()` / `arrangeBottomSlots()` / `arrangeOverflowSlots()` / `overflowTable()` / `drawLeaders()` / `gridRows()` / `sheetGridAnchors()` / `gridWarn()` / 下段の見出し・欄・注釈行 / 保存形式 / `spacesToText()` / `applyConfig()`
- 日本語のコメントは既存の文体に合わせる（何をするかではなく、なぜそうするかを書く）
- 各タスクの最後に必ずコミットする。コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける
- 行番号は 2026-09-19 時点（`files/index.html` 全 5451 行）。**着手時に `grep` で取り直すこと**

## 着手前の確認

```bash
node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -5
```

`# pass 157` / `# fail 0` を確認してから始める。

```bash
grep -n 'colspan="${lay.top\*2}">軒下' files/index.html
grep -n 'function slotCells' files/index.html
grep -n 'const FIT_LABEL' files/index.html
grep -n 'function slotAreaNote' files/index.html
```

---

## File Structure

- `files/index.html`
  - `topSlotNote()` を新設（`slotAreaNote()` の直後）— 上段の欄の注釈を作る
  - `topHeadGroups()` を新設（`topSlotNote()` の直後）— 上段の欄をグループへ割る
  - `slotCells()` を変更 — `sepAt` 引数を足す
  - `renderSheet()` を変更 — 行1〜行5
  - `fitSheetText()` を変更 — 見出し用の警告
  - CSS `.sheet td.ttl.gsep, .sheet td.slot.gsep` を追加
- `files/sw.js` — `CACHE_VERSION` を v54 → v55
- `tests/sheet-placement.test.js` — 末尾にテストを追加、既存の CACHE_VERSION テストを更新

新しいファイルは作らない。`files/index.html` の単一ファイル構成を維持する。

---

## Task 1: 上段の欄の注釈を作る純粋関数

**Files:**
- Modify: `files/index.html`（`slotAreaNote()` の直後に追加。現在 4490 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: なし
- Produces: `topSlotNote(e) -> string`。`e` は配置図の欄（`{lot, pallets, areas, note, stash?}`）。戻り値は `"※出庫口横"` の形か空文字

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-placement.test.js` の末尾（`functionSource` の定義より前でも後でもよい。関数宣言は巻き上がる）に追加する。

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL。`functionSource` の中の `assert.notEqual(start, -1, "topSlotNote must exist")` で落ちる。

- [ ] **Step 3: 実装する**

`files/index.html` の `slotAreaNote()` の直後に足す。

```js
/* 上段の欄の注釈。グループキー（areas[0]）を省いた残りだけを出す。
   上段の見出しはエリアのまとまりを表すので、欄ごとの注釈は
   「見出しのエリアだけでは場所を特定できない欄」＝複数エリアにまたがる欄に絞る。
   sheetEntries() の note は「段の基準エリアを省く」という別の規則なので、
   そちらには手を入れずここで作り直す（設計書 §3-5）。 */
function topSlotNote(e){
  const areas=(e&&e.areas)||[];
  return areas.length>1 ? "※"+areas.slice(1).join("・") : "";
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 158` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 上段の欄の注釈を作る関数を足す

見出しに移さない注釈（複数エリアにまたがる欄）だけを出す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 上段の欄をグループへ割る純粋関数

**Files:**
- Modify: `files/index.html`（`topSlotNote()` の直後に追加）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: なし
- Produces: `topHeadGroups(entries, count, baseArea) -> [{label: string, slots: number}]`。
  `entries` は `sheetPlacement().top`、`count` は `lay.top`、`baseArea` は `sheetAreas("top")[0]`（無ければ `null`）。
  `slots` の合計は必ず `count` に一致する

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL。`topHeadGroups must exist` で5件落ちる。

- [ ] **Step 3: 実装する**

`files/index.html` の `topSlotNote()` の直後に足す。

```js
/* 上段の欄をエリアごとのグループに割る。見出し行のセルを作るのに使う。
   entries は sheetPlacement() の top、count は lay.top。
   紙に出るのは先頭 count 件だけ（renderSheet() が slotCells(top,lay.top,…) で切る）なので、
   ここでも先頭だけを見る。slots の合計は必ず count に一致させること。
   ずれると行1の colspan が合わず、table-layout:fixed が colgroup の幅を無視して
   列を詰める（盤のマスと欄の位置、引き出し線の座標が同時に狂う）。

   隣り合う欄だけを見るので、同じエリアの欄が離れて並ぶと見出しが重複して出る。
   いまそれが起きないのは、top の並びが sheetAreas("top") の順であること、および
   「上段があふれる日（moved）」と「下段から欄が回ってくる日（movedBottom）」が
   排他であること（前者は top.length>lay.top、後者は lay.top>top.length が条件）に
   依存している。sheetPlacement() の並べ方を変えるときはここも見直すこと。 */
function topHeadGroups(entries, count, baseArea){
  const groups=[];
  (entries||[]).slice(0,count).forEach(e=>{
    // 退避は倉庫のエリアではないので、場所ではなく状態で呼ぶ（stashSlots の ※未定 と揃える）
    const stash=!!(e&&e.stash);
    const key=stash ? "未定" : ((e&&e.areas&&e.areas[0])||"");
    const names=stash ? ["未定"] : ((e&&e.areas)||[]);
    const last=groups[groups.length-1];
    if(last && last.key===key){
      last.slots++;
      names.forEach(n=>{ if(!last.names.includes(n)) last.names.push(n); });
    }else{
      groups.push({key, slots:1, names:names.slice()});
    }
  });
  // 荷物が無い日と、先頭エリアだけの日は固定の見出しにする。
  // 日常の大半はここに落ちるので、現場が毎日見る紙の見た目を変えない。
  // 逆にこの条件を「グループが1つ」だけに緩めると、出庫口横だけ・退避だけの日にも
  // 「軒下」と出て置き場所が紙から消える（設計書 §3-3）
  if(!groups.length || (groups.length===1 && baseArea && groups[0].key===baseArea)){
    return [{label:"軒下", slots:count}];
  }
  // 上段に空欄がある日は合計が count に足りない。末尾のグループで吸わせる
  const used=groups.reduce((a,g)=>a+g.slots,0);
  if(used<count) groups[groups.length-1].slots+=count-used;
  // 3エリア以上を1欄ぶんの幅に連結すると 0.4 の圧縮下限を割って折り返す。
  // 見出し行が伸びるより、盤を見て確かめてもらうほうを選ぶ（設計書 §5-3）
  return groups.map(g=>({
    label: g.names.length<=2 ? g.names.join("・") : g.names.slice(0,2).join("・")+" ほか",
    slots: g.slots,
  }));
}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 163` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 上段の欄をエリアごとのグループへ割る関数を足す

見出しの欄数の合計は常に上段の欄数に一致させる。
先頭エリアだけの日と空の日は従来どおり「軒下」1つにする。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 区切り線の指定を `slotCells()` で受け取る

**Files:**
- Modify: `files/index.html`（`slotCells()`。現在 4835 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: なし
- Produces: `slotCells(entries, count, kind, extra, sepAt)`。`sepAt` は「左辺を 2px にする欄の index」の `Set`（省略可）。省略時の振る舞いは従来どおり

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL。`tds[1]` に `gsep` が無い。

- [ ] **Step 3: 実装する**

`slotCells()` のシグネチャと、クラスを組み立てる箇所を変える。

```js
function slotCells(entries,count,kind,extra,sepAt){
```

`if(kind!=="note") cls+=" c-"+fk;` の直後に足す。

```js
    // グループの境目の欄だけ左辺を太くする。見出し行と同じ index を渡してもらうので、
    // 見出し・品名・ロット・P数 の4行で線が縦に揃う。注釈行には引かない
    if(sepAt && sepAt.has(i) && kind!=="note") cls+=" gsep";
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 164` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 欄のセルにグループの区切り線を指定できるようにする

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 見出し行をグループごとのセルにする

**Files:**
- Modify: `files/index.html`（`renderSheet()` の行1。現在 4760〜4762 行／CSS は `.sheet td.ttl` の直後、現在 444 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: `topHeadGroups(entries, count, baseArea)`（Task 2）
- Produces: `renderSheet()` の中のローカル変数 `heads`（`topHeadGroups()` の戻り値）と `gsep`（`Set`）。Task 5 と Task 6 が同じ変数を使う

- [ ] **Step 1: 失敗するテストを書く**

```js
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
  assert.match(fn, /<span class="fit">\$\{esc\(g\.label\)\}<\/span>/);
});

test("グループの境目のセルは左辺を2pxにする", () => {
  assert.match(source, /\.sheet td\.ttl\.gsep,\.sheet td\.slot\.gsep\{border-left-width:2px\}/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL 2件。`renderSheet` に `topHeadGroups` が無い、CSS が無い。

- [ ] **Step 3: 実装する**

`renderSheet()` の `const E='<td class="none"></td>';` と `let rows="";` の間に足す。

```js
  // 上段の欄をエリアごとにまとめ、見出しをグループに分ける。
  // 注釈行に1欄ずつ散っていた置き場所を、まとまりとして1か所で読めるようにする
  const heads=topHeadGroups(top, lay.top, sheetAreas("top")[0]||null);
  // グループの境目にあたる欄の index。先頭グループの左辺は既存の bl2 が引くので入れない
  const gsep=new Set();
  let gacc=0;
  heads.forEach((g,i)=>{ if(i) gsep.add(gacc); gacc+=g.slots; });
```

行1（`<td class="ttl bb2" colspan="${lay.top*2}">軒下</td>` を含む行）を差し替える。

```js
  // 行1：月日（列1から）＋ 上段の見出し（下は太罫）
  rows+=`<tr><td class="hd" colspan="5"><div class="fldrow c5">`
      + `<span>${mm}</span><span>月</span><span>${dd}</span><span>日</span></div></td>${E}`
      + heads.map((g,i)=>`<td class="ttl bb2${i?" gsep":""}" data-fit="head" colspan="${g.slots*2}">`
          + `<span class="fit">${esc(g.label)}</span></td>`).join("")
      + `</tr>`;
```

CSS は `.sheet td.ttl{…}` の直後に足す。

```css
  /* グループの境目。見出しから P数 の行まで同じ位置で縦に貫く */
  .sheet td.ttl.gsep,.sheet td.slot.gsep{border-left-width:2px}
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 166` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 配置図の上段の見出しをエリアごとに分ける

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 区切り線を品名・ロット・P数の行に通す

**Files:**
- Modify: `files/index.html`（`renderSheet()` の行2・行3・行4。現在 4766〜4777 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: `gsep`（Task 4 で作ったローカル変数）、`slotCells(…, sepAt)`（Task 3）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```js
test("グループの区切り線は上段の品名・ロット・P数の行にも通す", () => {
  // 見出し行だけ 2px、下の行が 1px だと線が途中で細くなる
  const fn = functionSource("renderSheet");
  assert.match(fn, /slotCells\(top,lay\.top,"name","bb2",gsep\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"lot",null,gsep\)/);
  assert.match(fn, /slotCells\(top,lay\.top,"pallet",null,gsep\)/);
  // 下段には渡さない（下段は今回変更しない）
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"name","bb2"\)/);
  assert.match(fn, /slotCells\(bottom,lay\.bottom,"lot"\)/);
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL。`slotCells(top,lay.top,"name","bb2",gsep)` が無い。

- [ ] **Step 3: 実装する**

行2（品名）:

```js
      + `${E}${slotCells(top,lay.top,"name","bb2",gsep)}</tr>`;
```

行3（ロット）:

```js
      + `${slotCells(top,lay.top,"lot",null,gsep)}</tr>`;
```

行4（P数）:

```js
  rows+=`<tr class="r3">${E}${slotCells(top,lay.top,"pallet",null,gsep)}</tr>`;
```

下段（行7〜行9）は触らない。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 167` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: グループの区切り線を上段の4行に通す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 上段の注釈行を空欄で残し、またがる欄だけ注釈を出す

**Files:**
- Modify: `files/index.html`（`renderSheet()` の行5とその直前のコメント。現在 4779〜4783 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: `topSlotNote(e)`（Task 1）
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```js
test("上段の注釈行は残し、またがる欄にだけ注釈を出す", () => {
  // 行そのものは残す。あとで足す配置図のテキスト編集で、
  // 上段にも自由記入できる欄として使うため（設計書 §3-5）
  const fn = functionSource("renderSheet");
  assert.match(fn, /<tr class="note-row"><td class="none" colspan="5"><\/td>/);
  assert.match(fn, /top\.slice\(0,lay\.top\)\.map\(e=>e\?\{\.\.\.e,note:topSlotNote\(e\)\}:e\)/);
  assert.match(fn, /slotCells\(topNotes,lay\.top,"note"\)/);
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL 2件。

- [ ] **Step 3: 実装する**

行5とその直前のコメントを差し替える。

```js
  // 行5：上段の注釈。行3 の rowspan は行4 までしか届かないので、
  //      左5列はこの行で自分で埋める（5 + 1 + lay.top×2 = lay.cols。normal は 5+1+4×2=14 列、wide は 5+1+6×2=18 列）
  //      置き場所は見出しへ移したので、ここに出すのは見出しのエリアだけでは
  //      特定できない欄（複数エリアにまたがる欄）だけ。行そのものは残す。
  //      普段の日は全部空欄になるが、あとで足す配置図のテキスト編集で
  //      上段にも自由記入できる欄として使う（設計書 §3-5）
  const topNotes=top.slice(0,lay.top).map(e=>e?{...e,note:topSlotNote(e)}:e);
  rows+=`<tr class="note-row"><td class="none" colspan="5"></td>${E}`
      + `${slotCells(topNotes,lay.top,"note")}</tr>`;
```

元の欄（`top` の中身）は書き換えず浅く複製する。`members` と `areas` の配列は共有するので、
それらを書き換えてはいけない（`sheetPlacement()` の `moved` / `movedBottom` と同じ作法）。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 169` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
fix: 上段の注釈をまたがる欄だけに絞り、行は空欄で残す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 見出しが入りきらないときの案内を分ける

**Files:**
- Modify: `files/index.html`（`FIT_LABEL`。現在 4651 行／`fitSheetText()` の警告。現在 4712〜4716 行付近）
- Test: `tests/sheet-placement.test.js`（末尾に追加）

**Interfaces:**
- Consumes: Task 4 で付けた `data-fit="head"`
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | tail -20`

Expected: FAIL。`head:"見出し"` が無い。

- [ ] **Step 3: 実装する**

`FIT_LABEL` に足す。

```js
const FIT_LABEL = {name:"品名", lot:"ロット", pal:"P数", note:"注釈", head:"見出し"};
```

`fitSheetText()` の警告の組み立てを差し替える。

```js
  const parts=Object.keys(over).map(k=>`${FIT_LABEL[k]||k} ${over[k].size}件`);
  if(parts.length){
    // 見出しは表示設定（--fs-*）の対象外で、品名でもない。直せるのはエリア名だけなので、
    // あふれたのが見出しか欄かで案内を分ける。両方あふれた日は両方出す
    const hasHead="head" in over;
    const hasSlot=Object.keys(over).some(k=>k!=="head");
    let how="";
    if(hasSlot) how+="設定タブの「表示設定」で文字を小さくするか、品名を短くしてください。";
    if(hasHead) how+="見出しは設定タブの「配置マス」でエリア名を短くしてください。";
    html+=`<div class="msg warn">⚠ 文字が入りきらない欄があります：${parts.join(" / ")}。${how}</div>`;
  }
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 170` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
fix: 見出しがあふれたときの案内をエリア名の短縮に変える

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: PWA のキャッシュ版を上げ、ブラウザと実機で確かめる

**Files:**
- Modify: `files/sw.js`（`CACHE_VERSION`。現在 6 行）
- Modify: `tests/sheet-placement.test.js`（既存の「Service Workerは版付きキャッシュ名を使う」テストが `v54` を固定している。現在 289 行付近）

**Interfaces:**
- Consumes: Task 1〜7 のすべて
- Produces: なし

- [ ] **Step 1: 既存テストを v55 に変える（先に失敗させる）**

`tests/sheet-placement.test.js` の既存テストを書き換える。

```js
  assert.match(sw, /const CACHE_VERSION = "v55"/);
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `node --test tests/sheet-placement.test.js 2>&1 | grep -A3 'Service Worker'`

Expected: FAIL。`sw.js` はまだ `v54`。

- [ ] **Step 3: `files/sw.js` を更新する**

```js
const CACHE_VERSION = "v55";
```

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js 2>&1 | tail -6`

Expected: `# pass 170` / `# fail 0`

- [ ] **Step 5: ブラウザで確かめる**

ローカルで開く。**Service Worker が cache-first でキャッシュを返すので、
開発中は DevTools の Application → Service Workers で "Bypass for network" を入れるか、
Cache Storage を消してから開くこと**（`CACHE_VERSION` を上げるのは配信用の手順で、
開発中の再読み込みには効かない）。

```bash
python3 -m http.server 8765 --directory files
```

`http://localhost:8765/` を開き、次を順に確認する。
**`initLots()` が保存データの無いとき `SAMPLES.basic` を自動で読む**ので、
初回に開けば伝票が入った状態で始まる。

1. 「▶ 自動配置を作成」→ 配置図タブ。**見出しが「軒下」1つ**で、従来と同じ見た目
2. 設定タブ →「配置マス」で軒下②の高さを増やし、荷物を軒下②へ入る量まで増やす。
   配置図で**見出しが「軒下①」「軒下②」に割れ、境目に太い縦線**が入る
3. その縦線が**見出し・品名・ロット・P数の4行を貫いている**こと。注釈行には無いこと
4. 配置編集タブで荷物を退避スペースへ運ぶ → 配置図で**「未定」の見出し**が出ること。
   「退避」ではないこと
5. 注釈行が**空のまま行として残り、高さが変わっていない**こと
6. 印刷プレビュー（Ctrl+P / Cmd+P、A4横）で**1ページに収まる**こと。
   縦線が紙にも出ること（`border` なので背景色の印刷設定に左右されない）
7. 見出し行の 2px と、その下の行の 2px が**縦にずれていない**こと（設計書 §5-6）
8. 「軒下」1つの日に、見出しの文字が**中央から目に見えてずれていない**こと。
   `.ttl` の `letter-spacing:.2em` は最後の文字の後ろにも字間を付けるので、
   `<span class="fit">` を入れると約1.5px 左へずれる（設計書 §5-8）。
   気になるなら `.sheet td.ttl .fit{margin-left:.2em}` で相殺する。
   直した場合はそのぶんをテストに足す（`assert.match(source, /\.sheet td\.ttl \.fit\{margin-left:\.2em\}/)`）

**非表示タブでは `getBoundingClientRect()` が 0 を返す**ので、
幾何を測るときは先に配置図タブを開いてから測ること。

- [ ] **Step 6: Pixel 9a / Android Chrome で確かめる**

同じ LAN から `http://<MacのIP>:8765/` を開く。手順は Step 5 の 1〜6 と同じ。
スマホで追加に見るのは次の2点。

- 画面幅に合わせた縮小表示（auto ズーム）で、見出しの文字が潰れて読めなくなっていないか
- 横スクロールが出ていないか

- [ ] **Step 7: コミット**

```bash
git add files/sw.js tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
chore: PWA キャッシュの版を上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 完了後

全タスク完了後、マージ前にターミナルで実行するテストコマンド:

```bash
node --test tests/sheet-placement.test.js tests/stash-overflow.test.js
```

このプロジェクトには E2E テストランナー（Playwright 等）の設定が
`package.json` に無い（`package.json` 自体が無い）。ブラウザでの確認は
Task 8 の Step 5・6 が代わりになる。
