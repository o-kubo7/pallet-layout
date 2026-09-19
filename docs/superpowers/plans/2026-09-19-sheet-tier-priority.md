# 配置図の下段をメイン優先で埋める 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の下段の欄を、基準エリア（既定＝メイン）のロットで先に埋め、余った欄を PC横・EV横 に右詰めで配る。

**Architecture:** 変更は `files/index.html` の3か所だけ。`arrangeBottomSlots()` の取り分の計算順を入れ替え、`sheetPlacement()` に「下段のこぼれのうち基準エリア以外を上段の空き欄へ回す」経路を足し、`fitSheetText()` にその回送の画面通知を足す。責任分担（誰がどちらの段に行くかは `sheetPlacement()`、下段のどこに置くかは `arrangeBottomSlots()`）は変えない。

**Tech Stack:** 単一 HTML ファイルに埋め込んだ素の JavaScript。テストは Node 標準の `node:test` で、`new Function()` に関数ソースを流し込むサンドボックス方式。

**Spec:** `docs/superpowers/specs/2026-09-19-sheet-tier-priority-design.md`

## Global Constraints

- テストの実行コマンドは `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`。**`node --test tests/` は Node v22.15.0 ではディレクトリを解決できず失敗する**ので使わない
- エリア名（「メイン」「PC横」「EV横」）をコードに書かない。基準エリアは `sheetAreas("bottom")[0]`、並び順は `sheetAreas()` の戻り順（設計書 §4-1）
- 「EV横 が最右」は PC横 と EV横 の両方が下段に残る日に限る。右詰めに1欄しか残らない日は並び順の先頭（既定では PC横）を残す（設計書 §3-2）
- 基準エリアのこぼれは上段へ回さない。追記欄へ直行する（設計書 §3-3）
- 退避（`※未定`）の構造は変えない。`sheetPlacement()` 冒頭の `sheetSlots("top").concat(stashSlots())` はそのまま（設計書 §3-3）
- `SHEET_LAYOUTS` は触らない。列は増やさない（設計書 §4-5・§7）
- 各タスクの最後に必ずコミットする。コミットメッセージは日本語、末尾に `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` を付ける

## 着手前の実測（2026-09-19 に実施済み）

この計画のテストは**すべて改修前のコードに1回流して、赤（新機能）／緑（回帰）になることを確認済み**。
実装差分もブラウザで実際に描画して確認済み。以下は再調査不要。

- 改修前のテスト全体: 142 pass / 0 fail
- Task 1 の実装を当てると落ちる既存テストは **1件だけ**（`右端予約で欄数が減ってもあふれたメイン項目は入力順を保つ`）。設計書 §5 は5件を挙げていたが、残り4件は落ちない
- ダミーデータ（17行・216P）での実描画: 改修前はメイン2件が追記欄へ落ちていたが、改修後は下段9欄がメイン7＋PC横2になり、メインのこぼれが消えた

## ファイル構成

- 変更: `files/index.html`
  - `arrangeBottomSlots()`（`4525` 付近）— 下段の取り分の計算順
  - `sheetPlacement()`（`4593` 付近）— 下段→上段の回送
  - `fitSheetText()`（`4670` 付近）— 回送の画面通知
- 変更: `files/sw.js` — `CACHE_VERSION`
- 変更: `tests/sheet-placement.test.js` — 新規テストの追加と、既存テスト1件の期待値更新
- 変更: `docs/superpowers/specs/2026-09-12-sheet-slot-proximity-design.md` — 決定1を上書きした旨の追記

---

### Task 1: `arrangeBottomSlots()` の取り分を基準エリア優先にする

**Files:**
- Modify: `files/index.html`（`arrangeBottomSlots()` 内の3行）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `arrangeBottomSlots(entries, count, positions)` — 既存。引数も戻り値の形（`{slots, dropped}`）も変えない
- Produces: `dropped` の並びは「基準エリアのこぼれ → 上段からの救済のこぼれ → 基準エリア以外のこぼれ」。Task 2 がこの並びを前提にする

