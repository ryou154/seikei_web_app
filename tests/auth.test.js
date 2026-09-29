const test = require("node:test");
const assert = require("node:assert/strict");
const { authorize } = require("../auth-server");
const request = (token = "test-token") => ({ headers: { authorization: `Bearer ${token}` } });

test("missing authorization is rejected before verification", async () => {
  await assert.rejects(authorize({ headers: {} }, () => assert.fail("must not verify")), { status: 401 });
});
test("invalid or expired ID tokens are rejected", async () => {
  await assert.rejects(authorize(request(), async () => { throw new Error("invalid signature"); }), { status: 401 });
});
test("real Firebase verifier rejects a fabricated token", async () => {
  await assert.rejects(authorize(request("not-a-firebase-token")), { status: 401 });
});
test("unverified email cannot use the application", async () => {
  await assert.rejects(authorize(request(), async () => ({ uid: "user1", email: "c3122@oic.jp", email_verified: false })), { status: 403 });
});
test("email verification cannot be a truthy string", async () => {
  await assert.rejects(authorize(request(), async () => ({ uid: "user1", email: "c3122@oic.jp", email_verified: "true" })), { status: 403 });
});
test("verified registered users are accepted", async () => {
  const user = await authorize(request(), async () => ({ uid: "registered", email: "new-user@example.com", email_verified: true }));
  assert.equal(user.uid, "registered");
});
test("all four verified members are accepted, with case-insensitive emails", async () => {
  for (const email of ["c3337@oic.jp", "c3241@oic.jp", "C3122@oic.jp", "c3201@oic.jp"]) {
    const user = await authorize(request(), async () => ({ uid: `uid-${email}`, email, email_verified: true }));
    assert.equal(user.email, email);
    assert.equal(user.uid, `uid-${email}`);
  }
});
