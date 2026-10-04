# 操作マニュアル エリア名の変更と「変更分だけ配置し直す」の反映 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** `main` で入った2つのアプリ変更に、マニュアルを合わせる。
1. エリア名の変更（コミット `9882d14`）: 軒下① → 軒下、軒下② → 軒下奥。
2. 手動調整を残して、伝票の変更分だけ配置し直す（コミット `c0fa889`、設計書 `docs/superpowers/specs/2026-10-03-carry-manual-layout-design.md`）。「作り直すと手動の調整は破棄される」と書いた7か所を直し、3択の確認画面を説明するページを足す。

**前提:** ブランチ `feat/manual-11pages` に `main` を取り込み済み（アプリ v80）。今のマニュアルは18ページ（p01〜p06 本編、p07〜p18 付録）。
直前の計画: `docs/superpowers/plans/2026-10-02-manual-review-fixes.md`。

**決定事項（ユーザー承認済み 2026-10-04）:**
- エリア名は依頼どおり。「軒下①②」は「軒下・軒下奥」。
- 状態ファイルは手で書き換えず、`make-states.cjs` の流れで旧名を新名に置き換えて作り直す。撮影前に手動配置が復元されることを確かめる。
- 付録の P9 の後ろに新しいページ「5. 入力（4）伝票を直したとき」を足す（全19ページ）。3択の確認画面を撮って載せる。
- `outputs/manual-20260922/` と `docs/manual-*.md` は記録なので変えない。

## Global Constraints

- 前回までの Global Constraints をすべて引き継ぐ: `files/` を変えない／本文の文字を縮めない／1文ごとに `<br>`／「戻す」「進む」と書き、「元に戻す」「やり直す」と書かない／確認ダイアログの文言・札の座標を手で書かない／コミット末尾は `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（ほかのモデル名にしない）／`.claude/launch.json` と 2026-09-23 付けの未追跡ファイルはコミットしない。
- `manual/dist/` は Task 4 でだけコミットする。
- 撮影の検証で止まったら、撮影コードを推測で直さず、止めて報告する。
- `outputs/manual-20260922/`、`docs/manual-*.md` は変えない。

## 技術制約

- 状態ファイル: `manual/state/source-export.json` はアプリの localStorage の書き出し。`palletApp.spaces` は含まれない（アプリは `DEFAULT_SPACES` を使う）ので、保存版 `SPACES_SAVE_VERSION`（4→5）の扱いは不要。ただし `palletApp.spaces` が含まれていたら止めて報告する。
- 手動配置の復元は `activePlacementSnapshot()`（files/index.html:4164）が、保存した `manual.fp` と今の `inputFingerprint()` を文字列で比べる。指紋は `JSON.stringify({items, spaces:spacesToText(false)})`（4002）で、エリア名が平文で入る。したがって `palletApp.schedule` の中の文字列（`manual.fp`、`result.fp`、`resultFingerprint`、`sp[].name` など）に含まれる「軒下①」「軒下②」を、もれなく新名に置き換えれば一致する。`sheetEdits` は s2 で空（`{"sig":"","marks":{}}`）なので影響しない。
- 置き換えは文字列の単純置換で行う。「軒下②」→「軒下奥」と「軒下①」→「軒下」は互いに影響しない。
- 復元の確認は、既存の `node manual/capture.cjs states`（`capture/states.cjs:19` の「s2 で手動配置が復元されていない」検査）で行う。
- 3択の確認画面は画面内の部品 `#carryDlg`（files/index.html:1225）。`confirm()` ではないので、`sc.dialogs` には記録されない。画像として撮る。開くのは `runFromButton()` で `hasManual()` が真のとき（4257〜）。配置不可エリアの「自動配置を実行」（`runFromBlockedEdit`、3838）も同じ関数を通る。
- 「変更分だけ自動配置」を選ぶと、`#messages` に `✅ 手動調整を残して、変更分だけ反映しました（そのまま N件・…）。` が出る（`carryNoteHtml`、2980）。引き継げないときは `⚠ 倉庫の設定や配置不可のマスが変わっていて手動調整を引き継げないため、すべて自動配置し直しました。`（4290）。
- 撮り直しにはディスクの空きが 1GB 以上必要。

