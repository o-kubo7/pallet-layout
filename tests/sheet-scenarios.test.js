const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const allocationPath = "tests/fixtures/sheet-allocation-scenarios.json";
const allocationScenarios = JSON.parse(fs.readFileSync(allocationPath, "utf8"));
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
