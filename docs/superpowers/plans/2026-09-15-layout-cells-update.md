# 配置マスの追加 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現場で新たに判明した置き場 4 種を配置マスの定義に加え、盤と紙の両方に反映する。

**Architecture:** 列オブジェクトに 2 つの属性を足す。`aisleRows`（緊急用の通路マスの行番号。自動配置では使わず、手で運んだときだけ入る）と `up`（列が上に飛び出すマス数）。自動配置の容量計算だけが `aisleRows` を引き、手動移動は引かない。紙は下端の通路マスを既存の列番号行に兼用させ、上方向のマスに荷物がある日だけグリッドを 8 行にして○を縮めて吸収する。行のずらしは 1 か所で計算し、グリッドと引き出し線が同じものを使う。

**Tech Stack:** 素の HTML / CSS / JavaScript の 1 ファイル（`files/index.html`）。テストは `node:test`（`functionSource()` で関数本体を抜き出して `new Function` で実行する方式）。

**Spec:** `docs/superpowers/specs/2026-09-15-layout-cells-update-design.md`

## Global Constraints

- 変更するファイルは `files/index.html` と `tests/sheet-placement.test.js` の 2 つだけ
- テストコマンドは `node --test tests/sheet-placement.test.js`。着手前のベースラインは 49 件パス
- 新しいテストは `tests/sheet-placement.test.js` の末尾に足す。既存のテストは消さない
- `cellsOf()` の「上から詰める」性質は変えない。`aisleRows` を blocked と同じスキップ対象にしてはならない（スキップすると通路マスに一生荷物が入らなくなる）
- `usableCount()` の意味は変えない（blocked だけを引く）。自動配置用の引き算は別関数で行う
- 緊急用の通路マスは**列の下端 1 マスだけ**。2 マス以上や列の途中は扱わない
- `up` が効くのは `align:"top"` の縦向きエリアだけ（今回の対象はメインのみ）
- 設定タブのテキスト（`spacesToText()` / `applyConfig()`）に `aisleRows` と `up` は出さない
- 紙の○は 7 行の日が実寸 26px（`width:22px` ＋ border 2px × 2）、8 行の日が実寸 23px（`width:19px` ＋ border 2px × 2）
- 上に飛び出したマスには段番号（①〜⑦）を振らない。既存の段番号が指す段を変えない
- 日本語のコメントは既存の文体に合わせる（何をするかではなく、なぜそうするかを書く）

## この計画がいちばん気をつけること

**合成オブジェクトを渡すテストだけでは、実行時に何も起きていないことを見逃します。**
盤・紙・自動配置・知らせはすべて `buildWork()` が作る `lastSp` を見ます。
`buildWork()` が新しい属性を落とすと、他をすべて正しく直しても全部 no-op になり、
それでいてテストは全件通ります。だから Task 0 で最初に `buildWork()` を直し、
Task 11 で `DEFAULT_SPACES` → `buildWork()` → `placeLot()` を通した統合テストを置きます。

---

## ファイル構成

`files/index.html` は 1 ファイル構成のアプリで、分割はこの計画の範囲外。触る場所は次のとおり。

- CSS（100〜540 行付近）── 盤のマスの見た目、紙のグリッドと列番号行
- スペース定義（827〜865 行付近）── `DEFAULT_SPACES`
- 保存の検証と正規化（962、3800〜3835 行付近）── `SPACES_SAVE_VERSION`、`validSpaces()`、`normalizeSpaces()`
- 配置アルゴリズム（2002〜2140 行付近）── 容量計算、`buildWork()`、`findRun()`、`placeLot()`、`fillMix()`
- 結果の知らせ（2210〜2260 行付近）── `usedAisle`
- 盤の描画（2336〜2445 行付近）── `cellsOf()`、`drawZone()`
- 設定の反映（3680〜3730 行付近）── `applyConfig()`
- 退避から戻す（3497 行付近）── `returnSelToWarehouse()`
- 収容能力（3836 行付近）── `showCapacity()`
- 紙のグリッド（4436〜4600 行付近）── `gridRows()`、`sheetGridAnchors()`、`sideCell()`
- 起動時の読み込み（4672 行付近）── `initSpaces()`

---

### Task 0: 作業用のコピーに新しい属性を通す

**Files:**
- Modify: `files/index.html:2036-2046`（`buildWork`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `buildWork()` が返す列に `aisleRows` と `up` が含まれる。以降のすべてのタスクがこれに依存する

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-placement.test.js` の末尾に足す。

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`work[0].cols[0].aisleRows` が `undefined`

- [ ] **Step 3: `buildWork()` に 2 つを足す**

`files/index.html:2036`:

```js
function buildWork(blocked){
  return SPACES.map(s=>({
    name:s.name, zone:s.zone, orient:s.orient||"v", block:s.block||99, align:s.align||"bottom",
    // row / off は描画専用。配置ロジックは見ないが、drawZone() が受け取るのは
    // ここで作った lastSp なので、落とすと一度も実形で描かれない。
    // aisleRows（緊急用の通路マス）と up（上方向の飛び出し）も同じ。盤・紙・自動配置・
    // 知らせはすべて lastSp を見るので、ここで落とすとどこにも効かない
    cols:s.cols.map((c,ci)=>({
      h:c.h, aisle:!!c.aisle, row:c.row, off:c.off,
      aisleRows:c.aisleRows, up:c.up, fills:[],
      blockedRows:blockedRowsFor(s.name,ci,blocked)
    }))
  }));
}
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（50 件）

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 作業用の列に緊急用マスと上方向の飛び出しを通す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 1: 自動配置が緊急用の通路マスを使わないようにする

