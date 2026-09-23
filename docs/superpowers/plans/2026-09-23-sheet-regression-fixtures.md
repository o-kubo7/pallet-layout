# 配置図の実データ回帰テスト基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の境界条件を自動検証し、実データ12件をブラウザConsoleへ投入してユーザーが手動確認できる再現可能なテスト基盤を作る。

**Architecture:** 自動テスト用の欄スナップショットと、手動確認用の実入力を別のJSONへ保存する。自動テストは `files/index.html` から既存関数を抽出して12境界ケースを検査し、生成スクリプトは実入力JSONから12本のConsoleコードと確認表を作る。確認済み5件だけを既知の実画面結果として扱い、残る7件はユーザー確認待ちとして明示する。

**Tech Stack:** JSON、CommonJS、ECMAScript modules、Node.js組み込みtest runner、Node.js標準ライブラリ、ブラウザConsole用JavaScript。

**Spec:** `docs/superpowers/specs/2026-09-23-sheet-regression-fixtures-design.md`

## Global Constraints

- アプリ本体の `files/index.html`、`files/sw.js`、その他 `files/` 配下は変更しない。
- テストが製品コードの不具合を検出した場合、製品コードを修正せず、再現条件・期待値・実測値を報告して停止する。
- 新しいnpm依存は追加せず、Node.js組み込みtest runnerと標準ライブラリだけを使う。
- 既存の `functionSource()` / `new Function()` による関数抽出方式を維持する。
- Consoleコードは現在の時間帯だけをクリアし、反対側、配置不可設定、品目マスタを変更しない。
- Consoleコードは自動配置や印刷を自動実行せず、入力完了後に利用者へ実行ボタンを押すよう案内する。
- `verificationStatus:"pending"` の手動期待値を製品コードの正解として自動判定しない。
- 製品コード基準点は `26672b893a6a6eecbf701b700e4f77dbcf256ab8` とし、完了時に `git diff 26672b8..HEAD -- files/` が空であることを確認する。
- ユーザーの未追跡ドラフト、既存の未追跡計画・仕様、`outputs/` は操作・ステージングしない。

## Review Focus

- SNPまたは個数が0、負数、小数、文字列なら、誤った合計を作らずConsoleフィクスチャ検証で拒否する。
- 同一品名・同一ロットの分納は行ごとに切り上げてから合計し、先に数量を合算しない。
- 追記欄の4枠目が `{group:[...]}` の場合も、欄IDの欠落・重複検査をグループ内部まで行う。
- Console生成物のDOMセレクタやグローバル関数名が変わった場合、構造検査が失敗する。
- pendingケースの説明と実測が違っても、期待値の追認や製品コード修正をせず、手動結果として報告する。

---

### Task 1: 自動割当シナリオのデータと検証

**Files:**
- Create: `tests/fixtures/sheet-allocation-scenarios.json`
- Create: `tests/sheet-scenarios.test.js`

**Interfaces:**
- Produces: `{id,title,baseArea,slots,expected}[]`。
- `slots`: `{top:Slot[],bottom:Slot[],stash:Slot[]}`。
- `Slot`: `{id:string,areas:string[],stash?:boolean,note?:string}`。
- `expected`: `{layout:"normal"|"middle"|"wide",top:(string|null)[],bottom:(string|null)[],moved:string[],movedBottom:string[],overflow:(string|{group:string[]})[]}`。

- [ ] **Step 1: フィクスチャ不在で失敗する検証テストを書く**

`tests/sheet-scenarios.test.js` を次の形で開始する。

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const allocationPath = "tests/fixtures/sheet-allocation-scenarios.json";
const allocationScenarios = JSON.parse(fs.readFileSync(allocationPath, "utf8"));

function flattenIds(values) {
  return values.flatMap(value => {
    if (value == null) return [];
    return typeof value === "string" ? [value] : value.group;
  });
}

