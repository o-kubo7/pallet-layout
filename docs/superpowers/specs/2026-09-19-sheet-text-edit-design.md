# 配置図のテキスト編集 設計書

日付: 2026-09-19

対象ファイル: `files/index.html`、`files/sw.js`、`tests/sheet-placement.test.js`、`tests/stash-overflow.test.js`

行番号はすべて 2026-09-19 時点（`files/index.html` 全 5534 行）のもの。着手時に `grep` で取り直すこと。

出発点: `docs/superpowers/specs/2026-09-19-sheet-text-edit-notes.md`（ブレスト中断記録）。
この設計書が中断記録に優先する。中断記録との食い違いは §8 に一覧で書いた。

元の要件メモ: `docs/superpowers/specs/2026-09-15-next-features-notes.md` §4

---

## 1. 目的

配置図（紙）の欄の文字を、印刷前にその場で書き換えられるようにする。

用途は2つ。

- 例外の書き足し。アプリの仕様では表現できない臨時の置き場や特記事項を足す
- 印刷前の仕上げ。自動で作った文字を現場の言葉に直す

書き換えた内容はブラウザに保存し、タブを離れてもリロードしてもアプリを再起動しても残る。
ただし配置そのものが変わったときは、古い書き足しを紙に出さない。

---

## 2. 現状

### 2-1. 配置図の描画

`renderSheet()`（`files/index.html:4801`）が表の HTML を組み立て、`#sheetView` に差し込む。
末尾で 3 つを順に呼ぶ（`files/index.html:4891-4895`）。

```js
fitSheetText(pl);               // 折り返しは行の高さを変えるので線より先に確定させる
drawLeaders(grid.anchors, ...);
applySheetZoom();
```

欄のセルは `slotCells(entries, count, kind, extra, sepAt)`（`files/index.html:4915`）が作る。
`kind` は `name` / `lot` / `pallet` / `note` の4種。中身は `<span class="fit">` で包む。
ロット番号が3件以上ある欄だけ `<span class="fitcol">` で縦積みにする（`files/index.html:4933`）。

追記欄は `overflowTable(entries)`（`files/index.html:4952`）が別に作る。
まとめ欄（`.roll`）は品名・ロット・P数・注記をそれぞれ件数ぶん縦積みにする。

上段の見出しは `topHeadGroups(entries, count, baseArea)`（`files/index.html:4514`）が
`{label, slots}` の配列を返し、行1でグループごとに `<td class="ttl">` を作る。

### 2-2. 文字の圧縮

`fitSheetText(pl)`（`files/index.html:4717`）が `.fit` を1つずつ測り、
欄幅に収まらなければ `transform: scaleX(k)` で横に潰す。
下限は `FIT_MIN_SCALE = 0.4`（`files/index.html:4709`）。
下限を割ると折り返しの基準幅を `avail/0.4` に広げてから `white-space: normal` にする。
このとき欄の高さが増える。

末尾で `box.innerHTML = html`（`files/index.html:4796`）と `#sheetMsg` を**上書き**する。
`applyDisplay()`（`files/index.html:4317`）からも引数なしで呼ばれる。

### 2-3. 表示倍率と欄の幅

`.sheet` は `zoom: var(--sheet-zoom, 1)`（`files/index.html:428`）。
`autoSheetZoom()`（`files/index.html:4380`）は `Math.max(1, ...)` を返すので **1倍を下回らない**。
画面が狭いときは縮小せず、`.sheet{overflow-x:auto}`（`files/index.html:427`）で横スクロールになる。

`.sheet table` は `table-layout: fixed` で幅 672px 固定（`files/index.html:437`）。
1欄は2列 = 95px（padding を引いた実測値）。**入力欄を入れても列は広がらない。**

### 2-4. 保存

`schedule.shifts.am` / `schedule.shifts.pm` に、あさ／ひる別で
`slips` / `result` / `manual` / `blocked` を持つ。`saveSchedule()`（`files/index.html:1292`）が
`STORE_KEY.schedule`（`palletApp.schedule`）へ localStorage に書く。

伝票の指紋は `fingerprintFor(slips)`（`files/index.html:3042`）。
`itemId / type / name / lot / snp / qty` と `spacesToText(false)` を見る。
`status` は含まない。**`withSheet=false` なので掲載先（top/bottom）も含まない**
（`files/index.html:4054` に「掲載先（sheet）は含めない」のコメント）。

### 2-5. 印刷

`printSheet()`（`files/index.html:4257`）は `switchTab('sheet')` を呼んでから `window.print()`。
ブラウザのメニューや Ctrl/Cmd+P は `printSheet()` を通らず、
`beforeprint` イベント（`files/index.html:4266`）で `switchTab('sheet')` だけが走る。
`switchTab('sheet')` は `hasResult` なら `renderSheet()` を呼ぶ（`files/index.html:2622`）。

### 2-6. 幅による出し分け

入力タブは PC がテーブル、600px 以下がカードの2面で、
`compactInputMq = matchMedia("(max-width:600px)")`（`files/index.html:1592`）で判定する。

