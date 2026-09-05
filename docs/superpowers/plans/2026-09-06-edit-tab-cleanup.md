# 配置編集タブの整理 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置編集タブを開いた瞬間から、ボタンを1つも押さずになぞって編集できるようにし、盤より上に出ているものを ⚙ ボタン1つだけにする。

**Architecture:** 「移動モード」「通路編集モード」「指の使い方」という3つの切り替えを消し、`moveMode` を常に真・`tool` を常に `"sweep"` に固定する。案内・退避スペースの位置・マスの大きさは既存の DOM のままアコーディオンへたたむ。選択数と選択解除は盤の上端に貼りつく帯へ移す。**配置のモデル（`place()` / `col.aisle`）と配置図の表には一切触らない。**

**Tech Stack:** 単一 HTML ファイル（`files/index.html`, 4045 行）。ビルド無し・テストランナー無し。検証はブラウザのコンソールで `javascript_tool` から実行する。

**設計書:** `docs/superpowers/specs/2026-09-06-edit-tab-cleanup-design.md`

## Global Constraints

- **紙（配置図の表）は1マスも変わらない。** この環境での実測基準値（`SAMPLES.basic`、2026-09-06）:
  `colCount 14 / colW ["48px"] / tableW 674 / tableH 474.3 / top欄 [96,96,96,96] / btm欄 [96×7] / 線 5 / top 3 / bottom 6 / sheetMsg "" / warn null`
- **通路の概念は残す。** `col.aisle`、スペース設定の `*` 表記、`place()` の `useAisle` パス、
  `SHEET_GRID_ORDER` の通路列、`showCapacity()` の「通常◯P＋通路◯P」はすべて変更しない。
  消すのは**その日だけ列を通路に切り替える操作**だけ
- `place()` / `areaCandidates()` / `renderSheet()` / `sheetPlacement()` / `sheetSlots()` /
  `gridRows()` / `fitSheetText()` / `printSheet()` は変更しない
- 退避スペース（`stashdock` / `zone-stash` / `drawStashDock` / `drawStashBar` /
  `returnSelToWarehouse`）となぞりの判定ロジック（`sweep` の `mode` 遷移）は変更しない
- **保存キーを増やさない。** `palletApp.navShow` / `palletApp.stashPos` / `palletApp.cell` は
  現状のまま使う。**アコーディオンの開閉は保存しない**
- 案内（`navShow`）で消えるのは**説明文だけ**。選択数・選択解除・なぞりの取り消しは
  案内を切っても出す
- `#toolFlag` は `position:sticky; top:0` のまま。盤の外に選択数を二重に出さない
- 実機は **Pixel 9a / Android Chrome**、PWA のスタンドアロン表示

> **この計画に書かれた行番号は、すべて改修前（`366d354`）の値。**
> 各タスクが行を削るので、後のタスクほど実際の行は前へずれる。
> **行番号ではなく、各ステップの「置換前のコード」の文字列で該当箇所を特定すること。**

### 検証の定型（毎タスクの冒頭で必ず実行）

`preview_start` に `{"name":"pallet-layout"}` を渡してサーバを起動し、
`http://localhost:8765/` を開く。

> **`file://` で開いてはいけない。** この環境では静的スナップショットとして描かれ、
> スクリプトが動かない（2026-09-06 に実測）。過去の計画には `file://` と書いてあるが、
> いまは使えない。

`http` では Service Worker が登録される（`index.html:4024` は
`location.protocol.startsWith("http")` で判定）。**古い版を見続けるのを防ぐため、
検証の前に毎回これを実行してからリロードする。**

```js
const regs = await navigator.serviceWorker.getRegistrations();
await Promise.all(regs.map(r=>r.unregister()));
if(window.caches){ const ks=await caches.keys(); await Promise.all(ks.map(k=>caches.delete(k))); }
location.reload();
```

**`javascript_tool` は呼び出しをまたぐとトップレベルの `const` / `function` 宣言が
引き継がれない。** ヘルパは `window.probe = function(){...}` の形で定義する。
リロードすると消えるので、リロード後は毎回入れ直す。

**px を測る前に必ず `innerWidth` を確かめる。** Browser pane が実サイズを持たないと
`innerWidth === 0` になり、`getBoundingClientRect()` は数値を返すのに値が丸ごと嘘になる
（2026-09-06 実測。284.6px のはずが 1616.5px を返した）。0 なら `resize_window` に
`{"width":412,"height":915}`（Pixel 9a 相当）を渡してから測る。測り終えたら
`{"preset":"desktop"}` で戻す。

**結果が無い状態は `clearLots()` で作る。** 全行の SNP を空にする方法は
`run()` の別の枝（盤が出たまま `hasResult=false`）に入るので、作りたい状態と違う。
`clearLots()` は `hasResult=false; lastLots=null; showMapState();` で終わり、
打ち消しが無い（`files/index.html:1094-1099`）。冒頭で `confirm()` するのでスタブが要る。

**合成イベントを使わない。** `dispatchEvent` した PointerEvent は `isTrusted:false` で
既定動作を持たないため、タップ・なぞり・スクロールはブラウザ上では再現できない。
`toggleCell(el)` / `switchTab(name)` / `applyMove(...)` などハンドラ関数を直接呼ぶ。
指の操作の確認は Task 7（実機）に送る。

ダイアログはテストを止めるので、毎回先に潰す。

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
```

### 測定ヘルパ（各タスクの検証で使い回す）

```js
// 紙の非退行。前回計画（2026-09-01）と同じ形
window.probe=function(){
  switchTab('sheet');
  const sheet=document.querySelector("#sheetView .sheet");
  if(!sheet) return {err:"sheet null"};
  const tbl=sheet.querySelector("table");
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const w=e=>+(e.getBoundingClientRect().width/z).toFixed(1);
  const cols=[...tbl.querySelectorAll("colgroup col")];
  const slotRows=[...tbl.rows].filter(r=>r.querySelector("td.slot"));
  const paths=[...sheet.querySelectorAll("svg path")].map(p=>p.getAttribute("d")||"");
  const warn=[...document.querySelectorAll("#messages .msg.warn")]
    .map(d=>d.textContent.trim()).filter(t=>t.includes("載りきらない"))[0]||null;
  return {colCount:cols.length, colW:[...new Set(cols.map(c=>c.style.width))],
    tableW:w(tbl), tableH:+(tbl.getBoundingClientRect().height/z).toFixed(1),
    top欄:[...slotRows[0].querySelectorAll("td.slot")].map(w),
    btm欄:[...slotRows[3].querySelectorAll("td.slot")].map(w),
    線:paths.filter(d=>!d.startsWith("M-")).length,
    top:sheetSlots("top").length, bottom:sheetSlots("bottom").length,
    sheetMsg:document.getElementById("sheetMsg").textContent.trim(), warn};
};
// 配置編集タブの表面。何が残っていて何が消えたかを1発で見る
window.ui=function(){
  switchTab('edit');
  const card=document.getElementById("editCard");
  const ids=["moveBtn","editBtn","editHint","moveHint","toolCtl","selCount",
             "dockCtl","sizeCtl","editCtl","editCfg","cfgToggleBtn",
             "toolFlag","toolFlagText","toolFlagCount","flagClearBtn","sweepUndoBtn"];
  const fns=["setEditMode","toggleEdit","toggleMove","setMoveMode","isTouchDevice",
             "setTool","toggleEditCfg","updateFlag","showSelCount"];
  return {
    card直下:[...card.children].map(el=>el.tagName+(el.id?"#"+el.id:"")),
    dom:Object.fromEntries(ids.map(i=>[i, !!document.getElementById(i)])),
    win:Object.fromEntries(fns.map(f=>[f, typeof window[f]])),
    state:{moveMode:(typeof moveMode==="undefined"?null:moveMode),
           editMode:(typeof editMode==="undefined"?null:editMode),
           tool:(typeof tool==="undefined"?null:tool),
           navShow, dockPos, hasResult},
    mapBodyCls:document.getElementById("mapBody").className,
    flag:{disp:getComputedStyle(document.getElementById("toolFlag")).display,
          text:(document.getElementById("toolFlagText")||{}).textContent,
          count:(document.getElementById("toolFlagCount")||{}).textContent}
  };
};
// 盤より上の高さ。innerWidth が 0 なら測らずに err を返す
window.topH=function(){
  if(!innerWidth) return {err:"innerWidth 0。resize_window で 412x915 を指定すること"};
  switchTab('edit'); window.scrollTo(0,0);
  const card=document.getElementById("editCard"), map=document.getElementById("mapBody");
  return {vw:innerWidth,
          上部の高さ:+(map.getBoundingClientRect().top-card.getBoundingClientRect().top).toFixed(1),
          子:[...card.children].filter(el=>el.id!=="mapBody"&&el.id!=="editEmpty")
              .map(el=>(el.id||el.tagName)+":"+ +el.getBoundingClientRect().height.toFixed(1))};
};
// 盤のマスを1つ拾う（ロット id を指定。既定は最初に見つかったマス）
window.cellOf=function(lotId){
  const q = lotId==null ? '#mapBody .cell[data-lot]'
                        : '#mapBody .cell[data-lot="'+lotId+'"]';
  return document.querySelector(q);
};
```

### 改修前の基準値（2026-09-06 実測）

```
ui().card直下  : ["H2","DIV#editHint","DIV#moveHint","DIV#toolCtl",
                  "DIV#dockCtl","DIV#sizeCtl","DIV#messages","DIV#mapBody","DIV#editEmpty"]
