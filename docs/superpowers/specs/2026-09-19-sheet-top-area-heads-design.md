# 配置図 上段のエリア見出し 設計書

日付: 2026-09-19

対象ファイル: `files/index.html`、`files/sw.js`、`tests/sheet-placement.test.js`

行番号はすべて 2026-09-19 時点（`files/index.html` 全 5451 行）のもの。着手時に `grep` で取り直すこと。

---

## 1. 目的

配置図（紙）の上段で、いまは注釈行に `※軒下②` の形で出ている置き場所の情報を、
見出し行のセルへ移す。上段の欄をエリアごとにまとめ、見出しを枠線で区切る。

現場が紙を見たとき、どの欄がどのエリアの荷物かを、欄ごとの小さな注釈ではなく
見出しのまとまりで読めるようにする。

欄ごとの注釈は完全には捨てない。見出しのエリアと違う場所にもまたがる欄だけ、
その欄の真下に注釈を残す（§3-5）。

---

## 2. 現状

### 2-1. 上段の見出し行

`renderSheet()`（`files/index.html:4736`）の行1で、上段の全欄にまたがる1セルに
固定文字「軒下」を書いている（`files/index.html:4762`）。

```js
rows+=`<tr><td class="hd" colspan="5">…月日…</td>${E}`
    + `<td class="ttl bb2" colspan="${lay.top*2}">軒下</td></tr>`;
```

`lay.top` は様式ごとの上段の欄数（normal 4 / wide 6、`SHEET_LAYOUTS`）。
1欄が2列を占めるので、見出しの `colspan` は `lay.top*2` になる。

### 2-2. 上段の注釈行

行5（`files/index.html:4783`）で `slotCells(top, lay.top, "note")` を呼び、
欄ごとの注釈を出している。中身は `sheetEntries()`（`files/index.html:4410`）が作る。

```js
const extra = baseArea ? e.areas.filter(n=>n!==baseArea) : [];
note: extra.length ? ("※"+extra.join("・")) : ""
```

基準エリア（`sheetAreas("top")[0]`、現在は軒下①）は注釈から省かれる。
それ以外のエリアに置かれた欄だけ `※軒下②` のように出る。

CSS は `tr.note-row td.none{height:16px}`（`files/index.html:515`）。
`td.none` は枠線なし（`files/index.html:442`）。

### 2-3. 上段のエリアは4つある

`DEFAULT_SPACES` で上段（`sheet:"top"`）に属するのは
**軒下①・軒下②・出庫口横・5棟壁際**の4エリア
（`files/index.html:870, 876, 893, 894`）。加えて、退避スペースの欄（`stashSlots()`）と、
下段に入りきらず上段へ回した欄（`movedBottom`）も上段に並ぶ。

「上段＝軒下」ではない。設計はこの4エリア＋退避＋回送すべてを扱う。

### 2-4. 上段の欄の並び

`sheetPlacement()`（`files/index.html:4597`）が返す `top` は、すでにエリア順に並んでいる。

```js
const top = sheetSlots("top").concat(stashSlots());
…
const topAll = top.concat(movedBottom.map(e=>({...e, note:slotAreaNote(e.areas)})));
```

- `sheetSlots("top")` … `sheetEntries(names, names[0])` が `sheetAreas("top")` の順に走査する。
  `mergeEntries()` は `out.push` の順を保つので、エリア順が崩れない
- `stashSlots()` … 退避スペースの欄。`areas:["退避"]`、`note:"※未定"`、`stash:true`
- `movedBottom` … 下段に入りきらず上段へ回した欄（2026-09-19 の改修）。
  `areas` は下段のエリア名（PC横・EV横 など）

したがって並びは 軒下① → 軒下② → 出庫口横 → 5棟壁際 → 未定（退避） → PC横 の順になる。
要件の「上段は左詰めで軒下のロットを入れる」は現状ですでに成立している。

### 2-5. `top` は `lay.top` を超えうる