キーボードで欄が隠れる問題は `acPosition()`（`files/index.html:1903`）が
`visualViewport.offsetTop / height` と固定バーの高さから可視領域を計算して対処済み。

### 2-7. 既存テストの呼び出し方

`tests/sheet-placement.test.js` と `tests/stash-overflow.test.js` は
`functionSource(name)` で関数本体を切り出し、`new Function(依存名..., src)` で評価する
（例: `tests/stash-overflow.test.js:108` は `new Function("esc","palSlotTextOf","slotAreaNote", …)`）。

切り出し対象に `slotCells` / `overflowTable` / `topHeadGroups` / `renderSheet` /
`fitSheetText` / `printSheet` / `switchTab` が既に含まれる。
**これらの関数がモジュールスコープの変数を新しく参照すると、既存テストが ReferenceError で落ちる。**

---

## 3. 設計

### 3-1. 保存先と形

`shift.sheetEdits` を足す。あさ／ひる別。`result` / `manual` と同じ階層。

```js
shift.sheetEdits = {
  sig: "<署名>",                       // この書き足しがどの配置に対するものか
  marks: { "<キー>": "<書き換え後の文字列>", ... }
}
```

`normalizeShift()`（`files/index.html:1151` 付近）に `sheetEdits` の正規化を足す。
壊れた値・古い版のデータは `{sig:"", marks:{}}` に落とす。
`loadOrMigrateSchedule()` の「一部を読み込めなかった」警告（`files/index.html:1274`）の
条件には `sheetEdits` を足さない。書き足しが読めなくても配置そのものは復元できるため。

`SCHEDULE_VERSION`（`files/index.html:996`、現在 1）は上げない。
`normalizeShift()` が既定値に落とすので、古いデータはそのまま読める。

### 3-2. 署名

書き足しが「どの配置に対して書かれたか」を1本の文字列で表す。

```
sig = ハッシュ(
        fp（伝票指紋 fingerprintFor()）
      + 配置スナップショット（lots, sp）
      + 掲載先（spacesToText(true)）
      + まとめ設定（mergeLots）
      + 端数表示（fracMode）
      + 様式（normal / wide）
      )
```

ハッシュは短い文字列に畳む。材料をそのまま `JSON.stringify` で連結すると
配置スナップショットのぶんだけ長くなり、`sheetEdits` が localStorage を無駄に食う
（`fingerprintFor()` は `JSON.stringify` をそのまま指紋にしているが、あれは保存せず
比較にしか使わない値）。連結した文字列を djb2 などの短いハッシュ関数に通し、
16進の文字列にして持つ。

**掲載先を材料に入れるのが要（`fingerprintFor()` には入っていない）。**
欄の並びを決める `sheetSlots(tier)`（`files/index.html:4474`）は
`sheetAreas(tier)`（`files/index.html:920`）＝各エリアの `s.sheet` に依存するが、
`fingerprintFor()` が使う `spacesToText(false)` は掲載先を意図的に除外している。
設定タブで「軒下①を下段→上段」と変えると上段・下段の欄が総入れ替えになり、
`topHeadGroups()` のグループ構成も変わるのに、fp・sp・lots・まとめ設定・様式は
どれも変わらない。掲載先を入れないと、**署名が一致したまま書き足しが別の荷物の欄に貼りつく。**

`fracMode`（`files/index.html:993`）を入れるのは、P数欄の自動計算値そのものを
変えるため（`palletSlotText()`、`files/index.html:1624`）。
入れないと §3-10 の「自動計算の値と同じならキーを削除」の比較基準だけが動く。

`DISPLAY` の文字サイズ・`arrowHead`・`lotCorner` は署名に入れない。
欄の並びも自動計算の値も変えないため。

`sig` が現在の状態と一致するときだけ `marks` を紙に出す。一致しないときは**表示しないだけ**で、
`marks` は保存に残す（ただし §3-4 の場合を除く）。

| 出来事 | 変わるもの | 書き足しの扱い |
|---|---|---|
| 「▶ 自動配置を作成」を押した | lots / sp | 表示しない |
| 伝票の品名・ロット・SNP・個数・種別を直した | fp | 表示しない |
| 配置編集で荷物を動かした | sp | 表示しない |
| 配置マスで掲載先（上段／下段）を変えた | 掲載先 | 表示しない |
| まとめ設定を切り替えた | mergeLots | 表示しない |
| 端数表示を切り替えた | fracMode | 表示しない |
| 様式が normal ↔ wide に変わった | 様式 | 表示しない |
| あさ ↔ ひるを切り替えた | （別の shift） | それぞれの書き足しを保持 |
| 文字サイズ・矢印・角の丸みを変えた | （署名に入れない） | **そのまま表示** |
| 仮伝票 → FAX受領済み（`status` だけ変わる） | 何も変わらない | **そのまま表示** |

`fingerprintFor()` は `status` を見ないので、FAX 受領への変更だけでは署名が変わらない。
ただし受領時にロット番号を入力する場合は `lot` が変わるため署名も変わる。

配置編集で荷物を掴んで元の位置に戻した場合は `sp` が同じ値に戻るので、書き足しは表示され続ける。

