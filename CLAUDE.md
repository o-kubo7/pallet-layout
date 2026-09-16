# プロジェクト設定（Claude Code）

共通のプロジェクト設定は `AGENTS.md` を参照する。ここには Claude Code 固有の指示だけを書く。

## コード検索: semble を使わない

このリポジトリでは semble MCP（`mcp__semble__search` / `mcp__semble__find_related`）を使用しない。
代わりに `grep` / `Glob` / serena のシンボル検索を使う。

### 理由（2026-09-16 実測）

1. 本体コードが検索できない
   - アプリ本体は `files/index.html` に埋め込まれた `<script>`（約4,200行）。
   - semble は HTML を `content=code` の対象に含めない。`content=all` を指定しても
     埋め込み JS 全体が `index.html:832-5070` という単一チャンクになり、
     関数単位に分割されない。1チャンクで約46,000〜64,000トークン。

2. 実在する識別子を拾えない
   - `showCapacity`（`files/index.html:3953`）、`blockedCellKey`（同 1137）、
     `normalizeBlocked`（同 1151）で検索したが、いずれも `index.html` は0件。
   - 類似度スコアは最大0.035、多くは0.005〜0.015でノイズと区別できない。

3. 日本語が膨張する
   - MCP の応答は JSON の `\uXXXX` エスケープ形式。日本語は文字数が約6.1倍になる。
   - `docs/` 配下は日本語主体のため、検索結果自体がトークンを消費し、
     削減どころか逆効果になる。

### 代わりにこうする

```bash
grep -nE 'function (showCapacity|blockedCellKey|normalizeBlocked)' files/index.html
```

上記1コマンドで3関数すべての行番号が出る。semble より速く、正確で、トークンも少ない。

### 再評価の条件

`files/index.html` の JavaScript を外部 `.js` ファイルへ切り出した場合は、
上記1が解消されるため再評価してよい。ただし2と3は残る。
なお切り出しは `files/sw.js` の `CACHE_VERSION` を使った PWA キャッシュ戦略に影響するため、
独立した設計判断として扱う。
