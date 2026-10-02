const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function setup() {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", textContent: "", innerHTML: "", style: {}, files: [{}], width: 720,
      listeners: {}, addEventListener(event, handler) { this.listeners[event] = handler; },
      replaceChildren() { this.innerHTML = ""; this.textContent = ""; },
      classList: { add() {}, remove() {}, toggle() {} },
      querySelectorAll() { return []; }
    });
    return nodes.get(id);
  }
  const events = {};
  const readers = [];
  const window = {
    AppAuth: { uid: "alice" }, AccountData: { init() {} },
    addEventListener(event, handler) { events[event] = handler; }
  };
  const context = vm.createContext({
    window, document: { getElementById: node, body: node("body") },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    FileReader: class {
      constructor() { readers.push(this); }
      addEventListener(event, handler) { this[event] = handler; }
      readAsDataURL() {}
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../script.js"), "utf8"), context);
  return { node, context, window, readers, lock: events["app-locked"] };
}

test("locking removes images, results and cached data; late file reads cannot restore them", () => {
  const app = setup();
  const ids = ["image-preview", "before-image", "after-image", "history-list", "hospital-list",
    "analysis-text", "clinic-summary", "scan-steps", "before-score", "after-score", "score-delta"];
  for (const id of ids) {
    app.node(id).innerHTML = "private image or result";
    app.node(id).textContent = "private result";
  }
  app.node("face-image").listeners.change();
  vm.runInContext('selectedImageData = "private"; latestResult = {}; latestFaceAnalysis = {};', app.context);
  app.lock();
  app.readers[0].result = "late-private-image";
  app.readers[0].load();
  for (const id of ids) assert.equal(app.node(id).textContent, "", id);
  assert.equal(app.node("image-preview").innerHTML, "");
  assert.equal(app.node("before-image").innerHTML, "");
  assert.equal(app.node("after-image").innerHTML, "");
  assert.equal(vm.runInContext("selectedImageData", app.context), "");
  assert.equal(vm.runInContext("latestResult", app.context), null);
  assert.equal(vm.runInContext("latestFaceAnalysis", app.context), null);
  assert.equal(app.node("save-button").disabled, true);
});

test("face analysis completing after lock cannot restore cached analysis", async () => {
  const app = setup();
  let finish;
  app.window.FaceBalanceAnalyzer = { analyze: () => new Promise((resolve) => { finish = resolve; }) };
  const pending = vm.runInContext('selectedImageData = "private"; analyzeSelectedFace()', app.context);
  app.lock();
  finish({ ok: true, privateResult: true });
  await pending;
  assert.equal(vm.runInContext("latestFaceAnalysis", app.context), null);
  assert.equal(vm.runInContext("analyzedImageData", app.context), "");
});
