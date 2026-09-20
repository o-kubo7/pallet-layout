# 朝・昼別の伝票入力と配置管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 朝便・昼便ごとに複数品目を持つFAX伝票／仮伝票を入力し、配置編集・配置表・手動調整を相互に混ぜずに作成・保存できるようにする。

**Architecture:** 画面のDOMは1組のまま、`schedule.shifts.am/pm` に伝票・自動配置結果・手動調整・入力指紋を分離して保存する。`activeTiming` の切替時に現在の伝票DOMを保存し、対象側の伝票と一致する配置スナップショットを復元する。伝票／品目の固定文字列IDは入力の同一性にだけ使い、既存配置アルゴリズムの数値 `lot.id` は毎回 `readLots()` で生成して維持する。

**Tech Stack:** `files/index.html` のバニラHTML/CSS/JavaScript、`localStorage`、既存Service Worker (`files/sw.js`)。ビルド・テストランナーなし。純粋関数はブラウザコンソール、表示と操作はローカルHTTPプレビューで検証する。

**Spec:** `docs/superpowers/specs/2026-09-07-am-pm-slip-input-design.md`

## Global Constraints

- 既存の配置アルゴリズム、配置編集の選択・ドラッグ・退避、配置表の欄割りと印刷寸法を変えない。
- 伝票／品目IDは `s-<時刻>-<連番>` / `i-<時刻>-<連番>` 形式の文字列、配置結果の `lot.id` は現行どおり0始まりの数値とする。`data-lot`、`fills[].id`、`sel.lotId` を文字列IDへ置換しない。
- 必須項目は品名・SNP・個数。ロットはFAX受領済みでも仮伝票でも任意。空ロット品目は、同じ品名でも品目IDが異なれば統合しない。
- 伝票を追加した時点でFAX枚数／仮件数に数える。伝票内に完全な品目が1件もない場合は「品目を1件以上入力してください」として自動配置を止め、枚数照合と入力漏れ検出を両立する（2026-09-07 ユーザー確認済み）。途中の完全な空行は無視する。
- `status` は入力指紋に含めない。仮伝票をロット空欄のままFAX受領済みに変更でき、既存の配置を古くしない。
- 入力変更で保存済み配置を削除しない。指紋不一致中だけ配置編集・配置表・印刷を利用不可にし、入力を完全に元へ戻したら自動配置または手動調整を復元する。
- `入力をクリア` は確認後、選択中の時間帯の `slips/result/manual/resultFingerprint` だけを空にする。反対側と共通設定は残す。
- スマホカードDOMと同期経路は完全に撤去し、PC／スマホとも同じ伝票内テーブルを操作する。320px／360pxでページと伝票表の横スクロールを発生させない。
- 入力の `<input>` / `<select>` はスマホでも16pxを維持する。狭幅時の種別選択肢は表示文字だけ `仕／商` にし、値は `仕掛品／商品` を保つ。
- `date`、マスタ、配置マス、表示設定は共通。配置マスの幾何変更は朝・昼両方の保存結果を指紋不一致にする。掲載先だけの変更は既存配置を再利用する。
- 新保存形式が存在しない初回だけ旧 `lots/head/manual` を移行する。旧キーはロールバック用に残し、新形式があれば二度と読み直さない。
- 旧manualは新旧のlot列が1対1対応すると検証できた場合だけ新指紋へ付け替えて移行する。同名・空ロット複数行など対応が一意でない場合は、入力を残して手動配置だけを破棄し、自動配置し直した理由を画面表示する（2026-09-07 ユーザー確認済み）。
- fresh install の既存デモは朝側へ「旧1行＝FAX伝票1枚」で入れ、昼側は空にする。保存済み旧データは `head.timing` 側へ入れ、反対側は空にする。
- 行番号は計画作成時の `44a85fd` を基準にした目安。実装では必ず関数名・ID・置換前コードで場所を特定する。
- 実ブラウザ検証は `python3 -m http.server 8765 --directory files` と `http://localhost:8765/` を使う。`file://` は使わない。
- 検証前にService WorkerとCache Storageを消して再読込する。

```js
const regs=await navigator.serviceWorker.getRegistrations();
await Promise.all(regs.map(r=>r.unregister()));
if(window.caches){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}
location.reload();
```

- ダイアログを伴う自動検証では先に `window.confirm=()=>true`、`window.alert=m=>window.__alert=m` を設定する。
- タブ非表示中の配置表寸法は測らない。`switchTab("sheet")` 後に1 animation frame待って測る。

## Dig Review Decisions

- 2ラウンド・2質問で高リスク前提を確認した。
- 入力漏れ検出: 伝票は追加時点で枚数に数え、完全な品目が0件なら配置を止める（ユーザー確認済み）。これにより「枚数は合うが中身を入力していない」を見逃さない。
- 旧手動配置: 同名・空ロット複数行で新旧lot対応が一意でない場合、入力は全件移行し、手動配置だけ自動配置へ戻して理由を表示する（ユーザー確認済み）。
- 移行の原子性: 新scheduleは互換性判定と必要な再配置が完了するまで保存せず、失敗時は旧キーから再試行可能にする。
- 初期化依存: scheduleより先に動くSPACES移行はactive shiftへ触れずフラグだけ残し、schedule読込後に両側の配置を無効化する。
- 残存リスクは320px実機のブラウザ固有date input幅、iOSキーボード、印刷ダイアログ、旧保存の実データ形状であり、Task 3・7・8の実機／移行フィクスチャ検証で判定する。未回答の重大事項はない。

---

## File Structure

