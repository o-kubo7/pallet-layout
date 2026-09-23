# 「半」の位置指定と下側初期位置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図メイングリッドの「半」を既定で図の下側に置き、設定 ON のときは配置編集で「半」を付けるマスを指定できるようにする。

**Architecture:** 「半」の位置を決める純粋関数 `halfCells()` を新設し、配置編集の盤（`drawZone()`）と配置図（`gridRows()`）の両方がこれを使う。手動指定はメインの列データ `col.halfMarks` に持たせ、既存の履歴（`snapshotSpaces()`）と手動調整の保存（`saveManual()`）にそのまま乗せる。表の「P 半」の欄は `halfAreaOf()` で決める。

**Tech Stack:** 単一HTML（`files/index.html`）内の Vanilla JavaScript/CSS、Node.js `node:test`、Service Worker（`files/sw.js`）

**Spec:** `docs/superpowers/specs/2026-09-24-half-mark-placement-design.md`

## Global Constraints

- 対象エリアは `space.name === "メイン"` だけ。関数内ではこの文字列リテラルを直接書く（既存の `cellLayoutOptions()` と同じ流儀。テストは `new Function` で関数本体だけを評価するため、トップレベルの `const` は参照できない）。
- 「半」の数はロットの `half` で決まり、この機能で増減させない。
- 手動指定の保存形式: `col.halfMarks = { "<lotId>": [{k:<int>, seq:<int>}, ...] }`。`k` は「その列にあるそのロットのマスの下から k 番目（0 始まり）」、`seq` は指定した順番（大きいほど新しい）。
- 「下」は `cellsOf()` の `row` が大きい側。
- 設定「半を手動で設定する」: 変数 `halfManualEnabled`、保存キー `STORE_KEY.halfManual`（値 `"palletApp.halfManual"`）、初期値 OFF（保存値が `true` のときだけ ON）。
- OFF のときも `halfMarks` のデータは消さない。
- ロットを移動したら、移動したロットの `halfMarks` を移動元・移動先の列から消す（ON/OFF に関係なく）。
- 操作バーの文言: `半を設定` / `半を自動に戻す`。どちらも先頭に丸囲みの「半」アイコン（`<span class="halfic">半</span>`）を付ける。
- 操作バーが1行に収まらないときは2行にし、2行目に「半」のボタンを置く。判定は実測（`@media` を使わない）。
- 盤の表示は案B：マス右上の角バッジ「半」。ロット番号は残す。
- テキスト編集の署名（`currentSheetSig()`）に `halfMarks` を含めない。
- `SPACES_SAVE_VERSION` は変えない。`files/sw.js` の `CACHE_VERSION` は `v75` から `v76` に上げる。
- テストに版番号・色・寸法の具体値を直書きしない。
- 無関係な未追跡ファイル（`docs/manual-*.md`、`outputs/` など）はステージしない。

## 作業場所

`main`（`f0a5039` 以降）から作業ブランチを作って実行する。

```bash
git switch -c feat/half-mark-placement
```

## File Structure

- `files/index.html`: すべての実装（純粋関数、描画、操作バー、設定、CSS）
- `files/sw.js`: `CACHE_VERSION` の更新だけ
- `tests/half-mark.test.js`（新規）: 「半」の純粋関数と操作バー・設定のテスト
- `tests/sheet-placement.test.js`: `gridRows()` のテスト用の組み立て（`makeGridRows()` ほか）の更新と、既存の「半」テスト3件の期待値変更
- `docs/superpowers/specs/2026-09-24-half-mark-placement-design.md`: 保存形式を `{k,seq}` に更新

---

### Task 1: 「半」の位置を決める純粋関数

**Files:**
- Modify: `files/index.html`（`spaceCells()` の直後、現在の 2935 行付近に関数を追加）
- Create: `tests/half-mark.test.js`
- Modify: `docs/superpowers/specs/2026-09-24-half-mark-placement-design.md`（3-1 節）

**Interfaces:**
- Consumes: 既存の `fillOrder()`、`cellGroups()`、`cellsOf()`、`cellLayoutOptions()`、`spaceCells()`
- Produces:
  - `manualHalfList(sp, laidOut, lotId): Array<{ci:number,row:number,k:number,seq:number}>`: 有効な手動指定を古い順に返す
  - `halfCells(sp, lots, opts): {[key:string]: {lotId:number, manual:boolean}}`: `key` は `"<ci>_<row>"`。`opts = {manualOn:boolean, areaOf:(id)=>string|null, laidOut?:Cell[][]}`
  - `halfMarkSet(sp, laidOut, lotId, ci, row, n): void`: `sp` を直接書き換えてそのマスを手動指定にする
  - `halfMarkClear(sp, lotId): void`: `sp` の全列からそのロットの手動指定を消す
  - `dropHalfMarks(spaces, lotId, keys): void`: `keys` は `"<space>|<col>"` の配列。その列からそのロットの指定を消す

- [ ] **Step 1: 設計書の保存形式を更新する**

`docs/superpowers/specs/2026-09-24-half-mark-placement-design.md` の 3-1 節のコードブロックと直後の箇条書き1つ目を次に置き換える。

````markdown
```js
col.halfMarks = { "<lotId>": [{k, seq}, ...] }   // k = その列にあるそのロットのマスの「下から k 番目」（0 始まり）、seq = 指定した順番（大きいほど新しい）
```

- `seq` は 3-4（4-1 の表）の「一番古い手動指定」を、列をまたいで判定するために使う。新しく指定するときは、そのロットの既存の `seq` の最大値 + 1 にする。
````

- [ ] **Step 2: 失敗するテストを書く**

`tests/half-mark.test.js` を新規作成する。

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// 関数をソースから切り出す。tests/sheet-placement.test.js と同じ実装
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

function halfFns() {
  return new Function(
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells",
     "manualHalfList", "halfCells", "halfMarkSet", "halfMarkClear", "dropHalfMarks"]
      .map(functionSource).join("\n") +
    "; return {spaceCells, manualHalfList, halfCells, halfMarkSet, halfMarkClear, dropHalfMarks};"
  )();
}
const MAIN = "メイン";
const inMain = () => MAIN;
const main = cols => ({ name: MAIN, cols });
const keys = map => Object.keys(map).sort();

test("自動: 単独ロットの列では最下段に半を付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_4"]);
});

test("自動: 准緊急マスありでも准緊急マスではなく下端に付ける（提示画像1の列5）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 9, up: 1, aisleRows: [8], fills: [{ id: 2, count: 8 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 2, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_7"]);
});

test("自動: 両端詰めの第2ロットはまとまりの下端に付ける（提示画像2の列4）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 9, up: 1, aisleRows: [8], fills: [{ id: 0, count: 4 }, { id: 1, count: 4 }] }]);
  const map = halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: false, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_7"]);
  assert.deepEqual(map["0_7"], { lotId: 1, manual: false });
});

test("自動: 両端詰めの第1ロットもまとまりの下端に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 2 }, { id: 1, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }, { id: 1, half: 0 }], { manualOn: false, areaOf: inMain })), ["0_1"]);
});

test("自動: 緊急用マスまで使う列では最下段の緊急用マスに付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 8, aisleRows: [7], fills: [{ id: 0, count: 8 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_7"]);
});

test("自動: 複数列にまたがるロットは末尾の列の下端に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }] }, { h: 4, fills: [{ id: 0, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["1_1"]);
});

