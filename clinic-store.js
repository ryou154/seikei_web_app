const { authorize } = require("./auth-server");

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SCAN = 1000;
const VERIFICATION_STATUSES = new Set(["verified", "needs_review", "unverified", "automated"]);

class ClinicInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanText(value, maxLength, label) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value !== "string" || value.length > maxLength) {
    throw new ClinicInputError(`${label}を確認してください。`);
  }
  return value.trim();
}

function cleanInteger(value, fallback, min, max, label) {
  if (value === null || value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) throw new ClinicInputError(`${label}を確認してください。`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) {
    throw new ClinicInputError(`${label}を確認してください。`);
  }
  return result;
}

function cleanBoolean(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new ClinicInputError(`${label}を確認してください。`);
}

function normalizeClinicQuery(searchParams) {
  const verificationStatus = cleanText(searchParams.get("verificationStatus"), 30, "確認状態");
  if (verificationStatus && !VERIFICATION_STATUSES.has(verificationStatus)) {
    throw new ClinicInputError("確認状態を確認してください。");
  }
  return {
    prefecture: cleanText(searchParams.get("prefecture"), 10, "都道府県"),
    city: cleanText(searchParams.get("city"), 80, "市区町村"),
    keyword: cleanText(searchParams.get("keyword"), 100, "検索語"),
    treatment: cleanText(searchParams.get("treatment"), 100, "施術名"),
    verificationStatus,
    hasPricing: cleanBoolean(searchParams.get("hasPricing"), "料金条件"),
    page: cleanInteger(searchParams.get("page"), 1, 1, 10000, "ページ"),
    limit: cleanInteger(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT, "表示件数")
  };
}

function validClinicId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new ClinicInputError("クリニックIDを確認してください。");
  }
  return value;
}

function array(value, max = 100) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function string(value) {
  return typeof value === "string" ? value : "";
}

function strings(value, max = 100) {
  return array(value, max).filter((item) => typeof item === "string");
}

