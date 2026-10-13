const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const config = require("./firebase-config");

let firebaseAuth;
let refreshedFirebaseAuth;
let refreshedFirebaseApp;
let refreshPromise;
let lastCertificateRefresh = 0;
let refreshAppSequence = 0;

function deny(status, message) {
  return Object.assign(new Error(message), { status });
}

function decodeJwtPart(part) {
  try { return JSON.parse(Buffer.from(part, "base64url").toString("utf8")); }
  catch { return null; }
}

function tokenFailureReason(token, error, code, projectId) {
  const message = typeof error?.message === "string" ? error.message : "";
  if (/incorrect "aud"/i.test(message)) return "project-audience-mismatch";
  if (/incorrect "iss"/i.test(message)) return "project-issuer-mismatch";
  if (/custom token/i.test(message)) return "custom-token-used-as-id-token";
  if (/no "kid"/i.test(message)) return "missing-signing-key-id";
  if (/incorrect algorithm/i.test(message)) return "unsupported-token-algorithm";
  if (/decoding firebase id token failed/i.test(message)) return "malformed-jwt";
  if (/(?:"kid" claim which does not correspond to a known public key|no matching kid)/i.test(message)) return "unknown-signing-key";
  if (/has invalid signature/i.test(message)) return "invalid-signature";
  if (/(?:error fetching (?:public keys for google certs|json web keys)|error in secret or public key callback)/i.test(message)) return "signing-certificate-fetch-error";
  if (/no "sub" \(subject\) claim/i.test(message)) return "missing-subject-claim";
  if (/empty "sub" \(subject\) claim/i.test(message)) return "empty-subject-claim";
  if (/(?:"sub" \(subject\) claim|subject claim) longer than 128 characters/i.test(message)) return "invalid-subject-claim";
  if (code === "auth/id-token-expired") return "expired-id-token";
  if (code === "app/network-error" || code === "app/network-timeout") return "certificate-fetch-network-error";
  if (code === "auth/invalid-credential") return "firebase-project-id-unavailable";
  if (code !== "auth/argument-error" && code !== "auth/invalid-id-token") return "verification-failed";

  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !part)) return "malformed-jwt";
  const header = decodeJwtPart(parts[0]);
  if (!header || typeof header !== "object" || Array.isArray(header)) return "malformed-jwt-header";
  const payload = decodeJwtPart(parts[1]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "malformed-jwt-payload";
  if (typeof header.kid !== "string" || !header.kid) return "missing-signing-key-id";
  if (header.alg !== "RS256") return "unsupported-token-algorithm";
  if (payload.aud !== projectId) return "project-audience-mismatch";
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return "project-issuer-mismatch";
  if (typeof payload.sub !== "string") return "missing-subject-claim";
  if (!payload.sub) return "empty-subject-claim";
  if (payload.sub.length > 128) return "invalid-subject-claim";
  return "unclassified-token-verification-error";
}

async function authorize(request, verifyToken = verifyFirebaseToken, logger = console) {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || "");
  if (!match) throw deny(401, "ログインしてください。");
  let claims;
  try {
    claims = await verifyToken(match[1]);
  } catch (error) {
    const rawCode = typeof error?.code === "string" ? error.code : "unknown";
    const code = /^[a-z][a-z0-9_-]{0,39}\/[a-z0-9_-]{1,60}$/.test(rawCode) ? rawCode : "unknown";
    const reason = tokenFailureReason(match[1], error, code, config.projectId);
    // Keep tokens, UIDs and raw Firebase error text out of logs.
    logger.warn("Firebase ID token verification failed", { code, reason });
    throw deny(401, "ログインを確認できません。もう一度ログインしてください。");
  }
  if (!claims.uid || claims.email_verified !== true) {
    throw deny(403, "確認メールのリンクを開いて、メールアドレスを確認してください。");
  }
  return { uid: claims.uid, email: claims.email };
}

async function verifyFirebaseToken(token) {
  // Never accept emulator tokens on the production server.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Auth emulator is not supported");
  firebaseAuth ||= getAuth(initializeApp({ projectId: config.projectId }));
  // Signature, issuer, audience and expiry are verified by the Admin SDK.
  try {
    return await firebaseAuth.verifyIdToken(token);
  } catch (error) {
    // Firebase rotates signing keys and certificate retrieval can fail briefly.
    // Retry these two key-specific failures with a fresh Admin verifier/cache.
    if (!isSigningKeyCacheError(error)) {
      throw error;
    }
    const now = Date.now();
    const retryAuth = await getRefreshedFirebaseAuth(now);
    const claims = await retryAuth.verifyIdToken(token);
    firebaseAuth = retryAuth;
    return claims;
  }
}

function isSigningKeyCacheError(error) {
  const message = typeof error?.message === "string" ? error.message : "";
  return /(?:"kid" claim which does not correspond to a known public key|no matching kid|error fetching (?:public keys for google certs|json web keys)|error in secret or public key callback)/i.test(message);
}

async function getRefreshedFirebaseAuth(now) {
  if (refreshPromise) return refreshPromise;
  // Reuse the fresh verifier briefly so an invalid-token flood cannot trigger a
  // certificate download for every request. It expires from this cache after a
  // minute, allowing a later key rotation to fetch the current certificates.
  if (refreshedFirebaseAuth && now - lastCertificateRefresh < 60_000) return refreshedFirebaseAuth;
  refreshPromise = (async () => {
    const app = initializeApp({ projectId: config.projectId }, `id-token-key-refresh-${++refreshAppSequence}`);
    const auth = getAuth(app);
    const previousApp = refreshedFirebaseApp;
    refreshedFirebaseApp = app;
    refreshedFirebaseAuth = auth;
    lastCertificateRefresh = Date.now();
    if (previousApp) void previousApp.delete().catch(() => {});
    return auth;
  })();
  try { return await refreshPromise; }
  finally { refreshPromise = undefined; }
}

module.exports = { authorize };