**確認ダイアログは出さない。** 荷物を1マス動かすたびに聞かれるのを避ける。
代わりに `#sheetMsg` に案内を出す（§3-7）。

### 3-3. キー

位置で引く。

```
欄:     [tier, index, kind].join("|")
        tier  = "top" | "bottom" | "over"
        index = その段の中での欄の番号（0 始まり）
        kind  = "name" | "lot" | "pallet" | "note"
        例: "top|2|name"  "bottom|5|note"  "over|0|pallet"

見出し: ["top", "g" + groupIndex, "head"].join("|")
        groupIndex = topHeadGroups() が返した配列の添字
        例: "top|g1|head"
```

ロットIDの集合ではなく位置を使う理由は、署名（§3-2）が配置・掲載先・まとめ設定・
端数表示・様式をすべて含むため。署名が一致する間は欄の並びが変わらないので、
位置で引いても別の荷物に貼りつかない。署名が変われば表示を止めるので、
ロットIDで追従させる意味がない。

位置キーの利点は**空欄にも書けること**。ロットIDキーだと荷物の無い欄のキーが
`top||name` に潰れ、複数の空欄が同じキーに衝突する。
上段の注釈行を自由記入に使う（中断記録の要件）にはロットIDキーでは足りない。

### 3-4. 署名が合わない状態で編集したとき

署名が合わない状態でも編集モードは開ける。紙には自動計算の値が出ているので、
それを直すこと自体はできる。

この状態で**最初に確定した時点**で、古い `marks` を捨てて新しい署名で始める。

```
1. あさの配置図に書き足し（署名 A、marks 3件）
2. 荷物を1マス動かす → 署名 B。3件は紙から消える（保存には残る）
3. どこかの欄を直して確定 ← ここ
   → confirm「前の配置の書き足し 3 件を捨てて、新しく書き始めます。よろしいですか？」
     OK      : marks を空にし、sig を B にして、今の入力を保存
     キャンセル: 今の入力を捨てる（marks も sig もそのまま）
```

`{sig, marks}` を1組しか持たない代わりに、「配置を戻せば前の書き足しが復活する」は
この時点で諦める。署名が合わない間は画面から前の書き足しが消えているので、
利用者の関心が向きにくい。捨てたことに気づかないまま作業が進むのを避けるための confirm。

**設定で確認を省ける。** 設定タブの「表示設定」ペイン（`files/index.html:798`）の
「そのほかの表示」に、`fracChk` / `mergeChk` と同じ形のチェックボックスを足す。

```
□ 配置が変わったら、確認なしで書き足しを捨てる
```

既定は OFF（確認する）。ON のときは confirm を出さずに黙って捨てる。
保存キーは `STORE_KEY.sheetEditSilent`（`palletApp.sheetEditSilent`）。この端末に保存する。

### 3-5. 編集対象

含める:

- 上段・下段の 品名 / ロット / P数 / 注釈（`slotCells()` が作る4種）
- 追記欄の 品名 / ロット / P数 / 注記（`overflowTable()` が作る4種）
- 上段の見出し（`topHeadGroups()` が作るグループのラベル）
- **荷物が入っていない空欄も含める**

含めない:

- グリッドの○
- 月日・曜日・総パレット数
- 通路の見出し・列番号などの固定文字

### 3-6. 書き足しの差し込み

`renderSheet()` が表を組み立てる時点で、`marks` の値を自動計算の値より優先して埋める。
署名が一致しないときは空の `marks` を渡す。

**`marks` は引数で渡す。** モジュールスコープの変数を `slotCells()` などから参照すると、
`new Function(依存名..., src)` で関数本体だけを評価している既存テスト（§2-7）が
ReferenceError で落ちる。

```js
slotCells(entries, count, kind, extra, sepAt, tier, marks)
overflowTable(entries, marks)
topHeadGroups(entries, count, baseArea)        // 引数は変えない。キーは呼び出し側で組む
```

各関数の中で `[tier, i, kind].join("|")` を組み立て、

- `marks` に値があればその文字列を `<span class="fit">` に入れる（`esc()` を通す）
- 無ければ従来どおり自動計算の値を入れる
- どちらの場合も `<td>` に `data-ek="<キー>"` を付ける（編集モードが OFF のときも付ける）
- `marks` から値を取った `<td>` には `edited` クラスを付ける

見出しは `renderSheet()` の行1を組み立てるところで `marks` を引き、
`data-ek="top|g<n>|head"` を付ける。

改行を含む値（§3-9 の `<textarea>` で書いたもの）は、改行で分けて
`<span class="fitcol"><span class="fit">…</span>…</span>` に組み立てる。
1行だけの値は `<span class="fit">` 1つにする。

### 3-7. 表示していない書き足しの案内

署名が一致せず `marks` に中身があるとき、`#sheetMsg` に足す。

```
※ 前の配置に対する書き足しが N 件あります。紙には出ません。 [捨てる]
```

`#sheetMsg` は印刷CSSで `display:none`（`files/index.html:565`）なので紙には出ない。
「捨てる」を押したら件数を添えて `confirm()` し、`marks` を空にする
（`sheetEditSilent` が ON なら確認なし）。

