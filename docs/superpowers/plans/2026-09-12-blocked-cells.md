# 配置不可セルと配置編集からの自動配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 時間帯ごとに任意の通常セル・通路セルを配置不可にし、自動配置と手動移動がそのセルを使わないようにする。

**Architecture:** `shift.blocked` にセルキーを保存し、既存の `fills` はそのまま維持する。セルを復元する `cellsOf()` と各容量計算が `blocked` を参照し、列途中の穴を飛ばしてロットを並べる。配置編集には、ロット移動と排他的な配置不可編集モードを追加する。

**Tech Stack:** 単一HTMLアプリ（HTML/CSS/JavaScript）、Web Storage (`localStorage`)、Service Worker、Node.js標準テストランナー。

**Spec:** `docs/superpowers/specs/2026-09-12-blocked-cells-design.md`

## Global Constraints

- `blocked` は現在の `schedule.shifts.am` / `schedule.shifts.pm` にのみ保存し、`result` / `manual` スナップショットには保存しない。日付欄の変更に応じた日別履歴の保存・復元は追加しない。
- 既存の `SCHEDULE_VERSION` は上げない。`blocked` が無い保存済み時間帯は空配列に正規化する。
- 無効なセルキーは起動時および配置マス設定変更時に除去し、有効なキーは保持する。
- 通常セルと通路セルの両方を指定できる。自動配置・混載・手動移動のいずれも指定セルを使わない。
- `index.html` を更新したリリースでは `files/sw.js` の `CACHE_VERSION` を上げる。
- 既存の未コミットファイルをステージング、編集、コミットしない。

---

## File Structure

- `files/index.html`
  - `shift.blocked` の正規化、セルキーと容量の純粋ヘルパー、自動配置・描画・手動移動の連携、配置不可編集UIを持つ。
- `tests/sheet-placement.test.js`
  - HTMLから純粋関数を抽出する既存方式で、保存互換性、セル復元、配置、容量計算の回帰を検証する。
- `files/sw.js`
  - PWA利用者に更新済みの `index.html` を配信するため、キャッシュ版数だけを更新する。

### Task 1: 時間帯ごとの配置不可状態とセルキーを追加する

**Files:**
- Modify: `files/index.html:1018-1164`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Produces: `emptyShift(): { slips, result, manual, resultFingerprint, blocked: string[] }`
- Produces: `normalizeBlocked(raw): string[]`
- Produces: `blockedCellKey(spaceName, colIndex, rowIndex): string`
- Produces: `blockedRowsFor(spaceName, colIndex, blocked): Set<number>`
- Consumes: `activeShift().blocked` from schedule load, timing switch, and edit-mode handlers.

- [ ] **Step 1: 時間帯状態の互換性テストを追加する**

  `tests/sheet-placement.test.js` に、HTMLから `emptyShift`、`normalizeShift`、`normalizeBlocked`、`blockedCellKey` を抽出するテストを追加する。次を明示的に検証する。

  ```js
  test("旧形式の時間帯データは配置不可セルなしとして読み込む", () => {
    const shift = normalizeShift({ slips: [], result: null, manual: null });
    assert.deepEqual(shift.blocked, []);
  });

  test("配置不可セルは重複を除き正規化する", () => {
    assert.deepEqual(
      normalizeBlocked(["メイン|1|2", "メイン|1|2", "PC横|0|0"]),
      ["メイン|1|2", "PC横|0|0"]
    );
  });
  ```

- [ ] **Step 2: 追加テストが失敗することを確認する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: FAIL。`normalizeBlocked` または `blocked` プロパティが未定義である。

- [ ] **Step 3: 最小の時間帯状態・正規化ヘルパーを実装する**

  `emptyShift()` に `blocked: []` を追加する。`normalizeShift()` は `blocked: normalizeBlocked(src.blocked)` を返す。

  `blockedCellKey()` は区切り文字として既存の `cellKey()` と同じ `|` を使い、`"${spaceName}|${colIndex}|${rowIndex}"` を返す。`normalizeBlocked()` は文字列だけを受け入れ、`Set` で重複を除去する。配置マスに照らした有効性判定は、`SPACES` 初期化後にも使える別ヘルパー `pruneBlockedForSpaces(blocked, spaces)` に分け、存在しないエリア・列・行を削除する。

- [ ] **Step 4: 正規化テストを成功させる**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。既存テストを含め全件成功する。

- [ ] **Step 5: 配置マス変更時の無効キー除去を実装してテストする**

  `initSchedule()` で `schedule` を代入した直後、および `applyConfig()` で、各 `schedule.shifts[key].blocked` に `pruneBlockedForSpaces(..., SPACES)` を適用してから `saveSchedule()` する。`initSpaces()` は `schedule` の復元より先に走るため、ここで時間帯データを参照してはならない。削除があった場合は、設定タブの既存通知経路で「存在しない配置不可セルを解除しました」と通知する。

  次のテストを追加して実行する。

  ```js
  test("存在しない列または行の配置不可指定を除去する", () => {
    const spaces = [{ name: "メイン", cols: [{ h: 2 }] }];
    assert.deepEqual(
      pruneBlockedForSpaces(["メイン|0|1", "メイン|0|2", "不存在|0|0"], spaces),
      ["メイン|0|1"]
    );
  });
  ```

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。

