# 配置編集の「戻す・進む」 設計書

日付: 2026-09-21

対象ファイル: `files/index.html`、`files/sw.js`、`tests/`（新規1ファイル）

行番号はすべて 2026-09-21 時点（`files/index.html` 全 6382 行、`c18d36f`）のもの。着手時に `grep` で取り直すこと。

---

## 1. 目的

配置編集タブで、直前の操作を取り消せるようにする。

いま荷物を誤ってドラッグすると、元に戻す手段がない。自分で同じ数のマスを選び直し、元の列へ運び直すしかない。
取り消せるのは「ひとなぞり前の選択」だけで（`sweepUndo`）、配置そのものは戻せない。

戻すだけでなく、戻しすぎたときにやり直せるようにする。

---

## 2. 現状

### 2-1. 配置の状態

配置は 3 つのグローバル変数が持つ（`files/index.html:1237`）。

```js
let lastLots=null, lastColor=null, lastSp=null;
```

- `lastSp` … エリアと列の配置。荷物がどのマスに入っているか
- `lastLots` … ロットの定義（品名・ロット・枚数・種別）
- `lastFp` … 入力の指紋。入力が変わると値が変わる

`lastSp` を書き換えるのは実質 2 か所しかない。

| 関数 | 定義行 | 書き換える行 | 何をするか |
|---|---|---|---|
| `run()` | 2691 | 2723 | 自動配置。`lastSp` と `lastLots` を作り直す |
| `applyMove()` | 3614 | 3627 | 手動移動。`lastSp` だけ差し替える |

残りの `lastSp=`（`files/index.html:3444`、`3462`、`3484`）は保存からの復元と破棄で、利用者の操作ではない。

**`applyMove()` は `lastLots` を触らない。** `validateMove()`（`files/index.html:3114`）は `sp` だけを扱い、
ロットの定義は変えずに、どのマスに入るかだけを組み替える。

「◀ 倉庫へ戻す」（`returnSelToWarehouse()`、`files/index.html:4184`）も、最後は `applyMove()` を呼ぶ。
**配置を変える経路は `applyMove()` ただ 1 つ。**

### 2-2. スナップショットの仕組み

手動調整は既にスナップショットとして保存されている（`saveManual()`、`files/index.html:3489`）。

```js
activeShift().manual={fp:lastFp, sp:snapshotSpaces(lastSp), lots:clone(lastLots)};
```

`snapshotSpaces()`（`files/index.html:2438`）は `sp` を複製し、各列の `blockedRows` を落とす。
配置不可の情報はスナップショットに含めず、復元時に `hydrateBlockedRows()` で現在の値から合成する
（`restoreActiveShift()`、`files/index.html:3452`）。

この設計書はこの流儀をそのまま引き継ぐ。

### 2-3. 選択の状態

```js
let sel={lotId:null, cells:new Set()};
```

選択を変えるのは 4 経路。

| 操作 | 関数 | 行 |
|---|---|---|
| タップ・クリックで選ぶ | `toggleCell()` | 3266 |
| 指でなぞる | `selAdd()` / `selDel()` → `afterSelChange()` | 4202 / 4211 |
| マウスで矩形を引く | `moveRubber()` → `repaintSel()` | 4046 / 4160 |
| 選択を解除する | `clearSel()` | 3203 |

なぞりと矩形は、指（マウス）を動かしているあいだ連続して選択が変わる。
1 回の操作としてまとめる境界は、既にコードにある。

- 指のなぞり … `endSweep()`（`files/index.html:4353`）
- マウスの矩形 … `endRubber()`（`files/index.html:4087`）

**両者は既に同一視されている。** どちらも終了時に同じ `sweepUndo` 変数を使い、同じ `showSweepUndo()` を呼ぶ。
この設計書でも同じ扱いにする。

矩形には `cancelRubber()`（`files/index.html:4096`、Escape で引くのをやめる）がある。
これはストロークが完了していないので、履歴には積まない。

### 2-4. 盤の上の帯

