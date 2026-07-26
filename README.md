# pallet-layout
パレットのレイアウト作成用webアプリ

# パレット配置図 自動作成

翌日搬入するパレットの仮置き配置図を自動作成するWebアプリ（PWA）。
サーバー・データベース不要。すべてブラウザ内で動作します。

## ファイル構成

```
index.html          アプリ本体（これ1つで動きます）
manifest.json       ホーム画面追加用の設定
sw.js               オフライン対応（Service Worker）
icons/icon-192.png  アイコン
icons/icon-512.png  アイコン
```

## GitHub Pages で公開する手順

1. GitHubで新しいリポジトリを作る（例: `pallet-layout`）
2. このフォルダの中身をすべてリポジトリの**直下**にアップロード
   （`index.html` がトップに来るようにする。フォルダごと入れると動きません）
3. リポジトリの **Settings** → 左メニューの **Pages** を開く
4. **Source** で `Deploy from a branch` を選ぶ
5. **Branch** を `main`、フォルダを `/ (root)` にして **Save**
6. 1〜2分待つと、Pagesの画面にURLが表示される
   → `https://<ユーザー名>.github.io/pallet-layout/`

## スマホのホーム画面に追加する

- **Android (Chrome)**: 上記URLを開く → メニュー → 「アプリをインストール」
- **iPhone (Safari)**: 上記URLを開く → 共有ボタン → 「ホーム画面に追加」

追加後はオフラインでも起動できます。

## アプリを更新するときの手順（重要）

キャッシュが残って古い版が表示されるのを防ぐため、**必ず2つセットで**行います。

1. `index.html` を修正する
2. `sw.js` の1行目付近にある `CACHE_VERSION` の数字を上げる
   ```js
   const CACHE_VERSION = "v1";   // → "v2" に変更
   ```
3. 両方をコミット・プッシュ

次にアプリを開くと画面下部に「新しいバージョンがあります」と表示され、
「更新する」を押すと最新版に切り替わります。

## データの保存について

- **品目マスタ / 荷物の入力** … ブラウザのlocalStorageに自動保存（端末ごと）
- **スペース設定** … `index.html` 内の `DEFAULT_SPACES` に記述（画面での変更は一時的）

保存データはブラウザのキャッシュ削除で消えます。またPCとスマホでは別々に保存されます。

## 倉庫レイアウトを恒久的に変更する場合

`index.html` 内の `DEFAULT_SPACES` を編集します。

```js
{name:"④", zone:"near", orient:"v", block:3, align:"top", cols:[...]}
```

| 項目 | 意味 |
|---|---|
| `zone` | `near`=倉庫内 / `far`=倉庫外 |
| `orient` | `v`=縦列 / `h`=横行 |
| `block` | 1品目が使える最大列数（④は3列で1ブロック） |
| `align` | `top`=上詰め |
| `cols` | 各列の高さ。`aisle:true` は通路 |
