# 操作マニュアルの制作

本文の原本は `pages/pNN.html`。画像・PDF はコマンドで作り直す。

## 準備（初回のみ）

```bash
npm --prefix manual install
```

Google Chrome（`/Applications/Google Chrome.app`）を使う。ブラウザ本体はダウンロードしない。

## 作り直す

```bash
npm --prefix manual run all
```

個別に実行する場合:

- `npm --prefix manual run states`: `state/source-export.json` から `s1-planned.json`（101P・仮伝票あり）と `s2-final.json`（100P・手動配置）を作る
- `npm --prefix manual run capture`: 撮影。`node manual/capture.cjs input` のように場面（states / input / edit / sheet）を指定できる
- `npm --prefix manual run build`: `dist/操作マニュアル.html` を作る
- `npm --prefix manual run render`: `dist/操作マニュアル.pdf`、`dist/layout-check.json`、`dist/preview/pNN.png` を作る。はみ出しがあると失敗する
- `npm --prefix manual test`: 単体テスト

## デモデータを差し替えるとき

アプリで手動配置を整えたブラウザの DevTools コンソールで `palletApp.*` を書き出し、`state/source-export.json` を置き換える。品目は10件・この並び（製品1, 製品2, 仕掛品1×3, 仕掛品2×2, 仕掛品3×2, 仕掛品4）である必要がある。並びが変わると手動配置が復元されない（設計書 4-4）。

## 注意

- 確認ダイアログ（未登録品目、ロット分割）は画像に写らないので、撮影時に記録した文言から「画面例」を組む。`pages/` に文言を書き写さない。
- 本文の文字は縮めない。はみ出したら画像の `h40`〜`h115` クラスで高さを調整する。
- 設計書: `docs/superpowers/specs/2026-09-24-manual-11pages-design.md`
