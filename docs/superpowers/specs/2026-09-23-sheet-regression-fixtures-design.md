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

### 1. 共通シナリオ

`tests/fixtures/sheet-scenarios.json` を唯一の手書きデータ源にする。各シナリオは次を持つ。

```json
{
  "id": "demo-100p",
  "title": "100Pデモ",
  "input": [
    {"type":"製品","name":"製品1","lot":"111","snp":500,"qty":4000}
  ],
  "slots": {
    "top": [{"id":"製品1/111","areas":["軒下①"]}],
    "bottom": [{"id":"仕掛品1/111-1111","areas":["メイン"]}],
    "stash": []
  },
  "expected": {
    "totalPallets": 100,
    "layout": "normal",
    "top": [],
    "bottom": [],
    "movedBottom": [],
    "overflow": []
  }
}
```

`input` はConsole投入と合計P数の検証に使う。`slots` は物理配置後に `sheetSlots()` / `stashSlots()` が返す欄を正規化したスナップショットで、配置図割当テストに使う。`expected` は様式名と欄IDの順序を保持する。

入力データから物理配置結果を再計算するために製品コードを変更したり、大きなDOM環境をテスト内に再実装したりしない。物理配置と配置図割当の境界を `slots` として明示し、既存の純粋関数抽出テストへ渡す。

### 2. シナリオ検証テスト

`tests/sheet-scenarios.test.js` を追加する。

全シナリオ共通で次を検査する。

- IDが一意である。
- 品目の種別、品名、ロット、SNP、個数が有効である。
- `Math.ceil(qty / snp)` の合計が `expected.totalPallets` と一致する。
- `slots` 内の欄IDが重複しない。
- 期待値に書かれた欄IDが入力または明示したまとめ欄に対応する。
- 実際の `SHEET_LAYOUTS`、`sheetLayout()`、`sheetPlacement()` を抽出して実行し、様式、上段、下段、回送、追記欄の順序が `expected` と一致する。
- `middle` のケースでは追記欄が空である。
- メインエリアを含む欄が `movedBottom` に入らない。
- 入力・上段・下段・追記欄の集合に意図しない欠落や重複がない。

配置図割当の入力に必要な `sheetAreas("bottom")` はシナリオの `baseArea` から返す。既存の `arrangeBottomSlots()` と `arrangeOverflowSlots()` は実装本体から抽出する。

### 3. Consoleコード生成

`scripts/generate-sheet-console-cases.mjs` を追加する。共通シナリオを読み、`tests/console-cases/<id>.console.js` を生成する。

生成コードは次の動作だけを行う。

1. 入力タブへ移動する。
2. 現在の時間帯の入力をクリアする。
3. FAX伝票1枚を追加する。
4. 必要な品目行を増やす。
5. `input` の種別・品名・ロット・SNP・個数をDOMイベント経由で入力する。
6. 件数と合計P数をConsoleへ表示する。
7. 自動配置は実行せず、「▶ 自動配置を作成」を押すよう案内する。

生成物には「現在の時間帯の入力を置き換える」旨を先頭コメントに書く。生成スクリプトは `--check` を受け取り、生成済みコードが共通シナリオと一致しなければ失敗する。通常のテストから `--check` を呼び、手書きコピーのずれを検出する。

### 4. 初期シナリオ

最初に次を登録する。

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

`demo-100p` の入力値は `/Users/kenichihanada/Downloads/デモデータ_100P.xlsx` の `シート2!A2:F11` を転記する。リポジトリのテストは外部のDownloadsファイルへ依存せず、転記値と期待値をリポジトリ内で完結させる。

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

- 12シナリオが共通フィクスチャに存在する。
- 全シナリオのデータ整合性と期待する配置図割当が自動テストで合格する。
- 全シナリオのConsoleコードが生成され、`--check` が差分なしで合格する。
- 既存テストを含む全件が合格する。
- この作業の開始点 `26672b8` から `git diff 26672b8..HEAD -- files/` に差分がなく、テスト基盤作業がアプリ本体を変更していない。
- テストが製品不具合を検出した場合は、製品コードを変更せず、失敗するシナリオと実測をユーザーへ報告する。
