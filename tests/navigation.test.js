const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("navigation keeps the menu still, slides page content and resets scroll for clicks, history and authorization", () => {
  const anchors = [], events = {}, slides = [], scrolls = [];
  const location = new URL("http://localhost/app.html#history-title");
  let click, cancelled = 0, focusCount = 0, pushed = 0;
  const motion = { matches: false, addEventListener() {} };
  const history = { pushState(_state, _title, url) { location.href = url; pushed++; } };
  const document = {
    body: { animate() { assert.fail("the body and menu must not animate"); } },
    querySelector() { return { setAttribute() {}, focus(options) {
      assert.equal(options.preventScroll, true); focusCount++;
    } }; },
    getElementById(id) {
      if (id === "page-transition-content") return { animate(frames) {
        slides.push(frames); return { cancel() { cancelled++; } };
      } };
      assert.equal(id, "common-navigation", "navigation must not scroll or focus a lower panel");
      return { replaceChildren() {} };
    },
    createElement(tag) {
      const node = {
        attributes: {}, append() {},
        setAttribute(k, v) { this.attributes[k] = v; },
        removeAttribute(k) { delete this.attributes[k]; },
        addEventListener(name, handler) { if (tag === "nav" && name === "click") click = handler; }
      };
      if (tag === "a") anchors.push(node);
      return node;
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../navigation.js"), "utf8"), {
    document, location, URL,
    window: { history, matchMedia: () => motion,
      scrollTo(options) { assert.equal(options.top, 0); assert.equal(options.left, 0); scrolls.push(options); },
      requestAnimationFrame(fn) { fn(); },
      addEventListener(name, handler) { (events[name] ||= []).push(handler); }
    }
  });
  const fire = name => events[name].forEach(fn => fn());
  const menuAnchors = () => anchors.filter(a => a.textContent);
  const current = () => menuAnchors().find(a => a.attributes["aria-current"] === "page").textContent;
  assert.equal(anchors[0].href, "/home.html");
  assert.equal(anchors[0].attributes["aria-label"], "ホームへ");
  assert.equal(menuAnchors()[0].href, "/login.html");
  assert.equal(menuAnchors()[0].textContent, "ログイン");
  assert.equal(menuAnchors()[1].href, "/home.html");
  assert.equal(menuAnchors()[1].textContent, "ホーム");
  assert.equal(menuAnchors()[3].href, "/history.html");
  assert.equal(history.scrollRestoration, "manual");
  assert.equal(slides.length, 0);
  for (const anchor of menuAnchors()) {
    const [file, id] = anchor.href.split("#");
    const relativeFile = file.replace(/^\//, "");
    const html = fs.readFileSync(path.join(__dirname, "..", relativeFile), "utf8");
    assert.ok(html.indexOf('id="common-navigation"') < html.indexOf('id="page-transition-content"'));
    if (relativeFile === 'app.html') assert.ok(!html.includes('<header class="app-header">'));
    if (relativeFile === 'login.html') assert.ok(html.indexOf('</header>') < html.indexOf('id="page-transition-content"'));
    if (id) assert.ok(html.includes('id="' + id + '"'));
  }
  for (const event of ["pageshow", "app-authorized", "popstate", "hashchange"]) {
    const before = scrolls.length;
    fire(event);
    assert.ok(scrolls.length > before, event + " must return to the top");
    assert.equal(slides.at(-1)[0].transform, "translateX(100vw)");
  }
  assert.equal(cancelled, 3);
  let prevented = 0;
  const event = { target: { closest: () => menuAnchors()[4] }, button: 0,
    preventDefault() { prevented++; } };
  click(event);
  assert.equal(prevented, 1);
  assert.equal(pushed, 1);
  assert.equal(location.hash, "#clinic-title");
  assert.equal(current(), menuAnchors()[4].textContent);
  click(event);
  assert.equal(pushed, 1, "same menu returns to top without duplicate history");
  click({ ...event, ctrlKey: true });
  assert.equal(prevented, 2, "modified clicks keep native browser behavior");
  const before = slides.length;
  motion.matches = true;
  fire("hashchange");
  assert.equal(slides.length, before, "reduced motion disables sliding");
  assert.ok(focusCount > 0);
});