- `files/index.html`
  - CSS: 時間帯切替、日付行、伝票ブロック、スマホ固定レイアウト、状態メッセージ
  - HTML: 入力・配置編集・配置表の時間帯切替、伝票一覧、入力クリア移動
  - JS: scheduleモデル、旧データ移行、伝票DOM、時間帯切替、鮮度判定、時間帯別配置保存
- `files/sw.js`
  - `CACHE_VERSION` を `v30` から `v31` へ更新
- `files/README.md`
  - 朝／昼、FAX／仮伝票、ロット空欄、時間帯別クリアと印刷の運用を追記

新しい実行時ファイルや依存パッケージは追加しない。

---

## Task 1: scheduleモデルと旧保存の移行を純粋関数で作る

**Files:**
- Modify: `files/index.html:911-977`（グローバル状態、`STORE_KEY`、保存ヘルパ）
- Modify: `files/index.html:4054-4090`（`initLots` / `initHead` を後で置換できる初期化境界）

**Interfaces:**
- Consumes: `saveData()`, `loadData()`, `snpsOf()`, `SAMPLES.basic`, `clone()`
- Produces:
  - `TIMING_KEYS`, `TIMING_LABEL`, `SCHEDULE_VERSION`, `activeTiming`, `schedule`
  - `newStableId(prefix) -> string`
  - `emptyShift() -> {slips,result,manual,resultFingerprint}`
  - `emptySchedule(date) -> schedule`
  - `normalizeItem(raw)`, `normalizeSlip(raw)`, `normalizeShift(raw)`
  - `migrateLegacySchedule(lots, head, manual) -> {value,legacyManual}`
  - `legacyManualCompatible(manualLots, newLots) -> boolean`
  - `loadOrMigrateSchedule() -> {value,wasMigrated,legacyManual,warnings}`
  - `saveSchedule() -> boolean`
- Later tasks consume these helpers; this task does not touch the visible input UI.

- [ ] **Step 1: RED — 純粋関数の期待値をコンソールで先に固定する**

現行画面を開き、次を実行する。最初は `emptyShift is not defined` で失敗することを確認する。

```js
console.assert(JSON.stringify(Object.keys(emptyShift()))===JSON.stringify(["slips","result","manual","resultFingerprint"]));
const a=newStableId("s"), b=newStableId("s");
console.assert(/^s-/.test(a) && a!==b);
const old=[{type:"商品",name:"A",lot:"",snp:"10",qty:"11"},{type:"仕掛品",name:"B",lot:"L2",snp:"5",qty:"5"}];
const m=migrateLegacySchedule(old,{date:"2026-09-08",timing:"ひる"},{fp:"x",sp:[],lots:[]});
console.assert(m.value.activeTiming==="pm" && m.value.date==="2026-09-08");
console.assert(m.value.shifts.am.slips.length===0 && m.value.shifts.pm.slips.length===2);
console.assert(m.value.shifts.pm.slips.every(s=>s.status==="fax" && s.items.length===1));
console.assert(m.value.shifts.pm.manual===null && m.legacyManual.fp==="x");
```

- [ ] **Step 2: GREEN — 保存キーとモデル生成を追加する**

`STORE_KEY` に `schedule:"palletApp.schedule"` を追加し、グローバル状態の直後へ次の責務を持つ実装を置く。

```js
const TIMING_KEYS=["am","pm"];
const TIMING_LABEL={am:"あさ",pm:"ひる"};
const SCHEDULE_VERSION=1;
let activeTiming="am", schedule=null, stableSeq=0;
function newStableId(prefix){
  stableSeq++;
  return prefix+"-"+Date.now().toString(36)+"-"+stableSeq.toString(36);
}
function emptyShift(){
  return {slips:[],result:null,manual:null,resultFingerprint:null};
}
function emptySchedule(date){
  return {version:SCHEDULE_VERSION,date:date||"",activeTiming:"am",
          shifts:{am:emptyShift(),pm:emptyShift()}};
}
```

`normalizeItem()` は値を文字列として保持し、欠けたIDだけ採番する。`normalizeSlip()` は `status` を `fax/provisional` の二値へ正規化し、壊れた `items` だけ空配列へ戻す。`normalizeShift()` は対象側だけを空へ戻せるよう例外を外へ漏らさない。

`normalizeShift()` は `result/manual` についても `{fp:string,lots:Array,sp:Array}` の形を個別に検査し、壊れたスナップショットだけ `null` にする。伝票が正常なのに壊れた配置JSONのため起動全体が止まらないようにする。

- [ ] **Step 3: GREEN — 旧1行を1伝票へ変換する**

`migrateLegacySchedule()` は次の形で実装する。

```js
function migrateLegacySchedule(rows,head,manual){
  const date=head&&head.date ? head.date : defaultHeadDate();
  const out=emptySchedule(date);
  const key=head&&head.timing==="ひる" ? "pm" : "am";
  out.activeTiming=key;
  if(Array.isArray(rows)) out.shifts[key].slips=rows.map(r=>({
    id:newStableId("s"),status:"fax",items:[normalizeItem(r)]
  }));
  const legacyManual=manual&&Array.isArray(manual.sp)&&Array.isArray(manual.lots)
    ? clone(manual) : null;
  return {value:out,legacyManual:legacyManual};
}
```

`defaultHeadDate()` は現在の翌日をローカル日付で `YYYY-MM-DD` にする。UTC変換で日付がずれないよう `toISOString()` に依存せず年・月・日を組み立てる。

- [ ] **Step 4: 新形式優先のロードを実装する**

`loadOrMigrateSchedule()` の分岐を以下に固定する。