- [ ] **Step 6: コミットする**

  ```bash
  git add files/index.html tests/sheet-placement.test.js
  git commit -m "feat: store blocked cells per shift"
  ```

### Task 2: セル途中の配置不可を自動配置・描画・手動移動へ反映する

**Files:**
- Modify: `files/index.html:1940-2084,2238-2290,2440-2515`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: `blockedRowsFor(spaceName, colIndex, activeShift().blocked)`.
- Produces: `usableCount(col, blockedRows): number`.
- Produces: `cellsOf(col, blockedRows): Array<{ id: number|null, seg: boolean, row: number, blocked: boolean }>`.
- Produces: `columnFreeCount(col, blockedRows): number`.
- Produces: `hydrateBlockedRows(sp, blocked): void`.
- Changes: `buildWork(blocked)`, `restoreActiveShift`, `findRun`, `placeLot`, `fillMix`, `validateMove` to use usable capacity.

- [ ] **Step 1: 配置エンジンの失敗テストを追加する**

  `new Function()` で `usableCount`、`cellsOf`、`findRun`、`placeLot`、`fillMix` を抽出し、次をテストする。

  ```js
  test("列途中の配置不可セルを飛ばしてロットを描画する", () => {
    const cells = cellsOf({ h: 4, fills: [{ id: 7, count: 3 }] }, new Set([1]));
    assert.deepEqual(cells.map(cell => [cell.row, cell.id, cell.blocked]), [
      [0, 7, false], [1, null, true], [2, 7, false], [3, 7, false],
    ]);
  });

  test("配置不可セルは連続配置の容量に数えない", () => {
    const cols = [{ h: 3, fills: [], blockedRows: new Set([1]) }];
    assert.equal(findRun(cols, 3, false), null);
  });
  ```

- [ ] **Step 2: 追加テストが失敗することを確認する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: FAIL。`cellsOf` が `blockedRows` を受け取らず、途中セルにロットを置く。

- [ ] **Step 3: セル復元と配置可能容量を実装する**

  `buildWork(blocked)` が各列へ `blockedRows` を付与するようにする。`hydrateBlockedRows(sp, blocked)` は保存済みの `result` / `manual` を復元した直後に各列へ同じ情報を付与する。`cellsOf()` は `blockedRows` の行を `{ id:null, blocked:true }` として確保し、`fills` は blocked でない行にだけ順番に割り当てる。`used(col)` は既存のロット個数を数え続け、空き判定は必ず `columnFreeCount = usableCount - used` を用いる。

  `findRun()` は列全体を空き・非空きの二値で判定せず、配置可能セルの残容量を累積する。`placeLot()` と `fillMix()` は `Math.min(rem, columnFreeCount(...))` だけを追加し、blocked 行を占有しない。

- [ ] **Step 4: 手動移動の容量判定を更新する**

  `validateMove()` の `used(dc)+n > dc.h` を `n > columnFreeCount(dc, dc.blockedRows)` に置き換える。`moveCells()` が `fills` の個数を変更した後も、`cellsOf()` の規則でblocked行を飛ばして描画されることをテストする。

  ```js
  test("手動移動先の配置不可セルを空き容量に含めない", () => {
    const col = { h: 4, fills: [{ id: 1, count: 1 }], blockedRows: new Set([2, 3]) };
    assert.equal(columnFreeCount(col, col.blockedRows), 1);
  });
  ```

- [ ] **Step 5: 自動配置・描画・手動移動のテストを成功させる**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。通常セル、通路セル、列途中セル、混載、手動移動の既存・追加テストが成功する。

- [ ] **Step 6: コミットする**

  ```bash
  git add files/index.html tests/sheet-placement.test.js
  git commit -m "feat: skip blocked cells in placement"
  ```

### Task 3: 配置不可編集モードと再配置操作を実装する

**Files:**
- Modify: `files/index.html:140-170,596-681,2246-2315,2550-2910`
- Test: `tests/sheet-placement.test.js`

**Interfaces:**
- Produces: `let blockedEditMode = false`.
- Produces: `setBlockedEditMode(enabled: boolean): void`.
- Produces: `toggleBlockedCell(cellEl): void`.
- Produces: `runFromBlockedEdit(): void`.
- Consumes: `activeShift().blocked`, `blockedCellKey`, `runFromButton`, `clearSel`, and `saveSchedule`.

- [ ] **Step 1: UI契約の失敗テストを追加する**

  `tests/sheet-placement.test.js` に、配置編集タブに次の要素と関数呼び出しが存在することを検証するテストを追加する。

  ```js
  test("配置編集には配置不可編集と再配置の操作がある", () => {
    assert.match(source, /id="blockedEditBtn"/);
    assert.match(source, /onclick="setBlockedEditMode\(true\)"/);
    assert.match(source, /id="blockedRunBtn"/);
    assert.match(source, /onclick="runFromBlockedEdit\(\)"/);
  });
  ```

