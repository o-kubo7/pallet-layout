import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(root, "tests/fixtures/sheet-console-scenarios.json");
const caseDir = path.join(root, "tests/console-cases");
const guidePath = path.join(root, "docs/testing/sheet-manual-cases.md");

export function renderConsoleCase(scenario) {
  return `// ${scenario.title} (${scenario.id}) — ${scenario.verificationStatus}
// 現在の時間帯の入力と配置関連状態（配置不可設定を含む）をリセットします。
// 反対側の時間帯と品目マスタは変更しません。
// 専用オリジンまたは不要な入力の時間帯で実行してください。
(() => {
  const rows = ${JSON.stringify(scenario.input)};
  const manualChecks = ${JSON.stringify(scenario.manualChecks)};
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
  console.info("入力完了: " + entered.length + "件 / " + totalP + "P（期待 ${scenario.expectedTotalPallets}P）");
  console.info("確認項目:", manualChecks);
  console.info("画面の「▶ 自動配置を作成」ボタンを押して結果を確認してください。");
})();
`;
}

export function renderManualGuide(scenarios) {
  const section = (status, heading) => {
    const rows = scenarios.filter(scenario => scenario.verificationStatus === status);
    return `## ${status}（${heading}${rows.length}件）\n\n` +
      "| ID | 状態 | 合計P | Consoleファイル | 確認項目 | 結果記入欄 |\n" +
      "| --- | --- | ---: | --- | --- | --- |\n" +
      rows.map(scenario => `| ${scenario.id} | ${status} | ${scenario.expectedTotalPallets}P | ` +
        `[${scenario.id}.console.js](../../tests/console-cases/${scenario.id}.console.js) | ` +
        `${scenario.manualChecks.join("<br>")} | ＿＿＿＿ |`).join("\n") + "\n";
  };
  return "# 配置図の手動確認表\n\n" +
    "専用オリジンまたは不要な入力の時間帯で、各 Console ファイルをブラウザの Console に貼り付けてください。" +
    "現在の時間帯の入力と配置関連状態（配置不可設定を含む）をリセットします。" +
    "反対側の時間帯と品目マスタは変更しません。入力後に画面の「▶ 自動配置を作成」を押し、" +
    "表示された合計P・案内文・様式・上段・下段・追記欄を確認し、結果記入欄に記録してください。\n\n" +
    section("verified", "確認済み") + "\n" +
    section("pending", "確認待ち") + "\n" +
    section("reference", "参考・配置比較対象外");
}

export function writeOutputs({ check = false } = {}) {
  const scenarios = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
  const expected = new Map(scenarios.map(scenario => [
    `${scenario.id}.console.js`, renderConsoleCase(scenario),
  ]));
  const issues = [];
  const actualNames = fs.existsSync(caseDir)
    ? fs.readdirSync(caseDir).filter(name => name.endsWith(".console.js"))
    : [];
  if (!check) fs.mkdirSync(caseDir, { recursive: true });
  for (const [name, content] of expected) {
    const target = path.join(caseDir, name);
    if (!fs.existsSync(target)) {
      if (check) issues.push(`missing: tests/console-cases/${name}`);
      else fs.writeFileSync(target, content);
    } else if (fs.readFileSync(target, "utf8") !== content) {
      if (check) issues.push(`different: tests/console-cases/${name}`);
      else fs.writeFileSync(target, content);
    }
  }
  if (check) {
    for (const name of actualNames) {
      if (!expected.has(name)) issues.push(`extra: tests/console-cases/${name}`);
    }
  }
  const guide = renderManualGuide(scenarios);
  if (!fs.existsSync(guidePath)) {
    if (check) issues.push("missing: docs/testing/sheet-manual-cases.md");
    else {
      fs.mkdirSync(path.dirname(guidePath), { recursive: true });
      fs.writeFileSync(guidePath, guide);
    }
  } else if (fs.readFileSync(guidePath, "utf8") !== guide) {
    if (check) issues.push("different: docs/testing/sheet-manual-cases.md");
    else fs.writeFileSync(guidePath, guide);
  }
  return { count: expected.size, issues };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { count, issues } = writeOutputs({ check: process.argv.includes("--check") });
  if (issues.length) {
    console.error(issues.join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`${count} console cases and manual guide are up to date`);
  }
}
