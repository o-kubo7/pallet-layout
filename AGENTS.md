# プロジェクト設定

## ローカルプレビュー

リポジトリルートから以下を実行する。

```bash
python3 -m http.server 8765 --directory files
```

ブラウザで `http://localhost:8765` を開く。

## コード検索: semble を使わない

このリポジトリでは semble MCP（`search` / `find_related`）を使用しない。
代わりに `grep` / ファイル検索 / serena のシンボル検索を使う。

理由（2026-09-16 実測）:

1. アプリ本体は `files/index.html` に埋め込まれた `<script>`（約4,200行）だが、
   semble は HTML を `content=code` の対象に含めない。`content=all` でも
   埋め込み JS 全体が `index.html:832-5070` の単一チャンク（約46,000〜64,000トークン）になる。
2. `showCapacity`（`files/index.html:3953`）など実在する識別子で検索しても
   `index.html` は0件。類似度スコアも0.005〜0.035でノイズと区別できない。
3. 応答が JSON の `\uXXXX` エスケープ形式のため、日本語は約6.1倍に膨張する。
   `docs/` 配下は日本語主体で、検索結果自体がトークンを消費する。

代わりに次のようにする。

```bash
grep -nE 'function (showCapacity|blockedCellKey|normalizeBlocked)' files/index.html
```

`files/index.html` の JavaScript を外部 `.js` へ切り出した場合は理由1が解消されるため
再評価してよい。ただし理由2と3は残る。
