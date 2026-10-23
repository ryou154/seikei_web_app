const { FieldPath } = require("@google-cloud/firestore");
const { authorize } = require("./auth-server");
const { PREFECTURES } = require("./account-store");
const {
  DEFAULT_KEYWORDS,
  discoverClinicCandidates,
  writeClinicCandidates,
  writeAutoPublishedClinics,
  MAX_AUTO_PUBLISH_PER_PREFECTURE
} = require("./places-clinic-sync");
const {
  requestOfficialExtraction,
  officialExtractionUpdate
} = require("./clinic-official-sync");

const ADMIN_LIMIT = 30;
const ADMIN_MAX_LIMIT = 50;
const ADMIN_MAX_PREFECTURES = 10;
const ADMIN_MAX_OFFICIAL_SYNC = 10;
const STATUSES = new Set(["draft", "published"]);
const VERIFICATION_STATUSES = new Set(["verified", "needs_review", "unverified", "automated"]);
const PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places";
const PLACE_DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "addressComponents",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "businessStatus",
  "websiteUri",
  "googleMapsUri"
].join(",");

function validAdminClinicId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value)) {
    throw new ClinicAdminError("候補IDを確認してください。");
  }
  return value;
}

class ClinicAdminError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function text(value, max, label, { required = false } = {}) {
  if (value === null || value === undefined) value = "";
  if (typeof value !== "string" || value.length > max) throw new ClinicAdminError(`${label}を確認してください。`);
  const result = value.trim();
  if (required && !result) throw new ClinicAdminError(`${label}を入力してください。`);
  return result;
}

function url(value, label, { required = false } = {}) {
  const result = text(value, 1000, label, { required });
  if (!result) return "";
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "https:") throw new Error();
  } catch {
    throw new ClinicAdminError(`${label}はhttps://から入力してください。`);
  }
  return result;
}

function stringList(value, maxItems, maxLength, label) {
  if (!Array.isArray(value)) throw new ClinicAdminError(`${label}を確認してください。`);
  return [...new Set(value.slice(0, maxItems).map((item) => text(item, maxLength, label)).filter(Boolean))];
}

function records(value, maxItems, mapper, label) {
  if (!Array.isArray(value) || value.length > maxItems) throw new ClinicAdminError(`${label}を確認してください。`);
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new ClinicAdminError(`${label}${index + 1}件目を確認してください。`);
    return mapper(item, index);
  });
}

function normalizePricing(value, now) {
  return records(value, 100, (item) => ({
    treatment: text(item.treatment, 150, "施術名", { required: true }),
    displayPrice: text(item.displayPrice, 100, "料金", { required: true }),
    conditions: stringList(item.conditions || [], 20, 200, "料金条件"),
    additionalCosts: stringList(item.additionalCosts || [], 20, 200, "追加費用"),
    sourceUrl: url(item.sourceUrl, "料金の情報源", { required: true }),
    verifiedAt: now
  }), "料金情報");
}

function normalizeDoctors(value, now) {
  return records(value, 100, (item) => ({
    name: text(item.name, 100, "医師名", { required: true }),
    title: text(item.title, 100, "役職"),
    specialties: stringList(item.specialties || [], 30, 150, "得意分野"),
    qualifications: stringList(item.qualifications || [], 30, 200, "資格"),
    sourceUrl: url(item.sourceUrl, "医師情報の情報源", { required: true }),
    verifiedAt: now
  }), "医師情報");
}

function normalizeInformation(value, label, now) {
  return records(value, 100, (item) => ({
    title: text(item.title, 150, `${label}の項目`, { required: true }),
    description: text(item.description, 1000, `${label}の説明`, { required: true }),
    treatment: text(item.treatment, 150, `${label}の対象施術`),
    sourceUrl: url(item.sourceUrl, `${label}の情報源`, { required: true }),
    verifiedAt: now
  }), label);
}