ui().state     : {moveMode:false, editMode:false, tool:"scroll",
                  navShow:true, dockPos:"tr", hasResult:true}
ui().mapBodyCls: "dock-tr"
probe()        : {colCount:14, colW:["48px"], tableW:674, tableH:474.3,
                  top欄:[96,96,96,96], btm欄:[96,96,96,96,96,96,96],
                  線:5, top:3, bottom:6, sheetMsg:"", warn:null}
```

412×915（Pixel 9a 相当）に `resize_window` してから測った、盤より上の高さ:

```
上部の高さ（#editCard の上端 → #mapBody の上端）: 284.6px
  内訳  H2 44px ／ #dockCtl 86px ／ #sizeCtl 40px ／ #messages 61.6px ＋ 各余白
  #stashDock の幅: 136px（33vw）。帯に使える幅は約 250px しかない
```

**Task 5 で 130〜160px まで減っていること**を確認する。増えていたら
帯（Task 4）かアコーディオンの余白を疑う。

---

## File Structure

このアプリは単一 HTML ファイルなので、新しいファイルは作らない。

- `files/index.html` … CSS・HTML・JS がこの1ファイルに入っている。
  今回触るのは次の4か所だけで、いずれも配置編集タブの表面に属する
  - CSS（119-206 付近）… `.colwrap.editable` を削り、`.editctl` / `.editcfg` を足す
  - HTML（543-575 / 588-592）… タブ上部の作り替えと、帯の中身の分割
  - JS のモード（2064-2072 / 2036-2043 / 2220-2300）… `editMode` / `moveMode` / `tool` の固定
  - JS の帯（2722-2800）… `updateFlag()` / `showSelCount()` の作り替え
- `files/sw.js` … `CACHE_VERSION` を1つ上げるだけ

---

## Task 1: 通路編集を取り除く

**Files:**
- Modify: `files/index.html:121-122`（CSS `.colwrap.editable`）
- Modify: `files/index.html:545`（`#editBtn`）
- Modify: `files/index.html:547`（`#editHint`）
- Modify: `files/index.html:864`（`let editMode`）
- Modify: `files/index.html:1984`（`drawZone()` の `editCls`）
- Modify: `files/index.html:2040-2042`（`switchTab()` の解除処理）
- Modify: `files/index.html:2225-2231`（`setEditMode()`）
- Modify: `files/index.html:2244-2251`（`toggleEdit()`）
- Modify: `files/index.html:2291-2297`（通路トグルの click ハンドラ）

**Interfaces:**
- Consumes: なし（最初のタスク）
- Produces: `editMode` / `setEditMode()` / `toggleEdit()` が存在しなくなる。
  以降のタスクは `moveMode` だけを見る

- [ ] **Step 1: 改修前の基準値を控える**

「検証の定型」を実行してから、ヘルパを入れて測る。

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic");
JSON.stringify({ui:ui(), probe:probe()})
```

期待: 「改修前の基準値」と一致すること。**この2つの値をこのあと何度も突き合わせる。**

- [ ] **Step 2: 通路の現状も控える**

```js
JSON.stringify({
  cap: document.getElementById("capacity").textContent,
  cfg: document.getElementById("cfgText").value.split("\n").filter(l=>l.includes("*")),
  aisleCols: SPACES.flatMap(s=>s.cols.map((c,i)=>c.aisle?s.name+"#"+i:null)).filter(Boolean)
})
```

期待: `cap` に「通常◯P＋通路◯P」が出ていること、`aisleCols` が空でないこと。
**Task 1 のあとでこの3つが変わっていなければ、通路の概念は生きている。**

- [ ] **Step 3: CSS から `.colwrap.editable` を消す**

置換前（`files/index.html:121-122`）:

```css
  .colwrap.editable{cursor:pointer}
  .colwrap.editable:hover .col,.colwrap.editable:hover .hrow{outline:2px solid var(--accent)}
```

→ 2行とも削除する。

- [ ] **Step 4: `#editBtn` と `#editHint` を消す**

置換前（`files/index.html:545`）:

```html
        <button id="editBtn" class="btn btn-ghost" style="margin-left:8px" onclick="toggleEdit()">通路を編集</button>
```

→ 削除する。

置換前（`files/index.html:547`）:

```html
      <div id="editHint" class="hint" style="display:none;margin-bottom:8px">✏ 編集モード：マスをタップするとその列が「通路（灰・破線）」⇔「通常」に切り替わります。</div>
```

→ 削除する。

- [ ] **Step 5: `editMode` の宣言を消す**

置換前（`files/index.html:864`）:

```js
let editMode=false;
```

→ 削除する。

- [ ] **Step 6: `drawZone()` の `editCls` を消す**

置換前（`files/index.html:1984-1988`）:

```js
      const editCls = editMode? " editable":"";
      const gapCls = blockStart? " blockgap":"";
      const style = place ? ` style="${place}"` : "";
      return `<div class="colwrap${col.aisle?' aisle':''}${editCls}${gapCls}"`
           + ` data-space="${sp.name}" data-col="${ci}"${style}>${inner}${cap}</div>`;
```

置換後:

```js
      const gapCls = blockStart? " blockgap":"";
      const style = place ? ` style="${place}"` : "";
      return `<div class="colwrap${col.aisle?' aisle':''}${gapCls}"`
           + ` data-space="${sp.name}" data-col="${ci}"${style}>${inner}${cap}</div>`;
```

- [ ] **Step 7: `switchTab()` の解除処理から `editMode` を落とす**

置換前（`files/index.html:2038-2043`）:

```js
  // 移動モードと通路編集モードは配置編集タブでしか操作できない。
  // 他のタブへ移ったら解除する。残すと、戻ってきたとき「なぜかマスが選べる」状態になる
  if(name!=="edit" && (moveMode || editMode)){
    setMoveMode(false); setEditMode(false);
    redraw();   // editable クラスは DOM に焼き込まれているので描き直して落とす
  }
```

置換後:

```js
  // 移動モードは配置編集タブでしか操作できない。
  // 他のタブへ移ったら解除する。残すと、戻ってきたとき「なぜかマスが選べる」状態になる
  if(name!=="edit" && moveMode){
    setMoveMode(false);
  }
```

`redraw()` を落とすのは、焼き込まれるクラスが `editable` だけだったため
（`drawZone()` は `moveMode` 由来のクラスを付けていない）。

- [ ] **Step 8: `setEditMode()` と `toggleEdit()` を消す**

置換前（`files/index.html:2225-2231`）:

```js
function setEditMode(on){
  editMode=on;
  const b=document.getElementById("editBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"編集を終了":"通路を編集";
  document.getElementById("editHint").style.display = on?"block":"none";
}
```

→ 関数ごと削除する。

置換前（`files/index.html:2243-2251`）:

```js
// 2つのモードは排他。通路編集は前提そのものを変えるので、従来どおり配置し直す。
function toggleEdit(){
  // 入るだけで配置し直すので、手動調整があるなら先に確認する
  if(!editMode && hasManual() &&
     !confirm("通路の編集に入ると自動配置し直すため、手動調整は破棄されます。よろしいですか？")) return;
  setEditMode(!editMode);
  if(editMode) setMoveMode(false);
  if(lastLots) run(false);
}
```

→ コメント1行を含めて関数ごと削除する。

- [ ] **Step 9: `toggleMove()` の中の `setEditMode(false)` を落とす**

置換前（`files/index.html:2254-2264`）:

```js
function toggleMove(){
  setMoveMode(!moveMode);
  // 配置表タブから押されると掴めるマスが1つも無いので、配置編集タブへ寄せる。
  // ただし switchTab() は無条件で scrollTo(0,0) するので、既に配置編集タブが
  // 出ているときに呼ぶとページ先頭へ飛ぶだけの空振りになる。表示中は呼ばない。
  if(moveMode){
    setEditMode(false);
    if(document.getElementById("tab-edit").style.display==="none") switchTab('edit');
  }
  redraw();
}
```

置換後:

```js
function toggleMove(){
  setMoveMode(!moveMode);
  // 配置表タブから押されると掴めるマスが1つも無いので、配置編集タブへ寄せる。
  // ただし switchTab() は無条件で scrollTo(0,0) するので、既に配置編集タブが
  // 出ているときに呼ぶとページ先頭へ飛ぶだけの空振りになる。表示中は呼ばない。
  if(moveMode && document.getElementById("tab-edit").style.display==="none"){
    switchTab('edit');
  }
  redraw();
}
```

`toggleMove()` は Task 3 で消えるが、Task 1 の時点では動く状態を保つ。

