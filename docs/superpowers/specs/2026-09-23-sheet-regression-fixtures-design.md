# 配置図の実データ回帰テスト基盤 設計

## 目的

実データの組み合わせで初めて現れる配置図の不備を、マージ前に再現可能な形で検出する。
今回の100Pデモを最初の回帰ケースとして保存し、境界ケースを同じ形式で追加できるようにする。

## 前提と制約

- アプリ本体の `files/index.html`、`files/sw.js`、その他 `files/` 配下は変更しない。
- 変更対象はテスト、テストデータ、Console用コード、生成スクリプト、文書だけとする。
- テスト追加で現在の製品コードの不具合が判明した場合、製品コードを修正せず停止し、再現条件・期待値・実測値を報告する。
- 新しいnpm依存は追加しない。Node.js組み込みtest runnerと標準ライブラリだけを使う。
- 既存の `functionSource()` と `new Function()` による `files/index.html` の関数抽出方式を維持する。
- ユーザーの未追跡ドラフトと `outputs/` は操作・ステージングしない。

## 対象外

- Playwright等のブラウザE2E基盤の導入。
- スクリーンショット差分やPDF差分の自動判定。
- Excelファイルを実行時に直接読む機能。
- 配置ロジック、画面、保存形式、Service Workerの変更。
- 発見した製品不具合の修正。

## 構成

### 1. 自動割当シナリオ

`tests/fixtures/sheet-allocation-scenarios.json` に、物理配置後の欄を入力とする12件の境界シナリオを保存する。各シナリオは次を持つ。

```json
{
  "id": "demo-100p",
  "title": "100Pデモ",
  "slots": {
    "top": [{"id":"製品1/111","areas":["軒下①"]}],
    "bottom": [{"id":"仕掛品1/111-1111","areas":["メイン"]}],
    "stash": []
  },
  "expected": {
    "layout": "normal",
    "top": [],
    "bottom": [],
    "movedBottom": [],
    "overflow": []
  }
}
```

`slots` は物理配置後に `sheetSlots()` / `stashSlots()` が返す欄を正規化したスナップショットで、配置図割当テストに使う。`expected` は様式名と欄IDの順序を保持する。

入力データから物理配置結果を再計算するために製品コードを変更したり、大きなDOM環境をテスト内に再実装したりしない。物理配置と配置図割当の境界を `slots` として明示し、既存の純粋関数抽出テストへ渡す。

### 2. 実データConsoleシナリオ

`tests/fixtures/sheet-console-scenarios.json` に、実際の入力画面へ投入する12件のデータを保存する。各シナリオは `id`、`title`、`input`、`expectedTotalPallets`、`manualChecks`、`verificationStatus` を持つ。

- `verificationStatus:"verified"` は、入力から実際の配置図まで確認済みのケースだけに付ける。
- `verificationStatus:"pending"` は、ユーザーによる手動確認待ちを表す。自動テストの配置期待値には使わない。
- 初期の確認済みケースは、今回ユーザーが確認した100Pデモと、実装時に独立オリジンで確認済みの基本・中間・拡張・追記欄ありの計5件とする。
- 残る7件はConsoleコードと確認項目を生成するが、手動結果を受け取るまで正解として固定しない。
- 手動結果が期待と異なる場合は `verificationStatus` を書き換えず、製品コードにも触れず、入力・期待・実測を報告する。

### 3. シナリオ検証テスト

`tests/sheet-scenarios.test.js` を追加する。

自動割当シナリオ共通で次を検査する。

- IDが一意である。
- `slots` 内の欄IDが重複しない。
- 期待値に書かれた欄IDが `slots` または明示したまとめ欄に対応する。
- 実際の `SHEET_LAYOUTS`、`sheetLayout()`、`sheetPlacement()` を抽出して実行し、様式、上段、下段、回送、追記欄の順序が `expected` と一致する。
- `middle` のケースでは追記欄が空である。
- メインエリアを含む欄が `movedBottom` に入らない。
- 元のslot集合と、上段・下段・追記欄の最終表示先に意図しない欠落や重複がない。

Consoleシナリオは別のデータ検証で、品目の種別、品名、ロット、SNP、個数、行ごとの切り上げ合計、確認状態、手動確認項目を検査する。pendingケースの `manualChecks` は説明文として検査するだけで、製品コードの実測と自動比較しない。

配置図割当の入力に必要な `sheetAreas("bottom")` はシナリオの `baseArea` から返す。既存の `arrangeBottomSlots()` と `arrangeOverflowSlots()` は実装本体から抽出する。

### 4. Consoleコード生成

`scripts/generate-sheet-console-cases.mjs` を追加する。実データConsoleシナリオを読み、`tests/console-cases/<id>.console.js` を生成する。

生成コードは次の動作だけを行う。

1. 入力タブへ移動する。
2. 現在の時間帯の入力をクリアする。
3. FAX伝票1枚を追加する。
4. 必要な品目行を増やす。
5. `input` の種別・品名・ロット・SNP・個数をDOMイベント経由で入力する。
6. 件数と合計P数をConsoleへ表示する。
7. 自動配置は実行せず、「▶ 自動配置を作成」を押すよう案内する。