`sheetPlacement()` の中に `omittedTop = top.slice(lay.top + moved.length)`
（`files/index.html:4634`）がある。上段があふれる日は `topAll.length > lay.top` になり、
紙に出るのは先頭 `lay.top` 件だけ（`renderSheet()` が `slotCells(top, lay.top, …)` で切る）。
残りは下段の空きか追記欄へ回る。

---

## 3. 仕様

### 3-1. 対象にする欄

紙に出る先頭 `lay.top` 件だけを見る（`top.slice(0, lay.top)`）。
あふれて紙に出ない欄は、グループ分けにもエリアの種類数の判定にも含めない。

### 3-2. グループの作り方

対象の欄を先頭から見て、隣り合う欄の**グループキー**が同じ間は同じグループにまとめる。

```
グループキー = e.stash ? "未定" : (e.areas[0] || "")
```

欄が複数のエリアにまたがる場合（`e.areas.length >= 2`）は、**最初のエリア**（`areas[0]`）の
グループに入れる。並び順を今と変えないため、またグループが飛び地にならないため。

`e.areas` が空の欄はグループキーを空文字にする。`slotAreaNote()`（`files/index.html:4490`）が
同じ保険を持っているのに合わせた防御で、通常は起きない。

### 3-3. 見出しの文字

**固定文字「軒下」を使う条件**（どちらか）:

- グループが1つだけで、そのグループキーが `sheetAreas("top")[0]`（現在は軒下①）に一致する
- 上段に荷物が1つも無い（グループ0）

この2つに当てはまる日は、見出し1セル・固定文字「軒下」・`colspan` は `lay.top*2`。
従来の紙と同じ見た目になる。日常の大半はここに落ちる。

**それ以外の日**はグループごとに見出しを作る。文字はそのグループに含まれる欄の
エリア名を、`top` に現れた順で重複を除いて並べ、`・` でつなぐ。
3つ以上になる場合は**先頭2つ＋「 ほか」**で打ち切る（§5-3 の高さの理由）。

```
names = グループ内の欄の areas を初出順に重複を除いて並べたもの
label = names.length<=2 ? names.join("・")
                        : names.slice(0,2).join("・") + " ほか"
```

退避の欄のラベルは「退避」ではなく **「未定」**。
`stashSlots()` のコメントにあるとおり、現場にとって「退避」は場所の名前ではない。
既存の注釈 `※未定` と表記を揃える。

例:

| その日の上段 | 見出し |
|---|---|
| 軒下①だけ | `軒下`（1セル） |
| 上段が空 | `軒下`（1セル） |
| 出庫口横だけ | `出庫口横`（1セル） |
| 退避だけ | `未定`（1セル） |
| 下段からの回送だけ | `PC横`（1セル） |
| 軒下① と 軒下② | `軒下①` ┃ `軒下②` |
| 軒下① と 退避 | `軒下①` ┃ `未定` |
| 軒下①・②にまたがる欄だけ | `軒下①・軒下②`（1セル） |
| 軒下① と 軒下②、うち1欄がまたがる | `軒下①・軒下②` ┃ `軒下②` |
| 1欄が3エリアにまたがる | `軒下①・出庫口横 ほか` |

固定文字を「グループキーが先頭エリアのとき」に限る理由は、
そうしないと**出庫口横だけ・退避だけ・回送だけの日にも「軒下」と出て、
置き場所が紙から完全に消える**ため。現在は注釈行に出ているので、
条件を緩めると改善ではなく退行になる。

### 3-4. 枠線

グループの境界に縦 2px の罫線を引く（既存の太罫 `bb2` と同じ太さ）。
**見出し・品名・ロット・P数の4行を縦に貫く**。注釈行には引かない。
グループ内の欄の境界は現状どおり 1px。見出し行の下辺は従来どおり太罫（`bb2`）。

### 3-5. 注釈行

上段の注釈行（`tr.note-row`）は**行ごと残す**。行の高さ 16px を維持する。
これは後で実装する「配置図のテキスト編集」
（`docs/superpowers/specs/2026-09-19-sheet-text-edit-notes.md`）で、
上段にも自由記入できる欄を残すため。

