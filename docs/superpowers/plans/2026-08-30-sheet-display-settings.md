# 配置図の表の表示設定と文字の水平圧縮 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 配置図の表の文字サイズと太字を設定で変えられるようにし、欄からはみ出す文字を水平に圧縮して1行に収める。

**Architecture:** 文字サイズ・太字を CSS 変数として `:root` に当て、表の CSS がそれを読む。`slotCells()` が各セルの中身を `<span class="fit">` で包み、`fitSheetText()` が実測して `scaleX()` を掛ける。設定タブはサブタブ3枚（品目マスタ／配置マス／表示設定）に分ける。配置ロジックには一切触らない。

**Tech Stack:** 単一 HTML ファイルの PWA。ビルドツールなし、テストランナーなし、依存パッケージなし。素の JavaScript と localStorage、Service Worker。

**設計書:** `docs/superpowers/specs/2026-08-30-sheet-display-settings-design.md`

## Global Constraints

- 対象ファイルは `files/index.html` と `files/sw.js` の 2 つだけ。他のファイルは変更しない。
- **配置ロジックには一切触らない。** `place()` / `areaCandidates()` / `buildWork()` /
  `validateMove()` / `applyMove()` / `DEFAULT_SPACES` / `SPACES_SAVE_VERSION` は変更しない。
- 表示設定は**手動配置の指紋 `inputFingerprint()` に入れない**。配置結果を変えないため。
- 欄数 `SHEET_TOP_SLOTS = 4` / `SHEET_BOTTOM_SLOTS = 7` は変更しない。
- 表の14列構成、`colgroup` の 48px、`table{width:672px}`、`gridRows()`、
  `drawLeaders()` の座標計算、印刷 `zoom:1.4` は変更しない。
- **圧縮の自然幅は `.sheet` の zoom で割って CSS px に直してから比を取る。**
  `getBoundingClientRect().width` は zoom 込み、`clientWidth` は CSS px。
  混ぜると zoom が 1 でない画面で圧縮率が狂う（設計書 3-2）。
- **`translateX` の補正を入れてはいけない。** `transform-origin:left center` の
  `scaleX(k)` だけで中央に収まる（設計書 3-1、実測済み）。
- 圧縮の下限は `FIT_MIN_SCALE = 0.4`。全セル共通。設定項目にはしない。
- **下限に落ちた欄は `white-space:normal` に戻す前に `width` を `avail / 0.4` へ広げる。**
  広げないと欄幅で折り返してから 40% に潰れ、6行・118px・インク幅37px の
  読めない塊になる（設計書 3-7、実測）。ループの先頭で `width=""` に戻すこと。
- **幅のガード（`avail<=0` なら何もしない）は、前回の圧縮結果を消すより前に置く。**
  消してから抜けると、非表示タブで呼ばれたときに圧縮が外れたまま残る。
- 文字サイズの上限は **24px**（`DISPLAY_FS_MAX`）。32px は印刷が用紙の147%になる
  （設計書 3-8、実測）。
- **`autoSheetZoom()` は `Math.max(1, ...)` で 1 倍を下回らない。** 文字を大きくして
  表が伸びても自動では救われないので、用紙の98%を超えたら `#sheetMsg` に警告を出す。
- 圧縮の警告は `#messages` に出さない。あれは配置編集タブの中にあり
  `renderResult()` が `innerHTML=` で全置換する。配置表タブに `#sheetMsg` を新設する。
- 既存の関数名・引数の並びは変えない。
- `files/index.html` を変更したら、最後に `files/sw.js` の `CACHE_VERSION` を
  `"v21"` から `"v22"` に上げる（Task 6）。上げないとインストール済みの PWA に更新が届かない。

## 検証の方針

このプロジェクトにはテストランナーが無い。各タスクの検証は、ブラウザで開いたページに対して
`javascript_tool`（`mcp__Claude_Browser__javascript_tool`）で検証スクリプトを実行し、
返り値の `ok` が `true` であることを確認する形で行う。

URL は `http://localhost:8765/`（`.claude/launch.json` の `pallet-layout`）。
**別のチャットのサーバが 8765 を掴んでいることがある。** その場合は
`preview_start` に `{url:"http://localhost:8765/"}` を渡して既存のサーバに繋ぐ。

**必ず守ること:**

- `applyConfig()` は `alert()` を呼び、`runFromButton()` は `confirm()` を2回呼ぶ
  （`files/index.html:2038` 手動調整の破棄 / `:2046` 未登録品目の登録）。
  どちらも `javascript_tool` の実行をブロックするので、検証スクリプトの先頭で
  **`window.alert` と `window.confirm` の両方を差し替える**。
  各タスクの検証スクリプトに含めてある。
- **検証は localStorage を書き換える。** `setSheetZoom('1')` は
  `saveData(STORE_KEY.zoom,'1')` を実行する。`runFromButton()` は `clearManual()` を呼ぶ。
  この端末の実データ（`palletApp.lots` / `palletApp.master`）には触らないが、
  「DOM だけの変更」ではない。
- **計画に書いた行番号は目安**（実ファイルと5〜7行ずれることがある）。
  位置は行番号ではなく前後のコードで決めること。
- **幾何を測る前に必ずタブを表示する。** 初期表示は `#tab-input` で他のタブは
  `display:none`。非表示要素の `getBoundingClientRect()` / `clientWidth` は 0 を返す。
  配置表を測るなら `runFromButton(); switchTab('sheet');` を先に呼ぶ。
- 合成イベントは `isTrusted:false` で既定動作を持たないため、ボタンのクリックは再現しない。
  ハンドラ関数を直接呼ぶ（`switchCfgTab('display')` / `displayChanged()` など）。
- `@media print` の中の宣言は `getComputedStyle` では読めない。CSSOM を走査する
  （`document.styleSheets` → `CSSRule.MEDIA_RULE` → `conditionText.includes("print")`）。

**この端末の localStorage には実データが入っている**（ロット9件・品目マスタ24件）。
`palletApp.spaces` と `palletApp.manual` は `null` なので `run()` で失う手動調整は無いが、
`palletApp.lots` と `palletApp.master` は消さないこと。

**改修前に測った基準値**（HEAD=`dc15c2c`、DEFAULT_SPACES のまっさら状態、実ロット9件）:

- 表の高さ 470.09px / 行数 19 / `tr.note-row` 2件（各16px）/ `tr.gap` 2件（各8px）
- 引き出し線 10本
- 印刷比 89.8%（`470.09 × 1.4 ÷ 733.2`）
- `td.slot` 33個 / `td.snote` 11個
- `#messages` は配置編集タブ内に1つ。`#sheetMsg` はまだ無い
- 印刷の非表示リスト: `header, .tabs, .actionbar, #updateBar, .sizectl, #messages, #regInfo, #saveStatus, .note, .hint`

---

### Task 1: 設定タブをサブタブ3枚にする

**Files:**
- Modify: `files/index.html`（CSS 1箇所・HTML 1箇所・JS 2箇所）

**Interfaces:**
- Consumes: なし
- Produces: `switchCfgTab(name)` — `name` は `"master"` / `"spaces"` / `"display"`。
  Task 3 が `#cfgpane-display` の中に表示設定のカードを入れる。
  `showCfgNote(msg)` は配置マスのサブタブに `.alert` を付けるようになる。

- [ ] **Step 1: 検証スクリプトを先に走らせて FAIL を確認する**

