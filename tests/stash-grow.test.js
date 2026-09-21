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

/* applyMove を実際に動かす。退避スペースの列を伸ばす growStashCol と、
   枚数を数える movingCount は本物を使う。移動の可否そのものは
   validateMove の責任で別のテストの範囲なので、返り値を差し替える。 */
function loadApplyMove({ spaces, counts, validate, confirmAnswer }) {
  const log = { validatedH: null, pushed: 0, saved: 0, redrawn: 0, confirmed: 0 };
  const src = `
    const STASH_COL_H=${constant("STASH_COL_H")};
    const STASH_COL_MAX_H=${constant("STASH_COL_MAX_H")};
    let lastSp=spaces, lastLots=[];
    const sel={lotId:"L1", cells:new Set(["棟A|0"])};
    ${functionSource("clone")}
    ${functionSource("used")}
    ${functionSource("stashSpaces")}
    ${functionSource("snapshotSpaces")}
    ${functionSource("movingCount")}
    ${functionSource("growStashCol")}
    ${functionSource("applyMove")}
    function isActiveFresh(){ return true; }
    function refreshFreshness(){}
    function selCounts(){ return counts; }
    function selSnapshot(){ return null; }
    function validateMove(sp, lotId, c, name, idx){
      const s=stashSpaces(sp).find(x=>x.name===name);
      log.validatedH = s ? s.cols[idx].h : null;
      return validate;
    }
    function confirm(){ log.confirmed++; return confirmAnswer; }
    function pushMoveStep(){ log.pushed++; }
    function saveManual(){ log.saved++; }
    function clearSel(){}
    function redraw(){ log.redrawn++; }
    return { applyMove, spaces:()=>lastSp };
  `;
  const made = new Function("spaces", "counts", "validate", "confirmAnswer", "log", src)(
    spaces, counts, validate, confirmAnswer, log
  );
  return { ...made, log };
}

// 退避スペース1つ。列0には既に3枚入っている
function stashOnly() {
  return [{
    name: "退避", zone: "stash", cols: [
      { h: 4, aisle: false, fills: [{ id: "L1", count: 3 }] },
      { h: 4, aisle: false, fills: [] },
    ],
  }];
}

test("検証に落ちたら、伸ばした退避の列の高さを元に戻す", () => {
  // growStashCol は lastSp の列を直接書き換える。移動が成立しないまま
  // 抜けると、空のまま伸びた列が lastSp に残る
  const app = loadApplyMove({
    spaces: stashOnly(),
    counts: { "棟A|0": 25 },
    validate: { ok: false, reason: "移動先の空きが足りません" },
    confirmAnswer: true,
  });
  app.applyMove("退避", 0);
  // 検証には伸ばしたあとの高さが渡っている（伸ばす処理自体は消さない）
  assert.equal(app.log.validatedH, 21, "検証に伸ばしたあとの高さが渡っていない");
  assert.equal(app.spaces()[0].cols[0].h, 4, "伸ばした高さが戻っていない");
  assert.equal(app.log.pushed, 0);
  assert.equal(app.log.saved, 0);
});

test("分割の確認を取り消したら、伸ばした退避の列の高さを元に戻す", () => {
  const app = loadApplyMove({
    spaces: stashOnly(),
    counts: { "棟A|0": 25 },
    validate: { ok: true, needConfirm: true, before: 1, after: 2, next: [] },
    confirmAnswer: false,
  });
  app.applyMove("退避", 0);
  assert.equal(app.log.confirmed, 1, "確認を出していない");
  assert.equal(app.spaces()[0].cols[0].h, 4, "伸ばした高さが戻っていない");
  assert.equal(app.log.pushed, 0);
  assert.equal(app.log.saved, 0);
});

test("移動が成立したら検証後の配置をそのまま採る", () => {
  const next = [{ name: "退避", zone: "stash", cols: [{ h: 21, aisle: false, fills: [{ id: "L1", count: 28 }] }] }];
  const app = loadApplyMove({
    spaces: stashOnly(),
    counts: { "棟A|0": 25 },
    validate: { ok: true, needConfirm: false, next },
    confirmAnswer: true,
  });
  app.applyMove("退避", 0);
  assert.equal(app.spaces(), next, "検証後の配置を採っていない");
  assert.equal(app.log.pushed, 1);
  assert.equal(app.log.saved, 1);
  assert.equal(app.log.redrawn, 1);
});