中身は原則空にするが、**見出しに出ているエリアだけでは欄を特定できない場合**に限り、
その欄の真下に注釈を残す。

```
note = e.areas.length>1 ? "※"+e.areas.slice(1).join("・") : ""
```

`areas[0]` はグループキーそのものなので省く。残りがあれば出す。

- 軒下②だけに置かれた欄 → `areas=["軒下②"]` → 注釈なし（見出しが「軒下②」）
- 軒下①と出庫口横にまたがる欄 → `areas=["軒下①","出庫口横"]` → `※出庫口横`
- 退避の欄 → `areas=["退避"]` → 注釈なし（見出しが「未定」）

これで「グループに3欄あって1欄だけが出庫口横にもまたがる日、どれが出庫口横か」が
紙から読める。普段の日は注釈行が全部空になる。

この注釈は上段のために作り直す。`sheetEntries()` の `note`（基準エリアを省く規則）とは
別物なので、`sheetEntries()` には手を入れない。下段は `sheetEntries()` の `note` のまま。

### 3-6. 下段

下段は今回変更しない。見出しも注釈行も現状のまま。
下段は引き出し線の起点と近接配置（`arrangeBottomSlots()`）が絡むため、
同じ改修を同時に入れると影響が読みきれない。

---

## 4. 実装方針

### 4-1. 純粋関数を2つ新設する

```js
/* 上段の欄をエリアごとのグループに割る。見出し行のセルを作るのに使う。
   entries は紙に出る先頭 count 件だけを渡すこと（あふれた欄は含めない）。 */
function topHeadGroups(entries, count, baseArea)
  → [{label: string, slots: number}, …]
```

- `entries.length > count` の場合は先頭 `count` 件だけを見る。
  これを守らないと `slots` の合計が `count` を超え、§5-1 の破壊が起きる
- `slots` の合計は必ず `count` に一致させる。
  グループの欄数の合計が `count` に満たない日（上段に空欄がある日）は、
  末尾のグループに余りを足す。グループが0なら `[{label:"軒下", slots:count}]`
- `baseArea` は `sheetAreas("top")[0]`。固定文字「軒下」を使うかの判定にだけ使う

```js
/* 上段の欄の注釈。グループキー（areas[0]）を省いた残りを出す。 */
function topSlotNote(e) → string
```

どちらも DOM に触れないので `node:test` で直接検証できる。
既存のテストと同じ `functionSource()` + `new Function()` のサンドボックス方式に乗る。

責任分担は 2026-09-19 の設計を踏襲する。
**誰がどの段に行くかは `sheetPlacement()`、見出しをどう割るかは描画側**。
`sheetPlacement()` の戻り値は変えない。

### 4-2. `slotCells()` に区切り線の引数を足す

§3-4 の 2px 縦罫を品名・ロット・P数の行にも通すため、引数を1つ足す。

```js
function slotCells(entries, count, kind, extra, sepAt)
```

`sepAt` は「左辺を 2px にする欄の index」の `Set`。省略時は従来どおりの振る舞い。
下段の呼び出しは渡さないので影響しない。

### 4-3. `renderSheet()` の変更（5か所）

```js
const heads = topHeadGroups(top, lay.top, sheetAreas("top")[0]||null);
// グループの境界にあたる欄の index。先頭グループの左辺は既存の bl2 に任せる
const sep = new Set();
let acc = 0;
heads.forEach((g,i)=>{ if(i) sep.add(acc); acc += g.slots; });
```

1. 行1（`files/index.html:4762`）— 見出しをグループごとのセルにする

```js
… + heads.map((g,i)=>
      `<td class="ttl bb2${i?" gsep":""}" data-fit="head" colspan="${g.slots*2}">`
      + `<span class="fit">${esc(g.label)}</span></td>`).join("")
```

2. 行2（品名、`files/index.html:4767`）— `slotCells(top, lay.top, "name", "bb2", sep)`
3. 行3（ロット、`files/index.html:4774`）— `slotCells(top, lay.top, "lot", null, sep)`
4. 行4（P数、`files/index.html:4777`）— `slotCells(top, lay.top, "pallet", null, sep)`
5. 行5（注釈、`files/index.html:4783`）— 注釈を上段用に作り直して渡す