`javascript_tool` で実行する:

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  const r={};
  r.hasSwitch = typeof switchCfgTab==="function";
  r.panes = ["master","spaces","display"].map(t=>document.getElementById("cfgpane-"+t)?1:0);
  r.ok = r.hasSwitch && r.panes.every(x=>x===1);
  return r;
})()
```

Expected: `{hasSwitch:false, panes:[0,0,0], ok:false}`

- [ ] **Step 2: サブタブの CSS を足す**

`files/index.html` の `.sizebtn.on{...}`（149行付近）の直後に足す:

```css
  /* 設定タブの中のサブタブ。メインタブ（.tab）と見た目を変えて階層を示す */
  .subtabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap}
  .subtab{position:relative;border:1px solid var(--line);background:#fff;color:#374151;
          border-radius:999px;padding:8px 16px;font-size:13px;cursor:pointer;min-height:40px}
  .subtab.on{background:var(--accent);color:#fff;border-color:var(--accent);font-weight:700}
  /* 「見てほしい知らせがある」の印。件数を出す .dot とは別物 */
  .subtab.alert::after{content:"";position:absolute;top:-2px;right:-2px;
                       width:9px;height:9px;border-radius:50%;background:#f59e0b}
```

- [ ] **Step 3: 設定タブの HTML をサブタブ構造に変える**

`<div id="tab-settings" class="tabpanel" style="display:none">`（456行付近）の直後に
サブタブの列を入れ、既存の2つのカードをそれぞれペインで包む。

対象は次の2ブロックで、**中身は1文字も変えずインデントだけ深くして移す**:

- 品名マスタ … `<div class="card">` から `<div class="hint" ...>品名を入力すると…</div></div>` まで
  （458〜472行付近）
- スペース設定 … `<div class="card cfg">` から `<div class="summary" id="capacity"></div></div>` まで
  （474〜487行付近）

```html
  <!-- ===== 設定タブ ===== -->
  <div id="tab-settings" class="tabpanel" style="display:none">
    <div class="subtabs" id="cfgTabs">
      <button class="subtab on" id="subtab-master"  onclick="switchCfgTab('master')">品目マスタ</button>
      <button class="subtab"    id="subtab-spaces"  onclick="switchCfgTab('spaces')">配置マス</button>
      <button class="subtab"    id="subtab-display" onclick="switchCfgTab('display')">表示設定</button>
    </div>

    <div id="cfgpane-master">
      <div class="card">
        <h2>品目マスタ <span class="badge">品名 → SNP</span></h2>
        ... 既存のまま ...
      </div>
    </div>

    <div id="cfgpane-spaces" style="display:none">
      <div class="card cfg">
        <h2>スペース設定 <span class="badge" id="cfgBadge">この端末に保存</span></h2>
        ... 既存のまま ...
      </div>
    </div>

    <div id="cfgpane-display" style="display:none">
      <div class="card">
        <h2>表示設定 <span class="badge">この端末に保存</span></h2>
        <div class="hint">配置図の表の文字の設定はここに入ります。</div>
      </div>
    </div>
  </div>
```

- [ ] **Step 4: `switchCfgTab()` を足す**

`switchTab()` の定義の直後に足す:

```js
/* 設定タブの中のサブタブ。開いたペインの「知らせがある」印は落とす。
   案内文（#cfgNote / #dspNote）はペインの中にあるので、閉じているペインに
   出しても利用者の目に入らない。印だけを外に出す仕掛け。 */
function switchCfgTab(name){
  ["master","spaces","display"].forEach(t=>{
    const pane=document.getElementById("cfgpane-"+t);
    const btn=document.getElementById("subtab-"+t);
    if(pane) pane.style.display = (t===name)?"":"none";
    if(btn){
      btn.classList.toggle("on", t===name);
      if(t===name) btn.classList.remove("alert");
    }
  });
}
```

- [ ] **Step 5: `showCfgNote()` / `clearCfgNote()` に印の付け外しを足す**

既存の2つを次のように書き換える（`files/index.html:2260` 付近）:

```js
// 起動時に出した「読み込めなかった」の知らせを消す。設定を直したら用済みになる。
function clearCfgNote(){
  const note=document.getElementById("cfgNote");
  if(note){ note.textContent=""; note.hidden=true; }
  const btn=document.getElementById("subtab-spaces");
  if(btn) btn.classList.remove("alert");
}
function showCfgNote(msg){
  const note=document.getElementById("cfgNote");
  if(note){ note.textContent=msg; note.hidden=false; }
  // 配置マスのペインは閉じていることがあるので、サブタブに印を出して気づかせる
  const btn=document.getElementById("subtab-spaces");
  if(btn) btn.classList.add("alert");
}
```

- [ ] **Step 6: 検証スクリプトを走らせて PASS を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  const r={};
  switchTab('settings');
  r.hasSwitch = typeof switchCfgTab==="function";
  r.panes = ["master","spaces","display"].map(t=>document.getElementById("cfgpane-"+t)?1:0);
  const disp=()=>["master","spaces","display"].map(t=>getComputedStyle(document.getElementById("cfgpane-"+t)).display);
  switchCfgTab('display'); r.afterDisplay=disp();
  switchCfgTab('master');  r.afterMaster=disp();
  // 既存機能が生きているか（中身を触っていないことの確認）
  r.cfgTextLines = document.getElementById("cfgText").value.trim().split("\n").length;
  r.masterRows   = document.querySelectorAll("#masterTable tbody tr").length;
  r.capacityText = document.getElementById("capacity").textContent.slice(0,10);
  // 案内文の印
  showCfgNote("検証用");
  r.alertOn = document.getElementById("subtab-spaces").classList.contains("alert");
  switchCfgTab('spaces');
  r.alertOff = !document.getElementById("subtab-spaces").classList.contains("alert");
  clearCfgNote();
  r.ok = r.hasSwitch && r.panes.every(x=>x===1)
      && r.afterDisplay[0]==="none" && r.afterDisplay[2]==="block"
      && r.afterMaster[0]==="block" && r.afterMaster[2]==="none"
      && r.cfgTextLines===7 && r.masterRows>0 && r.capacityText.startsWith("収容能力")
      && r.alertOn && r.alertOff;
  switchCfgTab('master'); switchTab('input');
  return r;
})()
```

Expected: `ok:true`、`cfgTextLines:7`

- [ ] **Step 7: コミット**

```bash
git add files/index.html
git commit -m "feat: 設定タブを品目マスタ・配置マス・表示設定のサブタブに分ける

既存の2カードは中身を変えずペインで包んだだけ。案内文はペインの中に
あって閉じていると見えないので、サブタブのボタンに印を出す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: 欄からはみ出す文字を水平に圧縮する

**Files:**
- Modify: `files/index.html`（CSS 2箇所・HTML 2箇所・JS 2箇所）

**Interfaces:**
- Consumes: Task 1 の `switchCfgTab()`（このタスクでは使わない）
- Produces: `fitSheetText()` — 引数なし。`#sheetView .sheet` の中の `.fit` を実測して
  `scaleX` を当て、下限に達した欄を `#sheetMsg` に警告として出す。Task 3 が設定変更時に呼ぶ。
  `slotCells()` が各セルに `data-fit="name|lot|pal|note"` と `<span class="fit">` を付ける。

- [ ] **Step 1: 検証スクリプトを先に走らせて FAIL を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet');
  const r={};
  r.hasFit = typeof fitSheetText==="function";
  r.spans  = document.querySelectorAll("#sheetView .sheet .fit").length;
  r.msgBox = document.getElementById("sheetMsg")?1:0;
  r.ok = r.hasFit && r.spans>0 && r.msgBox===1;
  return r;
})()
```

Expected: `{hasFit:false, spans:0, msgBox:0, ok:false}`

- [ ] **Step 2: `.fit` の CSS と警告の器を足す**

CSS は `.sheet td.slot{...}`（257行付近）の直後に足す:

```css
  /* 欄に入りきらない文字を横に縮めて1行に収める入れ物。
     transform-origin:left center の scaleX だけでよい。translateX で中央へ
     戻す補正を入れてはいけない（自然幅が欄を超えた時点でブラウザが左端基準に
     置くので、補正を足すと右へはみ出す）。 */
  .sheet .fit{display:inline-block;white-space:nowrap;transform-origin:left center}