test("自動: 通路列にあるロットは通路列を末尾として扱う（既存の優先を保つ）", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, aisle: true, fills: [{ id: 0, count: 2 }] }, { h: 4, fills: [{ id: 0, count: 4 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_1"]);
});

test("自動: half>=2 は下から順に付け、足りなければ前の列へ進む", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }] }, { h: 4, fills: [{ id: 0, count: 1 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 3 }], { manualOn: false, areaOf: inMain })), ["0_2", "0_3", "1_0"]);
});

test("自動: 末尾エリアがメイン以外なら、手動指定が無い限りメインに付けない", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 2 }] }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: () => "軒下①" })), []);
});

test("手動: 指定位置に付け、manual:true を返す", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  const map = halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_0"]);
  assert.deepEqual(map["0_0"], { lotId: 0, manual: true });
});

test("手動: 末尾エリアがメイン以外でも、手動指定があればメインに付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: () => "軒下①" })), ["0_1"]);
});

test("手動: 一部だけ指定したら残りは自動で埋める", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 5, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  const map = halfCells(sp, [{ id: 0, half: 2 }], { manualOn: true, areaOf: inMain });
  assert.deepEqual(keys(map), ["0_0", "0_4"]);
  assert.equal(map["0_0"].manual, true);
  assert.equal(map["0_4"].manual, false);
});

test("手動: 範囲外の指定は無視して自動の位置に付ける", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 5, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 3, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_1"]);
});

test("手動: manualOn が false なら指定を無視する", () => {
  const { halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 4, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: false, areaOf: inMain })), ["0_4"]);
});

test("手動: 他ロットが動いても、まとまりの下からの位置は保たれる", () => {
  const { halfCells } = halfFns();
  // ロット1は下端3マス（row4-6）。下から1番目 = row5
  const sp = main([{ h: 7, fills: [{ id: 0, count: 2 }, { id: 1, count: 3 }], halfMarks: { "1": [{ k: 1, seq: 1 }] } }]);
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_5"]);
  sp.cols[0].fills[0].count = 1;   // 他ロットが減っても
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 0 }, { id: 1, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_5"]);
});

test("halfMarkSet: half=1 では半がそのマスへ移る", () => {
  const { spaceCells, halfMarkSet, halfCells } = halfFns();
  const sp = main([{ h: 7, fills: [{ id: 0, count: 5 }] }]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 2, 1);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 2, seq: 1 }] });
  assert.deepEqual(keys(halfCells(sp, [{ id: 0, half: 1 }], { manualOn: true, areaOf: inMain })), ["0_2"]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 1);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 4, seq: 2 }] });
});

test("halfMarkSet: 手動指定が half 個に達していたら一番古い指定を外す（列をまたいでも）", () => {
  const { spaceCells, halfMarkSet } = halfFns();
  const sp = main([
    { h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 5 }] } },
    { h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 2 }] } },
  ]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 2);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 0, seq: 5 }, { k: 3, seq: 6 }] });
  assert.equal(sp.cols[1].halfMarks, undefined);
});

test("halfMarkSet: 手動指定が half 未満なら既存の指定を残す（自動の半が1つ減る）", () => {
  const { spaceCells, halfMarkSet } = halfFns();
  const sp = main([{ h: 4, fills: [{ id: 0, count: 4 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }]);
  halfMarkSet(sp, spaceCells(sp), 0, 0, 0, 2);
  assert.deepEqual(sp.cols[0].halfMarks, { "0": [{ k: 0, seq: 1 }, { k: 3, seq: 2 }] });
});

test("halfMarkClear: そのロットの指定だけを全列から消す", () => {
  const { halfMarkClear } = halfFns();
  const sp = main([
    { h: 4, fills: [], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 1, seq: 2 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 2, seq: 3 }] } },
  ]);
  halfMarkClear(sp, 0);
  assert.deepEqual(sp.cols[0].halfMarks, { "1": [{ k: 1, seq: 2 }] });
  assert.equal(sp.cols[1].halfMarks, undefined);
});

test("dropHalfMarks: 指定した列の、そのロットの指定だけを消す", () => {
  const { dropHalfMarks } = halfFns();
  const spaces = [main([
    { h: 4, fills: [], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 0, seq: 2 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 1, seq: 3 }] } },
    { h: 4, fills: [], halfMarks: { "0": [{ k: 2, seq: 4 }] } },
  ])];
  dropHalfMarks(spaces, 0, [MAIN + "|0", MAIN + "|1", "軒下①|0"]);
  assert.deepEqual(spaces[0].cols[0].halfMarks, { "1": [{ k: 0, seq: 2 }] });
  assert.equal(spaces[0].cols[1].halfMarks, undefined);
  assert.deepEqual(spaces[0].cols[2].halfMarks, { "0": [{ k: 2, seq: 4 }] });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `node --test tests/half-mark.test.js`
Expected: FAIL（`manualHalfList must exist`）

- [ ] **Step 4: 純粋関数を実装する**

`files/index.html` の `function spaceCells(space){...}` の直後に追加する。

