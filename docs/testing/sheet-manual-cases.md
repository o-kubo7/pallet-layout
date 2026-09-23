# 配置図の手動確認表

専用オリジンまたは不要な入力の時間帯で、各 Console ファイルをブラウザの Console に貼り付けてください。コードは現在の時間帯の入力を置き換えます。入力後に画面の「▶ 自動配置を作成」を押し、表示された合計P・案内文・様式・上段・下段・追記欄を確認し、結果記入欄に記録してください。

## verified（確認済み5件）

| ID | 状態 | 合計P | Consoleファイル | 確認項目 | 結果記入欄 |
| --- | --- | ---: | --- | --- | --- |
| demo-100p | verified | 100P | [demo-100p.console.js](../../tests/console-cases/demo-100p.console.js) | 下段に7欄が表示される<br>上段に製品1/111・製品2/222・仕掛品4/444-4444が表示される<br>下段から上段への回送案内が1件表示される<br>追記欄に項目がない | ＿＿＿＿ |
| basic-normal | verified | 98P | [basic-normal.console.js](../../tests/console-cases/basic-normal.console.js) | 通常様式が14列で表示される<br>追記欄に項目がない | ＿＿＿＿ |
| basic-middle | verified | 101P | [basic-middle.console.js](../../tests/console-cases/basic-middle.console.js) | 中間様式が16列で表示される<br>追記欄に項目がない | ＿＿＿＿ |
| basic-wide | verified | 103P | [basic-wide.console.js](../../tests/console-cases/basic-wide.console.js) | 拡張様式が18列で表示される<br>追記欄に項目がない | ＿＿＿＿ |
| basic-wide-overflow | verified | 105P | [basic-wide-overflow.console.js](../../tests/console-cases/basic-wide-overflow.console.js) | 拡張様式が18列で表示される<br>追記欄に製品Wと製品Zおよび各注釈が表示される | ＿＿＿＿ |

## pending（確認待ち7件）

| ID | 状態 | 合計P | Consoleファイル | 確認項目 | 結果記入欄 |
| --- | --- | ---: | --- | --- | --- |
| split-delivery | pending | 3P | [split-delivery.console.js](../../tests/console-cases/split-delivery.console.js) | 同名同ロットの2行が入力後にどう扱われるか確認する<br>行ごとに切り上げた合計3Pが表示されるか確認する | ＿＿＿＿ |
| same-name-different-lot | pending | 2P | [same-name-different-lot.console.js](../../tests/console-cases/same-name-different-lot.console.js) | 別ロットが配置図で別欄として表示されるか確認する<br>合計2Pが表示されるか確認する | ＿＿＿＿ |
| half-pallet | pending | 2P | [half-pallet.console.js](../../tests/console-cases/half-pallet.console.js) | 端数を切り上げた2Pが表示されるか確認する<br>品名とロットが配置図の欄に残るか確認する | ＿＿＿＿ |
| normal-to-middle | pending | 101P | [normal-to-middle.console.js](../../tests/console-cases/normal-to-middle.console.js) | 基本入力への3品追加で通常と中間のどちらが選ばれるか確認する<br>上段・下段の空欄と追記欄の有無を確認する | ＿＿＿＿ |
| middle-to-wide | pending | 103P | [middle-to-wide.console.js](../../tests/console-cases/middle-to-wide.console.js) | 基本入力への5品追加で中間と拡張のどちらが選ばれるか確認する<br>上段・下段の空欄と追記欄の有無を確認する | ＿＿＿＿ |
| top-rescue | pending | 12P | [top-rescue.console.js](../../tests/console-cases/top-rescue.console.js) | 上段固有欄が何件できるか確認する<br>上段を超えた欄が下段の空欄へ救済されるか確認する | ＿＿＿＿ |
| stash-overflow | pending | 107P | [stash-overflow.console.js](../../tests/console-cases/stash-overflow.console.js) | 拡張様式になるか確認する<br>退避に残る品目と追記欄の順序・注釈を確認する | ＿＿＿＿ |