- [ ] **Step 1: 失敗するテストを5件書く**

`tests/sheet-placement.test.js` の末尾に追加する。

```javascript
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
```

- [ ] **Step 2: テストを流して落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: 5件のうち**3件が FAIL**（`下段の欄は基準エリアのロットが先に取る` / `右詰めに1欄しか残らない日は並び順の先頭を残す` / `基準エリアが欄数を超えたら基準エリア以外は全部こぼれる`）。
`Expected values to be strictly deep-equal` で、実際の `slots` に `PC横`・`EV横` が先に入っていることが出る。
`両方が下段に残る日は右詰めとEV横最右を保つ` と `上段からの救済は基準エリア以外より後ろに置く` の
2件は改修前でも **PASS**（右詰めの並びと救済の順位は変えないので、これは回帰テスト）。

- [ ] **Step 3: 実装する**

`files/index.html` の `arrangeBottomSlots()` の中の次の3行を探す。

```javascript
  // PC横・EV横が両方ある場合は、EV横を最も右に置く。欄超過時も右側の先頭から残す。
  const keptRight=rightEntries.slice(0, Math.min(rightEntries.length, count));
  const mainCap=Math.max(0, count-keptRight.length);
  const keptMain=mainEntries.slice(0, mainCap);
```

次に置き換える。コメントも差し替える。

```javascript
  // 下段の欄は基準エリアのロットが先に取る（設計書 2026-09-19 §3-1）。盤に描かれるのは
  // 基準エリアだけで、どのロットが盤のどこにあるかは下段の欄から引く引き出し線でしか
  // 分からない。基準エリア以外は盤に無いので、下段の欄を取っても線の価値を使わない。
  // 残った欄を基準エリア以外に右詰めで配る。並び順の先頭から残すので、
  // 1欄しか残らない日は PC横 が残り、「EV横 が最右」は両方入る日だけ成り立つ。
  const keptMain=mainEntries.slice(0, Math.min(mainEntries.length, count));
  const keptRight=rightEntries.slice(0, Math.max(0, count-keptMain.length));
  const mainCap=Math.max(0, count-keptRight.length);
```

`mainCap` は以降の近接配置の探索範囲（`choose()` の上限）としてそのまま使われる。
`keptMain` を先に決めてから `mainCap` を計算する順序になる点に注意する。
これより下の行（`allPositions` 以降、`rescueCap`、`slots`、`dropped`）は**一切変えない**。

- [ ] **Step 4: テストを流す**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: 新しい5件は PASS。既存テストが **1件だけ FAIL** する
（`右端予約で欄数が減ってもあふれたメイン項目は入力順を保つ`）。ほかに落ちるものがあれば、
この計画の前提と違うので**先に止めて報告する**。

- [ ] **Step 5: 落ちた既存テストの期待値を新しい仕様に合わせる**

`tests/sheet-placement.test.js` の `右端予約で欄数が減ってもあふれたメイン項目は入力順を保つ`
（2026-09-19 時点で 660 行付近）の最後の2行を書き換える。

変更前:

```javascript
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id), [2, 1, 4, 5]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), [3]);
```

変更後:

```javascript
  // 基準エリア優先にしたのでメイン3件が先に欄を取り、右詰めに残るのは1欄。
  // 並び順の先頭の PC横 が残り、EV横 がこぼれる（設計書 2026-09-19 §3-2）
  assert.deepEqual(result.slots.map(entry => entry && entry.lot.id), [2, 3, 1, 4]);
  assert.deepEqual(result.dropped.map(entry => entry.lot.id), [5]);
```

テスト名も実態に合わせて `右端予約で欄数が減ってもメイン項目はグリッド順に並ぶ` に変える。

- [ ] **Step 6: テストを流して全部通ることを確かめる**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: `# pass 147` / `# fail 0`

- [ ] **Step 7: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 配置図の下段をメインのロットで先に埋める