**組み立てる場所は `fitSheetText()` の中。** `fitSheetText()` は末尾で
`box.innerHTML = html` と上書きする（`files/index.html:4796`）ため、
`renderSheet()` の末尾で後から追記すると、`applyDisplay()` 経由で
`fitSheetText()` が呼ばれた瞬間（表示設定を触ったとき）に案内が消える。

`fitSheetText(pl)` は署名も `sheetEdits` も知らないので、
引数を1つ足して受け取る（`fitSheetText(pl, hiddenMarkCount)`）。
`applyDisplay()` から引数なしで呼ばれる経路では、関数の中で数え直す。

`[捨てる]` は `innerHTML` の中の `onclick` で呼ぶ。
既存の `#sheetMsg` の中身と同じ作り方にする。

### 3-8. 編集モード

`.sheet-toolbar`（`files/index.html:736`）に足す。

- 「✏ 文字を編集」トグル。ON/OFF を切り替える
- ON の間だけ「書き足しを全部戻す（N件）」ボタンも出す。押したら `confirm()` して `marks` を空にする

ON の間、`.sheet` に `editing` クラスを付ける。CSS で `data-ek` を持つ `<td>` に薄い背景を当て、
どこが触れる欄か分かるようにする。空欄も対象なので、この印がないと触れる場所が見えない。

編集モードは画面の状態であって保存しない。タブを離れたら OFF に戻す。

タップは `#sheetView` へのイベント委譲で受ける。`renderSheet()` が中身を丸ごと
入れ替えるので、`<td>` ごとにハンドラを付けると毎回付け直しになる。

### 3-9. 入力欄の出し方 — 幅で2通り

`compactInputMq = matchMedia("(max-width:600px)")`（`files/index.html:1592`、既存）で分ける。
入力タブが既にこの境でテーブルとカードを出し分けているので、同じ境に揃える。

**両方の入力欄を同時に DOM へ置かない。** 編集を始める時点で幅を判定し、片方だけを作る。
非表示側の要素に `focus()` を呼んでも何も起きない（2026-08-27 の教訓）。

#### 600px 以下（スマホ・実機の Pixel 9a）: 表の外の編集バー

欄をタップすると、`.sheet-toolbar` の直下に編集バーを出す。

- バーには「いま直している欄の名前（例: 上段3番目の品名）」「入力欄」「確定」「取り消し」を置く
- 入力欄は画面幅いっぱい。Pixel 9a（412px）で約25文字が見える
- タップされた `<td>` は背景色でハイライトし、どこを直しているか分かるようにする
- バーは `position: fixed`。`visualViewport.offsetTop / height` を見て
  ソフトキーボードの上に留める。計算は既存の `acPosition()`（`files/index.html:1903`）
  と同じパターンを使う（`#actionBar` は配置図タブでは非表示なので `barH` は 0）

in-place にしない理由: 欄の実測幅は 95px で、品名（16px）は**5.6文字しか見えない**（§6-3）。
`.sheet table` は `table-layout: fixed` の 672px 固定なので入力欄を広げても列は広がらない。
加えて Pixel 9a に Escape キーが無く、ソフトキーボードの戻るボタンは `blur` = 確定になるため、
in-place だと実機に取り消し手段が存在しない。バーなら「取り消し」ボタンを置ける。

#### 601px 以上（PC）: セル内で直接編集

欄をタップすると、その `<td>` の中身を入力欄に差し替える。

- 中身が単一行（`.fit` が1つ）→ `<input type="text">`
- 中身が縦積み（`.fitcol`）→ `<textarea>`、改行区切り、`rows` は現在の行数
- `width:100%; box-sizing:border-box`。列は広がらないので入力欄は 91px のまま
- `transform: none` を当てて `scaleX()` の圧縮を外す
- **`font-size` に下限を設ける。** 追記欄のまとめ欄は `font-size:55%` ≒ 7px
  （`files/index.html:515`）で、そのままでは打てない。編集中だけ 13px を下限にし、
  確定したら元に戻す
- PC は Escape キーがあり、表示倍率ボタン（150% / 200%）で拡大でき、
  マウスで横スクロールできるので 91px でも実用になる

どちらの方式でも、同時に開く入力欄は1つだけ。

### 3-10. 確定と取り消し

**確定は `blur`（PC）と「確定」ボタン（スマホ）。** Enter では確定しない。

- `<input>` の `keydown` で Enter を受けたら、`e.isComposing === false` のときだけ確定する。
  `isComposing` が true のときは何もしない（§5-1）
- `<textarea>` の Enter は改行。確定には使わない
- PC は Escape で編集前の値に戻して閉じる。スマホは「取り消し」ボタン

値は保存前に正規化する。

| 入力された値 | `marks` の扱い |
|---|---|
| 空文字 | そのキーを削除する（自動計算の値に戻る） |
| 空白だけ（半角・全角・改行のみを含む） | 空文字と同じ。キーを削除する |
| 前後に空白がある | trim してから比べる・保存する |
| trim した結果が自動計算の値と同じ | そのキーを削除する（無駄な書き足しを溜めない） |
| それ以外 | trim した文字列をそのキーに保存する |