```js
const topNotes = top.slice(0, lay.top).map(e=>e?{...e, note:topSlotNote(e)}:e);
rows+=`<tr class="note-row"><td class="none" colspan="5"></td>${E}`
    + `${slotCells(topNotes, lay.top, "note")}</tr>`;
```

元の欄は書き換えず浅く複製する（`sheetPlacement()` が `moved` / `movedBottom` で
とっている作法に合わせる。`members` と `areas` の配列は共有するので書き換えない）。

### 4-4. CSS

- `.sheet td.ttl.gsep, .sheet td.slot.gsep{border-left-width:2px}`
- 見出しを `<span class="fit">` で包み、長いラベルを既存の水平圧縮に乗せる

### 4-5. `fitSheetText()` への追記

`fitSheetText()`（`files/index.html:4658`）は `.fit` を全部走査し、
入りきらない欄を `td.dataset.fit` の値で分類して警告に出す。
見出しの `<td>` に `data-fit` が無いと空文字のキーに集計され、
警告が「` 1件`」という空ラベルになる。`data-fit="head"` を付ける（§4-3）。

`FIT_LABEL`（`files/index.html:4651`）に `head:"見出し"` を足す。

ただし警告文（`files/index.html:4713-4715`）は
「表示設定で文字を小さくするか、品名を短くしてください」で固定されている。
見出しは `--fs-*` の対象外で表示設定では小さくならず、品名でもないので、
**見出しが入りきらない場合だけ「設定タブでエリア名を短くしてください」と案内を分ける**。

### 4-6. PWA

`files/sw.js` の `CACHE_VERSION` を `v54` → `v55` に上げる。

### 4-7. ついでに直すコメントの誤り

`files/index.html:4780` のコメント「wide は 5+1+5×2=16 列」は誤り。
正しくは `5+1+6×2=18` 列。§4-3 でこの行の直前を書き換えるので同時に直す。

---

## 5. 技術制約

### 5-1. `colspan` の合計は `lay.cols` から1つもずれてはいけない

`.sheet table` は `table-layout:fixed` で、幅を `colgroup` で与えている
（`files/index.html:433-439`）。既存コメントの警告どおり、列数がずれると
`colgroup` の幅が無視されて列が詰まり、盤のマスと欄の位置が合わなくなる。
引き出し線（`drawLeaders()`）の座標も同時に狂う。

行1の合計は `5 + 1 + Σ(g.slots*2)`。これが `lay.cols`（normal 14 / wide 18）に
一致することをテストで固定する（§6 のテスト9）。

### 5-2. エリア名をコードに直書きしない

2026-09-19 の設計（`docs/superpowers/specs/2026-09-19-sheet-tier-priority-design.md` §4-1）の
制約を継承する。ラベルは `e.areas` と `e.stash` から作り、「軒下」「PC横」などを
条件式に書かない。

**例外2つ**:

- §3-3 の固定文字「軒下」。`sheetAreas("top")[0]` と一致するかの判定は動的だが、
  出力する文字列そのものはリテラル。設定タブでエリア名を「軒下①」から変えても
  見出しは「軒下」のままになる。日常の紙の見た目を変えないことを優先した意図的な例外
- 退避のラベル「未定」。`stashSlots()` が `note:"※未定"` をリテラルで持っているのと同じ扱い

### 5-3. 見出しラベルの幅の予算（実測値）

`.sheet td.ttl` と同じ指定（15px / weight 800 / `letter-spacing:.2em`）での実測。
`avail` は1欄ぶんで normal 92px / wide 74px。`FIT_MIN_SCALE` は 0.4。

| ラベル | 自然幅 | k (normal) | k (wide) |
|---|---|---|---|
| `軒下` / `未定` | 36px | 2.56 | 2.06 |
| `軒下①` | 54px | 1.70 | 1.37 |
| `出庫口横` | 72px | 1.28 | 1.03 |
| `軒下①・軒下②` | 126px | 0.73 | 0.59 |
| `軒下①・出庫口横` | 144px | 0.64 | 0.51 |
| `出庫口横・5棟壁際` | 158px | 0.58 | 0.47 |
| 3エリア連結（打ち切り前） | 216px | 0.43 | 0.34 |

