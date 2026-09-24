from pathlib import Path
import base64,re

out=Path('/Users/kenichihanada/web-app/pallet-layout/outputs/manual-20260922')
def img(name,cls='',alt='アプリの実画面'):
    return f'<img class="shot {cls}" src="assets/{name}.png" alt="{alt}">'
def fig(name,caption='',cls=''):
    return '<figure>'+img(name,cls)+(f'<figcaption>{caption}</figcaption>' if caption else '')+'</figure>'
def box(title,text):
    return f'<aside><b>{title}</b><br>{text}</aside>'
def table(headers,rows):
    return '<table class="tbl"><thead><tr>'+''.join(f'<th>{x}</th>' for x in headers)+'</tr></thead><tbody>'+''.join('<tr>'+''.join(f'<td>{x}</td>' for x in row)+'</tr>' for row in rows)+'</tbody></table>'
def steps(items):
    return '<div class="steps">'+''.join(f'<p><span class="num">{chr(0x2460+i)}</span> {s}</p>' for i,s in enumerate(items))+'</div>'
pages=[]
def page(title,lead,content,tab='',cls=''):
    pages.append((title,lead,content,tab,cls))

page('1. はじめに','発送伝票から、チームに配る配置図を作る。',f'''
<p class="intro">荷物やロットが多い日の、<strong>ロット別の集計と配置図の記入</strong>を省力化するアプリです。</p>
{fig('sheet-100p','完成する配置図の例。本文では、この100Pの搬入例を使って説明します。','cover-sheet')}
<h2>手書きで行っていた作業を、画面上で進めます</h2>
{table(['これまでの作業','アプリを使うと'],[
['個数とSNPからパレット数を手計算','入力内容から自動計算'],['品目・ロットごとに集計し、配置を考える','自動配置を確認し、現場に合わせて調整'],['所定の用紙に配置を記入','配置図を作成して印刷']])}
<p>FAXと予定表を確認して入力し、配置を整えたら印刷します。人数分のコピーと配布は、これまでと同じです。</p>
{box('自動配置の後も、確認して仕上げます。','品目・ロットのまとまりと列への収まりを見て、現場で使いやすい配置に整えます。')}
<p class="muted">PCのマウス・キーボードでの操作を説明します。品名・ロット・数量は架空のデモデータです。</p>
''')

page('2. 作業の流れと配置の基本','作業の目的を知ってから、3つのタブへ。',f'''
<h2>2.1 作業は3つのタブで進める</h2>
{fig('tabs','「設定」は必要に応じて使用します。保存・設定の補足はP9へ。')}
<div class="flow"><div><b>入力</b><span>伝票を入力<br>自動配置を作成</span><small>P3〜4</small></div><i>→</i><div><b>配置編集</b><span>荷物を動かす<br>まとまりを整える</span><small>P5〜6</small></div><i>→</i><div><b>配置図</b><span>表記を確認<br>印刷して配布</span><small>P7〜8</small></div></div>
<h2>2.2 品目ごと、その中でロットごとにまとめる</h2>
<p>作業者は品目・ロットごとに、パレットのバーコードと積載数を登録します。事務方による入庫設定は品目ごとに完了するため、まず品目をまとめ、その中で同じロットを近づけます。</p>
<div class="warehouse"><div class="area-name">エリアの例：メイン <small>／ 配置の考え方を示す模式図</small></div><div class="groups"><section><b>同じ品目Aのまとまり</b><div class="lots"><span class="lot-a">ロットA1<br>● ● ●<br>● ● ●</span><span class="lot-a">ロットA1<br>● ● ●<br>● ● ●</span><span class="lot-b">ロットA2<br>● ● ●<br>● ● ●</span></div></section><section><b>品目B</b><div class="lots"><span class="lot-c">ロットB1<br>● ● ●<br>● ● ●</span></div></section></div><p class="muted">エリアの中では列を単位に配置を考えます。1マスはパレット1枚分の場所です。</p></div>
<h2>2.3 充填品を優先して倉庫内へ置く</h2>
<p>製品は入庫前に検査があることが多く、入庫設定が遅くなりがちです。そのため、充填品を入庫口に近い倉庫内へ優先配置します。</p>
<p>パレット数の多い荷物を入口に近づけることを基本に、収まりとまとまりを見て調整します。すべての品目が合計枚数順に自動で並ぶわけではありません。</p>
''')