```js
/* ---------- 「半」の位置（メインだけ） ----------
   盤（drawZone）と紙（gridRows）が同じ halfCells() を使うので、両者の位置は必ず一致する。
   手動指定は col.halfMarks = {"<lotId>": [{k,seq}]}。k は「その列にあるそのロットの
   マスの下から k 番目」、seq は指定した順番。下から数えるので、同じ列の他ロットが
   動いてもロットのまとまりに対する位置は変わらない。
   テストは new Function で関数本体だけを評価するので、"メイン" はここに直接書く。 */
// 有効な手動指定を古い順に返す。有効 = その列にそのロットのマスが k+1 個以上ある
function manualHalfList(sp, laidOut, lotId){
  const out=[], seen=new Set();
  sp.cols.forEach((col,ci)=>{
    const marks=col.halfMarks && col.halfMarks[String(lotId)];
    if(!Array.isArray(marks) || !laidOut[ci]) return;
    const rows=laidOut[ci].filter(c=>c.id===lotId).map(c=>c.row);   // 物理行の昇順
    marks.forEach(m=>{
      if(!m || !Number.isInteger(m.k) || m.k<0 || m.k>=rows.length) return;
      out.push({ci, row:rows[rows.length-1-m.k], k:m.k, seq:Number(m.seq)||0});
    });
  });
  // 同じマスへの重複指定は古いほうだけ残す
  return out.sort((a,b)=>a.seq-b.seq).filter(m=>{
    const key=m.ci+"_"+m.row;
    if(seen.has(key)) return false;
    seen.add(key); return true;
  });
}
// メインで「半」を付けるマス。戻り値のキーは "<列>_<行>"。
// opts.areaOf(id) は表の「P 半」を付けるエリア名（halfAreaOf）。手動指定が無いロットは
// これがメインのときだけメインに付ける
function halfCells(sp, lots, opts){
  const o=opts||{};
  const manualOn=!!o.manualOn;
  const areaOf=typeof o.areaOf==="function" ? o.areaOf : ()=>null;
  const laidOut=o.laidOut||spaceCells(sp);
  const out={};
  if(!sp || sp.name!=="メイン") return out;
  (lots||[]).forEach(lot=>{
    const n=lot.half||0;
    if(n<=0) return;
    const id=lot.id;
    // 詰め順で後ろの列ほど末尾。通路列は最後に使われるので末尾側に並べる
    // （従来の gridRows も通路列にあれば通路列に半を付けていた）
    const normal=[], aisle=[];
    laidOut.forEach((cells,ci)=>{
      if(!cells.some(c=>c.id===id)) return;
      (sp.cols[ci] && sp.cols[ci].aisle ? aisle : normal).push(ci);
    });
    const cols=[...normal,...aisle];
    if(!cols.length) return;
    const manual=manualOn ? manualHalfList(sp,laidOut,id).slice(0,n) : [];
    if(!manual.length && areaOf(id)!==sp.name) return;
    manual.forEach(m=>{ out[m.ci+"_"+m.row]={lotId:id, manual:true}; });
    let rest=n-manual.length;
    for(let i=cols.length-1;i>=0 && rest>0;i--){
      const ci=cols[i];
      const rows=laidOut[ci].filter(c=>c.id===id).map(c=>c.row).reverse();   // 下から
      for(const r of rows){
        if(rest<=0) break;
        const key=ci+"_"+r;
        if(out[key]) continue;
        out[key]={lotId:id, manual:false};
        rest--;
      }
    }
  });
  return out;
}
// そのマスを手動指定にする。「半」の総数 n を保つため、手動指定が n 個に達していたら
// 一番古いものを外す（n 個未満なら、自動の半が1つ減るだけで既存の指定は残る）
function halfMarkSet(sp, laidOut, lotId, ci, row, n){
  const rows=laidOut[ci].filter(c=>c.id===lotId).map(c=>c.row);
  const pos=rows.indexOf(row);
  if(pos<0 || n<=0) return;
  const k=rows.length-1-pos;
  const manual=manualHalfList(sp,laidOut,lotId).filter(m=>!(m.ci===ci && m.row===row));
  const seq=manual.reduce((mx,m)=>Math.max(mx,m.seq),0)+1;
  const keep=manual.length+1>n ? manual.slice(manual.length+1-n) : manual;
  halfMarkClear(sp, lotId);
  [...keep.map(m=>({ci:m.ci,k:m.k,seq:m.seq})), {ci,k,seq}].forEach(m=>{
    const col=sp.cols[m.ci];
    col.halfMarks=col.halfMarks||{};
    (col.halfMarks[String(lotId)]=col.halfMarks[String(lotId)]||[]).push({k:m.k, seq:m.seq});
  });
}
// そのロットの手動指定を全列から消す。空になった halfMarks は列から取り除く
function halfMarkClear(sp, lotId){
  sp.cols.forEach(col=>{
    if(!col.halfMarks) return;
    delete col.halfMarks[String(lotId)];
    if(!Object.keys(col.halfMarks).length) delete col.halfMarks;
  });
}
// 移動したロットの指定を、移動元・移動先の列から消す。keys は "<エリア>|<列>"。
// 枚数だけのデータでは「半」の現物がどのマスと一緒に動いたか分からないため
function dropHalfMarks(spaces, lotId, keys){
  (keys||[]).forEach(key=>{
    const p=String(key).split("|");
    const s=spaces.find(x=>x.name===p[0]);
    const col=s && s.cols[parseInt(p[1])];
    if(!col || !col.halfMarks) return;
    delete col.halfMarks[String(lotId)];
    if(!Object.keys(col.halfMarks).length) delete col.halfMarks;
  });
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `node --test tests/half-mark.test.js`
Expected: PASS（新規 20 件すべて）

Run: `node --test tests/*.test.js`
Expected: 既存 407 件を含めて失敗 0 件（関数を足しただけで、呼び出し元はまだ変えていない）

- [ ] **Step 6: コミットする**

```bash
git add files/index.html tests/half-mark.test.js docs/superpowers/specs/2026-09-24-half-mark-placement-design.md
git commit -m "feat: add half-mark placement helpers"
```

---

### Task 2: 配置図のグリッド・表・署名を新しい「半」の規則に切り替える

**Files:**
- Modify: `files/index.html`
  - `let splitConfirmEnabled=true;`（1263 行付近）の直後に `halfManualEnabled` を宣言
  - `STORE_KEY`（1276 行付近）に `halfManual` を追加
  - `tailAreaOf()`（5033 行付近）の直後に `halfAreaOf()` を追加
  - `sheetEntries()`（5064 行付近）と `stashSlots()`（5204 行付近）の `tailAreaOf(e.lot.id)` を置換
  - `currentSheetSig()`（5467 行付近）の `sp:` を変更
  - `gridRows()`（6199〜6242 行付近）の「半」の決め方を置換
- Modify: `tests/sheet-placement.test.js`（`makeGridRows()` 403 行付近、配置不可セルの組み立て 470 行付近、「半」テスト3件 682〜709 行付近）
- Modify: `tests/half-mark.test.js`

**Interfaces:**
- Consumes: Task 1 の `manualHalfList()`、`halfCells()`
- Produces:
  - グローバル変数 `let halfManualEnabled=false;`
  - `STORE_KEY.halfManual === "palletApp.halfManual"`
  - `halfAreaOf(id): string|null`: 表の「P 半」を付けるエリア名。`halfManualEnabled` が true でメインに有効な手動指定があれば `"メイン"`、それ以外は `tailAreaOf(id)`

- [ ] **Step 1: 失敗するテストを書く（新しい期待値へ書き換え）**

`tests/sheet-placement.test.js` の3件を次のとおり書き換える（テスト名も変える）。

```js
test("配置表の第2ロット半パレット印はまとまりの下端に付ける", () => {
  const gridRows=makeGridRows([
    {h:7,fills:[{id:0,count:2},{id:1,count:3}]}
  ],[{c:0}],[{id:0,half:0},{id:1,half:1}],()=>"メイン");
  const rows=gridRows(0,[]).html.match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.match(rows[6],/<span class="mk">半<\/span>/);
  assert.match(rows[4],/<span class="mk"><\/span>/);
});

test("配置表の准緊急込み2+6は第1ロットのまとまりの下端row1に半を付ける", () => {
  const gridRows=makeGridRows([
    {h:9,up:1,aisleRows:[8],fills:[{id:0,count:2},{id:1,count:6}]}
  ],[{c:0}],[{id:0,half:1},{id:1,half:0}],()=>"メイン");
  const rows=gridRows(0,[]).html.match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.equal(rows.length,8);
  assert.match(rows[0],/<span class="mk"><\/span>/);
  assert.match(rows[1],/<span class="mk">半<\/span>/);
});

test("配置表の両端詰め1+8は第2ロットの下端（緊急用マス）に半を付ける", () => {
  const gridRows=makeGridRows([
    {h:9,up:1,aisleRows:[8],fills:[{id:0,count:1},{id:1,count:8}]}
  ],[{c:0}],[{id:0,half:0},{id:1,half:1}],()=>"メイン");
  const html=gridRows(0,[]).html;
  const rows=html.match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.doesNotMatch(rows[1],/<span class="mk">半<\/span>/);
  assert.match(html,/<td class="colno aisle g[^"]*"><span class="mk">半<\/span>/);
});
```

同じファイルに次の2件を追加する（3件の直後）。

```js
test("配置表: 准緊急マスのある単独ロットは准緊急マスではなく下端に半を付ける", () => {
  const gridRows=makeGridRows([
    {h:9,up:1,aisleRows:[8],fills:[{id:0,count:8}]}
  ],[{c:0}],[{id:0,half:1}],()=>"メイン");
  const rows=gridRows(0,[]).html.match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.match(rows[0],/<span class="mk"><\/span>/);
  assert.match(rows[7],/<span class="mk">半<\/span>/);
});

test("配置表: 設定ONなら手動指定の位置に半を付け、OFFなら下端に戻す", () => {
  const cols=()=>[{h:7,fills:[{id:0,count:5}],halfMarks:{"0":[{k:4,seq:1}]}}];
  const on=makeGridRows(cols(),[{c:0}],[{id:0,half:1}],()=>"メイン",true)(0,[]).html
    .match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.match(on[0],/<span class="mk">半<\/span>/);
  assert.match(on[4],/<span class="mk"><\/span>/);
  const off=makeGridRows(cols(),[{c:0}],[{id:0,half:1}],()=>"メイン",false)(0,[]).html
    .match(/<tr class="grow">[\s\S]*?<\/tr>/g);
  assert.match(off[0],/<span class="mk"><\/span>/);
  assert.match(off[4],/<span class="mk">半<\/span>/);
});
```

`makeGridRows()` を次に置き換える（引数 `halfManual` を追加し、「半」の関数を組み込む）。

```js
// gridRows は lastSp / lastLots など外の値を見るので、注入して組み立てる
function makeGridRows(cols, order, lots=[], tailAreaOf=()=>null, halfManual=false) {
  return new Function(
    "lastSp", "sheetAreas", "gridWarn", "SHEET_GRID_ORDER", "overflowTable", "lastLots", "tailAreaOf",
    "halfManualEnabled",
    functionSource("aisleRowCount") +
    functionSource("gridShift") +
    layoutSources() + halfSources() + functionSource("sheetGridAnchors") +
    functionSource("gridRows") + "; return gridRows;"
  )(
    [{ name: "メイン", cols }],
    () => ["メイン"],
    () => null,
    order,
    () => "",
    lots,
    tailAreaOf,
    halfManual
  );
}

function halfSources(){
  return functionSource("manualHalfList") + functionSource("halfCells") +
    functionSource("halfAreaOf");
}
```

「配置表のメイン配置不可セルには斜線用クラスを出力する」（470 行付近）の組み立ても、`layoutSources() +` の直後に `halfSources() +` を足す（引数の並びは変えない。`halfManualEnabled` は未定義参照にならないよう、下の実装で `typeof` を使う）。

```js
    layoutSources() + halfSources() + functionSource("sheetGridAnchors") + functionSource("gridRows") + "; return gridRows;"
```

`tests/half-mark.test.js` に次を追加する。

```js
test("halfAreaOf: 設定ONでメインに有効な手動指定があればメイン、なければ末尾エリア", () => {
  const make = (enabled) => new Function(
    "lastSp", "halfManualEnabled", "tailAreaOf",
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells", "manualHalfList", "halfAreaOf"]
      .map(functionSource).join("\n") + "; return halfAreaOf;"
  )([
    { name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }] },
    { name: "軒下①", cols: [{ h: 4, fills: [{ id: 0, count: 1 }] }] },
  ], enabled, () => "軒下①");
  assert.equal(make(true)(0), "メイン");
  assert.equal(make(false)(0), "軒下①");
  assert.equal(make(true)(9), "軒下①");
});

test("表の「P 半」は halfAreaOf で決める", () => {
  assert.match(functionSource("sheetEntries"), /halfAreaOf\(e\.lot\.id\)/);
  assert.doesNotMatch(functionSource("sheetEntries"), /tailAreaOf\(/);
  assert.match(functionSource("stashSlots"), /halfAreaOf\(e\.lot\.id\)/);
  assert.doesNotMatch(functionSource("stashSlots"), /tailAreaOf\(/);
});

test("配置図のグリッドは halfCells で半を決める", () => {
  const fn = functionSource("gridRows");
  assert.match(fn, /halfCells\(sp,/);
  assert.doesNotMatch(fn, /splitIds/);
});

test("書き足しの署名は halfMarks を含めない", () => {
  const currentSig = new Function(
    "schedule", "hasResult", "sheetPlacement", "sheetEditSigFrom", "lastFp", "lastLots",
    "snapshotSpaces", "lastSp", "spacesToText", "mergeLots", "fracMode", "SHEET_LAYOUTS",
    functionSource("currentSheetSig") + "; return currentSheetSig;"
  );
  const lay = { top: 0, bottom: 0 };
  const pl = { lay, top: [], bottom: [], overflow: [] };
  const sigOf = sp => currentSig({}, true, () => pl, parts => JSON.stringify(parts.sp), "", [],
    value => JSON.parse(JSON.stringify(value)), sp, () => "", false, false,
    { middle: {}, wide: {} })(pl);
  const plain = [{ name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }] }] }];
  const marked = [{ name: "メイン", cols: [{ h: 4, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 0, seq: 1 }] } }] }];
  assert.equal(sigOf(marked), sigOf(plain));
});

test("半を手動で設定する の保存キーと初期値", () => {
  assert.match(source, /halfManual:"palletApp\.halfManual"/);
  assert.match(source, /let halfManualEnabled=false;/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test tests/half-mark.test.js tests/sheet-placement.test.js`
Expected: FAIL（`halfAreaOf must exist`、`halfManual:"palletApp.halfManual"` 不一致、書き換えた3件の期待値不一致など）

- [ ] **Step 3: 変数と保存キーを追加する**

`let splitConfirmEnabled=true;` の次の行に追加する。

```js
let halfManualEnabled=false;   // 配置編集で「半」の位置を手動で決めるか。既定は off（設定タブで保存）
```

`STORE_KEY` の `splitConfirm:"palletApp.splitConfirm",` の直後に `halfManual:"palletApp.halfManual",` を足す。

- [ ] **Step 4: `halfAreaOf()` を追加し、表の「P 半」を切り替える**

`function tailAreaOf(id){...}` の直後に追加する。

```js
// 表の「P 半」を付けるエリア。設定 ON でメインに有効な手動指定があればメイン。
// それ以外は従来どおり、そのロットの末尾のマスがあるエリア
function halfAreaOf(id){
  const on=typeof halfManualEnabled!=="undefined" && halfManualEnabled;
  const main=on && lastSp ? lastSp.find(s=>s.name==="メイン") : null;
  if(main && manualHalfList(main, spaceCells(main), id).length) return "メイン";
  return tailAreaOf(id);
}
```

`sheetEntries()` の次の2行を置き換える。

```js
    // 「半」はロットの末尾のマスに付くので、その欄にだけ持たせる（上下段で二重に出さない）
    const tail = tailAreaOf(e.lot.id);
```

↓

```js
    // 「半」の欄は halfAreaOf() で決める（手動指定があればメイン、なければ末尾のエリア）。
    // その欄にだけ持たせる（上下段で二重に出さない）
    const tail = halfAreaOf(e.lot.id);
```

`stashSlots()` の次の1行を置き換える。

```js
    const half = (tailAreaOf(e.lot.id)==="退避") ? Math.min(e.lot.half||0, e.pallets) : 0;
```

↓

```js
    const half = (halfAreaOf(e.lot.id)==="退避") ? Math.min(e.lot.half||0, e.pallets) : 0;
```

- [ ] **Step 5: 署名から `halfMarks` を除く**

`currentSheetSig()` の `sp: snapshotSpaces(lastSp),` を置き換える。

```js
    // halfMarks（「半」の手動指定）は紙の欄の並びを変えないので署名に入れない。
    // 入れると「半」を指定しただけで書き足しが前の配置の扱いになって消える
    sp: snapshotSpaces(lastSp).map(s=>({...s, cols:s.cols.map(({halfMarks,...c})=>c)})),
```

- [ ] **Step 6: `gridRows()` の「半」の決め方を置き換える**

`gridRows()` の中の、`const colCells=spaceCells(sp).map(...)` から `isHalf` を作り終える `ids.forEach(...)` までを次に置き換える。置き換え前の範囲は、`// 盤と同じ配置済みセルから、紙で必要なロットIDだけを取り出す` の行から `list.slice(-n).forEach(k=>{ isHalf[k]=true; });` を含む `});` の行まで。

```js
  // 盤と同じ配置済みセルから、紙で必要なロットIDだけを取り出す
  const laid=spaceCells(sp);
  const colCells=laid.map(cells=>cells.map(cell=>
    cell.id==null ? null : {id:cell.id}
  ));
  // 「半」を付けるマス。盤（drawZone）と同じ halfCells() を使うので位置は必ず一致する。
  // 既定はそのロットのまとまりの下端、設定 ON なら手動指定を優先する
  const isHalf={};
  Object.keys(halfCells(sp, lastLots, {
    manualOn: typeof halfManualEnabled!=="undefined" && halfManualEnabled,
    areaOf: id=>halfAreaOf(id),
    laidOut: laid,
  })).forEach(k=>{ isHalf[k]=true; });
```

置き換え後、`gridRows()` の中に `norm`、`aisle[`、`ordered`、`splitIds` の参照が残っていないことを確認する。

```bash
awk '/^function gridRows\(/,/^}/' files/index.html | grep -nE 'norm\[|aisle\[|ordered|splitIds'
```

Expected: 出力なし

- [ ] **Step 7: テストが通ることを確認する**

Run: `node --test tests/*.test.js`
Expected: 失敗 0 件

- [ ] **Step 8: コミットする**

```bash
git add files/index.html tests/sheet-placement.test.js tests/half-mark.test.js
git commit -m "feat: place sheet half marks at lot bottom"
```

---

### Task 3: 移動で指定を消し、配置編集の盤に角バッジを出す

**Files:**
- Modify: `files/index.html`
  - `moveCells()`（3232 行付近）
  - `validateStashMove()`（3924 行付近）
  - `drawZone()`（2940〜2990 行付近）と、`halfAreaOf()` の直後に `halfCellsFor()` を追加
  - CSS（`.cell.sel` の定義 156 行付近の直前）
- Modify: `tests/sheet-placement.test.js`（「手動移動は配置不可セルを飛ばして描画される」の `moveCells` 組み立て 900 行付近）
- Modify: `tests/half-mark.test.js`

**Interfaces:**
- Consumes: Task 1 の `halfCells()`、`dropHalfMarks()`、Task 2 の `halfAreaOf()`、`halfManualEnabled`
- Produces: `halfCellsFor(sp, laidOut): {[key:string]:{lotId,manual}}`（`halfCells()` にアプリの現在値を渡すだけの薄い関数。Task 4 も使う）

- [ ] **Step 1: 失敗するテストを書く**

`tests/half-mark.test.js` に追加する。

```js
test("moveCells: 移動したロットの指定を移動元・移動先から消し、他ロットと他の列は残す", () => {
  const moveCells = new Function(
    functionSource("normalizeFills") + functionSource("dropHalfMarks") +
    functionSource("moveCells") + "; return moveCells;"
  )();
  const next = [{ name: "メイン", cols: [
    { h: 7, fills: [{ id: 0, count: 5 }], halfMarks: { "0": [{ k: 0, seq: 1 }], "1": [{ k: 0, seq: 2 }] } },
    { h: 7, fills: [{ id: 1, count: 2 }], halfMarks: { "1": [{ k: 1, seq: 3 }] } },
    { h: 7, fills: [{ id: 0, count: 2 }], halfMarks: { "0": [{ k: 1, seq: 4 }] } },
  ] }];
  moveCells(next, 0, { "メイン|0": 1 }, "メイン", 1);
  assert.deepEqual(next[0].cols[0].halfMarks, { "1": [{ k: 0, seq: 2 }] });
  assert.deepEqual(next[0].cols[1].halfMarks, { "1": [{ k: 1, seq: 3 }] });
  assert.deepEqual(next[0].cols[2].halfMarks, { "0": [{ k: 1, seq: 4 }] });
});

test("退避への移動でも、移動したロットの指定を移動元から消す", () => {
  assert.match(functionSource("validateStashMove"), /dropHalfMarks\(next, lotId, Object\.keys\(counts\)\)/);
});

test("盤はメインの半のマスに角バッジを付ける", () => {
  const root = { innerHTML: "", children: [], appendChild(node) { this.children.push(node); } };
  const doc = {
    getElementById: () => root,
    createElement: () => ({ className: "", classList: { add() {} }, style: {}, innerHTML: "" }),
  };
  const drawZone = new Function("document", "FLOOR_POS", "activeShift", "blockedCellKey", "used", "usableCount",
    "halfCellsFor",
    ["fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells", "colTopOffset", "drawZone"]
      .map(functionSource).join("\n") + "; return drawZone;"
  )(doc, {}, () => ({ blocked: [] }), () => "", col => col.fills.reduce((n, f) => n + f.count, 0), col => col.h,
    () => ({ "0_4": { lotId: 0, manual: false } }));
  drawZone("map", [{ name: "メイン", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }], { 0: "#aaa" });
  const html = root.children[0].innerHTML;
  assert.match(html, /<div class="cell half"[^>]*data-row="4"[^>]*>1<span class="halfbadge" aria-hidden="true">半<\/span><\/div>/);
  assert.equal((html.match(/halfbadge/g) || []).length, 1);
  assert.match(source, /\.cell \.halfbadge\{position:absolute;top:0;right:0/);
});
```

`tests/sheet-placement.test.js` の「手動移動は配置不可セルを飛ばして描画される」の組み立てを、`dropHalfMarks` を含む形にする。

```js
  const moveCells = new Function(
    functionSource("normalizeFills") +
    functionSource("dropHalfMarks") +
    functionSource("moveCells") + "; return moveCells;"
  )();
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test tests/half-mark.test.js`
Expected: FAIL（`halfMarks` が消えていない、`dropHalfMarks(next, lotId, Object.keys(counts))` が見つからない、`halfbadge` が見つからない）

- [ ] **Step 3: 移動で指定を消す**

`moveCells()` の `dc.fills.unshift(entry);` の直後、`normalizeFills(next);` の直前に追加する。

```js
  // 「半」の手動指定は移動元・移動先の列から消す。枚数だけのデータでは
  // 「半」の現物がどのマスと一緒に動いたか分からないため（設計書 3-4）
  dropHalfMarks(next, lotId, [...Object.keys(counts), skip]);
```

`validateStashMove()` の `putToStash(next, lotId, moved);` の直前に追加する。

```js
  dropHalfMarks(next, lotId, Object.keys(counts));
```

- [ ] **Step 4: `halfCellsFor()` を追加する**

`halfAreaOf()` の直後に追加する。

```js
// 盤と操作バーが使う。アプリの現在値（lastLots・設定）を halfCells() に渡す
function halfCellsFor(sp, laidOut){
  return halfCells(sp, lastLots, {manualOn:halfManualEnabled, areaOf:id=>halfAreaOf(id), laidOut});
}
```

- [ ] **Step 5: 盤に角バッジを出す**

`drawZone()` の `const laidOut=spaceCells(sp);` の直後に追加する。

```js
    // 「半」はメインだけ。テストは drawZone を単体で評価するので typeof で守る
    const halfMap = (sp.name==="メイン" && typeof halfCellsFor==="function") ? halfCellsFor(sp, laidOut) : {};
```

`colHtml` の中の `arr.forEach(a=>{` ブロックで、次の2か所を変える。

1. `const label=filled?String(a.id+1):"";` の直後に追加する。

```js
        const half=filled && !!halfMap[ci+"_"+a.row];
        if(half) cls.push("half");
```

2. `stateLabel` の行と `cells+=` の2行を次に置き換える。

```js
        const stateLabel=blocked ? (filled ? "配置不可・ロットあり。再配置待ち" : "配置不可")
          : (filled ? `ロット ${label}${half?"・半":""}` : "空きセル");
        cells+=`<div class="${cls.join(' ')}" data-row="${a.row}" aria-label="${stateLabel}"${filled?` data-lot="${a.id}"`:""}`
              +` style="${bg?'background:'+bg:''}">${label}${half?'<span class="halfbadge" aria-hidden="true">半</span>':""}</div>`;
```

`cls` に `"half"` を足す位置は、既存の `const cls=["cell"];` の後、`blocked` 判定より後でよい（テストは `class="cell half"` を期待するので、単独ロット・配置不可なし・境界線なしのマスでは `cell half` の順になる）。

- [ ] **Step 6: 角バッジの CSS を追加する**

`.cell.sel{` の定義の直前に追加する。

```css
  /* 「半」の角バッジ（設計書 4-3・案B）。ロット番号は残し、右上に小さく「半」を出す。
     .cell は overflow:hidden なので、position:relative にしてマスの内側に収める */
  .cell.half{position:relative}
  .cell .halfbadge{position:absolute;top:0;right:0;width:14px;height:14px;box-sizing:border-box;
                   background:#fff;color:#111;font-size:10px;font-weight:700;line-height:13px;text-align:center;
                   border-left:1px solid #111;border-bottom:1px solid #111;border-bottom-left-radius:6px;
                   pointer-events:none}