function normalizeSources(value, now) {
  return records(value, 50, (item) => ({
    url: url(item.url, "情報源URL", { required: true }),
    type: text(item.type, 50, "情報源種別") || "official",
    verifiedAt: now
  }), "情報源");
}

function normalizeAdminClinicUpdate(body, identity, now = new Date().toISOString()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ClinicAdminError("入力内容を確認してください。");
  const publicationStatus = text(body.publicationStatus, 20, "公開状態") || "draft";
  const verificationStatus = text(body.verificationStatus, 30, "確認状態") || "unverified";
  if (!STATUSES.has(publicationStatus) || !VERIFICATION_STATUSES.has(verificationStatus)) {
    throw new ClinicAdminError("公開状態または確認状態を確認してください。");
  }
  const sources = normalizeSources(body.sources || [], now);
  const normalized = {
    name: text(body.name, 200, "クリニック名"),
    prefecture: text(body.prefecture, 10, "都道府県"),
    city: text(body.city, 100, "市区町村"),
    area: text(body.area, 100, "エリア"),
    address: text(body.address, 300, "住所"),
    phone: text(body.phone, 50, "電話番号"),
    officialUrl: url(body.officialUrl, "公式サイトURL"),
    businessStatus: text(body.businessStatus, 30, "営業状態"),
    openingHours: text(body.openingHours, 1000, "診療時間"),
    treatments: stringList(body.treatments || [], 100, 150, "対応施術"),
    tags: stringList(body.tags || [], 100, 100, "タグ"),
    pricing: normalizePricing(body.pricing || [], now),
    doctors: normalizeDoctors(body.doctors || [], now),
    caseInformation: body.caseInformation ? {
      summary: text(body.caseInformation.summary, 1000, "症例情報", { required: true }),
      period: text(body.caseInformation.period, 100, "症例期間"),
      scope: text(body.caseInformation.scope, 200, "症例範囲"),
      sourceUrl: url(body.caseInformation.sourceUrl, "症例情報の情報源", { required: true }),
      verifiedAt: now
    } : null,
    downtimeAndRisks: normalizeInformation(body.downtimeAndRisks || [], "ダウンタイム・リスク", now),
    warrantyAndAftercare: normalizeInformation(body.warrantyAndAftercare || [], "保証・アフターケア", now),
    sources,
    hasPricing: Array.isArray(body.pricing) && body.pricing.length > 0,
    publicationStatus,
    verificationStatus,
    verifiedAt: verificationStatus === "verified" ? now : "",
    reviewedAt: now,
    reviewedBy: text(identity.email, 320, "担当者"),
    updatedAt: now
  };
  if (publicationStatus === "published") {
    if (verificationStatus !== "verified") throw new ClinicAdminError("公開するには確認状態を確認済みにしてください。", 409);
    if (!normalized.name || !normalized.prefecture || !normalized.officialUrl || !sources.length) {
      throw new ClinicAdminError("公開するには名称、都道府県、公式サイトURL、情報源が必要です。", 409);
    }
  }
  return normalized;
}

