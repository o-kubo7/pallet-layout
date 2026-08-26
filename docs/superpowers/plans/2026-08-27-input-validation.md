# 入力の不完全な行を赤枠で示す 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 「▶ 自動配置を作成」を押したとき、品名・個数・SNP のどれかが欠けている行があれば、欠けている欄だけを赤枠にして画面内にメッセージを出し、配置編集タブへ遷移させない。

**Architecture:** エラー状態は `<tr>` の `dataset.err`（欠けている欄をカンマ区切り）に持つ。行番号の配列で持つと行を消したときに番号がずれるため。クラスは状態そのものではなく dataset の写しとして扱い、`applyRowErr()` 1本がテーブル側とカード側の両方へ同じ内容を貼る。カードは `syncCards()` で毎回作り直されるので、その末尾で全行ぶんを貼り直す。

**Tech Stack:** 単一 HTML ファイル（`files/index.html`）内のバニラ JavaScript と CSS。ビルドツールもテストランナーも無い。

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の2つのみ。新しいファイルは作らない
- **編集位置は行番号ではなくコード片で指定している。** 各ステップの「変更前」の文字列を検索して置き換えること
- 自動テストの基盤が無いため、各タスクの検証はブラウザの DevTools コンソールと手動確認で行う
- 検証用のローカルサーバはリポジトリのルートで `python3 -m http.server 50999` を起動し、
  `http://localhost:50999/files/index.html` を開く。**ウィンドウ幅は 600px より広くしておく**
  （テーブルとカードが両方 DOM に居る状態で数えたいため）
- **必須は品名・個数・SNP。ロットは任意。** 種別（`<select>`）は常に値を持つので判定に含めない
- **空行（品名・ロット・SNP・個数がすべて空）はエラーにしない。** 末尾に常に空行がある UI なので、
  弾かないと常にエラーになる
- **欠けている欄の並びは `"name"` → `"snp"` → `"qty"` で固定。** テーブルもカードも欄の並びが
  品名 → ロット → SNP → 個数 なので、この順の先頭が「最初の欠け欄」になる
- **`.err` は `border-color` と `background` の両方に `!important` が要る。**
  カードの `.fld input{...;background:#fff}` は詳細度が `.err` より高く、そのままでは白背景に負ける
- **カードに後から付けたクラスは `syncCards()` の再生成で消える。** 再生成のたびに貼り直すこと
- **`readLots()` / `inputWarnHtml()` / `run(goMap)` / `alert("荷物を1件以上入力してください。")` には
  手を入れない。** バリデーションは `runFromButton()` にだけ置く
- 最後に `files/sw.js` の `CACHE_VERSION` を `v17` から `v18` にする（Task 3）
- 設計書は `docs/superpowers/specs/2026-08-27-input-validation-design.md`

---

## File Structure

| ファイル | 責任 | このプランでの変更 |
|---|---|---|
| `files/index.html` | アプリ全体（HTML・CSS・JS が1ファイル） | `.err` / `.inputerr` の CSS、`#inputErr` 要素、バリデーション一式の新セクション、`syncCards()` / `cardEdit()` / `runFromButton()` へのフック |
| `files/sw.js` | Service Worker（キャッシュ） | `CACHE_VERSION` の更新のみ |

新しい JS は既存のセクションコメントの区分に従い、「入力（スマホカード：テーブルと同期）」の
直後（`cardDelete()` の下、「品名のオートコンプリート」セクションの上）に
`/* ---------- 入力のバリデーション ---------- */` を立てて置く。

---

## 検証用データ

DevTools のコンソールに貼り付けて実行する。以降のタスクで「データ V」と参照する。

