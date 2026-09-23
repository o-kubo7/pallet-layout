const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

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

function settingRuntime({ checked = true, saved = null } = {}) {
  const log = { saved: [] };
  const checkbox = { checked };
  const document = { getElementById: id => id === "splitConfirmChk" ? checkbox : null };
  const runtime = new Function("document", "saved", "log", `
    let splitConfirmEnabled=true;
    const STORE_KEY={splitConfirm:"palletApp.splitConfirm"};
    function saveData(key,value){ log.saved.push([key,value]); }
    function loadData(){ return saved; }
    ${functionSource("toggleSplitConfirm")}
    ${functionSource("initSplitConfirm")}
    return {
      toggleSplitConfirm,
      initSplitConfirm,
      enabled:()=>splitConfirmEnabled,
      checked:()=>document.getElementById("splitConfirmChk").checked,
    };
  `)(document, saved, log);
  return { ...runtime, log };
}

test("分割確認のチェックを外すと、その端末の設定としてOFFを保存する", () => {
  const app = settingRuntime({ checked: false });
  app.toggleSplitConfirm();
  assert.equal(app.enabled(), false);
  assert.deepEqual(app.log.saved, [["palletApp.splitConfirm", false]]);
});

test("保存済みの分割確認OFFを起動時に復元する", () => {
  const app = settingRuntime({ checked: true, saved: false });
  app.initSplitConfirm();
  assert.equal(app.enabled(), false);
  assert.equal(app.checked(), false);
});

test("保存値が無い端末では分割確認をONにする", () => {
  const app = settingRuntime({ checked: false, saved: null });
  app.initSplitConfirm();
  assert.equal(app.enabled(), true);
  assert.equal(app.checked(), true);
});