page('3. 入力','FAXの内容と予定表のSNPを入力し、枚数を確認します。',f'''
<h2>3.1 その日の入力を始める</h2>
<div class="cols"><p><span class="num">①</span>「あさ／ひる」を確認し、前回分があれば「入力をクリア」を押します。</p><p><span class="num">②</span> 搬入日と、作成する「あさ／ひる」を確認します。搬入日は共通です。</p></div>
{fig('input-head','クリアされるのは選択中の側だけです。朝・昼の両方を作る日は、それぞれ確認します。')}
<h2>3.2 FAXと予定表を見て入力する</h2>
<div class="cols sources"><div><b>デモ用FAX① ／ 発送内容</b>{table(['品名','ロット','個数'],[['製品1','111','4,000']])}</div><div><b>予定表 ／ SNPの確認</b>{table(['品名','SNP'],[['製品1','500']])}</div></div>
<p class="small"><span class="num">③</span>「＋ FAX伝票を追加」を押し、種別・品名・ロット・SNP・個数を入力します。</p>
{fig('input-slip')}
<p class="small"><span class="num">④</span> 同じFAXの別品目・ロットは「＋ 品目を追加」。次のFAXは別の伝票として追加します。</p>
<h2>3.3 SNP・パレット数・FAX枚数を確認する</h2>
<p>同じ品目でもSNPが異なる場合があります。自動入力されても、予定表と照合してください。</p>
{box('入力確認は「半」表示がおすすめです。','<span class="small">設定 → 表示設定 → 入力画面での端数を「半」で表示：オン</span><br>SNP 500・個数2,750なら <b>5P 半</b>。オフでは「6P」。<br><span class="small">どちらも満載5枚＋端数1枚で、場所は6枚分です。</span>')}
<p class="checkline"><b>画面上部のFAX枚数 ＝ 手元の実物の枚数</b><br>実物1枚につき1伝票として入力し、入力漏れを確認します。</p>
''','入力','dense')

page('3. 入力 <span class="sub">続き</span>','未着分は仮入力。届いたFAXと照合して、配置を確定します。',f'''
<h2>3.4 FAX未着分は、予定表から仮伝票へ</h2>
<p>「＋ 仮伝票を追加」で予定表の内容を入力します。仮伝票は未着分の入力枠で、実物の発送伝票ではありません。個数は予定値です。</p>
{fig('provisional','FAX⑤が未着の例。到着済みFAX4枚と仮1件を入力すると、予定段階は101Pです。')}
<h2>3.5 自動配置を作成し、品目を登録する</h2>
{fig('input-actions')}
<p>入力内容と枚数を確認し、「▶ 自動配置を作成」を押します。不備が示されたら修正します。未登録の品目は登録確認が表示されるので、品名・SNPを確認して登録します。</p>
<p class="small">登録を見送っても配置は作れます。登録すると、次回から品名候補やSNPの補完に使えます。</p>
<h2>3.6 FAXが届いたら、照合・修正する</h2>
{table(['仕掛品4／SNP 2,000','予定表','到着したFAX'],[['個数','28,500','27,000'],['パレット数','15P','14P'],['全荷物の合計','101P','100P']])}
{steps(['FAXと仮伝票を照合し、異なる個数などを修正します。','「FAX受領済みにする」を押します。別の伝票として重複入力しないでください。','数量などを変えたら自動配置を作り直し、結果を確認します。'])}
<p class="small">受領後は<b>FAX5枚・仮0件</b>。手元の実物5枚と照合します。</p>
{box('再配置すると、手動調整は破棄されます。','調整済みの場合は確認画面を読んで実行し、配置図の表記まで再確認します。')}
''','入力','dense')

# Movement page is finalized only after the user's clarification of the discovered mismatch.
page('4. 配置編集','同じロットを選び、移動先の列へ動かします。','__MOVEMENT_PAGE__','配置編集')