`#toolFlag`（`files/index.html:864`）は盤の上端に貼りつく帯。中身は 4 つ。

```html
<span id="toolFlagCount" class="flagcount"></span>
<span id="toolFlagText"></span>
<button id="flagClearBtn" onclick="clearSel()">選択解除</button>
<button id="sweepUndoBtn" onclick="undoSweep()">↩ いまの選択を取り消す</button>
```

`updateFlag()`（`files/index.html:4114`）が出し入れする。
**選択が 0 で、なぞり取消も無いときは帯ごと消える。** コードにこう書いてある。

> 待機中は帯ごと消す。出しっぱなしにすると、盤の上に常設の帯が居座って
> 「画面の情報を削る」という目的に逆行する

---

## 3. 決定したこと

ブレストで決めた内容を一覧にする。

| 論点 | 決定 |
|---|---|
| 戻せる対象 | 手動移動と選択。自動配置と配置不可の編集は含めない |
| 履歴の保存 | しない。メモリのみ。読み込み直すと消える |
| 時間帯 | 「あさ」「ひる」で別々に持つ。切り替えても捨てない |
| 戻す単位 | 種類を問わず 1 操作ずつ。選択も 1 回分として戻る |
| 既存の 2 ボタン | 削除する。「選択解除」も「↩ いまの選択を取り消す」も Undo に吸収される |
| 帯を出す条件 | 選択中、または履歴に何かあるとき。自動配置の直後は出ない |
| ボタンの文言 | 「↩ 戻す」「進む ↪」。表示設定で記号だけ（「↩」「↪」）に切り替えられる |
| 記号 | `↩`（U+21A9）と `↪`（U+21AA） |

記号に `↩ ↪` を選んだ理由。

- 既存の「↩ いまの選択を取り消す」で既に `↩` を使っている。見慣れた記号のまま意味を引き継げる
- 「取り消す・やり直す」の意味が正確。`◀ ▶` はブラウザの戻る・進むと混同しやすい
- `↶ ↷` は Undo/Redo の国際的な標準だが、実測で最も線が細く、倉庫で手早く押す用途に向かない

---

## 4. データ構造

```js
let histories = { am:{steps:[], cursor:-1}, pm:{steps:[], cursor:-1} };
```

`steps[cursor]` が現在の状態。`cursor` が `-1` のときは履歴なし。

各ステップは 2 種類。

| kind | 持つもの | 大きさ |
|---|---|---|
| `"select"` | `sel`。`sp` は**前のステップと同じ参照**を入れる | 数十バイト |
| `"move"` | `sel` と、その操作の**後**の `sp`（新しい配列） | 約 2.6 KB |

```js
// select
{kind:"select", sel:{lotId:3, cells:["メイン|2|0", …]}, sp:<前と同じ参照>}
// move
{kind:"move", sel:{lotId:null, cells:[]}, sp:<新しい配列>}
```

`lots` は履歴に入れない。§2-1 のとおり移動では変わらないため。
入力が変わって `lots` が変わるときは、`fp` も変わるので履歴ごと捨てる（§8）。

選択だけが変わったステップで `sp` をコピーしないのが要点。
選択を何十回繰り返してもメモリは増えない。

`sel.cells` は `Set` だが、履歴には配列で入れる。復元時に `new Set()` で戻す。

上限は 50 件。超えたら先頭から捨て、`cursor` も同じ数だけ詰める。

---

## 5. どこで積むか

### 5-1. 移動

`applyMove()`（`files/index.html:3614`）。

```js
function applyMove(spaceName, colIndex){
  if(!isActiveFresh()){ refreshFreshness(); return; }
  const counts=selCounts(sel.cells);
  growStashCol(…);          // ← lastSp を直接変える
  const v=validateMove(lastSp, …);
  if(!v.ok) return;
  if(v.needConfirm){ … if(!confirm(…)) return; }
  lastSp=v.next;            // ← ここで配置が確定する
  saveManual();
  clearSel();
  redraw();
}
```

