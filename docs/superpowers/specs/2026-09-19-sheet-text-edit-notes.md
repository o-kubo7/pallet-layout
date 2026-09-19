# 配置図のテキスト編集 ブレスト記録（中断）

日付: 2026-09-19

このファイルは正式な設計書ではありません。ブレストの途中で
「上段のエリア見出し化」を先に実装する判断をしたため、そこまでに確定した内容を記録します。
再開するときは、この記録を出発点にして設計書へ昇格させてください。

元の要件メモ: `docs/superpowers/specs/2026-09-15-next-features-notes.md` §4

---

## なぜ中断したか

上段の見出し行をエリアごとに区切る改修（`docs/superpowers/specs/2026-09-19-sheet-top-area-heads-design.md`）を
先に実装することにしました。その改修は上段の注釈の中身を見出し行のグループへ移し、
欄ごとの注釈は「見出しのエリアと違う場所にもまたがる欄」だけに絞ります。
テキスト編集の保存キーは欄単位で設計していたため、
先にテキスト編集を作ると上段の注釈まわりを作り直すことになります。

なお注釈行（`tr.head-row` ではなく `tr.note-row`）は**行ごと残します**。
このテキスト編集で上段にも自由記入できる欄を残すため、という判断です
（2026-09-19 ユーザー指示）。したがって上段にも `kind="note"` の編集対象が残り、
欄単位のキー `top|lotIds|note` がそのまま使えます。

上段のエリア見出し化は保存形式に触れないので、逆順なら衝突しません。

---

## 確定した要件（ユーザー回答済み）

### 用途

- 例外の書き足し（アプリの仕様では表現できない臨時の置き場、特記事項）
- 印刷前の仕上げ

### 保存の寿命

localStorage に保存する。タブを離れても、リロードしても、アプリを再起動しても残る。

### 破棄の引き金

次の3つで書き足しを全部破棄する。破棄する前に件数を出して確認する。

- 「▶ 自動配置を作成」を押した
- 伝票の中身（品名・ロット・SNP・個数・種別）を直して入力指紋が変わった
- 配置編集で荷物を動かした

**あさ↔ひるの切り替えでは破棄しない。** あさとひるで別々に書き足しを保持する。

仮伝票→FAX受領済みへの変更だけなら破棄しない。`fingerprintFor()`（`files/index.html:3039`）は
`itemId / type / name / lot / snp / qty` とスペース定義しか見ておらず、`status` を含まないため。
ただし FAX 受領時にロット番号を入力する場合は `lot` が変わるので破棄の対象になる。

### 編集対象

上段・下段・追記欄の 品名 / ロット番号 / P数 / 注釈。

対象外: グリッドの○、月日、曜日、総パレット数、上段の見出し。

### 入り口

編集モードの切り替え（「文字を直す」ボタンで ON/OFF）。ON の間だけ欄に触れる。
誤タップで紙を崩す事故を防ぎ、印刷前に OFF へ戻す導線も作れる。

### 編集の方式

欄をタップすると、その欄だけ `<input>` に差し替える（in-place swap）。
編集中は水平圧縮（`transform:scaleX()`）を外して等倍にする。確定したら元の見た目に戻す。

### 編集済みの印

画面だけに出す（背景色など）。印刷した紙には出さない。

---

## 技術制約（調査済み・2026-09-19）

### `contenteditable` を紙の上で直接使うのは避ける

実機は Pixel 9a / Android Chrome、品名は日本語。次の2点が直撃するため、
ネイティブの `<input>` に差し替える方式を選びました。

**1. Android Chrome の `contenteditable` と日本語 IME**

- IME 変換中の `keydown` は `keyCode:229` しか返さない
- `compositionend` と `blur` の順序が仕様どおりでなく、入力が確定前に失われる報告がある
- 日本語・韓国語で「複数キーストロークでの変換が成立せず、同じ文字が繰り返される」報告がある
- IME がノードを予測不能に削除・追加・移動する

出典:
- https://github.com/ProseMirror/prosemirror/issues/784
- https://github.com/codemirror/codemirror5/issues/3158
- https://github.com/ianstormtaylor/slate/issues/4400
- https://blog.open-xchange.com/resources/ox-techblog/article/android-chrome-and-composition-events/

**2. `transform: scale()` を掛けた `contenteditable` はキャレットが描画されない**

スケールが小さいほど発生率が上がります。このアプリの `.fit` は `scaleX` を
最小 0.4 まで掛けます（`FIT_MIN_SCALE`, `files/index.html:4650`）。
もっとも編集したい「文字が入りきらない欄」ほどスケールが小さくなります。

出典:
- https://bugzilla.mozilla.org/show_bug.cgi?id=865930
- https://bugs.webkit.org/show_bug.cgi?id=19058
- https://bugzilla.mozilla.org/show_bug.cgi?id=1529492

**3. CSS `zoom` は hit testing と幾何測定に使えない**

`.sheet` は `zoom:var(--sheet-zoom)`（`files/index.html:428`）で、auto のときは画面幅に応じて 1 未満になります。
標準化後も `getBoundingClientRect()` はズーム込み、`offsetHeight` / `clientHeight` は素の CSS px、
という非対称が残ります（`Element.currentCSSZoom` で突き合わせる）。
既存の `fitSheetText()` はこれを知っていて `getComputedStyle(sheet).zoom` で割っています。

出典:
- https://chromestatus.com/feature/5198254868529152
- https://github.com/web-platform-tests/interop/issues/825

---

## 設計の途中まで（承認前）

### 保存先

`shift.sheetEdits`。あさ／ひる別。既存の `schedule.shifts.am/pm` の中、`result` / `manual` と同じ階層。

### 欄のキー

位置（「上段の3番目」）ではなく、欄の中身のロットID集合と種別で引く。

```
key = [tier, sortedLotIds.join(","), kind].join("|")
  例: "top|3,7|name"   "bottom|12|note"   "over|5|pallet"
値 = 書き換え後の文字列
```

位置を使えない理由: 破棄の引き金に「まとめ設定の切り替え」が入っていません。
まとめを OFF にすると1欄が複数欄に割れ、以降の index が全部ずれます。
位置キーだと別の荷物の欄に前の書き足しが貼りつきます。

### まとめ設定を切り替えたとき

キーが一致しない書き足しは捨てずに保存へ残し、表示だけしません。
設定を元に戻せば復活します。表示されていない書き足しがあるときは
画面メッセージ（`#sheetMsg`、印刷では非表示）に件数を出します。

---

## 再開するときに残っている論点

- 上段の**見出し**（グループのラベル）を編集対象に含めるか。
  見出しは1つで複数欄を代表するので、欄単位のキーでは表せません。
  含めるならグループ単位のキー（例 `top|groupAreas|head`）が要ります。
  上段の**注釈**は注釈行が残るので欄単位のキーで扱えます（解決済み）
- 編集を個別に取り消す手段（1欄だけ自動計算へ戻す）
- 編集後に `fitSheetText()` をどう掛け直すか。全体を走らせるとメッセージまで再計算されます
- 印刷プレビューで編集内容がそのまま出ることの確認（`@media print` の `zoom:1.4`）
- 編集で文字数が増えたときの高さ予算（`PRINT_H_LIMIT`）への影響
- 実機（Pixel 9a / Android Chrome）で `<input>` に差し替える方式の操作性を確認する