---

### Task 1: 状態ファイルと撮影コードのエリア名を新しい名前にする

**Files:**
- Modify: `manual/lib/states.cjs`、`manual/make-states.cjs`、`manual/test/states.test.cjs`
- Modify: `manual/capture/edit.cjs`、`manual/capture/sheet.cjs`（エリア名とコメント）
- Regenerate: `manual/state/s1-planned.json`、`s2-final.json`（`source-export.json` は変えない）

**手順:**
1. `states.cjs` に `renameSpaces(state)` を足す。
   - `const SPACE_RENAMES=[['軒下②','軒下奥'],['軒下①','軒下']];`
   - state の各値（文字列）に対して、各組を `split(旧).join(新)` で置き換えた新しいオブジェクトを返す。元のオブジェクトは変えない。
   - `palletApp.spaces` キーがあれば `throw new Error('palletApp.spaces があります。保存版の扱いを決めてから使ってください')`。
   - `module.exports` に `renameSpaces` と `SPACE_RENAMES` を足す。
2. `test/states.test.cjs` にテストを足す（先に書いて失敗を確かめる）:
   - 入れ子の JSON 文字列の中の「軒下①」「軒下②」が「軒下」「軒下奥」になり、ほかの文字は変わらない。
   - 元のオブジェクトが変わらない。
   - `palletApp.spaces` があると例外。
   - 今の `state/source-export.json` に通した結果に「軒下①」「軒下②」が残らない。
3. `make-states.cjs`: 読み込んだ `src` を `renameSpaces` に通してから `makePlanned`・`makeFinal` に渡す。`state/source-export.json` は書き戻さない（アプリから書き出した記録として残す。ユーザー決定 2026-10-04）。先頭のコメントに1行足す。
4. `capture/edit.cjs`（14・16行目付近）、`capture/sheet.cjs`（10・75・80行目付近）のエリア名とエラー文、両ファイルのコメントの「軒下①」「軒下②」を新名にする（edit.cjs:10・133、sheet.cjs:8・39・69〜72 のコメントも）。
5. 実行:
   - `npm --prefix manual test`（PASS。件数を報告）
   - `npm --prefix manual run states`
   - `grep -c '軒下[①②]' manual/state/s1-planned.json manual/state/s2-final.json` が全部 0（`source-export.json` は旧名のまま）
   - `git diff --quiet manual/state/source-export.json`（変わっていない）
   - ディスクの空き確認後、`node manual/capture.cjs states`（timeout 600000）。「s2 で手動配置が復元されていない」で止まらないこと。止まったら報告して停止。
6. Commit: `git add manual/lib/states.cjs manual/make-states.cjs manual/test/states.test.cjs manual/capture/edit.cjs manual/capture/sheet.cjs manual/state`、メッセージ `feat: マニュアルの状態ファイルと撮影コードを新しいエリア名（軒下・軒下奥）にそろえる`。

---

### Task 2: 3択の確認画面を撮る

**Files:**
- Modify: `manual/capture/input.cjs`
- 生成: `manual/assets/carry-dialog.png`（コミットは Task 4）