**1欄ぶんの幅で危ないのは3エリア以上を連結したとき**。wide で 0.4 を割って折り返し、
見出し行が約18px 伸びる。§3-3 で先頭2つ＋「 ほか」に打ち切るのはこのため。

グループが複数欄なら `avail` が倍々になるので安全（3欄グループなら wide でも k≈0.98）。
危険なのは「多エリアにまたがる欄が単独でグループを作る日」だけ。

なおエリア名の長さに制限はない（`applyConfig()` は空文字と重複しか弾かない、
`files/index.html:4052-4101`）。長い名前を付ければ1エリアでも折り返す。
そのときは §4-5 の警告で気づける。

### 5-4. 印刷の高さ

注釈行を残すので、行数も行の高さも変わらない。
`PRINT_H_LIMIT`（`files/index.html:4654`）に対する余裕は現状と同じ（実測で用紙の90.7%）。
見出しが折り返した日だけ約18px 伸びる。

### 5-5. グループが飛び地にならない理由

`topHeadGroups()` は**隣接する欄だけ**を見るので、同じエリアのグループが
離れた位置に2つできると見出しが重複して出る。現状それが起きないのは:

- `top` の並びが `sheetAreas("top")` の順（§2-4）
- 上段があふれる日（`moved` が空でない）と、下段から回送が来る日（`movedBottom` が空でない）は
  **排他**。前者の条件は `top.length - lay.top > 0`、後者は `lay.top - top.length > 0`

この不変条件を `topHeadGroups()` のコメントに書く。
将来 `sheetPlacement()` の並べ方を変えるときに気づけるようにする。

### 5-6. `border-collapse:collapse` の中の 2px 縦罫

既存の 2px は品名行の外周（`bl2`/`br2`）＝上段ブロックの両端だけで、
**ブロック内部に 2px の縦罫を入れるのは今回が初めて**。
`table-layout:fixed` + `colgroup` なら列トラック幅は保たれるはずだが、
罫線が列境界をまたいで描かれるため、見出し行の 2px と注釈行の境界で
1px のずれが見える可能性がある。印刷プレビューで確認する。

### 5-7. ブラウザ・デバイス

今回の変更は HTML の `colspan` と CSS の `border-left-width` だけで、
新しいブラウザ API を使わない。PWA・オフライン動作・localStorage への影響もない。

実機確認は Pixel 9a / Android Chrome。確認するのは表示崩れと印刷プレビューのみ。

### 5-8. `<span class="fit">` を見出しに入れると中央が約1.5px ずれる

`.ttl` の `letter-spacing:.2em` は最後の文字の後ろにも字間を付ける。
`.fit` は `display:inline-block` なのでその字間が幅に含まれ、中央寄せが左へ約1.5px ずれる。
§3-3 の「従来の紙と同じ見た目」は厳密には成立しない。実用上は無視できる範囲だが、
気になるなら `.ttl .fit{margin-left:.2em}` で相殺する。印刷プレビューで判断する。

### 5-9. 過去の教訓から引き継ぐ確認事項

`~/claude-lessons/lessons.md` より、この改修に該当するもの。

- **2026-08-23**: 非表示タブでは `getBoundingClientRect()` が 0 を返す。
  幾何を測る検証の前に `switchTab('sheet')` を呼ぶこと
- **2026-08-23**: ブラウザは既定で背景色を印刷しない。
  今回の区切りは `border` なので影響しないが、**背景色で表現してはいけない**
- **2026-08-30**: `@media print` の中の宣言は `getComputedStyle` で読めない。
  印刷まわりを確認するなら `document.styleSheets` を走査する
- **2026-08-31**: `localStorage.clear()` + リロードでは「結果が無い状態」にならない。
  `initLots()` が `SAMPLES.basic` を自動で読む。空の状態を作るなら `clearLots()` を使う
