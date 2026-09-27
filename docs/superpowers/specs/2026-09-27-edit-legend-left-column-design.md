# 配置編集: 品目リストを盤の横に縦1列で常時表示する（左・上・右の切り替え付き） 設計書

作成日: 2026-09-27

## 1. 目的

配置編集タブで、盤の上にある品目リスト（`#legend`）を確認するたびに上までスクロールしている。
PC幅では品目リストを盤の横（既定は左）に縦1列で置き、スクロールしても見える状態にして、この往復をなくす。
位置は表示設定で「左・上・右」から選べる。

## 2. 決定事項

ユーザーとの確認で決めた内容。

| 項目 | 決定 |
| --- | --- |
| 対象画面幅 | 1024px 以上で左列にする。1024px 未満（スマホ・タブレット縦）は今のまま盤の上に出す |
| 並べ方 | 縦1列。1品目1行 |
| 列の幅 | 一番長い1行に合わせる。入りきらないときは品名だけを「…」で省略する（番号・ロット・パレット数は必ず見える） |
| 盤の列の幅 | 盤の中身ちょうどの幅。今ある右側の空き（1366px幅・マス「中」で約244px）を削り、凡例の列へ回す |
| ページ幅 | 凡例の列が出ているときだけ `.wrap` の最大幅を 1240px → 1552px（+312px）へ広げる。画面が狭ければ凡例の列が先に縮み、次に盤が縮む（盤は今と同じ横スクロール） |
| 退避スペース（右上） | 位置は今のまま。スクロールすると盤の右上に重なることを受け入れる（倉庫外は倉庫内より幅が狭く、右側が空いているため実害は少ない） |
| 退避スペース（左上） | 左から「凡例の列 → 退避スペース → 盤」の順に並ぶ |
| 位置の切り替え | 表示設定に「品目リストの位置　左／上／右」を足す。既定は左。「上」は今の見た目（盤の上に横並び、ページ幅も広げない） |
| 切り替えの保存 | `palletApp.legendPos` に保存する（`palletApp.stashPos` と同じ仕組み） |
| 1024px 未満のボタン | 出さない（効かないため）。保存した値は残り、PC で開けば効く |

## 3. 実測（2026-09-27、デモ100P、マス「中」）

- 1366px 幅: `#mapBody` 1174px。盤の中身は倉庫内 `#zone-near` が 904px で最大、倉庫外 `#zone-far` は 648px。
- 凡例1件の幅は 191〜266px。縦に並べると1件約38px、10件で約380px。
- 試作（DOM を一時的に組み替えて測定、コードは未変更）: 1500px 幅で凡例の列 266px、盤の列 930px（盤の中身 904px ＋ `.floor` の padding・枠）となり、盤の右の空きが消えることを確認した。

### 試作で見つかった落とし穴

盤の列を「中身ちょうど」にすると、最初は 930px ではなく 1057px になった。
原因は盤のマスではなく、`#mapBody` の中にある文章の要素だった。
`.note`・`#summary`・`.stashlead`・`#stashBar` は、折り返さない1行の長さを幅として要求するため、
盤の列が文章に合わせて広がっていた。
これらに `contain:inline-size` を付けて幅の計算から外すと 930px になった
（文章は盤の幅で折り返し、`#summary` の高さは 22px で1行のまま）。

## 4. 構造

### 4-1. HTML

`#legend` を `#mapBody` の外に出し、新しい外枠で2つを囲む。

```html
<div class="editlayout" id="editLayout">
  <div id="legend" class="legend"></div>
  <div id="mapBody"> …（中身は今のまま。#stashDock・#toolFlag もここに残す）… </div>
</div>
```

- `#stashDock` と `#toolFlag` は `#mapBody` の中に残す。退避スペースの float・sticky・ドラッグ先の判定、帯の仕組みは変えない。
- 1024px 未満では `.editlayout` はふつうのブロックで、凡例は今と同じく盤の上に出る。

### 4-2. CSS（1024px 以上だけ）

```css
@media (min-width:1024px){
  .editlayout{display:flex;gap:12px;align-items:flex-start}
  /* 凡例の列。先に縮む（flex-shrink を大きく）。200px までは縮める */
  #legend{flex:0 1000 auto;min-width:200px;flex-direction:column;flex-wrap:nowrap;margin:0;
          position:sticky;top:var(--docktop,56px);
          max-height:calc(100vh - var(--docktop,56px) - 16px);overflow-y:auto}
  #legend > span{white-space:nowrap}
  #legend .lg-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
  /* 盤の列。中身ちょうどの幅。凡例が 200px まで縮んでも足りなければ盤も縮む */
  #mapBody{flex:0 1 auto;min-width:0}
  /* 文章の要素は幅の計算に加えない（3章の落とし穴） */
  #mapBody .note,#mapBody #summary,#mapBody .stashlead,#mapBody #stashBar{contain:inline-size}
  .wrap.legend-side{max-width:1552px}
}
```