function publicLocation(value) {
  const source = object(value);
  if (!source) return null;
  const latitude = Number(source.latitude);
  const longitude = Number(source.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? { latitude, longitude }
    : null;
}

function publicDoctor(value) {
  const source = object(value) || {};
  return {
    name: string(source.name),
    title: string(source.title),
    specialties: strings(source.specialties),
    qualifications: strings(source.qualifications),
    sourceUrl: string(source.sourceUrl),
    verifiedAt: string(source.verifiedAt)
  };
}

function publicPricing(value) {
  const source = object(value) || {};
  return {
    treatment: string(source.treatment),
    displayPrice: string(source.displayPrice),
    amountMin: Number.isFinite(source.amountMin) ? source.amountMin : null,
    amountMax: Number.isFinite(source.amountMax) ? source.amountMax : null,
    conditions: strings(source.conditions),
    additionalCosts: strings(source.additionalCosts),
    sourceUrl: string(source.sourceUrl),
    verifiedAt: string(source.verifiedAt)
  };
}

function publicInformation(value) {
  const source = object(value) || {};
  return {
    title: string(source.title),
    description: string(source.description),
    treatment: string(source.treatment),
    sourceUrl: string(source.sourceUrl),
    verifiedAt: string(source.verifiedAt)
  };
}

function publicCaseInformation(value) {
  const source = object(value);
  if (!source) return null;
  return {
    summary: string(source.summary),
    period: string(source.period),
    scope: string(source.scope),
    sourceUrl: string(source.sourceUrl),
    verifiedAt: string(source.verifiedAt)
  };
}

function publicSource(value) {
  const source = object(value) || {};
  return {
    url: string(source.url),
    type: string(source.type),
    verifiedAt: string(source.verifiedAt)
  };
}

function publicClinic(id, value, { detail = false } = {}) {
  const source = object(value) || {};
  const clinic = {
    id,
    placeId: string(source.placeId),
    name: string(source.name),
    prefecture: string(source.prefecture),
    city: string(source.city),
    area: string(source.area),
    address: string(source.address),
    location: publicLocation(source.location),
    phone: string(source.phone),
    officialUrl: string(source.officialUrl),
    googleMapsUrl: string(source.googleMapsUrl),
    businessStatus: string(source.businessStatus),
    openingHours: typeof source.openingHours === "string"
      ? source.openingHours
      : strings(source.openingHours, 14),
    treatments: strings(source.treatments),
    tags: strings(source.tags),
    hasPricing: Boolean(source.hasPricing || array(source.pricing).length),
    verificationStatus: VERIFICATION_STATUSES.has(source.verificationStatus)
      ? source.verificationStatus
      : "unverified",
    verifiedAt: string(source.verifiedAt),
    updatedAt: string(source.updatedAt)
  };
  if (!detail) return clinic;
  return {
    ...clinic,
    pricing: array(source.pricing).map(publicPricing),
    doctors: array(source.doctors).map(publicDoctor),
    caseInformation: publicCaseInformation(source.caseInformation),
    downtimeAndRisks: array(source.downtimeAndRisks).map(publicInformation),
    warrantyAndAftercare: array(source.warrantyAndAftercare).map(publicInformation),
    sources: array(source.sources).map(publicSource)
  };
}

function normalizeSearchText(value) {
  return String(value || "").normalize("NFKC").toLocaleLowerCase("ja");
}

function matchesFilters(clinic, filters) {
  if (clinic.publicationStatus !== "published") return false;
  if (filters.prefecture && clinic.prefecture !== filters.prefecture) return false;
  if (filters.city && !normalizeSearchText(clinic.city).includes(normalizeSearchText(filters.city))) return false;
  if (filters.verificationStatus && clinic.verificationStatus !== filters.verificationStatus) return false;
  if (filters.hasPricing !== null && Boolean(clinic.hasPricing || array(clinic.pricing).length) !== filters.hasPricing) return false;
  if (filters.treatment) {
    const treatments = [...array(clinic.treatments), ...array(clinic.tags)].map(normalizeSearchText);
    const target = normalizeSearchText(filters.treatment);
    if (!treatments.some((item) => item.includes(target))) return false;
  }
  if (filters.keyword) {
    const haystack = [
      clinic.name, clinic.prefecture, clinic.city, clinic.area, clinic.address,
      ...array(clinic.treatments), ...array(clinic.tags)
    ].map(normalizeSearchText).join(" ");
    if (!haystack.includes(normalizeSearchText(filters.keyword))) return false;
  }
  return true;
}

function createClinicStore(db) {
  const collection = db.collection("clinics");
  return {
    async list(filters) {
      const query = filters.prefecture
        ? collection.where("prefecture", "==", filters.prefecture)
        : collection.where("publicationStatus", "==", "published");
      const snapshot = await query.limit(MAX_SCAN).get();
      const clinics = snapshot.docs
        .map((document) => ({ id: document.id, ...document.data() }))
        .filter((clinic) => matchesFilters(clinic, filters))
        .sort((left, right) => {
          const byPrefecture = String(left.prefecture || "").localeCompare(String(right.prefecture || ""), "ja");
          return byPrefecture || String(left.name || "").localeCompare(String(right.name || ""), "ja");
        });
      return { clinics, truncated: snapshot.size === MAX_SCAN };
    },
    async get(id) {
      const snapshot = await collection.doc(validClinicId(id)).get();
      if (!snapshot.exists) return null;
      const clinic = snapshot.data();
      return clinic.publicationStatus === "published" ? { id: snapshot.id, ...clinic } : null;
    }
  };
}

function createClinicHandler({ authenticate = authorize, getStore } = {}) {
  if (typeof getStore !== "function") throw new TypeError("getStore is required");
  return async (request) => {
    try {
      await authenticate(request);
      if (request.method !== "GET") return { status: 405, data: { error: "Method not allowed" } };
      const url = new URL(request.url, "http://localhost");
      const detailMatch = /^\/api\/clinics\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
      const store = getStore();

      if (detailMatch) {
        if (url.search) return { status: 404, data: { error: "Not found" } };
        const clinic = await store.get(validClinicId(detailMatch[1]));
        return clinic
          ? { status: 200, data: { clinic: publicClinic(clinic.id, clinic, { detail: true }) } }
          : { status: 404, data: { error: "クリニック情報が見つかりません。" } };
      }

      if (url.pathname !== "/api/clinics") return { status: 404, data: { error: "Not found" } };
      const filters = normalizeClinicQuery(url.searchParams);
      const result = await store.list(filters);
      const all = Array.isArray(result) ? result : result.clinics;
      const truncated = Array.isArray(result) ? false : Boolean(result.truncated);
      const start = (filters.page - 1) * filters.limit;
      const clinics = all.slice(start, start + filters.limit).map((clinic) => publicClinic(clinic.id, clinic));
      return {
        status: 200,
        data: {
          clinics,
          pagination: {
            page: filters.page,
            limit: filters.limit,
            total: all.length,
            totalPages: Math.ceil(all.length / filters.limit),
            hasNext: start + clinics.length < all.length,
            truncated
          }
        }
      };
    } catch (error) {
      if (error instanceof ClinicInputError || error?.status) {
        return { status: error.status || 400, data: { error: error.message } };
      }
      return { status: 503, data: { error: "クリニック情報を取得できませんでした。時間をおいて再試行してください。" } };
    }
  };
}

module.exports = {
  ClinicInputError,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_SCAN,
  createClinicStore,
  createClinicHandler,
  normalizeClinicQuery,
  publicClinic,
  matchesFilters,
  validClinicId
};