1. `STORE_KEY.schedule` が `version===1` なら、各shiftを個別に正規化し `{value,wasMigrated:false,legacyManual:null,warnings}` で返す。旧キーは読まない。
2. 新形式が無ければ旧 `lots/head/manual` を読み、`migrateLegacySchedule()` で変換候補を作る。この時点では新形式を保存しない。
3. 旧 `lots` が無ければ `SAMPLES.basic` を朝側へ1行1伝票で入れ、昼側は空にする。
4. 片側の構造が壊れていればその側だけ `emptyShift()` にし、`scheduleLoadWarning` に時間帯名を記録する。

旧manualはこのタスクではscheduleへ直接入れず、`legacyManual` として返す。Task 4で新 `readLots()` が完成した後、Task 6の起動処理で新旧lot列を順番どおり `{type,name,lot,qty,snp,pallets}` で比較する。さらに、旧行から旧形式の入力指紋を再構築して `legacyManual.fp` と一致すること、および印刷意味を持つ派生値 `half/parts` が新旧で一致することを検証する。すべてを厳密に確認できる場合だけ新lotの `sourceKey` を旧manual.lotsへ補い、`manual.fp` を新しい `fingerprintFor(slips)` に差し替えて対象shiftへ保存する。指紋、件数、値、派生値のいずれかが一致しない、または旧指紋を再構築できない場合はmanualを移行せず警告を立てる。

移行はTask 6でmanual互換性判定と必要な自動配置まで完了した後、最後に新scheduleを1回保存して確定する。途中で例外・タブ終了・保存失敗が起きた場合は新キーが存在しないため、残してある旧キーから次回起動時に再試行できる。部分変換した新scheduleを先に保存して旧manualを読み飛ばす状態を作らない。

- [ ] **Step 5: GREEN確認とコミット**

Step 1を再実行して全assertが通ることに加え、次を確認する。

```js
const bad=normalizeShift({slips:"broken",result:{x:1}});
console.assert(Array.isArray(bad.slips) && bad.slips.length===0);
console.assert(emptySchedule("2026-09-08").shifts.am!==emptySchedule("2026-09-08").shifts.pm);
```

```bash
git add files/index.html
git commit -m "feat: 朝昼別の保存モデルを追加"
```

---

## Task 2: 入力画面を伝票ブロックへ置き換える

**Files:**
- Modify: `files/index.html:28-60,321-365`（入力CSS）
- Modify: `files/index.html:527-579`（入力タブHTML）
- Modify: `files/index.html:1031-1350`（行操作、カード同期の撤去）

**Interfaces:**
- Consumes: Task 1の `schedule`, `activeTiming`, `newStableId()`, `normalizeItem()`, `saveSchedule()`
- Produces:
  - `activeShift() -> shift`
  - `addSlip(status, data?)`, `removeSlip(button)`, `receiveSlip(button)`
  - `addItemRow(slipOrId, item?)`, `removeItemRow(button)`
  - `renderSlips(slips)`, `readSlips()`, `saveActiveSlips()`
  - `updateSlipCounts()`
  - `syncCompactLabels()`
- Removes: `#lotCards`, `.lotcards`, `.lotcard*`, `syncCards()`, `cardEdit()` と全 `card*` / `snpAdd` / `snpCancel` / `focusField` 経路

- [ ] **Step 1: RED — 伝票DOMの期待値を先に実行する**

最初は `renderSlips is not defined` または要素不在で失敗する。

```js
renderSlips([
 {id:"s-a",status:"fax",items:[{id:"i-a",type:"商品",name:"A",lot:"L1",snp:"10",qty:"11"}]},
 {id:"s-b",status:"provisional",items:[{id:"i-b",type:"仕掛品",name:"B",lot:"",snp:"5",qty:"5"}]}
]);
console.assert(document.querySelectorAll("#slipList .slip").length===2);
console.assert(document.querySelectorAll("#slipList tbody tr").length===2);
console.assert(document.getElementById("slipCount").textContent.includes("FAX伝票 1枚"));
console.assert(document.getElementById("slipCount").textContent.includes("仮 1件"));
console.assert(readSlips()[1].items[0].id==="i-b");
```

- [ ] **Step 2: 入力タブの上部と伝票一覧を組み替える**

既存の「搬入日と納品タイミング」カードと「荷物の入力」テーブルを次の構造へ置換する。

```html
<div class="card input-head">
  <div class="date-row">
    <div class="date-field"><label for="dateInput">搬入日</label><input type="date" id="dateInput" onchange="onHeadChange()"><span id="dowHint"></span></div>
    <button class="btn-mini clear-input" onclick="clearLots()">入力をクリア</button>
  </div>
  <div class="timing-switch" data-timing-switch></div>
  <div class="slip-count" id="slipCount"></div>
</div>
<div id="inputErr" class="inputerr" style="display:none"></div>
<div id="slipList"></div>
<div class="row-actions input-add-actions">
  <button class="btn btn-ghost" onclick="addSlip('fax')">＋ FAX伝票を追加</button>
  <button class="btn btn-ghost" onclick="addSlip('provisional')">＋ 仮伝票を追加</button>
  <label class="chk"><input type="checkbox" id="mixChk" checked> 満杯時に混載を許可</label>
  <button class="btn btn-primary" id="runBtnInline" onclick="runFromButton()">▶ 自動配置を作成</button>
</div>
```

サンプルボタンとルール注記は残し、`入力をクリア` は下部操作列から除く。`.date-row` は `display:flex;justify-content:space-between;min-width:0`、削除系は既存 `.btn-mini` を基調にする。

- [ ] **Step 3: 伝票レンダラと操作を実装する**

`renderSlips()` は各伝票を `.slip[data-slip-id]` として描く。見出しは並び順からFAXと仮を別々に連番化し、固定IDを画面の番号に使わない。各ブロックはこの骨格を満たす。

