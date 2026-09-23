// 同名同ロットの分納 (split-delivery) — verified
// 現在の時間帯の入力と配置関連状態（配置不可設定を含む）をリセットします。
// 反対側の時間帯と品目マスタは変更しません。
// 専用オリジンまたは不要な入力の時間帯で実行してください。
(() => {
  const rows = [{"type":"充填品","name":"部品1","lot":"S-001","snp":10,"qty":1},{"type":"充填品","name":"部品1","lot":"S-001","snp":10,"qty":11}];
  const manualChecks = ["同名同ロットの2行が入力後にどう扱われるか確認する","行ごとに切り上げた合計3Pが表示されるか確認する"];
  if (typeof switchTab !== "function" || typeof clearLots !== "function" ||
      typeof addSlip !== "function" || typeof addItemRow !== "function" ||
      !document.querySelector("#slipList")) {
    throw new Error("入力画面のAPIまたはDOM構造が変わりました。コードを更新してください。");
  }
  switchTab("input");
  const originalConfirm = window.confirm;
  window.confirm = () => true;
  try {
    clearLots();
  } finally {
    window.confirm = originalConfirm;
  }
  addSlip("fax");
  const slip = document.querySelector("#slipList .slip:last-child");
  const addButton = slip?.querySelector(".btn-slip-action-add");
  if (!slip || !addButton) throw new Error("FAX伝票のDOM構造が変わりました。");

  const setValue = (element, value, type) => {
    if (!element) throw new Error("品目行の入力欄が見つかりません。");
    element.value = String(value);
    element.dispatchEvent(new Event(type, { bubbles: true }));
  };
  rows.forEach((row, index) => {
    if (index > 0) addItemRow(addButton);
    const item = slip.querySelectorAll("tbody tr")[index];
    if (!item) throw new Error("品目行を追加できませんでした。");
    const cells = item.querySelectorAll("select,input");
    if (cells.length !== 5) throw new Error("品目行のDOM構造が変わりました。");
    setValue(cells[0], row.type, "change");
    setValue(cells[1], row.name, "input");
    setValue(cells[2], row.lot, "input");
    setValue(cells[3], row.snp, "input");
    setValue(cells[4], row.qty, "input");
  });

  const entered = [...slip.querySelectorAll("tbody tr")];
  if (entered.length !== rows.length) throw new Error("入力件数が一致しません。");
  const totalP = entered.reduce((sum, item) => {
    const cells = item.querySelectorAll("select,input");
    return sum + Math.ceil(Number(cells[4].value) / Number(cells[3].value));
  }, 0);
  console.info("入力完了: " + entered.length + "件 / " + totalP + "P（期待 3P）");
  console.info("確認項目:", manualChecks);
  console.info("画面の「▶ 自動配置を作成」ボタンを押して結果を確認してください。");
})();
