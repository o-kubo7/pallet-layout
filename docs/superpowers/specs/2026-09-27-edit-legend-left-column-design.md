# 配置編集: 品目リストを盤の横に縦1列で常時表示する（左・上・右の切り替え付き） 設計書

作成日: 2026-09-27（2026-09-28 改訂: /dig の指摘とモックアップでの確認を反映）

## 1. 目的

配置編集タブで、盤の上にある品目リスト（`#legend`）を確認するたびに上までスクロールしている。
PC 幅では品目リストを盤の横（既定は左）に縦1列で置き、スクロールしても見える状態にして、この往復をなくす。
位置は表示設定で「左・上・右」から選べる。
あわせて、品目リストの1件の見せ方を改める（パレット数を太字にし、製品に「製」の印を付ける）。

## 2. 想定する使用環境

- 職場の PC: 13.3 インチのノート PC、Windows、画面 1366×768（拡大率 100% と想定）。
  - ブラウザで使える幅は約 1366px。スクロールバー（約 17px）を除いた表示幅は約 1349px。
  - 高さは、タスクバーとブラウザ上部を除いて約 620px。
- 実機のスマホ: Pixel 9a（Android Chrome、412px 幅）。見た目は今のまま（「製」の印と太字だけが加わる）。
- 開発・テスト用のモニタ（私物）は職場の PC より大きい。確認は職場 PC の大きさ（1349×620）を基準にする。

## 3. 決定事項

| 項目 | 決定 |
| --- | --- |
| 対象画面幅 | 1280px 以上で列にする。1280px 未満は今のまま盤の上に出す |
| 並べ方 | 縦1列 |
| 1件の見せ方 | 1行に入る品目は1行（「品名 / ロット　**パレット数**」）。入りきらない品目だけ2行にする（1行目＝品名、2行目＝ロット・パレット数。2行目の前の「/」は出さない）。2行でも品名が入りきらないときは、品名だけを「…」で省略する（文字を縮める「圧縮」はしない） |
| 品名の最小幅 | 4文字を超える品名は、全角約4文字（4em）を必ず残す |
| パレット数 | すべての画面幅・位置で太字にする |
| 製品の印 | 製品だけ、番号の枠の左上に「製」の小さな四角を重ねる。充填品には付けない。すべての画面幅・位置で付ける。表示設定で表示／非表示を切り替えられる（既定は表示） |
| 盤の列の幅 | 盤の中身ちょうどの幅。今ある右側の空き（約 244px）を削り、凡例の列へ回す |
| 凡例の列の幅 | 中身に合わせる。狭いときは、1件ずつ2行化・品名の省略で縮み、最小は「一番長いロット・パレット数」が入る幅（`min-width:min-content`） |
| ページ幅 | 凡例の列が出ているときだけ `.wrap` の最大幅を 1240px → 1552px（+312px）に広げる |
| 退避スペース（右上・左上） | 位置はそのまま。盤の横に並ぶので、倉庫外の盤がその分狭くなる。マス「中」では職場 PC で横スクロールは出ない。マス「小」「大」と、退避スペースを広げた状態で倉庫外に横スクロールが出ることは受け入れる（気になるときは退避スペースを「下」にする）。スクロールすると退避スペースが盤の右上に重なることも受け入れる |
| 位置の切り替え | 表示設定に「品目リストの位置　左／上／右」を足す。既定は左。「上」は今の見た目で、ページ幅も広げない。1280px 未満ではこの行を出さない（保存した値は残り、PC で開けば効く） |
| 設定の保存 | 位置は `palletApp.legendPos`、製品の印は `palletApp.legendMark`（`palletApp.stashPos` と同じ仕組み） |

## 4. 実測（2026-09-27〜28、デモ100P、マス「中」）

### 4-1. 今の画面

- 1366px 幅: `#mapBody` の幅は 1174px。盤の中身は、倉庫内 `#zone-near` が 904px で最大、倉庫外 `#zone-far` が 648px。
- 凡例1件の幅は 191〜266px。

### 4-2. モックアップ（`.superpowers/legend-mockup/`、長い品名入りのデータ）