```

HTML は配置表タブの `<div id="sheetView"></div>`（445行付近）の**直前**に足す:

```html
      <div id="sheetMsg"></div>
```

印刷CSSの非表示リスト（303行）に `#sheetMsg` を加える:

```css
    header,.tabs,.actionbar,#updateBar,.sizectl,#messages,#sheetMsg,#regInfo,#saveStatus,.note,.hint{display:none !important}
```

- [ ] **Step 3: `slotCells()` がセルの中身を包むようにする**

既存の `slotCells()` を次に置き換える:

```js
function slotCells(entries,count,kind,extra){
  // data-fit は fitSheetText() が「どの種類の欄が入りきらなかったか」を数えるのに使う
  const FIT={name:"name", lot:"lot", pallet:"pal", note:"note"};
  const fk=FIT[kind]||"";
  let out="";
  for(let i=0;i<count;i++){
    const e=entries[i], l=e&&e.lot;
    let v="", cls="slot";
    if(kind==="name")        v=l?l.name:"";
    else if(kind==="lot")    v=l?l.lot:"";
    else if(kind==="pallet") v=e?palletSlotText(e):"";
    else if(kind==="note"){  v=e&&e.note?e.note:""; cls="none snote"; }
    if(kind!=="note") cls+=" c-"+fk;
    if(extra && kind!=="note"){
      cls+=" "+extra;
      if(i===0)       cls+=" bl2";
      if(i===count-1) cls+=" br2";
    }
    // 空欄は包まない。包むと高さ0の span が残って測定対象が無駄に増える
    const inner = v ? `<span class="fit">${esc(v)}</span>` : "";
    out+=`<td class="${cls}" data-fit="${fk}" colspan="2">${inner}</td>`;
  }
  // 4区画のときは左半分（6列）を空ける
  return out;
}
```

- [ ] **Step 4: `fitSheetText()` を足す**

`renderSheet()` の定義の**直前**に足す:

```js
/* 欄に入りきらない文字を水平に縮めて1行に収める。
   ・自然幅は .sheet の zoom で割って CSS px に直してから比を取る。
     getBoundingClientRect() は zoom 込み、clientWidth は CSS px なので、
     割らずに混ぜると zoom が 1 でない画面で倍率が狂う。
   ・下限まで縮めても入らない欄は折り返しに落として警告する。紙に出る情報を
     欠けさせないため。
   ・非表示タブでは幅が 0 なので何もしない（drawLeaders() と同じ理由）。 */
const FIT_MIN_SCALE = 0.4;
const FIT_LABEL = {name:"品名", lot:"ロット", pal:"P数", note:"注釈"};
const PRINT_ZOOM = 1.4;                 // 印刷CSSの .sheet{zoom} と必ず揃える
const PRINT_H_PX = 733.2;               // A4横・余白8mm の印刷領域の高さ
const PRINT_H_LIMIT = PRINT_H_PX*0.98;  // ブラウザごとの余白差を見込んで 98% を上限にする
function fitSheetText(){
  const box=document.getElementById("sheetMsg");
  const sheet=document.querySelector("#sheetView .sheet");
  if(!sheet){ if(box) box.innerHTML=""; return; }
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  const over={};
  sheet.querySelectorAll(".fit").forEach(sp=>{
    const td=sp.parentElement; if(!td) return;
    // 幅の判定は前回の結果を消す前に。消してから抜けると、非表示タブで
    // 呼ばれたときに圧縮が外れたまま残る
    const avail=td.clientWidth-2;            // 左右の padding 1px ずつ
    if(avail<=0) return;                     // 非表示タブでは測れない
    sp.style.transform="none";
    sp.style.whiteSpace="nowrap";
    sp.style.width="";                       // 前回広げた幅を戻してから測る
    const natural=sp.getBoundingClientRect().width/z;
    if(natural<=0) return;
    let k=Math.min(1, avail/natural);
    if(k<FIT_MIN_SCALE){
      k=FIT_MIN_SCALE;
      // 折り返しの基準幅を先に広げる。広げずに normal へ戻すと、欄幅で
      // 折り返してから 40% に潰れ、6行・インク幅37px の読めない塊になる
      sp.style.width=(avail/FIT_MIN_SCALE)+"px";
      sp.style.whiteSpace="normal";
      const kind=td.dataset.fit||"";
      over[kind]=(over[kind]||0)+1;
    }
    sp.style.transform = (k<1) ? `scaleX(${k.toFixed(4)})` : "none";
  });
  if(!box) return;
  let html="";
  const parts=Object.keys(over).map(k=>`${FIT_LABEL[k]||k} ${over[k]}件`);
  if(parts.length){
    html+=`<div class="msg warn">⚠ 文字が入りきらない欄があります：${parts.join(" / ")}。`
        + `設定タブの「表示設定」で文字を小さくするか、品名を短くしてください。</div>`;
  }
  // 縦のはみ出し。autoSheetZoom() は Math.max(1,...) で 1 倍を下回らないので、
  // 文字を大きくして表が伸びても自動では救われない
  const t=sheet.querySelector("table");
  if(t){
    const h=t.getBoundingClientRect().height/z;
    if(h>0 && h*PRINT_ZOOM>PRINT_H_LIMIT){
      const pct=Math.round(h*PRINT_ZOOM/PRINT_H_PX*100);
      html+=`<div class="msg warn">⚠ 文字が大きくて印刷が1ページに収まりません`
          + `（用紙の高さの${pct}%）。設定タブの「表示設定」で文字を小さくしてください。</div>`;
    }
  }
  box.innerHTML=html;
}
```

- [ ] **Step 5: `renderSheet()` の末尾で呼ぶ**

`renderSheet()` の末尾を次に変える。**`drawLeaders()` より前に呼ぶ**
（折り返しに落ちた欄は行の高さを変えるので、線を引く前に確定させる）:

```js
  host.innerHTML=`<div class="sheet"><div class="sheetbox"><table>
    <colgroup>${Array(14).fill('<col style="width:48px">').join("")}</colgroup>
    ${rows}</table></div></div>`;
  fitSheetText();                 // 折り返しは行の高さを変えるので線より先に確定させる
  drawLeaders(grid.anchors, bottom.map(e=>e.lot.id));
  applySheetZoom();
}
```