- [ ] **Step 10: 通路トグルの click ハンドラを消す**

置換前（`files/index.html:2290-2297`）:

```js
document.addEventListener("click",e=>{
  if(moveMode) return;
  if(!editMode)return;
  const w=e.target.closest(".colwrap"); if(!w)return;
  const sp=SPACES.find(s=>s.name===w.dataset.space); if(!sp)return;
  sp.cols[parseInt(w.dataset.col)].aisle=!sp.cols[parseInt(w.dataset.col)].aisle;
  document.getElementById("cfgText").value=spacesToText();
  showCapacity(); run(false);
});
```

→ ハンドラごと削除する。**このすぐ下にある `if(!moveMode) return;` で始まる
別の click ハンドラは残す**（ロット選択のタップ処理で、Task 3 まで使う）。

- [ ] **Step 11: 消えたことを確認する**

リロードしてヘルパを入れ直してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic");
JSON.stringify({
  dom:{editBtn:!!document.getElementById("editBtn"),
       editHint:!!document.getElementById("editHint")},
  win:{setEditMode:typeof window.setEditMode, toggleEdit:typeof window.toggleEdit},
  editModeVar:(typeof editMode),
  editableCells:document.querySelectorAll(".colwrap.editable").length,
  err:(window.__err||null)
})
```

期待: `editBtn:false` / `editHint:false` / `setEditMode:"undefined"` /
`toggleEdit:"undefined"` / `editModeVar:"undefined"` / `editableCells:0`。

コンソールにエラーが出ていないこと（`read_console_messages` を `onlyErrors:true` で確認）。

- [ ] **Step 12: 通路が生きていることを確認する**

```js
JSON.stringify({
  cap: document.getElementById("capacity").textContent,
  cfg: document.getElementById("cfgText").value.split("\n").filter(l=>l.includes("*")),
  aisleCols: SPACES.flatMap(s=>s.cols.map((c,i)=>c.aisle?s.name+"#"+i:null)).filter(Boolean),
  aisleDom: document.querySelectorAll("#mapBody .colwrap.aisle").length
})
```

期待: Step 2 と `cap` / `cfg` / `aisleCols` が一致。`aisleDom` が 0 より大きいこと。

さらに、スペース設定から通路を足せることを確かめる。

> **`applyConfig()` と `resetConfig()` は `localStorage` を書き換える。**
> `resetConfig()` は `saveData(STORE_KEY.spaces, null)` で保存ごと消すので、
> 検証用プロファイルに実倉庫の列構成が入っていると失われる。
> **必ず先に退避し、最後に戻すこと。**

```js
window.__spacesBak = localStorage.getItem("palletApp.spaces");
const before=document.getElementById("capacity").textContent;
const t=document.getElementById("cfgText");
const lines=t.value.split("\n");
// 「メイン」の行の最初の列の高さに * を足す
const i=lines.findIndex(l=>l.startsWith("メイン"));
const parts=lines[i].split("|");
const cols=parts[4].split(",");
cols[0]=cols[0].trim()+"*";
parts[4]=" "+cols.join(",")+" ";
lines[i]=parts.join("|");
t.value=lines.join("\n");
applyConfig();
JSON.stringify({before, after:document.getElementById("capacity").textContent,
                alert:window.__alert,
                aisleDom:document.querySelectorAll("#mapBody .colwrap.aisle").length})
```

期待: `after` の「通路◯P」が `before` より増えていること。`alert` が
`"設定を反映しました。"` であること。

確認したら、退避しておいた保存を書き戻す。

```js
if(window.__spacesBak==null) localStorage.removeItem("palletApp.spaces");
else localStorage.setItem("palletApp.spaces", window.__spacesBak);
location.reload();
```

リロード後にヘルパを入れ直して確認する。

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic");
JSON.stringify({cap:document.getElementById("capacity").textContent,
                aisleCols:SPACES.flatMap(s=>s.cols.map((c,i)=>c.aisle?s.name+"#"+i:null)).filter(Boolean)})
```

期待: Step 2 の `cap` / `aisleCols` と一致。

- [ ] **Step 13: 紙が変わっていないことを確認する**

```js
JSON.stringify(probe())
```

期待: 「改修前の基準値」の `probe()` と**完全一致**。

- [ ] **Step 14: Commit**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: 通路を編集するモードを取り除く

初見で意味が分からないという指摘。通路そのものはスペース設定の * で
定義でき、place() の越し処理も紙の通路列も変わらない。
消したのは、その日だけ列を通路に切り替える操作だけ。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: なぞるを既定にし、指の使い方の2択を消す

> **`tool` と `setTool()` は消さない。** 消すのは画面の2択（`#toolCtl`）と
> `isTouchDevice()` と `setTool()` の中のボタン更新ループだけ。
> 第2弾「配置不可エリアの設定」がなぞりで別の対象を選ぶために
> 同じ仕組みを必要とするため（設計書 §4-1-1）。

**Files:**
- Modify: `files/index.html:181-205`（CSS。`.toolctl` / `.toolbtn` と `sweep` の青枠・影）
- Modify: `files/index.html:551-555`（`#toolCtl`）
- Modify: `files/index.html:2232-2242`（`setMoveMode()` の中の2行）
- Modify: `files/index.html:2722`（`let tool` の既定）
- Modify: `files/index.html:2726-2737`（`isTouchDevice()` と `setTool()`）
- Modify: `files/index.html:2749-2750`（`updateFlag()` の分岐）
- Modify: `files/index.html:2955` 付近（`initDockPrefs` の IIFE）

**Interfaces:**
- Consumes: Task 1 の結果（`editMode` が無い状態）
- Produces: `tool` の既定が `"sweep"` になり、起動時に `#mapBody` へ `sweep` が付く。
  `setTool(t)` は残り、`tool` の代入・`sweep` クラスの切替・`updateFlag()` の3つを行う。
  `isTouchDevice()` は無くなる

- [ ] **Step 1: 改修前の状態を控える**

「検証の定型」を実行してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
const map=document.getElementById("mapBody");
JSON.stringify({mapBodyCls:map.className, tool,
  outline:getComputedStyle(map).outlineWidth,
  scrollerBg:getComputedStyle(document.querySelector("#mapBody .scroller"))
              .backgroundImage.slice(0,30)})
```

期待: `mapBodyCls:"dock-tr"` / `tool:"scroll"` / `outline` が細い（`sweep` 未適用）/
`scrollerBg` が `"linear-gradient(90deg, rgb(255,…"`。

- [ ] **Step 2: `sweep` に付いていた見た目を外す**

`sweep` が常時オンになると、「モードに入っている印」が常設の装飾になる。
青枠と、横スクロールの影を打ち消す指定を消す（設計書 §2-2-1）。

置換前（`files/index.html:200`）:

```css
  #mapBody.sweep{outline:3px solid #2563eb;outline-offset:8px;border-radius:6px}
```

→ 削除する。

置換前（`files/index.html:205`）:

```css
  #mapBody.sweep .scroller{background-image:none}
```

→ 削除する。影は「右にまだ列が続く」ことを示す手掛かりで、
マスの上からは横スクロールできない以上、消したままにはしない。

`#mapBody.sweep .cell[data-lot]{touch-action:none;cursor:crosshair}`（`:181`）は**残す**。
`cursor:crosshair` は PC で「ここはなぞれる」という手掛かりとして働く。

- [ ] **Step 3: `#toolCtl` と、その CSS を消す**

置換前（`files/index.html:551-555`）:

```html
      <div class="toolctl" id="toolCtl" style="display:none">
        <span class="lbl">指の使い方</span>
        <button class="toolbtn on" id="toolScrollBtn" onclick="setTool('scroll')">👆 画面を動かす<i>タップで1マスずつ</i></button>
        <button class="toolbtn" id="toolSweepBtn" onclick="setTool('sweep')">🖐 なぞる<i>まとめて選ぶ・外す</i></button>
      </div>
```

→ 5行とも削除する。

置換前（`files/index.html:183-190`）:

```css
  .toolctl{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap;margin-bottom:10px}
  .toolctl .lbl{font-size:12px;color:var(--muted);align-self:center;margin-right:2px}
  .toolbtn{border:2px solid var(--line);background:#fff;border-radius:10px;padding:7px 14px;min-height:54px;
           cursor:pointer;color:#374151;display:flex;flex-direction:column;align-items:center;justify-content:center;
           gap:1px;font-size:13px;font-weight:700;line-height:1.3;min-width:118px}
  .toolbtn i{font-style:normal;font-size:11px;font-weight:400;color:var(--muted)}
  .toolbtn.on{border-color:var(--accent);background:#eff6ff;color:#1d4ed8}
  .toolbtn.on i{color:#3b82f6}
```

→ 6行とも削除する。この直前にある
`/* 指のときだけ「画面を動かす／なぞる」の2択。… */` のコメント2行も一緒に消す。

- [ ] **Step 4: `setMoveMode()` から消えた要素への参照を落とす**

置換前（`files/index.html:2232-2242`）:

```js
function setMoveMode(on){
  moveMode=on;
  const b=document.getElementById("moveBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"移動を終了":"ロットを移動";
  document.getElementById("moveHint").style.display = on?"block":"none";
  // [試作] 指の2択は移動モードの中だけ。マウスだけの端末には出さない
  document.getElementById("toolCtl").style.display = (on && isTouchDevice())?"flex":"none";
  if(!on){ clearSel(); setTool("scroll"); }
  updateFlag();
}
```

置換後:

```js
function setMoveMode(on){
  moveMode=on;
  const b=document.getElementById("moveBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"移動を終了":"ロットを移動";
  document.getElementById("moveHint").style.display = on?"block":"none";
  if(!on) clearSel();
  updateFlag();
}
```

`setTool("scroll")` を落とすのは、戻す先が無くなるため。
`setMoveMode()` 自体は Task 3 で消える。

- [ ] **Step 5: `tool` の既定を変え、`isTouchDevice()` と ボタン更新ループを消す**

置換前（`files/index.html:2715-2737`。コメントの末尾3行を含む）:

```js
   違うのは指だけ。指はマスに触れた瞬間にブラウザがスクロールを始めてしまい、
   触れたあとから touch-action:none にはできない。だから指のときだけ
   「画面を動かす／なぞる」の2択を出す。マウスにこの制約は無いので出さない。 */
let tool="scroll";               // 指のときだけ意味を持つ： "scroll" | "sweep"
let sweep=null;                  // {id,x0,y0,started,target,mode,erased,lotId0}
let sweepUndo=null;              // ひとなぞり前の選択（取り消し用）

function isTouchDevice(){
  try{ return window.matchMedia("(any-pointer: coarse)").matches; }
  catch(e){ return "ontouchstart" in window; }
}
function setTool(t){
  tool=t;
  document.getElementById("mapBody").classList.toggle("sweep", t==="sweep");
  [["toolScrollBtn","scroll"],["toolSweepBtn","sweep"]].forEach(function(x){
    const b=document.getElementById(x[0]);
    if(b) b.classList.toggle("on", t===x[1]);
  });
  updateFlag();
}
```

置換後:

```js
   なぞるは既定でオン。指がマスに触れた瞬間にブラウザがスクロールを始めてしまい、
   触れたあとから touch-action:none にはできないので、起動時に setTool("sweep") を
   呼んで先に付けておく。盤のスクロールは列の隙間・余白・盤の外で行う
   （2026-09-06 に Pixel 9a で問題なしと確認済み）。
   画面の2択は廃止したが、tool と setTool() は残してある。配置不可エリアの設定が
   「いま何を選んでいるのか」の切り替えを必要とするため。 */
let tool="sweep";                // "sweep" が既定。将来ここに別の選び方が増える
let sweep=null;                  // {id,x0,y0,started,target,mode,erased,lotId0}
let sweepUndo=null;              // ひとなぞり前の選択（取り消し用）

function setTool(t){
  tool=t;
  document.getElementById("mapBody").classList.toggle("sweep", t==="sweep");
  updateFlag();
}
```

- [ ] **Step 6: 起動時に `setTool("sweep")` を呼ぶ**

`tool` の初期値を変えただけでは `#mapBody` にクラスが付かない。
既に `setNav()` / `setDockPos()` を呼んでいる IIFE に1行足す。

置換前（`files/index.html:2953-2958` 付近）:

```js
// [試作] 保存してある「案内」と「退避の位置」を反映する
(function initDockPrefs(){
  const n=loadData("palletApp.navShow");
  setNav(n===null||n===undefined ? true : !!n);
  setDockPos(loadData("palletApp.stashPos") || "tr");
})();
```

置換後:

```js
// [試作] 保存してある「案内」と「退避の位置」を反映する。
// なぞるは既定でオン。クラスは HTML に焼かず setTool() を通す（設計書 §4-1-1）
(function initDockPrefs(){
  const n=loadData("palletApp.navShow");
  setNav(n===null||n===undefined ? true : !!n);
  setDockPos(loadData("palletApp.stashPos") || "tr");
  setTool("sweep");
})();
```

- [ ] **Step 7: `updateFlag()` の死に枝を消す**

置換前（`files/index.html:2747-2750`）:

```js
  if(moving)               msg="✋ "+n+"マスを運んでいます ／ 置きたい列の上で指を離してください";
  else if(n>0)             msg="✋ "+n+"マス選択中 ／ そのまま外へドラッグで運ぶ・選択の中をなぞると外れる";
  else if(tool==="sweep")  msg="🖐 マスをなぞると、同じロットをまとめて選べます";
  else if(moveMode)        msg="👆 マスをタップすると選べます";
```

置換後:

```js
  if(moving)               msg="✋ "+n+"マスを運んでいます ／ 置きたい列の上で指を離してください";
  else if(n>0)             msg="✋ "+n+"マス選択中 ／ そのまま外へドラッグで運ぶ・選択の中をなぞると外れる";
  else if(tool==="sweep")  msg="🖐 マスをなぞると、同じロットをまとめて選べます";
```

`else if(moveMode)` の枝は、`tool` の既定が `"sweep"` になったことで到達しなくなる。

**`pointerdown`（`files/index.html:2894`）の
`if(e.pointerType!=="mouse" && tool!=="sweep" && !onSel) return;` は残す。**
いまは常に偽になるが、第2弾で別の `tool` が入ったときにそのまま意味を持つ。

- [ ] **Step 8: 固定されたことを確認する**

リロードしてヘルパを入れ直してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
const map=document.getElementById("mapBody");
JSON.stringify({
  mapBodyCls:map.className,
  toolCtl:!!document.getElementById("toolCtl"),
  win:{setTool:typeof window.setTool, isTouchDevice:typeof window.isTouchDevice},
  tool,
  setToolSrc:/toolScrollBtn/.test(String(window.setTool)),
  touchAction:getComputedStyle(cellOf()).touchAction
})
```

期待: `mapBodyCls` に `"sweep"` が含まれる / `toolCtl:false` /
`setTool:"function"` / `isTouchDevice:"undefined"` / `tool:"sweep"` /
**`setToolSrc:false`**（ボタン更新ループが消えている）/ `touchAction:"none"`。

- [ ] **Step 9: 青枠が消え、影が戻ったことを確認する**

```js
const map=document.getElementById("mapBody");
JSON.stringify({
  outline:getComputedStyle(map).outlineWidth,
  scrollerBg:getComputedStyle(document.querySelector("#mapBody .scroller"))
              .backgroundImage.slice(0,30),
  cursor:getComputedStyle(cellOf()).cursor
})
```

期待: `outline` が Step 1 と同じ（青枠が付いていない）/
`scrollerBg` が `"linear-gradient(90deg, rgb(255,…"`（`"none"` ではない）/
`cursor:"crosshair"`。

- [ ] **Step 10: 選択がまだ動くことを確認する**

```js
toggleMove();                       // Task 3 までは残っている入口
const c=cellOf(); toggleCell(c);
const r1={sel:sel.cells.size, lotId:sel.lotId, cls:c.className};
clearSel();
JSON.stringify({r1, after:sel.cells.size})
```

期待: `r1.sel:1` / `r1.cls` に `"sel"` が含まれる / `after:0`。

- [ ] **Step 11: 紙が変わっていないことを確認する**

```js
JSON.stringify(probe())
```

期待: 「改修前の基準値」の `probe()` と完全一致。

- [ ] **Step 12: Commit**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: なぞるを既定にし、指の使い方の2択を消す

touch-action は指が触れた瞬間に評価されるので、起動時に setTool("sweep") で
先に付ける。常時オンでもスクロールできることは Pixel 9a で確認済み。
モードの印だった青枠と、横スクロールの影を打ち消す指定は役目を失うので外す。
tool と setTool() は残す。配置不可エリアの設定が同じ仕組みを要るため。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 編集を常時オンにし、移動ボタンを消す

**Files:**
- Modify: `files/index.html:544`（`#moveBtn`）
- Modify: `files/index.html:2220`（`let moveMode`）
- Modify: `files/index.html:2232-2240`（`setMoveMode()`）
- Modify: `files/index.html:2244-2255`（`toggleMove()`）
- Modify: `files/index.html:2038-2042`（`switchTab()` の解除処理）
- Modify: `files/index.html:2753`（`updateFlag()` の表示条件）

> **触らない箇所**: `pointerdown`（`:2887`）と ロット選択の click ハンドラ（`:2299` 付近）の
> `if(!moveMode) return;` は**そのまま残す**。`moveMode` を定数にするだけで、
> 判定の形は変えない。

**Interfaces:**
- Consumes: Task 2 の結果（`tool` が無い状態）
- Produces: `setMoveMode()` / `toggleMove()` が存在しなくなる。`moveMode` は常に `true`

- [ ] **Step 1: `moveMode` を常に真にする**

置換前（`files/index.html:2220`）:

```js
let moveMode=false;
```

置換後:

```js
// 配置編集タブは開いた時点で編集できる。切り替えるボタンは無い。
// 変数を残すのは、これを見ている箇所（pointerdown / click ハンドラ）を
// 書き換えずに済ませるため。定数なので、いまはどれも素通りする。
const moveMode=true;
```

- [ ] **Step 2: `#moveBtn` を消す**

置換前（`files/index.html:544`）:

```html
        <button id="moveBtn" class="btn btn-ghost" style="margin-left:auto" onclick="toggleMove()">ロットを移動</button>
```

→ 削除する。この時点で `<h2>配置編集</h2>` は見出しだけになる（Task 5 で消す）。

- [ ] **Step 3: `setMoveMode()` と `toggleMove()` を消す**

置換前（`files/index.html:2232-2255`）:

```js
function setMoveMode(on){
  moveMode=on;
  const b=document.getElementById("moveBtn");
  b.className = "btn "+(on?"btn-on":"btn-ghost");
  b.textContent = on?"移動を終了":"ロットを移動";
  document.getElementById("moveHint").style.display = on?"block":"none";
  if(!on) clearSel();
  updateFlag();
}
// 移動モードの出入りでは配置し直さない。ただし editable クラスが DOM に焼き込まれているので
// 描き直して落とす。
function toggleMove(){
  setMoveMode(!moveMode);
  // 配置表タブから押されると掴めるマスが1つも無いので、配置編集タブへ寄せる。
  // ただし switchTab() は無条件で scrollTo(0,0) するので、既に配置編集タブが
  // 出ているときに呼ぶとページ先頭へ飛ぶだけの空振りになる。表示中は呼ばない。
  if(moveMode && document.getElementById("tab-edit").style.display==="none"){
    switchTab('edit');
  }
  redraw();
}
```

→ 2つの関数とコメントをまとめて削除する。

- [ ] **Step 4: `switchTab()` の解除処理を `clearSel()` だけにする**

置換前（`files/index.html:2038-2042`）:

```js
  // 移動モードは配置編集タブでしか操作できない。
  // 他のタブへ移ったら解除する。残すと、戻ってきたとき「なぜかマスが選べる」状態になる
  if(name!=="edit" && moveMode){
    setMoveMode(false);
  }
```

置換後:

```js
  // 選択は配置編集タブの中だけの状態。他のタブへ移ったら捨てる。
  // 残すと、戻ってきたとき「なぜか選ばれている」状態になる
  if(name!=="edit") clearSel();
```

- [ ] **Step 5: `updateFlag()` の表示条件から `moveMode` を落とす**

置換前（`files/index.html:2753`）:

```js
  f.style.display=(moveMode && (msg||undoOn))?"flex":"none";
```

置換後:

```js
  f.style.display=(msg||undoOn)?"flex":"none";
```

- [ ] **Step 6: 消えたことを確認する**

リロードしてヘルパを入れ直してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
JSON.stringify({
  moveBtn:!!document.getElementById("moveBtn"),
  win:{setMoveMode:typeof window.setMoveMode, toggleMove:typeof window.toggleMove},
  moveMode,
  card直下:[...document.getElementById("editCard").children].map(el=>el.tagName+(el.id?"#"+el.id:""))
})
```

期待: `moveBtn:false` / `setMoveMode:"undefined"` / `toggleMove:"undefined"` /
`moveMode:true` /
`card直下:["H2","DIV#moveHint","DIV#dockCtl","DIV#sizeCtl","DIV#messages","DIV#mapBody","DIV#editEmpty"]`。

- [ ] **Step 7: ボタンを押さずに選べることを確認する**

```js
const c=cellOf(); toggleCell(c);
const r={sel:sel.cells.size, cls:c.className,
         flag:getComputedStyle(document.getElementById("toolFlag")).display,
         text:document.getElementById("toolFlagText").textContent};
clearSel();
JSON.stringify(r)
```

期待: `sel:1`（**`toggleMove()` を一度も呼んでいない**）/ `cls` に `"sel"` /
`flag:"flex"` / `text` が `"✋ 1マス選択中 ／ …"`。

- [ ] **Step 8: タブを離れると選択が消えることを確認する**

```js
toggleCell(cellOf());
const before=sel.cells.size;
switchTab('sheet');
const mid=sel.cells.size;
switchTab('edit');
JSON.stringify({before, mid, after:sel.cells.size,
                selDom:document.querySelectorAll("#mapBody .cell.sel").length})
```

期待: `before:1` / `mid:0` / `after:0` / `selDom:0`。

- [ ] **Step 9: 運ぶ操作がまだ動くことを確認する**

```js
loadSample("basic"); switchTab('edit');
const cells=[...document.querySelectorAll('#mapBody .cell[data-lot="0"]')].slice(0,3);
cells.forEach(c=>toggleCell(c));
const before={sel:sel.cells.size, stash:stashTotal(lastSp)};
applyMove(stashSpaces(lastSp)[0].name, firstFreeStashCol());
JSON.stringify({before, afterStash:stashTotal(lastSp),
                bar:document.getElementById("stashBar").textContent.slice(0,30)})
```

期待: `before.sel:3` / `before.stash:0` / `afterStash:3` /
`bar` に `"退避中："` が含まれる。

- [ ] **Step 10: 紙が変わっていないことを確認する**

```js
loadSample("basic");
JSON.stringify(probe())
```

期待: 「改修前の基準値」の `probe()` と完全一致。

- [ ] **Step 11: Commit**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: 配置編集を常時オンにし、移動ボタンを消す

タブを開いた時点で編集できる方が操作が少ないという指摘。
タブを離れるときは選択だけ捨てる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 選択の状態を帯へ集約する

**Files:**
- Modify: `files/index.html:546-548`（`#moveHint`）
- Modify: `files/index.html:585-589`（`#toolFlag` の中身）
- Modify: `files/index.html:2735-2752`（`updateFlag()`）
- Modify: `files/index.html:2770-2775`（`showSelCount()` の `#selCount` 部分）
- Modify: CSS `.toolflag` / `.flagundo`（`files/index.html:194-197` 付近）

**Interfaces:**
- Consumes: Task 3 の結果（`moveMode` が定数）
- Produces: `#toolFlagCount`（選択数）と `#flagClearBtn`（選択解除）が帯の中にできる。
  `#selCount` と `#moveHint` は無くなる

- [ ] **Step 1: 改修前の帯を控える**

「検証の定型」を実行してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
toggleCell(cellOf());
const on={text:document.getElementById("toolFlagText").textContent,
          disp:getComputedStyle(document.getElementById("toolFlag")).display};
setNav(false);
const off={text:document.getElementById("toolFlagText").textContent,
           disp:getComputedStyle(document.getElementById("toolFlag")).display};
setNav(true); clearSel();
JSON.stringify({on, off})
```

期待: `on.text` が `"✋ 1マス選択中 ／ …"`、`off.text` が `""`、
**`off.disp` が `"none"`（＝案内を切ると選択数も選択解除も消える。これが直す対象）。**

- [ ] **Step 2: 帯の中身を3つに分ける**

置換前（`files/index.html:585-589`）:

```html
        <div class="toolflag" id="toolFlag">
          <span id="toolFlagText"></span>
          <button class="flagundo" id="sweepUndoBtn" style="display:none"
                  onclick="undoSweep()">↩ いまのなぞりを取り消す</button>
        </div>
```

置換後:

```html
        <!-- 帯の中身は3つ。案内（navShow）で消えるのは説明文だけで、
             選択数と2つのボタンは案内を切っても出す。 -->
        <div class="toolflag" id="toolFlag">
          <span id="toolFlagCount" class="flagcount"></span>
          <span id="toolFlagText"></span>
          <button class="flagundo" id="flagClearBtn" style="display:none"
                  onclick="clearSel()">選択解除</button>
          <button class="flagundo" id="sweepUndoBtn" style="display:none"
                  onclick="undoSweep()">↩ いまのなぞりを取り消す</button>
        </div>
```

- [ ] **Step 3: 選択数の見た目を足す**

CSS の `.flagundo`（`files/index.html:196` 付近）のすぐ下に足す。

```css
  /* 選択数は説明文と区別が付くように白抜きにする。案内を切っても残る要素 */
  .flagcount{background:rgba(255,255,255,.22);border-radius:6px;padding:3px 9px;
             font-size:13px;font-weight:800;white-space:nowrap}
  .flagcount:empty{display:none}
```

あわせて `.flagundo` のタップ目標を広げる。帯のボタンは**指で押す前提**になるので、
38px では推奨の 44px を下回る。

置換前（`files/index.html:196-197`）:

```css
  .flagundo{border:0;border-radius:6px;padding:7px 12px;background:#fff;color:#1f2937;
            font-weight:700;font-size:12px;cursor:pointer;min-height:38px}
```

置換後:

```css
  .flagundo{border:0;border-radius:6px;padding:7px 12px;background:#fff;color:#1f2937;
            font-weight:700;font-size:12px;cursor:pointer;min-height:44px}
```

- [ ] **Step 4: `#moveHint` を消す**

置換前（`files/index.html:546-548`）:

```html
      <div id="moveHint" class="hint" style="display:none;margin-bottom:8px">✋ 移動モード：同じロットのマスをタップして選び、選んだマスをドラッグして別の列へ運びます。
        退避スペースへも運べます。<span id="selCount"></span>
        <button class="btn-mini" onclick="clearSel()">選択解除</button></div>
```

→ 3行とも削除する。

- [ ] **Step 5: `updateFlag()` を書き替える**

置換前（`files/index.html:2735-2754`）:

```js
function updateFlag(){
  const f=document.getElementById("toolFlag"), t=document.getElementById("toolFlagText");
  if(!f||!t) return;
  const n=sel.cells.size;
  const moving=document.getElementById("mapBody").classList.contains("moving");
  let msg="";
  if(moving)   msg="✋ "+n+"マスを運んでいます ／ 置きたい列の上で指を離してください";
  else if(n>0) msg="✋ "+n+"マス選択中 ／ そのまま外へドラッグで運ぶ・選択の中をなぞると外れる";
  else         msg="🖐 マスをなぞると、同じロットをまとめて選べます";
  if(!navShow) msg="";
  t.textContent=msg;
  const ub=document.getElementById("sweepUndoBtn");
  const undoOn = ub && ub.style.display!=="none";
  f.style.display=(msg||undoOn)?"flex":"none";
  f.classList.toggle("hasSel", n>0);
}
```

置換後:

```js
function updateFlag(){
  const f=document.getElementById("toolFlag"), t=document.getElementById("toolFlagText");
  if(!f||!t) return;
  const n=sel.cells.size;
  const moving=document.getElementById("mapBody").classList.contains("moving");
  const c=document.getElementById("toolFlagCount");
  const cb=document.getElementById("flagClearBtn");
  const ub=document.getElementById("sweepUndoBtn");
  const undoOn = ub && ub.style.display!=="none";
  // 待機中は帯ごと消す。出しっぱなしにすると、盤の上に常設の帯が居座って
  // 「画面の情報を削る」という目的に逆行する
  if(n===0 && !undoOn){
    t.textContent=""; if(c) c.textContent=""; if(cb) cb.style.display="none";
    f.style.display="none"; f.classList.remove("hasSel");
    return;
  }
  // 説明文。慣れた人には邪魔なので、案内を切ると消える
  let msg = moving ? "置きたい列の上で指を離してください"
          : (n>0  ? "そのまま外へドラッグで運ぶ・選択の中をなぞると外れる" : "");
  if(!navShow) msg="";
  t.textContent=msg;
  // 選択数。案内を切っても出す。説明文に埋め込むと案内と一緒に消えてしまう
  if(c) c.textContent = n ? (moving ? "✋ "+n+"マスを運搬中" : "✋ "+n+"マス選択中") : "";
  // 選択解除。案内を切っても出す。運んでいる最中は押させない
  if(cb) cb.style.display = (n>0 && !moving) ? "" : "none";
  f.style.display="flex";
  f.classList.toggle("hasSel", n>0);
}
```

- [ ] **Step 6: `showSelCount()` から `#selCount` への書き込みを消す**

置換前（`files/index.html:2770-2773`）:

```js
function showSelCount(){
  const el=document.getElementById("selCount");
  if(el) el.textContent = sel.cells.size ? "（"+sel.cells.size+"マス選択中）" : "";
  if(typeof updateFlag==="function") updateFlag();
```

置換後:

```js
// 選択数は updateFlag() が帯へ書く。ここは退避スペースまわりの追随だけを持つ
function showSelCount(){
  if(typeof updateFlag==="function") updateFlag();
```

関数名は変えない。`clearSel()` / `toggleCell()` / `afterSelChange()` /
`repaintSel()` の4か所から呼ばれている。

- [ ] **Step 7: 案内を切っても選択数と解除が出ることを確認する**

リロードしてヘルパを入れ直してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
const read=()=>({disp:getComputedStyle(document.getElementById("toolFlag")).display,
                 text:document.getElementById("toolFlagText").textContent,
                 count:document.getElementById("toolFlagCount").textContent,
                 clr:document.getElementById("flagClearBtn").style.display});
const empty=read();
toggleCell(cellOf());
const navOn=read();
setNav(false);
const navOff=read();
setNav(true); clearSel();
JSON.stringify({empty, navOn, navOff, cleared:read()})
```

期待:
- **`empty`: `disp:"none"`**（待機中は帯ごと消える）/ `text:""` / `count:""` / `clr:"none"`
- `navOn`: `disp:"flex"` / `count:"✋ 1マス選択中"` / `clr:""` / `text` が空でない
- **`navOff`: `disp:"flex"` / `text:""` / `count:"✋ 1マス選択中"` / `clr:""`**
- `cleared`: `disp:"none"` / `count:""` / `clr:"none"`

- [ ] **Step 8: 選択が無いときは案内の設定によらず帯が消えることを確認する**

```js
clearSel();
setNav(true);
const navOn={disp:getComputedStyle(document.getElementById("toolFlag")).display};
setNav(false);
const navOff={disp:getComputedStyle(document.getElementById("toolFlag")).display};
setNav(true);
// 取り消しが出ているときは待機中でも帯を出す
showSweepUndo();
const withUndo={disp:getComputedStyle(document.getElementById("toolFlag")).display,
                sel:sel.cells.size};
hideSweepUndo();
JSON.stringify({navOn, navOff, withUndo,
                after:getComputedStyle(document.getElementById("toolFlag")).display})
```

期待: `navOn.disp:"none"` / `navOff.disp:"none"` /
**`withUndo.disp:"flex"` かつ `withUndo.sel:0`**（選択が無くても取り消しがあれば出す）/
`after:"none"`。

- [ ] **Step 9: 選択解除ボタンが効くことを確認する**

```js
// 同じロットの別々のマスを2つ選ぶ。cellOf() と cellOf(0) は
// 同じ要素を返すことがあり、2回叩くと選択が外れてしまう
[...document.querySelectorAll('#mapBody .cell[data-lot="0"]')].slice(0,2)
  .forEach(c=>toggleCell(c));
const before=sel.cells.size;
document.getElementById("flagClearBtn").click();
JSON.stringify({before, after:sel.cells.size,
                selDom:document.querySelectorAll("#mapBody .cell.sel").length,
                clr:document.getElementById("flagClearBtn").style.display})
```

期待: `before` が 1 以上 / `after:0` / `selDom:0` / `clr:"none"`。

- [ ] **Step 10: 消えたものが残っていないことを確認する**

```js
JSON.stringify({
  moveHint:!!document.getElementById("moveHint"),
  selCount:!!document.getElementById("selCount"),
  card直下:[...document.getElementById("editCard").children].map(el=>el.tagName+(el.id?"#"+el.id:""))
})
```

期待: `moveHint:false` / `selCount:false` /
`card直下:["H2","DIV#dockCtl","DIV#sizeCtl","DIV#messages","DIV#mapBody","DIV#editEmpty"]`。

- [ ] **Step 11: 紙が変わっていないことを確認する**

```js
loadSample("basic");
JSON.stringify(probe())
```

期待: 「改修前の基準値」の `probe()` と完全一致。

- [ ] **Step 12: Commit**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: 選択数と選択解除を盤上端の帯へ移す

移動モードの説明文を廃止し、帯の中身を 説明文／選択数／ボタン に分ける。
案内を切って消えるのは説明文だけにする。埋め込んだままだと
案内を切った瞬間に選択数まで消えていた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: ⚙ 表示設定にたたみ、見出しを消す

**Files:**
- Modify: `files/index.html:543-545`（`<h2>配置編集</h2>`）
- Modify: `files/index.html:546-561`（`#dockCtl` / `#sizeCtl` を囲う）
- Modify: `files/index.html:2050-2058`（`showMapState()`）
- Modify: `files/index.html:1895-1900`（`run()` の「盤は出すが結果は無い」枝）
- Modify: CSS（`.sizectl` の並び、`files/index.html:143` 付近）

**Interfaces:**
- Consumes: Task 4 の結果（`card直下` が H2 / dockCtl / sizeCtl / messages / mapBody / editEmpty）
- Produces: `toggleEditCfg()` / `closeEditCfg()`、`#editCtl`（⚙ の枠）、`#editCfg`（中身）

- [ ] **Step 1: 改修前の3点を控える**

「検証の定型」を実行してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
JSON.stringify({
  navShow, dockPos, cell:getComputedStyle(document.documentElement).getPropertyValue("--cell").trim(),
  saved:{nav:loadData("palletApp.navShow"), pos:loadData("palletApp.stashPos"),
         cell:loadData("palletApp.cell")},
  sizeCtlDisp:getComputedStyle(document.getElementById("sizeCtl")).display
})
```

期待: `navShow:true` / `dockPos:"tr"` / `cell` が `"30px"` 前後 / `sizeCtlDisp:"flex"`。

- [ ] **Step 2: 見出しを消し、⚙ の枠と中身を作る**

置換前（`files/index.html:543-545`。Task 3・4 のあとは `<h2>` の中がテキストだけになっている）:

```html
      <h2>配置編集
      </h2>
