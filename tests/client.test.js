const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the complete client with fake Firebase/network boundaries. No real emails,
// passwords or accounts are created by these tests.
async function setup(page = "/app.html", configOk = true) {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (id === "app-content" && page === "/login.html") return null;
    if (!nodes.has(id)) nodes.set(id, {
      hidden: id === "app-content", disabled: id === "auth-controls", textContent: "", value: "",
      listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; },
      reportValidity() { return true; }
    });
    return nodes.get(id);
  } };
  const auth = { currentUser: null };
  const state = { redirects: [], reloads: 0, verificationEmails: 0, resets: 0, status: 200, sessionStatuses: [], sessionTokens: [], initializations: 0, signOuts: 0, signOutError: false, googleError: "auth/popup-blocked" };
  let observer;
  const sdk = {
    getAuth: () => auth,
    GoogleAuthProvider: class { setCustomParameters() {} },
    onAuthStateChanged: (_auth, callback) => { observer = callback; },
    reload: async () => {},
    sendEmailVerification: async () => { state.verificationEmails++; },
    sendPasswordResetEmail: async () => { state.resets++; },
    signInWithEmailAndPassword: async () => { throw { code: "auth/invalid-credential" }; },
    signInWithPopup: async () => { throw { code: state.googleError }; },
    signOut: async () => {
      state.signOuts++;
      if (state.signOutError) throw { code: "auth/network-request-failed" };
      auth.currentUser = null;
      observer(null);
    }
  };
  const events = [];
  const windowListeners = {};
  const context = vm.createContext({
    document, Headers, Event, AbortController, setTimeout, clearTimeout,
    location: { pathname: page, replace(url) { state.redirects.push(url); }, reload() { state.reloads++; } },
    window: {
      dispatchEvent(event) { events.push(event.type); for (const listener of windowListeners[event.type] || []) listener(event); },
      addEventListener(type, listener) { (windowListeners[type] ||= []).push(listener); },
      removeEventListener(type, listener) { windowListeners[type] = (windowListeners[type] || []).filter((fn) => fn !== listener); },
      setTimeout, clearTimeout
    },
    importSDK: async (url) => url.endsWith("firebase-app.js") ? { initializeApp: () => { state.initializations++; return {}; } } : sdk,
    fetch: async (url, options = {}) => url === "/api/firebase-config"
      ? { ok: configOk, json: async () => ({}) }
      : (() => {
          const status = url === "/api/session" && state.sessionStatuses.length ? state.sessionStatuses.shift() : state.status;
          return { ok: status === 200, status, json: async () => ({ uid: auth.currentUser?.uid, error: "利用対象ではありません。" }) };
        })()
  });
  const source = fs.readFileSync(path.join(__dirname, "../auth-core.js"), "utf8").replaceAll("import(", "importSDK(");
  await new vm.Script(`(async () => {${source}\n})()`).runInContext(context);
  const loginSource = fs.readFileSync(path.join(__dirname, "../login-page.js"), "utf8");
  new vm.Script(`(async () => {${loginSource}\n})()`).runInContext(context);
  const flush = async () => { await new Promise(setImmediate); };
  return {
    node: document.getElementById, state, events, api: context.window.AppAuth,
    async signedOut() {
      auth.currentUser = null;
      observer(null);
      await flush();
    },
    async login(uid, emailVerified) {
      auth.currentUser = { uid, emailVerified, email: "member@example.com", getIdToken: async (force) => { state.sessionTokens.push(Boolean(force)); return "token"; } };
      observer(auth.currentUser);
      await flush();
    },
    async click(id, type = "click") {
      document.getElementById(id).listeners[type]({ preventDefault() {} });
      await flush();
    }
  };
}

test("unverified account stays locked and can request a verification email", async () => {
  const app = await setup();
  await app.login("alice", false);
  assert.equal(app.node("app-content").hidden, true);
  assert.equal(app.node("verification-actions").hidden, false);
  assert.equal(app.api.uid, null);
  await app.click("verification-send");
  assert.equal(app.state.verificationEmails, 1);
});

test("protected page waits for auth then redirects signed-out visitors", async () => {
  const app = await setup();
  assert.deepEqual(app.state.redirects, []);
  assert.equal(app.node("app-content").hidden, true);
  await app.signedOut();
  assert.deepEqual(app.state.redirects, ["login.html"]);
  assert.equal(app.node("app-content").hidden, true);
  assert.equal(app.api.uid, null);
});

test("signed-out login page stays available without a redirect loop", async () => {
  const app = await setup("/login.html");
  await app.signedOut();
  assert.deepEqual(app.state.redirects, []);
  assert.equal(app.node("auth-signed-out").hidden, false);
  assert.equal(app.node("auth-controls").disabled, false);
});

