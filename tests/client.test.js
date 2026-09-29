const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the complete client with fake Firebase/network boundaries. No real emails,
// passwords or accounts are created by these tests.
async function setup() {
  const nodes = new Map();
  const document = { getElementById(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: id === "app-content", disabled: false, textContent: "", value: "",
      listeners: {}, addEventListener(event, fn) { this.listeners[event] = fn; },
      reportValidity() { return true; }
    });
    return nodes.get(id);
  } };
  const auth = { currentUser: null };
  const state = { reloads: 0, verificationEmails: 0, resets: 0, status: 200 };
  let observer;
  const sdk = {
    getAuth: () => auth,
    GoogleAuthProvider: class { setCustomParameters() {} },
    onAuthStateChanged: (_auth, callback) => { observer = callback; },
    reload: async () => {},
    sendEmailVerification: async () => { state.verificationEmails++; },
    sendPasswordResetEmail: async () => { state.resets++; },
    signInWithEmailAndPassword: async () => { throw { code: "auth/invalid-credential" }; },
    signInWithPopup: async () => { throw { code: "auth/popup-blocked" }; },
    signOut: async () => { auth.currentUser = null; observer(null); }
  };
  const events = [];
  const context = vm.createContext({
    document, Headers, Event,
    location: { reload() { state.reloads++; } },
    window: { dispatchEvent(event) { events.push(event.type); } },
    importSDK: async (url) => url.endsWith("firebase-app.js") ? { initializeApp: () => ({}) } : sdk,
    fetch: async (url) => url === "/api/firebase-config"
      ? { ok: true, json: async () => ({}) }
      : { ok: state.status === 200, status: state.status, json: async () => ({ uid: auth.currentUser?.uid, error: "利用対象ではありません。" }) }
  });
  const source = fs.readFileSync(path.join(__dirname, "../auth-client.js"), "utf8").replaceAll("import(", "importSDK(");
  await new vm.Script(`(async () => {${source}\n})()`).runInContext(context);
  const flush = async () => { await new Promise(setImmediate); };
  return {
    node: document.getElementById, state, events, api: context.window.AppAuth,
    async login(uid, emailVerified) {
      auth.currentUser = { uid, emailVerified, email: "member@example.com", getIdToken: async () => "token" };
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
});
