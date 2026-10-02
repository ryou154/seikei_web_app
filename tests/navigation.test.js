const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("navigation destinations exist and a protected fragment is focused only after unlock", () => {
  const root = path.join(__dirname, "..");
  const anchors = [];
  const events = {};
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
      const node = { setAttribute() {}, append() {}, addEventListener() {} };
      if (tag === "a") anchors.push(node);
      return node;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "navigation.js"), "utf8"), {
    document, URL,
    location: { href: "http://localhost/app.html#history-title", pathname: "/app.html", hash: "#history-title" },
    window: { addEventListener(name, handler) { events[name] = handler; } }
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
  events["app-authorized"]();
  assert.equal(focused, 1);
  assert.equal(scrolled, 1);
  events.hashchange();
  assert.equal(focused, 2);
});