**手順:**
1. `input.cjs` の最後（既存の撮影のあと、`return` の前）に、新しい場面を足す。
   - `openScene(browser,{state:loadState('s2-final.json'),tab:'入力'})`（s2 は手動配置ありの完成状態）。
   - 伝票の数量を1か所だけ増やす。対象は最後の伝票の `444-4444` の行（仕掛品4、SNP 2,000）の個数を 27000 → 29000 にする（+1P）。行の探し方は、同じファイルの既存の入力操作（受領の場面など）にならう。
   - `#runBtnInline` を押し、`#carryDlg` が表示されるのを待つ（`hidden` が外れる）。出なければ `expect` で止める: `手動調整の残し方の確認画面が出ていない（BLOCKED）`。
   - `.carry-box` を `clipShot` で `carry-dialog` として撮る（余白 4）。`clipShot` が blur しても画面は閉じない（ボタンを押すまで残る）ことを確かめ、閉じるようなら `page.screenshot`＋`unionRect` で撮る（前回の太字の撮影と同じやり方）。
   - 「変更分だけ自動配置」のボタン（`#carryDlg button` のうち文字が「変更分だけ自動配置」で始まるもの）を押す。
   - `#messages` の行（`.msg`）のうち `手動調整を残して、変更分だけ反映しました` を含む行を抜き出す。無ければ `expect` で止める（`変更分だけの反映になっていない`）。その行の `そのまま (\d+)件` の数が 1 以上であることも確かめる。
   - 注意: s2 のマスタは見本用なので、未登録品目の確認（`confirm()`）も出て、場面の既定動作で承諾される。そのため `#messages` には「✅ 「設定」タブに登録しました」の行も増える。抜き出しはこの行と混ぜない。このことをコードのコメントに残す。
   - `out.carry={note:<抜き出した行>,kept:<数>}` を記録する。
   - 場面を閉じる。
2. 先頭のコメント（撮影するページ）に、新しいページ（P10）を足す。
3. 実行: ディスクの空き確認後、`node manual/capture.cjs input`（timeout 600000）。続けて `npm --prefix manual test`。
4. Read で `manual/assets/carry-dialog.png` を開き、題名「手動で調整した配置があります」と4つのボタンが写っていることを確かめる。
5. Commit: `git add manual/capture/input.cjs`、メッセージ `feat: 手動調整の残し方を選ぶ確認画面を撮る`。

---

### Task 3: ページを直し、新しいページを足す

**Files:**
- Modify: `manual/pages/p02.html`、`p03.html`、`p04.html`、`p09.html`、`p11.html`、`p12.html`、`p13.html`、`p15.html`、`p17.html`、`p18.html`
- Move: `p10.html`〜`p18.html` → `p11.html`〜`p19.html`（後ろから `git mv`。p18→p19 から順に）
- Create: `manual/pages/p10.html`
- Modify: `manual/README.md`（19ページ）

**手順:**

1. **エリア名（移動の前に、今のファイル名で直す）:**
   - p02: `軒下①②` → `軒下・軒下奥`
   - p04: `軒下①・軒下②` → `軒下・軒下奥`
   - p11: `軒下①` → `軒下`（2か所）
   - p15: `軒下①` → `軒下`
   - 直したら `grep -n '軒下[①②]' manual/pages/*.html` が何も出さないこと。

2. **ページを1つずつ後ろへずらし、すぐに既存のページ参照を付け替える:** `cd manual/pages && for n in 18 17 16 15 14 13 12 11 10; do git mv p$n.html p$((n+1)).html; done && cd ../..`。続けて、新しい p10 を作る前・手順4の書き換えの前に、手順5の付け替えを済ませる（新しく書く参照と混ざらないようにするため）。