- [ ] **Step 6: 検証スクリプトを走らせて PASS を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet'); setSheetZoom('1');
  const sheet=document.querySelector("#sheetView .sheet");
  const r={};
  r.hasFit = typeof fitSheetText==="function";
  r.spans  = sheet.querySelectorAll(".fit").length;
  r.msgBox = document.getElementById("sheetMsg")?1:0;
  r.dataFit = [...new Set([...sheet.querySelectorAll("td[data-fit]")].map(td=>td.dataset.fit))].sort();

  // 実データの品名は短いので、長い文字列を入れて圧縮が効くことを確かめる。
  // 期待値は固定値で書かない。文字サイズは Task 3 で 10px → 16px に変わるので、
  // その場で自然幅を測って avail/natural と突き合わせる
  const td=sheet.querySelector("td.c-name");
  const sp=td.querySelector(".fit");
  const saved=sp.textContent;
  const z=()=>parseFloat(getComputedStyle(sheet).zoom)||1;
  const naturalOf=()=>{                      // 圧縮を外した素の幅（CSS px）
    const tf=sp.style.transform, ws=sp.style.whiteSpace, wd=sp.style.width;
    sp.style.transform="none"; sp.style.whiteSpace="nowrap"; sp.style.width="";
    const n=sp.getBoundingClientRect().width/z();
    sp.style.transform=tf; sp.style.whiteSpace=ws; sp.style.width=wd; return n;
  };
  const kOf=()=>+(/scaleX\(([\d.]+)\)/.exec(sp.style.transform)||[0,1])[1];
  const gaps=()=>{
    const a=sp.getBoundingClientRect(), b=td.getBoundingClientRect();
    return {left:+((a.left-b.left)/z()).toFixed(1), right:+((b.right-a.right)/z()).toFixed(1)};
  };

  sp.textContent="エキゾーストマニホールド"; fitSheetText();
  r.avail=td.clientWidth-2;
  r.natural=+naturalOf().toFixed(1);
  r.expectK=+Math.min(1, r.avail/r.natural).toFixed(4);
  r.longK=kOf();
  r.gaps=gaps();

  // zoom を 1.4（印刷相当）にしても倍率が変わらない
  const prev=sheet.style.zoom; sheet.style.zoom="1.4"; fitSheetText();
  r.zoom14K=kOf();
  sheet.style.zoom=prev||"";

  // 下限に達すると折り返しに落ちて警告が1本出る。
  // 10px なら 232.5px 超（26文字）で 0.4 を割る。16px なら16文字で足りるが、
  // 長いぶんには問題ないのでこの文字列のままでよい
  sp.textContent="エキゾーストマニホールド用ブラケット取付台座金具一式"; fitSheetText();
  r.floorNatural=+naturalOf().toFixed(1);
  r.floorK=kOf();
  r.floorWrap=sp.style.whiteSpace;
  // 折り返しの「実体」を見る。k と whiteSpace だけでは、6行118px に膨らむ
  // 失敗（width を広げ忘れ）を見逃す
  r.floorCellH=+td.getBoundingClientRect().height.toFixed(1);
  r.floorInkW =+(sp.getBoundingClientRect().width/z()).toFixed(1);
  r.floorWidth=sp.style.width;
  r.warnCount=document.querySelectorAll("#sheetMsg .msg.warn").length;
  r.warnText=(document.getElementById("sheetMsg").textContent||"").slice(0,24);

  // 元に戻す
  sp.textContent=saved; fitSheetText();
  r.warnAfter=document.querySelectorAll("#sheetMsg .msg.warn").length;

  r.ok = r.hasFit && r.spans>0 && r.msgBox===1
      && r.dataFit.join(",")==="lot,name,note,pal"
      && Math.abs(r.longK-r.expectK)<0.005
      && r.longK<1
      && Math.abs(r.gaps.left-r.gaps.right)<=2
      && Math.abs(r.zoom14K-r.longK)<0.005
      && r.floorNatural>232.5
      && Math.abs(r.floorK-0.4)<0.001 && r.floorWrap==="normal"
      && r.floorCellH<=42 && r.floorInkW>=90 && r.floorWidth!==""
      && r.warnCount===1 && r.warnAfter===0;
  return r;
})()
```

Expected: `ok:true`。改修前に測った見込みでは、`natural`≒119、`expectK`≒0.78
（Task 2 の時点では品名がまだ 10px。Task 3 で 16px になると `natural`≒191、`expectK`≒0.49 に変わるが、
このスクリプトは実測から期待値を作るのでどちらでも通る）。
`gaps.left` と `gaps.right` の差が 2px 以内、`zoom14K` は `longK` と一致、
`floorK` は 0.4 で `whiteSpace` が `normal`、警告は1本出て元に戻すと消える。

**`floorCellH` と `floorInkW` が要になる。** `width` を広げ忘れると
`floorCellH≒118`・`floorInkW≒37`（6行の読めない塊）になる。正しく広げていれば
`floorCellH≒41`・`floorInkW≒93`（2行・欄いっぱい）。

**注意:** 検証で `sp.textContent` を書き換えているが、これは DOM だけの変更で
localStorage には触らない。最後に `renderSheet()` で元に戻る。

- [ ] **Step 7: 主動線からも圧縮が効くことを確認する**

配置表タブを閉じた状態から「▶ 自動配置を作成」を通す経路の確認
（非表示タブで `renderSheet()` が走る経路。設計書 3-3）:

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  switchTab('input');                 // 配置表タブを閉じる
  runFromButton();                    // ここで renderSheet() は非表示のまま走る
  switchTab('sheet');                 // switchTab が renderSheet() を呼び直す
  const sheet=document.querySelector("#sheetView .sheet");
  const tfs=[...sheet.querySelectorAll(".fit")].map(s=>s.style.transform);
  return {spans:tfs.length, allSet:tfs.every(t=>t==="none"||t.startsWith("scaleX")),
          ok: tfs.length>0 && tfs.every(t=>t==="none"||t.startsWith("scaleX"))};
})()
```

Expected: `ok:true`

- [ ] **Step 8: コミット**

```bash
git add files/index.html
git commit -m "feat: 配置図の表で欄に入りきらない文字を横に圧縮する

各セルの中身を span.fit で包み、renderSheet の末尾で実測して scaleX を
当てる。下限 40% まで縮めても入らない欄は折り返しに落として警告する。
警告は配置編集タブの #messages とは別の器（#sheetMsg）に出す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: 表示設定（文字サイズ6項目・太字4項目）

**Files:**
- Modify: `files/index.html`（CSS 3箇所・HTML 1箇所・JS 3箇所）

**Interfaces:**
- Consumes: Task 1 の `#cfgpane-display`、Task 2 の `fitSheetText()`
- Produces: `DISPLAY`（現在値のオブジェクト）、`applyDisplay()`、`displayChanged()`、
  `resetDisplay()`、`validDisplay(d)`、`showDisplayNote(msg)` / `clearDisplayNote()`

- [ ] **Step 1: 検証スクリプトを先に走らせて FAIL を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  return {hasApply: typeof applyDisplay==="function",
          hasReset: typeof resetDisplay==="function",
          fsName: getComputedStyle(document.documentElement).getPropertyValue("--fs-name").trim(),
          ok: false};
})()
```

Expected: `{hasApply:false, hasReset:false, fsName:""}`

- [ ] **Step 2: CSS 変数の既定値と、それを読む表の CSS を書く**

`:root{--lot-corner:15px}`（215行付近）を次に置き換える:

```css
  /* ロットの太枠の角の丸み。0 にすると角のままになる */
  /* 文字サイズ・太字は表示設定（設定タブ）が JS で上書きする。ここが既定値 */
  :root{--lot-corner:15px;
        --fs-name:16px; --fs-lot:13px; --fs-pal:16px; --fs-note:13px;
        --fs-date:20px; --fs-total:30px;
        --fw-name:700;  --fw-lot:400;  --fw-pal:700;  --fw-note:400}
```

`.sheet .fldrow.c5{...}` / `.c3{...}`（242行付近）の `font-size` を変数に変える:

```css
  .sheet .fldrow.c5{grid-template-columns:repeat(5,1fr);font-size:var(--fs-date)}
  .sheet .fldrow.c3{grid-template-columns:repeat(3,1fr);font-size:var(--fs-total)}
```

`.sheet td.slot{...}`（257行付近）の直後に、種類ごとの指定を足す:

```css
  /* 種類ごとの文字サイズ・太字。td.slot の 10px を上書きする（詳細度が高い） */
  .sheet td.slot.c-name{font-size:var(--fs-name);font-weight:var(--fw-name)}
  .sheet td.slot.c-lot {font-size:var(--fs-lot); font-weight:var(--fw-lot)}
  .sheet td.slot.c-pal {font-size:var(--fs-pal); font-weight:var(--fw-pal)}
```

`.sheet td.snote{...}`（262行付近）の `font-size:10px` を変数に変える（他はそのまま）:

```css
  .sheet td.snote{display:table-cell;text-align:center;vertical-align:top;
                  font-size:var(--fs-note);font-weight:var(--fw-note);color:#333;height:16px;line-height:1.2;
                  border:0;background:transparent}