test("successful login redirects to app only after verification and authorization", async () => {
  const app = await setup("/login.html");
  await app.login("alice", false);
  assert.deepEqual(app.state.redirects, []);
  app.state.status = 403;
  await app.login("alice", true);
  assert.deepEqual(app.state.redirects, []);
  app.state.status = 200;
  await app.login("alice", true);
  assert.deepEqual(app.state.redirects, ["app.html"]);
});

test("a stale token is refreshed once and the Firebase app is initialized once", async () => {
  const app = await setup();
  app.state.sessionStatuses.push(401, 200);
  await app.login("alice", true);
  assert.equal(app.api.uid, "alice");
  assert.equal(app.state.initializations, 1);
  assert.deepEqual(app.state.sessionTokens, [false, true]);
});

test("a Firebase bootstrap failure is reported instead of leaving the login page waiting forever", async () => {
  const app = await setup("/login.html", false);
  await new Promise(setImmediate);
  assert.equal(app.node("auth-controls").disabled, true);
  assert.match(app.node("auth-status").textContent, /読み込めませんでした/);
});

test("restored session stays on protected page, session loss returns to login", async () => {
  const app = await setup();
  await app.login("alice", true);
  assert.deepEqual(app.state.redirects, []);
  assert.equal(app.node("app-content").hidden, false);
  await app.signedOut();
  assert.deepEqual(app.state.redirects, ["login.html"]);
  assert.equal(app.node("app-content").hidden, true);
  assert.equal(app.state.reloads, 0);
});
test("verified but server-denied account stays locked", async () => {
  const app = await setup();
  app.state.status = 403;
  await app.login("outsider", true);
  assert.equal(app.api.uid, null);
  assert.equal(app.node("app-content").hidden, true);
  assert.match(app.node("auth-status").textContent, /利用対象/);
});
test("authorized account opens app; switching accounts locks and reloads it", async () => {
  const app = await setup();
  await app.login("alice", true);
  assert.equal(app.api.uid, "alice");
  assert.equal(app.node("app-content").hidden, false);
  assert.ok(app.events.includes("app-authorized"));
  await app.login("bob", true);
  assert.equal(app.api.uid, null);
  assert.equal(app.node("app-content").hidden, true);
  assert.equal(app.state.reloads, 1);
});
test("API rejection closes the app instead of leaving old results visible", async () => {
  const app = await setup();
  await app.login("alice", true);
  app.state.status = 401;
  await assert.rejects(app.api.fetch("/api/gemini-edit", { method: "POST" }));
  assert.equal(app.api.uid, null);
  assert.equal(app.node("app-content").hidden, true);
});
test("password reset gives a generic response and popup errors are actionable", async () => {
  const app = await setup();
  app.node("auth-email").value = "member@example.com";
  await app.click("password-reset");
  assert.equal(app.state.resets, 1);
  assert.match(app.node("auth-status").textContent, /登録済みのメールアドレスであれば/);
  await app.click("google-login");
  assert.match(app.node("auth-status").textContent, /ポップアップを許可/);
  app.state.googleError = "auth/network-request-failed";
  await app.click("google-login");
  assert.match(app.node("auth-status").textContent, /Chromeの通常タブ/);
  assert.match(app.node("auth-status").textContent, /auth\/network-request-failed/);
});

test("shared logout clears account state and prevents concurrent requests", async () => {
  const app = await setup();
  assert.equal(app.api.signedIn, false);
  assert.equal(app.api.email, "");
  await app.login("alice", true);
  assert.equal(app.api.email, "member@example.com");
  assert.equal(app.api.signedIn, true);
  const pending = app.api.logout();
  assert.equal(app.api.busy, true);
  await app.api.logout();
  await pending;
  assert.equal(app.state.signOuts, 1);
  assert.equal(app.api.busy, false);
  assert.equal(app.api.signedIn, false);
  assert.equal(app.api.email, "");
  assert.equal(app.api.uid, null);
  assert.equal(app.node("app-content").hidden, true);
  assert.ok(app.events.includes("auth-state-changed"));
});

test("logout failure permits retry through the existing account button", async () => {
  const app = await setup();
  await app.login("alice", false);
  app.state.signOutError = true;
  await app.api.logout();
  assert.equal(app.api.signedIn, true);
  assert.equal(app.api.busy, false);
  assert.equal(app.state.reloads, 0);
  assert.ok(app.node("auth-status").textContent.length > 0);
  app.state.signOutError = false;
  await app.click("logout");
  assert.equal(app.state.signOuts, 2);
  assert.equal(app.api.signedIn, false);
});