| 画面 | 凡例の列 | 盤の列 | 倉庫内の横スクロール | 2行になった品目 | 「…」になった品名 |
| --- | --- | --- | --- | --- | --- |
| 1349×620（職場 PC） | 326px | 930px | なし | 10件中7件 | 1件 |
| 1263×580（参考: 13.3インチ・拡大率150%相当） | 240px | 930px | なし | 10件 | 7件 |

職場 PC の大きさで、退避スペースが倉庫外を狭める影響を測った結果（倉庫外の表示幅／中身）:

| マス・状態 | 変更後 | 変更前 |
| --- | --- | --- |
| 中 | 669/648（横スクロールなし） | なし |
| 小 | 449/476（あり） | なし |
| 大 | 767/864（あり） | なし（倉庫内は今もあり） |
| 退避スペースを広げた状態 | 389/648（あり） | 今も少しあり |

### 4-3. 試作で見つかった落とし穴

1. **盤の下の文章が盤の列を広げる。** 盤の列を「中身ちょうど」にすると、930px ではなく 1057px になった。原因は `#mapBody` の中の文章要素（`.note`・`#summary`・`.stashlead`・`#stashBar`）で、折り返さない1行の長さを幅として要求していた。これらに `contain:inline-size` を付けると 930px になる。
2. **1行で省略する品名に「最小幅」を付けても効かない。** `white-space:nowrap` の品名は、最小の幅として品名全体の長さを要求するため、凡例の列が 513px まで広がった。品名を折り返し可能にしたうえで `-webkit-line-clamp:1` で1行に切り詰めると、最小幅（4em）が効く。
3. **「/」を2行目に出さない方法。** 2行になったかどうかは CSS だけでは判定できない。そこで「/」を 1em 幅の箱に入れ、ロット側（`.lg-rest`）を `margin-left:-1em` で左へずらし、入れ物（`.lg-body`）を `overflow:hidden` にする。1行のときは「/」が品名との間に収まり、2行目の先頭に来たときは「/」が入れ物の外へはみ出して見えなくなる。JS の判定は要らない。
4. **「製」の印が切れる。** 凡例の列は `overflow-y:auto` なので、一番上の品目の印（上へ 8px はみ出す）が切れる。列の上に 7px の余白を足す。
5. **境目 1024px では品名が消える。** 1024〜約1250px では、凡例の列が最小まで縮んでも盤が収まらず、盤が横スクロールになり、品名の幅が 0px になった。境目を 1280px に上げた。

## 5. 構造

### 5-1. HTML と凡例の移動

HTML では `#legend` を今の位置（`#mapBody` の中、`#toolFlag` の次）に残し、`#mapBody` だけを新しい外枠で囲む。

```html
<div class="editlayout lg-left" id="editLayout">
  <div id="mapBody"> …（中身は今のまま。#legend・#stashDock・#toolFlag もここ）… </div>
</div>
```

- PC 幅（1280px 以上）で位置が左/右のときだけ、`syncLegendSide()` が `#legend` を `#editLayout` の直下（`#mapBody` の前）へ移す。
- それ以外のとき（1280px 未満、または「上」）は、`#mapBody` の中の元の位置（`#toolFlag` の直後）へ戻す。
- 画面幅が 1280px をまたいだときは、`matchMedia("(min-width:1280px)")` の change で `syncLegendSide()` を呼び直す。
- HTML の段階で `#legend` を外へ出さないのは、スマホの見た目を変えないため。今のスマホでは、凡例は `#mapBody` の中で退避スペース（float）の横に並んでいる。外へ出すと退避スペースの上に全幅で出てしまう。
- `#legend` の中身は `renderResult()` が id で描き直すので、要素を移しても描画には影響しない。

### 5-2. 凡例1件の HTML

```html
<span>
  <span class="swframe"><i class="swatch" style="background:…">2</i><i class="lg-mk">製</i></span>
  <span class="lg-body">
    <span class="lg-name">製品B</span>
    <span class="lg-rest"><span class="lg-sep">/</span>2222-0002　<b>6P</b></span>
  </span>
</span>
```

- `.lg-mk` は製品（`l.type==="製品"`）のときだけ出す。
- 4文字を超える品名には `.lg-name` に `lg-long` を足す（最小幅 4em を付ける対象。短い品名の後ろが空きすぎるのを防ぐ）。
- 複数件をまとめた品目の「（2件）」は、パレット数の太字の外（`</b>` の後ろ）に置く。
- 色マス・外枠（`.swframe` / `.swatch`）の書き方は今のまま。`tests/legend-chip.test.js` が検査している文字列は変えない。

