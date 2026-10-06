const { initializeApp, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { Firestore } = require("@google-cloud/firestore");
const firebaseConfig = require("./firebase-config");
const { createStore } = require("./account-store");

const CONFIRMATION = "削除";
const MAX_AUTH_AGE_SECONDS = 5 * 60;
const BODY_LIMIT = 16 * 1024;

class DeleteInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
    throw new DeleteInputError("JSON形式で送信してください。", 415);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let failed = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT && !failed) {
        failed = true;
        reject(new DeleteInputError("リクエストが大きすぎます。", 413));
      } else if (!failed) chunks.push(chunk);
    });
    request.on("end", () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new DeleteInputError("JSONデータが不正です。")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new DeleteInputError("通信が中断されました。")));
  });
}

function createAccountDeleteHandler({
  verifyToken = defaultVerifyToken,
  getStore,
  getBucket = defaultGetBucket,
  deleteUser = defaultDeleteUser,
  now = Date.now
} = {}) {
  let store;
  getStore ||= () => store ||= createStore(new Firestore({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    databaseId: "(default)"
  }));

  return async (request) => {
    try {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== "/api/account" || url.search) return { status: 404, data: { error: "Not found" } };
      if (request.method !== "DELETE") return { status: 405, data: { error: "Method not allowed" } };

      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization || "");
      if (!match) throw new DeleteInputError("ログインしてください。", 401);
      let claims;
      try { claims = await verifyToken(match[1]); }
      catch { throw new DeleteInputError("ログインを確認できません。もう一度ログインしてください。", 401); }

      const authTime = Number(claims?.auth_time);
      const ageSeconds = Math.floor(now() / 1000) - authTime;
      if (!claims?.uid || claims.email_verified !== true) {
        throw new DeleteInputError("ログインを確認できません。", 401);
      }
      if (!Number.isFinite(authTime) || ageSeconds < 0 || ageSeconds > MAX_AUTH_AGE_SECONDS) {
        throw new DeleteInputError("アカウント削除の前に、もう一度ログインしてください。", 401);
      }

      const input = await readJson(request);
      if (input?.confirmation !== CONFIRMATION) {
        throw new DeleteInputError("確認文字を入力してください。");
      }

      // The verified token is the only source of the owner UID.
      const uid = claims.uid;
      const database = getStore();
      await database.history(uid);
      const bucket = getBucket();
      const [files] = await bucket.getFiles({ prefix: `users/${uid}/simulations/` });
      for (const file of files) await file.delete({ ignoreNotFound: true });

      // Keep Authentication until all user data has been removed. Retrying is safe:
      // missing objects and already-removed Firestore documents are harmless.
      await database.deleteSettings(uid);
      await database.deleteHistory(uid);
      await deleteUser(uid);
      return { status: 200, data: { deleted: true } };
    } catch (error) {
      if (error instanceof DeleteInputError) return { status: error.status, data: { error: error.message } };
      return { status: 503, data: { error: "アカウントを削除できませんでした。データは保持されています。時間をおいて再試行してください。" } };
    }
  };
}

async function defaultVerifyToken(token) {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Auth emulator is not supported");
  const app = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId });
  return getAuth(app).verifyIdToken(token);
}

function defaultGetBucket() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${firebaseConfig.projectId}.firebasestorage.app`;
  const app = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId, storageBucket: bucketName });
  return getStorage(app).bucket(bucketName);
}

async function defaultDeleteUser(uid) {
  const app = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId });
  await getAuth(app).deleteUser(uid);
}

module.exports = { createAccountDeleteHandler, MAX_AUTH_AGE_SECONDS, CONFIRMATION };