```

表示設定のフォーム用の CSS を `.subtab.alert::after{...}`（Task 1 で足した行）の直後に足す:

```css
  /* 表示設定の入力欄。項目が多いので2列に畳む */
  .dspgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px 14px;margin-bottom:10px}
  .dspgrid label{font-size:13px;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
  .dspgrid input[type=number]{width:72px}
```

- [ ] **Step 3: 表示設定のカードの中身を書く**

Task 1 で作った `#cfgpane-display` の中身を次に置き換える:

```html
    <div id="cfgpane-display" style="display:none">
      <div class="card">
        <h2>表示設定 <span class="badge">この端末に保存</span></h2>
        <div class="hint" id="dspNote" style="margin-bottom:8px;color:#b45309" hidden></div>
        <div class="hint" style="margin-bottom:10px">配置図の表の文字の大きさと太さです（8〜24px）。欄に入りきらない文字は自動で横に縮みます（下限40%）。<b>ロットを太字にすると数字の幅が約8%広がる</b>ので、縮む欄が増えます。</div>
        <div class="dspgrid">
          <label>品名 <input type="number" id="fsName"  min="8" max="24" onchange="displayChanged()"></label>
          <label>ロット <input type="number" id="fsLot"  min="8" max="24" onchange="displayChanged()"></label>
          <label>パレット数 <input type="number" id="fsPal" min="8" max="24" onchange="displayChanged()"></label>
          <label>注釈 <input type="number" id="fsNote"  min="8" max="24" onchange="displayChanged()"></label>
          <label>月日 <input type="number" id="fsDate"  min="8" max="24" onchange="displayChanged()"></label>
          <label>総パレット数 <input type="number" id="fsTotal" min="8" max="24" onchange="displayChanged()"></label>
        </div>
        <div class="dspgrid">
          <label class="chk"><input type="checkbox" id="fwName" onchange="displayChanged()"> 品名を太字</label>
          <label class="chk"><input type="checkbox" id="fwLot"  onchange="displayChanged()"> ロットを太字</label>
          <label class="chk"><input type="checkbox" id="fwPal"  onchange="displayChanged()"> パレット数を太字</label>
          <label class="chk"><input type="checkbox" id="fwNote" onchange="displayChanged()"> 注釈を太字</label>
        </div>
        <div class="row-actions">
          <button class="btn btn-ghost" onclick="resetDisplay()">初期値に戻す</button>
        </div>
      </div>
    </div>
```

- [ ] **Step 4: 保存キーと既定値を足す**

`STORE_KEY`（625行）に `display` を足す:

```js
const STORE_KEY={master:"palletApp.master", lots:"palletApp.lots", cell:"palletApp.cell", frac:"palletApp.frac", head:"palletApp.head", zoom:"palletApp.zoom", arrow:"palletApp.arrow", corner:"palletApp.corner", manual:"palletApp.manual", spaces:"palletApp.spaces", display:"palletApp.display"};
```

`SPACES_MAX_OFF` などの定数の並びの後（634行付近）に足す:

```js
/* 配置図の表の文字の設定。DEFAULT_DISPLAY を変えたらこの番号を上げる。
   古い保存はバージョン不一致で捨てられ、更新した既定値が既存の端末にも届く。
   配置結果は変わらないので、手動配置の指紋 inputFingerprint() には入れない。 */
const DISPLAY_SAVE_VERSION = 1;
const DISPLAY_FS_MIN = 8, DISPLAY_FS_MAX = 24;   // 32px は印刷が用紙の147%になる（設計書 3-8）
const DEFAULT_DISPLAY = {
  fsName:16, fsLot:13, fsPal:16, fsNote:13, fsDate:20, fsTotal:30,
  fwName:true, fwLot:false, fwPal:true, fwNote:false,
};
const DISPLAY_VARS = {
  fsName:"--fs-name", fsLot:"--fs-lot", fsPal:"--fs-pal", fsNote:"--fs-note",
  fsDate:"--fs-date", fsTotal:"--fs-total",
  fwName:"--fw-name", fwLot:"--fw-lot", fwPal:"--fw-pal", fwNote:"--fw-note",
};
let DISPLAY = Object.assign({}, DEFAULT_DISPLAY);
```

- [ ] **Step 5: 適用・入力・保存・復元の関数を足す**

`applyLotCorner()` の定義の直後（2380行付近）に足す:

```js
/* ---------- 配置図の表の文字の設定 ---------- */
// 保存の検証。1つでも外れたら設定全体を捨てる（スペース設定と同じ判断）
function validDisplay(d){
  if(!d || typeof d!=="object" || Array.isArray(d)) return false;
  return Object.keys(DEFAULT_DISPLAY).every(k=>{
    const v=d[k];
    return k.startsWith("fs")
      ? (Number.isFinite(v) && v>=DISPLAY_FS_MIN && v<=DISPLAY_FS_MAX)
      : (typeof v==="boolean");
  });
}
// CSS 変数に流し込む。表を描き直す必要はないが、文字の幅が変わるので
// 圧縮だけは計算し直す
function applyDisplay(){
  const st=document.documentElement.style;
  Object.keys(DEFAULT_DISPLAY).forEach(k=>{
    st.setProperty(DISPLAY_VARS[k], k.startsWith("fs") ? DISPLAY[k]+"px" : (DISPLAY[k]?"700":"400"));
  });
  fitSheetText();
}
// 現在値を入力欄へ
function displayToForm(){
  Object.keys(DEFAULT_DISPLAY).forEach(k=>{
    const el=document.getElementById(k); if(!el) return;
    if(k.startsWith("fs")) el.value=DISPLAY[k]; else el.checked=DISPLAY[k];
  });
}
// 入力欄から現在値へ。範囲外・数値でないものはその項目だけ既定値に戻す
function displayChanged(){
  Object.keys(DEFAULT_DISPLAY).forEach(k=>{
    const el=document.getElementById(k); if(!el) return;
    if(k.startsWith("fs")){
      const n=parseInt(el.value,10);
      DISPLAY[k]=(Number.isFinite(n) && n>=DISPLAY_FS_MIN && n<=DISPLAY_FS_MAX) ? n : DEFAULT_DISPLAY[k];
    }else{
      DISPLAY[k]=!!el.checked;
    }
  });
  displayToForm();                 // 弾いた値を入力欄にも反映する
  saveData(STORE_KEY.display, {v:DISPLAY_SAVE_VERSION, display:DISPLAY});
  clearDisplayNote();
  applyDisplay();
}
function resetDisplay(){
  DISPLAY=Object.assign({}, DEFAULT_DISPLAY);
  saveData(STORE_KEY.display, null);
  displayToForm();
  clearDisplayNote();
  applyDisplay();
}
// 案内文。表示設定のペインは閉じていることがあるのでサブタブに印を出す
function showDisplayNote(msg){
  const note=document.getElementById("dspNote");
  if(note){ note.textContent=msg; note.hidden=false; }
  const btn=document.getElementById("subtab-display");
  if(btn) btn.classList.add("alert");
}
function clearDisplayNote(){
  const note=document.getElementById("dspNote");
  if(note){ note.textContent=""; note.hidden=true; }
  const btn=document.getElementById("subtab-display");
  if(btn) btn.classList.remove("alert");
}
```

- [ ] **Step 6: 起動時の復元を足す**

`initFrac()` の IIFE の直後（2848行付近、`showMapState();` の直前）に足す:

```js
/* 表示設定：保存があれば復元。
   スペース設定と違い、バージョンが変わっても丸ごと捨てない。ここに入っているのは
   利用者が紙合わせで決めた値で、こちらの既定値より現場の目のほうが正しいため。
   足りないキーを既定値で補い、範囲外になった値だけ既定値に直す（設計書 6章）。
   保存の形自体が壊れているとき（display がオブジェクトでない）だけ初期値に戻す。 */
(function initDisplay(){
  const d=loadData(STORE_KEY.display);
  if(d){
    const raw=(d.display && typeof d.display==="object" && !Array.isArray(d.display)) ? d.display : null;
    if(!raw){
      saveData(STORE_KEY.display, null);
      showDisplayNote("保存されていた表示設定を読み込めなかったので、初期値に戻しました。");
    }else{
      const merged=Object.assign({}, DEFAULT_DISPLAY, raw);
      Object.keys(DEFAULT_DISPLAY).forEach(k=>{
        const v=merged[k];
        const okv = k.startsWith("fs")
          ? (Number.isFinite(v) && v>=DISPLAY_FS_MIN && v<=DISPLAY_FS_MAX)
          : (typeof v==="boolean");
        if(!okv) merged[k]=DEFAULT_DISPLAY[k];
      });
      DISPLAY=merged;
      if(d.v!==DISPLAY_SAVE_VERSION){
        saveData(STORE_KEY.display, {v:DISPLAY_SAVE_VERSION, display:DISPLAY});
        showDisplayNote("表示設定の項目が変わったので、足りない分を初期値で補いました。");
      }
    }
  }
  displayToForm();
  applyDisplay();
})();
```

- [ ] **Step 7: 検証スクリプトを走らせて PASS を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet'); setSheetZoom('1');
  const cs=()=>getComputedStyle(document.documentElement);
  const sheet=document.querySelector("#sheetView .sheet");
  const r={};
  r.vars = ["--fs-name","--fs-lot","--fs-pal","--fs-note","--fs-date","--fs-total",
            "--fw-name","--fw-lot","--fw-pal","--fw-note"].map(v=>cs().getPropertyValue(v).trim());
  const nameTd = sheet.querySelector("td.c-name");
  const lotTd  = sheet.querySelector("td.c-lot");
  const palTd  = sheet.querySelector("td.c-pal");
  const noteTd = sheet.querySelector("td.snote");
  r.applied = [getComputedStyle(nameTd).fontSize, getComputedStyle(nameTd).fontWeight,
               getComputedStyle(lotTd).fontSize,  getComputedStyle(lotTd).fontWeight,
               getComputedStyle(palTd).fontSize,  getComputedStyle(palTd).fontWeight,
               getComputedStyle(noteTd).fontSize, getComputedStyle(noteTd).fontWeight];
  // 設定変更が renderSheet を呼ばずに反映される
  const before = sheet.querySelector("td.c-name .fit").style.transform;
  document.getElementById("fsName").value="24"; displayChanged();
  const after24 = getComputedStyle(nameTd).fontSize;
  const tf24 = sheet.querySelector("td.c-name .fit").style.transform;
  // 範囲外は既定に戻る
  document.getElementById("fsName").value="99"; displayChanged();
  r.clamped = [document.getElementById("fsName").value, DISPLAY.fsName];
  resetDisplay();
  r.afterReset = [getComputedStyle(nameTd).fontSize, DISPLAY.fsName];
  // 保存の検証
  r.validOK  = validDisplay(Object.assign({}, DEFAULT_DISPLAY));
  r.validNG1 = validDisplay(Object.assign({}, DEFAULT_DISPLAY, {fsName:99}));
  r.validNG2 = validDisplay(Object.assign({}, DEFAULT_DISPLAY, {fwName:"yes"}));
  r.validNG3 = validDisplay({fsName:16});
  r.saved = JSON.parse(localStorage.getItem("palletApp.display")||"null");
  r.ok = r.vars.join(",")==="16px,13px,16px,13px,20px,30px,700,400,700,400"
      && r.applied.join(",")==="16px,700,13px,400,16px,700,13px,400"
      && after24==="24px" && tf24!==before
      && r.clamped[0]==="16" && r.clamped[1]===16
      && r.afterReset[0]==="16px" && r.afterReset[1]===16
      && r.validOK && !r.validNG1 && !r.validNG2 && !r.validNG3
      && r.saved===null;
  return r;
})()
```

Expected: `ok:true`

- [ ] **Step 8: 保存と復元を確認する**

```js
// 1本目：値を変えて保存されることを見る
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  switchTab('settings'); switchCfgTab('display');
  document.getElementById("fsLot").value="15";
  document.getElementById("fwLot").checked=true;
  displayChanged();
  const s=JSON.parse(localStorage.getItem("palletApp.display"));
  return {v:s.v, fsLot:s.display.fsLot, fwLot:s.display.fwLot,
          ok: s.v===1 && s.display.fsLot===15 && s.display.fwLot===true};
})()
```

リロードしてから 2本目:

```js
// 2本目：リロード後に復元されているか。そのあとバージョン不一致の保存を仕込む
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  const r={restored:[DISPLAY.fsLot, DISPLAY.fwLot]};
  // バージョン不一致＋キー欠け。マージされて fsLot:22 が残るはず
  localStorage.setItem("palletApp.display",
    JSON.stringify({v:99, display:{fsLot:22, fwLot:true}}));
  r.ok = r.restored[0]===15 && r.restored[1]===true;
  return r;
})()
```

リロードして 3本目（マージされ、利用者の値が残っているか）:

```js
(()=>{
  const note=document.getElementById("dspNote");
  const btn=document.getElementById("subtab-display");
  const saved=JSON.parse(localStorage.getItem("palletApp.display"));
  const r={merged:[DISPLAY.fsLot, DISPLAY.fwLot, DISPLAY.fsName],
           noteHidden:note.hidden, noteText:note.textContent.slice(0,10),
           alert:btn.classList.contains("alert"),
           savedV:saved && saved.v, savedFsLot:saved && saved.display.fsLot};
  // 利用者の値（22 / true）は残り、欠けていたキーは既定値で埋まる
  r.ok = r.merged[0]===22 && r.merged[1]===true && r.merged[2]===16
      && !r.noteHidden && r.noteText.startsWith("表示設定の項目") && r.alert
      && r.savedV===1 && r.savedFsLot===22;
  // 次のテストのために壊れた保存を仕込む
  localStorage.setItem("palletApp.display", JSON.stringify({v:1, display:"こわれた"}));
  return r;
})()
```

リロードして 4本目（壊れた保存は初期値に戻る）:

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  const note=document.getElementById("dspNote");
  const r={fsLot:DISPLAY.fsLot, noteText:note.textContent.slice(0,10),
           saved:localStorage.getItem("palletApp.display")};
  r.ok = r.fsLot===13 && r.noteText.startsWith("保存されていた") && r.saved==="null";
  // 後片付け
  switchTab('settings'); switchCfgTab('display'); resetDisplay();
  return r;
})()
```

