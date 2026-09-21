const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const source = fs.readFileSync("files/index.html", "utf8");

// files/index.html から1つの関数の本文を切り出す。
// tests/sheet-placement.test.js の同名ヘルパーと同じ実装。
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
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth++;
    else if (char === "}") { depth--; if (depth === 0) return source.slice(start, i + 1); }
  }
  assert.fail(`${name} must be balanced`);
}

function constant(name) {
  const m = source.match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
  assert.notEqual(m, null, `${name} must exist`);
  return m[1];
}

/* 本体から関数だけを取り出して動かす。names に挙げた関数はすべて本物を使う。
   関数宣言は巻き上げられるので、names の順番は結果に影響しない。 */
function load(names, { spaces = [], lots = [] } = {}) {
  const src = `
    const STASH_COL_H=${constant("STASH_COL_H")};
    let lastSp=spaces, lastLots=lots;
    ${names.map(functionSource).join("\n")}
    return { ${names.join(", ")}, spaces: () => lastSp };
  `;
  return new Function("spaces", "lots", src)(spaces, lots);
}

test("cloneSpaces は blockedRows を Set のまま複製する", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const sp = [{ name: "棟A", cols: [{ h: 4, fills: [], blockedRows: new Set([1, 2]) }] }];
  const next = cloneSpaces(sp);
  assert.ok(next[0].cols[0].blockedRows instanceof Set, "Set が復元されていない");
  assert.deepEqual([...next[0].cols[0].blockedRows], [1, 2]);
  next[0].cols[0].blockedRows.add(3);
  assert.equal(sp[0].cols[0].blockedRows.has(3), false, "元の Set と共有している");
});

test("blockedRows が無い列でも空の Set になる", () => {
  const { cloneSpaces } = load(["clone", "cloneSpaces"]);
  const next = cloneSpaces([{ name: "棟A", cols: [{ h: 4, fills: [] }] }]);
  assert.ok(next[0].cols[0].blockedRows instanceof Set);
  assert.equal(next[0].cols[0].blockedRows.size, 0);
});

test("validateMove は cloneSpaces を使う", () => {
  assert.match(functionSource("validateMove"), /cloneSpaces\(/);
});

// 退避スペース1つ。count を入れた列を持つ
function stashWith(count) {
  const cols = [];
  let rem = count;
  while (rem > 0) {
    const put = Math.min(rem, 4);
    cols.push({ h: 4, aisle: false, fills: [{ id: "L1", count: put }] });
    rem -= put;
  }
  if (!cols.length) cols.push({ h: 4, aisle: false, fills: [] });
  return [{ name: "退避", zone: "stash", cols }];
}

test("退避の上限はその日の入力総パレット数", () => {
  const spaces = stashWith(6);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 20 }, { pallets: 10 }] }
  );
  // 入力は 30P、退避には 6P 入っているので残り 24P
  assert.equal(stashFreeRoom(spaces), 24);
});

test("入力より多く入っていても空きは負にならない", () => {
  const spaces = stashWith(12);
  const { stashFreeRoom } = load(
    ["used", "stashSpaces", "stashTotal", "stashCapacity", "stashFreeRoom"],
    { spaces, lots: [{ pallets: 4 }] }
  );
  assert.equal(stashFreeRoom(spaces), 0);
});

test("上限を列数から数えない", () => {
  const fn = functionSource("stashFreeRoom");
  assert.match(fn, /stashCapacity\(/);
  assert.doesNotMatch(fn, /STASH_MAX_COLS/);
});

function emptyStash() {
  return [{ name: "退避", zone: "stash", cols: [{ h: 4, aisle: false, fills: [] }] }];
}

const STASH_PIECES = ["clone", "used", "stashSpaces", "stashTotal", "stashCapacity",
  "stashFreeRoom", "normalizeFills", "putToStash"];

test("putToStash は列数の上限で止まらない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 100 }] });
  putToStash(spaces, "L1", 100);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 100, "100P 入っていない");
  assert.equal(spaces[0].cols.length, 25, "h:4 の列が 25 本にならない");
});

test("putToStash は上限を超えては積まない", () => {
  const spaces = emptyStash();
  const { putToStash } = load(STASH_PIECES, { spaces, lots: [{ pallets: 30 }] });
  putToStash(spaces, "L1", 40);
  const total = spaces[0].cols.reduce((a, c) => a + c.fills.reduce((x, f) => x + f.count, 0), 0);
  assert.equal(total, 30, "上限を超えて積んでいる");
});

test("ensureStashRoom は容量が残っていれば末尾に空き列を残す", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 20 }] }
  );
  ensureStashRoom(spaces);
  const cols = spaces[0].cols;
  assert.equal(cols[cols.length - 1].fills.length, 0, "末尾に空き列が無い");
});

test("ensureStashRoom は満杯なら空き列を足さない", () => {
  const spaces = stashWith(8);
  const { ensureStashRoom } = load(
    [...STASH_PIECES, "repackStash", "ensureStashRoom"],
    { spaces, lots: [{ pallets: 8 }] }
  );
  ensureStashRoom(spaces);
  assert.equal(spaces[0].cols.length, 2, "満杯なのに空き列を足している");
});

// R1: putToStash() が読む stashCapacity() は Σ lot.pallets を見るので、
// run() は「全ロットの pallets を戻す」→「退避へ積み戻す」の順でないといけない。
// 順序が入れ替わると、まだ戻していない退避分だけ上限が目減りして、
// 退避の中身が黙って消える（task-3-brief.md 追記 R1 参照）。
test("run は退避を積み戻す前に l.pallets を戻す", () => {
  const fn = functionSource("run");
  const restore = fn.indexOf("l.pallets+=l.stashed");
  const restack = fn.indexOf("putToStash(lastSp,l.id,l.stashed)");
  assert.ok(restore !== -1, "l.pallets を戻す行が無い");
  assert.ok(restack !== -1, "退避への積み戻しが無い");
  assert.ok(restore < restack, "パレット数を戻すのが積み戻しより後になっている");
});
