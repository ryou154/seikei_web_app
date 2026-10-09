const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("history page uses shared authentication and keeps user data private", () => {
  const html = read("history.html");
  const source = read("history-page.js");
  assert.match(html, /<main\b[^>]*id="app-content"[^>]*\bhidden\b/);
  assert.match(html, /src="auth-core\.js"/);
  assert.doesNotMatch(html, /google-login|email-login-form|auth-password/);
  assert.match(source, /const data = await api\("\/api\/account\/history"\)/);
  assert.match(source, /encodeURIComponent\(entry\.id\)/);
  assert.doesNotMatch(source, /innerHTML|ownerId|userId|localStorage/);
});

test("history settings handoff is restored only after the protected app loads", () => {
  const app = read("app.html");
  const history = read("history-page.js");
  const home = read("home.js");
  assert.match(history, /sessionStorage\.setItem\(HANDOFF_KEY/);
  assert.match(app, /const historyHandoffKey = "meylon-history-settings"/);
  assert.match(app, /await import\("\.\/script\.js"\);\s*restoreHistorySettings\(\)/);
  assert.match(app, /sessionStorage\.removeItem\(historyHandoffKey\)/);
  assert.match(home, /link\.href = "\/history\.html"/);
});

test("simulation page saves results without duplicating the history browser", () => {
  const app = read("app.html");
  const accountData = read("account-data.js");
  assert.match(app, /id="save-status"/);
  assert.doesNotMatch(app, /id="history-list"|id="history-reload"|id="clear-history-button"/);
  assert.match(accountData, /controls\.saveStatus = document\.getElementById\("save-status"\)/);
  assert.doesNotMatch(accountData, /document\.getElementById\("history-reload"\)/);
});

test("history page translates stored option values into Japanese labels", () => {
  const source = read("history-page.js");
  assert.match(source, /kawaii: "かわいい系"/);
  assert.match(source, /under20: "20万円未満"/);
  assert.match(source, /displayOption\("budget", "", profile\.budget\)/);
  assert.match(source, /\["変更前", result\.beforeScore\]/);
  assert.doesNotMatch(source, /\["Before", result\.beforeScore\]/);
});

test("history images keep the before then after order regardless of fetch timing", () => {
  const source = read("history-page.js");
  assert.match(source, /const available = \["before", "after"\]\.filter/);
  assert.match(source, /imageArea\.append\(\.\.\.items\.map\(\(\{ element \}\) => element\)\)/);
  assert.doesNotMatch(source, /imageArea\.append\(figure\)/);
});