function adminClinic(id, value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    id,
    placeId: typeof source.placeId === "string" ? source.placeId : "",
    discoveryPrefectures: Array.isArray(source.discoveryPrefectures) ? source.discoveryPrefectures : [],
    discoveryQueries: Array.isArray(source.discoveryQueries) ? source.discoveryQueries : [],
    name: typeof source.name === "string" ? source.name : "",
    prefecture: typeof source.prefecture === "string" ? source.prefecture : "",
    city: typeof source.city === "string" ? source.city : "",
    area: typeof source.area === "string" ? source.area : "",
    address: typeof source.address === "string" ? source.address : "",
    phone: typeof source.phone === "string" ? source.phone : "",
    officialUrl: typeof source.officialUrl === "string" ? source.officialUrl : "",
    businessStatus: typeof source.businessStatus === "string" ? source.businessStatus : "",
    openingHours: typeof source.openingHours === "string" ? source.openingHours : "",
    treatments: Array.isArray(source.treatments) ? source.treatments : [],
    tags: Array.isArray(source.tags) ? source.tags : [],
    pricing: Array.isArray(source.pricing) ? source.pricing : [],
    doctors: Array.isArray(source.doctors) ? source.doctors : [],
    caseInformation: source.caseInformation || null,
    downtimeAndRisks: Array.isArray(source.downtimeAndRisks) ? source.downtimeAndRisks : [],
    warrantyAndAftercare: Array.isArray(source.warrantyAndAftercare) ? source.warrantyAndAftercare : [],
    sources: Array.isArray(source.sources) ? source.sources : [],
    publicationStatus: STATUSES.has(source.publicationStatus) ? source.publicationStatus : "draft",
    verificationStatus: VERIFICATION_STATUSES.has(source.verificationStatus) ? source.verificationStatus : "unverified",
    reviewedAt: typeof source.reviewedAt === "string" ? source.reviewedAt : "",
    reviewedBy: typeof source.reviewedBy === "string" ? source.reviewedBy : "",
    officialDataCheckedAt: typeof source.officialDataCheckedAt === "string" ? source.officialDataCheckedAt : "",
    extractionStatus: typeof source.extractionStatus === "string" ? source.extractionStatus : "",
    extractionError: typeof source.extractionError === "string" ? source.extractionError : "",
    detectedData: source.detectedData && typeof source.detectedData === "object" ? source.detectedData : null,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : ""
  };
}

function createClinicAdminStore(db) {
  const collection = db.collection("clinics");
  return {
    async list({ status, limit, cursor, prefectures = [] }) {
      if (prefectures.length) {
        const snapshots = await Promise.all(prefectures.flatMap((prefecture) => [
          collection.where("discoveryPrefectures", "array-contains", prefecture).get(),
          collection.where("prefecture", "==", prefecture).get()
        ]));
        const clinicsById = new Map();
        for (const snapshot of snapshots) {
          for (const document of snapshot.docs) {
            const clinic = adminClinic(document.id, document.data());
            if (status === "all" || clinic.publicationStatus === status) clinicsById.set(document.id, clinic);
          }
        }
        const clinics = [...clinicsById.values()]
          .filter((clinic) => !cursor || clinic.id > cursor)
          .sort((left, right) => left.id.localeCompare(right.id));
        const page = clinics.slice(0, limit);
        return {
          clinics: page,
          nextCursor: clinics.length > limit ? page.at(-1)?.id || "" : ""
        };
      }
      let query = status === "all" ? collection : collection.where("publicationStatus", "==", status);
      query = query.orderBy(FieldPath.documentId());
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(limit + 1).get();
      const documents = snapshot.docs.slice(0, limit);
      return {
        clinics: documents.map((document) => adminClinic(document.id, document.data())),
        nextCursor: snapshot.docs.length > limit ? documents.at(-1)?.id || "" : ""
      };
    },
    async get(id) {
      const snapshot = await collection.doc(validAdminClinicId(id)).get();
      return snapshot.exists ? adminClinic(snapshot.id, snapshot.data()) : null;
    },
    async update(id, data) {
      const reference = collection.doc(validAdminClinicId(id));
      const snapshot = await reference.get();
      if (!snapshot.exists) return null;
      await reference.set(data, { merge: true });
      return adminClinic(id, { ...snapshot.data(), ...data });
    },
    async importCandidates(candidates) {
      return writeClinicCandidates(db, candidates);
    },
    async autoPublishCandidates(candidates, options) {
      return writeAutoPublishedClinics(db, candidates, options);
    },
    async listForOfficialSync({ prefectures, limit, before = "" }) {
      const snapshots = await Promise.all(prefectures.map((prefecture) => (
        collection.where("prefecture", "==", prefecture).get()
      )));
      const clinicsById = new Map();
      for (const snapshot of snapshots) {
        for (const document of snapshot.docs) {
          const clinic = adminClinic(document.id, document.data());
          if (clinic.publicationStatus === "published"
            && clinic.officialUrl
            && (!before || !clinic.officialDataCheckedAt || clinic.officialDataCheckedAt < before)) {
            clinicsById.set(document.id, clinic);
          }
        }
      }
      return [...clinicsById.values()]
        .sort((left, right) => (
          left.officialDataCheckedAt.localeCompare(right.officialDataCheckedAt)
          || left.id.localeCompare(right.id)
        ))
        .slice(0, limit);
    },
    async saveOfficialExtraction(id, extraction, options) {
      const reference = collection.doc(validAdminClinicId(id));
      const snapshot = await reference.get();
      if (!snapshot.exists) return null;
      const result = officialExtractionUpdate(snapshot.data(), extraction, options);
      await reference.set(result.update, { merge: true });
      return result;
    },
    async markOfficialSyncFailed(id, errorMessage = "", now = new Date().toISOString()) {
      const reference = collection.doc(validAdminClinicId(id));
      const snapshot = await reference.get();
      if (!snapshot.exists) return false;
      await reference.set({
        officialDataCheckedAt: now,
        extractionStatus: "failed",
        extractionError: String(errorMessage || "公式情報の抽出に失敗しました。").slice(0, 500),
        updatedAt: now
      }, { merge: true });
      return true;
    }
  };
}