**Files:**
- Modify: `files/index.html:2011`（`columnFreeCount` の直後に追加）
- Modify: `files/index.html:2023`, `2030`（`findRun`）
- Modify: `files/index.html:2105`, `2117`, `2135`（`placeLot` / `fillMix`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: 既存の `used(col)`、`usableCount(col, blockedRows)`、`columnFreeCount(col, blockedRows)`
- Produces:
  - `aisleRowCount(col, blockedRows) -> number` … その列の緊急用マスの数（配置不可と重なる行は除く）
  - `autoFreeCount(col, blockedRows) -> number` … 自動配置だけが見る空きマス数

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`aisleRowCount must exist` で落ちる

- [ ] **Step 3: 容量計算を足す**

`files/index.html` の `columnFreeCount`（2011 行）の直後に足す。

```js
/* 緊急用の通路マス。自動配置では使わず、人が手で運んだときだけ入る。
   blockedRows と違って cellsOf() ではスキップしない。スキップすると
   一生荷物が入らなくなる。列の下端にあるので「上から詰める」性質だけで
   「他が埋まったときにしか入らないマス」になる。
   配置不可に塗られた行は usableCount() が既に引いているので、ここでは数えない。
   数えると同じ 1 マスを 2 回引いてしまう。 */
function aisleRowCount(col,blockedRows){
  const rows = col && Array.isArray(col.aisleRows) ? col.aisleRows : null;
  if(!rows) return 0;
  const blocked = blockedRows instanceof Set ? blockedRows : col.blockedRows;
  let n=0;
  rows.forEach(row=>{
    if(!Number.isSafeInteger(row) || row<0 || row>=col.h) return;
    if(blocked instanceof Set && blocked.has(row)) return;
    n++;
  });
  return n;
}
/* 自動配置だけが見る空き。手動移動（validateMove）は columnFreeCount を使うので、
   人が運ぶぶんには通路マスにも置ける。 */
function autoFreeCount(col,blockedRows){
  return columnFreeCount(col,blockedRows)-aisleRowCount(col,blockedRows);
}
```

- [ ] **Step 4: 自動配置の呼び出しを差し替える**

`findRun()` の中（2023・2030 行）:

```js
    return autoFreeCount(c,c.blockedRows)>0;
```

```js
      cap += autoFreeCount(cols[e],cols[e].blockedRows);
```

`placeLot()` / `fillMix()` の中（2105・2117・2135 行）── 3 箇所とも
`columnFreeCount(col,col.blockedRows)` を `autoFreeCount(col,col.blockedRows)` に、
`columnFreeCount(c,c.blockedRows)` を `autoFreeCount(c,c.blockedRows)` に置き換える。

`validateMove()`（2652 行）は**変えない**。手動移動は通路マスに置けなければならない。

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（56 件）

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 緊急用の通路マスを自動配置の容量から外す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 盤で緊急用の通路マスをグレーに描く

**Files:**
- Modify: `files/index.html:2336-2347`（`cellsOf`）
- Modify: `files/index.html:2382`（`colHtml` のクラス判定）
- Modify: `files/index.html:2398`（列キャップ）
- Modify: `files/index.html:133`（CSS の `.cell.aisle-empty` の隣）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1 の `aisleRowCount(col, blockedRows)`
- Produces: `cellsOf()` が返す各マスに `aisleRow: boolean` が増える。盤の HTML に `.cell.aisle-cell` が出る

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`aisleRow` が `undefined`

- [ ] **Step 3: `cellsOf()` に印を足す**

`files/index.html:2336` を次のように変える。スキップの条件（`while` の行）は**変えない**。

```js
function cellsOf(col,blockedRows){
  const blocked=blockedRows instanceof Set ? blockedRows : col.blockedRows;
  // 緊急用の通路マスは印を付けるだけ。blocked と違って飛ばさない。
  // 飛ばすと、列が埋まっても手で運んだ荷物が入らなくなる
  const aisleRows=Array.isArray(col.aisleRows)?col.aisleRows:[];
  const arr=Array.from({length:col.h},(_,i)=>({id:null,seg:false,row:i,
    blocked:blocked instanceof Set && blocked.has(i),
    aisleRow:aisleRows.includes(i)}));
  let r=0;
  col.fills.forEach((f,fi)=>{
    for(let k=0;k<f.count;k++){
      while(r<col.h && arr[r].blocked) r++;
      if(r<col.h){ arr[r]={id:f.id,seg:(k===0&&fi>0),row:r,blocked:false,aisleRow:aisleRows.includes(r)}; r++; }
    }
  });
  return arr;
}
```

- [ ] **Step 4: 盤のクラスと CSS を足す**

`colHtml` の中（2382 行の直後）:

```js
        if(!filled&&col.aisle)cls.push("aisle-empty");
        if(a.aisleRow)cls.push("aisle-cell");
```

CSS（133 行の `.cell.aisle-empty` の直後）:

```css
  /* 緊急用の通路マス。列全体が通路の .aisle-empty とは別で、
     荷物が乗っても通路だと分かるように縁を残す */
  .cell.aisle-cell{background:#e5e7eb}
  .cell.aisle-cell[data-lot]{box-shadow:inset 0 0 0 2px #9ca3af}
```

- [ ] **Step 5: 列キャップの印を足す**

`files/index.html:2398` の `cap`。分母は物理のマス数のままにして、
通路マスがある列だと分かるように `通` を出す。

```js
      const cap = `<div class="colcap">${used(col)}/${usableCount(col,col.blockedRows)}${col.aisle||aisleRowCount(col,col.blockedRows)?' 通':''}</div>`;
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（60 件）

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 盤で緊急用の通路マスをグレーに描く

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 盤で列を上に飛び出させる

**Files:**
- Modify: `files/index.html:2335`（`cellsOf` の直前に関数を追加）
- Modify: `files/index.html:2427-2432`（`drawZone` の位置指定でない側）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: 列オブジェクトの `up`
- Produces: `colTopOffset(sp, col) -> number` … その列を何マス分下げるか

- [ ] **Step 1: 失敗するテストを書く**

計算を関数に切り出してテストする。`drawZone()` は DOM を触るのでそのままでは動かせない。

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`colTopOffset must exist`

- [ ] **Step 3: ずらしの計算を足す**

`files/index.html:2335`（`cellsOf` の直前）:

```js
/* 上に飛び出す列があるエリアで、その列を何マス分下げるか。
   位置指定モード（row/off）は横向きのエリアにしか効かないので、
   縦向きのメインはこの計算で上端をずらす。
   効くのは align:"top" のエリアだけ。既定の下揃えでは見た目に出ない。 */
function colTopOffset(sp,col){
  const maxUp=Math.max(0,...sp.cols.map(c=>Number.isFinite(c.up)?c.up:0));
  const up=Number.isFinite(col.up)?col.up:0;
  return maxUp-up;
}
```

- [ ] **Step 4: `drawZone()` から呼ぶ**

`files/index.html:2427` の `}else{` の中を次のように変える。

```js
    }else{
      sp.cols.forEach((col,ci)=>{
        const blockStart = grouping && !col.aisle && nonAisleSeen>0 && (nonAisleSeen % sp.block===0);
        if(!col.aisle) nonAisleSeen++;
        // 1マス＝マスの幅（--cell）＋列の中の gap 2px
        const topOff=topAlign?colTopOffset(sp,col):0;
        const place = topOff>0 ? `margin-top:calc((var(--cell) + 2px) * ${topOff})` : "";
        lines+=colHtml(col, ci, blockStart, place);
      });
    }
```

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（63 件）

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 盤で列を上に飛び出させる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 紙の行のずらしを 1 か所で決める

**Files:**
- Modify: `files/index.html:4427`（`sheetGridAnchors` の直前に関数を追加）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1 の `aisleRowCount(col, blockedRows)`
- Produces: `gridShift(sp, colCells) -> {rows, shiftOf, startOf, endOf, upUsed, maxUp}`
  - `rows` … グリッド本体の行数
  - `shiftOf(ci)` … 列 `ci` を紙の上で何行下げるか
  - `startOf(ci)` … 列の中の何行目から描き始めるか
  - `endOf(ci)` … 列の中のどこまで描くか（下端の緊急用マスは含めない）
  - `upUsed` … 上に飛び出したマスに荷物がある日か
  - `maxUp` … エリアの中の `up` の最大値

これを `gridRows()` と `sheetGridAnchors()` の両方が使う。
別々に計算すると引き出し線が 1 行ずれる。

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`gridShift must exist`

- [ ] **Step 3: `gridShift()` を足す**

`files/index.html:4427`（`sheetGridAnchors` の直前）に足す。

```js
/* 紙のグリッドの行のずらしを決める。gridRows() と sheetGridAnchors() が
   同じ結果を使う。別々に計算すると引き出し線が 1 行ずれる。
   上に飛び出したマスに荷物が無い日は、その行を描かずに 7 行のままにする
   （紙の形をいつもと同じに保つため）。 */
function gridShift(sp,colCells){
  const ups=sp.cols.map(c=>Number.isFinite(c.up)?c.up:0);
  const maxUp=Math.max(0,...ups);
  // 飛び出した行（0 〜 up-1）に荷物があるか
  const upUsed=maxUp>0 && sp.cols.some((c,ci)=>{
    for(let r=0;r<ups[ci];r++) if(colCells[ci] && colCells[ci][r]) return true;
    return false;
  });
  const shiftOf=ci=>upUsed?(maxUp-ups[ci]):0;
  const startOf=ci=>upUsed?0:ups[ci];
  // 下端の緊急用マスは列番号行が受け持つので、本体の行数には入れない
  const endOf=ci=>sp.cols[ci].h-aisleRowCount(sp.cols[ci],sp.cols[ci].blockedRows);
  const rows=Math.max(...sp.cols.map((c,ci)=>shiftOf(ci)+endOf(ci)-startOf(ci)));
  return {rows, shiftOf, startOf, endOf, upUsed, maxUp};
}
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（67 件）

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 紙のグリッドの行のずらしを1か所で決める

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 紙のグリッド本体をずらしに合わせる