`<textarea>` の値は改行を保ったまま保存する（各行は trim する）。
表示のとき `esc()` を通すので、保存する文字列はエスケープしない生の文字列にする。

これが「欄ごとの取り消し」になる。欄に×ボタンは置かない。紙の上に押せるものを増やさない。

### 3-11. `renderSheet()` を呼び直すときの副作用

確定したら `saveSchedule()` を呼び、`renderSheet()` を丸ごと呼び直す。
`fitSheetText()` / `drawLeaders()` / `applySheetZoom()` は `renderSheet()` の末尾で走る
（`files/index.html:4891-4895`）ので、個別に呼ばない。

ただし `renderSheet()` は `#sheetView` の中身を丸ごと入れ替えるため、3つの後始末が要る。

**1. 横スクロール位置。** 横スクロールのコンテナは `.sheet` 自身（`overflow-x:auto`、
`files/index.html:427`）で、`renderSheet()` がそれごと作り直す。
実機は幅 412px・表 672px で必ず横スクロールしているので、
確定のたびに紙が左端へ飛ぶと右側の欄を続けて直せない。
`renderSheet()` の冒頭で `scrollLeft` を控え、末尾で戻す。

**2. 編集モードのクラス。** `renderSheet()` の末尾に `applySheetEditMode()` を足して貼り直す。
`renderSheet()` は `setArrowHead()`（`files/index.html:4279`）、
`onHeadChange()`（`files/index.html:4252`）、`showMapState()`（`files/index.html:2677`）、
`applyDisplay()` からも呼ばれるので、呼び出し側ではなく `renderSheet()` の末尾に置く。

**3. 編集中の入力。** 上の4つの経路はいずれも編集中でも走り、開いている入力欄を無言で捨てる。
`renderSheet()` の冒頭で、開いている入力があれば確定する
（`exitSheetEditMode()` と対称に `commitSheetEdit()` を置く）。

### 3-12. 編集済みの印

```css
.sheet td.edited{background:#fffbe6}
```

`print-color-adjust: exact` を**付けない**。ブラウザは既定で背景色を印刷しないので、
指定しないことが紙に出さない手段になる（2026-08-23 の教訓）。
念のため `@media print` でも `background: transparent` を当てて二重にする。

### 3-13. 印刷との関係

印刷の前に、編集中の入力欄を確定し、編集モードを OFF に戻す。

入れる場所は2か所。同じ `exitSheetEditMode()` を呼ぶ。

- `printSheet()`（`files/index.html:4257`）の先頭
- `beforeprint` のリスナ（`files/index.html:4266`）の先頭

Ctrl/Cmd+P とブラウザのメニューからの印刷は `printSheet()` を通らない。
`beforeprint` だけに入れると「🖨 印刷」ボタン経由で漏れ、`printSheet()` だけに入れると
ショートカット経由で漏れる。

実機（Pixel 9a / Android Chrome）には Ctrl/Cmd+P が無いので、実際に効くのは
「🖨 印刷」ボタンの経路。`beforeprint` は PC から印刷する場合の保険。
どちらの端末から紙を出すかは §7 の検証タスクで確認する。

### 3-14. あふれたときの扱い

入力に文字数の上限は設けない。既存の案内に任せる。

`fitSheetText()` は欄に入りきらなければ
「⚠ 文字が入りきらない欄があります」、表が縦に伸びれば
「⚠ 表が縦に伸びて印刷が1ページに収まりません（用紙の N%）」を `#sheetMsg` に出す。

ただし**対処の文言が書き足し由来のあふれに合わない。**
現在の案内は「品名を短くしてください」「見出しは配置マスでエリア名を短くしてください」
（`files/index.html:4780-4782`）。書き足しであふれた欄にこれは誤り。

あふれた欄が `marks` 由来（`td.edited`）を含むときだけ、
「書き足した文字を短くしてください」を足す。既存の2つの文言と条件には触れない。
この案内の条件と文言は直近のコミット（`4d4e8f2` / `ff69fde` / `ff0af1c`）が
繰り返し直しており、`tests/sheet-placement.test.js` に回帰テストがある。

どれくらい書くと案内が出るかは §6 の実測を参照。

---

## 4. 保存の寿命と範囲

- 書き足しは `palletApp.schedule` の中に入るので、**この端末のこのブラウザにだけ**残る
- 端末を替えると消える。エクスポートは品目マスタだけ（`masterExportData`、
  `files/index.html:1338` 付近）で、書き足しは含まない
- 署名が二度と一致しない日の `marks` は、§3-4 の「最初の確定で捨てる」か
  §3-7 の「捨てる」ボタンを通るまで残る。自動の掃除規則は設けない。
  1シフトあたり数十件の短い文字列なので、`saveData()`（`files/index.html:1043`）の
  quota に当たる前に上の2経路のどちらかを通る

---

## 5. 技術制約（調査済み・2026-09-19）

