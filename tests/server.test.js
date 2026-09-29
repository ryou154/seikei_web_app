const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
let child;
const base = "http://127.0.0.1:31872";
before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: { ...process.env, PORT: "31872", GEMINI_API_KEY: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 10000);
    child.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    child.once("error", reject);
    child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
  });
});
after(() => child?.kill());
test("public configuration has only the four browser fields", async () => {
  const response = await fetch(`${base}/api/firebase-config`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const config = await response.json();
  assert.deepEqual(Object.keys(config).sort(), ["apiKey", "appId", "authDomain", "projectId"]);
  assert.equal(config.projectId, "project-9e754eaa-8fe7-4918-87c");
});
test("session and image generation reject unauthenticated requests", async () => {
  assert.equal((await fetch(`${base}/api/session`)).status, 401);
  const response = await fetch(`${base}/api/gemini-edit`, { method: "POST", body: "not even JSON" });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /ログイン/);
});
test("forged bearer tokens cannot invoke image generation", async () => {
  const response = await fetch(`${base}/api/gemini-edit`, { method: "POST", headers: { Authorization: "Bearer forged" } });
  assert.equal(response.status, 401);
});
test("server source, credentials, Git and dependencies are not public", async () => {
  for (const url of ["/.env", "/.git/config", "/server.js", "/auth-server.js", "/firebase-config.js", "/package.json", "/node_modules/firebase-admin/package.json", "/tests/auth.test.js", "/%2e%2e%5cserver.js"]) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
});
test("login page starts locked and public assets are available", async () => {
  const html = await (await fetch(base)).text();
  assert.match(html, /id="app-content"[^>]*hidden/);
  assert.match(html, /id="google-login"/);
  assert.match(html, /id="password-reset"/);
  for (const file of ["/auth-client.js", "/script.js", "/style.css", "/data/clinics.js", "/face-analysis.js"]) {
    assert.equal((await fetch(base + file)).status, 200);
  }
});