**`growStashCol()` より前**で現在の `sp` を控えること。この関数は退避スペースの列を
その場で伸ばし、`lastSp` を直接書き換える。後で控えると、伸びた後の状態しか残らない。

積むのは `lastSp=v.next` が通った後。`v.ok` が false のとき、確認を断ったときは積まない。

`clearSel()` がこの中で呼ばれるが、これは移動ステップの一部なので**選択ステップとしては積まない**（§5-3）。

### 5-2. 選択

| 操作 | 積む場所 | 条件 |
|---|---|---|
| タップ・クリック | `toggleCell()` の末尾 | 常に 1 ステップ |
| 指のなぞり | `endSweep()` | `sweep.started && sweep.mode` のときだけ |
| マウスの矩形 | `endRubber()` | `started` が true のときだけ |

選択解除は積まない。理由は §5-3。

なぞりと矩形は、動きが 6px 未満だとストロークにならずクリック扱いになる。
そのときは `toggleCell()` の側で積まれるので、`started` を見て二重に積まないようにする。

### 5-3. `clearSel()` の扱い

`clearSel()` は利用者の操作以外からも呼ばれる。

- `applyMove()` の末尾（移動の一部）
- `setActiveTiming()`（時間帯の切替）
- `setBlockedEditMode()`（配置不可の編集に入るとき）
- `startRubber()`（矩形を引き始めるとき）

**`clearSel()` 自身は履歴に積まない。** 積むかどうかは呼び出し側が決める。
いまの設計では帯に「選択解除」ボタンを置かないので、選択解除だけを単独で積む経路は無い。
選択が消えるのは移動の一部か、別の操作の前処理として起きる。

---

## 6. 戻す・進む

```
戻す: cursor > 0 なら cursor-- して steps[cursor] を適用
進む: cursor < steps.length-1 なら cursor++ して steps[cursor] を適用
積む: steps を cursor+1 で切り捨ててから push、cursor を末尾に
```

適用の手順。

1. `steps[cursor].sp` を `clone()` して `lastSp` に載せる
2. `hydrateBlockedRows(lastSp, activeShift().blocked)` を通す
3. `sel.lotId` と `sel.cells`（`new Set(...)`）を復元する
4. `saveManual()` で保存済みの手動調整を更新する
5. `redraw()` で描き直す

`kind:"select"` のステップは `sp` が前と同じ参照なので、配置は変わらず選択だけが戻る。
それでも同じ手順を通す。分岐を作らないほうが間違えにくい。

**配置不可の情報は履歴から取らない。** 手順 2 で常に現在の `blocked` から合成する。
戻した配置が現在の配置不可と食い違うことはありうるが、それは既存の
「配置不可のマスに荷物がある」状態と同じで、`has-lot` の警告枠が出て再配置を促す既存の仕組みに乗る。
新しい扱いは作らない。

---

## 7. 画面

### 7-1. 帯

`#toolFlag` の中身をこうする。

```html
<span id="toolFlagCount" class="flagcount"></span>
<span id="toolFlagText"></span>
<span class="flagbtns">
  <button id="undoBtn" onclick="doUndo()" aria-label="元に戻す" title="元に戻す">↩ 戻す</button>
  <button id="redoBtn" onclick="doRedo()" aria-label="やり直す" title="やり直す">進む ↪</button>
</span>
```

`#flagClearBtn` と `#sweepUndoBtn` は削除する。`undoSweep()`、`showSweepUndo()`、
`hideSweepUndo()`、`sweepUndo` も使われなくなるので消す。

**呼び出し元も消すこと。** `hideSweepUndo()` は 6 か所から呼ばれている。

| 行 | 呼び出し元 | 消した後どうするか |
|---|---|---|
| 3207 | `clearSel()` | 行ごと消す |
| 3275 | `toggleCell()` の `intent==="single"` | 行ごと消す |
| 3285 | `toggleCell()` の末尾 | 履歴に積む処理に置き換える（§5-2） |
| 4104 | `cancelRubber()` | 行ごと消す |
| 4248 | `toMove()` | 行ごと消す |
| 4157 | `undoSweep()` 自身 | 関数ごと消す |