値と書き方は実装時に既存の CSS の書き方（1行に詰める形）に合わせる。

### 4-3. 凡例1件の中身

品名だけを省略できるように、品名を `<span class="lg-name">` で囲む。

```
<span><span class="swframe"><i class="swatch" …>1</i></span><span class="lg-name">製品1</span> / 111　8P</span>
```

- 色マス・外枠（`.swframe` / `.swatch`）は今のまま。`tests/legend-chip.test.js` が検査している文字列は変えない。
- 1024px 未満では `.lg-name` にスタイルが付かないので、見た目は今と同じ。

### 4-4. 凡例の列を出す条件（`syncLegendSide()`）

凡例を `#mapBody` の外に出すので、今のように盤と一緒に自動で消えなくなる。表示の判定を1つの関数にまとめる。

- 凡例の列が「出ている」とは、配置編集タブを開いている かつ `#mapBody` を表示中 のこと。
- `#legend.hidden` は `#mapBody` を隠している間 true にする。`.legend{display:flex}` が UA の `[hidden]{display:none}` に勝ってしまうため、既存の `.editcfg[hidden]` と同じく `.legend[hidden]{display:none}` を足す。
- `.wrap` の `legend-side` クラスは「出ている」ときだけ付ける（ページ幅の拡大が配置編集タブ以外に漏れないように）。
- 呼ぶ場所は次の3つ。
  - `switchTab()`
  - `showMapState()`: `#mapBody` の表示を切り替えた直後
  - `run()`: 品目が0件で `#mapBody` を表示する分岐

### 4-5. 帯（`#toolFlag`）

帯は `position:fixed` で `#editCard` の左端から始まる。凡例の列も sticky でタブ列の直下にあるため、そのままだと凡例の上の数件に重なる。

- `syncFlagRect()` に「凡例の列が見えているとき（1024px 以上、かつ `#legend` の実測幅 > 0）は、帯の左端を凡例の右端 + 16px にし、その分だけ幅を減らす」処理を足す。
- 今ある退避スペース（右上・左上）を避ける処理より前に入れる。左上のときは、凡例を避けた後の左端から、さらに退避スペースを避ける。
- 凡例の幅は配置を作り直すと変わるので、`renderResult()` で凡例を描いた後にも `syncFlagRect()` を呼ぶ。

### 4-6. 位置の切り替え（左・上・右）

HTML: 表示設定（`#editCfg`）の `#dockCtl` の次に、同じ形の行を足す。

```html
<div class="sizectl legendctl" id="legendCtl">
  <span class="grp"><span class="lbl">品目リストの位置</span>
    <button class="sizebtn on" id="legendLBtn" onclick="setLegendPos('left')">左</button>
    <button class="sizebtn" id="legendTBtn" onclick="setLegendPos('top')">上</button>
    <button class="sizebtn" id="legendRBtn" onclick="setLegendPos('right')">右</button>
  </span>
</div>
```

- `#legendCtl` は 1024px 未満では `display:none` にする（`@media (max-width:1023px)`）。
- `setLegendPos(v)` は `setDockPos()` と同じ流れにする。
  1. 値を `left` / `top` / `right` に正規化する（それ以外は `left`）。
  2. `.editlayout` に `lg-left` / `lg-top` / `lg-right` のどれか1つを付ける。
  3. ボタンの `on` を付け替える。
  4. `saveData("palletApp.legendPos", v)` で保存する。
  5. `syncLegendSide()` → `syncFlagRect()` の順に呼ぶ。
- 初期化: `initDockPrefs()` の中で `setLegendPos(loadData("palletApp.legendPos") || "left")` を呼ぶ。

4-2 の CSS は、`.editlayout.lg-left` / `.editlayout.lg-right` のときだけ効くようにする。

- `lg-right` では `.editlayout` に `flex-direction:row-reverse` を付け、並び順だけ入れ替える。sticky・幅・品名の省略・`contain:inline-size` は左右で共通。盤が左に寄るので `justify-content:flex-end` を付けて、盤を左端に揃える（`row-reverse` では主軸の始点が右になるため）。
- `lg-top` では 4-2 の規則が一切効かず、今と同じ見た目になる。

4-4 の「凡例の列が出ている」条件に「`legendPos` が `left` か `right`」を加える。`lg-top` のときは `.wrap.legend-side` を付けないので、ページ幅は 1240px のまま。
4-5 の帯の処理は左右両対応にする。

- 左: 帯の左端を「凡例の右端 + 16px」にする。
- 右: 帯の幅の上限を「凡例の左端 − 16px − 帯の左端」にする。