```html
<section class="slip" data-slip-id="s-a" data-status="fax">
  <div class="slip-head"><b>伝票 1</b><span class="item-count">品目 1件</span></div>
  <table class="slip-table">
    <colgroup><col class="c-type"><col class="c-name"><col class="c-lot"><col class="c-snp"><col class="c-qty"><col class="c-pal"><col class="c-del"></colgroup>
    <thead><tr><th>種別</th><th>品名</th><th>ロット</th><th>SNP</th><th>個数</th><th>パレット数</th><th></th></tr></thead>
    <tbody></tbody>
  </table>
  <div class="slip-actions">
    <button class="btn btn-ghost" onclick="addItemRow(this)">＋ 品目を追加</button>
    <span class="slip-action-spacer"></span>
    <button class="btn-mini" onclick="removeSlip(this)">伝票を削除</button>
  </div>
</section>
```

仮伝票では見出しへ `FAX未着`、操作列へ `<button data-receive onclick="receiveSlip(this)">FAX受領済みにする</button>` を足す。`.slip-action-spacer{margin-left:auto}` により「伝票を削除」を常に右端へ寄せる。`receiveSlip()` は `status` だけ変更して保存・再描画し、ロットの有無を検査しない。

- [ ] **Step 4: 品目行の既存入力支援を新DOMへ移す**

`addRow()` を `addItemRow()` へ置き換え、行に `data-item-id` を持たせる。`rowValues()` / `recalcRow()` の5入力の順序は維持し、既存の品名候補、SNP自動補完、Enter遷移を再利用する。

- `rowChanged()` は `recalcRow(tr); saveActiveSlips(); refreshFreshness();` を呼ぶ。
- 個数欄Enterは同じ伝票の次品目を追加する。次伝票は明示的な追加ボタンだけで作る。
- 最後の品目を削除した場合は同じ伝票に新しい空品目を1行戻し、伝票自体は残す。
- `readSlips()` は空欄を含む全品目と固定IDを保存する。
- `removeSlip()` は時間帯名と表示伝票名を含む確認を出してから削除する。
- `saveLots()` は撤去し、全呼出箇所を `saveActiveSlips()` に置換する。
- 品名・ロットなど保存値をHTMLへ戻す箇所は必ず既存 `esc()` を通す。固定IDは生成／正規化した値だけを `dataset` に設定し、保存値をinline handlerの文字列引数へ埋め込まない。

- [ ] **Step 5: カード専用コードを削除する**

`.lotcards` HTML/CSS、`syncCards()`、`cardSnpSelect()`、`snpAdd()`、`snpCancel()`、`focusField()`、`cardEdit()`、`updateCardFoot()`、`cardType()`、`cardDelete()`、`data-card` 分岐を削除する。`acPick()` / `nextField()` / `focusFirstErr()` は可視性判定なしで、現在行の次欄または同じ伝票の次行だけを対象にする。

- [ ] **Step 6: GREEN確認とコミット**

Step 1を再実行後、手動で次を確認する。

- FAX伝票に2品目追加しても枚数は1枚のまま
- 仮伝票をロット空欄で受領済みにでき、FAX +1／仮 -1
- 伝票削除ボタンが右端、品目削除は即時、伝票削除には確認あり
- 個数Enterで同じ伝票内に行が増える

```bash
git add files/index.html
git commit -m "feat: 入力を伝票単位へ変更"
```

---

## Task 3: スマホでも同じ7列表を画面内へ収める

**Files:**
- Modify: `files/index.html:28-60,321-365`（テーブルと600px以下のCSS）
- Modify: `files/index.html`（`syncCompactLabels()` とmatchMedia監視）

**Interfaces:**
- Consumes: Task 2の `.slip-table`, `renderSlips()`
- Produces: PC／スマホ共通DOM、狭幅表示ラベル、横幅回帰の測定ヘルパ

- [ ] **Step 1: RED — 320pxのはみ出しを測る**

ブラウザ幅を320pxへ変更し、2伝票・各2行を表示して実行する。修正前は `fits` が偽になることを確認する。

```js
window.inputWidthProbe=()=>({
  vw:innerWidth,
  body:document.documentElement.scrollWidth,
  slips:[...document.querySelectorAll(".slip-table")].map(t=>({
    w:+t.getBoundingClientRect().width.toFixed(1),
    parent:+t.parentElement.getBoundingClientRect().width.toFixed(1),
    scroll:t.scrollWidth
  })),
  fits:document.documentElement.scrollWidth<=innerWidth &&
       [...document.querySelectorAll(".slip-table")].every(t=>t.scrollWidth<=t.parentElement.clientWidth)
});
console.assert(inputWidthProbe().fits);
```

- [ ] **Step 2: 固定レイアウトと割合列幅を実装する**

600px以下では `.slip` の左右paddingを6px、`.slip-table{table-layout:fixed;width:100%;max-width:100%}` とし、colgroupを `種11% / 品23% / ロット18% / SNP14% / 個数14% / P数12% / ×8%` にする。セルpaddingは2px、入力paddingは1px、入力最小幅は0、フォントは16pxを維持する。削除ボタンは44px最小幅の `.btn-mini` を流用せず、品目行専用 `.item-delete` をセル幅内の24px角にする。

`overflow-x:auto` やテーブルの `min-width` を足して達成しない。`.wrap`、`.card`、`.slip`、`.slip-table` のいずれも `min-width:0` とする。

- [ ] **Step 3: 見出しと種別の表示文字を幅で切り替える**

見出しは同一DOM内に `.wide-label` / `.compact-label` を置きCSSで切り替える。種別selectは値を変えず、次で表示テキストだけ切り替える。