`sweepUndo` への代入（4052、4313）と `showSweepUndo()` の呼び出し（4092、4356）も消す。
4092 と 4356 は `endRubber()` / `endSweep()` の中なので、同じ場所が履歴に積む処理に変わる（§5-2）。

CSS の `#toolFlag #flagClearBtn,#toolFlag #sweepUndoBtn`（353）も書き換える。

**ボタンの位置を固定する。** 選択数の有無・案内文の有無・運搬中かどうかで位置が動かないようにする。

```css
.flagcount{flex:none}
#toolFlagText{flex:1 1 0;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.flagbtns{flex:none;display:flex;gap:10px;margin-left:auto}
.flagbtns button{min-width:44px}
```

`#toolFlagText` の `flex-basis` を `auto` ではなく **`0`** にすること。
`.toolflag` は `flex-wrap:wrap` なので、基準幅が `auto` だと説明文が縮む前に折り返す。

**この指定は `@media (min-width:700px)` の外に置くこと。**
いまの `#toolFlagText{flex:1 1 auto;…}` は `files/index.html:357`、つまり
`@media (min-width:700px)` ブロック（314-359行）の中にある。同じブロックの `flex-wrap:nowrap`（349）も同じ。
375px ではどちらも効いていない。`.flagundo` の並び（282付近）に新しく書くこと。

**帯の幅は画面幅では決まらない。** `syncFlagRect()`（`files/index.html:3868`）が、
退避スペース（`#stashDock`）と重ならないように帯の幅を削る。
退避スペースが「右上」「左上」のときは、その実測幅ぶんが帯から引かれる。

375px 幅での実測。

| 退避スペースの位置 | 帯の幅 | 選択なし（ボタンだけ） | 選択あり |
|---|---|---|---|
| 右上（既定） | 186px | 62px（1行） | 100px（2行） |
| 下 | 327px | 62px（1行） | 62px（1行） |

**退避スペースが右上のとき、選択中は2行になる。これを許容する。**
「✋ 5マス選択中」は 117px、ボタンは文字ありで 150px、記号だけで 98px。
gap と padding を足すと、どちらも 186px に収まらない。
選択数を「5マス」（75px）まで縮めても 207px で入らない。

選択していないとき（＝戻す・進むのボタンだけ）は 1行 62px に収まる。
これが「動かした直後に戻したい」場面の見え方なので、いちばん大事なところは1行で足りる。

参考：700px 以上の幅では 1 行 62px、戻すボタンの左端 188px・進むボタンの右端 338px で、
選択数や案内文の有無にかかわらず位置は動かない（`margin-left:auto` が効くため）。

### 7-2. ボタンの状態

- 「↩ 戻す」… `cursor <= 0` なら `disabled`
- 「進む ↪」… `cursor >= steps.length-1` なら `disabled`

押せないときも**消さずに灰色で残す**。消えると位置がずれて押し間違える。

### 7-3. 帯を出す条件

`updateFlag()` の条件を変える。

| いま | 変更後 |
|---|---|
| 選択中、またはなぞり取消あり | 選択中、または**履歴に何かある**とき |

自動配置は履歴を捨てる（§8）ので、その直後は帯が出ない。手で動かし始めて初めて出る。

**副作用：帯が常設になり、その下のマスが選べなくなる。**
一度でも荷物を動かすと、履歴が残っているあいだ帯が出たままになる。
帯は `position:fixed; z-index:65` で画面上端に浮き、`pointerdown` のハンドラ
（`files/index.html:4278`）が `e.target.closest("button, .toolflag, .sb-head")` でタップを捨てるため、
帯に隠れたマスは選べない。盤をスクロールした位置によっては最大 12 マスが隠れる（実測）。

既存コードのコメント（`files/index.html:4123`）は
「出しっぱなしにすると、盤の上に常設の帯が居座って『画面の情報を削る』という目的に逆行する」
と書いており、この変更はその方針を覆す。

