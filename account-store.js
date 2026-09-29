const { Firestore } = require("@google-cloud/firestore");
const { authorize } = require("./auth-server");
const PARTS = ["style", "eye", "nose", "face", "mouth", "forehead"];
const FIELDS = ["gender", ...PARTS, "imageEngine", "budget", "downtime", "clinicPriority", "priority"];
const HISTORY_LIMIT = 10;
class InputError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }
function object(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function text(value, max) {
  if (typeof value !== "string" || value.length > max) throw new InputError(`入力文字数は${max}文字以内にしてください。`);
  return value.trim();
}
function normalizeSettings(input) {
  if (!object(input) || !object(input.profile)) throw new InputError("設定データが不正です。");
  const source = input.profile;
  const profile = {};
  for (const key of FIELDS) {
    const value = text(source[key], 40);
    if (!/^[a-z0-9_-]*$/.test(value)) throw new InputError("選択項目が不正です。");
    profile[key] = value;
  }
  if (typeof source.strength !== "number" || !Number.isFinite(source.strength) || source.strength < 0 || source.strength > 100) {
    throw new InputError("変化の強さは0〜100で指定してください。");
  }
  profile.strength = source.strength;
  profile.region = text(source.region, 200);
  if (!object(source.custom)) throw new InputError("自由入力が不正です。");
  profile.custom = Object.fromEntries(PARTS.map((key) => [key, text(source.custom[key], 500)]));
  return { requestText: text(input.requestText, 2000), profile };
}
function validId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(id)) throw new InputError("履歴IDが不正です。");
  return id;
}
function createStore(db) {
  function ref(uid, name) {
    if (typeof uid !== "string" || !uid || uid.includes("/")) throw new InputError("利用者IDが不正です。");
    return db.collection("users").doc(uid).collection("private").doc(name);
  }
  return {
    async settings(uid) { return (await ref(uid, "settings").get()).data()?.settings || null; },
    async saveSettings(uid, settings) {
      await ref(uid, "settings").set({ schemaVersion: 1, settings, updatedAt: new Date().toISOString() });
      return settings;
    },
    async deleteSettings(uid) { await ref(uid, "settings").delete(); },
    async history(uid) { return (await ref(uid, "history").get()).data()?.entries || []; },
    async saveHistory(uid, entry) {
      const target = ref(uid, "history");
      return db.runTransaction(async (tx) => {
        const entries = (await tx.get(target)).data()?.entries || [];
        // A stable request ID makes a retry safe after a lost response.
        if (entries.some((item) => item.id === entry.id)) return entries;
        const next = [{ ...entry, savedAt: new Date().toISOString() }, ...entries].slice(0, HISTORY_LIMIT);
        tx.set(target, { schemaVersion: 1, entries: next });
        return next;
      });
    },
    async deleteHistory(uid, id) {
      const target = ref(uid, "history");
      return db.runTransaction(async (tx) => {
        const entries = (await tx.get(target)).data()?.entries || [];
        const next = id ? entries.filter((entry) => entry.id !== id) : [];
        if (next.length) tx.set(target, { schemaVersion: 1, entries: next });
        else tx.delete(target);
        return next;
      });
    }
  };
}
function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) throw new InputError("JSON形式で送信してください。", 415);
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [], failed = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > 32768) { failed = true; chunks = []; reject(new InputError("保存データが大きすぎます。", 413)); }
      if (!failed) chunks.push(chunk);
    });
    request.on("end", () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new InputError("JSONデータが不正です。")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new InputError("通信が中断されました。")));
  });
}
function createAccountHandler({ authenticate = authorize, getStore } = {}) {
  let store;
  getStore ||= () => (store ||= createStore(new Firestore({ projectId: process.env.FIREBASE_PROJECT_ID, databaseId: "(default)" })));
  return async (request) => {
    try {
      const access = await authenticate(request);
      const url = new URL(request.url, "http://localhost");
      const match = /^\/api\/account\/(settings|history)(?:\/([a-zA-Z0-9-]{16,64}))?$/.exec(url.pathname);
      if (!match || url.search || (match[1] === "settings" && match[2])) return { status: 404, data: { error: "Not found" } };
      const [, resource, id] = match;
      const method = request.method;
      if (!["GET", "PUT", "DELETE"].includes(method) || (id && method !== "DELETE")) return { status: 405, data: { error: "Method not allowed" } };
      let payload;
      if (method === "PUT") {
        const input = await readBody(request);
        payload = normalizeSettings(input);
        if (resource === "history") payload = { ...payload, id: validId(input.id), category: text(input.category, 500) };
      }
      // Never take an owner ID from the body, query string or route.
      const uid = access.uid;
      const database = getStore();
      if (resource === "settings") {
        if (method === "GET") return { status: 200, data: { settings: await database.settings(uid) } };
        if (method === "PUT") return { status: 200, data: { settings: await database.saveSettings(uid, payload) } };
        await database.deleteSettings(uid);
        return { status: 200, data: { settings: null } };
      }
      const entries = method === "GET" ? await database.history(uid)
        : method === "PUT" ? await database.saveHistory(uid, payload)
          : await database.deleteHistory(uid, id);
      return { status: 200, data: { entries, limit: HISTORY_LIMIT } };
    } catch (error) {
      if (error instanceof InputError || error?.status) return { status: error.status, data: { error: error.message } };
      return { status: 503, data: { error: "クラウド保存に接続できませんでした。再試行してください。続く場合はFirestoreの接続設定・権限を確認してください。" } };
    }
  };
}
module.exports = { createStore, createAccountHandler, normalizeSettings, HISTORY_LIMIT };