**データ V（完全な行・個数だけ欠けた行・ロットしか無い行・空行）**

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [{type:"仕掛品",name:"部品A",lot:"L-101",snp:10,qty:120},
   {type:"仕掛品",name:"部品B",lot:"L-102",snp:10,qty:0},
   {type:"仕掛品",name:"",     lot:"L-103",snp:0, qty:0},
   {type:"仕掛品",name:"",     lot:"",     snp:"",qty:""}].forEach(addRow);
  syncCards(); saveLots();
  return [...document.querySelectorAll("#lotTable tbody tr")].length+"行";
})()
```

期待される出力:

```
4行
```

---

## Task 1: 判定・赤枠・帯と、その解除

**Files:**
- Modify: `files/index.html`（CSS / 「荷物の入力」カードの `<h2>` 直下 / `cardDelete()` の下に新セクション / `syncCards()` の末尾 / `cardEdit()` の末尾）

**Interfaces:**
- Consumes: 既存の `rowValues(tr)`（`{type, name, lot, snp, qty, cells}` を返す。
  `cells` は `0=種別 1=品名 2=ロット 3=SNP 4=個数`）と `syncCards()`
- Produces:
  - `ERR_FIELDS = ["name","snp","qty"]` … 欄の並び順
  - `ERR_CELL = {name:1, snp:3, qty:4}` … `tr.querySelectorAll("select,input")` の添字
  - `missingFields(tr) -> string[]` … その行に足りない欄。空行なら `[]`
  - `validateLots() -> [{tr, i, fields}]` … 不完全な行だけ。`i` は0始まりの行番号
  - `applyRowErr(tr, i) -> void` … `dataset.err` どおりにクラスを貼り直す
  - `refreshRowErr(tr, i) -> void` … 赤枠の付いた行だけ取り直す
  - `updateErrBanner() -> void` … `#inputErr` の表示と文言
  - `showLotErrors(bad) -> void` … `validateLots()` の結果を画面に出し、最初の欠け欄へ連れていく
  - `focusFirstErr(r) -> void` … 可視な側（テーブル or カード）の欄へフォーカス＋スクロール

- [ ] **Step 1: `.err` と `.inputerr` の CSS を足す**

変更前（`.lotcard .foot .val.warn` で検索）:

```css
  .lotcard .foot .val{font-size:22px;font-weight:800}
  .lotcard .foot .val.warn{color:#b45309;font-size:15px}
```

変更後:

```css
  .lotcard .foot .val{font-size:22px;font-weight:800}
  .lotcard .foot .val.warn{color:#b45309;font-size:15px}

  /* ---- 入力の不備 ---- */
  /* background にも !important が要る。カードの .fld input{...;background:#fff} は
     詳細度が .err より高く、border だけ !important にすると白背景のままになる */
  .err{border-color:#dc2626 !important;background:#fef2f2 !important}
  .inputerr{margin:0 0 10px;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:600;
            background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
```

- [ ] **Step 2: メッセージの帯を置く**

既存の `#messages` は `#tab-edit` の中にあるので入力タブでは使えない。新しい要素を置く。

変更前（`<h2>荷物の入力` で検索）:

```html
      <h2>荷物の入力 <span class="badge">個数 ÷ SNP → パレット数</span></h2>

      <!-- スマホ: カード -->
```

変更後:

```html
      <h2>荷物の入力 <span class="badge">個数 ÷ SNP → パレット数</span></h2>

      <div id="inputErr" class="inputerr" style="display:none"></div>

      <!-- スマホ: カード -->
```

- [ ] **Step 3: バリデーション一式を新しいセクションとして足す**

変更前（`function cardDelete(i){` で検索）:

```js
function cardDelete(i){ const tr=trAt(i); if(!tr)return; tr.remove(); syncCards(); saveLots(); }

/* ---------- 品名のオートコンプリート ----------
```

変更後:

```js
function cardDelete(i){ const tr=trAt(i); if(!tr)return; tr.remove(); syncCards(); saveLots(); }

/* ---------- 入力のバリデーション ----------
   「▶ 自動配置を作成」を押したときだけ赤枠を出す。押す前は何も光らせない。
   状態は tr.dataset.err（欠けている欄をカンマ区切り）に持つ。
   行番号の配列で持つと、行を消したときに番号がずれて無関係な行が赤くなる。
   クラスは状態そのものではなく dataset.err の写しとして扱う。 */

const ERR_FIELDS=["name","snp","qty"];    // 欄の並び順。先頭が「最初の欠け欄」になる
const ERR_CELL={name:1, snp:3, qty:4};    // tr.querySelectorAll("select,input") の添字

// その行に足りない欄を返す。空行（種別以外すべて空）は対象外なので空配列。
// 末尾には常に空行があるので、これを弾かないと常にエラーになる
function missingFields(tr){
  const v=rowValues(tr);
  if(!v.name && !v.lot && v.snp<=0 && v.qty<=0) return [];
  const m=[];
  if(!v.name) m.push("name");
  if(v.snp<=0) m.push("snp");
  if(v.qty<=0) m.push("qty");
  return m;
}

function validateLots(){
  return [...document.querySelectorAll("#lotTable tbody tr")]
    .map((tr,i)=>({tr:tr, i:i, fields:missingFields(tr)}))
    .filter(r=>r.fields.length>0);
}

// dataset.err どおりにクラスを貼り直す。テーブルとカードの両方に同じ内容を貼る
function applyRowErr(tr,i){
  const on=(tr.dataset.err||"").split(",").filter(Boolean);
  const c=tr.querySelectorAll("select,input");
  const card=document.querySelector(`.lotcard[data-i="${i}"]`);
  ERR_FIELDS.forEach(f=>{
    const cell=c[ERR_CELL[f]];
    if(cell) cell.classList.toggle("err", on.includes(f));
    // SNP欄は候補が2つ以上あると <select> になるので、input だけを探すと当たらない
    const fld=card && card.querySelector(`.fld[data-f="${f}"] input,.fld[data-f="${f}"] select`);
    if(fld) fld.classList.toggle("err", on.includes(f));
  });
}

// 赤枠の付いている行だけを取り直す。付いていない行は触らない（押す前は静かなまま）
function refreshRowErr(tr,i){
  if(tr.dataset.err==null) return;
  const m=missingFields(tr);
  if(m.length) tr.dataset.err=m.join(","); else delete tr.dataset.err;
  applyRowErr(tr,i);
}

function updateErrBanner(){
  const n=document.querySelectorAll("#lotTable tbody tr[data-err]").length;
  const el=document.getElementById("inputErr");
  el.style.display = n ? "block" : "none";
  if(n) el.textContent=`⚠ 入力が足りない荷物が ${n} 件あります（品名・個数・SNP は必須）`;
}

// ボタンを押して不完全な行が見つかったとき
function showLotErrors(bad){
  document.querySelectorAll("#lotTable tbody tr").forEach(tr=>{ delete tr.dataset.err; });
  bad.forEach(r=>{ r.tr.dataset.err=r.fields.join(","); });
  syncCards();   // カードを作り直す。末尾で applyRowErr() と updateErrBanner() が走る
  focusFirstErr(bad[0]);
}

// 最初の欠け欄へ連れていく。
// テーブルとカードは幅で排他表示されるので、非表示側に focus() しても効かない。可視な側を選ぶ
function focusFirstErr(r){
  const f=r.fields[0];
  const tableVisible=document.getElementById("lotTableWrap").offsetParent!==null;
  const el = tableVisible
    ? r.tr.querySelectorAll("select,input")[ERR_CELL[f]]
    : document.querySelector(`.lotcard[data-i="${r.i}"] .fld[data-f="${f}"] input,`
                            +`.lotcard[data-i="${r.i}"] .fld[data-f="${f}"] select`);
  if(!el) return;
  // focus() の既定スクロールに任せると位置が中途半端になるので、止めてから自分で寄せる
  try{ el.focus({preventScroll:true}); }catch(e){ el.focus(); }
  el.scrollIntoView({behavior:"smooth", block:"center"});
}

/* ---------- 品名のオートコンプリート ----------
```

- [ ] **Step 4: `syncCards()` の末尾で赤枠を貼り直す**

カードは作り直されるので、後から付けたクラスは消える。作り直した直後に貼り直す。
`rowChanged()` / `cardSnpSelect()` / `acPick()` / `snpAdd()` / `cardType()` / `removeRow()` は
いずれも中で `syncCards()` を通るので、このフック1つで拾える。

変更前（`  }).join("");` で検索。ファイル内に1か所しかない）:

```js
      <button class="nextbtn" onclick="addNextRow(${i})">＋ 次の荷物</button>
    </div>`;
  }).join("");
}
```

変更後:

```js
      <button class="nextbtn" onclick="addNextRow(${i})">＋ 次の荷物</button>
    </div>`;
  }).join("");
  rows.forEach((tr,i)=>refreshRowErr(tr,i));   // カードを作り直したので赤枠を貼り直す
  updateErrBanner();
}
```

- [ ] **Step 5: `cardEdit()` にもフックを足す**