```js
const compactInputMq=matchMedia("(max-width:600px)");
function syncCompactLabels(){
  const short=compactInputMq.matches;
  document.querySelectorAll(".slip-table select.item-type").forEach(sel=>{
    const labels=short?["仕","商"]:["仕掛品","商品"];
    [...sel.options].forEach((o,i)=>{o.textContent=labels[i];});
  });
}
compactInputMq.addEventListener("change",syncCompactLabels);
```

古いSafari向けに `addEventListener` が無い場合は `addListener` をフォールバックする。`renderSlips()` の末尾でも呼ぶ。

- [ ] **Step 4: 320px／360px／PCでGREEN確認してコミット**

- 320pxと360pxで `inputWidthProbe().fits===true`
- 320pxで7列、日付、クリアボタン、件数がすべて画面内
- 入力欄のcomputed font-sizeが全て `16px`
- 900pxで見出しと種別が長い表記へ戻る
- 長い品名・ロットを入力しても表幅が増えない

```bash
git add files/index.html
git commit -m "feat: スマホ入力を7列表へ統一"
```

---

## Task 4: 入力検証とロット統合を伝票モデルへ合わせる

**Files:**
- Modify: `files/index.html:1117-1138`（`readLots`）
- Modify: `files/index.html:1328-1415`（入力検証とフォーカス）
- Modify: `files/index.html:2346-2418`（指紋、未登録品目、実行入口）
- Modify: `files/index.html:2555-2570`（退避用 `lotKey`）

**Interfaces:**
- Consumes: Task 2の `readSlips()`, `.slip`, `data-item-id`
- Produces:
  - `placementInput(slips) -> item[]`
  - `fingerprintFor(slips) -> string`
  - `validateSlips() -> {badRows,emptySlips}`
  - `readLots() -> {lots,unknown,typeMix}`（既存返却型を維持）
  - `lot.sourceKey`（空ロットの退避・再配置同一性）

- [ ] **Step 1: RED — 統合規則を先に固定する**

次のテストは修正前の平坦DOMでは失敗する。

```js
renderSlips([{id:"s1",status:"provisional",items:[
 {id:"i1",type:"商品",name:"A",lot:"",snp:"10",qty:"11"},
 {id:"i2",type:"商品",name:"A",lot:"",snp:"10",qty:"11"},
 {id:"i3",type:"商品",name:"B",lot:"L1",snp:"10",qty:"11"},
 {id:"i4",type:"商品",name:"B",lot:"L1",snp:"10",qty:"11"}
]}]);
const r=readLots();
console.assert(r.lots.length===3);
console.assert(r.lots.filter(x=>x.name==="A").every(x=>x.pallets===2));
console.assert(r.lots.find(x=>x.name==="B").pallets===4);
const fp1=fingerprintFor(readSlips());
receiveSlip(document.querySelector(".slip [data-receive]"));
console.assert(fingerprintFor(readSlips())===fp1);
```

- [ ] **Step 2: 配置入力と指紋を純粋化する**

`placementInput(slips)` は表示順で全品目を平坦化し、`slipId/itemId/status` を添える。`fingerprintFor(slips)` は配置に影響する `itemId,type,name,lot,snp,qty` と `spacesToText(false)` だけをJSON化する。`slipId` と `status` は除き、同じ品目を別伝票へ移しても配置計算が同じなら指紋を変えない。

空ロットのキーは `"__item\0"+itemId`、入力済みロットは `name+"\0"+lot` とする。生成するlotへ `sourceKey:key` を保持し、`code` はロットが空なら品名、品名も空なら表示行番号にする。パレット数は品目行ごとに切り上げてから既存グループへ加算する。

- [ ] **Step 3: 退避照合を `sourceKey` 優先へ変える**

```js
function lotKey(l){
  return l.sourceKey || ((l.name||"")+"\u0000"+(l.lot||""));
}
```

これにより同名・空ロット2行の退避枚数が別の荷物へ移らない。保存済み旧lotには `sourceKey` が無いので従来キーへフォールバックする。

- [ ] **Step 4: 伝票単位の検証を実装する**

`missingFields(tr)` は既存規則を維持する。`validateSlips()` は不完全行に加え、完全な品目が1件もない伝票を `emptySlips` へ入れる。`showLotErrors()` は空伝票の見出しへ `.err-slip` を付け、メッセージを次のいずれかにする。

- 行不足のみ: `入力が足りない品目が n件あります`
- 空伝票のみ: `品目が入力されていない伝票が n件あります`
- 両方: 両件数を1つの帯に表示

最初の不完全行があればその最初の欄、なければ最初の空伝票の「＋ 品目を追加」へフォーカス／スクロールする。カード可視性分岐は削除する。

- [ ] **Step 5: GREEN確認とコミット**

Step 1を通し、さらに次を確認する。

```js
renderSlips([{id:"s0",status:"fax",items:[{id:"i0",type:"仕掛品",name:"",lot:"",snp:"",qty:""}]}]);
const v=validateSlips();
console.assert(v.badRows.length===0 && v.emptySlips.length===1);
```

完全な品目＋末尾空行の伝票は通り、品名・SNP・個数の途中入力は赤枠になることも確認する。

```bash
git add files/index.html
git commit -m "feat: 伝票単位の入力検証を追加"
```

---

## Task 5: 朝・昼切替と配置結果の鮮度制御を実装する

**Files:**
- Modify: `files/index.html:590-699`（配置編集／配置表の上部UI）
- Modify: `files/index.html:1931-1940,2078-2145`（再描画、タブ、空状態）
- Modify: `files/index.html:2328-2418`（時間帯別の結果／手動保存）
- Modify: `files/index.html:3291-3318`（日付と旧 `setTiming`）

