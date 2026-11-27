const { authorize } = require("./auth-server");
const { partsFromTreatmentName } = require('./treatment-parts');
const { priceItem } = require('./clinic-html-sync');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_SCAN = 1000;
const VERIFICATION_STATUSES = new Set(["verified", "needs_review", "unverified", "automated"]);
const TREATMENT_PARTS = new Set(["二重", "目元", "鼻", "輪郭", "肌", "胸", "体"]);

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
  const part = cleanText(searchParams.get("part"), 10, "希望部位");
  if (part && !TREATMENT_PARTS.has(part)) throw new ClinicInputError("希望部位を確認してください。");
  const budget = cleanInteger(searchParams.get('budget'), null, 0, 1000000000, '予算上限');
  const budgetMin = cleanInteger(searchParams.get('budgetMin'), null, 0, 1000000000, '予算下限');
  if (budget !== null && budgetMin !== null && budgetMin > budget) throw new ClinicInputError('予算下限は上限以下にしてください。');
  return {
    part,
    budget, budgetMin,
    days: cleanInteger(searchParams.get("days"), null, 0, 365, "ダウンタイム"),
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

function array(value, max = 500) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function string(value) {
  return typeof value === "string" ? value : "";
}

function strings(value, max = 500) {
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
    scope: string(source.scope),
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
    scope: string(source.scope),
    notes: string(source.notes),
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
  const prices = searchablePricing(source);
  const extractedDates = source.verificationStatus === 'automated' ? prices.filter(hasEvidence).map(p => p.verifiedAt)
    .filter(date => typeof date === 'string' && Number.isFinite(Date.parse(date)) && Date.parse(date) <= Date.now()) : [];
  const latestExtraction = extractedDates.sort((a, b) => Date.parse(b) - Date.parse(a))[0];
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
    treatments: [...new Set([...strings(source.treatments), ...searchablePricing(source).filter(p => !referenceOnly(p)).map(p => p.treatment).filter(Boolean)])],
    referenceTreatmentDetails: [...new Set(prices.filter(p => referenceOnly(p) && hasEvidence(p)).map(p => p.treatment).filter(Boolean))]
      .map(name => ({ name, parts: partsFromTreatmentName(name) })),
    treatmentDetails: searchableTreatmentDetails(source).map(item => ({
      name: string(item?.name), parts: strings(item?.parts).filter(part => TREATMENT_PARTS.has(part)),
      downtimeMaxDays: Number.isSafeInteger(item?.downtimeMaxDays) && item.downtimeMaxDays >= 0 && item.downtimeMaxDays <= 365 ? item.downtimeMaxDays : null,
      sourceUrl: string(item?.sourceUrl), verifiedAt: string(item?.verifiedAt)
    })),
    tags: strings(source.tags),
    hasPricing: Boolean(source.hasPricing || array(source.pricing).length),
    verificationStatus: VERIFICATION_STATUSES.has(source.verificationStatus)
      ? source.verificationStatus
      : "unverified",
    verifiedAt: string(source.verifiedAt || latestExtraction),
    updatedAt: string(source.updatedAt)
  };
  if (!detail) return clinic;
  return {
    ...clinic,
    pricing: searchablePricing(source).map(publicPricing),
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

function hasEvidence(item) {
  try { const source = new URL(item.sourceUrl); const date = Date.parse(item.verifiedAt);
    return source.protocol === "https:" && !source.username && !source.password && Number.isFinite(date) && date <= Date.now();
  } catch { return false; }
}

function searchableTreatmentDetails(clinic) {
  const details = array(clinic.treatmentDetails);
  const existingNames = new Set(details.map(t => t.name));
  const source = { sourceUrl: clinic.officialUrl, verifiedAt: clinic.verifiedAt };
  const prices = searchablePricing(clinic).filter(p => !referenceOnly(p));
  const names = [...new Set([...strings(clinic.treatments), ...prices.map(p => p.treatment).filter(Boolean)])];
  const inferred = names.filter(name => !existingNames.has(name)).flatMap(name => {
    const price = prices.find(p => p.treatment === name && hasEvidence(p));
    const evidence = hasEvidence(source) ? source : price;
    if (!evidence) return [];
    const risks = array(clinic.downtimeAndRisks).filter(r => !referenceOnly(r) && r.treatment === name && hasEvidence(r) && /ダウンタイム/.test(`${r.title || ''} ${r.description || ''}`));
    const durations = risks.map(r => downtimeUpperDays(r.description));
    const days = durations.length && durations.every(d => d !== null) ? Math.max(...durations) : null;
    const risk = days !== null ? risks[durations.indexOf(days)] : null;
    return [{ name, parts: partsFromTreatmentName(name), downtimeMaxDays: days,
      sourceUrl: days !== null ? risk.sourceUrl : evidence.sourceUrl, verifiedAt: days !== null ? risk.verifiedAt : evidence.verifiedAt }];
  });
  return [...details, ...inferred];
}

function searchablePricing(clinic) {
  return array(clinic.pricing).map(p => {
    if (Object.hasOwn(p, 'amountMin') || !hasEvidence(p)) return p;
    const parsed = priceItem({ name: p.treatment, price: p.displayPrice, conditions: strings(p.conditions), sourceUrl: p.sourceUrl,
      evidence: p.displayPrice, taxIncluded: strings(p.conditions).some(c => /税込/.test(c)) });
    return parsed ? { ...p, amountMin: parsed.amountMin, amountMax: parsed.amountMax } : p;
  });
}

function referenceOnly(item) { return ['group', 'reference', 'unconfirmed'].includes(item.scope); }

function downtimeUpperDays(value) {
  const text = String(value || '').normalize('NFKC');
  if (/ヶ月|か月|カ月|ヵ月|[年月]/.test(text)) return null;
  const durations = [...text.matchAll(/(?:(\d+)\s*(日|週間)?\s*[~〜～－–-]\s*)?(\d+)\s*(日|週間)/g)];
  if (!durations.length) return null;
  const maxima = durations.map(m => Number(m[3]) * (m[4] === '週間' ? 7 : 1));
  return maxima.every(n => n >= 0 && n <= 365) ? Math.max(...maxima) : null;
}

function matchesTreatmentConditions(clinic, filters) {
  const details = searchableTreatmentDetails(clinic);
  const prices = searchablePricing(clinic).filter(p => !referenceOnly(p));
  const candidates = [...details, ...prices.map(price => ({ name: price.treatment }))];
  return candidates.some(t => {
    if (!t.name || (filters.treatment && !normalizeSearchText(t.name).includes(normalizeSearchText(filters.treatment)))) return false;
    if (filters.part && (!hasEvidence(t) || !strings(t.parts).includes(filters.part))) return false;
    if (filters.days != null && (!hasEvidence(t) || !Number.isSafeInteger(t.downtimeMaxDays) || t.downtimeMaxDays < 0 || t.downtimeMaxDays > filters.days)) return false;
    if ((filters.budget != null || filters.budgetMin != null) && !prices.some(price => normalizeSearchText(price.treatment) === normalizeSearchText(t.name) && hasEvidence(price) && Number.isSafeInteger(price.amountMin) && price.amountMin >= 0
      && (filters.budget == null || price.amountMin <= filters.budget)
      && (filters.budgetMin == null || (Number.isSafeInteger(price.amountMax) ? price.amountMax : price.amountMin) >= filters.budgetMin))) return false;
    return true;
  });
}

function matchesFilters(clinic, filters) {
  if (clinic.publicationStatus !== "published") return false;
  if (filters.prefecture && clinic.prefecture !== filters.prefecture) return false;
  if (filters.city && !normalizeSearchText(clinic.city).includes(normalizeSearchText(filters.city))) return false;
  if (filters.verificationStatus && (filters.verificationStatus === 'needs_review'
    ? !['needs_review', 'automated'].includes(clinic.verificationStatus)
    : clinic.verificationStatus !== filters.verificationStatus)) return false;
  if (filters.hasPricing != null && Boolean(clinic.hasPricing || array(clinic.pricing).length) !== filters.hasPricing) return false;
  if ((filters.part || filters.budget != null || filters.budgetMin != null || filters.days != null) && !matchesTreatmentConditions(clinic, filters)) return false;
  if (filters.treatment) {
    const treatments = [...array(clinic.treatments), ...array(clinic.tags), ...array(clinic.treatmentDetails).map(t => t.name)].map(normalizeSearchText);
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

function createClinicHandler({ authenticate = authorize, getStore, readCasePhotos = require('./clinic-case-photos').createCasePhotoReader() } = {}) {
  if (typeof getStore !== "function") throw new TypeError("getStore is required");
  return async (request) => {
    try {
      await authenticate(request);
      if (request.method !== "GET") return { status: 405, data: { error: "Method not allowed" } };
      const url = new URL(request.url, "http://localhost");
      const detailMatch = /^\/api\/clinics\/([a-zA-Z0-9_-]{1,128})$/.exec(url.pathname);
      const store = getStore();

      const photoMatch = /^\/api\/clinics\/([a-zA-Z0-9_-]{1,128})\/case-photos$/.exec(url.pathname);
      if(photoMatch){
        if([...url.searchParams.keys()].some(key=>key!=='part'))return {status:404,data:{error:'Not found'}};
        const part=cleanText(url.searchParams.get('part'),10,'希望部位');
        if(part&&!TREATMENT_PARTS.has(part))throw new ClinicInputError('希望部位を確認してください。');
        const clinic=await store.get(validClinicId(photoMatch[1]));
        if(!clinic)return {status:404,data:{error:'クリニック情報が見つかりません。'}};
        return {status:200,data:await readCasePhotos(clinic,{part})};
      }
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
  validClinicId,
  downtimeUpperDays,
  TREATMENT_PARTS
};
