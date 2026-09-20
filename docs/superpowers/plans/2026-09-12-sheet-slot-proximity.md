# 配置表・下段項目欄の近接配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メインエリアのロット欄を対応するグリッド位置へ近づけつつ、PC横・EV横の欄を常に下段右端に連続配置する。

**Architecture:** `sheetPlacement()` の前に、メイングリッドと下段欄の横方向を同じ離散座標系で表す。`arrangeBottomSlots()` はPC横・EV横の右端領域を最初に確保し、残るメイン用領域で、グリッドの左から右の順に並べたメインロットと欄順を保つ組合せのうち、矢印の合計長が最短となるものを選ぶ。これにより引き出し線の交差を防ぐ。グリッド座標を得られない設定では、既存の左から順の割当に戻す。

**Tech Stack:** 単一HTMLのJavaScript/CSS、Node.js標準テストランナー、Service Worker

**Spec:** `docs/superpowers/specs/2026-09-12-sheet-slot-proximity-design.md`

## Global Constraints

- PC横・EV横だけの項目は、メイン項目の間に配置せず下段右端へ連続配置する。
- 同じ距離の候補では左側の欄を選び、出力を決定的にする。
- メイン項目はグリッドの左から右の順に割り当て、同じ横位置だけ既存の配置順を維持する。引き出し線を交差させない。
- 上段から救済された項目はメイン用欄に置き、引き出し線を追加しない。
- 保存データ形式、入力・配置編集・自動配置、上段欄、印刷の列数・欄数、あふれ処理を変更しない。
- PWAの更新で `files/sw.js` の `CACHE_VERSION` を1増やす。

---

## File Structure

- `files/index.html`: 下段欄の近接配置用座標を求め、既存の下段欄割当を更新する。描画済みSVGの実測処理は変更しない。
- `tests/sheet-placement.test.js`: 下段欄の近接配置、右端連続配置、グリッドなし時のフォールバックをNode.js標準テストで検証する。
- `files/sw.js`: 更新済みアプリをPWA利用者へ配布するキャッシュ版を更新する。

### Task 1: 下段欄の近接割当をテスト駆動で実装する

**Files:**
- Modify: `tests/sheet-placement.test.js:267-289`
- Modify: `files/index.html:4096-4140`
- Modify: `files/index.html:4296-4300`
- Modify: `files/sw.js:6`

**Interfaces:**
- Consumes: `sheetSlots(tier)`, `sheetLayout(topSlots, bottomSlots)`, `sheetAreas(tier)`, およびグリッドのロット別横位置。
- Produces: `arrangeBottomSlots(entries, count, positions)`。戻り値は既存どおり `{slots, dropped}` とし、`slots` は `count` 件のエントリまたは `null` を返す。
- Produces: `sheetPlacement()` がグリッド座標を渡せない場合にも動作する既存互換の下段欄配列。

- [ ] **Step 1: 近接配置と右端連続配置の失敗テストを書く**

  `tests/sheet-placement.test.js` の既存「PC横・EV横ではEV横を右端に配置する」テストの直後に、次のケースを追加する。テスト用に `arrangeBottomSlots()` を直接評価し、メインロットの位置は `{ [lotId]: gridColumn }` として渡す。

  ```js
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
      [1, null, null, 2, null, 3, 4]);
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
  ```

- [ ] **Step 2: テストが失敗することを確認する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: 新しい近接配置テストが失敗する。現行の `arrangeBottomSlots()` は位置引数を参照せず、メインロットを左から連続配置するためである。

- [ ] **Step 3: メインのグリッド座標と下段欄座標を定義する**

  `files/index.html` に、`SHEET_GRID_ORDER` を使ってロットごとのアンカー列を計算する純粋関数を追加する。`gridRows()` 内の `anchorOf()` と同じ「最初の連続ブロックの中央列」の規則を共有し、DOMの実測座標は使わない。下段欄は各欄の中心を、`lay.cols` と `lay.bottom` から同じ離散座標系で計算する。

  `sheetPlacement()` でグリッド情報が利用できる時だけ `{ [lotId]: gridColumn }` を `arrangeBottomSlots()` の第3引数へ渡す。グリッドが描画できない設定では `null` を渡す。

- [ ] **Step 4: 最小の近接割当を実装する**

  `arrangeBottomSlots(entries, count, positions)` を次の規則へ更新する。

  ```js
  const mainEntries = entries.filter(entry =>
    !entry.fromTop && baseArea && entry.areas.includes(baseArea)
  );
  const rescuedEntries = entries.filter(entry => entry.fromTop);
  const rightEntries = entries.filter(entry =>
    !entry.fromTop && (!baseArea || !entry.areas.includes(baseArea))
  );
  ```

  - `rightEntries` は欄数まで右端へ確保し、入力順を保つためPC横の後にEV横を置く。
  - `mainEntries` は、全ロットの位置が `positions` にある場合だけ横位置の昇順（同位置は元の配列順）に並べる。右端を除いた候補欄の昇順部分列を総当たりし、各組合せの横距離合計を比較する。最小の組合せを採用し、同じ合計なら辞書順で左側の欄番号が小さい組合せを採用する。候補は最大8欄なので、組合せ数は最大256通りに収まり、動的計画法を導入しない。位置が1件でもないときは、メイン項目全体を左から最初の空き欄へ従来順で置く。
  - `rescuedEntries` は残るメイン用欄を左から使う。
  - 入らないメイン・救済・右端項目を、従来と同じ順で `dropped` に連結する。

- [ ] **Step 5: フォールバックと既存挙動のテストを追加する**

  グリッド座標が `null` の場合にメイン項目が左から順に配置されるテストを追加する。既存のEV横最右端、あふれ2件、未記載警告のテストが引き続き成功することも確認する。

  ```js
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
  ```

- [ ] **Step 6: テストを実行して合格を確認する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: すべてのテストがPASSする。

- [ ] **Step 7: Service Workerのキャッシュ版を更新する**

  `files/sw.js` の `CACHE_VERSION` を現行の `v44` から `v45` に更新する。テストの期待値も `v45` に更新する。

- [ ] **Step 8: 最終確認を実行する**

  Run: `node --test tests/sheet-placement.test.js && git diff --check`

  Expected: すべてのテストがPASSし、空白エラーがない。

- [ ] **Step 9: タスクの変更だけをコミットする**

  ```bash
  git add files/index.html files/sw.js tests/sheet-placement.test.js
  git commit -m "feat: 配置表の下段欄を近接配置"
  ```

  既存の未コミット変更（`docs/superpowers/` 配下の別仕様・別計画・調査資料）はステージングしない。