```

置換後:

```html
      <!-- タブ名と二重になるので見出しは置かない。設定は既定でたたんでおく。
           盤より上に常に出ているのはこのボタン1つだけにする。 -->
      <div class="editctl" id="editCtl">
        <button class="btn btn-ghost" id="cfgToggleBtn" aria-expanded="false"
                aria-controls="editCfg" onclick="toggleEditCfg()">⚙ 表示設定</button>
      </div>
      <div class="editcfg" id="editCfg" hidden>
```

そして `#sizeCtl` の閉じタグの直後（`files/index.html:561` 付近、`<div id="messages">` の直前）に
閉じタグを足す。

置換前:

```html
      </div>

      <div id="messages"></div>
```

置換後:

```html
      </div>
      </div>

      <div id="messages"></div>
```

`#dockCtl` と `#sizeCtl` の中身は**1文字も変えない**。囲うだけである。

- [ ] **Step 3: CSS を足す**

`.sizectl`（`files/index.html:143` 付近）のすぐ上に足す。

```css
  /* 配置編集タブの ⚙。盤より上に常に出るのはこのボタンだけ */
  .editctl{display:flex;justify-content:flex-end;margin-bottom:8px}
  .editcfg{border:1px solid var(--line);border-radius:10px;padding:10px 12px;
           margin-bottom:10px;background:#fcfcfd}
  /* .editcfg に display を書かない。書くと hidden より強くなって閉じられなくなる */
  .editcfg[hidden]{display:none}
  .editcfg .sizectl:last-child{margin-bottom:0}
```

- [ ] **Step 4: 開閉の関数を足す**

`showMapState()` の直前（`files/index.html:2049` 付近）に足す。

```js
/* ⚙ の開閉。開閉の状態は保存しない。設定を触るのは最初の1回だけで、
   毎回開いている必要がない。既定は閉じる。 */
function toggleEditCfg(){
  const p=document.getElementById("editCfg"), b=document.getElementById("cfgToggleBtn");
  if(!p||!b) return;
  const open=p.hidden;              // これから開くのか
  p.hidden=!open;
  b.className="btn "+(open?"btn-on":"btn-ghost");
  b.setAttribute("aria-expanded", open?"true":"false");
}
function closeEditCfg(){
  const p=document.getElementById("editCfg");
  if(p && !p.hidden) toggleEditCfg();
}
```

- [ ] **Step 5: `showMapState()` の出し分けを枠に変える**

置換前（`files/index.html:2053-2054`）:

```js
  document.getElementById("mapBody").style.display    = hasResult?"block":"none";
  document.getElementById("sizeCtl").style.display    = hasResult?"flex":"none";
```

置換後:

```js
  document.getElementById("mapBody").style.display    = hasResult?"block":"none";
  // ⚙ は盤に付いている。盤が出ているときだけ出し、隠すときは中身も閉じる
  document.getElementById("editCtl").style.display    = hasResult?"flex":"none";
  if(!hasResult) closeEditCfg();
```

- [ ] **Step 5-2: `run()` の「盤は出すが結果は無い」枝でも ⚙ を出す**

`showMapState()` だけでは足りない。`run()` にはこの枝があり、
`showMapState()` を呼んだ**直後に自分で打ち消している**。
ここで ⚙ だけ消えると、盤が見えているのにマスの大きさを変える手段が無くなる。

置換前（`files/index.html:1897-1900`）:

```js
    showMapState();
    document.getElementById("editEmpty").style.display="none";
    document.getElementById("mapBody").style.display="block";
```

置換後:

```js
    showMapState();
    document.getElementById("editEmpty").style.display="none";
    document.getElementById("mapBody").style.display="block";
    // 盤を出し直すので ⚙ も出し直す。規則は「盤が出ているなら ⚙ も出す」
    document.getElementById("editCtl").style.display="flex";
```

- [ ] **Step 6: 開閉を確認する**

リロードしてヘルパを入れ直してから:

```js
window.confirm=()=>true; window.alert=(m)=>{window.__alert=m;};
loadSample("basic"); switchTab('edit');
const read=()=>({hidden:document.getElementById("editCfg").hidden,
                 disp:getComputedStyle(document.getElementById("editCfg")).display,
                 aria:document.getElementById("cfgToggleBtn").getAttribute("aria-expanded"),
                 btnCls:document.getElementById("cfgToggleBtn").className});
const closed=read();
toggleEditCfg();
const opened=read();
toggleEditCfg();
JSON.stringify({closed, opened, again:read()})
```

期待:
- `closed`: `hidden:true` / `disp:"none"` / `aria:"false"` / `btnCls:"btn btn-ghost"`
- `opened`: `hidden:false` / `disp:"block"` / `aria:"true"` / `btnCls:"btn btn-on"`
- `again`: `closed` と同じ

- [ ] **Step 7: 中身の3点が今までどおり効くことを確認する**

```js
toggleEditCfg();
setNav(false); setDockPos("tl"); setCellSize(42);
const r1={navShow, dockPos,
          cell:getComputedStyle(document.documentElement).getPropertyValue("--cell").trim(),
          mapCls:document.getElementById("mapBody").className,
          saved:{nav:loadData("palletApp.navShow"), pos:loadData("palletApp.stashPos"),
                 cell:loadData("palletApp.cell")}};
setNav(true); setDockPos("tr"); setCellSize(30);
JSON.stringify({r1, back:{navShow, dockPos,
  cell:getComputedStyle(document.documentElement).getPropertyValue("--cell").trim()}})
```

期待: `r1.navShow:false` / `r1.dockPos:"tl"` / `r1.cell:"42px"` /
`r1.mapCls` に `"dock-tl"` と `"sweep"` が含まれる /
`r1.saved` の3つがそれぞれ `false` / `"tl"` / `42` /
`back` が `true` / `"tr"` / `"30px"`。

- [ ] **Step 8: 盤が隠れると ⚙ ごと消えて閉じることを確認する**

`clearLots()` で本当の空状態を作る。**全行の SNP を空にする方法は使わない**
（Step 8-2 の別の状態に入ってしまう）。

```js
window.confirm=()=>true;                           // clearLots() は冒頭で confirm する
toggleEditCfg();                                   // 開いておく
const openBefore=!document.getElementById("editCfg").hidden;
clearLots();
const gone={ctl:getComputedStyle(document.getElementById("editCtl")).display,
            hidden:document.getElementById("editCfg").hidden,
            empty:getComputedStyle(document.getElementById("editEmpty")).display,
            map:getComputedStyle(document.getElementById("mapBody")).display,
            hasResult};
loadSample("basic"); switchTab('edit');
JSON.stringify({openBefore, gone,
  back:{ctl:getComputedStyle(document.getElementById("editCtl")).display,
        hidden:document.getElementById("editCfg").hidden}})
```

期待: `openBefore:true` / `gone.ctl:"none"` / **`gone.hidden:true`（閉じた状態に戻る）** /
`gone.empty:"block"` / `gone.map:"none"` / `gone.hasResult:false` /
`back.ctl:"flex"` / `back.hidden:true`。

- [ ] **Step 8-2: 盤が出ているときは ⚙ も出ることを確認する**

全行の SNP を空にすると `run()` は「盤は出すが `hasResult=false`」の枝に入る。
**ここでは ⚙ が出ていなければならない**（Step 5-2 で足した行）。

```js
document.querySelectorAll("#lotTable tbody tr").forEach(tr=>{
  tr.querySelectorAll("select,input")[3].value="";    // [3] が SNP
});
run(false);
const r={ctl:getComputedStyle(document.getElementById("editCtl")).display,
         map:getComputedStyle(document.getElementById("mapBody")).display,
         empty:getComputedStyle(document.getElementById("editEmpty")).display,
         hasResult,
         msg:document.getElementById("messages").textContent.slice(0,30)};
loadSample("basic"); switchTab('edit');
JSON.stringify(r)
```

期待: **`ctl:"flex"`**（盤が出ているので ⚙ も出る）/ `map:"block"` /
`empty:"none"` / `hasResult:false` / `msg` に `"SNPが未入力"` が含まれる。

この枝は `showMapState()` の結果を `run()` が自分で打ち消している
（`files/index.html:1897-1900`）。**`empty:"block"` を期待してはいけない。**

- [ ] **Step 9: タブ上部が ⚙ だけになったことを確認する**

```js
JSON.stringify({
  card直下:[...document.getElementById("editCard").children].map(el=>el.tagName+(el.id?"#"+el.id:"")),
  h2:document.querySelectorAll("#editCard h2").length,
  ui:ui().dom
})
```

期待:
- `card直下:["DIV#editCtl","DIV#editCfg","DIV#messages","DIV#mapBody","DIV#editEmpty"]`
- `h2:0`
- `ui.moveBtn` / `editBtn` / `editHint` / `moveHint` / `toolCtl` / `selCount` が
  すべて `false`、`editCtl` / `editCfg` / `cfgToggleBtn` / `toolFlagCount` /
  `flagClearBtn` がすべて `true`

- [ ] **Step 9-2: 盤より上が実際に何 px 減ったかを測る**

