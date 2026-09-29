const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const firebaseConfig = require("./firebase-config");

function allowedEmails(env = process.env) {
  return new Set((env.AUTH_ALLOWED_EMAILS || "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function isConfigured(env = process.env) {
  return Boolean(firebaseConfig.projectId) && allowedEmails(env).size > 0;
}

function deny(status, message) {
  return Object.assign(new Error(message), { status });
}

function checkClaims(claims, env = process.env) {
  if (!isConfigured(env)) {
    throw deny(503, "ログインの設定がまだ完了していません。管理者に確認してください。");
  }
  if (!claims.uid || claims.email_verified !== true) {
    throw deny(403, "確認メールのリンクを開いて、メールアドレスを確認してください。");
  }
  if (!allowedEmails(env).has(String(claims.email || "").toLowerCase())) {
    throw deny(403, "このアカウントには利用権限がありません。管理者に確認してください。");
  }
  return { uid: claims.uid, email: claims.email };
}

async function authorize(request, verifyToken = verifyFirebaseToken, env = process.env) {
  if (!isConfigured(env)) throw deny(503, "ログインの設定がまだ完了していません。管理者に確認してください。");
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || "");
  if (!match) throw deny(401, "ログインしてください。");
  let claims;
  try {
    claims = await verifyToken(match[1]);
  } catch (error) {
    const invalid = new Set([
      "auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired",
      "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"
    ]);
    if (invalid.has(error.code) || !error.code) {
      throw deny(401, "ログインを確認できません。もう一度ログインしてください。");
    }
    throw deny(503, "ログインを確認できませんでした。時間を置いて再実行してください。");
  }
  return checkClaims(claims, env);
}

async function verifyFirebaseToken(token) {
  // Never accept emulator tokens on the production server.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Auth emulator is not supported");
  const app = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId });
  // Signature, issuer, audience and expiry are verified by the Admin SDK.
  return getAuth(app).verifyIdToken(token, true);
}

module.exports = { allowedEmails, isConfigured, checkClaims, authorize };
