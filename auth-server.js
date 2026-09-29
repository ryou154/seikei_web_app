const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const config = require("./firebase-config");

const allowedEmails = new Set([
  "c3337@oic.jp", "c3241@oic.jp", "c3122@oic.jp", "c3201@oic.jp"
]);
let firebaseAuth;

function deny(status, message) {
  return Object.assign(new Error(message), { status });
}

async function authorize(request, verifyToken = verifyFirebaseToken) {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || "");
  if (!match) throw deny(401, "ログインしてください。");
  let claims;
  try {
    claims = await verifyToken(match[1]);
  } catch {
    throw deny(401, "ログインを確認できません。もう一度ログインしてください。");
  }
  if (!claims.uid || claims.email_verified !== true) {
    throw deny(403, "確認メールのリンクを開いて、メールアドレスを確認してください。");
  }
  if (!allowedEmails.has(String(claims.email || "").toLowerCase())) {
    throw deny(403, "このアカウントは利用対象ではありません。担当者に確認してください。");
  }
  return { uid: claims.uid, email: claims.email };
}

async function verifyFirebaseToken(token) {
  // Never accept emulator tokens on the production server.
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Auth emulator is not supported");
  firebaseAuth ||= getAuth(initializeApp({ projectId: config.projectId }));
  // Signature, issuer, audience and expiry are verified by the Admin SDK.
  return firebaseAuth.verifyIdToken(token);
}

module.exports = { authorize };