**Interfaces:**
- Consumes: Tasks 1–4のschedule、`renderSlips()`, `readSlips()`, `fingerprintFor()`, `renderResult()`
- Produces:
  - `renderTimingSwitches()`, `setActiveTiming(key)`
  - `captureActiveShift()`, `restoreActiveShift()`
  - `activePlacementSnapshot()`, `isActiveFresh()`, `refreshFreshness()`
  - 時間帯別 `saveManual()`, `clearManual()`, `hasManual()`, `restoreManual()`

- [ ] **Step 1: RED — 切替分離と状態変化の期待値を固定する**

```js
schedule=emptySchedule("2026-09-08"); activeTiming="am";
schedule.shifts.am.slips=[{id:"sa",status:"fax",items:[{id:"ia",type:"商品",name:"朝",lot:"A",snp:"10",qty:"10"}]}];
schedule.shifts.pm.slips=[{id:"sp",status:"provisional",items:[{id:"ip",type:"商品",name:"昼",lot:"",snp:"5",qty:"5"}]}];
restoreActiveShift();
console.assert(readSlips()[0].items[0].name==="朝");
setActiveTiming("pm");
console.assert(readSlips()[0].items[0].name==="昼");
console.assert(activeTiming==="pm" && schedule.activeTiming==="pm");
setActiveTiming("am");
console.assert(readSlips()[0].items[0].name==="朝");
```

- [ ] **Step 2: 3タブへ共通の時間帯切替を置く**

入力、配置編集、配置表の上部に `<div class="timing-switch" data-timing-switch></div>` を置く。`renderTimingSwitches()` は各コンテナへ `あさ／ひる` ボタンを描き、全ボタンの `.on` と `aria-pressed` を同期する。設定タブには置かない。

配置編集は切替→状態メッセージ→設定ボタン／盤、配置表は切替→印刷ボタン→倍率／表の順にし、結果が無い側でも時間帯切替を隠さない。

- [ ] **Step 3: 切替の保存・復元を実装する**

`setActiveTiming(key)` は同じkeyなら再描画だけ、異なる場合は次の順序に固定する。

1. `acClose()` と `clearSel()` でDOM参照を捨てる。
2. `captureActiveShift()` で現在DOMのslipsと最新manualをscheduleへ保存する。
3. `activeTiming` と `schedule.activeTiming` を変更して即保存する。
4. `renderSlips(target.slips)`。
5. `restoreActiveShift()` で指紋一致するmanualを優先し、次にresultを復元する。
6. 一致する結果がなければグローバル `lastLots/lastSp/lastFp/hasResult` を空にする。
7. 3タブの切替、件数、空／古い状態、現在可視のタブを描き直す。

- [ ] **Step 4: 配置結果と手動調整を時間帯別に保存する**

`run()` 成功時は現在側へ次を保存する。

```js
const fp=fingerprintFor(readSlips());
activeShift().result={fp:fp,lots:clone(lastLots),sp:clone(lastSp)};
activeShift().manual=null;
activeShift().resultFingerprint=fp;
saveSchedule();
```

`saveManual()` は現在側の `manual={fp:lastFp,lots:clone(lastLots),sp:clone(lastSp)}` を更新する。入力変更時にresult/manualを消さない。`restoreActiveShift()` は現在の指紋と一致するmanual→resultの順で復元するため、入力を元へ戻すと手動状態まで戻る。

- [ ] **Step 5: 古い状態を配置編集・印刷から遮断する**

`refreshFreshness()` は入力変更後に現在指紋を照合する。一致しなければ盤と表を隠し、次を表示する。

- 保存結果なし: `ひるの配置はまだ作成されていません`
- 保存結果あり・不一致: `入力が変更されています。あさの自動配置を作成し直してください`

印刷ボタンは `disabled`、`printSheet()` と `beforeprint` も `isActiveFresh()` が偽なら印刷を始めない。元の入力へ戻って一致した瞬間は `restoreActiveShift()` で結果を再表示する。

- [ ] **Step 6: 日付を共通scheduleへ移す**

`headDate` は既存描画互換の別名として残してもよいが、`onHeadChange()` は `schedule.date` を更新して `saveSchedule()` する。旧 `headTiming` / `setTiming()` / `tmAM` / `tmPM` は削除し、`renderSheet()` の丸は `TIMING_LABEL[activeTiming]` で決める。

- [ ] **Step 7: GREEN確認とコミット**

Step 1を通し、次を確認する。

- 朝で自動配置→手動移動→昼へ切替→朝へ戻ると手動移動が残る
- 朝の品名を変更すると朝だけ盤・印刷が無効、昼は利用可能
- 朝の品名を元へ戻すと朝の手動配置が復元
- 仮→FAX受領済み変更では盤も印刷も有効なまま
- ロット追記では対象側だけ再配置要求

```bash
git add files/index.html
git commit -m "feat: 朝昼別の配置状態を切り替える"
```

---

## Task 6: クリア・サンプル・配置マス変更を時間帯境界へ合わせる

**Files:**
- Modify: `files/index.html:1140-1158`（`clearLots`, `loadSample`）
- Modify: `files/index.html:3125-3203`（`applyConfig`, `resetConfig`）
- Modify: `files/index.html:4054-4090`（新schedule初期化の接続）

**Interfaces:**
- Consumes: Task 5の状態切替・鮮度API
- Produces: 時間帯限定クリア、時間帯限定サンプル読込、両時間帯の幾何変更無効化、完成した起動復元

- [ ] **Step 1: RED — 片側クリアの期待値を固定する**