**Files:**
- Modify: `files/index.html:4529-4566`（`gridRows` の行の組み立て）
- Modify: `files/index.html:503`（CSS。8 行の日の行高と○）
- Modify: `files/index.html:4341`（`.sheet` にクラスを付ける側）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 4 の `gridShift(sp, colCells)`
- Produces: `gridRows(...)` の戻り値に `rows: number` が増える

- [ ] **Step 1: 失敗するテストを書く**

`functionSource` の定義の直後にヘルパを足す。

```js
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
```

テスト本体を末尾に足す。

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`out.rows` が `undefined`

- [ ] **Step 3: `gridRows()` の行の組み立てを書き換える**

`files/index.html:4529` の `const at=...` から行ループの中までを次のように変える。

```js
  const g=gridShift(sp,colCells);
  const at=(ci,ri)=>{
    // 端の列で太枠の左右を見るとき、存在しない添字が来る
    if(!sp.cols[ci]) return null;
    const r=ri-g.shiftOf(ci)+g.startOf(ci);
    return (r>=0 && colCells[ci] && colCells[ci][r]) ? colCells[ci][r].id : null;
  };
  const circled=["①","②","③","④","⑤","⑥","⑦"];

  let rows="";
  for(let ri=0;ri<g.rows;ri++){
```

段番号のセル（`o.lab` の側）を次のように変える。

```js
      if(o.lab){
        // 左右のレーンが同じロットなら、段番号のマスも枠の内側。上下の端だけ太線を引いてつなぐ
        const span=r=>{ const v=(o.l!=null)?at(o.l,r):null; return (v!=null && v===at(o.r,r))?v:null; };
        const cls=["lab"], cur=span(ri);
        if(cur!=null){
          if(span(ri-1)!==cur) cls.push("bt");
          if(span(ri+1)!==cur) cls.push("bb");
        }
        // 上に飛び出したマスの行には段番号を振らない。現場が呼んでいる段の名前を変えないため
        const li=ri-(g.upUsed?g.maxUp:0);
        tds+=`<td class="${cls.join(" ")}">${li>=0?(circled[li]||""):""}</td>`; return;
      }
```

列のセル（4546 行付近）を次のように変える。

```js
      const col=sp.cols[o.c];
      const r=ri-g.shiftOf(o.c)+g.startOf(o.c);
      if(r<0 || r>=g.endOf(o.c)){ tds+=`<td class="none"></td>`; return; }
      const id=at(o.c,ri);
      const cls=["g"]; if(o.aisle)cls.push("aisle");
      if(col.blockedRows && col.blockedRows.has(r)) cls.push("blocked");
```

同じブロックの「半」の判定も、ずらし後の行で引く。

```js
      const half=isHalf[o.c+"_"+r];
```

戻り値に行数を足す（`return {html:..., anchors, warn}` を探して `rows` を加える）。

```js
  return {html:..., anchors, warn, rows:g.rows};
```

- [ ] **Step 4: 8 行の日の CSS と印を足す**

CSS（503 行の `.sheet td.g` の直後）:

```css
  /* メインのグリッドが 8 行になる日は、○を縮めて行高を詰める。
     8行×26px＝208px で、7行×30px＝210px に収まるので紙の高さは増えない */
  .sheet.grid8 td.g{height:26px}
  .sheet.grid8 td.g .mk{width:19px;height:19px}
```

`files/index.html:4341`。`gridRows()` の戻り値は `grid` に入っている（`files/index.html:4333`）。

```js
  // 8 行になる日は○を縮めて行高を詰める。紙の高さを増やさないための切り替え
  const gridCls = (grid.rows>7) ? " grid8" : "";
  host.innerHTML=`<div class="sheet${gridCls}"><div class="sheetbox"><table>
```

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（73 件）。既存の
「配置表のメイン配置不可セルには斜線用クラスを出力する」も通ること
（`up` も `aisleRows` も無い列では `shiftOf=0` / `startOf=0` で従来どおりになる）

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 配置図のグリッドを上方向の伸びに対応させる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: 紙の列番号行に緊急用マスの○を出す

**Files:**
- Modify: `files/index.html:4565-4567`（`gridRows` の列番号行）
- Modify: `files/index.html:536`（CSS の `.sheet td.colno`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1 の `aisleRowCount`、Task 5 の `colCells` / `isHalf`
- Produces: 列番号行の `<td class="colno">` に緊急用マスの状態が出る

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。列番号行が `<td class="colno">0</td>` のまま

- [ ] **Step 3: 列番号行を書き換える**

`files/index.html:4565`:

```js
  // 列番号
  // 下端の緊急用マスは、行を増やさずにこの行が受け持つ。紙を 1 ページに
  // 収めるため、専用の行は作らない（列番号行は元からある 20px の行）
  let nums="";
  order.forEach(o=>{
    if(o.lab||o.aisle){ nums+=`<td class="colno"></td>`; return; }
    const col=sp.cols[o.c];
    if(!aisleRowCount(col,col.blockedRows)){ nums+=`<td class="colno">${o.c}</td>`; return; }
    const row=col.h-1;                      // 緊急用マスは列の下端
    const id=(colCells[o.c]&&colCells[o.c][row])?colCells[o.c][row].id:null;
    if(id==null){ nums+=`<td class="colno aisle">${o.c}</td>`; return; }
    // 半が来た日は列番号より半を優先する。半は現物の数に関わる
    const mark=isHalf[o.c+"_"+row]?"半":o.c;
    nums+=`<td class="colno aisle g"><span class="mk">${mark}</span></td>`;
  });