function adminEmails() {
  return new Set(String(process.env.CLINIC_ADMIN_EMAILS || process.env.AUTH_ALLOWED_EMAILS || "")
    .split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

async function requireAdmin(request, authenticate) {
  const identity = await authenticate(request);
  const allowed = adminEmails();
  if (!identity.email || !allowed.has(identity.email.toLowerCase())) {
    throw new ClinicAdminError("管理画面を使用する権限がありません。", 403);
  }
  return identity;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 256 * 1024) reject(new ClinicAdminError("入力内容が大きすぎます。", 413));
    });
    request.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch { reject(new ClinicAdminError("JSONを確認してください。")); }
    });
    request.on("error", reject);
  });
}

async function requestPlacePreview(placeId, apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new ClinicAdminError("GOOGLE_PLACES_API_KEYが設定されていません。", 503);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(`${PLACE_DETAILS_URL}/${encodeURIComponent(validAdminClinicId(placeId))}?languageCode=ja&regionCode=JP`, {
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ClinicAdminError("Google Placesの候補情報を取得できませんでした。", 502);
    const components = Array.isArray(data.addressComponents) ? data.addressComponents : [];
    const component = (type) => {
      const match = components.find((item) => Array.isArray(item.types) && item.types.includes(type));
      return typeof match?.longText === "string" ? match.longText : "";
    };
    return {
      placeId: typeof data.id === "string" ? data.id : placeId,
      name: typeof data.displayName?.text === "string" ? data.displayName.text : "",
      address: typeof data.formattedAddress === "string" ? data.formattedAddress : "",
      prefecture: component("administrative_area_level_1"),
      city: component("locality") || component("administrative_area_level_2"),
      area: component("sublocality_level_1") || component("sublocality_level_2"),
      phone: typeof data.nationalPhoneNumber === "string" ? data.nationalPhoneNumber : "",
      businessStatus: typeof data.businessStatus === "string" ? data.businessStatus : "",
      officialUrl: typeof data.websiteUri === "string" ? data.websiteUri : "",
      openingHours: Array.isArray(data.regularOpeningHours?.weekdayDescriptions)
        ? data.regularOpeningHours.weekdayDescriptions.join("\n")
        : "",
      googleMapsUrl: typeof data.googleMapsUri === "string" ? data.googleMapsUri : "",
      attribution: "Google"
    };
  } catch (error) {
    if (error.name === "AbortError") throw new ClinicAdminError("Google Placesの応答がタイムアウトしました。", 504);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function createClinicAdminHandler({
  authenticate = authorize,
  getStore,
  parseBody = readJsonBody,
  getPlacePreview = requestPlacePreview,
  discoverCandidates = discoverClinicCandidates,
  extractOfficial = requestOfficialExtraction,
  placesApiKey = process.env.GOOGLE_PLACES_API_KEY,
  geminiApiKey = process.env.GEMINI_API_KEY,
  geminiTextModel = process.env.GEMINI_TEXT_MODEL
} = {}) {
  if (typeof getStore !== "function") throw new TypeError("getStore is required");
  let discoveryRunning = false;
  let officialSyncRunning = false;
  return async (request) => {
    try {
      const identity = await requireAdmin(request, authenticate);
      const requestUrl = new URL(request.url, "http://localhost");
      const previewMatch = /^\/api\/admin\/clinics\/([a-zA-Z0-9_-]{1,200})\/place-preview$/.exec(requestUrl.pathname);
      const detailMatch = /^\/api\/admin\/clinics\/([a-zA-Z0-9_-]{1,200})$/.exec(requestUrl.pathname);
      const store = getStore();
      if (requestUrl.pathname === "/api/admin/clinics/extract-official") {
        if (request.method !== "POST" || requestUrl.search) return { status: 404, data: { error: "Not found" } };
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
          throw new ClinicAdminError("Content-Typeをapplication/jsonにしてください。", 415);
        }
        if (!geminiApiKey) throw new ClinicAdminError("GEMINI_API_KEYが設定されていません。", 503);
        if (officialSyncRunning) throw new ClinicAdminError("公式情報の抽出はすでに実行中です。", 409);
        if (typeof store.listForOfficialSync !== "function" || typeof store.saveOfficialExtraction !== "function") {
          throw new ClinicAdminError("公式情報を保存できません。", 503);
        }
        const body = await parseBody(request);
        if (body?.confirmed !== true) throw new ClinicAdminError("公式情報抽出の確認が必要です。", 400);
        if (body.autoApply !== undefined && typeof body.autoApply !== "boolean") {
          throw new ClinicAdminError("自動反映の指定を確認してください。", 400);
        }
        const before = body.before === undefined ? "" : text(body.before, 40, "更新開始日時");
        if (before && (!Number.isFinite(Date.parse(before)) || new Date(before).toISOString() !== before)) {
          throw new ClinicAdminError("更新開始日時を確認してください。", 400);
        }
        const requested = Array.isArray(body.prefectures) ? body.prefectures : [];
        const prefectures = [...new Set(requested.map((value) => text(value, 10, "都道府県")))];
        if (!prefectures.length
          || prefectures.length > ADMIN_MAX_PREFECTURES
          || prefectures.some((value) => !PREFECTURES.includes(value))) {
          throw new ClinicAdminError(`都道府県は${ADMIN_MAX_PREFECTURES}件以内で選択してください。`, 400);
        }
        const limit = Number(body.limit ?? 5);
        if (!Number.isInteger(limit) || limit < 1 || limit > ADMIN_MAX_OFFICIAL_SYNC) {
          throw new ClinicAdminError(`抽出件数は1〜${ADMIN_MAX_OFFICIAL_SYNC}で指定してください。`, 400);
        }
        officialSyncRunning = true;
        try {
          const clinics = await store.listForOfficialSync({ prefectures, limit, before });
          const results = [];
          for (const clinic of clinics) {
            try {
              const extracted = await extractOfficial({
                apiKey: geminiApiKey,
                clinicName: clinic.name,
                sourceOfficialUrl: clinic.officialUrl,
                model: geminiTextModel
              });
              const saved = await store.saveOfficialExtraction(clinic.id, extracted.extraction, {
                model: extracted.model,
                autoApply: body.autoApply === true
              });
              results.push({
                id: clinic.id,
                name: clinic.name,
                ok: Boolean(saved),
                changed: Boolean(saved?.changed),
                autoApplied: Boolean(saved?.autoApplied)
              });
            } catch (error) {
              if (typeof store.markOfficialSyncFailed === "function") {
                await store.markOfficialSyncFailed(clinic.id, error.message);
              }
              results.push({ id: clinic.id, name: clinic.name, ok: false, error: error.message });
            }
          }
          return {
            status: 200,
            data: {
              requested: clinics.length,
              succeeded: results.filter((result) => result.ok).length,
              failed: results.filter((result) => !result.ok).length,
              changed: results.filter((result) => result.changed).length,
              autoApplied: results.filter((result) => result.autoApplied).length,
              results
            }
          };
        } finally {
          officialSyncRunning = false;
        }
      }
      if (requestUrl.pathname === "/api/admin/clinics/auto-publish") {
        if (request.method !== "POST" || requestUrl.search) return { status: 404, data: { error: "Not found" } };
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
          throw new ClinicAdminError("Content-Typeをapplication/jsonにしてください。", 415);
        }
        if (!placesApiKey) throw new ClinicAdminError("GOOGLE_PLACES_API_KEYが設定されていません。", 503);
        if (discoveryRunning) throw new ClinicAdminError("候補収集はすでに実行中です。", 409);
        const body = await parseBody(request);
        if (body?.confirmed !== true) throw new ClinicAdminError("自動公開の確認が必要です。", 400);
        const requested = Array.isArray(body.prefectures) ? body.prefectures : [];
        const prefectures = [...new Set(requested.map((value) => text(value, 10, "都道府県")))];
        if (!prefectures.length || prefectures.some((value) => !PREFECTURES.includes(value))) {
          throw new ClinicAdminError("対象都道府県を確認してください。", 400);
        }
        const limitPerPrefecture = Number(body.limitPerPrefecture ?? MAX_AUTO_PUBLISH_PER_PREFECTURE);
        if (!Number.isInteger(limitPerPrefecture)
          || limitPerPrefecture < 1
          || limitPerPrefecture > MAX_AUTO_PUBLISH_PER_PREFECTURE) {
          throw new ClinicAdminError(`都道府県ごとの公開件数は1〜${MAX_AUTO_PUBLISH_PER_PREFECTURE}で指定してください。`, 400);
        }
        const maxPages = Number(body.maxPages ?? 1);
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3) {
          throw new ClinicAdminError("ページ数は1〜3で指定してください。", 400);
        }
        if (typeof store.autoPublishCandidates !== "function") {
          throw new ClinicAdminError("候補を自動公開できません。", 503);
        }
        discoveryRunning = true;
        try {
          const result = await discoverCandidates({
            apiKey: placesApiKey,
            prefectures,
            keywords: DEFAULT_KEYWORDS,
            maxPages
          });
          const firestore = await store.autoPublishCandidates(result.candidates, {
            prefectures,
            limitPerPrefecture
          });
          return {
            status: 200,
            data: {
              prefectures,
              limitPerPrefecture,
              requests: result.stats.requests,
              rawResults: result.stats.rawResults,
              uniqueCandidates: result.stats.uniqueCandidates,
              ...firestore
            }
          };
        } finally {
          discoveryRunning = false;
        }
      }
      if (requestUrl.pathname === "/api/admin/clinics/discover") {
        if (request.method !== "POST" || requestUrl.search) return { status: 404, data: { error: "Not found" } };
        if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
          throw new ClinicAdminError("Content-Typeをapplication/jsonにしてください。", 415);
        }
        if (!placesApiKey) throw new ClinicAdminError("GOOGLE_PLACES_API_KEYが設定されていません。", 503);
        if (discoveryRunning) throw new ClinicAdminError("候補収集はすでに実行中です。", 409);
        const body = await parseBody(request);
        if (body?.confirmed !== true) throw new ClinicAdminError("API利用の確認が必要です。", 400);
        const prefecture = text(body.prefecture, 10, "都道府県", { required: true });
        const maxPages = Number(body.maxPages ?? 1);
        if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3) {
          throw new ClinicAdminError("ページ数は1〜3で指定してください。", 400);
        }
        if (typeof store.importCandidates !== "function") throw new ClinicAdminError("候補を保存できません。", 503);
        discoveryRunning = true;
        try {
          const result = await discoverCandidates({
            apiKey: placesApiKey,
            prefectures: [prefecture],
            keywords: DEFAULT_KEYWORDS,
            maxPages
          });
          const firestore = await store.importCandidates(result.candidates);
          return {
            status: 200,
            data: {
              prefecture,
              requests: result.stats.requests,
              rawResults: result.stats.rawResults,
              uniqueCandidates: result.stats.uniqueCandidates,
              inserted: firestore.inserted,
              updated: firestore.updated
            }
          };
        } finally {
          discoveryRunning = false;
        }
      }
      if (previewMatch) {
        if (request.method !== "GET" || requestUrl.search) return { status: 404, data: { error: "Not found" } };
        return { status: 200, data: { place: await getPlacePreview(previewMatch[1], placesApiKey) } };
      }
      if (detailMatch) {
        if (requestUrl.search) return { status: 404, data: { error: "Not found" } };
        if (request.method === "GET") {
          const clinic = await store.get(detailMatch[1]);
          return clinic ? { status: 200, data: { clinic } } : { status: 404, data: { error: "候補が見つかりません。" } };
        }
        if (request.method === "PUT") {
          if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
            throw new ClinicAdminError("Content-Typeをapplication/jsonにしてください。", 415);
          }
          const data = normalizeAdminClinicUpdate(await parseBody(request), identity);
          const clinic = await store.update(detailMatch[1], data);
          return clinic ? { status: 200, data: { clinic } } : { status: 404, data: { error: "候補が見つかりません。" } };
        }
        return { status: 405, data: { error: "Method not allowed" } };
      }
      if (requestUrl.pathname !== "/api/admin/clinics" || request.method !== "GET") {
        return { status: 404, data: { error: "Not found" } };
      }
      const status = text(requestUrl.searchParams.get("status") || "draft", 20, "公開状態");
      if (status !== "all" && !STATUSES.has(status)) throw new ClinicAdminError("公開状態を確認してください。");
      const rawLimit = requestUrl.searchParams.get("limit") || String(ADMIN_LIMIT);
      if (!/^\d+$/.test(rawLimit)) throw new ClinicAdminError("表示件数を確認してください。");
      const limit = Number(rawLimit);
      if (limit < 1 || limit > ADMIN_MAX_LIMIT) throw new ClinicAdminError("表示件数を確認してください。");
      const cursor = requestUrl.searchParams.get("cursor") ? validAdminClinicId(requestUrl.searchParams.get("cursor")) : "";
      const prefectures = [...new Set(requestUrl.searchParams.getAll("prefecture").map((value) => text(value, 10, "都道府県")))];
      if (prefectures.length > ADMIN_MAX_PREFECTURES || prefectures.some((value) => !PREFECTURES.includes(value))) {
        throw new ClinicAdminError(`都道府県は${ADMIN_MAX_PREFECTURES}件以内で選択してください。`);
      }
      return { status: 200, data: await store.list({ status, limit, cursor, prefectures }) };
    } catch (error) {
      if (error instanceof ClinicAdminError || error?.status) return { status: error.status || 400, data: { error: error.message } };
      return { status: 503, data: { error: "クリニック管理情報を処理できませんでした。" } };
    }
  };
}

module.exports = {
  ADMIN_LIMIT,
  ADMIN_MAX_LIMIT,
  ADMIN_MAX_PREFECTURES,
  ADMIN_MAX_OFFICIAL_SYNC,
  ClinicAdminError,
  createClinicAdminStore,
  createClinicAdminHandler,
  normalizeAdminClinicUpdate,
  adminClinic,
  requestPlacePreview,
  validAdminClinicId
};