退避スペース（右上）と「右」を組み合わせると、盤の右端に退避スペース、その右に凡例の列が並ぶ。
帯は、退避スペースを避ける既存の処理と凡例を避ける処理の両方を通り、狭いほうの上限が効く。

## 5. 技術制約

- `display:flex` の子への `position:sticky`、`flex-shrink` による縮む順番、`text-overflow:ellipsis`、`max-height` + `overflow-y:auto` は、いずれも Chrome / Brave / Safari / Firefox の現行版で使える。
- `contain:inline-size` は Chrome 105+ / Safari 15.4+ / Firefox 101+ で使える。対象は PC幅だけ。
- ブラウザ・OS・デバイスの権限を要する API は使わない。ストレージは localStorage のキーを1つ（`palletApp.legendPos`、値は数バイト）足すだけ。読み書きは既存の `saveData()` / `loadData()` を使い、保存できない環境では既定の「左」で動く。
- Pixel 9a（Android Chrome、412px 幅）は 1024px 未満の分岐に入るので、見た目も動作も変わらない。
- `100vh` を使うのは PC幅だけ。モバイルのアドレスバーの伸び縮み（2026-09-20 の教訓）の影響は受けない。
- `files/index.html` を変更するので、`files/sw.js` の `CACHE_VERSION` を上げる（今は v76）。

### 過去の教訓の反映（`~/claude-lessons/lessons.md`）

- 2026-08-23「非表示タブでは `getBoundingClientRect()` が 0 を返す」: `syncFlagRect()` では、凡例の幅が 0 のとき避ける処理をしない。配置編集タブへ移った直後は、`switchTab()` の既存の `syncFlagRect()` 呼び出しで測り直す。
- 2026-09-21「寸法ばかり測り、機能が動く最初の1回を試していなかった」: 検証では、凡例の列がある状態で次を実際に操作する。
  - マスの選択
  - 退避スペースへのドラッグ
  - 帯の戻す・進む
- 2026-08-31「検証の『結果が無い状態』が作れない」: 結果が無い状態で凡例の列が残らないことは、入力を変えて `#mapBody` が隠れる状態（入力と配置のずれ）を作って確かめる。

## 6. 範囲外

- 凡例をクリックして該当ロットを強調する等の新しい操作は入れない。
- スマホ・タブレット縦（1024px 未満）の見た目は変えない。
- 配置図タブ・印刷は変えない（凡例は配置編集タブだけの要素）。
- 退避スペースを凡例の列に統合する案は採らない（重なりを受け入れる決定のため）。
- 1024px 未満で位置を切り替える機能は作らない（常に上）。

## 7. テスト

### 7-1. 自動テスト（`node --test tests/`、既存と同じくソース文字列の検査）

`tests/edit-legend-column.test.js` を新設する。

1. `#legend` が `.editlayout` の中にあり、`#mapBody` より前にある。
2. `@media (min-width:1024px)` の中に、次の3つがある。
   - `.editlayout` の `display:flex`
   - `#legend` の `position:sticky`
   - 文章要素の `contain:inline-size`
3. 凡例1件の品名が `<span class="lg-name">` で囲まれている。
4. `syncFlagRect` が `legend` を参照して帯の左端をずらしている。
5. `syncLegendSide` が `switchTab` と `showMapState` から呼ばれている。
6. 表示設定に `setLegendPos('left')` / `('top')` / `('right')` のボタンがあり、`palletApp.legendPos` に保存している。
7. `lg-right` で `flex-direction:row-reverse` になる。
8. `#legendCtl` が 1024px 未満で隠れる。

### 7-2. ブラウザでの実測（デモ100P）

- 1500px 幅・マス「中」: 次を確かめる。
  - 凡例の列が約266px、盤の列が約930pxになる。
  - 下へスクロールしても凡例の列が残る。
  - 帯が凡例に重ならない。
- 1500px 幅・マス「大」: 盤の列が広がり、凡例の列が縮む。品名は省略されても、番号・ロット・パレット数は見える。
- 1024px 幅: 凡例の列は 200px 以上を保ち、盤は横スクロールになる。
- 1023px 幅と 412px 幅: 今と同じく、凡例が盤の上に横並びで出る。
- 退避スペース 右上・左上・下 の各設定で、次を操作する。
  - マスの選択
  - 退避スペースへのドラッグ
  - 帯の戻す・進む
- 入力を変えて配置が古くなった状態: 凡例の列が消え、ページ幅が 1240px に戻る。
- 位置の切り替え（1500px 幅）: 次を確かめる。
  - 左・上・右のそれぞれで、凡例の位置とページ幅（左右は 1552px、上は 1240px）。
  - 帯が凡例に重ならない。
  - 再読み込みしても選んだ位置が残る。
- 1023px 幅: 「品目リストの位置」の行が表示設定に出ない。保存値が「右」でも凡例は盤の上に出る。