覆すと決めた理由：荷物を動かした直後は選択が解除されるので、選択だけを条件にすると
「動かした、戻したい」というその瞬間に帯が消えてしまう。戻せることを示し続けるほうが優先。
隠れたマスは盤をスクロールすれば選べるので、永久に触れなくなるわけではない。

### 7-4. 表示設定

設定タブの「表示設定」ペインに 1 項目足す。

```
配置編集の戻す・進む
  □ 記号だけにする
  （チェックを入れると「↩ 戻す」「進む ↪」が「↩」「↪」になります。
    狭い画面で帯を短くしたいときに使ってください）
```

既定はオフ（文字あり）。初めて見る人にも意味が分かるようにするため。

既存の `mergeChk` と同じ流儀で `STORE_KEY.undoIcon` に保存する（`files/index.html:1249` に追加）。
`toggleUndoIcon()` を作り、起動時に `loadData()` で復元する。
記号だけにしても `aria-label` と `title` は「元に戻す」「やり直す」のまま残す。

---

## 8. 履歴を捨てるとき

| きっかけ | 履歴 |
|---|---|
| 自動配置（`run()`） | 捨てる |
| 入力が変わって `fp` が変わる | 捨てる |
| 時間帯の切替（`setActiveTiming()`） | 捨てない。`am` / `pm` で別々に持つ |
| 配置不可エリアの編集 | 触らない |
| 読み込み直し | 消える（保存しないため） |

`fp` の確認は、履歴を積むときと適用するときの両方で行う。
`steps` に入っている `sp` が現在の入力と合わなくなっていたら、その場で履歴を捨てて何もしない。

配置不可の編集（`toggleBlockedCell()`、`files/index.html:3171`）を履歴に含めない理由。

- セル 1 個ごとに `blocked.push/splice` と `saveSchedule()` が走る。なぞると数十回呼ばれる
- `lastSp` を変えないので、戻しても盤の中身は変わらない
- 再配置して初めて配置に効く。その再配置が履歴を捨てるので、結局戻せない

---

## 8-2. 決めておく細かい点

計画のレビュー（`/dig`）で、決めないまま実装すると迷う点が見つかった。ここで決めておく。

### 移動のステップが持つ選択

移動した後は `clearSel()` で選択が消える。移動**後**のステップが持つ選択は
`{lotId:null, cells:[]}`（空）にする。

移動前の選択をそのまま持たせると、やり直したときに「移動元のマス」のキーが復元される。
そのマスにはもう荷物が無いので `repaintSel()` は1枚も光らせないのに、
帯には「✋ Nマス選択中」と出る。実体のない選択が残ってしまう。

履歴が空のときに先に積む「土台」のステップ（移動**前**の状態）は、移動前の選択を持たせる。
戻ったときに選択も戻るので、そのまま選び直さずに操作を続けられる。

### 入力が変わった後に戻すボタンを押したとき

`isActiveFresh()`（`files/index.html:3440`）が false のときは、戻す・進むを実行しない。
ボタンも `disabled` にする。

`fp` の比較だけでは足りない。`lastFp` が変わるのは `run()`（履歴を捨てる）と
`restoreActiveShift()` だけで、伝票を書き換えても `lastFp` は据え置かれ、
`inputFingerprint()` の側だけが変わる。この状態で戻すと、`saveManual()` も `redraw()` も
`isActiveFresh()` で弾かれて何も保存されず、配置ごと消える。

### 最初の1操作を戻せるようにする

`historyCanUndo()` は `cursor > 0`。履歴が空の状態で1件積んだだけでは戻せない。
移動も選択も、履歴が空のときは「操作前の状態」を土台として先に1件積む。
これをしないと、自動配置の直後の最初のタップやなぞりが戻せず、移動と選択で挙動が変わってしまう。

### 配置不可エリアの編集中