### 5-3. CSS（すべての画面幅）

- `.legend .lg-body` / `.lg-name` / `.lg-rest` / `.lg-sep` は、`.legend span` の背景・余白・`inline-flex` を打ち消して `display:inline` にする。こうすると、1280px 未満と「上」では今と同じ1行の見た目になる。
- `.legend .lg-sep` の後ろに 0.25em の間を空ける（今の「 / 」と同じ見た目にする）。
- `.legend .lg-rest b` は太字（`font-weight:800`）。
- `.legend .swframe` に `position:relative`。`.legend .lg-mk` は `position:absolute;top:-8px;left:-8px`、17px 角、白地、1.5px の黒枠、角丸 3px、11px の太字。
- `.legend.no-mk .lg-mk{display:none}`（製品の印を非表示にする設定）。
- `.legend[hidden]{display:none}`（`.legend{display:flex}` が UA の `[hidden]` に勝つため）。

### 5-4. CSS（1280px 以上・左/右のときだけ）

```css
@media (min-width:1280px){
  .editlayout.lg-left,.editlayout.lg-right{display:flex;gap:12px;align-items:flex-start}
  .editlayout.lg-right{flex-direction:row-reverse;justify-content:flex-end}
  /* 凡例の列。先に縮む（flex-shrink を大きく） */
  #legend（列のとき）{flex:0 1000 auto;min-width:min-content;margin:0;padding-top:7px;
    flex-direction:column;flex-wrap:nowrap;align-items:flex-start;
    position:sticky;top:var(--docktop,56px);max-height:calc(100vh - var(--docktop,56px) - 16px);overflow-y:auto}
  #legend（列のとき）:empty{display:none}
  #legend（列のとき）>span{max-width:100%}
  .lg-body{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:calc(1em + 2px);row-gap:0;
    min-width:0;flex:0 1 auto;line-height:1.35;overflow:hidden}
  .lg-name{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;
    word-break:break-all;flex:0 1 auto}
  .lg-name.lg-long{min-width:4em}
  .lg-rest{margin-left:-1em;white-space:nowrap}
  .lg-sep{display:inline-block;width:1em;margin:0;text-align:center}
  /* 盤の列。中身ちょうどの幅 */
  #mapBody（列のとき）{flex:0 1 auto;min-width:0}
  /* 文章の要素は幅の計算に加えない（4-3 の1） */
  #mapBody .note,#mapBody #summary,#mapBody .stashlead,#mapBody #stashBar{contain:inline-size}
  .wrap.legend-side{max-width:1552px}
}
@media (max-width:1279px){ #legendCtl{display:none} }
```

実際のセレクタは `.editlayout.lg-left>#legend,.editlayout.lg-right>#legend` のように書く（上の「（列のとき）」はその略記）。値と書き方は実装時に既存の CSS の書き方（1行に詰める形）に合わせる。

### 5-5. 凡例の列を出す条件（`syncLegendSide()`）

凡例の移動と表示の判定を1つの関数にまとめる。PC 幅で左/右のときは凡例が `#mapBody` の外にあり、盤と一緒に自動では消えないため。

- 列にする条件: `matchMedia("(min-width:1280px)")` が一致し、かつ `legendPos` が `top` 以外。
- `#legend.hidden` は、`#mapBody` を隠している間 true にする。
- `.wrap` の `legend-side` クラスは、列にしていて、盤を表示中で、配置編集タブを開いていて、凡例に中身があるときだけ付ける（ページ幅の拡大が配置編集タブ以外に漏れないように）。
- 呼ぶ場所:
  - `switchTab()`
  - `showMapState()`: `#mapBody` の表示を切り替えた直後。続けて `syncFlagRect()` も呼ぶ。`renderResult()` は最後に `showMapState()` を通るので、凡例の幅が変わったときもここで追いつく
  - `run()`: 品目が0件で `#mapBody` を表示する分岐
  - `setLegendPos()`
  - `matchMedia("(min-width:1280px)")` の change

### 5-6. 帯（`#toolFlag`）