```

- [ ] **Step 7: テストが通ることを確認する**

Run: `node --test tests/*.test.js`
Expected: 失敗 0 件

- [ ] **Step 8: コミットする**

```bash
git add files/index.html tests/sheet-placement.test.js tests/half-mark.test.js
git commit -m "feat: show half badge on edit board"
```

---

### Task 4: 操作バーの「半」ボタンと設定

**Files:**
- Modify: `files/index.html`
  - 操作バーの HTML（`id="toolFlag"` の `<div>`、875 行付近）
  - 設定タブの HTML（`splitConfirmChk` の説明 `<div class="hint">`、1072 行付近の直後）
  - `toggleSplitConfirm()` / `initSplitConfirm()`（1964〜1971 行付近）の直後に設定の関数を追加
  - 初期化の呼び出し（`initSplitConfirm();`、6704 行付近）の直後
  - `updateFlag()`（4334 行付近）
  - `fitFlagCount()`（4396 行付近）の直後に `fitFlagHalf()` を追加
  - `applyMove()`（3799 行付近）の直後に `halfBtnState()` / `onHalfBtn()` を追加
  - CSS（`.flagcount:empty{display:none}` の直後）
- Modify: `tests/half-mark.test.js`

**Interfaces:**
- Consumes: Task 1 の `halfMarkSet()`、`halfMarkClear()`、Task 3 の `halfCellsFor()`、既存の `sel`、`spaceCells()`、`snapshotSpaces()`、`selSnapshot()`、`cloneSpaces()`、`pushMoveStep()`、`saveManual()`、`clearSel()`、`redraw()`、`isActiveFresh()`、`flagCountWidth()`
- Produces:
  - `halfBtnState(): null | {mode:"set"|"auto"|"disabled", lotId:number, ci:number, row:number, laid:Cell[][]}`
  - `onHalfBtn(): void`
  - `fitFlagHalf(): void`
  - `toggleHalfManual(): void`、`initHalfManual(): void`
  - DOM: `#flagHalf`（`span.flaghalf`）、`#halfBtn`、`#halfBtnText`、`#halfManualChk`

- [ ] **Step 1: 失敗するテストを書く**

`tests/half-mark.test.js` に追加する。

```js
function loadHalfBtn({ spaces, lots, cells, enabled = true, fresh = true }) {
  const log = { pushed: 0, saved: 0, redrawn: 0, cleared: 0 };
  const src = `
    let lastSp=spaces, lastLots=lots, halfManualEnabled=enabled;
    const sel={lotId:null, cells:new Set(cells)};
    ${["clone", "fillOrder", "cellGroups", "cellsOf", "cellLayoutOptions", "spaceCells",
       "manualHalfList", "halfCells", "halfMarkSet", "halfMarkClear", "halfCellsFor",
       "halfBtnState", "onHalfBtn"].map(functionSource).join("\n")}
    function isActiveFresh(){ return fresh; }
    function halfAreaOf(){ return "メイン"; }
    function snapshotSpaces(sp){ return clone(sp); }
    function cloneSpaces(sp){ return clone(sp); }
    function selSnapshot(){ return null; }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){ log.cleared++; }
    function redraw(){ log.redrawn++; }
    return { halfBtnState, onHalfBtn, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "lots", "cells", "enabled", "fresh", "log", src)(spaces, lots, cells, enabled, fresh, log);
  return { ...made, log };
}
const oneCol = () => [{ name: "メイン", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }];

test("半ボタン: 設定OFF・複数選択・メイン外・half=0・古い配置では出さない", () => {
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"], enabled: false }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|1", "メイン|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: [{ name: "軒下①", cols: [{ h: 7, fills: [{ id: 0, count: 5 }] }] }], lots: [{ id: 0, half: 1 }], cells: ["軒下①|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 0 }], cells: ["メイン|0|2"] }).halfBtnState(), null);
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"], fresh: false }).halfBtnState(), null);
});

test("半ボタン: 半でないマスは set、自動の半は disabled、手動の半は auto", () => {
  const lots = [{ id: 0, half: 1 }];
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots, cells: ["メイン|0|2"] }).halfBtnState().mode, "set");
  assert.equal(loadHalfBtn({ spaces: oneCol(), lots, cells: ["メイン|0|4"] }).halfBtnState().mode, "disabled");
  const marked = oneCol(); marked[0].cols[0].halfMarks = { "0": [{ k: 2, seq: 1 }] };
  assert.equal(loadHalfBtn({ spaces: marked, lots, cells: ["メイン|0|2"] }).halfBtnState().mode, "auto");
});

test("半ボタン: 半を設定 は履歴に積み、保存し、描き直す", () => {
  const app = loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"] });
  app.onHalfBtn();
  assert.deepEqual(app.spaces()[0].cols[0].halfMarks, { "0": [{ k: 2, seq: 1 }] });
  assert.deepEqual(app.log, { pushed: 1, saved: 1, redrawn: 1, cleared: 1 });
});

test("半ボタン: 半を自動に戻す はそのロットの指定を消す", () => {
  const marked = oneCol(); marked[0].cols[0].halfMarks = { "0": [{ k: 2, seq: 1 }] };
  const app = loadHalfBtn({ spaces: marked, lots: [{ id: 0, half: 1 }], cells: ["メイン|0|2"] });
  app.onHalfBtn();
  assert.equal(app.spaces()[0].cols[0].halfMarks, undefined);
  assert.equal(app.log.pushed, 1);
});

test("半ボタン: 自動の半（disabled）では何もしない", () => {
  const app = loadHalfBtn({ spaces: oneCol(), lots: [{ id: 0, half: 1 }], cells: ["メイン|0|4"] });
  app.onHalfBtn();
  assert.equal(app.spaces()[0].cols[0].halfMarks, undefined);
  assert.equal(app.log.pushed, 0);
});

test("操作バー: 半ボタンの文言と丸囲みアイコン", () => {
  assert.match(source, /<span class="flaghalf" id="flagHalf" hidden>/);
  assert.match(source, /<span class="halfic" aria-hidden="true">半<\/span>/);
  const fn = functionSource("updateFlag");
  assert.match(fn, /"半を自動に戻す"/);
  assert.match(fn, /"半を設定"/);
  assert.match(fn, /halfBtnState\(\)/);
  assert.match(fn, /fitFlagHalf\(\)/);
  // 押せないときも消さずに disabled にする
  assert.match(fn, /hb\.disabled\s*=/);
});

test("操作バー: 2行にするかは実測で決め、@media では決めない", () => {
  const fn = functionSource("fitFlagHalf");
  assert.match(fn, /parseFloat\(cs\.maxWidth\)/);
  assert.match(fn, /classList\.toggle\("tworow"/);
  assert.match(source, /\.toolflag\.tworow\{flex-wrap:wrap\}/);
  assert.match(source, /\.toolflag\.tworow \.flaghalf\{flex-basis:100%\}/);
  assert.match(source, /\.flaghalf\[hidden\]\{display:none\}/);
});

test("設定: 半を手動で設定する のチェックボックスと読み書き", () => {
  assert.match(source, /<input type="checkbox" id="halfManualChk" onchange="toggleHalfManual\(\)">/);
  assert.match(functionSource("toggleHalfManual"), /saveData\(STORE_KEY\.halfManual, halfManualEnabled\)/);
  assert.match(functionSource("initHalfManual"), /loadData\(STORE_KEY\.halfManual\)===true/);
  assert.match(source, /initSplitConfirm\(\);\s*\ninitHalfManual\(\);/);
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `node --test tests/half-mark.test.js`
Expected: FAIL（`halfBtnState must exist` ほか）

- [ ] **Step 3: 操作バーの HTML にボタンを追加する**

`id="toolFlagCount"` の `<span>` の直後（`</div>` の前）に追加する。

```html
          <!-- 「半」の位置（設計書 4-1）。入りきらないときは fitFlagHalf() が2行目へ回す -->
          <span class="flaghalf" id="flagHalf" hidden>
            <button class="flagundo halfbtn" id="halfBtn" onclick="onHalfBtn()"><span class="halfic" aria-hidden="true">半</span><span id="halfBtnText">半を設定</span></button>
          </span>
```

- [ ] **Step 4: 操作バーの CSS を追加する**

`.flagcount:empty{display:none}` の直後に追加する。

```css
  /* 「半」のボタン（設計書 4-1・4-4）。1行に入らないときだけ fitFlagHalf() が .tworow を付け、
     2行目に回す。戻す・進むと選択数は1行目のまま動かない（fitFlagCount() が1行目だけで
     選択数の表示を決めるので、選択数が2行目へ折り返すことはない） */
  .flaghalf{display:flex;flex:none}
  .flaghalf[hidden]{display:none}
  .toolflag.tworow{flex-wrap:wrap}
  .toolflag.tworow .flaghalf{flex-basis:100%}
  .halfbtn{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}
  .halfic{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;
          box-sizing:border-box;border:1.5px solid currentColor;border-radius:50%;font-size:12px;line-height:1}