page('4. 配置編集 <span class="sub">続き</span>','品目・ロットのまとまりを保ちながら、列の空きを使います。',f'''
<h2>4.3 ロットを近づけ、列の収まりを整える</h2>
<p>離れた同じロットを近くにまとめます。隣接する品目の境目では、別のロットを同じ列に置き、空きを活用することもあります。</p>
<div class="cols compact"><div class="mini-diagram"><b>変更前</b><div class="mini-cols"><span>AAA<br>AAA</span><span class="empty-col">□□□<br>□□□</span><span>AAA<br>BBB</span></div></div><div class="mini-diagram"><b>変更後</b><div class="mini-cols"><span>AAA<br>AAA</span><span>AAA<br>BBB</span><span class="empty-col">□□□<br>□□□</span></div></div></div>
<p class="caption">模式図：A・Bは異なるロット。ロットAを近づけ、隣接する列で空きを活用します。</p>
<div class="inline-tool">{img('undo-toolbar')}<p>操作を戻すときは「元に戻す」。<br>戻した操作は「やり直す」で再実行できます。</p></div>
<div class="cols"><section><h2>4.4 退避スペースを使う</h2>
<p>自動配置で置き場がない荷物は、退避スペースへ自動配置されます。組み替えでは、同じロット全体を選んでまとめて退避できます。</p>
{fig('stash-pallets','例：仕掛品2・10Pを手動で退避。配置図には「未定」として載ります。','stash-shot')}
<p class="small">荷物の存在を紙で共有し、当日は入庫できるものから入庫します。空きができたら、現場判断で倉庫内・外に置きます。</p>
</section><section><h2>4.5 使えない場所を避ける</h2><p>「配置不可エリアを設定」を押し、使えないマスをクリックして指定します。</p><p>「自動配置を実行」で、指定場所を避けて作り直します。</p>
{img('blocked-main','blocked-shot')}<p class="caption">例：メインを使えない場合。通常例とは別の条件です。</p><p class="small">必須の操作ではありません。設定せずに手動調整することもできます。</p></section></div>
''','配置編集','dense')

page('5. 配置図','自動表記を確認し、必要な箇所だけ読みやすく整えます。',f'''
<h2>5.1 日付・朝昼・数量・置き場所を読む</h2>
{fig('sheet-100p','左上：搬入日・朝昼・総数 ／ 表：品名・ロット・P数 ／ 下部：メインの置き場所','sheet-medium')}
<p>同じ品目の複数ロットは、配置場所などの条件に応じて一つの欄にまとまります。同じ表記なら「各◯P」、異なる場合はロットに対応した数量が並びます。</p>
<div class="cols"><div class="notation"><b>「各◯P」の読み方</b><p>2ロットが「各10P」なら<br>合計は20Pです。</p><small>表記例。上のデモ配置とは別の例です。</small></div><div class="notation"><b>「半」も1枚分</b><p>「8P 半／7P」なら<br>9P＋7P＝16Pです。</p><small>上の仕掛品3の例です。</small></div></div>
<h2>5.2 テキスト編集で合計などを補足する</h2>
<div class="cols slot-compare"><div>{fig('lot-slot-before','自動表記')}</div><div>{fig('lot-slot-after','注釈に「（計16P）」を補足')}</div></div>
<p class="small"><span class="num">①</span>「✏ テキスト編集」→ <span class="num">②</span> 直す欄をクリックして入力 → <span class="num">③</span> 欄の外をクリックして確定し、「テキスト編集終了」を押します。</p>
<p class="small">表記の編集は配置が決まった後に行います。入力数量・配置を変える機能ではありません。</p>
''','配置図','dense')

page('5. 配置図 <span class="sub">続き</span>','最後に確認し、A4横で印刷して配布します。',f'''
<h2>5.3 置き場所未定の荷物も、記載を確認する</h2>
<div class="cols"><div>{fig('stash-slot','例：退避した仕掛品2・10Pの掲載欄','stash-detail')}</div><div><p>退避中の荷物も、配置図の表に「未定」として載ります。</p><p>置き場所が決まっていない荷物を見落とさないよう、品名・ロット・パレット数を確認します。</p></div></div>
<h2>5.4 印刷前の確認</h2>
<div class="checklist"><p>□ 搬入日と「あさ／ひる」は合っていますか。</p><p>□ FAXの枚数・内容を照合しましたか。未着分は予定値として確認しましたか。</p><p>□ 品目・ロット・パレット数は合っていますか。デモの確定値は100Pです。</p><p>□ まとまりと置き場所、退避分の記載を確認しましたか。</p><p>□ テキスト編集した数量・注釈に誤りはありませんか。</p></div>
<h2>5.5 印刷・コピー・配布</h2>
{fig('sheet-toolbar')}
{steps(['「🖨 印刷」を押します。','印刷画面でA4・横向きを確認し、プレビューで図や文字の欠けがないか見ます。','印刷した配置図を人数分コピーし、チームに配布します。'])}
<div class="print-flow"><div class="paper-landscape">A4 横<br><small>配置図を印刷</small></div><span>→</span><div class="copies">人数分<br>コピー</div><span>→</span><div class="copies">チームへ<br>配布</div></div>
<p class="small">昼搬入分は昼に切り替え、別に作成・印刷します。マニュアルはA4縦、配置図はA4横です。</p>
''','配置図')