3. **新しい `p10.html`:**
   ```html
   <!--page {"title":"5. 入力 <small>（4）伝票を直したとき</small>","lead":"手で整えた配置を残して、直した分だけ反映できます。","tab":"入力"} -->
   <h2>5.7 手動の調整があるときの確認画面</h2>
   <p>配置を手で整えたあとに伝票を直し、「▶ 自動配置を作成」を押すと、この確認画面が出ます。<br>配置不可エリアの「自動配置を実行」でも同じ画面が出ます。</p>
   <figure><img class="shot fit h60" src="assets/carry-dialog.png" alt="手動調整の残し方を選ぶ確認画面"></figure>
   <table class="tbl"><thead><tr><th>選ぶもの</th><th>手で置いた荷物</th><th>増えた分・新しい荷物</th><th>「半」の指定</th></tr></thead><tbody>
   <tr><td><b>変更分だけ自動配置</b>（ふだんはこれ）</td><td>そのまま</td><td>空きへ自動で置く</td><td>引き継ぐ</td></tr>
   <tr><td><b>変更分を退避スペースへ</b></td><td>そのまま</td><td>退避スペースへ移す（手で運ぶ）</td><td>引き継ぐ</td></tr>
   <tr><td><b>すべて自動配置し直す</b></td><td>破棄する</td><td>全部を置き直す</td><td>破棄する</td></tr>
   </tbody></table>
   <ul>
   <li>減った分は、退避にある分から、次に最後に積んだ所から空けます。<br>減らした列の「半」の指定は消えます。</li>
   <li>消した荷物のマスは空きます。</li>
   <li>倉庫の設定や配置不可のマスが変わっていると、手動の調整を引き継げません。<br>このときは、すべて自動配置し直して、その旨が表示されます。</li>
   <li>配置が変わると、配置図のテキスト編集は今までどおり破棄されることがあります（P16）。</li>
   <li>どれを選んでも、退避スペースの荷物は退避に残ります。</li>
   <li>どれを選んでも、それまでの配置編集は「戻す」で戻せなくなります。</li>
   <li>「キャンセル」を押すと、何も変えずに閉じます。</li>
   </ul>
   <p>反映したあとは、表示されるお知らせ（そのまま・減らした・増えた件数）と配置を確かめます。</p>
   ```
   （P16 は移動後の「7.2 必要なら表記を整える」のページ。収まらなければ画像の h クラスを下げる。それでも無理なら止めて報告する。）

4. **「破棄される」の7か所（移動後のファイル名で直す）:**
   - p02 の流れ図 `.df-back`: `仮伝票を直して受領済みにし、②の自動配置を作り直します。<br><small>作り直すと、手で整えた配置は消えます。</small>` → `仮伝票を直して受領済みにし、②の自動配置をもう一度押します。<br><small>確認画面で「変更分だけ自動配置」を選ぶと、手で整えた配置は残ります。</small>`
   - p03 の表 N（▶ 自動配置を作成）: 説明を `入力から配置を作ります。手動の調整があるときは、残し方を選べます。` に、「詳しくは」を `P9〜10` にする。
   - p09 の 5.6 の `aside.warn`: `手動で整えた配置があるときは、残し方を選ぶ確認画面が出ます（P10）。<br>「すべて自動配置し直す」を選ぶと、手動の調整と「半」の位置の指定は破棄されます。`
   - p13（旧 p12）の muted: `自動配置を実行すると手動の調整は破棄されるので、結果を確認します。` → `手動の調整があるときは、残し方を選ぶ確認画面が出ます（P10）。<br>配置不可のマスに荷物が置いてあると引き継げず、すべて自動配置し直すので、結果を確認します。`
   - p14（旧 p13）の aside: `そのロットを移動したとき、自動配置を作り直したときも、指定は消えて下側に戻ります。` → `そのロットを移動したとき、「すべて自動配置し直す」を選んだときも、指定は消えて下側に戻ります。`
   - p18（旧 p17）の 8.2: `数量などを変えたら、自動配置を作り直して確認します。作り直すと、手動で整えた配置と「半」の位置の指定は破棄されます。` → `数量などを変えたら、もう一度「▶ 自動配置を作成」を押して確認します。<br>手動の調整があるときは、確認画面で残し方を選びます（P10）。`（続く書き足しの注意の文はそのまま）
   - p19（旧 p18）の 9.3: `□ 作り直した場合は、手動の調整と表記を見直した。` → `□ 自動配置をもう一度押した場合は、配置と表記を見直した。`
   - p19 の 9.5 の行: `自動配置を作り直して、手動の調整や「半」の指定が消えた` ／ `確認画面が出ます（P9）。「OK」の後は配置を見直します。` → `「すべて自動配置し直す」を選んで、手動の調整や「半」の指定が消えた` ／ `戻せません。次からは「変更分だけ自動配置」を選びます（P10）。`

