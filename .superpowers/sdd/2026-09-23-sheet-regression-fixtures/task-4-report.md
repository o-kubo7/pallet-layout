# Task 4 実施レポート: Consoleコードと手動確認表

## 実施内容

- 作業開始時点で `scripts/generate-sheet-console-cases.mjs`、12本のConsoleコード、手動確認表がすでに未追跡ファイルとして存在し、`tests/sheet-scenarios.test.js` にも同期テストと構造テストの差分がありました。既存ファイルを確認して要件との整合性をレビューし、生成を再実行して同期を確認しました。
- シナリオJSONから `renderConsoleCase(scenario)`、`renderManualGuide(scenarios)`、`writeOutputs({check})` で生成します。通常実行は不足・差分を更新し、`--check` は不足・差分・余分な `.console.js` を列挙して失敗し、余分なファイルは削除しません。
- ガイドは verified 5件・pending 7件に分け、ID、状態、合計P、Consoleファイル、確認項目、結果記入欄を載せます。

## RED / GREEN

- RED: 作業ツリーの既存生成物を変更しないよう、必要なテスト・fixture・`files/index.html` を一時ディレクトリへ複製し、生成スクリプトと生成物のない状態で `node --test tests/sheet-scenarios.test.js` を実行しました。同期サブテストがスクリプト不在で失敗し、残る22件はPASSしました。
- GREEN: 作業ツリーで通常生成を実行し、`12 console cases and manual guide are up to date` を確認しました。続けて `--check` も同じメッセージで終了コード0でした。
- テスト: `node --test tests/sheet-scenarios.test.js` は23件PASS、失敗0件でした。

## 安全性・構造確認

- 各Consoleコードは `switchTab("input")` の後に `clearLots()` を使い、現在の時間帯の入力だけを置き換えます。製品コードの `clearLots()` は `schedule.shifts[activeTiming]` のみを空にし、反対側の時間帯と品目マスタには触れません。
- `window.confirm` の一時差し替えは `try/finally` で復元します。入力値は `input` / `change` DOMイベントで設定し、関数名やDOM構造のテストで `switchTab`、`clearLots`、`addSlip`、`addItemRow`、伝票・追加ボタン・行入力欄を検査します。
- 生成コードには自動配置、印刷関数、`window.print()` の呼び出しがありません。入力後に画面の「自動配置を作成」ボタンを利用者が押すよう案内します。
- 生成されたConsoleファイルは12本で、scenario JSONのverified 5件・pending 7件と一致しました。

## 製品差分・コミット・懸念

- `git diff -- files/` と `git diff 26672b8..HEAD -- files/` はどちらも出力なしでした。製品ファイルは変更していません。
- Task 4 の指定対象16ファイルを `976b6bf test: generate manual sheet console cases` としてコミットしました。この記述の更新はレポート追記コミットに含めます。
- 懸念: 実装と生成物、テスト差分が作業開始時点ですでに存在していたため、このレポートは既存実装のレビューと検証を記録しています。既存の別ドラフト・計画・`outputs/` には触れていません。