page('6. 保存と設定','日々の作業を続けるために知っておきたいこと。',f'''
<h2>6.1 作業データは使用中のブラウザに保存</h2>
<p>入力や配置などは、使用しているブラウザに保存されます。別のPCやブラウザへ自動で共有されるわけではありません。</p>
{box('ブラウザのサイトデータを削除すると、保存内容も失われます。','いつものPC・ブラウザで作業してください。')}
<h2>6.2 入力や配置を変えたら、結果を再確認</h2>
<div class="flow small-flow"><div><b>入力を変更</b><span>個数などを修正</span></div><i>→</i><div><b>再配置</b><span>配置を再確認</span></div><i>→</i><div><b>表記を確認</b><span>必要なら再編集</span></div></div>
<p>自動配置をやり直すと、手動調整は破棄されます。配置が変わるとテキスト編集も破棄される場合があるため、印刷する表記まで確認します。</p>
<p>配置編集の「元に戻す」は、入力変更や再配置による破棄を復旧するための機能ではありません。</p>
<h2>6.3 設定で変更できること</h2>
{fig('settings-tabs')}
{table(['項目','主な内容'],[['品目マスタ','品名・SNPの登録や修正、JSON保存・読込'],['配置マス','配置に使うスペースの設定'],['表示設定','文字の大きさ、端数の書き方、ロットのまとめなど']])}
<h2>品目マスタは、作業しながら増やせます</h2>
<p>最初は品名・SNPを入力し、自動配置時の登録確認から登録します。同じ品名で異なるSNPも登録できるため、補完された値は予定表と照合してください。</p>
{box('品目マスタのJSONは、品名とSNPの保存です。','伝票入力や配置は含まれません。作業データ全体のバックアップではありません。')}
''')

page('7. 毎日の作業チェック','この1ページで、開始から配布まで振り返れます。','''
<div class="check-section"><h2>7.1 始めるとき <small>入力 P3</small></h2><p>□ 前回分をクリアした。朝・昼それぞれ確認した。</p><p>□ 搬入日と、作成する「あさ／ひる」を確認した。</p></div>
<div class="check-section"><h2>7.2 入力するとき <small>入力 P3〜4</small></h2><p>□ 実物1枚につき1伝票として入力した。</p><p>□ FAXの枚数と、画面上部の枚数を照合した。</p><p>□ 種別・品名・ロット・個数を確認した。</p><p>□ SNPは、自動入力されても予定表と照合した。</p><p>□ 未着分は仮伝票にし、FAX到着後に照合・修正して受領済みにした。</p></div>
<div class="check-section"><h2>7.3 配置を整えるとき <small>配置編集 P5〜6</small></h2><p>□ 品目・ロットがまとまり、列に収まっている。</p><p>□ 使えない場所と、退避中の荷物を確認した。</p><p>□ 再配置した場合は、手動調整と表記を見直した。</p></div>
<div class="check-section"><h2>7.4 配布するとき <small>配置図 P7〜8</small></h2><p>□ 日付・朝昼・数量・置き場所を最終確認した。</p><p>□ 退避分の記載と、編集した注釈を確認した。</p><p>□ A4横の印刷プレビューで欠けがないことを確認した。</p><p>□ 印刷し、人数分コピーして配布した。</p></div>
<div class="closing">入力 → 配置編集 → 配置図<br><small>保存と設定を確認したいときは P9へ。</small></div>
''')