```

- [ ] **Step 5: `halfBtnState()` と `onHalfBtn()` を追加する**

`applyMove()` の直後に追加する。

```js
/* 「半」のボタンの状態（設計書 4-1）。出さないときは null。
   mode: set = 半でないマス（押すと手動指定）、auto = 手動指定の半（押すと自動に戻す）、
         disabled = 自動で置かれた半（押せない） */
function halfBtnState(){
  if(!halfManualEnabled || !isActiveFresh() || !lastSp || !lastLots || sel.cells.size!==1) return null;
  const p=[...sel.cells][0].split("|");
  if(p[0]!=="メイン") return null;
  const sp=lastSp.find(s=>s.name==="メイン");
  if(!sp) return null;
  const ci=parseInt(p[1]), row=parseInt(p[2]);
  const laid=spaceCells(sp);
  const cell=laid[ci] && laid[ci][row];
  if(!cell || cell.id==null) return null;
  const lot=lastLots.find(l=>l.id===cell.id);
  if(!lot || !(lot.half>0)) return null;
  const hit=halfCellsFor(sp, laid)[ci+"_"+row];
  return {mode: !hit ? "set" : hit.manual ? "auto" : "disabled", lotId:cell.id, ci, row, laid};
}
// 移動と同じ後始末（履歴・保存・選択解除・描き直し）をする。applyMove() と同じ並び
function onHalfBtn(){
  const st=halfBtnState();
  if(!st || st.mode==="disabled") return;
  const spBefore=snapshotSpaces(lastSp), selBefore=selSnapshot();
  const next=cloneSpaces(lastSp);
  const sp=next.find(s=>s.name==="メイン");
  const lot=lastLots.find(l=>l.id===st.lotId);
  if(st.mode==="set") halfMarkSet(sp, st.laid, st.lotId, st.ci, st.row, lot.half);
  else halfMarkClear(sp, st.lotId);
  lastSp=next;
  pushMoveStep(spBefore, selBefore);
  saveManual();
  clearSel();
  redraw();
}
```

- [ ] **Step 6: `updateFlag()` にボタンの表示を足す**

`updateFlag()` の `if(ub) ub.disabled = !canU;` の直前に追加する。

```js
  // 「半」のボタン（設計書 4-1）。押せないときも消さずに disabled にする
  const fh=document.getElementById("flagHalf");
  const hb=document.getElementById("halfBtn");
  const ht=document.getElementById("halfBtnText");
  const hs=(typeof halfBtnState==="function") ? halfBtnState() : null;
  if(fh) fh.hidden=!hs;
  if(hs && hb && ht){
    ht.textContent = hs.mode==="auto" ? "半を自動に戻す" : "半を設定";
    hb.disabled = hs.mode==="disabled";
    hb.setAttribute("aria-label", ht.textContent);
    hb.title = ht.textContent;
  }
