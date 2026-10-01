# 操作マニュアル再構成（本編＋付録）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 13ページの操作マニュアルを、本編（紹介・作業手順と自動配置のしくみ・画面の見取り図・従来の書き方）と付録（今の詳しい操作説明）の構成に組み直し、アプリ v78 で撮り直して PDF を作る。

**Architecture:** ページの原本は `manual/pages/pNN.html`（ファイル名の番号順に組む）。見取り図の試作（`manual/drafts/ov-*.html` と試作専用の組版 `manual/draft-overview.cjs`）を本編に取り込み、札の差し込みを本編の組版（`lib/build-lib.cjs`・`build.cjs`）へ移す。組版時にページ参照（P数字）の範囲を検査する。

**Tech Stack:** Node.js 22（CommonJS）、`playwright-core`＋インストール済み Google Chrome、`node:test`、macOS の `sips`

**Spec:** `docs/superpowers/specs/2026-10-01-manual-restructure-design.md`

## Global Constraints

- アプリ本体（`files/`）は変更しない。`files/sw.js` の `CACHE_VERSION` も上げない。
- 起動方法（URL、PC）は書かない。
- 見取り図の札: A、B、C…（赤い四角、#e8335a）。操作手順: ①②③（図と対応する手順だけ）。章・節の番号: 普通の数字。
- 付録の章番号は本編の続き: 5. 入力 ／ 6. 配置編集 ／ 7. 配置図 ／ 8. 保存と設定 ／ 9. 毎日の作業チェック。節番号も章に合わせる（3.1 → 5.1 など）。
- 本文の文字は縮めない。はみ出したら画像の `h` クラスか配置で調整し、それでも無理なら止めて相談する。
- 1文ごとに `<br>` で改行する（余白の範囲で）。
- 戻す・進むの表記は「戻す」「進む」。「元に戻す」「やり直す」と書かない。
- 確認ダイアログの文言を手で書き写さない（`data-dialog` の差し込み口を使う）。
- 札の座標を手で書かない（`verification.json` の `overview` から差し込む）。
- `manual/dist/` は Task 4 で1回だけコミットする（途中のタスクでは `git add` しない）。
- コミットメッセージは既存の形式（`docs:` / `feat:` ＋日本語）で、末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。
- コマンドはリポジトリのルート（`/Users/kenichihanada/web-app/pallet-layout`）で実行。ブランチは `feat/manual-11pages`。`docs/superpowers/` の 2026-09-23 付けの未追跡ファイルと `.claude/launch.json` の変更はコミットしない。

---

### Task 1: 組版の拡張（札の差し込み・ページ参照の検査・位置表示の切り替え）

**Files:**
- Modify: `manual/lib/build-lib.cjs`
- Modify: `manual/build.cjs`
- Modify: `manual/render.cjs`
- Modify: `manual/test/build-lib.test.cjs`
- Delete: `manual/draft-overview.cjs`
- Modify: `manual/package.json`（`draft` スクリプトを消す）

**Interfaces:**
- Produces（`build-lib.cjs` の追加・変更）:
  - `injectMarkers(html:string, ov:object, file:string):string` — `draft-overview.cjs` の同名関数をそのまま移す。`<div class="ov" data-ov="NAME">…</div>` に細枠（`.ov-box`）と札（`.ov-tag`）を差し込み、表（`<tr data-key="X"><td>…</td><td>名前</td>`）の記号と名前が札と一致しなければ例外。`div.ov` が無いページでは呼ばない（呼ぶ側で判定）。
  - `pageRefs(html:string):number[]` — 本文から「P数字」「P数字〜数字」のページ番号をすべて取り出す（範囲は両端を返す）。HTML タグの中（属性値）は数えない。直前が英字の場合（`SNP` など）は数えない。
  - `checkPageRefs(pages:{meta,body}[], files:string[]):void` — 各ページ本文の `pageRefs` が 1〜ページ数に入っていなければ、`ファイル名: ページ参照 P数字 が範囲外（全N ページ）` で例外。
  - `renderPage` — `meta.nav===false` のとき、上部の章の位置表示（入力 → 配置編集 → 配置図）を出さない（左の「パレット配置アプリ 操作マニュアル」は出す）。`parsePage` の既定値に `nav:true` を足す。