css='''
@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#e8ecee;color:#24313a;font-family:"Hiragino Kaku Gothic ProN","Yu Gothic",sans-serif;font-size:10.5pt;line-height:1.56}.page{width:210mm;height:297mm;margin:20px auto;background:white;padding:12mm 16mm 15mm;position:relative;break-after:page}.page:last-child{break-after:auto}.eyebrow{font-size:8.7pt;color:#476070;letter-spacing:.035em;display:flex;justify-content:space-between;border-bottom:1px solid #bac7cb;padding-bottom:7px}.active{font-weight:700;color:#155c63}h1{font-size:24pt;line-height:1.2;margin:15px 0 7px}h1 .sub{font-size:12pt;font-weight:500;color:#61717a;margin-left:8px}h2{font-size:13pt;margin:15px 0 7px;color:#155c63}p{margin:7px 0}.lead{color:#55616b;margin-bottom:12px}.intro{font-size:13pt;line-height:1.7}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}.cols p{margin-top:0}.shot{display:block;max-width:100%;height:auto;border:1px solid #d5dddf;border-radius:4px}.shot:not(.cover-sheet):not(.sheet-medium){width:100%}figure{margin:8px 0}figcaption,.caption{font-size:9pt;color:#536973;margin:5px 0;line-height:1.5}.small,.muted{font-size:9.5pt}.muted{color:#65757c}.num{font-weight:700;color:#155c63}.tbl{border-collapse:collapse;width:100%;font-size:10pt;margin:8px 0}.tbl th{background:#edf3f3;color:#36565c;text-align:left;font-weight:600}.tbl td,.tbl th{border-bottom:1px solid #d3dedf;padding:7px 9px;vertical-align:top}.sources>div{border:1px solid #bccbcc;padding:8px 10px;background:#fbfcfc;font-size:9.5pt}.sources .tbl{margin-bottom:0}.sources .tbl td,.sources .tbl th{padding:4px;font-size:9pt}.sources .tbl th{background:none;font-size:8.5pt}aside{background:#f0f5f4;border-left:3px solid #538d8b;padding:9px 12px;margin:10px 0;font-size:10pt}.checkline{border-top:1px solid #d5dddf;padding-top:8px}.footer{position:absolute;bottom:10mm;left:16mm;right:16mm;border-top:1px solid #bdc9cc;padding-top:6px;display:flex;justify-content:space-between;font-size:8pt;color:#60717a}.cover-sheet{width:100%;max-height:115mm;object-fit:contain}.sheet-medium{width:100%;max-height:103mm;object-fit:contain}.flow{display:flex;align-items:center;gap:10px;margin:18px 0}.flow>div{flex:1;border:1px solid #a7c2c3;border-top:4px solid #548b8e;padding:14px 9px;text-align:center;background:#f8fbfb}.flow b{display:block;font-size:15pt;color:#155c63}.flow span{display:block;margin:7px 0;font-size:10pt}.flow small{font-size:9pt;color:#596d73}.flow i{font-style:normal;color:#77908e}.warehouse{border:1px solid #b7c8ca;padding:12px;margin:15px 0}.area-name{font-weight:700}.area-name small{font-weight:400;font-size:8pt;color:#65757c}.groups{display:flex;gap:20px;margin-top:10px}.groups section{flex:1}.groups section:first-child{flex:3}.groups b{font-size:9pt}.lots{display:flex;gap:5px;margin:7px 0}.lots span{flex:1;padding:8px 4px;text-align:center;border:1px solid #a1b6ba;line-height:1.9;font-size:9pt}.lot-a{background:#d9e9e3}.lot-b{background:#f4e6d3}.lot-c{background:#e0e5f3}.steps p{margin:6px 0}.dense h2{margin-top:12px}.dense p{margin:6px 0}.dense .tbl td,.dense .tbl th{padding:5px 8px}.dense aside{padding:7px 11px;margin:8px 0}.dense figure{margin:6px 0}.mini-diagram{background:#f7f9f9;padding:9px;border:1px solid #ccd9d9}.mini-diagram b{font-size:9pt}.mini-cols{display:flex;gap:6px;justify-content:center;margin:6px 0}.mini-cols span{font-family:monospace;letter-spacing:4px;padding:4px 7px;background:#dcebe6;border:1px solid #9dbbb0;line-height:1.5;font-size:12pt}.mini-cols .empty-col{background:white;color:#b7c3c3}.inline-tool{display:flex;gap:15px;align-items:center;margin:8px 0}.inline-tool img{width:42%!important}.inline-tool p{font-size:9.5pt}.stash-shot{max-height:53mm;object-fit:contain}.blocked-shot{max-height:55mm;object-fit:contain}.stash-detail{max-height:55mm;object-fit:contain}.notation{border:1px solid #bbcdce;background:#f6f9f9;padding:9px 12px;font-size:10pt}.notation small{font-size:8.5pt;color:#65757c}.slot-compare{grid-template-columns:1fr 1fr;padding:0 18mm;gap:18mm}.slot-compare img{max-height:40mm;object-fit:contain}.slot-compare figcaption{text-align:center}.checklist{background:#f4f7f7;padding:10px 14px}.checklist p{margin:8px 0}.print-flow{display:flex;align-items:center;justify-content:space-around;gap:15px;margin:18px 0}.paper-landscape{width:160px;height:95px;border:2px solid #658f94;box-shadow:4px 4px 0 #e1e9e9;text-align:center;padding:18px 6px;font-size:16pt;color:#155c63}.paper-landscape small{font-size:9pt}.copies{font-weight:600;text-align:center}.small-flow>div{padding:12px 6px}.small-flow b{font-size:12pt}.check-section{border-bottom:1px solid #c4d3d4;padding-bottom:12px;margin-bottom:12px}.check-section h2{margin-top:18px}.check-section h2 small{float:right;font-weight:400;color:#65757c;font-size:9pt;padding-top:4px}.check-section p{margin:10px 0}.closing{font-size:17pt;color:#155c63;text-align:center;padding:15px 0}.closing small{font-size:10pt;color:#65757c}.main-small{max-height:61mm;object-fit:contain}.select-trio{display:grid;grid-template-columns:1fr 1fr;gap:12px}.select-trio img{max-height:50mm;object-fit:contain}.move-example{display:flex;gap:12px;align-items:center;margin:12px 0}.move-example>div{flex:1;border:1px solid #b8cbcc;padding:9px;text-align:center}.move-example strong{display:block;color:#155c63;margin-bottom:5px}.dots{font-size:19pt;letter-spacing:4px;color:#497c6f}.webnav{max-width:210mm;margin:15px auto;font-size:10pt;display:flex;flex-wrap:wrap;gap:8px}.webnav a{color:#155c63;background:white;padding:5px 10px;border-radius:3px;text-decoration:none}@media print{body{background:white}.page{margin:0}.webnav{display:none}*{print-color-adjust:exact;-webkit-print-color-adjust:exact}}@media screen and (max-width:800px){.page{margin:0 auto 14px}.webnav{padding:8px}}
'''