盤に描かれるのは基準エリアだけで、どのロットが盤のどこにあるかは
下段の欄から引く引き出し線でしか分からない。基準エリア以外が先に
下段の欄を取ると、メインのロットが紙の上で位置を失っていた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 下段のこぼれのうち基準エリア以外を上段の空き欄へ回す

**Files:**
- Modify: `files/index.html`（`sheetPlacement()` 内、`arrangeBottomSlots()` を呼んだ直後と `return`）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1 の `arrangeBottomSlots()` の `dropped`
- Produces: `sheetPlacement()` の戻り値に `movedBottom`（上段へ回した欄の配列）を追加する。`top` は回送後の配列を返す。Task 3 が `pl.movedBottom` を読む

- [ ] **Step 1: 失敗するテストを3件書く**

`tests/sheet-placement.test.js` の末尾に追加する。

```javascript
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
```

- [ ] **Step 2: テストを流して落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: 3件のうち**2件が FAIL**。
`下段のこぼれのうち基準エリア以外は上段の空き欄へ回る` は `result.top` が `["T1"]` のままで落ちる。
`基準エリアのこぼれは上段へ回さず追記欄へ行く` も `result.top` が `["T1"]` で落ちる。
3件目 `下段があふれた日は上段から下段への救済が起きない` は改修前から **PASS**（排他性を固定する回帰テスト）。

- [ ] **Step 3: 実装する**

`files/index.html` の `sheetPlacement()` の中の次の行を探す。

```javascript
  const arranged=arrangeBottomSlots(bottomAll, lay.bottom, positions);
  const omittedTop=top.slice(lay.top+moved.length);
```

`arranged` の行と `omittedTop` の行のあいだに次を挿入する。

```javascript
  // 下段に入りきらなかった欄のうち、基準エリア以外は上段に空きがあればそこへ回す
  // （設計書 2026-09-19 §3-3）。基準エリアの欄は回さない。上段には引き出し線が引けないので、
  // 回しても盤のどこにあるか分からないまま「軒下」の見出しの下に並ぶことになり、
  // 追記欄に落とすのと情報量が変わらない。
  // 退避は除く。退避はもともと top の末尾に居て、上段に空きがあるなら降りてきていない。
  const baseArea=sheetAreas("bottom")[0]||null;
  const topFree=Math.max(0, lay.top-top.length);
  const backable=arranged.dropped.filter(e=>
    !e.stash && baseArea && !e.areas.includes(baseArea));
  const movedBottom=backable.slice(0, topFree);
  const backSet=new Set(movedBottom);
  // 回した欄は注釈を作り直す（基準エリアを省かない）。元の欄は書き換えず浅く複製する
  const topAll=top.concat(movedBottom.map(e=>({...e, note:slotAreaNote(e.areas)})));
```

続けて、その下の `rest` の行を書き換える。

変更前:

```javascript
  const rest=omittedTop.concat(arranged.dropped);
```

変更後:

```javascript
  const rest=omittedTop.concat(arranged.dropped.filter(e=>!backSet.has(e)));
```

最後に `return` 文を書き換える。

変更前:

```javascript
  return {lay, top, bottom:arranged.slots, bottomAll, droppedBottom:arranged.dropped,
          overflow:overflowed.overflow, unlisted:overflowed.unlisted, moved};
```

変更後:

```javascript
  return {lay, top:topAll, bottom:arranged.slots, bottomAll, droppedBottom:arranged.dropped,
          overflow:overflowed.overflow, unlisted:overflowed.unlisted, moved, movedBottom};
```

`renderSheet()` は `const top=pl.top` で受けるので、回送した欄はそのまま上段に描かれる。
`renderSheet()` 側の変更は要らない。

- [ ] **Step 4: テストを流す**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: `# pass 150` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 下段に入りきらない PC横・EV横 を上段の空き欄へ回す

盤に描かれず引き出し線を持たない置き場は、どちらの段にあっても
紙の情報量が変わらない。メインは回さない。上段には線が引けず、
回しても位置が分からないまま軒下の見出しの下に並ぶため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 下段→上段の回送を画面に知らせる

