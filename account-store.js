const { Firestore } = require("@google-cloud/firestore");
const { authorize } = require("./auth-server");
const PARTS = ["style", "eye", "nose", "face", "mouth", "forehead"];
const FIELDS = ["gender", ...PARTS, "imageEngine", "budget", "downtime", "clinicPriority", "priority"];
const HISTORY_LIMIT = 10;
const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];
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
function normalizeProfile(input) {
  if (!object(input)) throw new InputError("プロフィールデータが不正です。");
  if (typeof input.residencePrefecture !== "string") throw new InputError("都道府県を確認してください。");
  const residencePrefecture = input.residencePrefecture.trim();
  if (residencePrefecture.length > 4) throw new InputError("都道府県を確認してください。");
  if (residencePrefecture && !PREFECTURES.includes(residencePrefecture)) {
    throw new InputError("都道府県を確認してください。");
  }
  return { residencePrefecture };
}
function optionalScore(value) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new InputError("顔バランススコアが不正です。");
  return value;
}
function normalizeResult(input) {
  const source = object(input) ? input : {};
  const clinicNames = Array.isArray(source.clinicNames) ? source.clinicNames : [];
  if (clinicNames.length > 5) throw new InputError("クリニック候補は5件以内にしてください。");
  const generationStatus = text(source.generationStatus || "unknown", 30);
  if (!["gemini", "local", "fallback", "unknown"].includes(generationStatus)) {
    throw new InputError("画像生成状態が不正です。");
  }
  return {
    beforeScore: optionalScore(source.beforeScore),
    afterScore: optionalScore(source.afterScore),
    analysis: text(source.analysis || "", 8000),
    clinicNames: clinicNames.map((name) => text(name, 200)),
    generationModel: text(source.generationModel || "", 100),
    generationStatus,
    images: { before: false, after: false }
  };
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
    async profile(uid) { return (await ref(uid, "profile").get()).data()?.profile || null; },
    async saveProfile(uid, profile) {
      await ref(uid, "profile").set({ schemaVersion: 1, profile, updatedAt: new Date().toISOString() });
      return profile;
    },
    async deleteProfile(uid) { await ref(uid, "profile").delete(); },
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
    },
    async updateHistory(uid, id, patch) {
      const target = ref(uid, "history");
      return db.runTransaction(async (tx) => {
        const entries = (await tx.get(target)).data()?.entries || [];
        const index = entries.findIndex((entry) => entry.id === id);
        if (index < 0) return null;
        const next = entries.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry);
        tx.set(target, { schemaVersion: 1, entries: next });
        return next[index];
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
function createAccountHandler({ authenticate = authorize, getStore, deleteImages = async () => {} } = {}) {
  let store;
  getStore ||= () => (store ||= createStore(new Firestore({ projectId: process.env.FIREBASE_PROJECT_ID, databaseId: "(default)" })));
  return async (request) => {
    try {
      const access = await authenticate(request);
      const url = new URL(request.url, "http://localhost");
      const match = /^\/api\/account\/(profile|settings|history)(?:\/([a-zA-Z0-9-]{16,64}))?$/.exec(url.pathname);
      if (!match || url.search || (["profile", "settings"].includes(match[1]) && match[2])) return { status: 404, data: { error: "Not found" } };
      const [, resource, id] = match;
      const method = request.method;
      if (!["GET", "PUT", "DELETE"].includes(method) || (id && method !== "DELETE")) return { status: 405, data: { error: "Method not allowed" } };
      let payload;
      if (method === "PUT") {
        const input = await readBody(request);
        payload = resource === "profile" ? normalizeProfile(input) : normalizeSettings(input);
        if (resource === "history") payload = {
          ...payload, id: validId(input.id), category: text(input.category, 500),
          result: normalizeResult(input.result)
        };
      }
      // Never take an owner ID from the body, query string or route.
      const uid = access.uid;
      const database = getStore();
      if (resource === "profile") {
        if (method === "GET") return { status: 200, data: { profile: await database.profile(uid) } };
        if (method === "PUT") return { status: 200, data: { profile: await database.saveProfile(uid, payload) } };
        await database.deleteProfile(uid);
        return { status: 200, data: { profile: null } };
      }
      if (resource === "settings") {
        if (method === "GET") return { status: 200, data: { settings: await database.settings(uid) } };
        if (method === "PUT") return { status: 200, data: { settings: await database.saveSettings(uid, payload) } };
        await database.deleteSettings(uid);
        return { status: 200, data: { settings: null } };
      }
      let entries;
      if (method === "GET") {
        entries = await database.history(uid);
      } else if (method === "PUT") {
        const previous = await database.history(uid);
        entries = await database.saveHistory(uid, payload);
        const keptIds = new Set(entries.map((entry) => entry.id));
        try {
          await deleteImages(uid, previous.filter((entry) => !keptIds.has(entry.id)));
        } catch (error) {
          console.error("Failed to clean up evicted history images", error);
        }
      } else {
        const previous = await database.history(uid);
        const removed = id ? previous.filter((entry) => entry.id === id) : previous;
        entries = await database.deleteHistory(uid, id);
        try { await deleteImages(uid, removed); }
        catch (error) { console.error("Failed to clean up deleted history images", error); }
      }
      return { status: 200, data: { entries, limit: HISTORY_LIMIT } };
    } catch (error) {
      if (error instanceof InputError || error?.status) return { status: error.status, data: { error: error.message } };
      return { status: 503, data: { error: "クラウド保存に接続できませんでした。再試行してください。続く場合はFirestoreの接続設定・権限を確認してください。" } };
    }
  };
}
module.exports = { createStore, createAccountHandler, normalizeSettings, normalizeProfile, normalizeResult, HISTORY_LIMIT, PREFECTURES };