```

- [ ] **Step 4: CSS を足す**

`files/index.html:536` の `.sheet td.colno` の直後:

```css
  /* 下端の緊急用マス。既存の通路列と同じ灰色にし、背景色を印刷でも出す */
  .sheet td.colno.aisle{background:#d9d9d9;-webkit-print-color-adjust:exact;print-color-adjust:exact}
```

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（76 件）

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 配置図の列番号行に緊急用マスの丸印を出す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: 引き出し線をずらしに合わせる

**Files:**
- Modify: `files/index.html:4451-4470`（`sheetGridAnchors`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 4 の `gridShift(sp, colCells)`
- Produces: `sheetGridAnchors()` が返す `row` が紙の行番号になる

`drawLeaders()`（`files/index.html:4636`）は `grid[a.row]` で `tr.grow` を直接引くので、
ここが紙の行番号を返さないと線が 1 行ずれる。

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`a1.row` が 0（生の行番号）のまま

- [ ] **Step 3: `sheetGridAnchors()` にずらしを通す**

`files/index.html:4455` 付近の `at` の定義と `anchorOf` の中の行の探し方を変える。

```js
  const g=gridShift(sp,colCells);
  // 紙の行番号で返す。drawLeaders() は この row で tr.grow を直接引くので、
  // gridRows() と同じずらしを通さないと線が 1 行ずれる
  const at=(ci,ri)=>{
    if(!sp.cols[ci]) return null;
    const r=ri-g.shiftOf(ci)+g.startOf(ci);
    return (r>=0 && colCells[ci] && colCells[ci][r]) ? colCells[ci][r].id : null;
  };
```

`anchorOf` の中で列の中を探しているループを、紙の行で探す形に変える。

```js
      let r0=null;
      // 紙の行で探す。列ごとにずらし量が違うので、生の行番号で比べてはいけない
      for(let r=0;r<g.rows;r++) if(at(o.c,r)===id){ r0=r; break; }
```

`anchorOf` の残り（`bridged` の判定と `row` の使い方）はそのままでよい。
`at()` と `row` が同じ紙の行番号になるので揃う。

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（78 件）

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "fix: 引き出し線をグリッドの行のずらしに合わせる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: 追記欄の rowspan を行数から決める

**Files:**
- Modify: `files/index.html:4490-4496`（`gridRows` の先頭、`sideCell`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 4 の `gridShift`
- Produces: なし

`sideCell()` の `rowspan="8"` は「グリッド 7 行 ＋ 列番号行 1 行」の直書き。
8 行になる日は 9 でなければ表が崩れる。

- [ ] **Step 1: 失敗するテストを書く**

```js
test("追記欄のrowspanはグリッドの行数から決める", () => {
  assert.doesNotMatch(source, /rowspan="8">\$\{overflowTable/);
  assert.match(source, /rowspan="\$\{g\.rows\+1\}">\$\{overflowTable/);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`rowspan="8"` が残っている

- [ ] **Step 3: `sideCell` を行数の後ろに移す**

`files/index.html:4490` の `gridRows()` の先頭から `sideCell` の定義を外す。

```js
function gridRows(pad, overflow){
  const useOverflow=pad>=2 && overflow && overflow.length;
  const padCell = pad>0 ? `<td class="none" colspan="${pad}"></td>` : "";
  const sp=lastSp.find(s=>s.name===sheetAreas("bottom")[0]);
  const warn=gridWarn(sp);
```

Task 5 で `const g=gridShift(sp,colCells);` を置いた直後に足す。

```js
  // 追記欄はグリッドの全行と列番号行をまたぐ。行数は日によって変わる
  const sideCell=row=>useOverflow
    ? (row===0?`<td class="overflow-host" colspan="${pad}" rowspan="${g.rows+1}">${overflowTable(overflow)}</td>`:"")
    : padCell;
```

- [ ] **Step 4: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（79 件）

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "fix: 追記欄のrowspanをグリッドの行数から決める

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: 知らせ・収容能力・退避から戻す処理を合わせる

**Files:**
- Modify: `files/index.html:2214`（`usedAisle`）
- Modify: `files/index.html:3841`（`showCapacity` の合計）
- Modify: `files/index.html:3501-3503`（`returnSelToWarehouse` の候補集め）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1 の `aisleRowCount` / `autoFreeCount`
- Produces: なし

- [ ] **Step 1: 失敗するテストを書く**

```js
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
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。3 件とも一致しない

- [ ] **Step 3: 通路の知らせに緊急用マスを含める**

`files/index.html:2214`:

```js
  // 通路「列」だけでなく、緊急用の通路マスに載った分も「通路へのはみ出し」に数える。
  // 現場から見ればどちらも通路なので、知らせは分けない
  const usedAisle=sp.some(s=>s.cols.some(c=>
    (c.aisle&&c.fills.length) || used(c)>usableCount(c,c.blockedRows)-aisleRowCount(c,c.blockedRows)));
```

- [ ] **Step 4: 収容能力から緊急用マスを外す**

`files/index.html:3841`。`showCapacity()` は `SPACES` を見るので `blockedRows` を持たない。
`aisleRowCount` は第 2 引数が無ければ配置不可を見ないので、そのまま呼ぶ。

```js
  // 緊急用の通路マスは日常的に数える置き場ではないので、収容能力から外す
  const sum=(z,f)=>live.filter(s=>s.zone===z).reduce((a,s)=>a+s.cols.filter(f).reduce((x,c)=>x+c.h-aisleRowCount(c),0),0);
```

- [ ] **Step 5: 退避から戻す先から緊急用マスを外す**

`files/index.html:3501`。あわせて配置不可セルも見るようになる（今は見ていない）。

```js
  lastSp.filter(s=>s.zone!=="stash").forEach(s=>s.cols.forEach((c,i)=>{
    if(c.aisle) return;                       // 通路へは戻さない
    if(autoFreeCount(c,c.blockedRows)>=n) cand.push({name:s.name, idx:i, home:(s.zone===home)?0:1});
  }));
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（82 件）

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 緊急用マスを知らせ・収容能力・退避の戻し先に反映する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: 保存形式と起動時の扱い

**Files:**
- Modify: `files/index.html:962`（`SPACES_SAVE_VERSION`）
- Modify: `files/index.html:3810-3814`（`validSpaces` の列の検証）
- Modify: `files/index.html:3831`（`normalizeSpaces` の保存形）
- Modify: `files/index.html:3702-3709`（`applyConfig` の引き継ぎ）
- Modify: `files/index.html:4681-4687`（`initSpaces` の版ずれ処理）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: なし
- Produces: `clearAllBlocked() -> boolean` … 保存されている配置不可セルを全部消す

- [ ] **Step 1: 失敗するテストを書く**

```js
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
    "SPACES_MAX_COLS", "SPACES_MAX_COL_H", "SPACES_MAX_ROW", "SPACES_MAX_OFF", "isPlainObject",
    functionSource("validSpaces") + "; return validSpaces;"
  )(99, 99, 99, 99, v => !!v && typeof v === "object" && !Array.isArray(v));
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
```

`validSpaces` のテストは、その関数が参照している外の値を注入する。
実装を見て足りない引数があれば足す（`isPlainObject` は `files/index.html` 内の
ヘルパなので、`functionSource("isPlainObject")` を連結してもよい）。

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。6 件とも一致しない

- [ ] **Step 3: 保存形とバージョンを更新する**

`files/index.html:962`:

```js
const SPACES_SAVE_VERSION = 4;   // 現場の実測で置き場が増えたので上げる
```

`files/index.html:3831`（`normalizeSpaces` の中）:

```js
      // row / off は保存に無ければ undefined のまま。既定の「順に詰める」の意味になる。
      // aisleRows / up も同じく、無ければ「緊急用マス無し・上に飛び出さない」になる
      cols:s.cols.map(c=>({h:c.h, aisle:!!c.aisle, row:c.row, off:c.off,
                           aisleRows:Array.isArray(c.aisleRows)?c.aisleRows.slice():undefined,
                           up:Number.isSafeInteger(c.up)?c.up:undefined})),
```

`files/index.html:3812` 付近（`validSpaces` の列の検証）に条件を足す。
緊急用マスは下端 1 マスだけという制約もここで守る。

```js
        && (c.aisleRows===undefined || (Array.isArray(c.aisleRows)
            && c.aisleRows.length===1 && c.aisleRows[0]===c.h-1))
        && (c.up===undefined || (Number.isSafeInteger(c.up) && c.up>=0 && c.up<=SPACES_MAX_ROW))
```

- [ ] **Step 4: 設定テキストで緊急用マスが消えたら知らせる**

`applyConfig()`（`files/index.html:3680`）の先頭（`const out=[];` の隣）に足す。

```js
  const lostAisleRows=[];
```

引き継ぎのブロック（3702 行）を次のように変える。

```js
    if(prev && prev.cols.length===cols.length
       && prev.cols.every((pc,i)=>pc.h===cols[i].h)){
      cols.forEach((c,i)=>{
        if(prev.cols[i].row!==undefined) c.row=prev.cols[i].row;
        if(prev.cols[i].off!==undefined) c.off=prev.cols[i].off;
        if(prev.cols[i].aisleRows!==undefined) c.aisleRows=prev.cols[i].aisleRows;
        if(prev.cols[i].up!==undefined) c.up=prev.cols[i].up;
      });
    }else if(prev && prev.cols.some(pc=>Array.isArray(pc.aisleRows)&&pc.aisleRows.length)){
      // 高さを変えると緊急用の通路マスが落ちる。落ちたままだと自動配置がそこに置くので、
      // 黙って変えずに知らせる
      lostAisleRows.push(p[0]);
    }
```

保存のあと（`showCfgNote` を呼んでいるあたり、3733 行付近）に知らせを足す。

```js
  if(lostAisleRows.length){
    showCfgNote(`列の高さを変えたので、次のエリアの緊急用の通路マスが外れました：${lostAisleRows.join("・")}。`
      +`自動配置がそのマスにも荷物を置くようになります。戻すには「初期値に戻す」を押してください。`);
  }
```

- [ ] **Step 5: 版ずれで配置不可セルも解除する**

配置不可セルは行番号で覚えているので、列の高さが上に伸びると指す場所がずれる。
2026-09-15 時点で現場は使っていないため移行せず解除する。

まず解除する関数を `pruneScheduleBlockedForSpaces()`（`files/index.html:1150` 付近）の隣に足す。
シフトの回し方はその関数に合わせること。

```js
/* 保存されている配置不可セルを全部消す。配置不可は「エリア名|列|行番号」で
   覚えているので、列の高さが上に伸びると指す場所が 1 段ずれる。
   pruneBlockedForSpaces() は高さを超えた行しか落とさないので、
   増える方向では何も落ちず黙ってずれる。版を上げたときに一緒に解除する。 */
function clearAllBlocked(){
  let changed=false;
  schedule.shifts.forEach(shift=>{
    if(shift.blocked && shift.blocked.length){ shift.blocked=[]; changed=true; }
  });
  if(changed) saveSchedule();
  return changed;
}
```

`initSpaces()` の版ずれ処理（4681 行）に呼び出しを足す。

```js
  if(d.v!==SPACES_SAVE_VERSION){
    saveData(STORE_KEY.spacesResetPending, true);
    saveData(STORE_KEY.spaces, null);
    spacesWereReset=true;
    // 配置不可セルは行番号で覚えているので、列が上に伸びると指す場所がずれる。
    // 移行はせず解除して、同じ知らせで伝える
    const hadBlocked=clearAllBlocked();
    showCfgNote("配置マスを現場の実測に合わせて更新したので、スペース設定と手動調整を初期値に戻しました。"
      +(hadBlocked?"配置不可セルも解除しました。":""));
    return;
  }
```

- [ ] **Step 6: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（88 件）

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 保存形式に緊急用マスと上方向の飛び出しを通す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: 実際のレイアウトを入れる

**Files:**
- Modify: `files/index.html:836-855`（`DEFAULT_SPACES` のメイン・PC横・EV横）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 0〜10 のすべて
- Produces: なし（定義の更新）

- [ ] **Step 1: 失敗するテストを書く**

`functionSource` の定義の直後にヘルパを足す。

```js
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
```

テスト本体を末尾に足す。

```js
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
  assert.deepEqual(col.fills, [{ id: 0, count: 7, ov: undefined }]);
});
```

- [ ] **Step 2: テストを走らせて落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: FAIL。`aisleRows` が未定義

- [ ] **Step 3: メインを書き換える**

`files/index.html:836`:

```js
  // 中央 9 列は下端 1 マスが緊急用の通路マス（aisleRows）。自動配置では使わない。
  // 4/5/6/8 は上に 1 マス飛び出す（up）。2026-09-15 の現場確認で判明した
  {name:"メイン", zone:"near", orient:"v", block:3, align:"top", sheet:"bottom", cols:[
     {h:6,aisle:true},
     {h:8, aisleRows:[7]}, {h:8, aisleRows:[7]}, {h:8, aisleRows:[7]},
     {h:9, up:1, aisleRows:[8]}, {h:9, up:1, aisleRows:[8]}, {h:9, up:1, aisleRows:[8]},
     {h:8, aisleRows:[7]},
     {h:9, up:1, aisleRows:[8]},
     {h:8, aisleRows:[7]},
     {h:5,aisle:true}]},
```

- [ ] **Step 4: PC横と EV横を書き換える**

`files/index.html:849`（PC横）:

```js
  // PC横：1-4 と 5-12 の間の row1 が通路。右起点。
  // 2026-09-15 の現場確認で、5-12 の左に 1 マス空けて 2 マス置けることが分かった
  {name:"PC横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[
     {h:4, row:0},            // 1-4
     {h:8, row:2},            // 5-12　※ row1 は通路の空き行
     {h:2, row:2, off:9}]},   // 飛び地。8マスの左に1マス空ける
```

`files/index.html:852`（EV横）。左に足すので既存 4 列の `off` を 3 ずつ後ろへずらす。
飛び地は配列の末尾に置き、既存の列を使い切ってから使わせる（配列の順＝自動配置で試す順）。

```js
  // EV横：L 字なので列を分ける。5 と 6 は直角の位置関係で、連続しては置けない。
  // 2026-09-15 の現場確認で、1-5 の左に 1 マス空けて 2 マス置けることが分かった。
  // 左起点なので、飛び地を左端に置くため既存の列の off を 3 ずつ後ろへずらしてある
  {name:"EV横", zone:"near", orient:"h", block:99, sheet:"bottom", cols:[
     {h:5, row:2, off:3},     // 1-5
     {h:1, row:3, off:7},     // 6
     {h:2, row:1, off:9},     // 7-8
     {h:2, row:0, off:9},     // 9-10
     {h:2, row:2, off:0}]},   // 飛び地。1-5 の左に1マス空ける
```

- [ ] **Step 5: テストを走らせて通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js`
Expected: PASS（93 件）。既存のテストもすべて通ること

- [ ] **Step 6: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "feat: 現場で判明した置き場を配置マスに反映する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: 画面と紙で現物を確かめる

自動テストでは見られない部分を、実際に動かして確かめる。

**Files:**
- Modify: `files/index.html`（ここで見つかった崩れを直す）

- [ ] **Step 1: 古いキャッシュを捨ててから開く**

```bash
python3 -m http.server 8765 --directory files
```

`http://localhost:8765` を開き、**開発者ツールの Application → Service Workers で
Unregister してから再読み込みする**。このアプリは PWA で、
アセットを更新しても古い版が出ることがある（`~/claude-lessons/lessons.md` の 2026-07-09）。

設定タブに「配置マスを現場の実測に合わせて更新したので…配置不可セルも解除しました。」の
知らせが出ることを確かめる。

- [ ] **Step 2: 盤を見る**

荷物を数件入れて自動配置し、配置編集タブで次を確かめる。

- メインの 4/5/6/8 が上に 1 マス出ていて、他の列と上端が揃っていない
- どの列も下端がグレーの通路マスになっている
- 配置不可セルの斜線とは見た目が違う
- PC横の飛び地 2 マスが、8 マス列の左に 1 マス空けて描かれている
- EV横の飛び地 2 マスが、5 マス列の左に 1 マス空けて描かれている
- 列キャップ（`used/usable`）と `通` の印が正しい

- [ ] **Step 3: 自動配置が通路マスを避けることを確かめる**

入力タブの「満杯時に混載を許可」を入れた状態でも、
メインの列の下端（グレーのマス）に荷物が入らないことを確かめる。

- [ ] **Step 4: 手動では置けることを確かめる**

メインの 1 列を上から埋め、もう 1 マスをその列へドラッグする。
下端のグレーのマスに入り、結果の知らせに「通路へのはみ出しあり」が出ること。

列を埋めた状態が作りにくいときは、入力を減らして 1 列だけ埋まる量にする
（「結果が無い状態が作れない」教訓、`~/claude-lessons/lessons.md` の 2026-08-31）。

- [ ] **Step 5: 紙を見る（7 行の日）**

上に飛び出したマスに荷物が無い状態で配置図タブを開き、次を確かめる。

- グリッドが 7 行で、いままでの紙と同じ見た目
- 段番号①が、いままでと同じ段を指している
- 引き出し線が正しいマスを指している

- [ ] **Step 6: 紙を見る（8 行の日）**

メインの 4/5/6/8 のどれかを上まで埋めて、次を確かめる。

- グリッドが 8 行になり、○が小さくなる
- 上に飛び出したマスの段番号が空欄で、その下が①
- 引き出し線が正しいマスを指している。
  **上に伸びる列（4/5/6/8）と伸びない列（1/2/3/7/9）の両方にロットがある日で見る**
- ○の中の文字（`font-size:11px`）が 19px の○に収まっている。
  はみ出すなら `.sheet.grid8 td.g .mk` に `font-size:10px` を足す

- [ ] **Step 7: 列番号行を見る**

メインの 1 列を下端まで埋めて、次を確かめる。

- 列番号行のそのマスが灰色になり、○の中に列番号が出る
- 半が来た日は○の中が「半」になる
- 他の列は数字のまま

- [ ] **Step 8: 追記欄がある日を見る**

欄数が足りない日（品名の種類が多い日）を作り、8 行の紙で追記欄が崩れないことを確かめる。

- [ ] **Step 9: 印刷を見る**

印刷プレビューで、次の 3 つがそれぞれ 1 ページに収まることを確かめる。

- ふつうの日（7 行）
- 8 行の日
- 8 行かつ下端の緊急用マスにも荷物がある日

目視だけでなく、設定タブと表の中に出る溢れの知らせ
（`PRINT_H_PX` / `PRINT_H_LIMIT`, `files/index.html:4262`）が出す
「用紙の高さの N%」を読む。100% を超えていたら設計書 §4-4 の逃げ道を使う。

- [ ] **Step 10: 実機で見る**

Pixel 9a / Android Chrome で Step 2・5・6・7 を確かめる。

- 盤のマスは `--cell` が画面幅で変わるので、上方向のずらし（`margin-top`）が
  スマホの幅でも 1 マス分ちょうどになっていること
- **PC横・EV横はエリアの幅が 4 マスから 11 マスに広がる**（`max(off+h)`,
  `files/index.html:2370`）。スマホの幅で横に溢れたり潰れたりしていないこと

- [ ] **Step 11: 直しが出たらコミット**

```bash
git add files/index.html
git commit -m "fix: 現物確認で見つかった配置マスの崩れを直す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完了の確認

- [ ] `node --test tests/sheet-placement.test.js` が全件パス（既存 49 件＋新規 44 件）
- [ ] Task 12 のすべての項目を実機と印刷で確認済み
- [ ] 設計書 §8 の検証項目 1〜14 に抜けが無いこと