- [ ] **Step 2: 追加テストが失敗することを確認する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: FAIL。配置不可編集用の要素・関数がまだ無い。

- [ ] **Step 3: 編集モードのUIとスタイルを実装する**

  配置編集タブの `#editCtl` に「配置不可エリアを編集」ボタンを追加し、編集モードの操作帯に「自動配置を実行」「編集を終了」を表示する。`.cell.blocked` は斜線付きグレー、`.cell.blocked.has-lot` はロット番号を残して再配置待ちであることを表すスタイルにする。`aria-pressed` と操作説明を更新し、色だけに依存しない状態表示にする。

- [ ] **Step 4: イベント競合を止め、セル指定を保存する**

  既存の click、pointerdown、pointermove、drag開始処理の先頭で `blockedEditMode` を確認し、編集モード中はロット選択・なぞり選択・ドラッグ移動を開始しない。

  編集モード中の click と pointermove は `toggleBlockedCell()` を呼び、`activeShift().blocked` へセルキーを追加・削除して `saveSchedule()` を呼ぶ。`drawZone()` は各セルに `blocked` と、blockedかつロットありの場合に `has-lot` クラスを付ける。ロットの有無にかかわらず通常・通路セルを切り替え可能にする。

- [ ] **Step 5: 再配置入口を既存の検証と統合する**

  `runFromBlockedEdit()` は `runFromButton()` と同一の入力検証、未登録品目の確認、手動調整破棄確認を通す。重複した入口を作らず、`runFromButton({ goMap:true, source:"blocked-edit" })` のように既存入口を引数化するか、共通関数へ抽出する。`run()` には `activeShift().blocked` を渡す。成功後は編集モードを維持し、配置不可セルにロットが残らない状態を即時描画する。容量不足は既存警告を使う。

- [ ] **Step 6: UI契約と全テストを成功させる**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。既存テストと配置不可編集UIの存在テストが成功する。

- [ ] **Step 7: コミットする**

  ```bash
  git add files/index.html tests/sheet-placement.test.js
  git commit -m "feat: edit blocked placement cells"
  ```

### Task 4: PWA更新・回帰確認・手動E2Eを完了する

**Files:**
- Modify: `files/sw.js:1-7`
- Verify: `files/index.html`
- Verify: `tests/sheet-placement.test.js`

**Interfaces:**
- Consumes: Task 1-3 の永続化・配置・UI機能。
- Produces: `CACHE_VERSION` を一つ増やした更新可能なPWA。

- [ ] **Step 1: Service Workerのキャッシュ版数テストを追加する**

  `tests/sheet-placement.test.js` で `files/sw.js` を読み込み、`CACHE_VERSION` が文字列の `vNN` 形式であることと、`CACHE_NAME` がそれを参照することを検証する。

  ```js
  test("Service Workerは版付きキャッシュ名を使う", () => {
    const sw = fs.readFileSync("files/sw.js", "utf8");
    assert.match(sw, /const CACHE_VERSION = "v\d+"/);
    assert.match(sw, /const CACHE_NAME = "pallet-layout-" \+ CACHE_VERSION/);
  });
  ```

- [ ] **Step 2: 版数を上げてテストを成功させる**

  `files/sw.js` の `CACHE_VERSION` を現行値より1増やす。テストを実行する。

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。

- [ ] **Step 3: ローカルプレビューで手動E2Eを実施する**

  1つ目のターミナルで次を実行する。

  ```bash
  python3 -m http.server 8765 --directory files
  ```

  ブラウザで `http://localhost:8765` を開き、次を確認する。

  1. 午前にロットを自動配置し、通常セルと通路セルをそれぞれ1つ配置不可にする。
  2. 「自動配置を実行」後、指定セルにロットがなく、ロットが他の有効セルへ移ることを確認する。
  3. 午後へ切り替えて配置不可設定が空であること、午前へ戻って設定が残ることを確認する。
  4. ロット入力を変更して再配置しても、午前の配置不可設定が残ることを確認する。
  5. 配置不可セルを含む列へのロットドラッグが容量不足なら拒否されることを確認する。
  6. ブラウザを再読み込みして設定が復元されることを確認する。
  7. DevToolsでService Workerを登録解除またはキャッシュを消去して再読み込みし、新UIが表示されることを確認する。次に、更新前キャッシュを持つ通常状態でも「更新する」経由で新UIへ切り替わることを確認する。

- [ ] **Step 4: 最終回帰を実行する**

  Run: `node --test tests/sheet-placement.test.js`

  Expected: PASS。失敗・スキップなし。

- [ ] **Step 5: コミットする**

  ```bash
  git add files/index.html files/sw.js tests/sheet-placement.test.js
  git commit -m "chore: refresh blocked cells app cache"
  ```
