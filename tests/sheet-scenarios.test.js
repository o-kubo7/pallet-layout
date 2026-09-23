const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const allocationPath = "tests/fixtures/sheet-allocation-scenarios.json";
const allocationScenarios = JSON.parse(fs.readFileSync(allocationPath, "utf8"));

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
