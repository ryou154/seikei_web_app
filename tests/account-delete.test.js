const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { createAccountDeleteHandler } = require("../account-delete");

function makeRequest({ method = "DELETE", authorization = "Bearer valid-token", body = { confirmation: "削除" }, url = "/api/account" } = {}) {
  const request = Readable.from([Buffer.from(JSON.stringify(body))]);
  request.method = method;
  request.url = url;
  request.headers = { authorization, "content-type": "application/json" };
  return request;
}

const now = 1_800_000_000_000;
const freshClaims = { uid: "verified-user", email_verified: true, auth_time: Math.floor(now / 1000) - 60 };

test("account deletion rejects requests without a bearer token", async () => {
  let verified = false;
  const handler = createAccountDeleteHandler({ verifyToken: async () => { verified = true; } });
  const result = await handler(makeRequest({ authorization: "" }));
  assert.equal(result.status, 401);
  assert.equal(verified, false);
});

test("account deletion rejects auth_time older than five minutes", async () => {
  const handler = createAccountDeleteHandler({
    verifyToken: async () => ({ ...freshClaims, auth_time: Math.floor(now / 1000) - 301 }),
    now: () => now
  });
  const result = await handler(makeRequest());
  assert.equal(result.status, 401);
  assert.match(result.data.error, /もう一度ログイン/);
});

test("account deletion uses the token UID and removes Storage, Firestore, then Authentication", async () => {
  const calls = [];
  const handler = createAccountDeleteHandler({
    verifyToken: async (token) => { calls.push(`verify:${token}`); return freshClaims; },
    now: () => now,
    getStore: () => ({
      async history(uid) { calls.push(`history:${uid}`); return [{ id: "entry" }]; },
      async deleteSettings(uid) { calls.push(`settings:${uid}`); },
      async deleteHistory(uid) { calls.push(`delete-history:${uid}`); }
    }),
    getBucket: () => ({
      async getFiles({ prefix }) {
        calls.push(`storage-list:${prefix}`);
        return [[{ async delete(options) { assert.equal(options.ignoreNotFound, true); calls.push("storage-delete"); } }]];
      }
    }),
    async deleteUser(uid) { calls.push(`auth:${uid}`); }
  });
  const result = await handler(makeRequest({ body: { confirmation: "削除", uid: "forged-user", ownerId: "forged-user" } }));
  assert.deepEqual(result, { status: 200, data: { deleted: true } });
  assert.deepEqual(calls, [
    "verify:valid-token", "history:verified-user", "storage-list:users/verified-user/simulations/",
    "storage-delete", "settings:verified-user", "delete-history:verified-user", "auth:verified-user"
  ]);
});

test("Storage failure keeps Firestore metadata and Authentication available for retry", async () => {
  const calls = [];
  const handler = createAccountDeleteHandler({
    verifyToken: async () => freshClaims,
    now: () => now,
    getStore: () => ({
      async history() { calls.push("history"); return []; },
      async deleteSettings() { calls.push("settings"); },
      async deleteHistory() { calls.push("history-delete"); }
    }),
    getBucket: () => ({ async getFiles() { calls.push("storage"); throw new Error("private bucket detail"); } }),
    async deleteUser() { calls.push("auth"); }
  });
  const result = await handler(makeRequest());
  assert.equal(result.status, 503);
  assert.equal(result.data.error.includes("private bucket detail"), false);
  assert.deepEqual(calls, ["history", "storage"]);
});

test("account deletion requires the exact confirmation and a verified email", async () => {
  const handler = createAccountDeleteHandler({
    verifyToken: async () => ({ ...freshClaims, email_verified: false }),
    now: () => now
  });
  assert.equal((await handler(makeRequest())).status, 401);

  const recent = createAccountDeleteHandler({
    verifyToken: async () => freshClaims,
    now: () => now
  });
  const result = await recent(makeRequest({ body: { confirmation: "削除します" } }));
  assert.equal(result.status, 400);
});