Expected: 4本とも `ok:true`

- [ ] **Step 8-2: 文字を大きくすると印刷の警告が出ることを確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet'); setSheetZoom('1');
  const sheet=document.querySelector("#sheetView .sheet");
  const t=sheet.querySelector("table");
  const h=()=>+t.getBoundingClientRect().height.toFixed(1);
  const warns=()=>[...document.querySelectorAll("#sheetMsg .msg.warn")].map(d=>d.textContent);
  const r={base:{h:h(), warns:warns().length}};
  // 上限いっぱいまで大きくする
  switchTab('settings'); switchCfgTab('display');
  ["fsName","fsLot","fsPal","fsNote","fsDate","fsTotal"].forEach(id=>{
    document.getElementById(id).value="24";
  });
  displayChanged();
  switchTab('sheet');                       // 反映は switchTab の renderSheet が担う
  r.big={h:h(), warns:warns()};
  r.bigRatio=+(r.big.h*1.4/733.2*100).toFixed(1);
  r.hasHeightWarn=r.big.warns.some(w=>w.includes("1ページに収まりません"));
  // 上限を超える値は弾かれる
  document.getElementById("fsName").value="99"; displayChanged();
  r.clampedTo=DISPLAY.fsName;
  switchTab('settings'); switchCfgTab('display'); resetDisplay();
  switchTab('sheet');
  r.after={h:h(), warns:warns().length};
  r.ok = r.base.warns===0
      && (r.bigRatio<=98 ? !r.hasHeightWarn : r.hasHeightWarn)
      && r.clampedTo===16
      && r.after.warns===0;
  return r;
})()
```

Expected: `ok:true`。全項目24pxでの `bigRatio` が98%を超えていれば高さの警告が1本出る。
98%以下なら警告は出ない（どちらでも `ok:true` になるが、`bigRatio` を記録しておくこと）。

- [ ] **Step 9: コミット**

```bash
git add files/index.html
git commit -m "feat: 配置図の表の文字サイズと太字を設定できるようにする