```

同じ関数の最後の `fitFlagCount();` の直後に `fitFlagHalf();` を足す。帯を隠して `return` する分岐（`if(n===0 && !canU && !canR){ ... return; }`）の中では何もしなくてよい（選択が無いときは `halfBtnState()` も null）。ただし分岐の中の `f.style.display="none";` の直前に `f.classList.remove("tworow");` を足し、次に帯を出したときに古い2行表示が残らないようにする。

- [ ] **Step 7: `fitFlagHalf()` を追加する**

`fitFlagCount()` の直後に追加する。

```js
/* 「半」のボタンが1行に入らなければ帯を2行にする（設計書 4-4・8-3）。
   必要量は文言（「半を設定」「半を自動に戻す」）・選択数・戻す進むの太さで変わり、
   画面の幅だけでは決まらない。fitFlagCount() と同じく実測して上限と比べる */
function fitFlagHalf(){
  const f=document.getElementById("toolFlag");
  const h=document.getElementById("flagHalf");
  if(!f || !h) return;
  if(h.hidden){ f.classList.remove("tworow"); return; }
  const cs=getComputedStyle(f);
  const cap=parseFloat(cs.maxWidth);
  if(!isFinite(cap)){ f.classList.remove("tworow"); return; }   // 上限なし＝必ず入る
  const pad=(parseFloat(cs.paddingLeft)||0)+(parseFloat(cs.paddingRight)||0);
  const gap=parseFloat(cs.columnGap)||0;
  const b=f.querySelector(".flagbtns");
  const c=document.getElementById("toolFlagCount");
  const btn=document.getElementById("halfBtn");
  const countW=(c && !c.hidden && c.textContent) ? gap+flagCountWidth(c.textContent) : 0;
  const need=pad+(b?b.getBoundingClientRect().width:0)+countW+gap+(btn?btn.getBoundingClientRect().width:0);
  f.classList.toggle("tworow", need>cap);
}
```

- [ ] **Step 8: 設定タブにチェックボックスを追加する**

`splitConfirmChk` の説明（`<div class="hint">OFFにすると、配置編集でロットを分ける移動を確認なしで実行します。</div>`）の直後に追加する。

```html
          <label class="chk"><input type="checkbox" id="halfManualChk" onchange="toggleHalfManual()"> 配置編集で「半」の位置を手動で設定する</label>
          <div class="hint">ONにすると、配置編集で1マスを選んだときに「半を設定」が出ます。OFFの間は、設定済みの位置を残したまま自動の位置（下側）で表示します。</div>