帯は `position:fixed` で `#editCard` の左端から始まる。凡例の列も sticky でタブ列の直下にあるため、そのままだと重なる。

- `syncFlagRect()` に、凡例が列になっているとき（`#legend` の親が `#editLayout` で、実測幅 > 0）の処理を足す。
  - 左: 帯の左端を「凡例の右端 + 16px」にし、その分だけ幅を減らす。
  - 右: 帯の幅の上限を「凡例の左端 − 16px − 帯の左端」にする。
- この処理は、今ある退避スペースを避ける処理より前に入れる。左上の退避スペースは、凡例を避けた後の左端から、さらに避ける。
- マスの大きさを変えると盤と凡例の幅が変わるので、`setCellSize()` の最後にも `syncFlagRect()` を呼ぶ（/dig の指摘。今は呼んでおらず、「大」→「中」で帯が凡例に約 53px 重なる）。

### 5-7. 表示設定の追加

表示設定（`#editCfg`）の `#dockCtl`（退避スペースの位置）の次に、同じ形の行を2つ足す。

```html
<div class="sizectl" id="legendCtl">
  <span class="grp"><span class="lbl">品目リストの位置</span>
    <button class="sizebtn on" id="legendLBtn" onclick="setLegendPos('left')">左</button>
    <button class="sizebtn" id="legendTBtn" onclick="setLegendPos('top')">上</button>
    <button class="sizebtn" id="legendRBtn" onclick="setLegendPos('right')">右</button>
  </span>
</div>
<div class="sizectl" id="markCtl">
  <span class="grp"><span class="lbl">製品の印</span>
    <button class="sizebtn on" id="markOnBtn" onclick="setLegendMark(true)">表示</button>
    <button class="sizebtn" id="markOffBtn" onclick="setLegendMark(false)">非表示</button>
  </span>
</div>
```

- `setLegendPos(v)` は `setDockPos()` と同じ流れにする。
  1. 値を `left` / `top` / `right` に正規化する（それ以外は `left`）。
  2. `#editLayout` に `lg-left` / `lg-top` / `lg-right` のどれか1つを付ける。
  3. ボタンの `on` を付け替える。
  4. `saveData("palletApp.legendPos", legendPos)` で保存する。
  5. `syncLegendSide()` → `syncFlagRect()` の順に呼ぶ。
- `setLegendMark(on)` は `#legend` の `no-mk` を付け外しし、ボタンの `on` を付け替え、`saveData("palletApp.legendMark", on)` で保存する。印は幅を取らない（位置は absolute）ので、帯の測り直しは要らない。
- 初期化: `initDockPrefs()` の中で、次の3つを行う。
  - `setLegendPos(loadData("palletApp.legendPos") || "left")`
  - `setLegendMark(loadData("palletApp.legendMark") !== false)`（未保存なら表示）
  - `matchMedia` の change の登録
- `#markCtl` は、すべての画面幅で出す（印はスマホでも付くため）。

## 6. 技術制約

- `display:flex` の子への `position:sticky`、`flex-wrap`、`min-width:min-content`、`text-overflow` / `-webkit-line-clamp`、`max-height` + `overflow-y:auto`、`position:absolute` の重ね表示は、いずれも Chrome / Edge / Brave / Safari / Firefox の現行版で使える。`-webkit-line-clamp` は接頭辞付きのまま全主要ブラウザが対応している。
- `contain:inline-size` は Chrome/Edge 105+ / Safari 15.4+ / Firefox 101+ で使える。
- `matchMedia().addEventListener("change")` は Chrome 45+ / Safari 14+ で使える。
- ブラウザ・OS・デバイスの権限を要する API は使わない。ストレージは localStorage のキーを2つ（`palletApp.legendPos`、`palletApp.legendMark`。値は数バイト）足すだけ。読み書きは既存の `saveData()` / `loadData()` を使い、保存できない環境では既定値（左・印を表示）で動く。
- Pixel 9a（412px 幅）は 1280px 未満の分岐に入る。変わるのは、パレット数の太字と「製」の印だけ。
- `100vh` を使うのは 1280px 以上だけ。モバイルのアドレスバーの伸び縮み（2026-09-20 の教訓）の影響は受けない。
- Windows ではスクロールバーが約 17px の幅を取る。職場 PC（1366px）での表示幅は約 1349px で、境目 1280px を上回る。
- `files/index.html` を変更するので、`files/sw.js` の `CACHE_VERSION` を上げる（今は v76）。