実機は Pixel 9a / Android Chrome。品名は日本語。

### 5-1. Android Chrome の日本語 IME と Enter

IME の変換確定に使う Enter が `keydown` に届く。`e.key === "Enter"` だけで判定すると、
変換候補を確定しただけで欄が閉じる。`e.isComposing` を見て、
`false` のときだけ確定する（§3-10）。

`contenteditable` ではなくネイティブの `<input>` / `<textarea>` を使う理由もここにある。
`contenteditable` は Android Chrome の日本語 IME で次の問題が報告されている。

- 変換中の `keydown` は `keyCode: 229` しか返さない
- `compositionend` と `blur` の順序が仕様どおりでなく、入力が確定前に失われる
- 複数キーストロークでの変換が成立せず、同じ文字が繰り返される
- IME がノードを予測不能に削除・追加・移動する

出典:
- https://blog.open-xchange.com/resources/ox-techblog/article/android-chrome-and-composition-events/
- https://github.com/ianstormtaylor/slate/issues/4400
- https://github.com/ProseMirror/prosemirror/issues/784
- https://github.com/facebook/react/issues/8683

### 5-2. ソフトキーボードと Visual Viewport

Chrome 108 以降の Android は、ソフトキーボードが出たとき
**Layout Viewport をリサイズせず Visual Viewport だけを縮める**。
編集中の欄がキーボードに隠れうる。ブラウザ自身の
「入力欄をスクロールして見せる」挙動はあるが、端のケースで外す。

対策は既存の `acPosition()`（`files/index.html:1903`）と同じ計算。
`visualViewport.offsetTop / height` から可視領域を出し、編集バーをその上端に固定する。

viewport meta の `interactive-widget`（`files/index.html:5`）には触れない。
アプリ全体の viewport 挙動を変えると配置編集タブの盤の操作に波及する。

出典:
- https://developer.chrome.com/blog/viewport-resize-behavior
- https://developer.mozilla.org/en-US/docs/Web/API/VirtualKeyboard_API

### 5-3. CSS `zoom` とキャレット

`.sheet` の `zoom` 配下でキャレットの位置がずれる報告は、
**イベントハンドラが自前でキャレット位置を計算していた場合**のもの。
ブラウザ任せにすれば起きない。この設計ではキャレット位置を自分で計算しない。

`getBoundingClientRect()` はズーム込み、`offsetHeight` / `clientHeight` は素の CSS px、
という非対称は残る。`fitSheetText()` は既に `getComputedStyle(sheet).zoom` で割っている
（`files/index.html:4725`）。

スマホの編集バーは `.sheet` の外（`zoom` の外）に置くので、
バーの位置決めに `zoom` の補正が要らない。PC の in-place は `<td>` の中に入れるだけで
座標を計算しないので、こちらも補正が要らない。**新しく `zoom` を跨ぐ測定を足さない。**

出典:
- https://chromestatus.com/feature/5198254868529152
- https://github.com/Ocean-Industries-Concept-Lab/openbridge-webcomponents/pull/1239

### 5-4. 表示倍率は1倍を下回らない

`autoSheetZoom()`（`files/index.html:4385`）は `Math.max(1, ...)` を返す。
画面が狭くても `.sheet` が縮むことはなく、横スクロールになる。

実機 Pixel 9a（幅 412 CSS px）では zoom は 1 のまま、表（normal で 672px）は横スクロール。
欄の実効フォントサイズは指定どおり（品名 16px / ロット 13px / P数 16px / 注釈 13px、
`files/index.html:422-423`）。

中断記録は「auto のときは画面幅に応じて 1 未満になる」と書いていたが誤り。

### 5-5. `transform: scale()` を掛けた要素のキャレット

スケールを掛けた編集可能要素でキャレットが描画されない問題がある。
PC の in-place では編集中に `transform: none` を当てて圧縮を外すので該当しない（§3-9）。
スマホの編集バーは `.sheet` の外なので `scaleX()` が掛からない。

出典:
- https://bugzilla.mozilla.org/show_bug.cgi?id=1529492
- https://bugs.webkit.org/show_bug.cgi?id=19058

### 5-6. 非表示タブでは測れない

配置図タブが `display:none` の間は `getBoundingClientRect()` が 0 を返す。
`fitSheetText()` は `avail<=0` で早期 return する（`files/index.html:4734`）。

編集モードは配置図タブの中だけの機能で、タブが表示されている間しか触れない。
新たに測る処理も足さない。既存の `switchTab('sheet')` が
「表は表示されて初めて幅が測れる」ために `renderSheet()` を呼び直す仕組み
（`files/index.html:2622`）はそのまま働く。

### 5-7. 幅で出し分ける2面

非表示側の要素に `focus()` を呼んでも何も起きない（例外も投げない。
`document.activeElement` は `<body>` のまま）。2026-08-27 の教訓。

対策は §3-9 のとおり、編集を始める時点で片方だけを作ること。
編集中にウィンドウ幅が境（600px）を跨いだ場合は、開いている入力を確定してから
方式を切り替える。

### 5-8. PWA キャッシュ

