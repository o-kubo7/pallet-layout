# 操作マニュアル レビュー反映（2026-10-02）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 2026-10-02 のユーザーレビューを反映する。
1. P1 のタブの図（`tabs.png` と赤枠）を消す。
2. P2 の 2.1 毎日の手順を、横並びの流れ図（戻り矢印つき）にする。
3. 付録の配置図に1ページ足し、v78 で増えた「書き足しの太字」の説明（画面例つき）を入れる。

**前提:** `docs/superpowers/specs/2026-10-01-manual-restructure-design.md`、`docs/superpowers/plans/2026-10-01-manual-restructure.md`（実施済み。HEAD 6fabfa7）。
今の並び: p01〜p06 本編、p07〜p17 付録（5. 入力 p07〜09、6. 配置編集 p10〜13、7. 配置図 p14〜15、8. 保存と設定 p16、9. 毎日の作業チェック p17）。

**決定事項（ユーザー承認済み）:**
- 2.1 は横並び＋戻り矢印。HTML と CSS だけで作る。
- 太字は配置図に1ページ足す。p14 は 7.1 だけにし、新しい p15 に 7.2 テキスト編集と 7.3 太字を置く。全18ページ。
- 太字の画面例は、仕掛品1 のロット `111-1112` の末尾1文字「2」を太字にしたもの。

## Global Constraints

- 前回計画の Global Constraints をすべて引き継ぐ（`files/` を変えない、本文の文字を縮めない、1文ごとに `<br>`、「戻す」「進む」、確認ダイアログの文言・札の座標を手で書かない、コミット末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`、`.claude/launch.json` と 2026-09-23 付けの未追跡ファイルはコミットしない）。
- `manual/dist/` は Task 2 の最後にだけコミットする。
- 撮影の検証で止まったら、撮影コードを推測で直さず、止めて報告する。

## 技術制約

- アプリの太字（`files/index.html`）: PC（601px 以上）の編集欄は `div.cell-editor[contenteditable=plaintext-only]`（6341〜）。編集中は欄の右上に `#sheetBoldBtn`（文字「B」、6307〜 `placeSheetBoldBtn`）が出る。`applySheetBold()`（6293）が選んだ範囲の太字を切り替える（全部太字なら外す）。Ctrl+B でも同じ（6373〜）。確定後の欄では太字の区間が `<b>` で描かれる（`.sheet .fit b`、644）。表示設定で欄全体を太字にしている欄では見た目が変わらない（643 のコメント）。
- 撮影は既存の Playwright＋Google Chrome。新しいブラウザ API は使わない。contenteditable の範囲選択は `page.evaluate` で `Selection`/`Range` を作る（Chrome で動作）。
- ディスクの空きを撮影前に確かめる（1GB 以上）。

---

### Task 1: 太字の画面例を撮る

**Files:**
- Modify: `manual/capture/sheet.cjs`
- 生成: `manual/assets/bold-editing.png`、`manual/assets/bold-after.png`（コミットは Task 2）

**手順:**
1. `sheet.cjs` のテキスト編集の撮影（`text-edit-after` を撮ったあと、`scEd.context.close()` の前）に、次を足す。
   - 配置図の欄のうち、`data-ek` が `|lot` で終わり、文字が `111-1112` を含む `td` を探す（無ければ `expect` で止める: `仕掛品1 の 111-1112 の欄が見つからない（BLOCKED）`）。
   - `#sheetEditBtn` を押して編集モードにし、その欄をクリックする。`.cell-editor` が出るのを待つ。
   - `page.evaluate` で、`.cell-editor` の文字の末尾1文字（「2」）を選ぶ（テキストノードの最後の1文字に Range を張る）。
   - `#sheetBoldBtn` を押す。
   - 欄と `#sheetBoldBtn` を含む範囲を `clipShot` で `bold-editing` として撮る（`unionRect` に欄の selector と `#sheetBoldBtn` を渡す。余白 4）。
   - `Tab` で確定し、`#sheetEditBtn` を押して編集モードを終える。
   - 欄の `innerHTML` に `<b>2</b>` が含まれることを `expect` で確かめる（`太字が付いていない`）。
   - 欄を `clipShot` で `bold-after` として撮る（同じ欄の selector、余白 4）。
   - `out.bold={key:<data-ek>,lot:'111-1112',boldChar:'2'}` を記録する。