### 過去の教訓の反映（`~/claude-lessons/lessons.md`）

- 2026-08-23「非表示タブでは `getBoundingClientRect()` が 0 を返す」: `syncFlagRect()` では、凡例の幅が 0 のとき避ける処理をしない。配置編集タブへ移った直後は、`switchTab()` の `syncFlagRect()` 呼び出しで測り直す。
- 2026-09-21「寸法ばかり測り、機能が動く最初の1回を試していなかった」: 検証では、凡例の列がある状態で、マスの選択・退避スペースへのドラッグ・帯の戻す／進むを実際に操作する。
- 2026-08-31「検証の『結果が無い状態』が作れない」: 入力を変えて `#mapBody` が隠れる状態（入力と配置のずれ）を作り、凡例の列が残らないことを確かめる。
- 2026-09-16「実機テストの手順を渡していなかった」: 職場 PC での確認手順（開く URL・見る所・画面の大きさ）を、完了時に具体的に示す。

## 7. 範囲外

- 凡例をクリックして該当ロットを強調する等の新しい操作は入れない。
- 1280px 未満で位置を切り替える機能は作らない（常に上）。
- 配置図タブ・印刷は変えない（凡例は配置編集タブだけの要素）。
- 退避スペースを凡例の列に統合する案、盤の上に浮かせる案は採らない。
- 盤のマスには「製」の印を付けない。

## 8. テスト

### 8-1. 自動テスト（`node --test tests/*.test.js`、既存と同じくソース文字列の検査）

`tests/edit-legend-column.test.js` を新設する。

1. `#editLayout` が `#mapBody` を囲み、`#legend` は HTML 上は `#mapBody` の中（`#toolFlag` の後ろ）にある。
2. 凡例1件が `.lg-body` / `.lg-name` / `.lg-rest` / `.lg-sep` の構造で、パレット数が `<b>` で囲まれ、製品だけ `.lg-mk` が出る。
3. すべての画面幅で、新しい span が `.legend span` の見た目を打ち消している。
4. `@media (min-width:1280px)` の中に、2列の flex、凡例の sticky、`-webkit-line-clamp:1`、`.lg-rest` の `margin-left:-1em`、`contain:inline-size`、`.wrap.legend-side` がある。
5. `syncLegendSide` が凡例を移し、`switchTab` / `showMapState` / `run` から呼ばれている。
6. `syncFlagRect` が凡例を避け、`setCellSize` が `syncFlagRect` を呼ぶ。
7. 表示設定に位置（左／上／右）と製品の印（表示／非表示）のボタンがあり、それぞれ保存している。右で `row-reverse` になり、1280px 未満で位置の行が隠れる。

### 8-2. ブラウザでの実測（長い品名入りのデータ）

画面の大きさは職場 PC（1349×620）を基準にする。

- 1349×620・マス「中」: 次を確かめる。
  - 凡例の列が約 326px、盤の列が約 930px。倉庫内・倉庫外とも横スクロールなし。
  - 入りきらない品目だけ2行になり、2行目に「/」が出ない。1行の品目には「/」が出る。
  - パレット数が太字。製品だけ番号の左上に「製」が出て、一番上の品目でも切れない。
  - 下へスクロールしても凡例の列が残る。帯が凡例に重ならない。
- 1349×620・マス「大」→「中」: 帯が凡例に重ならない（`setCellSize()` の測り直し）。
- 1279px 幅と 412px 幅: 凡例が盤の上に横並びで出る。変更前との違いは、パレット数の太字と「製」の印だけ。
- 退避スペース 右上・左上・下 の各設定で、マスの選択・退避スペースへのドラッグ・帯の戻す／進むが今までどおり動く。
- 入力を変えて配置が古くなった状態: 凡例の列が消え、ページ幅が 1240px に戻る。
- 位置の切り替え: 左・上・右のそれぞれで、凡例の位置とページ幅（左右は拡大、上は 1240px）が正しい。帯が凡例に重ならない。再読み込みしても選んだ位置が残る。
- 製品の印の切り替え: 非表示にすると全画面幅で印が消え、再読み込み後も非表示のまま。
