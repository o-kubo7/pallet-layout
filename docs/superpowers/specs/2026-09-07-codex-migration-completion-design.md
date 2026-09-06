# Codex 移行設定補完 設計書

作成日: 2026-09-07

## 目的

Claude Code から Codex への自動インポート後に残った設定差分を補完する。
対象はグローバルの教訓ファイル参照、dig ワークフロー、`pallet-layout`、`novel` の4領域に限定する。

## 現状

- Claude からの自動同期はユーザー操作により無効化済み。
- `~/.codex/AGENTS.md` は元の `~/.claude/CLAUDE.md` とほぼ同じだが、存在しない `~/Codex-lessons/lessons.md` を参照している。
- 実在する教訓ファイルは `~/claude-lessons/lessons.md`。
- dig 3.0.1 はプラグイン設定上有効だが、Codex が利用可能なスキルとして公開されていない。
- `pallet-layout` には `CLAUDE.md` がなく、移行対象は `.claude/launch.json` とClaude固有の権限設定だけ。
- `novel` は `AGENTS.md`、5つのカスタムエージェント、2つのHooksが移行済み。Git管理は行わない。

## 採用方針

Codexの現行ネイティブ形式へ変換する。

- dig は非推奨のカスタムプロンプトではなく、ユーザー共通スキルとして作る。
- インポート済みプラグインのキャッシュは更新で置き換わり得るため編集しない。
- Claude固有の権限allowlistは1対1変換せず、Codexのサンドボックスと承認機構へ委ねる。
- 既に正しく移行されたファイルは再生成せず、必要な差分だけを加える。

## 変更対象

### 1. グローバル指示

`~/.codex/AGENTS.md` を次のように修正する。

- `~/Codex-lessons/lessons.md` の2箇所を `~/claude-lessons/lessons.md` に戻す。
- 計画レビューで使う `/dig` 表記をCodexスキルの `$dig` 表記へ変更する。
- その他の運用規則は変更しない。

### 2. dig スキル

`~/.agents/skills/dig/` にユーザー共通スキルを作成する。

- 必須の `SKILL.md` を置く。
- Claude固有の `allowed-tools`、`context`、`agent` などのfrontmatterは移植しない。
- 計画、設計書、関連規約、直近の会話を読んでから質問する。
- 暗黙の前提をリスク順に並べ、1ラウンド2〜3問で深掘りする。
- Plan Modeで利用できる場合は構造化されたユーザー入力を使い、利用できない場合は一度に1つの質問をする。
- 発見事項と決定事項を計画へ反映し、高リスクの未決定事項がなくなるまで完了扱いにしない。
- `$dig` で明示的に呼び出せ、AGENTS.mdの規則からも選択できる説明文にする。
- UIメタデータは最小限とし、実行スクリプトや追加アセットは作らない。

旧 `dig@kuu-marketplace` のキャッシュと設定は削除しない。新しいユーザースキルが利用可能であることを確認した後も、破壊的な整理は別作業とする。

### 3. pallet-layout

リポジトリ直下に `AGENTS.md` を作成する。

- プレビューコマンドとして `python3 -m http.server 8765 --directory files` を記載する。
- 起動後の確認先を `http://localhost:8765` とする。
- `.claude/settings.local.json` のGitコマンドallowlistは移植しない。
- Service Worker、印刷、非表示タブなどの教訓は重複記載せず、グローバル指示に従って `lessons.md` を参照する。

アプリ本体、Service Worker、キャッシュバージョン、配布物には変更を加えない。

### 4. novel

既存の移行結果を維持し、不足しているモデル対応だけを補う。

- `AGENTS.md` は `CLAUDE.md` と一致しているため変更しない。
- `.codex/hooks.json` と2つのシェルスクリプトは移行済みのため変更しない。
- `.codex/agents/` の5ファイルへ、Claudeの `model: sonnet` に対応するCodexの中位モデルとして以下を追加する。
  - `model = "gpt-5.6-terra"`
  - `model_reasoning_effort = "medium"`
- エージェント本文と説明は変更しない。

Claudeの `tools: Read, Grep, Glob, Write` と同じ細粒度のツールallowlistは、Codexカスタムエージェントの現行スキーマでは直接表現しない。エージェントは呼び出し元の権限モードを継承し、既存の「レビューファイルの新規作成のみ」という指示で操作範囲を制限する。

`novel` はユーザー指定によりバージョン管理なしで変更する。対象ファイルを限定し、変更前後の差分を表示して検証する。

## 技術制約

- Codexの現行仕様では、ユーザー共通スキルは `~/.agents/skills` から読み込まれる。
- Codex CLI・IDEではスキルを `$dig` または `/skills` から明示的に選択する。スキルの説明に一致すれば暗黙的な選択も可能。
- スキル変更は通常自動検出されるが、表示されない場合はCodexの再起動が必要。
- カスタムプロンプト方式は非推奨であり、今回の永続的なワークフローには使わない。
- Codexカスタムエージェントは `model`、`model_reasoning_effort`、`sandbox_mode` などを指定できるが、Claudeのツール名allowlistをそのまま移すものではない。
- カスタムエージェントは呼び出し元のサンドボックスと承認設定を継承する。
- 今回はブラウザ、OS、デバイスAPIを使う機能変更ではないため、ブラウザ対応表・権限・PWAストレージ調査は対象外。
- 過去の教訓から、`pallet-layout` のブラウザ検証にはService Workerキャッシュ等の注意が必要。ただし今回はアプリコードを変更せず、起動指示の確認だけを行う。

## エラー処理と安全性

- 既存ファイルを削除しない。
- シークレットや認証情報を読み書きしない。
- 想定外の既存変更、構文不正、Codexの未対応形式が見つかった場合は、その後の変更を止めてユーザーへ相談する。
- `novel` はGitで復元できないため、対象外の内容を変更しない。適用後に各ファイルの差分相当を確認する。

## 検証

### グローバル設定

- `~/.codex/AGENTS.md` に誤った `Codex-lessons` 表記が残っていない。
- `~/claude-lessons/lessons.md` が存在し、参照可能。
- 計画レビュー規則が `$dig` を参照している。

### dig

- Skill Creator付属の `quick_validate.py` でスキル構造を検証する。
- `SKILL.md` に未完了のプレースホルダーやClaude固有frontmatterが残っていない。
- Codexがスキルを検出する。反映されない場合は再起動後に再確認する。

### pallet-layout

- `AGENTS.md` のコマンドと `.claude/launch.json` の実行内容が一致する。
- `git diff --check` が成功する。
- アプリコードと配布物に差分がない。

### novel

- 5つのTOMLに同じモデル名とreasoning effortが入っている。
- 既存の `name`、`description`、`developer_instructions` が保持されている。
- Hooksのファイル内容と実行権限が変更されていない。
- Gitを初期化していない。

## 対象外

- GitHub、Brave Search、filesystem MCPの追加
- Claudeの会話履歴や他プロジェクトの追加移行
- 旧digプラグインの削除・無効化
- `pallet-layout` のアプリ機能変更やPWAキャッシュ更新
- `novel` の本文、canon、執筆フローの変更