`cardEdit()` だけは入力中のフォーカスを保つため `syncCards()` を呼ばず `updateCardFoot()` で
済ませている。カード側で文字を打ったときに赤枠が消えるよう、ここにも足す。

変更前（`recalcRow(tr); saveLots(); updateCardFoot(i);` で検索）:

```js
  recalcRow(tr); saveLots(); updateCardFoot(i);
}
```

変更後:

```js
  recalcRow(tr); saveLots(); updateCardFoot(i);
  refreshRowErr(tr,i); updateErrBanner();   // syncCards() を通らない唯一の入力経路
}
```

- [ ] **Step 6: 判定が正しいことを確かめる**

ローカルサーバを起動し、ウィンドウ幅を 600px より広くしてページを開く。
DevTools のコンソールに「データ V」を貼って実行し、続けて次を実行する。

```js
validateLots().map(r=>r.i+":"+r.fields.join("+")).join(" ")
```

期待される出力:

```
'1:qty 2:name+snp+qty'
```

行0は完全なので出ない。行3は空行なので出ない。

- [ ] **Step 7: 赤枠と帯が出ることを確かめる**

```js
(function(){
  showLotErrors(validateLots());
  return [...document.querySelectorAll("#lotTable tbody tr")].map((tr,i)=>i+":"+(tr.dataset.err||"-")).join(" ")
       +" | table="+document.querySelectorAll("#lotTable .err").length
       +" | card="+document.querySelectorAll(".lotcard .err").length
       +" | "+document.getElementById("inputErr").textContent;
})()
```

期待される出力:

```
'0:- 1:qty 2:name,snp,qty 3:- | table=4 | card=4 | ⚠ 入力が足りない荷物が 2 件あります（品名・個数・SNP は必須）'
```

画面でも、行1の個数欄と行2の品名・SNP・個数欄が赤い枠＋薄い赤背景になり、
「荷物の入力」の見出し直下に赤い帯が出ていること。

- [ ] **Step 8: テーブル側で埋めると消えることを確かめる**

```js
(function(){
  const c=document.querySelectorAll("#lotTable tbody tr")[1].querySelectorAll("select,input");
  c[4].value="50"; rowChanged(c[4]);
  const tr=document.querySelectorAll("#lotTable tbody tr")[1];
  return "row1="+(tr.dataset.err||"-")
       +" | table="+document.querySelectorAll("#lotTable .err").length
       +" | banner="+document.getElementById("inputErr").style.display;
})()
```

期待される出力:

```
'row1=- | table=3 | banner=block'
```

- [ ] **Step 9: カード側で埋めると消えることを確かめる**

```js
(function(){
  cardEdit(2,1,"部品A"); cardEdit(2,3,"10"); cardEdit(2,4,"30");
  const tr=document.querySelectorAll("#lotTable tbody tr")[2];
  return "row2="+(tr.dataset.err||"-")
       +" | table="+document.querySelectorAll("#lotTable .err").length
       +" | card="+document.querySelectorAll(".lotcard .err").length
       +" | banner="+document.getElementById("inputErr").style.display;
})()
```

期待される出力:

```
'row2=- | table=0 | card=0 | banner=none'
```

赤枠が1つも残っておらず、帯も消えていること。

- [ ] **Step 10: 赤枠の付いていない行を触っても何も起きないことを確かめる**

ページを再読み込みし、「データ V」だけを実行する（`showLotErrors()` は呼ばない）。
そのうえで次を実行する。

```js
(function(){
  const c=document.querySelectorAll("#lotTable tbody tr")[0].querySelectorAll("select,input");
  c[4].value=""; rowChanged(c[4]);   // 完全だった行を空にする
  return "err="+document.querySelectorAll(".err").length
       +" | banner="+document.getElementById("inputErr").style.display;
})()
```

期待される出力:

```
'err=0 | banner=none'
```

ボタンを押していないので、値を消しても赤枠は出ない。

- [ ] **Step 11: コミット**

