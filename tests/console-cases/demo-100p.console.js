// 100Pデモ (demo-100p) — reference
// 現在の時間帯の入力と配置関連状態（配置不可設定を含む）をリセットします。
// 反対側の時間帯と品目マスタは変更しません。
// 専用オリジンまたは不要な入力の時間帯で実行してください。
(() => {
  const rows = [{"type":"製品","name":"製品1","lot":"111","snp":500,"qty":4000},{"type":"製品","name":"製品2","lot":"222","snp":500,"qty":2750},{"type":"充填品","name":"仕掛品1","lot":"111-1111","snp":1500,"qty":24000},{"type":"充填品","name":"仕掛品1","lot":"111-1112","snp":1500,"qty":18000},{"type":"充填品","name":"仕掛品1","lot":"111-1113","snp":1500,"qty":11250},{"type":"充填品","name":"仕掛品2","lot":"222-2222","snp":1500,"qty":15000},{"type":"充填品","name":"仕掛品2","lot":"222-2223","snp":1500,"qty":15000},{"type":"充填品","name":"仕掛品3","lot":"333-3333","snp":2000,"qty":17500},{"type":"充填品","name":"仕掛品3","lot":"333-3334","snp":2000,"qty":14000},{"type":"充填品","name":"仕掛品4","lot":"444-4444","snp":2000,"qty":27000}];
  const manualChecks = ["元Excelの10行が入力され、合計100Pになることを確認する","以前の見本は手修正後の配置のため、自動配置結果の配置比較には使わない"];
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
  console.info("入力完了: " + entered.length + "件 / " + totalP + "P（期待 100P）");
  console.info("確認項目:", manualChecks);
  console.info("画面の「▶ 自動配置を作成」ボタンを押して結果を確認してください。");
})();
