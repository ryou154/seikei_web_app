const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

function publicConfig(env = process.env) {
  return {
    apiKey: env.FIREBASE_API_KEY || "",
    authDomain: env.FIREBASE_AUTH_DOMAIN || "",
    projectId: env.FIREBASE_PROJECT_ID || "",
    appId: env.FIREBASE_APP_ID || ""
  };
}

function allowedEmails(env = process.env) {
  return new Set((env.AUTH_ALLOWED_EMAILS || "").split(",")
    .map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function isConfigured(env = process.env) {
  return Object.values(publicConfig(env)).every(Boolean) && allowedEmails(env).size > 0;
}

function checkClaims(claims, env = process.env) {
  if (!claims.email_verified) {
    return { status: 403, error: "確認メールのリンクを開いて、メールアドレスを確認してください。" };
  }
  if (!claims.uid || !allowedEmails(env).has(String(claims.email || "").toLowerCase())) {
    return { status: 403, error: "このアカウントには利用権限がありません。管理者に確認してください。" };
  }
  return { status: 200, user: { uid: claims.uid, email: claims.email } };
}

async function authorize(request, verify, env = process.env) {
  if (!isConfigured(env)) {
    return { status: 503, error: "ログインの設定がまだ完了していません。管理者に確認してください。" };
  }
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || "");
  if (!match) return { status: 401, error: "ログインしてください。" };
  try {
    if (!verify) {
      const app = getApps()[0] || initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
      verify = (token) => getAuth(app).verifyIdToken(token, true);
    }
    return checkClaims(await verify(match[1]), env);
  } catch (error) {
    const invalid = new Set([
      "auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired",
      "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"
    ]);
    if (invalid.has(error.code)) return { status: 401, error: "ログインの有効期限が切れています。もう一度ログインしてください。" };
    return { status: 503, error: "ログインを確認できませんでした。時間を置いて再実行してください。" };
  }
}

module.exports = { publicConfig, allowedEmails, isConfigured, checkClaims, authorize };
