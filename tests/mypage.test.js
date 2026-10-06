const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const model = require("../mypage-model");

test("display names are trimmed and limited to 1 through 50 characters", () => {
  assert.equal(model.validateDisplayName("  ももか  "), "ももか");
  assert.equal(model.validateDisplayName("   "), null);
  assert.equal(model.validateDisplayName("あ".repeat(50)), "あ".repeat(50));
  assert.equal(model.validateDisplayName("あ".repeat(51)), null);
});

test("Google-only users do not get password controls while password users do", () => {
  assert.equal(model.usesPassword([{ providerId: "google.com" }]), false);
  assert.equal(model.usesPassword([{ providerId: "password" }]), true);
  assert.equal(model.usesPassword([{ providerId: "google.com" }, { providerId: "password" }]), true);
});

test("new password mismatch is detected before the Firebase update call", () => {
  assert.equal(model.passwordMismatch("password123", "password321"), true);
  assert.equal(model.passwordMismatch("password123", "password123"), false);
});

test("saved image totals count Before and After independently", () => {
  assert.equal(model.imageCount([
    { result: { images: { before: true, after: true } } },
    { result: { images: { before: true, after: false } } },
    { result: { images: { before: false, after: false } } },
    {}
  ]), 3);
});

test("mypage is protected by the shared auth client and has no owner ID input", () => {
  const html = fs.readFileSync(path.join(__dirname, "../mypage.html"), "utf8");
  const login = fs.readFileSync(path.join(__dirname, "../login.html"), "utf8");
  const app = fs.readFileSync(path.join(__dirname, "../app.html"), "utf8");
  const auth = fs.readFileSync(path.join(__dirname, "../auth-core.js"), "utf8");
  assert.match(html, /<main\b[^>]*id="app-content"[^>]*\bhidden\b/);
  assert.match(auth, /if \(main\) location\.replace\("login\.html"\)/);
  assert.match(html, /src="auth-core\.js"/);
  assert.doesNotMatch(html, /google-login|email-login-form|password-reset/);
  assert.match(login, /src="login-page\.js"/);
  assert.doesNotMatch(app, /google-login|email-login-form|password-reset/);
  assert.doesNotMatch(app, /src="login-page\.js"/);
  assert.match(html, /id="account-email"[^>]*readonly/);
  assert.doesNotMatch(html, /name="(?:uid|ownerId|userId)"/i);
  assert.match(html, /maxlength="50"/);
  assert.match(html, /role="status" aria-live="polite"/);
});