**Files:**
- Modify: `files/index.html`（`fitSheetText()` 内）
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 2 の `pl.movedBottom`、既存の `lotsIn(slots)`（`files/index.html:4483`。まとめた欄の中のロット数を数える）

- [ ] **Step 1: 失敗するテストを書く**

`tests/sheet-placement.test.js` の末尾に追加する。`#sheetMsg` は印刷CSSで消えるので紙には出ない。

```javascript
test("下段から上段へ回した欄を画面にだけ知らせる", () => {
  const fit = functionSource("fitSheetText");
  assert.match(fit, /pl\.movedBottom\.length/);
  assert.match(fit, /下段に入りきらない \$\{lotsIn\(pl\.movedBottom\)\} 件を/);
  assert.match(fit, /上段の空き欄に回しています。/);
});
```

- [ ] **Step 2: テストを流して落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: FAIL。`The input did not match the regular expression` が出る。

- [ ] **Step 3: 実装する**

`files/index.html` の `fitSheetText()` の中の、上段→下段の救済を知らせる箇所を探す。

```javascript
  if(pl.moved.length){
    html+=`<div class="msg ok">※ 上段に入りきらない ${lotsIn(pl.moved)} 件を`
        + `下段の空き欄に回しています。</div>`;
  }
```

その直後に次を足す。

```javascript
  // 下段から上段へ回した日も同じように知らせる。紙の上では PC横・EV横 が「軒下」の
  // 見出しの下に注釈つきで現れるので、画面で理由を言わないと不具合と疑われる
  if(pl.movedBottom && pl.movedBottom.length){
    html+=`<div class="msg ok">※ 下段に入りきらない ${lotsIn(pl.movedBottom)} 件を`
        + `上段の空き欄に回しています。</div>`;
  }
```

`pl.movedBottom` を `&&` で守るのは、`fitSheetText()` が `applyDisplay()` など
配置を持たない呼び出し元からも呼ばれるため（引数省略時は自分で `sheetPlacement()` を呼ぶが、
古い戻り値を渡されても落ちないようにしておく）。

- [ ] **Step 4: テストを流す**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: `# pass 151` / `# fail 0`

- [ ] **Step 5: コミット**

```bash
git add files/index.html tests/sheet-placement.test.js
git commit -m "$(cat <<'EOF'
feat: 下段から上段へ回した件数を画面に表示する

紙には出さず #sheetMsg にだけ出す。上段への回送は注釈でしか
区別できないので、理由を言わないと現場が不具合と疑う。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: ブラウザで実際の紙を目視する

**Files:**
- 変更なし（確認のみ）

**Interfaces:**
- Consumes: Task 1〜3 の実装

- [ ] **Step 1: ローカルサーバを立てる**

Run: `python3 -m http.server 8770 --directory "$(pwd)/files"`（バックグラウンドで実行）

- [ ] **Step 2: Service Worker とキャッシュを落としてから開く**

ブラウザで `http://localhost:8770/index.html?v=1` を開き、コンソールで実行する。
**開発中の再読込に `CACHE_VERSION` の繰り上げは効かない**ので、この手順を毎回踏む。

```javascript
(async()=>{
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  location.href = 'index.html?v=' + Date.now();
})()
```

- [ ] **Step 3: 検証データを投入する**

設計書 §6-1 の投入コードを使う。`clearLots()` は `confirm()` を出すので差し替えてから呼ぶこと、
伝票を1枚作ってから行を足すこと、消さずに足すとロットが累積することの3点に注意する。
投入後に「▶ 自動配置を作成」を押す。

- [ ] **Step 4: 配置図タブで数える**

**必ず配置図タブを表示してから**測る（非表示タブでは `getBoundingClientRect()` が 0 になる）。
コンソールで実行する。