これが item 2・5 の目的そのものである。DOM の並びだけでなく数で確かめる。

`resize_window` に `{"width":412,"height":915}` を渡してから:

```js
JSON.stringify(topH())
```

期待: `vw:412` /
**`上部の高さ` が 130〜160px**（改修前 284.6px。おおむね半分になる）/
`子` が `["DIV#editCtl:…","DIV#editCfg:0","DIV#messages:…"]` の3つだけ。

`err` が返るときは `innerWidth` が 0。`resize_window` を先に実行すること。

増えている場合は帯（Task 4）かアコーディオンの余白を疑う。
`#editCfg` は閉じているので高さ 0 でなければならない。

測り終えたら `resize_window` に `{"preset":"desktop"}` を渡して戻す。

- [ ] **Step 10: 紙が変わっていないことを確認する**

```js
JSON.stringify(probe())
```

期待: 「改修前の基準値」の `probe()` と完全一致。

コンソールにエラーが無いことも確認する（`read_console_messages` を `onlyErrors:true`）。

- [ ] **Step 11: Commit**

```bash
git add files/index.html
git commit -m "$(cat <<'EOF'
refactor: 表示設定を ⚙ にたたみ、タブ内の見出しを消す

案内・退避スペースの位置・マスの大きさを既定で閉じたアコーディオンへ入れ、
盤より上に常時出るものを ⚙ 1つだけにする。見出しはタブ名と二重なので廃止。
結果が無いときは ⚙ ごと消し、閉じた状態に戻す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: キャッシュを繰り上げる

**Files:**
- Modify: `files/sw.js`（`CACHE_VERSION`）

**Interfaces:**
- Consumes: Task 5 まで（`files/index.html` の変更が完了していること）
- Produces: なし

- [ ] **Step 1: 現在の値を確認する**

```bash
grep -n 'CACHE_VERSION' files/sw.js
```

期待: `const CACHE_VERSION = "v28";`

- [ ] **Step 2: 繰り上げる**

置換前:

```js
const CACHE_VERSION = "v28";
```

置換後:

```js
const CACHE_VERSION = "v29";
```

- [ ] **Step 3: 1行だけ変わったことを確認する**

```bash
git diff --stat files/sw.js
```

期待: `1 file changed, 1 insertion(+), 1 deletion(-)`

- [ ] **Step 4: Commit**

```bash
git add files/sw.js
git commit -m "$(cat <<'EOF'
chore: CACHE_VERSION を v29 に上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 実機確認（人の作業）

**Files:** なし（確認のみ）

**Interfaces:**
- Consumes: Task 6 まで

Pixel 9a / Android Chrome、PWA としてホーム画面に追加したスタンドアロン表示で確認する。
**古い版が出るときは、アプリを閉じて開き直す**（`CACHE_VERSION` を上げているので
Service Worker が入れ替わる）。

- [ ] 配置編集タブを開いた直後、**ボタンを1つも押さずに**マスをなぞって選べること
- [ ] 盤が縦にスクロールできること（列と列の隙間・エリアの余白・盤の外に指を置く）
- [ ] 盤が横にスクロールできること（倉庫内・倉庫外それぞれの帯）
- [ ] 選んだマスを外へドラッグして別の列へ運べること
- [ ] 退避スペースへ運べること。受け皿が出ること
- [ ] 盤を下までたどっても、上端の帯に選択数と「選択解除」が残っていること
- [ ] 「選択解除」が指で押せる大きさであること
- [ ] ⚙ を開き、案内・退避スペースの位置・マスの大きさの3点が操作できること
- [ ] ⚙ を開くと盤が下へ押されるが、操作に支障がないこと
- [ ] マスの大きさを「大」にしても盤が破綻しないこと
- [ ] 案内を「非表示」にしても、選択数と「選択解除」が出ること
- [ ] 「通路を編集」ボタンが無いこと。通路の列（灰・破線）は今までどおり見えること
- [ ] タブ内トップに「配置編集」の見出しが無いこと
- [ ] 配置表タブへ移り、紙が今までと同じであること。印刷プレビューが A4 横1ページに収まること

---

## Self-Review

設計書と突き合わせた結果を記す。

**1. 設計書の各節に対応するタスク**

| 設計書 | タスク |
|---|---|
| §3 消すもの（14項目） | Task 1（通路6項目）／ Task 2（toolCtl・isTouchDevice）／ Task 3（moveBtn・toggleMove・setMoveMode）／ Task 4（moveHint）／ Task 5（h2） |
| §3-1 通路の概念は残す | Task 1 Step 2・12（`cap` / `cfg` / `aisleCols` の突き合わせと、`*` を足す往復） |
| §4-1 moveMode / tool の固定 | Task 2 Step 2・5、Task 3 Step 1 |
| §4-2 タブを離れるとき | Task 3 Step 4・Step 8 |
| §4-3 連動して単純になる箇所 | Task 2 Step 6・7、Task 3 Step 5 |
| §5 ⚙ とアコーディオン | Task 5 Step 2・3・4 |
| §5-1 結果が無いときの出し分け | Task 5 Step 5・Step 8 |
| §6 帯への集約（3要素） | Task 4 Step 2・5・6 |
| §2-4 CACHE_VERSION | Task 6 |
| §9-5 実機 | Task 7 |

**2. 埋めた穴**

- 設計書 §3 は `.toolctl` / `.toolbtn` の CSS に触れていなかった。参照元が消えるので
  Task 2 Step 3 で削除する
- 設計書 §5 は `.editcfg` に `display` を書くと `hidden` が効かなくなる点に触れていない。
  Task 5 Step 3 のコメントと `.editcfg[hidden]{display:none}` で担保する
- 設計書 §6 は選択数の文言を決めていなかった。Task 4 Step 5 で
  `"✋ Nマス選択中"` /（運搬中は）`"✋ Nマスを運搬中"` に確定した

**2-1. `/dig` の指摘を反映した箇所**

| 指摘 | 反映先 |
|---|---|
| `run()` の空分岐が `showMapState()` を打ち消すので、Task 5 の期待値 `empty:"block"` は必ず外れる | Task 5 Step 8 を `clearLots()` に変更。Step 8-2 で打ち消しの枝を別に測る。Step 5-2 で ⚙ を出し直す |
| `sweep` 常時オンで青枠が常設になり、横スクロールの影が恒久的に消える | 設計書 §2-2-1 を追加。Task 2 Step 2 で両方削除、Step 9 で確認 |
| 帯が常設になり、Pixel 9a では `#stashDock`（136px）に押されて折り返す | 設計書 §6-1・§6-2。Task 4 Step 5 で待機中は帯ごと消す。Step 8 で確認 |
| 目標（上部が何 px 空いたか）を測るステップが無い | 基準値に 284.6px を実測して記載。`topH()` ヘルパと Task 5 Step 9-2 を追加 |
| `tool` / `setTool()` を消すと第2弾で作り直すことになる | 設計書 §4-1-1。Task 2 で仕組みを残し、`#toolCtl` と `isTouchDevice()` だけ削除 |
| Task 3 の Files 一覧に、どのステップも触らない項目が2つある | Files から外し、「触らない箇所」として明記 |
| Task 1 Step 12 の `resetConfig()` が利用者のスペース設定を消す | `localStorage` を退避して書き戻す手順に変更 |
| `.flagundo{min-height:38px}` がタップ目標 44px 未満 | Task 4 Step 3 で 44px に変更 |
| 計画ファイル自体が一度もコミットされない | 実行開始前にコミット済み（このファイル） |
| `innerWidth === 0` だと px の実測が丸ごと嘘になる | 「検証の定型」と `topH()` に `innerWidth` の確認を組み込み |

**2-2. `/dig` の指摘のうち、採らなかったもの**

- **選択数が3か所に出る**（帯・`#stashDock` の見出し・`#stashBackBtn` の文言）。
  設計書 §6-3 のとおり許容する。浮き枠の見出しは「その枠の中で何を選んでいるか」、
  帯は「盤全体で何を選んでいるか」で、見る場面が違う
- **`switchTab()` の `clearSel()` が無条件化して副作用が増える**。
  `clearSel()` の先は `drawStashDock()` が `sp||lastSp||[]` で null 安全であることを
  確認済み。タブ切替のたびに走るが、実害が無く、条件を足すほうが読みにくい

**3. 名前の一貫性**

`toggleEditCfg()` / `closeEditCfg()` / `#editCtl` / `#editCfg` / `#cfgToggleBtn` /
`#toolFlagCount` / `#flagClearBtn` / `.flagcount` / `.editctl` / `.editcfg` は
Task 4・5 と Task 7 で同じ綴りを使っている。既存の `showSelCount()` /
`updateFlag()` / `clearSel()` / `setNav()` / `setDockPos()` / `setCellSize()` は
名前を変えていない。

**4. 範囲**

すべて `files/index.html` の配置編集タブの表面と `files/sw.js` の1行に収まる。
`place()` と配置図の表には触れないので、紙の非退行は各タスクの `probe()` で担保できる。