品名16 / ロット13 / P数16 / 注釈13px を初期値にし、CSS 変数で表に当てる。
表を描き直さずに反映できるが、文字の幅が変わるので圧縮だけ計算し直す。
保存はバージョン付きで、壊れていたら初期値に戻して案内を出す。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 矢印の先・角の丸み・端数「半」を表示設定へ移す

**Files:**
- Modify: `files/index.html`（HTML 3箇所）

**Interfaces:**
- Consumes: Task 3 の `#cfgpane-display` のカード
- Produces: なし（既存の `setArrowHead()` / `setLotCorner()` / `toggleFrac()` をそのまま使う）

**このタスクで変えるのは置き場所だけ。** 保存キー・関数・初期化の IIFE は一切触らない。

- [ ] **Step 1: 配置表タブから矢印・角丸のボタンを外す**

`#zoomCtl`（434行付近）を次に変える。表示倍率と `#zoomNow` は残す:

```html
      <div class="sizectl" id="zoomCtl">
        <span class="lbl">表示倍率</span>
        <button class="sizebtn on" data-zoom="auto" onclick="setSheetZoom('auto')">自動</button>
        <button class="sizebtn" data-zoom="1" onclick="setSheetZoom('1')">100%</button>
        <button class="sizebtn" data-zoom="1.5" onclick="setSheetZoom('1.5')">150%</button>
        <button class="sizebtn" data-zoom="2" onclick="setSheetZoom('2')">200%</button>
        <span class="lbl" id="zoomNow"></span>
      </div>
```

- [ ] **Step 2: 入力タブから端数「半」のチェックを外す**

385行の `<label class="chk"><input type="checkbox" id="fracChk" onchange="toggleFrac()"> 端数を「半」で表示</label>`
の行を削除する。**「満杯時に混載を許可」はそのまま残す**（配置アルゴリズムの入力なので移さない）。

- [ ] **Step 3: 表示設定のカードに3つを足す**

Task 3 で作った表示設定カードの「初期値に戻す」ボタンの**直前**に足す:

```html
        <div class="hint" style="margin:12px 0 6px"><b>そのほかの表示</b></div>
        <div class="sizectl">
          <span class="lbl">矢印の先</span>
          <button class="sizebtn on" data-arrow="1" onclick="setArrowHead(true)">あり</button>
          <button class="sizebtn" data-arrow="0" onclick="setArrowHead(false)">なし</button>
          <span class="grp"><span class="lbl">角の丸み</span>
            <button class="sizebtn on" data-corner="1" onclick="setLotCorner(true)">あり</button>
            <button class="sizebtn" data-corner="0" onclick="setLotCorner(false)">なし</button></span>
        </div>
        <label class="chk"><input type="checkbox" id="fracChk" onchange="toggleFrac()"> 端数を「半」で表示</label>
```

- [ ] **Step 4: 検証スクリプトを走らせて PASS を確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  const r={};
  // 置き場所
  r.arrowInDisplay  = !!document.querySelector("#cfgpane-display .sizebtn[data-arrow]");
  r.cornerInDisplay = !!document.querySelector("#cfgpane-display .sizebtn[data-corner]");
  r.fracInDisplay   = !!document.querySelector("#cfgpane-display #fracChk");
  r.arrowInSheetTab = !!document.querySelector("#zoomCtl .sizebtn[data-arrow]");
  r.fracInInputTab  = !!document.querySelector("#tab-input #fracChk");
  r.zoomBtns        = document.querySelectorAll("#zoomCtl .sizebtn[data-zoom]").length;

  // 機能が生きているか
  runFromButton(); switchTab('sheet');
  const leaders=()=>document.querySelectorAll("#sheetView .leaders path").length;
  const withHead=leaders();
  setArrowHead(false); const noHead=leaders(); setArrowHead(true);
  setLotCorner(false);
  r.cornerOff=document.documentElement.style.getPropertyValue("--lot-corner");
  setLotCorner(true);
  r.cornerOn=document.documentElement.style.getPropertyValue("--lot-corner");

  switchTab('settings'); switchCfgTab('display');
  const chk=document.getElementById("fracChk");
  const was=chk.checked;
  chk.checked=true; toggleFrac();
  r.fracSaved=loadData(STORE_KEY.frac);
  chk.checked=was; toggleFrac();

  r.ok = r.arrowInDisplay && r.cornerInDisplay && r.fracInDisplay
      && !r.arrowInSheetTab && !r.fracInInputTab && r.zoomBtns===4
      && withHead>noHead && r.cornerOff==="0" && r.cornerOn==="" && r.fracSaved===true;
  switchTab('input');
  return r;
})()
```

Expected: `ok:true`。`withHead` は矢印ありのときのパス数（線＋矢頭）で、`noHead` より多い。

- [ ] **Step 5: コミット**

```bash
git add files/index.html
git commit -m "feat: 矢印の先・角の丸み・端数「半」を表示設定へ移す

置き場所だけの移動で、保存キーも関数も変えていない。表示倍率は
「今この画面をどう見るか」の操作なので配置表タブに残した。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: 表の実寸を測り直して SHEET_H を合わせる

**Files:**
- Modify: `files/index.html`（JS 1箇所・CSS のコメント1箇所）

**Interfaces:**
- Consumes: Task 2・Task 3 の結果（文字サイズ16pxと圧縮が入った状態の実寸）
- Produces: なし

- [ ] **Step 1: 実寸を測る**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet'); setSheetZoom('1');
  const sheet=document.querySelector("#sheetView .sheet");
  const t=sheet.querySelector("table");
  const r={
    tableH:+t.getBoundingClientRect().height.toFixed(2),
    tableW:+t.getBoundingClientRect().width.toFixed(2),
    rows:sheet.querySelectorAll("table tr").length,
    noteRows:[...sheet.querySelectorAll("tr.note-row")].map(x=>+x.getBoundingClientRect().height.toFixed(1)),
    gaps:[...sheet.querySelectorAll("tr.gap")].map(x=>+x.getBoundingClientRect().height.toFixed(1)),
    leaders:sheet.querySelectorAll(".leaders path").length,
    sheetLen:sheet.querySelector(".sheetbox").innerHTML
      .replace(/<span class="ring">(月|火|水|木|金)<\/span>/g,'$1').length,
    fitScales:[...sheet.querySelectorAll(".fit")].map(s=>s.style.transform)
      .filter(t=>t.startsWith("scaleX")).length,
  };
  r.printed=+(r.tableH*1.4).toFixed(1);
  r.ratio=+(r.tableH*1.4/733.2*100).toFixed(1);
  r.ok = r.ratio<98;
  return r;
})()
```

Expected: `ok:true`。この `tableH` を Step 2 で使う。

**見込み**: 改修前が 470.09px。行の高さは 26px 指定なので 16px の文字でも増えない。
注釈行だけ 13px フォントで `13×1.2＋2＝17.6px` になり、`height:16px` を超えて伸びる。
上下2箇所で **473px 前後**、印刷比 90.4% を見込む。
これから大きく外れたら（±5px 超）、原因を調べてから先へ進む。

- [ ] **Step 2: `SHEET_H` を実測値に合わせる**

`const SHEET_W=675+20, SHEET_H=491+20;`（2385行付近）の `491` を Step 1 の `tableH` を
切り上げた整数に置き換える。コメントも書き換える:

```js
/* ---------- 配置図の表の表示倍率 ---------- */
// 表の実寸（.sheet の padding 10px×2 を含む）。
// SHEET_H は文字サイズが初期値のときの高さ。文字を大きくすると伸びるが、
// 入りきらない文字は圧縮で1行に収まるので、行が増えるのは下限40%を割った
// 異常時だけ（そのときは #sheetMsg に警告も出る）。
// 印刷CSSのコメント（.sheet の zoom 指定の近く）と必ず一致させること。
const SHEET_W=675+20, SHEET_H=473+20;   // ← Step 1 で測った tableH を切り上げた値に置き換える
```

- [ ] **Step 3: 印刷CSSのコメントを合わせる**

`/* 表は 675×491px 固定（注釈が2行に折り返した場合の高さ）。`（305行付近）の段落を、
Step 1 で測った `tableH` / `printed` / `ratio` に合わせて書き換える:

```css
    /* 表は 675×473px（文字サイズが初期値のとき）。
       A4横・余白8mm の印刷領域は 281×194mm＝約1062×733px。
       1.4倍で 945×662px。用紙の高さを 90% 使い、
       ブラウザごとの余白差で2ページに割れない範囲に収める。
       欄に入りきらない文字は圧縮で1行に収まるので、日によって高さが変わらない */