- Consumes: `verification.json` の `overview`（`capture/overview.cjs` が記録済み。形 `{input:{markers:[{key,label,x,y,side,box:{x,y,w,h}}]}, edit:{…}, editMain?:{…}, sheet:{…}}`。キー名は今の `verification.json` を見て合わせる）

- [ ] **Step 1: 失敗するテストを書く**

`manual/test/build-lib.test.cjs` の末尾に追加:

```js
test('parsePage は nav の既定を true にする',()=>{
  const p=B.parsePage('<!--page {"title":"T","lead":"L"} -->\n','px.html');
  assert.equal(p.meta.nav,true);
});

test('renderPage は nav:false のとき章の位置表示を出さない',()=>{
  const html=B.renderPage({meta:{title:'T',lead:'L',tab:'',cls:'',nav:false},body:''},1,2,'F');
  assert.doesNotMatch(html,/入力 → 配置編集/);
  assert.match(html,/パレット配置アプリ 操作マニュアル/);
});

test('pageRefs は P数字と範囲を拾い、SNP やタグの中は拾わない',()=>{
  const html='<p>詳しくは（P9）。入力 P3〜5。SNP12 は数えない。</p><img alt="P99" src="assets/p1.png">';
  assert.deepEqual(B.pageRefs(html),[9,3,5]);
});

test('checkPageRefs は範囲外の参照で止める',()=>{
  const pages=[{meta:{},body:'<p>P2</p>'},{meta:{},body:'<p>P3</p>'}];
  assert.throws(()=>B.checkPageRefs(pages,['p01.html','p02.html']),/p02\.html: ページ参照 P3 が範囲外（全2 ページ）/);
  assert.doesNotThrow(()=>B.checkPageRefs([{meta:{},body:'<p>P1</p>'}],['p01.html']));
});

test('injectMarkers は札と細枠を差し込み、表と札の食い違いで止める',()=>{
  const ov={input:{markers:[{key:'A',label:'搬入日',x:10,y:20,side:'t',box:{x:5,y:15,w:10,h:5}}]}};
  const ok='<div class="ov" data-ov="input"><img src="assets/x.png"></div>'
    +'<table><tr data-key="A"><td>A</td><td>搬入日</td><td>説明</td></tr></table>';
  const out=B.injectMarkers(ok,ov,'p03.html');
  assert.match(out,/<span class="ov-tag t" style="left:10%;top:20%">A<\/span>/);
  assert.match(out,/class="ov-box"/);
  assert.throws(()=>B.injectMarkers(ok.replace('搬入日</td><td>説明','日付</td><td>説明'),ov,'p03.html'),/表の名前が札と一致しません/);
  assert.throws(()=>B.injectMarkers(ok,{},'p03.html'),/札の位置がありません: input/);
});
```

- [ ] **Step 2: テストが失敗することを確かめる**

Run: `npm --prefix manual test`
Expected: FAIL（`B.pageRefs is not a function` など。既存の18件は PASS のまま）

- [ ] **Step 3: build-lib.cjs を直す**

`manual/lib/build-lib.cjs` に次を加える（`parsePage` の既定値と `renderPage` は置き換え）:

```js
function parsePage(text,file){
  const m=/^<!--page\s+(\{[\s\S]*?\})\s*-->\s*/.exec(text);
  if(!m) throw new Error(file+': 先頭に <!--page {...} --> がありません');
  const meta=JSON.parse(m[1]);
  for(const k of ['title','lead']){
    if(typeof meta[k]!=='string') throw new Error(file+': '+k+' がありません');
  }
  return {meta:{tab:'',cls:'',nav:true,...meta},body:text.slice(m[0].length)};
}
function renderPage({meta,body},index,total,footer){
  const nav=meta.nav===false?'':CHAPTERS.map(t=>t===meta.tab?`<span class="active">${t}</span>`:t).join(' → ');
  return `<article class="page ${meta.cls}" id="p${index}">`
    +`<div class="eyebrow"><span>パレット配置アプリ 操作マニュアル</span><span>${nav}</span></div>`
    +`<div class="content"><h1>${meta.title}</h1><p class="lead">${meta.lead}</p>${body}</div>`
    +`<footer class="footer"><span>${footer}</span><span>${index} / ${total}</span></footer></article>`;
}
// 本文中のページ参照（P9、P3〜5）。タグの中と、英字に続く P（SNP など）は数えない
function pageRefs(html){
  const text=html.replace(/<[^>]*>/g,' ');
  const out=[];
  for(const m of text.matchAll(/(?<![A-Za-z])P(\d+)(?:〜(\d+))?/g)){
    out.push(+m[1]);
    if(m[2]) out.push(+m[2]);
  }
  return out;
}
function checkPageRefs(pages,files){
  const total=pages.length;
  pages.forEach((p,i)=>{
    for(const n of pageRefs(p.body)){
      if(n<1||n>total) throw new Error(`${files[i]}: ページ参照 P${n} が範囲外（全${total} ページ）`);
    }
  });
}
```

`draft-overview.cjs` の `injectMarkers` を、本文を変えずに `build-lib.cjs` へ移す。`module.exports` を次にする:

```js
module.exports={esc,parsePage,renderPage,fillDialogs,embedAssets,buildHtml,injectMarkers,pageRefs,checkPageRefs};
```

- [ ] **Step 4: テストが通ることを確かめる**

Run: `npm --prefix manual test`
Expected: PASS（18＋5＝23件）

- [ ] **Step 5: build.cjs と render.cjs を直し、試作用の組版を消す**

`manual/build.cjs` の `pages` を作った直後に、札の差し込みとページ参照の検査を入れる。フッターの版表記を10月版にする:

```js
const pages=files.map(f=>B.parsePage(fs.readFileSync(path.join(P.PAGES,f),'utf8'),f));
const v=V.load();
pages.forEach((p,i)=>{
  if(p.body.includes('class="ov"')){
    if(!v.overview) throw new Error('札の位置が未記録です（先に node capture.cjs overview を実行）');
    p.body=B.injectMarkers(p.body,v.overview,files[i]);
  }
});
B.checkPageRefs(pages,files);
```

（既存の `const v=V.load();` は1か所にまとめる。フッター文字列の `2026年9月版` を `2026年10月版` にする。）

`manual/render.cjs` の紙面検査に、`draft-overview.cjs` と同じ「札が紙面の外に出ていないか」（`tagsOut`）を足し、`bad` の条件に `l.tagsOut.length` を加える:

```js
  const layout=await page.locator('.page').evaluateAll(ps=>ps.map((e,i)=>{
    const c=e.querySelector('.content').getBoundingClientRect();
    const f=e.querySelector('.footer').getBoundingClientRect();
    const pr=e.getBoundingClientRect();
    const tagsOut=[...e.querySelectorAll('.ov-tag')].filter(t=>{
      const r=t.getBoundingClientRect();
      return r.left<pr.left||r.right>pr.right||r.top<c.top-40||r.bottom>f.top;
    }).map(t=>t.textContent);
    return {page:i+1,spaceToFooter:Math.round(f.top-c.bottom),
      images:[...e.querySelectorAll('img')].every(x=>x.complete&&x.naturalWidth>0),tagsOut};
  }));
```

```js
  const bad=layout.filter(l=>l.spaceToFooter<0||!l.images||l.tagsOut.length);
```

`manual/draft-overview.cjs` を `git rm` し、`manual/package.json` の `"draft"` 行を消す。

- [ ] **Step 6: 今のページで組版が通ることを確かめる**

Run: `npm --prefix manual test && npm --prefix manual run build && npm --prefix manual run render`
Expected: 23件 PASS。`build: 13 pages`。13ページすべて `spaceToFooter` 0以上、`images:true`、`tagsOut:[]`（まだ見取り図のページは無い）。

