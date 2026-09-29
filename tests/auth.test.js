const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path");
const { publicConfig, isConfigured, authorize, checkClaims } = require("../auth-server");
const env = {
  FIREBASE_API_KEY: "test-public-key", FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
  FIREBASE_PROJECT_ID: "test", FIREBASE_APP_ID: "test-app",
  AUTH_ALLOWED_EMAILS: " Alice@example.com, BOB@example.com ", GEMINI_API_KEY: "private"
};
const claims = { uid: "alice-id", email: "ALICE@example.com", email_verified: true };
test("public config exposes neither allowlist nor Gemini key", () => {
  assert.deepEqual(Object.keys(publicConfig(env)), ["apiKey", "authDomain", "projectId", "appId"]);
  assert.ok(!JSON.stringify(publicConfig(env)).includes("private"));
});
test("missing configuration and empty allowlist fail closed", async () => {
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured({ ...env, AUTH_ALLOWED_EMAILS: " , " }), false);
  assert.equal((await authorize({ headers: {} }, null, {})).status, 503);
});
test("verified allowlisted email is case insensitive", () => {
  assert.equal(checkClaims(claims, env).status, 200);
});
test("unverified, missing uid and unlisted identities are rejected", () => {
  assert.equal(checkClaims({ ...claims, email_verified: false }, env).status, 403);
  assert.equal(checkClaims({ ...claims, email: "stranger@example.com" }, env).status, 403);
  assert.equal(checkClaims({ ...claims, uid: "" }, env).status, 403);
});
test("authorization must be a bearer token", async () => {
  for (const authorization of [undefined, "", "Basic aaa", "Bearer a b"]) {
    const result = await authorize({ headers: { authorization } }, () => assert.fail("must not verify"), env);
    assert.equal(result.status, 401);
  }
});
test("verified token, not client supplied email, determines identity", async () => {
  const result = await authorize({ headers: { authorization: "Bearer token", email: "stranger@example.com" } },
    async (token) => { assert.equal(token, "token"); return claims; }, env);
  assert.equal(result.user.uid, "alice-id");
});
test("expired and revoked tokens are rejected", async () => {
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/user-disabled"]) {
    const result = await authorize({ headers: { authorization: "Bearer token" } },
      async () => { throw Object.assign(new Error("private"), { code }); }, env);
    assert.equal(result.status, 401);
    assert.ok(!result.error.includes("private"));
  }
});
test("verification outages fail closed", async () => {
  const result = await authorize({ headers: { authorization: "Bearer token" } },
    async () => { throw new Error("credentials unavailable"); }, env);
  assert.equal(result.status, 503);
});
test("HTTP endpoints protect generation and private files", async (t) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."), env: { ...process.env, ...env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true
  });
  t.after(async () => { if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; } });
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server startup timeout")), 10000);
    let output = "";
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", () => { clearTimeout(timer); reject(new Error("server exited")); });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = /http:\/\/localhost:\d+/.exec(output);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
  assert.equal((await fetch(base)).status, 200);
  for (const route of ["/auth.js", "/auth.css", "/account-data.js", "/script.js", "/data/clinics.js"]) {
    assert.equal((await fetch(base + route)).status, 200);
  }
  for (const route of ["/.env", "/server.js", "/auth-server.js", "/account-store.js", "/firestore.rules", "/package-lock.json", "/.git/config", "/node_modules/firebase-admin/package.json"]) {
    assert.equal((await fetch(base + route)).status, 404);
  }
  const config = await fetch(base + "/api/auth/config");
  assert.equal(config.headers.get("cache-control"), "no-store");
  assert.deepEqual(await config.json(), { config: publicConfig(env) });
  assert.equal((await fetch(base + "/api/auth/me")).status, 401);
  assert.equal((await fetch(base + "/api/gemini-edit", { method: "POST", body: "{}" })).status, 401);
});