```js
schedule.shifts.am.slips=[{id:"sa",status:"fax",items:[]}];
schedule.shifts.pm.slips=[{id:"sp",status:"fax",items:[]}];
activeTiming="am"; window.confirm=()=>true; clearLots();
console.assert(schedule.shifts.am.slips.length===0);
console.assert(schedule.shifts.am.result===null && schedule.shifts.am.manual===null);
console.assert(schedule.shifts.pm.slips.length===1);
```

- [ ] **Step 2: `clearLots()` を選択側限定にする**

確認文は `` `${TIMING_LABEL[activeTiming]}の入力をすべてクリアします。よろしいですか？（反対側と品目マスタは残ります）` ``。承認後は `schedule.shifts[activeTiming]=emptyShift()`、伝票DOMを空表示、配置グローバルを空にして保存する。空のFAX伝票を自動追加しない。

- [ ] **Step 3: サンプル読込を現在側だけへ限定する**

`loadSample(which)` は現在側の手動調整が新鮮なときだけ破棄確認を出し、サンプルの各行を1枚のFAX伝票へ変換する。反対側を変更しない。読込後に `run(true)` して現在側resultを保存する。

- [ ] **Step 4: 共通配置マス変更の影響を両側へ伝える**

`applyConfig()` / `resetConfig()` は変更前後の `spacesToText(false)` を比較する。

- 掲載先だけ変更: 各shiftのスナップショットを維持し、現在側を再描画する。
- 幾何変更: result/manualを削除せず保持するが、新しい指紋と一致しないため朝・昼とも再配置要求になる。現在側だけ `refreshFreshness()` し、反対側は切替時に同じ判定を受ける。

既存の `run(false)` による現在側の暗黙再配置は削除する。設定変更直後の警告は新しい配置が作られるまで「再配置してください」に置き換える。

- [ ] **Step 5: 起動順を統合する**

既存 `initLots` と `initHead` を1つの `initSchedule` へ置き換え、マスタとSPACESの初期化後に実行する。

1. `const loaded=loadOrMigrateSchedule(); schedule=loaded.value`
2. `activeTiming=schedule.activeTiming`
3. `headDate=schedule.date`
4. 日付・曜日・時間帯切替を描画
5. `renderSlips(activeShift().slips)`
6. `loaded.legacyManual` があれば新 `readLots()` と互換性を検査し、互換なら新指紋へ付け替えて対象shiftへ保存する。非互換なら入力だけ残して警告を用意する。
7. `bootDraw(()=>{ if(!restoreActiveShift() && loaded.wasMigrated && activeShift().slips.some(s=>s.items.some(i=>i.name||i.lot||i.qty))) run(false); })`
8. 自動再計算した旧移行データはresultへ保存する。新形式で結果無しの側は勝手に再計算しない。manual非互換警告は `run(false)` がメッセージを描き直した後に追加する。
9. 移行処理が最後まで成功してから `saveSchedule()` する。保存に失敗した場合は既存の保存失敗表示を出し、旧キーを消さず、実行中メモリの画面は利用可能にする。

新形式か旧移行かを `loadOrMigrateSchedule()` の返却メタ情報で区別し、「保存済み新形式で結果なし」を起動ごとに自動配置しない。

既存の `initSpaces()` はschedule初期化より先に動くため、保存バージョン不一致時に時間帯別 `clearManual()` を直接呼ばない。代わりに `spacesWereReset=true` を記録し、旧 `STORE_KEY.manual` を消したうえで、schedule読込後に朝・昼両方の `result/manual/resultFingerprint` を空へ戻す。schedule未初期化状態でactive shiftへ触れない。

- [ ] **Step 6: GREEN確認とコミット**

Step 1を通し、旧保存移行を隔離したオリジン／localStorageクリア後に次の3ケースで確認する。

- fresh: 朝に基本サンプル、昼は空
- 旧 `head.timing:"ひる"`: 旧行と旧manualが昼、朝は空
- 新形式: リロードしても両側の伝票・選択中時間帯・結果が同じ

```bash
git add files/index.html
git commit -m "feat: 時間帯別の初期化とクリアを完成"
```

---

## Task 7: 配置表・印刷・既存機能の非退行を確認する

**Files:**
- Modify: `files/index.html:3307-3318,3648-3710`（印刷入口と時間帯表示）
- Modify: `files/index.html`（必要な状態メッセージの最終調整）

**Interfaces:**
- Consumes: Task 5の `activeTiming`, `isActiveFresh()`, 時間帯別 `lastLots/lastSp`
- Produces: 現在時間帯だけの表示・印刷、既存配置編集と用紙レイアウトの非退行

- [ ] **Step 1: RED — 朝昼の配置表見出しを検査する**

朝・昼それぞれ異なる合計P数で自動配置済みにし、次を実行する。

```js
function sheetProbe(){
  switchTab("sheet"); renderSheet();
  const sheet=document.querySelector("#sheetView .sheet");
  const table=sheet&&sheet.querySelector("table");
  return {timing:activeTiming,total:lastLots&&lastLots.reduce((a,l)=>a+l.pallets,0),
          ring:sheet&&sheet.querySelector(".ring")&&sheet.querySelector(".ring").textContent,
          width:table&&+table.getBoundingClientRect().width.toFixed(1),
          cols:table&&table.querySelectorAll("colgroup col").length};
}
setActiveTiming("am"); const am=sheetProbe();
setActiveTiming("pm"); const pm=sheetProbe();
console.assert(am.ring==="あさ" && pm.ring==="ひる" && am.total!==pm.total);
```

- [ ] **Step 2: 印刷入口を鮮度でガードする**