`files/sw.js` は cache-first。`CACHE_VERSION`（現在 `"v55"`、`files/sw.js:6`）を上げないと
インストール済みの端末に更新が届かない。実装の最後に上げる。

ただし LAN 経由（`http://<IP>:8765`）は secure context ではないため
Service Worker が登録されない。**実機テストでは `CACHE_VERSION` を上げた効果は検証できない**
（2026-09-16 の教訓）。

---

## 6. 高さ予算と入力欄の幅（実測・2026-09-19）

測定環境: サンプル `SAMPLES.basic`（伝票9枚）、様式 normal、表示倍率 auto（= 1倍）、
表示設定は既定値、PC のブラウザ。`files/index.html` の現行コードの DOM を直接書き換えて
`fitSheetText()` を呼び、`table` の高さを `zoom` で割って測った。

### 6-1. 予算

```
限界     = PRINT_H_PX 733.2 × 0.98 ÷ PRINT_ZOOM 1.4 = 画面上 513.2px
この日の表 = 468.1px（用紙の 89.4%）
余裕     = 45.1px
```

サンプルは荷物9件でこの値。荷物が多い日は表そのものが高いので余裕はさらに減る。

### 6-2. 1欄の文字を増やしたときの伸び

欄の幅は 95px（normal、48px × 2列 − padding）。
`FIT_MIN_SCALE 0.4` を割ると折り返して行が増える。

| 欄 | 文字サイズ | 折り返さない | 2行になる | 3行になる |
|---|---|---|---|---|
| 上段 品名 | 16px | 〜14文字（+0） | 15〜28文字（**+10.4px**） | 29文字〜（**+29.6px**） |
| 上段 ロット | 13px | 〜16文字（+0） | 17〜35文字（**+6.7px**） | 36文字〜（**+22.3px**） |
| 注釈（空欄が基準） | 13px | 〜19文字（+2.1px） | 20文字〜（**+17.7px**） | 未測定 |

注釈の「+2.1px」は、空欄の `td.none{height:16px}` に1行ぶんの文字が入ったことによる伸び。

### 6-3. 入力欄の幅

`<td>` に `width:100%; box-sizing:border-box` の `<input>` を入れて実測した。

```
td の内幅       = 95px
input の内幅    = 91px
全角1文字（16px）= 16px
→ 見えるのは 5.6 文字
```

`.sheet table` は `table-layout: fixed` の 672px 固定（`files/index.html:437`）なので、
入力欄を広げても列は広がらない。注釈（13px）でも 7 文字。

§6-2 の「〜14文字」は `scaleX()` で潰した後の値であって、等倍の入力欄で見える量ではない。
この差が §3-9 でスマホを編集バー方式にした理由。

入力欄を入れると、その行の高さが一時的に +12px 増える（`input` の border と line-height）。
編集中だけなので印刷には影響しない。

### 6-4. 縦積み（`<textarea>` で行を増やしたとき）

上段のロット欄を `.fitcol` にして行数を変えた。

| 行数 | 基準からの伸び |
|---|---|
| 1行 | +0 |
| 2行 | +6.7px |
| 3行 | +22.3px |
| 4行 | +37.9px |
| 5行 | **+53.5px**（余裕 45.1px を超える） |
| 6行 | +69.1px |

2行目以降は **+15.6px/行**（13px × line-height 1.2）。

### 6-5. 読み方

- 縦積みは**4行まで**が余裕内。5行で用紙をはみ出す
- **行は独立して足し算になる。** 上段品名で2行増（+29.6）と注釈で1行増（+17.7）が重なると
  +47.3px となり、余裕 45.1px を超える
- この数字は上限ではなく、`#sheetMsg` に
  「表が縦に伸びて印刷が1ページに収まりません」が出る目安

### 6-6. 未測定

追記欄のまとめ欄（`.roll`、`font-size:55%`、`files/index.html:515`）は
サンプルでは追記欄が出ないため未測定。伸び量と、編集中に font-size を 13px へ上げたときの
見え方の両方を §7 の検証タスクで測る。
既存の実測では、この指定を当てた状態で5件までは1ページに収まる（2026-09-18 の教訓）。

---

## 7. テスト

### 7-1. 自動テスト

`tests/sheet-placement.test.js` に足す。DOM を使わない純粋な関数に切り出して検証する。

- キーの組み立て（`top|2|name` / `top|g1|head` / `over|0|pallet`）
- 署名の組み立てと一致判定
  - 伝票の `status` だけが変わっても署名が変わらない
  - 伝票の `lot` が変われば署名が変わる
  - 配置（`sp`）が変われば署名が変わる
  - **掲載先（エリアの `sheet`）が変われば署名が変わる**
  - まとめ設定・端数表示が変われば署名が変わる
  - 文字サイズ・矢印・角の丸みが変わっても署名は変わらない
- 書き足しの差し込み
  - 署名が一致すれば `marks` の値が自動計算の値より優先される
  - 署名が一致しなければ自動計算の値が出る
  - 空欄にも書き足しが差し込める
  - **あさで書いた `marks` がひるの紙に出ない**
  - 改行を含む値が `.fitcol` に組み立てられる