編集モードに入ったら帯を隠す。`setBlockedEditMode(true)`（`files/index.html:3143`）で
帯の表示を切り、抜けたら戻す。

編集中に「戻す」を押せると、配置不可のマスを塗っている最中に裏で `lastSp` が入れ替わる。
何が起きたか分からなくなるので、その場面では押せないようにする。

### 退避スペースのマスを選んだ状態で戻す

`renderResult()`（`files/index.html:2591`）は描画前に `ensureStashRoom()`（`2669`）と `repackStash()` で
`lastSp` を整形する。履歴に積むのはその前の形なので、退避スペースの列の数や高さが履歴と
実際で食い違うことがある。適用後に `redraw()` を通せば再整形されるが、
退避のセルキー（`退避|列|行`）は整形で変わりうる。

退避スペースのマスを選んだ状態での戻す・進むは、ブラウザで実際に触って確かめる（§9-3）。

---

## 9. テスト

### 9-1. 履歴のロジック

DOM に触らない純粋関数として切り出す。

```js
historyPush(hist, step)      // cursor 以降を捨てて push、上限を適用
historyUndo(hist)            // cursor を戻して現在のステップを返す
historyRedo(hist)            // cursor を進めて現在のステップを返す
historyCanUndo(hist)         // 戻せるか
historyCanRedo(hist)         // 進めるか
```

既存テストに、関数をソースから取り出して実行する手法がある
（`tests/sheet-placement.test.js:1070` の `new Function(functionSource("colTopOffset"))`）。
これに乗せて実際に動かす。

確かめること。

- `push` で `cursor` が進む
- `undo` / `redo` で `cursor` が動き、同じステップが返る
- `undo` した後に `push` すると、`redo` 側が捨てられる
- 上限 50 件を超えると先頭から落ち、`cursor` が正しく詰まる
- 空の履歴で `undo` / `redo` を呼んでも壊れない
- `select` のステップが直前の `sp` と同じ参照を持つ（配置をコピーしない）

### 9-2. 画面まわり

ソースの正規表現検査で確かめる（既存テストと同じ流儀）。

- `#flagClearBtn` と `#sweepUndoBtn` が消えている
- `#toolFlagText` の `flex` が `1 1 0` になっている
- `.flagbtns` に `margin-left:auto` がある
- 記号の切り替えが `STORE_KEY.undoIcon` に保存される

### 9-3. ブラウザでの実操作

- 荷物を動かして「↩ 戻す」を押すと元の列に戻る
- 「進む ↪」でもう一度動いた状態になる
- 戻した後に別の操作をすると「進む ↪」が押せなくなる
- なぞって選び、戻すと、なぞる前の選択に戻る
- 自動配置の直後は帯が出ない
- 「あさ」で動かして「ひる」に切り替え、「あさ」に戻ると、まだ戻せる

---

## 10. 実機で確かめること

Pixel 9a / Android Chrome。

- `↩` と `↪` が意図した字形で出るか。この設計書の記号の測定は macOS のフォントで行った。
  Android は Noto Sans なので字形が変わる。豆腐になっていないか、細すぎないかを見る
- 帯が 1 行に収まるか。375px 幅の実測はデスクトップのブラウザで行った
- ボタンが指で押せるか。記号だけにしたとき `min-width:44px` が効いているか

---

## 11. やらないこと

- 履歴の保存。読み込み直すと消える
- 自動配置の取り消し。「自動配置を押す前の手動調整に戻す」はできない
- 配置不可エリアの編集の取り消し
- キーボードショートカット（Ctrl+Z など）。現場はタッチ操作のため
- `applyMove()` が途中で中止したときに、`growStashCol()` で伸びた退避スペースの列を戻すこと。
  `growStashCol()` は `lastSp` を書き換えた後に `if(!v.ok) return;` で抜けるので、
  伸びた列が残る。これは今もある不具合で、履歴には積まれないので戻すでも消せない。
  戻す・進むを入れると「戻せるはず」という期待が生まれるぶん目立つが、
  直すのは別の作業として切り分ける