test("自動割当シナリオは12件でIDが一意", () => {
  assert.equal(allocationScenarios.length, 12);
  assert.equal(new Set(allocationScenarios.map(s => s.id)).size, 12);
  allocationScenarios.forEach(s => assert.match(s.id, /^[a-z0-9-]+$/));
});
```

各SlotのID・areas、expectedのlayoutと配列型を検査し、`slots.top/bottom/stash` のID重複、expectedにしか存在しないID、group内部の重複を拒否するテストも書く。

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: `ENOENT` でFAIL。

- [ ] **Step 3: 12件の自動割当シナリオを追加する**

欄IDは `T1...`（上段固有）、`M1...`（メイン）、`P1...`（PC横）、`E1...`（EV横）、`S1...`（退避）を使う。100Pだけは確認画像へ対応する品名/ロットをIDにする。

| id | top | bottom | stash | layout | moved | movedBottom | overflow |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `demo-100p` | 製品1/111,製品2/222 | メイン7件＋仕掛品4/444-4444 | なし | normal | なし | 仕掛品4/444-4444 | なし |
| `normal-boundary` | T1..T4 | M1..M7 | なし | normal | なし | なし | なし |
| `normal-to-middle` | T1..T4 | M1..M7＋P1 | なし | middle | なし | なし | なし |
| `middle-boundary` | T1..T5 | M1..M8 | なし | middle | なし | なし | なし |
| `middle-to-wide` | T1..T5 | M1..M8＋P1 | なし | wide | なし | なし | なし |
| `wide-boundary` | T1..T6 | M1..M9 | なし | wide | なし | なし | なし |
| `wide-overflow` | T1..T6 | M1..M9＋P1 | なし | wide | なし | なし | P1 |
| `split-delivery` | なし | M1 | なし | normal | なし | なし | なし |
| `same-name-different-lot` | なし | M1,M2 | なし | normal | なし | なし | なし |
| `half-pallet` | なし | M1 | なし | normal | なし | なし | なし |
| `top-rescue` | T1..T7 | M1..M7 | なし | wide | T7 | なし | なし |
| `stash-overflow` | T1..T6 | M1..M9＋P1 | S1,S2 | wide | なし | なし | P1,S1,S2 |

`areas` はTを `軒下①`、Mを `メイン`、Pを `PC横`、Eを `EV横`、Sを `退避` とし、Sには `stash:true,note:"※未定"` を付ける。

- [ ] **Step 4: スキーマ検証を通す**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: 件数、一意性、型、参照整合性がPASS。

- [ ] **Step 5: 製品コード無変更を確認してコミットする**

Run: `git diff 26672b8..HEAD -- files/`

Expected: 出力なし。

```bash
git add tests/fixtures/sheet-allocation-scenarios.json tests/sheet-scenarios.test.js
git commit -m "test: add sheet allocation scenarios"
```

### Task 2: 実装本体を通す表形式割当テスト

**Files:**
- Modify: `tests/sheet-scenarios.test.js`

**Interfaces:**
- Consumes: Task 1の自動割当シナリオ。
- Produces: `buildSheetPlacementRuntime(scenario)` と12件の実装本体テスト。

- [ ] **Step 1: 実装本体を抽出する失敗テストを書く**

`files/index.html` を読み、既存の括弧深度方式で `functionSource(name)` を実装する。`SHEET_LAYOUTS`、`sheetLayout()`、`arrangeBottomSlots()`、`arrangeOverflowSlots()`、`sheetPlacement()` を抽出する。

```js
const source = fs.readFileSync("files/index.html", "utf8");

function entry(slot) {
  return {
    lot: {id:slot.id,name:slot.id,lot:slot.id},
    areas:slot.areas,
    ...(slot.stash ? {stash:true} : {}),
    ...(slot.note ? {note:slot.note} : {}),
  };
}

