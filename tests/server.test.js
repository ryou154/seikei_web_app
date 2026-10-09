const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
let child;
let base;
before(async () => {
  child = spawn(process.execPath, ["server.js"], {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env, PORT: "0", GEMINI_API_KEY: "",
      AUTH_ALLOWED_EMAILS: "c3337@oic.jp,c3241@oic.jp,c3122@oic.jp,c3201@oic.jp"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 10000);
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (!match) return;
      base = `http://127.0.0.1:${match[1]}`;
      clearTimeout(timer);
      resolve();
    });
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

test("history read, save and deletion reject missing or forged authentication over HTTP", async () => {
  for (const authorization of [null, "Bearer forged"]) {
    for (const [method, route] of [
      ["GET", "/api/session"],
      ["GET", "/api/account/history"],
      ["GET", "/api/account/profile"],
      ["PUT", "/api/account/history"],
      ["DELETE", "/api/account/history"],
      ["DELETE", "/api/account"],
      ["DELETE", "/api/account/history/history-0000000000000001"]
    ]) {
      const headers = authorization ? { Authorization: authorization } : {};
      const response = await fetch(base + route, { method, headers,
        ...(method === "PUT" ? { body: "invalid JSON" } : {}) });
      assert.equal(response.status, 401, `${method} ${route} ${authorization}`);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const data = await response.json();
      assert.equal(typeof data.error, "string");
      assert.equal(data.entries, undefined);
    }
  }
});
test("server source, credentials, Git and dependencies are not public", async () => {
  for (const url of ["/.env", "/.env.example", "/.git/config", "/server.js", "/server.js?download=1", "/auth-server.js", "/account-store.js", "/image-store.js", "/firestore.rules", "/firebase-config.js", "/package.json", "/node_modules/firebase-admin/package.json", "/tests/auth.test.js", "/tests/manual/responsive-preview.cjs", "/%2e%2e%5cserver.js"]) {
    assert.equal((await fetch(base + url)).status, 404, url);
  }
});
test("login page starts locked and public assets are available", async () => {
  const index = await (await fetch(base)).text();
  const login = await (await fetch(`${base}/login.html`)).text();
  const home = await (await fetch(`${base}/home.html`)).text();
  const app = await (await fetch(`${base}/app.html`)).text();
  const history = await (await fetch(`${base}/history.html`)).text();
  const mypage = await (await fetch(`${base}/mypage.html`)).text();
  assert.match(index, /location\.replace\("\/login\.html"\)/);
  assert.match(login, /id="google-login"/);
  assert.match(login, /id="password-reset"/);
  assert.match(app, /<main\b[^>]*id="app-content"[^>]*\bhidden\b/);
  assert.match(home, /<main\b[^>]*id="app-content"[^>]*\bhidden\b/);
  assert.match(home, /id="prefecture-select"/);
  assert.match(home, /id="recent-history"/);
  assert.match(home, /id="local-clinics"/);
  assert.match(history, /<main\b[^>]*id="app-content"[^>]*\bhidden\b/);
  assert.match(history, /id="history-list"/);
  assert.match(history, /src="auth-core\.js"/);
  assert.match(mypage, /<h1>マイページ<\/h1>/);
  assert.match(mypage, /src="mypage\.js"/);
  for (const html of [login, home, app, history, mypage]) {
    assert.match(html, /id="common-navigation"/);
    assert.match(html, /src="navigation\.js"/);
    assert.match(html, /href="navigation\.css"/);
  }
  for (const file of ["/auth-client.js", "/auth-core.js", "/login-page.js", "/account-data.js", "/home.js", "/home.css", "/history-page.js", "/history-page.css", "/script.js", "/style.css", "/navigation.js", "/navigation.css", "/mypage.js", "/mypage.css", "/mypage-model.js", "/data/clinics.js", "/face-analysis.js"]) {
    assert.equal((await fetch(base + file)).status, 200);
  }
  assert.equal((await fetch(`${base}/account-delete.js`)).status, 404);
});