生成物には「現在の時間帯の入力を置き換える」旨を先頭コメントに書く。生成スクリプトは `--check` を受け取り、生成済みコードが実データConsoleシナリオと一致しなければ失敗する。通常のテストから `--check` を呼び、手書きコピーのずれを検出する。

### 5. 初期シナリオ

自動割当シナリオとして最初に次を登録する。

| ID | 狙い |
| --- | --- |
| `demo-100p` | 今回確認した10品目・100P。下段7欄を使い切り、仕掛品4をPC横として上段へ回す。 |
| `normal-boundary` | 通常様式の上限。空欄がある間は拡張しない。 |
| `normal-to-middle` | 通常様式の空欄を使い切った次の欄で中間様式へ上げる。 |
| `middle-boundary` | 中間様式の上段5欄・下段8欄に収まり、追記欄が空。 |
| `middle-to-wide` | 中間様式の空欄を使い切った次の欄で拡張様式へ上げる。 |
| `wide-boundary` | 拡張様式の上段6欄・下段9欄に収まる。 |
| `wide-overflow` | 拡張様式を超えた欄が既存順序で追記欄へ入る。 |
| `split-delivery` | 同一品名・同一ロットの分納で行ごとに切り上げた合計P数を保持する。 |
| `same-name-different-lot` | 同一品名でも別ロットを別欄として扱う。 |
| `half-pallet` | 端数パレットを含む入力の合計P数と欄を保持する。 |
| `top-rescue` | 上段固有欄の超過を下段の空欄へ救済する。 |
| `stash-overflow` | 退避と欄数超過の追記順・注釈を保持する。 |

実データConsoleシナリオの `demo-100p` は `/Users/kenichihanada/Downloads/デモデータ_100P.xlsx` の `シート2!A2:F11` を転記する。リポジトリのテストは外部のDownloadsファイルへ依存せず、転記値と期待値をリポジトリ内で完結させる。

実データConsoleシナリオは同じ12個のIDを使わなくてもよい。確認済み5件は `demo-100p`、`basic-normal`、`basic-middle`、`basic-wide`、`basic-wide-overflow` とする。残る7件は `split-delivery`、`same-name-different-lot`、`half-pallet`、`normal-to-middle`、`middle-to-wide`、`top-rescue`、`stash-overflow` とする。全12件を `docs/testing/sheet-manual-cases.md` の確認表に並べ、ユーザーは各コードを実行して、合計P数、案内文、様式、上段、下段、追記欄を報告する。

## 技術制約

- Consoleコードはアプリが公開している既存のグローバル関数（`switchTab`、`clearLots`、`addSlip`、`addItemRow`）と現在のDOM構造に依存する。関数名や入力欄のplaceholderが変わった場合は生成コードのテストを更新する。
- Consoleコードは現在の時間帯の入力を置き換える。生成コード自体は実行前コメントと実行後ログで明示し、自動配置や印刷は自動実行しない。
- Consoleコードはブラウザの保存済みデータに影響するため、手動検証は専用オリジンまたは不要データの時間帯で行う。
- 過去の教訓に従い、手動検証はクリーン状態を暗黙の前提にしない。各コードが対象時間帯をクリアしてから投入し、反対側の時間帯と配置不可設定には触れない。
- 今回は `files/` を変更しないためService Workerの版上げは不要。将来、テストで見つかった不具合を別作業で修正する場合は、HTML変更とキャッシュ版の更新を同じ計画に含める。
- Excelの数式結果はテスト実行時に再計算しない。パレット数は入力のSNP・個数からJavaScriptで切り上げ計算し、期待合計と照合する。

## 検証手順

```bash
node scripts/generate-sheet-console-cases.mjs
node scripts/generate-sheet-console-cases.mjs --check
node --test tests/sheet-scenarios.test.js
node --test tests/*.test.js
git diff --check
git status --short
```

生成後、`demo-100p.console.js` をブラウザConsoleへ貼り、入力10件・合計100Pを確認する。自動配置後は、下段7欄、上段へ回した仕掛品4、回送案内1件を目視確認する。

## 完了条件

- 自動割当と実データConsoleの各フィクスチャに12シナリオが存在する。
- 12件の自動割当シナリオの整合性と期待する配置図割当が自動テストで合格する。
- 12件の実データConsoleシナリオについて入力整合性、合計P数、生成コードが自動テストで合格する。
- 確認済み5件と手動確認待ち7件が明示され、pendingの結果を自動テストの正解として扱わない。
- 全シナリオのConsoleコードが生成され、`--check` が差分なしで合格する。
- 既存テストを含む全件が合格する。
- この作業の開始点 `26672b8` から `git diff 26672b8..HEAD -- files/` に差分がなく、テスト基盤作業がアプリ本体を変更していない。
- テストが製品不具合を検出した場合は、製品コードを変更せず、失敗するシナリオと実測をユーザーへ報告する。