- **2026-09-16**: 実機確認は手順まで書く。Pixel 9a は初回に開けばサンプルが入った状態になる
- **2026-09-18**: 紙に伸びる要素を足すときは事前に実測する（§5-3 で実施済み）

---

## 6. テスト

`tests/sheet-placement.test.js` の末尾に追加する（着手前のベースラインは 157 件パス）。
実行コマンドは `node --test tests/sheet-placement.test.js tests/stash-overflow.test.js`。
`node --test tests/` は Node v22.15.0 ではディレクトリを解決できないので使わない。

`topHeadGroups()`:

1. 上段が先頭エリアだけ → グループ1つ、ラベル「軒下」、`slots === lay.top`
2. 上段が空 → グループ1つ、ラベル「軒下」、`slots === lay.top`
3. 先頭エリア以外だけ（出庫口横だけ）→ ラベルが「出庫口横」。**「軒下」ではない**
4. 退避だけ → ラベルが「未定」。**「退避」でも「軒下」でもない**
5. 下段からの回送だけ → ラベルがそのエリア名
6. エリア2種類 → グループ2つ、ラベルがそれぞれのエリア名
7. またがる欄だけが2つ目のエリアを使う日 → グループ1つ、ラベルが `軒下①・軒下②`
8. 1欄が3エリアにまたがる → ラベルが `先頭・2つ目 ほか`
9. **あふれ入力**（`entries.length > count`）→ `slots` 合計が `count` ちょうど
10. 欄数がグループの合計に満たない日 → 末尾グループに余りが足され、合計が `count`
11. `areas` が空の欄 → 落ちない
12. normal / wide の両方で `slots` 合計が `count`

`topSlotNote()`:

13. `areas` が1つ → 空文字
14. `areas` が2つ → `※2つ目`
15. 退避の欄 → 空文字

生成した HTML（既存の `tests/stash-overflow.test.js:110, 217` と同じサンドボックス方式）:

16. 行1の `colspan` 合計が `5 + 1 + Σ(slots*2) === lay.cols`（normal / wide 両方）
17. グループ境界の欄に `gsep` が付き、境界でない欄には付かない
18. 普段の日（またがる欄なし）は注釈行が全部空

ソース文字列の正規表現マッチ:

19. `FIT_LABEL` に `head` が入っていること
20. 見出しが入りきらないときの警告文が、品名ではなくエリア名の短縮を案内すること

---

## 7. 影響しないもの（触らない）

- `sheetPlacement()` の戻り値と引数
- `sheetSlots()` / `sheetEntries()` / `mergeEntries()` / `stashSlots()`
- `arrangeBottomSlots()` / `arrangeOverflowSlots()` / `overflowTable()`
- 下段の見出し・欄・注釈行
- `drawLeaders()` / `gridRows()` / `sheetGridAnchors()` / `gridWarn()`
- 保存形式（`STORE_KEY`、`SPACES_SAVE_VERSION`、`schedule`）
- 設定タブの表記（`spacesToText()` / `applyConfig()`）
- 欄数超過の警告と救済の告知の件数

`slotCells()` は §4-2 で引数を1つ足すので、このリストから外れる。
既存の呼び出しは省略時の振る舞いで従来どおり動くこと。

---

## 8. 未決事項・リスク

- **見出しの区切りと注釈行の関係**。2px の縦罫は注釈行には引かない（§3-4）。
  注釈行だけ区切りが途切れて見えるかは印刷プレビューで確認する
- **「 ほか」の表記**。3エリア以上を打ち切る文言はこの設計で決め打ちにしている。
  現場が別の言い方を好むなら実装後に変える（文字列1か所）
- **調査中に見つけた既存のバグ（今回の対象外）**。
  `applyDisplay()` が `fitSheetText()` だけ呼んで `drawLeaders()` を呼び直さないため、
  文字サイズを変えて行高が変わると引き出し線がずれる。見出しは `--fs-*` の対象外なので
  今回の改修とは無関係。別件として記録する