```

`473` / `662` / `90` は見込み値。**Step 1 で測った `tableH` / `printed` / `ratio` に
置き換えること。**

- [ ] **Step 4: 倍率の自動計算が正しく効くか確認する**

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet');
  const sheet=document.querySelector("#sheetView .sheet");
  const t=sheet.querySelector("table");
  setSheetZoom('1');
  const real=+t.getBoundingClientRect().height.toFixed(2)+20;
  setSheetZoom('auto');
  const z=parseFloat(getComputedStyle(sheet).zoom)||1;
  // 印刷CSSの zoom を CSSOM から読む（getComputedStyle では取れない）
  let printZoom=null;
  for(const sh of document.styleSheets){
    let rules; try{ rules=sh.cssRules; }catch(e){ continue; }
    for(const rule of rules||[]){
      if(rule.type===CSSRule.MEDIA_RULE && rule.conditionText.includes("print")){
        for(const q of rule.cssRules){
          if(q.selectorText===".sheet" && q.style.zoom) printZoom=q.style.zoom;
        }
      }
    }
  }
  const r={real, declared:SHEET_H, diff:+(SHEET_H-real).toFixed(2), autoZoom:z, printZoom};
  r.ok = Math.abs(r.diff)<=1 && printZoom==="1.4";
  return r;
})()
```

Expected: `ok:true`（`SHEET_H` と実寸の差が 1px 以内）

- [ ] **Step 5: 新しい基準値を `.superpowers/sdd/progress.md` に記録する**

Step 1 で測った値を書き残す。次の案件が回帰の基準に使う。

- `sheetLen`（`.fit` を挟んだので前案件の 8778 は使えない）
- 表の高さ / 行数 / `tr.note-row` の高さ / `tr.gap` の高さ
- 引き出し線の本数 / 印刷比
- 圧縮が掛かっている `.fit` の数（`fitScales`）

**ついでに前案件の記録の誤りを直す。** `progress.md` に「SHEET_W=695 / SHEET_H=523」と
あるが、実コードは `491+20=511` だった。今回の実測値に書き換える。

- [ ] **Step 6: コミット**

```bash
git add files/index.html
git commit -m "chore: 文字サイズと圧縮を入れた後の実寸に SHEET_H を合わせる

autoSheetZoom() が実寸と違う高さで倍率を選ばないようにする。
印刷CSSのコメントの数値も同じ実測に揃えた。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: CACHE_VERSION を上げる

**Files:**
- Modify: `files/sw.js:6`

**Interfaces:**
- Consumes: Task 1〜5 のすべて
- Produces: なし

- [ ] **Step 1: `CACHE_VERSION` を v22 にする**

```js
const CACHE_VERSION = "v22";
```

- [ ] **Step 2: 値を確認する**

```bash
grep -n 'CACHE_VERSION = ' files/sw.js
```

Expected: `6:const CACHE_VERSION = "v22";`

- [ ] **Step 3: コミット**

```bash
git add files/sw.js
git commit -m "chore: CACHE_VERSION を v22 に上げる

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: 実機で確認する（Pixel 9a、人の作業）**

コードでは代替できない。ユーザーに依頼する。

1. 印刷プレビューで 16px の品名が紙で読めるか。読みにくければ表示設定で調整して確定させる
2. 圧縮のかかった欄（`k≒0.5`）が紙で読めるか。下限40%が妥当か
3. 設定タブのサブタブがスマホ幅（375px）で扱えるか。3つのボタンが折り返さずに並ぶか
4. 表示設定の入力欄（`.dspgrid`）がスマホ幅で崩れないか

---

### Task 7: 実機で確定した初期値を反映して実寸を測り直す

**Files:**
- Modify: `files/index.html`（JS 2箇所・CSS のコメント1箇所）、`files/sw.js`

**Interfaces:**
- Consumes: Task 6 Step 4 の実機確認の結果
- Produces: なし

**Task 6 Step 4 で初期値が変わらなければ、このタスクは丸ごとスキップする。**
「16 / 13 / 16 / 13 のままでよい」と確認できたら、その旨を記録して終わり。

- [ ] **Step 1: 確定した初期値を `DEFAULT_DISPLAY` に入れる**

ユーザーが紙で決めた値に書き換える:

```js
const DEFAULT_DISPLAY = {
  fsName:16, fsLot:13, fsPal:16, fsNote:13, fsDate:20, fsTotal:30,
  fwName:true, fwLot:false, fwPal:true, fwNote:false,
};
```

- [ ] **Step 2: 開発端末の保存を消してから測る**

保存はマージ方式なので、**保存が残っていると新しい既定値が効かない**。
検証の前に必ず消す:

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  localStorage.removeItem("palletApp.display");
  location.reload();
  return "reloaded";
})()
```

リロード後に確認する:

```js
(()=>{ window.alert=()=>{}; window.confirm=()=>false;
  runFromButton(); switchTab('sheet'); setSheetZoom('1');
  const sheet=document.querySelector("#sheetView .sheet");
  const t=sheet.querySelector("table");
  const r={display:Object.assign({}, DISPLAY),
           tableH:+t.getBoundingClientRect().height.toFixed(2),
           warns:document.querySelectorAll("#sheetMsg .msg.warn").length};
  r.printed=+(r.tableH*1.4).toFixed(1);
  r.ratio=+(r.tableH*1.4/733.2*100).toFixed(1);
  r.ok = r.ratio<98 && r.warns===0;
  return r;
})()
```

Expected: `ok:true`。`display` が新しい既定値と一致していること。

- [ ] **Step 3: `SHEET_H` と印刷CSSのコメントを新しい実測値に合わせる**

Task 5 Step 2 / Step 3 と同じ手順で、Step 2 で測った `tableH` / `printed` / `ratio` に
置き換える。

- [ ] **Step 4: `CACHE_VERSION` を上げる**

`files/sw.js` を `"v23"` にする。

- [ ] **Step 5: コミット**

```bash
git add files/index.html files/sw.js
git commit -m "chore: 実機の紙で確定した初期値に合わせて既定値と実寸を直す

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 実装後に残るもの

- 上下段の欄追加・テーブル分割・あふれブロック（メモ 3-3 / 3-6、掲載先 `over`）
- 配置表の編集可能化（メモ 2-6）
- ロットまとめ（メモ 2-4）
- 注釈まで含めた太枠化（メモ 2-3）
- 前案件から持ち越し: `.superpowers/sdd/progress.md` の N-2 / N-3 / I-3 と Minor 群