2. 先頭のコメント（撮影するページ）を `P14〜P17` に直す。
3. ディスクの空きを確かめてから `node manual/capture.cjs sheet` を実行する（timeout 600000）。続けて `npm --prefix manual test`。
4. Read で `bold-editing.png` と `bold-after.png` を開き、「2」だけが太字で、B ボタンが写っていることを確かめる。
5. Commit: `git add manual/capture/sheet.cjs`、メッセージ `feat: 配置図の書き足しの太字の画面例を撮る`（末尾に Co-Authored-By）。画像と dist はステージしない。

---

### Task 2: ページを直し、通しで組版する

**Files:**
- Modify: `manual/pages/p01.html`、`p02.html`、`p05.html`、`p10.html`、`p14.html`、`manual/style.css`
- Move: `p15.html`→`p16.html`、`p16.html`→`p17.html`、`p17.html`→`p18.html`（後ろから `git mv`）
- Create: `manual/pages/p15.html`
- Modify: `manual/README.md`（ページ構成の行を18ページに）
- Commit: `manual/assets`（Task 1 の画像）、`manual/dist`

**手順:**

1. **P1:** `p01.html` の `<figure><div class="hl-wrap"><img class="shot" src="assets/tabs.png" …></figure>` の行を消す。ほかは変えない。

2. **P2 の 2.1:** `<div class="steps">…</div>` を、次の流れ図に置き換える（文言はこのまま使う）。
   ```html
   <div class="dayflow">
   <div class="df-row">
   <div class="df-box"><span class="df-tab">入力</span><b>① 伝票を入力</b><span>FAX 1枚につき1伝票。<br>届いていない分は仮伝票。</span></div><i>→</i>
   <div class="df-box"><span class="df-tab">入力</span><b>② 自動配置を作成</b><span>「▶ 自動配置を作成」を押す。</span></div><i>→</i>
   <div class="df-box"><span class="df-tab">配置編集</span><b>③ 配置を整える</b><span>品目のまとまりや<br>置き場を整える。</span></div><i>→</i>
   <div class="df-box"><span class="df-tab">配置図</span><b>④ 確かめて印刷</b><span>表記を確かめ、<br>印刷して配る。</span></div>
   </div>
   <div class="df-back"><b>⑤ FAXが届いたら</b> 仮伝票を直して受領済みにし、②の自動配置を作り直します。<br><small>作り直すと、手で整えた配置は消えます。</small></div>
   </div>
   ```
   `manual/style.css` の末尾に、流れ図の見た目を足す（既存のルールは変えない）。要件: 4つの箱は横に等幅で並び、`.flow` と同じ配色（枠 #a7c2c3、上の太線 #548b8e、背景 #f8fbfb）。`.df-tab` はタブ名の小さな札（背景 #155c63、白文字、9pt）。箱の間の `→` は `.flow i` と同じ色。`.df-back` は箱の列の下に置き、左端（①の下）から右端（④の下）までの U 字の戻り線（下と左右の枠線、#548b8e、破線でよい）と、左端の上向きの矢じりで「④から①②へ戻る」ことを示す。文字は本文と同じ大きさ（縮めない）。