```

`initSplitConfirm()` の直後に追加する。

```js
/* 「半」の位置を手動で決めるか（設計書 6 章）。既定は off。
   切り替えても配置データは変わらないので履歴には積まない。盤と紙を描き直すだけ */
function toggleHalfManual(){
  halfManualEnabled=document.getElementById("halfManualChk").checked;
  saveData(STORE_KEY.halfManual, halfManualEnabled);
  if(hasResult && lastLots && isActiveFresh()) redraw();
  else updateFlag();
}
function initHalfManual(){
  halfManualEnabled=loadData(STORE_KEY.halfManual)===true;
  document.getElementById("halfManualChk").checked=halfManualEnabled;
}
```

初期化の `initSplitConfirm();` の次の行に `initHalfManual();` を足す（改行1つで続ける）。

- [ ] **Step 9: テストが通ることを確認する**

Run: `node --test tests/*.test.js`
Expected: 失敗 0 件

- [ ] **Step 10: コミットする**

```bash
git add files/index.html tests/half-mark.test.js
git commit -m "feat: add half-mark button and setting"
```

---

### Task 5: 更新配信・全体回帰・実画面確認

**Files:**
- Modify: `files/sw.js:6`
- Verify: `files/index.html`

**Interfaces:**
- Consumes: Task 1〜4 の完成物
- Produces: `CACHE_VERSION = "v76"`、全自動テスト成功、ブラウザでの確認記録

- [ ] **Step 1: Service Worker のキャッシュ版を上げる**

`files/sw.js` の1行だけを変更する。

```js
const CACHE_VERSION = "v76";
```

- [ ] **Step 2: 全自動テストと差分検査**

Run:

```bash
node --test tests/*.test.js
```

```bash
git diff --check
```

Expected: 全テスト PASS（既存 407 件＋新規）。`git diff --check` は出力なし。失敗があればブラウザ確認へ進まない。

- [ ] **Step 3: ローカルプレビューを起動する**

Claude Code のプレビュー（`.claude/launch.json` の `pallet-layout`、ポート 8765）を使うか、次を実行する。

```bash
python3 -m http.server 8765 --directory files
```

以前このポートで開いたブラウザでは、DevTools の Application で Service Worker を unregister し、Cache Storage を削除してから再読込する。新しいブラウザコンテキストなら不要。`window.confirm` がすぐ false を返す環境（Claude のブラウザペインなど）では、確認用タブに限って `window.confirm=()=>true` をコンソールで実行してから操作する（アプリのコードは変えない）。

- [ ] **Step 4: 機能を本物の入口から確かめる（教訓 2026-09-21「最初の1回」）**

1. 「混載デモ」→「▶ 自動配置を作成」→「配置編集」。
2. 設定 OFF（初期値）のまま、メインの荷物マスを1つタップする。操作バーに「半を設定」が出ないこと。
3. 盤のメインで、端数のあるロット（配置図タブの表で「P 半」のもの）のまとまりの一番下のマスに角バッジ「半」があること。配置図タブを開き、グリッドの同じ列・同じ段に「半」があること。
4. 設定タブで「配置編集で『半』の位置を手動で設定する」を ON にする。配置編集に戻る。
5. 端数のあるロットの、バッジが付いていないマスを1つタップする。操作バーに「（丸囲み半）半を設定」が出ること。これが最初の1回で押せること。
6. 押す。バッジがそのマスへ移ること。直後に「元に戻す」が押せること。配置図タブで同じ位置に「半」が移り、表の「P 半」の欄が変わらないこと（メインが末尾のロットの場合）。
7. 同じマスをタップする。「半を自動に戻す」が出ること。押すと下端に戻ること。
8. 「元に戻す」「やり直す」で「半」の位置が行き来すること。
9. 「半」を指定したロットのマスを別の列へドラッグする。指定が消え、下端の自動位置に戻ること。
10. 自動の「半」のマスをタップする。「半を設定」が押せない状態で表示されること。
11. 設定を OFF にする。指定位置ではなく下端に表示されること。ON に戻すと指定位置が復活すること（手順 9 の後なので、先に手順 5〜6 で指定し直してから確かめる）。
12. 配置図タブで「テキスト編集」から欄に書き足しをしてから配置編集で「半」を指定する。配置図の書き足しが消えず、「前の配置でテキスト編集が…」の警告が出ないこと。

- [ ] **Step 5: 操作バーの幅を実測する（教訓 2026-09-21「padding は縮まない」）**

ブラウザのビューポートを 375px・412px・1280px にして、それぞれ「半を設定」「半を自動に戻す」を出した状態で DevTools コンソールから次を実行し、結果を記録する。

```js
(()=>{const f=document.getElementById("toolFlag");const r=el=>el&&Math.round(el.getBoundingClientRect().width*10)/10;
return {tworow:f.classList.contains("tworow"),flag:r(f),cap:getComputedStyle(f).maxWidth,
btns:r(f.querySelector(".flagbtns")),count:document.getElementById("toolFlagCount").hidden?"hidden":r(document.getElementById("toolFlagCount")),
half:r(document.getElementById("halfBtn")),undoTop:Math.round(document.getElementById("undoBtn").getBoundingClientRect().top)};})()
```

確認点:

- 375px・412px では `tworow:true` で、「半」のボタンが2行目に文字を省略せず表示される。
- 1280px では1行に収まるなら `tworow:false`。
- 「半」のボタンを出したときと出さないときで、`undoTop`（元に戻すボタンの上端）が変わらない。
- 選択中（タップ）と運搬中（ドラッグ中）の両方で、帯が崩れない。

- [ ] **Step 6: 最終差分と全テストを再確認する**

```bash
git diff main --stat
```

```bash
node --test tests/*.test.js
```

Expected: 変更は `files/index.html`、`files/sw.js`、`tests/half-mark.test.js`、`tests/sheet-placement.test.js`、設計書だけ。全テスト PASS。

- [ ] **Step 7: コミットする**

```bash
git add files/sw.js
git commit -m "chore: publish half-mark placement update"
```

- [ ] **Step 8: ユーザー向けの確認手順を提示する（実機 Pixel 9a を含む）**

このリポジトリには `package.json` や Playwright の E2E 設定がないので、E2E コマンドは作らない。完了報告では次を提示する。

PC での回帰テストとプレビュー:

```bash
node --test tests/*.test.js
```

```bash
python3 -m http.server 8765 --directory files
```

ブラウザで http://localhost:8765/ を開き、Step 4 の手順を案内する。

実機（Pixel 9a / Android Chrome）での確認（教訓 2026-09-16）:

1. Mac とスマホを同じ Wi-Fi につなぐ。
2. Mac の LAN IP を調べる。

```bash
ipconfig getifaddr en0
```

3. Mac で `python3 -m http.server 8765 --directory files` を起動する。macOS のファイアウォールが有効なら、初回に Python の受信接続を許可する。
4. スマホの Chrome で `http://<手順2のIP>:8765/` を開く。LAN の HTTP では Service Worker が登録されないので、キャッシュの削除は不要（更新配信の確認はこの方法ではできない）。データ投入も不要（保存データが無ければサンプルが入る）。
5. Step 4 の 4〜7 を指で行う（設定 ON、荷物マスをタップ、「半を設定」、「半を自動に戻す」）。
6. 操作バーが2行になり、2行目の「半を設定」「半を自動に戻す」が省略されずに読めること、元に戻すボタンの位置が動かないこと、角バッジ「半」が読めることを確かめる。
7. 終わったら Mac のターミナルで `Ctrl+C` を押してサーバーを止める。