`printSheet()` は現在側が新鮮な場合だけ `switchTab("sheet")` → `renderSheet()` → `window.print()`。`beforeprint` も同じ条件で現在側だけを描く。古い側では `window.print()` を呼ばず状態メッセージを表示する。

- [ ] **Step 3: 紙の基準値を比較する**

`SAMPLES.basic` 相当を朝側へ読み、配置表を可視にして測る。今回の変更で許される差は、選択時間帯と入力内容に由来するセル文字だけ。

```js
const sheet=document.querySelector("#sheetView .sheet");
const table=sheet.querySelector("table");
const z=parseFloat(getComputedStyle(sheet).zoom)||1;
const cols=[...table.querySelectorAll("colgroup col")];
console.assert(cols.length===14);
console.assert(Math.abs(table.getBoundingClientRect().width/z-674)<3);
console.assert(document.querySelectorAll("#sheetView svg path").length>=5);
```

- [ ] **Step 4: 配置編集の回帰を確認する**

朝側で、マス選択、なぞり、ドラッグ、退避、倉庫へ戻すを既存ハンドラで行い、朝→昼→朝の切替後にも保存された配置が戻ることを確認する。昼側の `lastSp` に朝側操作が入らないことをJSON比較する。

- [ ] **Step 5: GREEN確認とコミット**

```bash
git add files/index.html
git commit -m "feat: 朝昼別の配置表と印刷を完成"
```

---

## Task 8: 文書・Service Worker・最終回帰を仕上げる

**Files:**
- Modify: `files/README.md`
- Modify: `files/sw.js:6`
- Verify: `files/index.html`

**Interfaces:**
- Consumes: Tasks 1–7の完成実装
- Produces: 利用者向け手順、更新配信、最終検証記録

- [ ] **Step 1: READMEへ運用を追記する**

次を簡潔に記載する。

- 入力・配置編集・配置表の朝／昼切替は共通
- 1枚のFAXに複数品目行を追加する方法
- FAX枚数と仮件数の意味
- 仮伝票はロット空欄で配置・受領済み変更が可能
- 空ロット品目は統合されない
- 入力クリアと印刷は選択中の時間帯だけ
- 入力変更後は再配置が必要

- [ ] **Step 2: Service Workerのキャッシュ版を上げる**

`files/sw.js` の `CACHE_VERSION` を `"v30"` から `"v31"` へ変更する。README中の更新例も現行値と次版が矛盾しないよう更新する。

- [ ] **Step 3: 構文と残骸を静的検査する**

```bash
rg -n "lotCards|lotcard|syncCards|cardEdit|data-card|tmAM|tmPM|headTiming|STORE_KEY\.lots|STORE_KEY\.head|STORE_KEY\.manual" files/index.html
git diff --check
```

期待: 旧カード／旧時間帯／旧入力保存の実行コード参照は0件。移行コード内の `STORE_KEY.lots/head/manual` だけは許容し、コメントまたは明示した旧キー定数として残る。

HTML内scriptの構文をNodeで抽出検査する。

```bash
node -e 'const fs=require("fs"),s=fs.readFileSync("files/index.html","utf8"),m=s.match(/<script>([\s\S]*)<\/script>/);new Function(m[1]);console.log("script syntax ok")'
```

- [ ] **Step 4: デスクトップと狭幅の全シナリオを確認する**

HTTPプレビューを起動し、Service Workerを消してから以下を順に実行する。

1. 朝: FAX2枚（片方2品目）＋仮1件を入力、自動配置、手動移動、配置表表示。
2. 仮をロット空欄で受領済みにし、件数だけ変わり配置が維持される。
3. 昼: 朝と異なるFAX1枚を入力・配置。朝へ戻して入力・手動配置・合計が不変。
4. 朝の入力を変更し、朝の編集・印刷だけ停止。元へ戻して復元。
5. 昼の「入力をクリア」で昼だけ消え、朝は残る。
6. リロード、オフライン再起動で両側を復元。
7. 320px／360pxで `inputWidthProbe().fits===true`、全入力16px、横スクロールなし。
8. PCで長い表記、入力候補、Enter遷移、赤枠、サンプル読込が動く。
9. 朝・昼それぞれA4横1ページの印刷プレビューになる。

- [ ] **Step 5: キャッシュ更新を確認する**

オンラインで一度開いてv31を取得し、DevToolsのOfflineへ切り替えて再読込する。朝／昼両方の保存データと新しい伝票UIが表示されることを確認する。

- [ ] **Step 6: 最終diffとコミット**

```bash
git diff --check
git status --short
git diff --stat HEAD~8..HEAD
git add files/README.md files/sw.js
git commit -m "docs: 朝昼別の伝票運用を追記"
```

実装コミット数が異なる場合、`HEAD~8` はこの計画開始時のコミット `44a85fd` との比較へ置き換える。

---

## 最終受入基準

- 朝と昼で伝票、配置結果、手動調整、配置表が混ざらない。
- FAX枚数と仮件数を手元の伝票と照合できる。
- 1伝票に複数品目を持て、未入力伝票を自動配置前に発見できる。
- 仮伝票はロット空欄のまま配置・受領済み変更でき、空ロット同士は統合されない。
- 入力変更後の古い配置を編集・印刷できず、入力を戻せば保存結果を復元できる。
- `入力をクリア` と印刷は選択中の時間帯だけに作用する。
- 320px／360pxでPCと同じ行形式の7列が横スクロールなしで収まる。
- 旧保存データと旧手動調整が該当時間帯へ一度だけ移行される。
- リロード・オフライン再起動後も両側の状態を復元できる。
- 既存の配置編集操作とA4横1枚の配置表レイアウトに回帰がない。
