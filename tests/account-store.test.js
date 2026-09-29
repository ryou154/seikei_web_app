const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createAccountHandler, normalizeSettings, HISTORY_LIMIT } = require("../account-store");
function profile() {
  return {
    gender: "female", style: "natural", eye: "double", nose: "high", face: "vline",
    mouth: "natural", forehead: "none", strength: 50, imageEngine: "gemini", region: "東京",
    budget: "medium", downtime: "standard", clinicPriority: "match", priority: "natural",
    custom: { style: "", eye: "", nose: "", face: "", mouth: "", forehead: "" }
  };
}
function req(method, url, body) {
  const request = new EventEmitter();
  request.method = method;
  request.url = url;
  request.headers = { authorization: "Bearer ok", ...(body === undefined ? {} : { "content-type": "application/json" }) };
  process.nextTick(() => {
    if (body !== undefined) request.emit("data", Buffer.from(JSON.stringify(body)));
    request.emit("end");
  });
  return request;
}
function fakeStore() {
  const state = new Map();
  const key = (uid, kind) => `${uid}:${kind}`;
  return {
    async settings(uid) { return state.get(key(uid, "settings")) || null; },
    async saveSettings(uid, value) { state.set(key(uid, "settings"), value); return value; },
    async deleteSettings(uid) { state.delete(key(uid, "settings")); },
    async history(uid) { return state.get(key(uid, "history")) || []; },
    async saveHistory(uid, value) {
      const current = state.get(key(uid, "history")) || [];
      const next = current.some((item) => item.id === value.id) ? current : [{ ...value, savedAt: "now" }, ...current].slice(0, HISTORY_LIMIT);
      state.set(key(uid, "history"), next);
      return next;
    },
    async deleteHistory(uid, id) {
      const next = id ? (state.get(key(uid, "history")) || []).filter((item) => item.id !== id) : [];
      state.set(key(uid, "history"), next);
      return next;
    }
  };
}
function setup(uid = "user-a") {
  const store = fakeStore();
  const handler = createAccountHandler({
    authenticate: async () => ({ uid, email: `${uid}@example.com` }),
    getStore: () => store
  });
  return { store, handler };
}
test("normalizes only the settings schema", () => {
  const input = { requestText: " 希望 ", profile: { ...profile(), ownerId: "victim" }, ownerId: "victim", image: "secret" };
  const value = normalizeSettings(input);
  assert.equal(value.requestText, "希望");
  assert.equal(value.profile.ownerId, undefined);
  assert.equal(value.image, undefined);
});
test("rejects malformed, oversized and invalid settings", () => {
  assert.throws(() => normalizeSettings({}), /設定データ/);
  assert.throws(() => normalizeSettings({ requestText: "x".repeat(2001), profile: profile() }), /2000/);
  assert.throws(() => normalizeSettings({ requestText: "", profile: { ...profile(), strength: 101 } }), /0〜100/);
  assert.throws(() => normalizeSettings({ requestText: "", profile: { ...profile(), style: "<script>" } }), /選択項目/);
});
test("settings use verified uid and remain isolated", async () => {
  const store = fakeStore();
  const handlerA = createAccountHandler({ authenticate: async () => ({ uid: "a" }), getStore: () => store });
  const handlerB = createAccountHandler({ authenticate: async () => ({ uid: "b" }), getStore: () => store });
  const body = { requestText: "a", profile: profile(), ownerId: "b" };
  assert.equal((await handlerA(req("PUT", "/api/account/settings", body))).status, 200);
  assert.equal((await handlerB(req("GET", "/api/account/settings"))).data.settings, null);
  assert.equal((await handlerA(req("GET", "/api/account/settings"))).data.settings.requestText, "a");
});
test("history supports idempotent save, limit and deletion", async () => {
  const { handler } = setup();
  for (let index = 0; index < HISTORY_LIMIT + 2; index++) {
    const body = { id: `history-${String(index).padStart(16, "0")}`, requestText: String(index), category: "自然", profile: profile() };
    assert.equal((await handler(req("PUT", "/api/account/history", body))).status, 200);
    if (index === 0) await handler(req("PUT", "/api/account/history", body));
  }
  let result = await handler(req("GET", "/api/account/history"));
  assert.equal(result.data.entries.length, HISTORY_LIMIT);
  assert.equal(new Set(result.data.entries.map((item) => item.id)).size, HISTORY_LIMIT);
  const id = result.data.entries[0].id;
  result = await handler(req("DELETE", `/api/account/history/${id}`));
  assert.ok(!result.data.entries.some((item) => item.id === id));
  result = await handler(req("DELETE", "/api/account/history"));
  assert.deepEqual(result.data.entries, []);
});
test("authentication, routes, methods and media type fail closed", async () => {
  const denied = createAccountHandler({ authenticate: async () => { throw Object.assign(new Error("denied"), { status: 401 }); }, getStore: () => assert.fail() });
  assert.equal((await denied(req("GET", "/api/account/history"))).status, 401);
  const { handler } = setup();
  assert.equal((await handler(req("GET", "/api/account/unknown"))).status, 404);
  assert.equal((await handler(req("POST", "/api/account/history"))).status, 405);
  assert.equal((await handler(req("GET", "/api/account/history?uid=victim"))).status, 404);
  const noType = req("PUT", "/api/account/settings");
  noType.headers = { authorization: "Bearer ok" };
  assert.equal((await handler(noType)).status, 415);
});
test("database failures return a generic error", async () => {
  const handler = createAccountHandler({
    authenticate: async () => ({ uid: "a" }),
    getStore: () => ({ history: async () => { throw new Error("private details"); } })
  });
  const result = await handler(req("GET", "/api/account/history"));
  assert.equal(result.status, 503);
  assert.ok(!result.data.error.includes("private details"));
});
