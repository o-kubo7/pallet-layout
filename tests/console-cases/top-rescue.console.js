// 上段超過と下段救済候補 (top-rescue) — verified
// 現在の時間帯の入力と配置関連状態（配置不可設定を含む）をリセットします。
// 反対側の時間帯と品目マスタは変更しません。
// 専用オリジンまたは不要な入力の時間帯で実行してください。
(() => {
  const rows = [{"type":"製品","name":"製品X","lot":"T-001","snp":10,"qty":10},{"type":"製品","name":"製品Y","lot":"T-002","snp":10,"qty":10},{"type":"製品","name":"製品Z","lot":"T-003","snp":10,"qty":10},{"type":"製品","name":"製品W","lot":"T-004","snp":10,"qty":10},{"type":"製品","name":"製品X","lot":"T-005","snp":10,"qty":10},{"type":"製品","name":"製品Y","lot":"T-006","snp":10,"qty":10},{"type":"製品","name":"製品Z","lot":"T-007","snp":10,"qty":10},{"type":"充填品","name":"部品1","lot":"M-001","snp":10,"qty":10},{"type":"充填品","name":"部品2","lot":"M-002","snp":10,"qty":10},{"type":"充填品","name":"部品3","lot":"M-003","snp":10,"qty":10},{"type":"充填品","name":"部品4","lot":"M-004","snp":10,"qty":10},{"type":"充填品","name":"部品5","lot":"M-005","snp":10,"qty":10}];
  const manualChecks = ["上段固有欄が何件できるか確認する","上段を超えた欄が下段の空欄へ救済されるか確認する"];
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
  console.info("入力完了: " + entered.length + "件 / " + totalP + "P（期待 12P）");
  console.info("確認項目:", manualChecks);
  console.info("画面の「▶ 自動配置を作成」ボタンを押して結果を確認してください。");
})();
