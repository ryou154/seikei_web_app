const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("navigation destinations exist and a protected fragment is focused only after unlock", () => {
  const root = path.join(__dirname, "..");
  const anchors = [];
  const events = {};
  const location = new URL("http://localhost/app.html#history-title");
  let locked = true;
  let focused = 0;
  let scrolled = 0;
  const target = {
    closest: () => locked ? {} : null,
    setAttribute() {},
    focus() { focused++; },
    scrollIntoView() { scrolled++; }
  };
  const container = { replaceChildren() {} };
  const document = {
    getElementById: (id) => id === "common-navigation" ? container : target,
    createElement(tag) {
      const node = {
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        append() {}, addEventListener() {}
      };
      if (tag === "a") anchors.push(node);
      return node;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "navigation.js"), "utf8"), {
    document, URL,
    location,
    window: { addEventListener(name, handler) { (events[name] ||= []).push(handler); } }
  });
  assert.equal(anchors.length, 5);
  for (const anchor of anchors) {
    const [file, id] = anchor.href.split("#");
    const html = fs.readFileSync(path.join(root, file), "utf8");
    if (id) assert.ok(html.includes(`id="${id}"`), `${anchor.textContent} has a destination`);
  }
  assert.equal(focused, 0);
  assert.equal(scrolled, 0);
  locked = false;
  events["app-authorized"].forEach((handler) => handler());
  assert.equal(focused, 1);
  assert.equal(scrolled, 1);
  events.hashchange.forEach((handler) => handler());
  assert.equal(focused, 2);

  const currentLabels = () => anchors
    .filter((anchor) => anchor.attributes["aria-current"] === "page")
    .map((anchor) => anchor.textContent);
  assert.deepEqual(currentLabels(), ["履歴"]);
  for (const [url, expected] of [
    ["app.html#clinic-title", "クリニック"],
    ["app.html#auth-title", "アカウント"],
    ["app.html#input-title", "シミュレーション"],
    ["app.html", "シミュレーション"],
    ["app.html#unknown", "シミュレーション"],
    ["app.html#history-title", "履歴"],
    ["history.html", "履歴"],
    ["login.html", "ログイン"]
  ]) {
    location.href = new URL(url, location.href).href;
    events.hashchange.forEach((handler) => handler());
    assert.deepEqual(currentLabels(), [expected], url);
  }
});