- [ ] **Step 7: Commit**

```bash
git add manual/lib/build-lib.cjs manual/build.cjs manual/render.cjs manual/test/build-lib.test.cjs manual/package.json
git rm manual/draft-overview.cjs
git commit -m "feat: 見取り図の札の差し込みとページ参照の検査を本編の組版に移す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 本編のページを作り、今のページを付録の位置へ移す

**Files:**
- Create: `manual/pages/p01.html`（新 P1）、`manual/pages/p02.html`（新 P2。収まらなければ `p02.html`＋`p03.html` の2ページ）
- Move: `manual/drafts/ov-input.html` → 見取り図（1）、`ov-edit.html` → （2）、`ov-sheet.html` → （3）
- Create: 補足のページ（本編の最後）
- Move: 今の `pages/p03.html`〜`p13.html` → 付録の位置（本編の後ろ。中身はこのタスクでは変えない）
- Delete: 今の `pages/p01.html`・`p02.html`（中身は新 P1・P2・補足へ移す）、`manual/drafts/`

**Interfaces:**
- Consumes: Task 1 の `nav` メタ、`injectMarkers`、`checkPageRefs`
- Produces: 本編のページ数 `M`（6 または 7）。付録は `p(M+1)`〜`p(M+11)`。Task 3 はこの `M` を使う（報告に必ず書く）。

ページ番号の割り当て（P2 が1ページの場合 M=6）:

| ファイル | 中身 |
|---|---|
| p01 | 新 P1 |
| p02 | 新 P2（2ページなら p02・p03 で、以下1つずつ後ろへ） |
| p03 | 見取り図（1）入力（旧 drafts/ov-input.html） |
| p04 | 見取り図（2）配置編集（旧 ov-edit.html） |
| p05 | 見取り図（3）配置図（旧 ov-sheet.html） |
| p06 | 補足 |
| p07〜p17 | 旧 p03〜p13（中身そのまま） |

- [ ] **Step 1: 今のページを一時名へ退避し、付録の番号に付け直す**

上書きを避けるため、いったん `a03.html` 形式に退避してから付け直す。P2 が1ページの前提（M=6）で始める（2ページになったら Step 6 でずらす）:

```bash
cd manual/pages
for n in 03 04 05 06 07 08 09 10 11 12 13; do git mv p$n.html a$n.html; done
for n in 03 04 05 06 07 08 09 10 11 12 13; do m=$(printf '%02d' $((10#$n+4))); git mv a$n.html p$m.html; done
git mv ../drafts/ov-input.html p03.html
git mv ../drafts/ov-edit.html p04.html
git mv ../drafts/ov-sheet.html p05.html
cd ../..
```

（今の `p01.html`・`p02.html` は Step 2・3 で上書きする。旧 p02 の 2.2・2.3 は Step 4 で補足に移すので、先に内容を手元に控えておく: `git show HEAD:manual/pages/p02.html`。）

- [ ] **Step 2: 新 P1 を書く**

`manual/pages/p01.html`:

```html
<!--page {"title":"1. このアプリでできること","lead":"発送伝票から、配置図を作る。","nav":false} -->
<p class="intro"><strong>配置図の作成</strong>を省力化するアプリです。</p>
<figure><img class="shot fit h95" src="assets/sheet-final.png" alt="完成した配置図"><figcaption>完成した配置図の例（9月25日 あさ・100P）。<br>本書では、この日の搬入を例に説明します。</figcaption></figure>
<table class="tbl compare"><thead><tr><th>これまでの作業</th><th></th><th>アプリを使うと</th></tr></thead><tbody>
<tr><td>個数とSNPからパレット数を手計算する</td><td class="arrow">→</td><td>入力すると自動で計算する</td></tr>
<tr><td>品目・ロットごとに集計し、配置を考える</td><td class="arrow">→</td><td>自動配置を出発点に、画面で整える</td></tr>
<tr><td>所定の用紙に配置を記入する</td><td class="arrow">→</td><td>配置図を作成して印刷する（A4横）</td></tr>
</tbody></table>
<figure><div class="hl-wrap"><img class="shot" src="assets/tabs.png" alt="タブ"><span class="hl-box" style="left:0;width:75%"></span></div></figure>
<div class="flow">
<div><b>入力</b><span>伝票を入力<br>自動配置を作成</span></div><i>→</i>
<div><b>配置編集</b><span>荷物を動かす<br>まとまりを整える</span></div><i>→</i>
<div><b>配置図</b><span>表記を確認<br>印刷して配布</span></div>
</div>
<aside>入力や配置は、使っているPCのブラウザに自動で保存されます。<br>ブラウザのサイトデータを削除すると消えます。</aside>
```

- [ ] **Step 3: 新 P2 を書く**

`manual/pages/p02.html`:

```html
<!--page {"title":"2. 作業の手順と、自動配置のしくみ","lead":"毎日の流れと、自動配置に任せてよいことです。","nav":false} -->
<h2>2.1 毎日の手順</h2>
<div class="steps">
<p><span class="num">①</span> 入力タブで、FAX 1枚につき1伝票を入力します。<br>FAXが届いていない分は仮伝票にします。</p>
<p><span class="num">②</span> 「▶ 自動配置を作成」を押します。</p>
<p><span class="num">③</span> 配置編集タブで、品目のまとまりや置き場を整えます。</p>
<p><span class="num">④</span> 配置図タブで表記を確かめ、印刷して配ります。</p>
<p><span class="num">⑤</span> FAXが届いたら仮伝票を直して受領済みにし、自動配置を作り直します（手で整えた配置は消えます）。</p>
</div>
<h2>2.2 自動配置がすること</h2>
<ul>
<li>充填品を先に置き、その後で製品を置きます。<br>結果として、充填品が倉庫内（メイン）を取りやすくなります。</li>
<li>品目どうしは入力した順に置きます。<br>同じ品目の中は、パレット数の多いロットから置きます。</li>
<li>置き場は決まった順に試します：メイン → メインの通路列 → 軒下①② → PC横 → EV横 → 出庫口横 → 5棟壁際。</li>
<li>1列に1ロットです。<br>ロットが丸ごと入る場所を探し、無ければ空いている列に分けて詰めます。</li>
<li>余った分は、空きのある列に混載します（設定「満杯時に混載を許可」がオンのとき）。<br>それでも入らない分は退避スペースへ回り、配置図には「未定」の欄として載ります。</li>
<li>「半」はロットの下側のマスに付きます。</li>
</ul>
<h2>2.3 自動配置がしないこと</h2>
<aside class="warn">
全体を見比べて、いちばん良い配置を探すことはしません（見つかった最初の場所に置きます）。<br>
同じ品目のロットを、必ず隣どうしに置くとは限りません。<br>
出荷や入庫の順番、取り出しやすさ、検品のタイミングは考えません。<br>
緊急用のマスは使いません。<br>
<b>だから、自動配置は出発点です。最後は人が画面で整えます。</b>
</aside>
```

`<ul>` に見た目の指定が無ければ、`manual/style.css` に足す（既存のルールは変えない）:

```css
.content ul{margin:6px 0;padding-left:1.3em}
.content li{margin:4px 0}
```

2.2 の各項目は、実装前に `files/index.html` で確かめる（行番号は報告に書く）:
`grep -nE 'function (place|placeLot|findRun|fillMix|areaCandidates|halfCells)\b|DEFAULT_SPACES|aisleRows' files/index.html`
置く順番（充填品が先・まとまりの中はパレット数の多い順・まとまりどうしは入力順）、エリアの順、1列1ロット、混載の条件、退避、緊急用マスを使わないこと、「半」の位置が、コードと食い違えば止めて報告する（v78 取り込みで変わっている可能性がある）。

- [ ] **Step 4: 見取り図のメタと補足のページを書く**

見取り図の3ページ（p03〜p05）の先頭行だけ直す（本文・表は変えない。表の「詳しくは」は Task 3 で付け替える）:

- p03: `<!--page {"title":"3. 画面の見方 <small>（1）入力</small>","lead":"伝票を入力し、自動配置を作る画面です（途中の伝票は省いています）。","tab":"入力"} -->`
- p04: `<!--page {"title":"3. 画面の見方 <small>（2）配置編集</small>","lead":"自動配置の結果を、盤の上で整える画面です。","tab":"配置編集"} -->`
- p05: `<!--page {"title":"3. 画面の見方 <small>（3）配置図</small>","lead":"配置を表にして確かめ、印刷する画面です。","tab":"配置図"} -->`

`manual/pages/p06.html`（補足。旧 p02 の 2.2・2.3 の本文と図を移す）:

```html
<!--page {"title":"4. 補足：従来の配置図の書き方","lead":"アプリを使う前の手順と、配置の考え方です。","nav":false} -->
<h2>4.1 手書きの頃の手順</h2>
<div class="steps">
<p><span class="num">①</span> 発送伝票と予定表から、ロットのP数を計算する。<br>品目ごとにまとめる。<br>発送伝票が無いものは仮置き。</p>
<p><span class="num">②</span> 品目ごとの合計P数を把握。</p>
<p><span class="num">③</span> 品目ごとにまとまるようにスペースへの配置を考える。</p>
<p><span class="num">④</span> 充填品を倉庫内に優先配置する。</p>
</div>
<p>アプリは、この手順の①②を自動で行い、③④の出発点を作ります。</p>
<h2>4.2 配置の考え方</h2>
<h3>品目ごと、その中でロットごとにまとめる</h3>
<p>作業者は品目・ロットごとに、パレットのバーコードと積載数を登録します。<br>事務方による入庫設定は品目ごとに完了するため、まず品目をまとめ、その中で同じロットを近づけます。</p>
<div class="cols">
<figure><img class="shot fit h80" src="assets/sheet-item-group.png" alt="仕掛品1の3ロット"></figure>
<div><p>左は完成した配置図の一部です。<br>仕掛品1 の3ロット（111-1112、111-1111、111-1113）を、メインの左側に並べています。</p><p>配置図の下段では、品目が変わる境目の縦線が太くなります。<br>同じ品目の中のロットの境目は細い線です。</p><p class="muted">1マスはパレット1枚分の場所です。<br>エリアの中では、列を単位に配置を考えます。</p></div>
</div>
<h3>充填品を優先して倉庫内へ置く</h3>
<p>製品は入庫前に検査があることが多く、入庫設定が遅くなりがちです。<br>そのため、充填品を入庫口に近い倉庫内へ優先して配置します。</p>
<p>パレット数の多い荷物を入口に近づけることを基本に、収まりとまとまりを見て調整します。<br>すべての品目が合計枚数の順に自動で並ぶわけではありません。</p>
```

（旧 p02 の 2.2・2.3 の文言そのまま。`h3` に見た目の指定が無ければ `style.css` に `h3{font-size:11.5pt;margin:10px 0 4px;color:#155c63}` を足す。収まらなければ `sheet-item-group` の h クラスを小さくする。）

- [ ] **Step 5: 組版して収まりを確かめる**

Run: `npm --prefix manual run build && npm --prefix manual run render`
Expected: `build: 17 pages`。全ページ `spaceToFooter` 0以上、`images:true`、`tagsOut:[]`。ページ参照の検査は通る（付録の参照はまだ古い番号だが、範囲内）。

Read ツールで `manual/dist/preview/p01.png`〜`p06.png` を開いて確かめる:
- P1: 完成図・比較表・タブの赤枠・流れ・保存の注意が1ページに収まる。収まらなければ `sheet-final` の h クラスを小さくする（h80 まで）。
- P2: 収まるか。
- P3〜P5: 札が対象を指し、表と一致している。

- [ ] **Step 6: P2 が収まらないときは2ページに分ける**

P2 の `spaceToFooter` が負のとき、または h クラスで直せない P1 以外のページが負のときに限る:
- `p02.html` を 2.1 だけにし、2.2・2.3 を新しい `p03.html`（メタ: `{"title":"2. 作業の手順と、自動配置のしくみ <small>（続き）</small>","lead":"自動配置に任せてよいことと、任せてはいけないことです。","nav":false}`）に移す。
- p03 以降のファイルを1つずつ後ろへずらす（後ろから `git mv`。p17 → p18 から順に）。M=7。
- Step 5 をやり直す（`build: 18 pages`）。

- [ ] **Step 7: Commit**

```bash
git add -A manual/pages manual/drafts manual/style.css
git commit -m "docs: マニュアルを本編（紹介・手順・見取り図・補足）と付録の並びに組み直す

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

報告に `M`（本編のページ数）と、各ファイルの中身の対応表を書く。

---

### Task 3: 付録の章・節・ページ参照と、見取り図の参照を付け替える

**Files:**
- Modify: 付録のページ `manual/pages/p(M+1).html`〜`p(M+11).html`
- Modify: 見取り図 `manual/pages/p03.html`〜`p05.html`（M=7 なら p04〜p06）

**Interfaces:**
- Consumes: Task 2 の `M`（6 または 7）。`D = M - 2`（付録の旧ページ n は新ページ n+D）。補足のページ番号 `S = M`。

付け替えの規則（すべての付録ページと見取り図の表に適用）:

| 旧 | 新 |
|---|---|
| 章見出し「3. 入力」 | 「5. 入力」 |
| 「4. 配置編集」 | 「6. 配置編集」 |
| 「5. 配置図」 | 「7. 配置図」 |
| 「6. 保存と設定」 | 「8. 保存と設定」 |
| 「7. 毎日の作業チェック」 | 「9. 毎日の作業チェック」 |
| 節番号 3.x / 4.x / 5.x / 6.x / 7.x | 5.x / 6.x / 7.x / 8.x / 9.x |
| ページ参照 Pn（n=3〜13）、Pa〜b | P(n+D)、P(a+D)〜(b+D) |
| ページ参照 P2（旧 2.2 の「品目ごと」を指す） | P(S)（補足） |
| 「（2.3 の「充填品を倉庫内へ」）」 | 「（4.2 の「充填品を倉庫内へ」）」 |

注意: 「100P」「8P 半」「7P/8P 半」のようなパレット数（数字の後ろの P）は変えない。変えるのは「P」の後ろに数字が続く参照だけ。節番号の付け替えは見出し（`<h2>`）と、本文中の「（3.1 の図）」のような節参照に限る。

- [ ] **Step 1: 付け替える箇所を一覧にする**

Run:
```bash
grep -nE '(^|[^A-Za-z])P[0-9]+(〜[0-9]+)?|<h2>[0-9]\.[0-9]|"title":"[0-9]\.|[（(][0-9]\.[0-9]' manual/pages/p0[3-9].html manual/pages/p1[0-8].html
```
Expected: 付録と見取り図の章・節・ページ参照が並ぶ（2026-10-01 時点、旧ページで p02:P12/P3〜5/P6〜9/P10〜11、p04:P3×2、p06:P12×2、p07:2.3 参照、p10:P9/P8、p13:P3〜5×2/P6〜9/P10〜11/P5/P6/P12、見取り図の表の「詳しくは」列）。

- [ ] **Step 2: 規則どおりに書き換える**

上の表の規則で、Step 1 の一覧の各行を書き換える（`sed` で一括置換すると「100P」などを巻き込むので、ファイルごとに Edit で直す）。見取り図の表の「詳しくは」列も同じ規則（旧の P3 → P(3+D) など。旧 P2 → P(S)）。

- [ ] **Step 3: 組版して確かめる**

Run: `npm --prefix manual run build && npm --prefix manual run render`
Expected: 全ページ収まる。ページ参照の検査が通る。

Run: `grep -nE '<h2>[34]\.[0-9]|"title":"[3-7]\. (入力|配置編集|配置図|保存|毎日)' manual/pages/p0[7-9].html manual/pages/p1[0-8].html`
Expected: 何も出ない（付録に旧番号が残っていない）。

Read ツールで付録の最初のページ・P(M+5)（旧 p07）・最後のページのプレビューを開き、見出しと参照を確かめる。各参照を1つずつ開いて、参照先のページの内容が合っているかを確かめる（例: 見取り図の「詳しくは」が指すページに、その操作の説明がある）。

- [ ] **Step 4: Commit**

```bash
git add manual/pages
git commit -m "docs: 付録の章・節番号とページ参照を新しい並びに付け替える

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: アプリ v78 で撮り直し、通しで作って確かめる

**Files:**
- Modify: `manual/assets/*.png`（撮り直し）、`manual/state/*.json`（作り直し。変わらなければそのまま）
- Modify: `manual/README.md`（ページ構成と `draft` 削除の反映）
- Modify: `docs/superpowers/specs/2026-09-24-manual-11pages-design.md`（末尾の改訂節に1行: 2026-10-01 に本編＋付録へ再構成。詳細は 2026-10-01 の設計書）
- Commit: `manual/dist/`（このタスクで初めて）

**Interfaces:**
- Consumes: Task 1〜3 の全部

- [ ] **Step 1: ディスクの空きを確かめる**

Run: `df -h /Users | tail -1`
Expected: 空き（Avail）が 1GB 以上。足りなければ、ここで止めてユーザーに空きを作るよう頼む（自分でファイルを消さない）。

- [ ] **Step 2: 通しで撮り直す**

Run: `npm --prefix manual test && npm --prefix manual run all`（timeout 600000 ms。時間切れなら `node manual/capture.cjs states` → `input` → `edit` → `sheet` → `overview` → build → render を1つずつ）
Expected: テスト 23件 PASS。撮影時の検証がすべて通る（s1 合計 101P、受領後 100P、手動配置の復元、確認ダイアログ、退避「未定」、テキスト編集の合計の注釈、見取り図の札）。全ページ `spaceToFooter` 0以上、`images:true`、`tagsOut:[]`。`verification.json` の `states.app.cacheVersion` が `v78`。

撮影の検証で止まったときは、v78 で画面が変わった可能性がある。例外の文言と、該当の画面のスクリーンショットを添えて止めて報告する（撮影のコードを推測で直さない）。

- [ ] **Step 3: 全ページを目視する**

Read ツールで `manual/dist/preview/p01.png`〜最後のページを順に開き、確かめる:
- 文字の欠け、図の切れ、フッターとの重なりがない
- 見取り図の札が対象を指し、表と一致している
- v76 の画像と比べて画面の見た目が変わった箇所（例: 配置図の太字の書き足し）で、本文と食い違いがない。食い違えば止めて報告する。
- `grep -nE '元に戻す|やり直す|●|AAA|※未定' manual/pages/*.html` が何も出さない

- [ ] **Step 4: README と旧設計書を直す**

`manual/README.md` に、ページ構成（本編 P1〜P(M)：紹介・手順と自動配置・画面の見方・補足、付録：5〜9章）を2〜3行で書き、`npm run draft` の記述があれば消す。
旧設計書 `docs/superpowers/specs/2026-09-24-manual-11pages-design.md` の末尾の改訂節に1行足す: 「2026-10-01: 本編＋付録の構成に再構成した。詳細は `docs/superpowers/specs/2026-10-01-manual-restructure-design.md`。」

- [ ] **Step 5: Commit（dist はここで初めてコミットする）**

```bash
git add manual/assets manual/state manual/README.md manual/dist docs/superpowers/specs/2026-09-24-manual-11pages-design.md
git commit -m "docs: アプリ v78 で撮り直し、本編＋付録の構成でマニュアルを通しで作る

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

（`manual/dist/` にある試作の出力 `見取り図案.html`・`見取り図案.pdf`・`draft-preview/` は `git rm -r` で消してからコミットする。）

- [ ] **Step 6: ユーザーレビュー（停止）**

`manual/dist/操作マニュアル.pdf` を SendUserFile でユーザーに送り、全ページのレビューを依頼する。