5. **ページ参照の付け替え（手順2の直後に行う）:** 移動したページを指す参照（旧 P10〜P18）を +1 する（P の後ろに数字が続くものだけ。「100P」などは変えない）。
   - 洗い出し: `grep -nE '(^|[^A-Za-z0-9])P[0-9]+(〜[0-9]+)?' manual/pages/*.html`
   - 規則: 旧 P1〜P9 はそのまま。旧 P10〜P18 は P11〜P19。範囲（例: `P10〜13`、`P14〜16`）は両端とも規則どおり（`P7〜9` はそのまま）。手順3・4で書く `P10`・`P9〜10`・`P16` は、付け替えの後に書く新しい番号。
   - 見取り図 p03〜p05 の「詳しくは」列、p19 の見出しの `<small>`（例: `配置図 P14〜16` → `P15〜17`、`配置編集 P10〜13` → `P11〜14`）、p19 の締めの `保存と設定は P17 へ` → `P18 へ` も対象。
   - 変えた参照は、移動先のページに参照した中身があることを1つずつ確かめる（組版の検査は範囲外しか見ないので、1つずれていても気づけない）。
   - 撮影コードのコメントのページ番号も同じ規則で付け替える: `manual/capture/edit.cjs`（旧 P10〜P13 → P11〜P14）、`manual/capture/sheet.cjs`（旧 P14〜P17 → P15〜P18）、`manual/capture/overview.cjs`・`input.cjs` にあれば同様。コメントだけ変え、コードは変えない。

6. **README:** `manual/README.md` のページ構成を19ページ（本編 p01〜p06、付録 p07〜p19）に直す。

7. **組版と確認**（画像は Task 2 までの撮影分を使う。撮り直しは Task 4）:
   - `npm --prefix manual test`
   - `npm --prefix manual run build && npm --prefix manual run render`（`build: 19 pages`、全ページ `spaceToFooter` 0以上、`images:true`、`tagsOut:[]`）
   - `grep -nE '元に戻す|元に戻り|やり直す|●|AAA|※未定|軒下[①②]' manual/pages/*.html` が何も出さない
   - `grep -n '破棄' manual/pages/*.html` の各行が、新しい動きと合っている（「すべて自動配置し直す」を選んだときの話か、配置図の書き足しの話だけ）
   - Read で p02・p03・p09・p10・p13・p14・p18・p19 のプレビューを開いて確かめる

8. Commit（dist はステージしない）: `git add manual/pages manual/README.md manual/capture`、メッセージ `docs: マニュアルを新しいエリア名と、変更分だけ配置し直す動きに合わせる`。

---

### Task 4: v80 で撮り直し、通しで作って確かめる

**Files:**
- Modify: `manual/assets/*.png`（撮り直し）
- Commit: `manual/assets`、`manual/dist`

**手順:**
1. ディスクの空きを確かめる（1GB 以上。足りなければ止めてユーザーに頼む）。
2. `npm --prefix manual test && npm --prefix manual run all`（timeout 600000。時間切れなら states → capture の各グループ → build → render を1つずつ）。撮影の検証で止まったら、例外の文言を添えて止めて報告する。
3. `manual/dist/verification.json` の `states.app.cacheVersion` が `v80`。
4. 配置図の上段の見出しを確かめる: Read で `manual/assets/sheet-top.png`、`sheet-final.png`、`print-a4.png` を開き、上段の見出しが「軒下」「軒下奥」（両方にまたがる欄だけの日は「軒下・軒下奥」）になっていて、「軒下①」「軒下②」が無いこと。どの画像にどの見出しがあったかを報告する。
5. Read で `manual/dist/preview/p01.png`〜`p19.png` を順に開き、文字の欠け・図の切れ・フッターとの重なりが無いこと、画像の中のエリア名と本文が合っていることを確かめる。食い違いがあれば止めて報告する。
6. Commit: `git add manual/assets manual/dist`（`manual/state` が変わっていれば `manual/state` も）、メッセージ `docs: アプリ v80 で撮り直し、新しいエリア名でマニュアルを作り直す`。