function resultIds(values) {
  return values.map(value => {
    if (value == null) return null;
    if (value.group) return {group:value.group.map(item => item.lot.id)};
    return value.lot.id;
  });
}
```

`buildSheetPlacementRuntime()` は次を注入する。

```js
sheetSlots = tier => (tier === "top" ? scenario.slots.top : scenario.slots.bottom).map(entry)
stashSlots = () => scenario.slots.stash.map(entry)
sheetAreas = tier => tier === "bottom" ? [scenario.baseArea,"PC横","EV横"] : ["軒下①","軒下②"]
slotAreaNote = areas => `※${areas.join("・")}`
mergeLots = false
```

最初は `expected` の配列を空にしておき、実測との差で失敗させる。

- [ ] **Step 2: 期待値未整備で失敗を確認する**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: `expected.top` または `expected.bottom` の不一致でFAIL。製品仕様自体との矛盾が見つかった場合はアプリ本体を変更せず停止する。

- [ ] **Step 3: 期待配列を仕様順で完成させる**

位置情報を注入しないため、メインは左詰め、PC横・EV横は右詰め、空欄は `null` とする。100Pは次を固定する。

```json
{
  "layout":"normal",
  "top":["製品1/111","製品2/222","仕掛品4/444-4444"],
  "bottom":[
    "仕掛品1/111-1111","仕掛品1/111-1112","仕掛品1/111-1113",
    "仕掛品2/222-2222","仕掛品2/222-2223",
    "仕掛品3/333-3334","仕掛品3/333-3333"
  ],
  "moved":[],
  "movedBottom":["仕掛品4/444-4444"],
  "overflow":[]
}
```

`top-rescue` は `moved:["T7"]`、下段 `[M1..M7,T7,null]`。`stash-overflow` はtopにT1..T6,S1,S2、bottomにM1..M9、overflowにP1,S1,S2を期待する。

- [ ] **Step 4: 不変条件を追加する**

`middle` のoverflowが空、movedBottomがbaseAreaを含まないことを検査する。top超過や回送を二重計上しないよう、最終表示先を正規化して元slot集合と比較し、欠落・重複を検出する。groupは `flattenIds()` で展開する。

- [ ] **Step 5: 関連テストを実行する**

Run: `node --test tests/sheet-scenarios.test.js tests/sheet-placement.test.js tests/stash-overflow.test.js`

Expected: 全件PASS。

- [ ] **Step 6: 製品コード無変更を確認してコミットする**

Run: `git diff 26672b8..HEAD -- files/`

Expected: 出力なし。

```bash
git add tests/fixtures/sheet-allocation-scenarios.json tests/sheet-scenarios.test.js
git commit -m "test: verify sheet allocation scenarios"
```

### Task 3: 実データConsoleシナリオと入力検証

**Files:**
- Create: `tests/fixtures/sheet-console-scenarios.json`
- Modify: `tests/sheet-scenarios.test.js`

**Interfaces:**
- Produces: `{id,title,input,expectedTotalPallets,manualChecks,verificationStatus}[]`。
- `verificationStatus`: `"verified"|"pending"`。

- [ ] **Step 1: Consoleシナリオ不在で失敗するテストを書く**

入力検証を `validateConsoleScenario(scenario)` として切り出し、次を検査する。

```js
assert.ok(["verified","pending"].includes(scenario.verificationStatus));
assert.ok(Array.isArray(scenario.manualChecks) && scenario.manualChecks.length > 0);
for (const row of scenario.input) {
  assert.ok(["製品","充填品"].includes(row.type));
  assert.ok(row.name.length > 0);
  assert.equal(typeof row.lot, "string");
  assert.ok(Number.isSafeInteger(row.snp) && row.snp > 0);
  assert.ok(Number.isSafeInteger(row.qty) && row.qty > 0);
}
const total = scenario.input.reduce((sum,row) => sum + Math.ceil(row.qty / row.snp), 0);
assert.equal(total, scenario.expectedTotalPallets);
```

`snp:0`、`qty:-1`、`qty:1.5`、`snp:"10"` を例外にするテスト、分納がSNP10・個数1と11で2Pになるテストも書く。

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: `sheet-console-scenarios.json` 不在でFAIL。

- [ ] **Step 3: 12件の実入力を追加する**

確認済み5件:

- `demo-100p`: Excelの10行、100P。手動確認は下段7欄、上段に製品1/製品2/仕掛品4、回送1件、追記なし。
- `basic-normal`: `SAMPLES.basic` と同じ9行。通常14列、追記なし。
- `basic-middle`: basicに部品1〜3（各SNP10・個数10）を追加。中間16列、追記なし。
- `basic-wide`: basicに部品1〜5を追加。拡張18列、追記なし。
- `basic-wide-overflow`: basicに部品1〜7を追加。拡張18列、追記欄に製品W/製品Zと注釈。

手動確認待ち7件:

- `split-delivery`: 同じ品名/ロット、SNP10、個数1と11。
- `same-name-different-lot`: 同じ品名、別ロット、各1P。
- `half-pallet`: SNP10、個数11。
- `normal-to-middle`: basicを基に通常から中間へ変わる境界候補。
- `middle-to-wide`: basicを基に中間から拡張へ変わる境界候補。
- `top-rescue`: 上段欄超過と下段空欄救済を作る候補。
- `stash-overflow`: 拡張様式、退避、追記欄を併用する候補。

pendingの `manualChecks` は断定ではなく「確認する項目」として書き、期待と異なっても自動テストを失敗させない。

- [ ] **Step 4: 入力検証を実行する**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: 12件、verified 5件、pending 7件、数値境界、合計P数がPASS。

- [ ] **Step 5: 製品コード無変更を確認してコミットする**

Run: `git diff 26672b8..HEAD -- files/`

Expected: 出力なし。

```bash
git add tests/fixtures/sheet-console-scenarios.json tests/sheet-scenarios.test.js
git commit -m "test: add manual sheet input scenarios"
```

### Task 4: Consoleコードと手動確認表の生成

**Files:**
- Create: `scripts/generate-sheet-console-cases.mjs`
- Create: `tests/console-cases/*.console.js`
- Create: `docs/testing/sheet-manual-cases.md`
- Modify: `tests/sheet-scenarios.test.js`

**Interfaces:**
- Consumes: Task 3のConsoleシナリオ。
- Produces: `renderConsoleCase(scenario):string`、`renderManualGuide(scenarios):string`、`writeOutputs({check:boolean})`。

- [ ] **Step 1: 生成物不足で失敗する同期テストを書く**

`spawnSync(process.execPath,["scripts/generate-sheet-console-cases.mjs","--check"])` の終了コード0を要求する。各生成コードで次を検査する。

```js
assert.match(code, /現在の時間帯の入力を置き換えます/);
assert.match(code, /switchTab\("input"\)/);
assert.match(code, /clearLots\(\)/);
assert.match(code, /addSlip\("fax"\)/);
assert.match(code, /addItemRow\(addButton\)/);
assert.match(code, /dispatchEvent\(new Event\(type, \{ bubbles: true \}\)\)/);
assert.doesNotMatch(code, /runFromButton|\brun\(|printSheet|window\.print/);
```

- [ ] **Step 2: 失敗を確認する**

Run: `node --test tests/sheet-scenarios.test.js`

Expected: 生成スクリプトまたは生成物不在でFAIL。

- [ ] **Step 3: Consoleテンプレートを実装する**

生成コードは、ユーザー確認済みの100Pコードと同じDOMイベント方式を使う。先頭コメントにタイトル、verified/pending、現在時間帯を置換することを書く。行データは `JSON.stringify(scenario.input)` で埋め込み、入力後は件数・合計P数と `manualChecks` をConsoleへ表示する。`clearLots()` の確認差し替えは `try/finally` で必ず戻す。

- [ ] **Step 4: 確認表と`--check`を実装する**

`docs/testing/sheet-manual-cases.md` に12件を表で出し、ID、状態、合計P数、Consoleファイル、確認項目、結果記入欄を載せる。verified 5件とpending 7件を別見出しにする。

通常実行は不足する出力を生成・更新する。`--check` は不足、内容差分、余分な `.console.js` を列挙して終了コード1にする。余分なファイルは自動削除しない。

- [ ] **Step 5: 生成と検証を実行する**

Run: `node scripts/generate-sheet-console-cases.mjs`

Expected: 12本のConsoleコードと確認表を生成。

Run: `node scripts/generate-sheet-console-cases.mjs --check`

Expected: `12 console cases and manual guide are up to date`、終了コード0。

Run: `node --test tests/sheet-scenarios.test.js`

Expected: 同期、構造、データ検証がPASS。

- [ ] **Step 6: 製品コード無変更を確認してコミットする**

Run: `git diff 26672b8..HEAD -- files/`

Expected: 出力なし。

```bash
git add scripts/generate-sheet-console-cases.mjs tests/console-cases docs/testing/sheet-manual-cases.md tests/sheet-scenarios.test.js
git commit -m "test: generate manual sheet console cases"
```

### Task 5: 全体検証とユーザーへの手動確認引渡し

**Files:**
- Modify: テスト基盤内の同一仕様の誤りがあった場合のみ。`files/` は変更しない。

**Interfaces:**
- Consumes: 自動割当12件、Console入力12件、生成物、確認表。
- Produces: 自動検証結果と、ユーザーが実行できる手動確認手順。

- [ ] **Step 1: 生成物同期を確認する**

Run: `node scripts/generate-sheet-console-cases.mjs --check`

Expected: `12 console cases and manual guide are up to date`。

- [ ] **Step 2: 全テストを実行する**

Run: `node --test tests/*.test.js`

Expected: 既存349件と新規テストがすべてPASS。

- [ ] **Step 3: 変更範囲を確認する**

Run: `git diff 26672b8..HEAD -- files/`

Expected: 出力なし。

Run: `git diff --check`

Expected: 指摘なし。

Run: `git status --short`

Expected: 計画対象に未コミット差分なし。ユーザーの既存未追跡ドラフト、既存計画・仕様、`outputs/` だけが残る。

- [ ] **Step 4: 代表Consoleコードを静的確認する**

`node --check tests/console-cases/demo-100p.console.js` とpendingの代表 `node --check tests/console-cases/top-rescue.console.js` を実行する。

Expected: 両方とも構文エラーなし。

- [ ] **Step 5: 手動確認を引き渡す**

ユーザーへ `docs/testing/sheet-manual-cases.md` と `tests/console-cases/` を提示する。実行順はverified 5件で手順を確認してからpending 7件とする。各ケースで合計P数、案内文、様式、上段、下段、追記欄を記録し、スクリーンショットまたは記録表を返してもらう。

pendingの結果を受け取るまで、この作業は「自動基盤完成・手動確認待ち」と報告する。期待と実測が違う場合は、その時点でアプリ本体を変更せず停止する。

- [ ] **Step 6: 最終レビューへ渡す**

最終レビューは、自動割当と実入力を混同していないこと、pendingを正解扱いしていないこと、Consoleコードが現在時間帯以外を変更しないこと、生成物同期、`files/` 無変更を重点確認する。Critical/Importantはテスト基盤内だけで1回修正・再レビューする。製品コード変更が必要なら停止する。

## 実行時の停止条件

- 自動割当期待値と現行製品コードが食い違い、既存仕様から期待値の誤りか製品不具合か判別できない。
- Consoleコードが現在時間帯以外、配置不可設定、品目マスタを変更する。
- テスト成立に `files/` の変更、新規依存、HTML内JavaScriptの外部化が必要になる。
- 既存テストが失敗し、テスト基盤内の修正だけでは解消できない。
- pendingの手動結果が説明と違う。この場合は結果を記録してユーザーへ報告し、製品コードを変更しない。

## $digレビュー反映

- **入力と欄スナップショットを分離:** Console入力から物理配置後の欄を自動再現できるという前提を撤回した。自動割当JSONと実入力JSONを分け、両者を同一ケースの正解として扱わない。
- **確認状態を明示:** 実画面確認済み5件だけをverifiedとし、残る7件はpendingにする。pendingの説明は手動確認項目であり、自動期待値ではない。
- **手動作業の担当:** 自動テスト、データ検証、Console生成、確認表生成は実装側が行う。ブラウザでの12件の操作と結果確認はユーザーが行う。
- **結果差異の扱い:** 手動結果が想定と違う場合、期待値へ合わせる変更や製品修正を行わず、入力・説明・実測を報告して停止する。
