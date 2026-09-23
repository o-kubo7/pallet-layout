const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const allocationPath = "tests/fixtures/sheet-allocation-scenarios.json";
const allocationScenarios = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
const consolePath = "tests/fixtures/sheet-console-scenarios.json";
const consoleScenarios = JSON.parse(fs.readFileSync(consolePath, "utf8"));
const source = fs.readFileSync("files/index.html", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const brace = source.indexOf("{", start);
  let depth = 0, quote = null, escaped = false;
  for (let i = brace; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    if (char === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

function entry(slot) {
  return {
    lot: { id: slot.id, name: slot.id, lot: slot.id },
    areas: slot.areas,
    ...(slot.stash ? { stash: true } : {}),
    ...(slot.note ? { note: slot.note } : {}),
  };
}

function resultIds(values) {
  return values.map(value => {
    if (value == null) return null;
    if (value.group) return { group: value.group.map(item => item.lot.id) };
    return value.lot.id;
  });
}

function buildSheetPlacementRuntime(scenario) {
  const begin = source.indexOf("const SHEET_LAYOUTS = {");
  assert.notEqual(begin, -1, "SHEET_LAYOUTS must exist");
  const end = source.indexOf("};", begin);
  assert.notEqual(end, -1, "SHEET_LAYOUTS must close");
  const runtime = new Function(
    "sheetSlots", "stashSlots", "sheetAreas", "slotAreaNote", "mergeLots",
    source.slice(begin, end + 2) +
    functionSource("sheetLayout") +
    functionSource("arrangeBottomSlots") +
    functionSource("arrangeOverflowSlots") +
    functionSource("sheetPlacement") +
    "; return { sheetPlacement, SHEET_LAYOUTS };"
  );
  return runtime(
    tier => (tier === "top" ? scenario.slots.top : scenario.slots.bottom).map(entry),
    () => scenario.slots.stash.map(entry),
    tier => tier === "bottom" ? [scenario.baseArea, "PC横", "EV横"] : ["軒下①", "軒下②"],
    areas => `※${areas.join("・")}`,
    false
  );
}

function flattenIds(values) {
  return values.flatMap(value => {
    if (value == null) return [];
    return typeof value === "string" ? [value] : value.group;
  });
}

function validateScenario(scenario) {
  assert.equal(typeof scenario.id, "string");
  assert.match(scenario.id, /^[a-z0-9-]+$/);
  assert.equal(typeof scenario.title, "string");
  assert.equal(typeof scenario.baseArea, "string");
  assert.ok(scenario.slots && typeof scenario.slots === "object");
  for (const section of ["top", "bottom", "stash"]) {
    assert.ok(Array.isArray(scenario.slots[section]));
    for (const slot of scenario.slots[section]) {
      assert.equal(typeof slot.id, "string");
      assert.ok(Array.isArray(slot.areas));
      assert.ok(slot.areas.every(area => typeof area === "string"));
      if ("stash" in slot) assert.equal(typeof slot.stash, "boolean");
      if ("note" in slot) assert.equal(typeof slot.note, "string");
    }
  }

  const expected = scenario.expected;
  assert.ok(["normal", "middle", "wide"].includes(expected.layout));
  assert.ok(Array.isArray(expected.top));
  assert.ok(expected.top.every(id => id === null || typeof id === "string"));
  assert.ok(Array.isArray(expected.bottom));
  assert.ok(expected.bottom.every(id => id === null || typeof id === "string"));
  assert.ok(Array.isArray(expected.moved));
  assert.ok(expected.moved.every(id => typeof id === "string"));
  assert.ok(Array.isArray(expected.movedBottom));
  assert.ok(expected.movedBottom.every(id => typeof id === "string"));
  assert.ok(Array.isArray(expected.overflow));
  for (const item of expected.overflow) {
    assert.ok(typeof item === "string" || (item && Array.isArray(item.group)));
    if (typeof item !== "string") {
      assert.ok(item.group.every(id => typeof id === "string"));
      assert.equal(new Set(item.group).size, item.group.length, "overflow group内IDの重複");
    }
  }

  const slotIds = [
    ...scenario.slots.top,
    ...scenario.slots.bottom,
    ...scenario.slots.stash,
  ].map(slot => slot.id);
  assert.equal(new Set(slotIds).size, slotIds.length, "slots内IDの重複");
  const expectedIds = [
    ...expected.top,
    ...expected.bottom,
    ...expected.moved,
    ...expected.movedBottom,
    ...flattenIds(expected.overflow),
  ].filter(id => id != null);
  assert.ok(expectedIds.every(id => slotIds.includes(id)), "expectedにしか存在しないID");
}

function validateConsoleScenario(scenario) {
  assert.match(scenario.id, /^[a-z0-9-]+$/);
  assert.ok(typeof scenario.title === "string" && scenario.title.length > 0);
  assert.ok(["verified", "pending"].includes(scenario.verificationStatus));
  assert.ok(Array.isArray(scenario.manualChecks) && scenario.manualChecks.length > 0);
  assert.ok(scenario.manualChecks.every(check => typeof check === "string" && check.length > 0));
  assert.ok(Array.isArray(scenario.input) && scenario.input.length > 0);
  for (const row of scenario.input) {
    assert.ok(["製品", "充填品"].includes(row.type));
    assert.ok(typeof row.name === "string" && row.name.length > 0);
    assert.equal(typeof row.lot, "string");
    assert.ok(Number.isSafeInteger(row.snp) && row.snp > 0, "SNPは正の安全な整数");
    assert.ok(Number.isSafeInteger(row.qty) && row.qty > 0, "個数は正の安全な整数");
  }
  const total = scenario.input.reduce((sum, row) => sum + Math.ceil(row.qty / row.snp), 0);
  assert.equal(total, scenario.expectedTotalPallets, `${scenario.id}: 合計P数`);
}

test("Consoleシナリオは指定した12件でverified 5件・pending 7件", () => {
  const verifiedIds = [
    "demo-100p", "basic-normal", "basic-middle", "basic-wide", "basic-wide-overflow",
  ];
  const expectedIds = [
    ...verifiedIds,
    "split-delivery", "same-name-different-lot", "half-pallet",
    "normal-to-middle", "middle-to-wide", "top-rescue", "stash-overflow",
  ];
  assert.equal(consoleScenarios.length, 12);
  assert.deepEqual(consoleScenarios.map(s => s.id).sort(), expectedIds.sort());
  assert.equal(new Set(consoleScenarios.map(s => s.id)).size, 12);
  assert.deepEqual(consoleScenarios.filter(s => s.verificationStatus === "verified")
    .map(s => s.id).sort(), verifiedIds.sort());
  assert.equal(consoleScenarios.filter(s => s.verificationStatus === "pending").length, 7);
  for (const scenario of consoleScenarios) validateConsoleScenario(scenario);
});

test("ConsoleシナリオはSNP・個数の0、負数、小数、文字列を拒否する", () => {
  const scenario = structuredClone(consoleScenarios[0]);
  for (const key of ["snp", "qty"]) {
    for (const value of [0, -1, 1.5, "10"]) {
      const invalid = structuredClone(scenario);
      invalid.input[0][key] = value;
      assert.throws(() => validateConsoleScenario(invalid), /正の安全な整数/, `${key}: ${value}`);
    }
  }
});

test("分納は同名同ロットでも各行を切り上げて合計する", () => {
  const scenario = consoleScenarios.find(s => s.id === "split-delivery");
  assert.ok(scenario);
  assert.deepEqual(scenario.input.map(row => [row.name, row.lot, row.snp, row.qty]), [
    ["部品1", "S-001", 10, 1],
    ["部品1", "S-001", 10, 11],
  ]);
  assert.equal(scenario.expectedTotalPallets, 3);
  validateConsoleScenario(scenario);
});

test("100Pデモの10行は元Excelの転記値と一致する", () => {
  const scenario = consoleScenarios.find(s => s.id === "demo-100p");
  assert.deepEqual(scenario.input.map(row => [row.type, row.name, row.lot, row.snp, row.qty]), [
    ["製品", "製品1", "111", 500, 4000],
    ["製品", "製品2", "222", 500, 2750],
    ["充填品", "仕掛品1", "111-1111", 1500, 24000],
    ["充填品", "仕掛品1", "111-1112", 1500, 18000],
    ["充填品", "仕掛品1", "111-1113", 1500, 11250],
    ["充填品", "仕掛品2", "222-2222", 1500, 15000],
    ["充填品", "仕掛品2", "222-2223", 1500, 15000],
    ["充填品", "仕掛品3", "333-3333", 2000, 17500],
    ["充填品", "仕掛品3", "333-3334", 2000, 14000],
    ["充填品", "仕掛品4", "444-4444", 2000, 27000],
  ]);
  assert.equal(scenario.expectedTotalPallets, 100);
});

test("Consoleコードと手動確認表はシナリオJSONに同期する", () => {
  const check = spawnSync(process.execPath,
    ["scripts/generate-sheet-console-cases.mjs", "--check"],
    { encoding: "utf8" });
  assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
  assert.match(check.stdout, /12 console cases and manual guide are up to date/);
  const caseDir = "tests/console-cases";
  assert.deepEqual(fs.readdirSync(caseDir).filter(name => name.endsWith(".console.js")).sort(),
    consoleScenarios.map(s => `${s.id}.console.js`).sort());
  for (const scenario of consoleScenarios) {
    const code = fs.readFileSync(path.join(caseDir, `${scenario.id}.console.js`), "utf8");
    assert.match(code, /現在の時間帯の入力を置き換えます/);
    assert.match(code, /switchTab\("input"\)/);
    assert.match(code, /clearLots\(\)/);
    assert.match(code, /addSlip\("fax"\)/);
    assert.match(code, /addItemRow\(addButton\)/);
    assert.match(code, /dispatchEvent\(new Event\(type, \{ bubbles: true \}\)\)/);
    assert.match(code, /try\s*\{\s*clearLots\(\);?\s*\}\s*finally\s*\{/);
    assert.match(code, /window\.confirm\s*=\s*originalConfirm/);
    assert.doesNotMatch(code, /runFromButton|\brun\(|printSheet|window\.print/);
    assert.match(code, new RegExp(`${scenario.expectedTotalPallets}P`));
    for (const checkItem of scenario.manualChecks) assert.ok(code.includes(checkItem));
  }
  const guide = fs.readFileSync("docs/testing/sheet-manual-cases.md", "utf8");
  assert.match(guide, /verified.*5件/);
  assert.match(guide, /pending.*7件/);
  assert.match(guide, /結果記入欄/);
  for (const scenario of consoleScenarios) {
    assert.ok(guide.includes(scenario.id));
    assert.ok(guide.includes(`${scenario.id}.console.js`));
    for (const checkItem of scenario.manualChecks) assert.ok(guide.includes(checkItem));
  }
});

test("Consoleコードが使う入力画面APIとDOM構造を本体が提供する", () => {
  for (const name of ["switchTab", "clearLots", "addSlip", "addItemRow"]) {
    assert.match(source, new RegExp(`function ${name}\\(`), `${name} が見つからない`);
  }
  assert.match(source, /id="slipList"/);
  assert.match(source, /class="btn btn-ghost btn-slip-action-add"/);
  assert.match(source, /<tbody><\/tbody>/);
  assert.match(source, /tr\.querySelectorAll\("select,input"\)/);
});

test("自動割当シナリオは12件でIDが一意", () => {
  assert.equal(allocationScenarios.length, 12);
  assert.equal(new Set(allocationScenarios.map(s => s.id)).size, 12);
  allocationScenarios.forEach(s => assert.match(s.id, /^[a-z0-9-]+$/));
});

test("各シナリオのSlotとexpectedがスキーマ・参照整合性を満たす", () => {
  allocationScenarios.forEach(validateScenario);
});

test("slots各段にまたがるID重複を拒否する", () => {
  const scenario = structuredClone(allocationScenarios[0]);
  scenario.slots.stash.push(structuredClone(scenario.slots.top[0]));
  assert.throws(() => validateScenario(scenario), /slots内IDの重複/);
});

test("expectedにしか存在しないIDを拒否する", () => {
  const scenario = structuredClone(allocationScenarios[0]);
  scenario.expected.moved.push("MISSING");
  assert.throws(() => validateScenario(scenario), /expectedにしか存在しないID/);
});

test("overflow group内部のID重複を拒否する", () => {
  const scenario = structuredClone(allocationScenarios[0]);
  scenario.expected.overflow = [{ group: [scenario.slots.top[0].id, scenario.slots.top[0].id] }];
  assert.throws(() => validateScenario(scenario), /overflow group内IDの重複/);
});

for (const scenario of allocationScenarios) {
  test(`実装本体の割当: ${scenario.id}`, () => {
    const { sheetPlacement, SHEET_LAYOUTS } = buildSheetPlacementRuntime(scenario);
    const result = sheetPlacement();
    const layout = Object.entries(SHEET_LAYOUTS).find(([, value]) => value === result.lay)?.[0];
    assert.equal(layout, scenario.expected.layout, `${scenario.id}: expected.layout`);
    assert.deepEqual(resultIds(result.top), scenario.expected.top, `${scenario.id}: expected.top`);
    assert.deepEqual(resultIds(result.bottom), scenario.expected.bottom, `${scenario.id}: expected.bottom`);
    assert.deepEqual(resultIds(result.moved), scenario.expected.moved, `${scenario.id}: expected.moved`);
    assert.deepEqual(resultIds(result.movedBottom), scenario.expected.movedBottom,
      `${scenario.id}: expected.movedBottom`);
    assert.deepEqual(resultIds(result.overflow), scenario.expected.overflow,
      `${scenario.id}: expected.overflow`);

    if (layout === "middle") {
      assert.deepEqual(result.overflow, [], `${scenario.id}: middleの追記欄`);
    }
    assert.ok(result.movedBottom.every(value => !value.areas.includes(scenario.baseArea)),
      `${scenario.id}: メインエリアを上段へ回さない`);

    // top の戻り値には救済先や追記欄へ送った欄も残る。紙に描くのは様式の上段枠数まで。
    const renderedIds = [
      ...resultIds(result.top.slice(0, result.lay.top)),
      ...resultIds(result.bottom),
      ...resultIds(result.overflow),
    ];
    const actualIds = flattenIds(renderedIds);
    const slotIds = [
      ...scenario.slots.top,
      ...scenario.slots.bottom,
      ...scenario.slots.stash,
    ].map(slot => slot.id);
    assert.deepEqual(actualIds.slice().sort(), slotIds.slice().sort(),
      `${scenario.id}: 最終表示先の欄IDに欠落・重複がない`);
  });
}