3. **付録の配置図を2ページから3ページにする:**
   - 後ろから `git mv p17.html p18.html`、`p16.html p17.html`、`p15.html p16.html`。
   - `p14.html` から `<h2>7.2 必要なら表記を整える</h2>` 以降（7.2 の本文・編集前後の図・`aside.warn`）を切り取り、新しい `p15.html` に移す。p14 には 7.1 だけを残す。p14 のタイトルは `7. 配置図 <small>（1）読む</small>` にする。
   - 新しい `p15.html`:
     ```html
     <!--page {"title":"7. 配置図 <small>（2）表記を整える</small>","lead":"必要なときだけ、欄の文字を書き足し・書き換えます。","tab":"配置図"} -->
     （ここに p14 から移した 7.2 をそのまま置く）
     <h2>7.3 文字を太字にする</h2>
     <p>書き足しの一部を太字にして、目立たせられます。<br>「✏ テキスト編集」で欄を開き、太字にしたい文字を選びます。<br>欄の右上に出る「B」を押すと、選んだ文字が太字になります（Ctrl+B でも同じです）。<br>太字の文字を選んでもう一度押すと、太字が外れます。</p>
     <p>下の例では、仕掛品1 のロット「111-1112」の末尾の「2」を太字にしています。</p>
     <div class="cols">
     <figure class="cap-center"><img class="shot fit h30" src="assets/bold-editing.png" alt="太字にするところ"><figcaption>「2」を選んで「B」を押す</figcaption></figure>
     <figure class="cap-center"><img class="shot fit h30" src="assets/bold-after.png" alt="太字にした後"><figcaption>確定した後</figcaption></figure>
     </div>
     <aside>設定で「ロットを太字」などをオンにしている欄は、もともと太字なので見た目が変わりません。</aside>
     ```
   - `p16.html`（旧 p15）: タイトルを `7. 配置図 <small>（3）印刷と配布</small>`、節番号 `7.3`→`7.4`、`7.4`→`7.5`。
   - `p17.html`（旧 p16）・`p18.html`（旧 p17）: 中身はそのまま（ページ参照だけ下で直す）。

4. **ページ参照の付け替え**（P の後ろに数字が続く参照だけ。「100P」などは変えない）:
   - `p05.html` の表「詳しくは」: C（✏ テキスト編集）`P14`→`P15`。A・D・N（あさ／ひる・印刷・灰色のマス）`P15`→`P16`。そのほかの `P14` は 7.1 の内容なので変えない。
   - `p10.html` の `（P16）` 2か所 → `（P17）`（保存と設定）。
   - `p18.html`（旧 p17）: `配置図 P14〜15` → `配置図 P14〜16`、`保存と設定は P16 へ` → `保存と設定は P17 へ`。
   - そのほか、全ページを `grep -nE '(^|[^A-Za-z0-9])P1[4-8]' manual/pages/*.html` で洗い、P15→P16、P16→P17、P17→P18 の対応で判断して直す（7.2 テキスト編集を指すものは P15）。

5. **README:** `manual/README.md` のページ構成の記述を、18ページ（本編 p01〜p06、付録 p07〜p18）に直す。

6. **組版と確認:**
   - `npm --prefix manual test`（23件 PASS）
   - `npm --prefix manual run build && npm --prefix manual run render`（`build: 18 pages`、全ページ `spaceToFooter` 0以上、`images:true`、`tagsOut:[]`）
   - Read で `manual/dist/preview/p01.png`、`p02.png`、`p05.png`、`p14.png`〜`p18.png` を開いて確かめる。P2 の流れ図が横に4つ並び、戻り線が読めること。P15 の太字の例で「2」だけが太字なこと。
   - はみ出したときは、画像の h クラスで調整する。それでも無理なら止めて報告する。
   - `grep -nE '元に戻す|元に戻り|やり直す|●|AAA|※未定' manual/pages/*.html` が何も出さない。

7. **Commit:**
   ```bash
   git add manual/pages manual/style.css manual/README.md manual/assets manual/dist
   git commit -m "docs: レビューを反映し、手順の流れ図と配置図の太字の説明を足す

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
   ```