```bash
git add files/index.html
git commit -m "feat: 入力の不完全な行を判定して赤枠と帯で示せるようにする

エラー状態は tr.dataset.err に持ち、クラスはその写しとして
テーブルとカードの両方へ applyRowErr() が貼る。カードは syncCards() で
作り直されるため、その末尾で貼り直す。cardEdit() だけは syncCards() を
通らないので個別にフックした。

まだ「自動配置を作成」からは呼んでいない（Task 2）。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 2: 「▶ 自動配置を作成」から止める

**Files:**
- Modify: `files/index.html`（`runFromButton()` の先頭）

**Interfaces:**
- Consumes: Task 1 の `validateLots()` と `showLotErrors(bad)`
- Produces: 不完全な行があるとき `runFromButton()` は `run(true)` を呼ばずに return する。
  `hasManual()` の確認ダイアログも `unknownItems()` の登録確認も出ない

- [ ] **Step 1: 現状を確かめる（この時点では素通りする）**

ページを再読み込みし、コンソールに「データ V」を貼って実行したあと、
画面の「▶ 自動配置を作成」を押す。

現状: 警告も赤枠も出ないまま配置が作られ、**配置編集タブへ遷移する**。これが直す対象。

- [ ] **Step 2: `runFromButton()` の先頭にバリデーションを置く**

`hasManual()` の確認より**前**に置く。入力が不完全なまま「手動調整を破棄しますか」と
聞くのは筋が悪く、破棄せずに直せるようにする。

変更前（`function runFromButton(){` で検索）:

```js
function runFromButton(){
  if(hasManual() && !confirm("手動調整を破棄して自動配置し直します。よろしいですか？")) return;

  // 未登録の品目は、何を入れるか見せてから登録する。
```

変更後:

```js
function runFromButton(){
  // 入力が不完全なら、ここで止める。手動調整の破棄を聞く前に返すので、破棄せずに直せる
  const bad=validateLots();
  if(bad.length){ showLotErrors(bad); return; }

  if(hasManual() && !confirm("手動調整を破棄して自動配置し直します。よろしいですか？")) return;

  // 未登録の品目は、何を入れるか見せてから登録する。
```

- [ ] **Step 3: 止まることを確かめる**

ページを再読み込みし、コンソールに「データ V」を貼って実行したあと、
画面の「▶ 自動配置を作成」を押す。

確認すること:

- **配置編集タブへ遷移しない**（入力タブのまま）
- 「荷物の入力」の見出し直下に「⚠ 入力が足りない荷物が 2 件あります（品名・個数・SNP は必須）」が出る
- 行1の個数欄、行2の品名・SNP・個数欄が赤枠
- 行1の個数欄にフォーカスが来ている（カーソルが点滅している）
- `alert()` が出ない

コンソールで裏取りする:

```js
document.getElementById("tabbtn-input").classList.contains("active")+" / "+document.activeElement.placeholder
```

期待される出力:

```
'true / 個数'
```

入力タブが選ばれたまま、個数欄にフォーカスが来ている。

- [ ] **Step 4: 直すと通ることを確かめる**

画面上で行1の個数に `50` を入れ、行2の品名に `部品A`・個数に `30` を入れる
（品名を入れると SNP は自動で 10 が入る）。赤枠と帯がその場で消えること。

そのうえで「▶ 自動配置を作成」を押す。配置が作られ、配置編集タブへ遷移すること。

- [ ] **Step 5: 未登録品目の登録確認より前で止まることを確かめる**

ページを再読み込みし、コンソールで次を実行する。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  [{type:"仕掛品",name:"新部品ZZ",lot:"N-001",snp:24,qty:96},
   {type:"仕掛品",name:"部品A",   lot:"L-101",snp:10,qty:0}].forEach(addRow);
  syncCards(); saveLots();
  return "未登録="+unknownItems().map(m=>m.name).join(",");
})()
```

期待される出力:

```
'未登録=新部品ZZ'
```

この状態で「▶ 自動配置を作成」を押す。
**「次の品目が未登録です」の confirm が出ないこと**（バリデーションが先に return する）。
行2の個数欄が赤枠になり、そこにフォーカスが来ること。

- [ ] **Step 6: 空の表では従来どおり alert が出ることを確かめる**

「入力をクリア」を押し（confirm は OK）、そのまま「▶ 自動配置を作成」を押す。

`alert("荷物を1件以上入力してください。")` が出ること。赤枠も帯も出ないこと
（空行はエラーにしないので `validateLots()` は空を返し、従来の経路に落ちる）。

- [ ] **Step 7: 画面外の行まで連れていくことを確かめる**

ページを再読み込みし、コンソールで次を実行する。

```js
(function(){
  document.querySelector("#lotTable tbody").innerHTML="";
  for(let i=1;i<=14;i++) addRow({type:"仕掛品",name:"部品"+i,lot:"L-"+(100+i),snp:10,qty:30});
  addRow({type:"仕掛品",name:"部品A",lot:"L-999",snp:10,qty:0});   // 最下行だけ不完全
  syncCards(); saveLots(); window.scrollTo(0,0);
  return validateLots().map(r=>r.i+":"+r.fields.join("+")).join(" ");
})()
```

期待される出力:

```
'14:qty'
```

ページ最上部にいる状態で「▶ 自動配置を作成」を押す。
最下行の個数欄まで自動でスクロールし、赤枠が画面の中ほどに見える状態で止まること。

- [ ] **Step 8: カード表示でも動くことを確かめる**

DevTools のデバイスツールバー等でウィンドウ幅を 600px 以下にする（テーブルが隠れ、カードが出る）。
ページを再読み込みし、コンソールに「データ V」を貼って実行したあと「▶ 自動配置を作成」を押す。

確認すること:

- カード2枚目の個数欄、カード3枚目の品名・SNP・個数欄が赤枠
- カード2枚目の個数欄にフォーカスが来ている

コンソールで裏取りする:

```js
document.getElementById("lotTableWrap").offsetParent+" / "
 +document.activeElement.closest(".lotcard").dataset.i+" / "
 +document.activeElement.closest(".fld").dataset.f
```

期待される出力:

```
'null / 1 / qty'
```

`offsetParent` が `null` ＝テーブルは非表示。その状態でカード側の欄にフォーカスが来ている。

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "feat: 入力が不完全なまま自動配置へ進めないようにする

runFromButton() の先頭で validateLots() を通す。hasManual() の
破棄確認より前に置いたので、入力を直すのに手動調整を捨てずに済む。
未登録品目の登録確認にも進まない。

テーブルとカードは幅で排他表示されるため、フォーカス先は
offsetParent で可視面を判定してから選ぶ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Task 3: 更新を配り、実機で確かめる

**Files:**
- Modify: `files/sw.js`（`CACHE_VERSION` のみ）

**Interfaces:**
- Consumes: Task 1・Task 2 の変更が入った `files/index.html`
- Produces: 新しい Service Worker が install され、旧キャッシュが破棄される

- [ ] **Step 1: `CACHE_VERSION` を上げる**

`sw.js` の HTML はネットワーク優先なので `index.html` の更新はオンラインなら即届く。
それでも上げるのは、`sw.js` 自体が変わることで新しい Service Worker が install され、
「新しいバージョンがあります」バーが出て旧キャッシュが破棄されるため。

変更前:

```js
const CACHE_VERSION = "v17";
```

変更後:

```js
const CACHE_VERSION = "v18";
```

- [ ] **Step 2: コミット**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v18 に上げる

入力バリデーションの追加を配るため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 3: 実機（Pixel 9a）で確かめる**

合成イベントには既定動作が無いため、フォーカス移動と Gboard の挙動は
ブラウザの自動操作では確定しない。ここは実機でしか確認できない。

ユーザーに次の手順を渡し、結果を報告してもらう。

1. 「入力をクリア」で空にする
2. 1行目に品名「部品A」だけ入れる（SNP が 10 に自動補完される）→「▶ 自動配置を作成」
   → 帯が出る／個数欄だけが赤枠／**配置編集タブに飛ばない**／個数欄にフォーカスが来る
3. 個数を入力 → 赤枠がその場で消え、帯も消える
4. もう一度ボタン → 配置が作られ、配置編集タブへ飛ぶ
5. 未登録の品名（例「テスト品」）だけの行を作ってボタン → SNP と個数の2つが赤枠
6. 行を10行ほど増やし、画面外になる最下行だけ不完全にしてボタン
   → その行まで自動でスクロールし、赤枠が見える状態で止まる
7. 完全な行と不完全な行が混在する状態でボタン → 配置は作られず、不完全な行だけが赤枠
8. Gboard が開いた状態でも、赤枠の欄がキーボードに隠れていない

**8 で隠れる場合は停止して相談する。** `scrollIntoView` のタイミングを
`visualViewport` の `resize` まで遅らせる必要があり、設計の範囲を超える。