css+=' .sheet-medium{max-height:95mm}.stash-shot{max-height:48mm}.slot-compare img{max-height:35mm} '

movement_path=out/'movement-approved.html'
if movement_path.exists():
    pages[4]=(pages[4][0],pages[4][1],movement_path.read_text(),pages[4][3],pages[4][4])
elif (out/'movement-review.html').exists():
    pages[4]=(pages[4][0],pages[4][1],(out/'movement-review.html').read_text(),pages[4][3],pages[4][4])

parts=[]
for i,(title,lead,body,tab,cls) in enumerate(pages,1):
    nav=' → '.join(f'<span class="active">{t}</span>' if t==tab else t for t in ['入力','配置編集','配置図'])
    parts.append(f'<article class="page {cls}" id="p{i}"><div class="eyebrow"><span>パレット配置アプリ 操作マニュアル</span><span>{nav}</span></div><div class="content"><h1>{title}</h1><p class="lead">{lead}</p>{body}</div><footer class="footer"><span>PC操作用 ・ デモデータ使用 ／ 2026年9月22日版</span><span>{i} / {len(pages)}</span></footer></article>')
nav='<nav class="webnav">'+''.join(f'<a href="#p{i}">P{i}</a>' for i in range(1,len(pages)+1))+'</nav>'
html='<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>パレット配置アプリ 操作マニュアル</title><style>'+css+'</style>'+nav+''.join(parts)+'</html>'
def embed(m):
    p=out/m.group(1)
    if not p.exists():raise FileNotFoundError(p)
    return 'src="data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()+'"'
html=re.sub(r'src="(assets/[^"]+)"',embed,html)
(out/'操作マニュアル.html').write_text(html)
print('HTML built:',len(pages),'pages; movement pending:', '__MOVEMENT_PAGE__' in html)
