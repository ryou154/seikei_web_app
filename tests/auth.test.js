const test = require("node:test");
const assert = require("node:assert/strict");
const { authorize } = require("../auth-server");
process.env.AUTH_ALLOWED_EMAILS = "c3337@oic.jp,c3241@oic.jp,c3122@oic.jp,c3201@oic.jp";
const request = (token = "test-token") => ({ headers: { authorization: `Bearer ${token}` } });
const quietLogger = { warn() {} };

test("missing authorization is rejected before verification", async () => {
  await assert.rejects(authorize({ headers: {} }, () => assert.fail("must not verify")), { status: 401 });
});
test("invalid or expired ID tokens are rejected", async () => {
  await assert.rejects(authorize(request(), async () => { throw new Error("invalid signature"); }, quietLogger), { status: 401 });
});
test("real Firebase verifier rejects a fabricated token", async () => {
  await assert.rejects(authorize(request("not-a-firebase-token"), undefined, quietLogger), { status: 401 });
});

test("expired-token SDK errors become a generic 401", async () => {
  await assert.rejects(authorize(request(), async () => {
    throw Object.assign(new Error("private token details"), { code: "auth/id-token-expired" });
  }, quietLogger), (error) => error.status === 401 && !error.message.includes("private token details"));
});

test("token verification diagnostics log only a sanitized error code", async () => {
  const logs = [];
  const logger = { warn(...args) { logs.push(args); } };
  await assert.rejects(authorize(request("secret-id-token"), async () => {
    throw Object.assign(new Error("raw Firebase details secret-id-token"), { code: "auth/id-token-expired" });
  }, logger), { status: 401 });
  assert.deepEqual(logs, [["Firebase ID token verification failed", { code: "auth/id-token-expired", reason: "expired-id-token" }]]);
  assert.equal(JSON.stringify(logs).includes("secret-id-token"), false);

  const malformedLogs = [];
  await assert.rejects(authorize(request(), async () => {
    throw Object.assign(new Error("sensitive"), { code: "auth/bad token" });
  }, { warn(...args) { malformedLogs.push(args); } }), { status: 401 });
  assert.deepEqual(malformedLogs, [["Firebase ID token verification failed", { code: "unknown", reason: "verification-failed" }]]);
});

test("token diagnostics classify project mismatches without exposing Firebase messages", async () => {
  const logs = [];
  await assert.rejects(authorize(request("private-token"), async () => {
    throw Object.assign(new Error('Firebase ID token has incorrect "aud" (audience) claim. Expected "private-project".'), { code: "auth/argument-error" });
  }, { warn(...args) { logs.push(args); } }), { status: 401 });
  assert.deepEqual(logs, [["Firebase ID token verification failed", {
    code: "auth/argument-error", reason: "project-audience-mismatch"
  }]]);
  assert.equal(JSON.stringify(logs).includes("private-project"), false);
});

test("argument-error diagnostics distinguish malformed and wrong-project JWTs safely", async () => {
  const projectId = "project-9e754eaa-8fe7-4918-87c";
  const makeJwt = (payload, header = { alg: "RS256", kid: "test-key" }) => [header, payload, "signature"]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
  for (const [token, expectedReason] of [
    ["not-a-jwt", "malformed-jwt"],
    [makeJwt({ aud: "different-project", iss: "https://securetoken.google.com/different-project", sub: "user" }), "project-audience-mismatch"],
    [makeJwt({ aud: projectId, iss: `https://securetoken.google.com/${projectId}` }), "missing-subject-claim"]
  ]) {
    const logs = [];
    await assert.rejects(authorize(request(token), async () => {
      throw Object.assign(new Error("token rejected"), { code: "auth/argument-error" });
    }, { warn(...args) { logs.push(args); } }), { status: 401 });
    assert.equal(logs[0][1].reason, expectedReason);
    assert.equal(JSON.stringify(logs).includes(token), false);
  }
});

test("argument-error diagnostics identify stale signing keys and bad signatures", async () => {
  const projectId = "project-9e754eaa-8fe7-4918-87c";
  const token = [
    { alg: "RS256", kid: "test-key" },
    { aud: projectId, iss: `https://securetoken.google.com/${projectId}`, sub: "user" },
    "signature"
  ].map((part) => Buffer.from(JSON.stringify(part)).toString("base64url")).join(".");
  for (const [message, expectedReason] of [
    ['Firebase ID token has "kid" claim which does not correspond to a known public key.', "unknown-signing-key"],
    ["Firebase ID token has invalid signature.", "invalid-signature"],
    ["Error fetching public keys for Google certs: temporary network failure", "signing-certificate-fetch-error"]
  ]) {
    const logs = [];
    await assert.rejects(authorize(request(token), async () => {
      throw Object.assign(new Error(message), { code: "auth/argument-error" });
    }, { warn(...args) { logs.push(args); } }), { status: 401 });
    assert.equal(logs[0][1].reason, expectedReason);
  }
});

test("malformed authorization is rejected before token verification", async () => {
  for (const authorization of ["Basic abc", "Bearer", "Bearer a b", "Bearer "]) {
    await assert.rejects(authorize({ headers: { authorization } }, () => assert.fail("must not verify")), { status: 401 });
  }
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