```javascript
(() => {
  switchTab('sheet');
  const pl = sheetPlacement();
  const f = e => e ? ((e.lot && e.lot.name) || '[まとめ]') + (e.note ? '/' + e.note : '') : '·';
  return { lay: pl.lay, 上段: pl.top.map(f), 下段: pl.bottom.map(f),
           上段へ回送: pl.movedBottom.map(f), 追記欄: pl.overflow.map(f) };
})()
```

Expected: 下段9欄が `品目8/※PC横, 品目12, 品目1, 品目2, 品目3, 品目4, 品目5, 品目13/※PC横, 部品9/※PC横`。
追記欄が `品目9/※PC横, 品目10/※EV横, 品目15/※未定, 品目16/※未定`。
**追記欄に `※メイン` が1件も無いこと**（改修前は 品目4・品目5 の2件が落ちていた）。

- [ ] **Step 5: 紙の見た目を目視する**

引き出し線が下段のメイン欄から7本引かれていること、線が交差して読めなくなっていないこと、
欄の文字があふれて `⚠ 文字が入りきらない欄があります` が出ていないことを確認する。
スクリーンショットを撮って残す。

- [ ] **Step 6: サーバを止める**

立てたバックグラウンドのサーバを終了する。

---

### Task 5: 仕上げ（PWA キャッシュの版と、上書きした設計書への追記）

**Files:**
- Modify: `files/sw.js`
- Modify: `tests/sheet-placement.test.js`
- Modify: `docs/superpowers/specs/2026-09-12-sheet-slot-proximity-design.md`

- [ ] **Step 1: テストの期待値を先に上げる**

`tests/sheet-placement.test.js` の `Service Workerは版付きキャッシュ名を使う`（70 行付近）を書き換える。

変更前:

```javascript
  assert.match(sw, /const CACHE_VERSION = "v53"/);
```

変更後:

```javascript
  assert.match(sw, /const CACHE_VERSION = "v54"/);
```

- [ ] **Step 2: テストを流して落ちることを確かめる**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: FAIL（`Service Workerは版付きキャッシュ名を使う`）。

- [ ] **Step 3: `files/sw.js` の版を上げる**

```javascript
const CACHE_VERSION = "v54";
```

- [ ] **Step 4: テストを流す**

Run: `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: `# pass 151` / `# fail 0`

- [ ] **Step 5: 上書きした設計書に追記する**

`docs/superpowers/specs/2026-09-12-sheet-slot-proximity-design.md` の**本文は書き換えず**、
末尾に日付つきの追記を足す。

```markdown

---

## 追記（2026-09-19）

決定1「PC横・EV横の右詰めを最優先する」は、
`docs/superpowers/specs/2026-09-19-sheet-tier-priority-design.md` で上書きした。

現在は下段の欄を基準エリア（既定＝メイン）が先に取り、残った欄を PC横・EV横 に右詰めで配る。
理由は、盤に描かれるのは基準エリアだけで、どのロットが盤のどこにあるかは下段の欄から引く
引き出し線でしか分からないため。PC横・EV横 は盤に描かれないので、下段の欄を取っても
引き出し線の価値を使わない。

「EV横 が最右」も、PC横 と EV横 の両方が下段に残る日に限る条件付きになった。
右詰めに1欄しか残らない日は、並び順の先頭（既定では PC横）が残る。
```

- [ ] **Step 6: コミット**

```bash
git add files/sw.js tests/sheet-placement.test.js docs/superpowers/specs/2026-09-12-sheet-slot-proximity-design.md
git commit -m "$(cat <<'EOF'
chore: PWA キャッシュの版を上げ、上書きした設計書に追記する

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 完了後

全タスクが終わったら、マージ前にターミナルで次を実行する。

```bash
node --test tests/sheet-placement.test.js tests/stash-overflow.test.js
```

このリポジトリに Playwright などの E2E テストは無い。ブラウザでの確認は Task 4 が代わりを務める。

残っている宿題は設計書 §7 を参照する（実運用データでの再検証、列を増やす案の別設計、上段6欄の注記行の目視）。