- 確定時の正規化
  - 空文字・空白だけ・改行だけでキーが消える
  - 前後の空白が trim される
  - trim した結果が自動計算の値と同じならキーが消える
- `normalizeShift()` が壊れた `sheetEdits` を `{sig:"", marks:{}}` に落とす

**既存テストの呼び出し側も直す。** `slotCells` / `overflowTable` に引数を足すので、
`tests/sheet-placement.test.js` と `tests/stash-overflow.test.js` の
`new Function(依存名..., src)` の呼び出しを揃える（§2-7）。

### 7-2. ブラウザでの確認（PC）

- 編集モード ON で欄をタップするとセル内が入力欄に変わり、圧縮が外れて等倍になる
- `blur` で確定し、紙の表示に反映される
- Escape で元に戻る
- 確定しても横スクロール位置が保たれる
- 表示設定を触っても §3-7 の案内が消えない
- 印刷プレビューに入力欄の枠と編集済みの背景色が出ない
- Ctrl/Cmd+P でも編集モードが OFF になる
- 署名が変わると紙から消え、`#sheetMsg` に件数が出る
- 署名が合わない状態で編集すると §3-4 の confirm が出る。設定を ON にすると出ない
- **掲載先を変えたときに書き足しが紙から消える**（署名の材料が効いているかの確認）
- 追記欄を出す日を作り、まとめ欄（`font-size:55%`）を編集できるか、
  行を増やしたとき何px伸びるかを測る（§6-6）

### 7-3. 実機での確認（Pixel 9a / Android Chrome）

手順は実行計画に書く。最低限、次を含めること（2026-09-16 の教訓）。

- Mac の LAN IP を調べる（`ipconfig getifaddr en0`）
- `python3 -m http.server 8765 --directory files` を起動し、スマホから `http://<IP>:8765` を開く
- Mac とスマホが同じ Wi-Fi にいること。macOS のファイアウォールが有効だと初回に許可ダイアログが出る
- LAN 経由は secure context ではないので Service Worker は登録されない。
  `CACHE_VERSION` の効果はここでは確認できない
- データ投入は不要。`initLots()` が保存済みデータが無いとサンプルを自動で読む

確認する内容:

- 欄をタップすると編集バーが出て、その欄がハイライトされる
- ソフトキーボードが出てもバーが隠れない
- 日本語を変換して確定しても、変換確定の Enter で欄が閉じない
- 「取り消し」で元に戻る
- 確定しても横スクロール位置が保たれる
- 「🖨 印刷」から印刷するとき、編集モードが OFF になり紙に入力欄の枠が出ない

---

## 8. 中断記録との食い違い

`docs/superpowers/specs/2026-09-19-sheet-text-edit-notes.md` から変えた点。

| 項目 | 中断記録 | この設計書 | 理由 |
|---|---|---|---|
| 表示倍率 | auto は画面幅に応じて1未満になる | 1倍を下回らない | `autoSheetZoom()` が `Math.max(1,...)`（§5-4）。中断記録の記述は誤り |
| 欄のキー | ロットID集合（`top\|3,7\|name`） | 位置（`top\|2\|name`） | 署名が配置・掲載先・まとめ設定・端数表示・様式を含むので、署名が一致する間は並びが変わらない。位置キーなら空欄にも書ける（§3-3） |
| 見出しの編集 | 未決 | 含める。`top\|g<n>\|head` | 2026-09-19 ユーザー判断 |
| 破棄の引き金 | 3つを別々に仕掛け、破棄前に確認する | 署名1本。合わなければ表示を止める | 荷物を1マス動かすたびに確認ダイアログが出るのを避ける（§3-2） |
| 署名不一致中の編集 | 記述なし | 最初の確定で古い分を捨てる。確認は設定で省ける | `{sig, marks}` を1組しか持たないため（§3-4） |
| 編集の方式 | 全面 in-place swap | スマホは編集バー、PC は in-place | 等倍の入力欄は 5.6 文字しか見えず、Pixel 9a に Escape が無い（§3-9・§6-3） |
| 欄ごとの取り消し | 未決 | 空文字または自動計算値と同値で確定するとキーを削除 | 紙の上に×ボタンを増やさない（§3-10） |
| 縦積みの欄 | 未決 | `<textarea>` で行ごと編集 | 1行に畳むと圧縮下限を割って折り返し、高さが変わる（§3-9） |
| `fitSheetText()` の掛け直し | 未決 | `renderSheet()` を丸ごと呼び直す。`scrollLeft` と編集中の入力を後始末する | 末尾で `fitSheetText()` まで走る。ただし `.sheet` ごと作り直すので副作用がある（§3-11） |
| 印刷 | 未決 | `printSheet()` と `beforeprint` の両方で編集モードを OFF | Ctrl/Cmd+P は `printSheet()` を通らない（§3-13） |
| あふれ対策 | 未決 | 上限を設けず既存の案内に任せる。書き足し由来のときだけ文言を足す | 上限の根拠が欄幅・文字サイズ・様式で変わり固定値にできない（§3-14） |
