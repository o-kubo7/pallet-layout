// 基本入力・拡張様式と追記欄 (basic-wide-overflow) — verified
// 現在の時間帯の入力を置き換えます。反対側の時間帯・配置不可設定・品目マスタは変更しません。
// 専用オリジンまたは不要な入力の時間帯で実行してください。
(() => {
  const rows = [{"type":"充填品","name":"部品C","lot":"L-103","snp":10,"qty":245},{"type":"充填品","name":"部品A","lot":"L-101","snp":10,"qty":120},{"type":"充填品","name":"部品B","lot":"L-102","snp":10,"qty":70},{"type":"充填品","name":"部品D","lot":"L-104","snp":10,"qty":140},{"type":"充填品","name":"部品E","lot":"L-105","snp":10,"qty":60},{"type":"製品","name":"製品X","lot":"P-201","snp":10,"qty":60},{"type":"製品","name":"製品Y","lot":"P-202","snp":10,"qty":90},{"type":"製品","name":"製品Z","lot":"P-203","snp":10,"qty":110},{"type":"製品","name":"製品W","lot":"P-204","snp":10,"qty":80},{"type":"充填品","name":"部品1","lot":"L-201","snp":10,"qty":10},{"type":"充填品","name":"部品2","lot":"L-202","snp":10,"qty":10},{"type":"充填品","name":"部品3","lot":"L-203","snp":10,"qty":10},{"type":"充填品","name":"部品4","lot":"L-204","snp":10,"qty":10},{"type":"充填品","name":"部品5","lot":"L-205","snp":10,"qty":10},{"type":"充填品","name":"部品6","lot":"L-206","snp":10,"qty":10},{"type":"充填品","name":"部品7","lot":"L-207","snp":10,"qty":10}];
  const manualChecks = ["拡張様式が18列で表示される","追記欄に製品Wと製品Zおよび各注釈が表示される"];
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
  console.info("入力完了: " + entered.length + "件 / " + totalP + "P（期待 105P）");
  console.info("確認項目:", manualChecks);
  console.info("画面の「▶ 自動配置を作成」ボタンを押して結果を確認してください。");
})();
