const { PREFECTURES } = require("./account-store");

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.regularOpeningHours",
  "places.businessStatus",
  "places.websiteUri",
  "places.googleMapsUri",
  "nextPageToken"
].join(",");
const DEFAULT_KEYWORDS = ["美容外科", "美容クリニック"];
const MAX_PAGES = 3;
const MAX_AUTO_PUBLISH_PER_PREFECTURE = 10;
const BATCH_SIZE = 400;

class PlacesSyncError extends Error {
  constructor(message, status = 500) {
    super(message);
    this.status = status;
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function validText(value, maxLength, label) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new PlacesSyncError(`${label}を確認してください。`, 400);
  }
  return value.trim();
}

function normalizeOptions({ prefectures, keywords = DEFAULT_KEYWORDS, maxPages = 1 } = {}) {
  if (!Array.isArray(prefectures) || !prefectures.length) {
    throw new PlacesSyncError("対象都道府県を指定してください。", 400);
  }
  const normalizedPrefectures = [...new Set(prefectures.map((value) => validText(value, 10, "都道府県")))];
  if (normalizedPrefectures.some((value) => !PREFECTURES.includes(value))) {
    throw new PlacesSyncError("対象都道府県を確認してください。", 400);
  }
  if (!Array.isArray(keywords) || !keywords.length || keywords.length > 5) {
    throw new PlacesSyncError("検索キーワードを確認してください。", 400);
  }
  const normalizedKeywords = [...new Set(keywords.map((value) => validText(value, 40, "検索キーワード")))];
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > MAX_PAGES) {
    throw new PlacesSyncError(`ページ数は1〜${MAX_PAGES}で指定してください。`, 400);
  }
  return {
    prefectures: normalizedPrefectures,
    keywords: normalizedKeywords,
    maxPages
  };
}

function addressComponent(place, type) {
  const components = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
  const match = components.find((item) => Array.isArray(item.types) && item.types.includes(type));
  return typeof match?.longText === "string" ? match.longText.trim() : "";
}

function httpsUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function toCandidate(place, prefecture, keyword, fetchedAt) {
  const placeId = typeof place?.id === "string" ? place.id : "";
  const name = typeof place?.displayName?.text === "string" ? place.displayName.text.trim() : "";
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(placeId) || !name) return null;
  const actualPrefecture = addressComponent(place, "administrative_area_level_1");
  return {
    id: placeId,
    placeId,
    name,
    prefecture: actualPrefecture,
    city: addressComponent(place, "locality") || addressComponent(place, "administrative_area_level_2"),
    area: addressComponent(place, "sublocality_level_1") || addressComponent(place, "sublocality_level_2"),
    address: typeof place?.formattedAddress === "string" ? place.formattedAddress.trim() : "",
    phone: typeof place?.nationalPhoneNumber === "string" ? place.nationalPhoneNumber.trim() : "",
    openingHours: Array.isArray(place?.regularOpeningHours?.weekdayDescriptions)
      ? place.regularOpeningHours.weekdayDescriptions.join("\n")
      : "",
    businessStatus: typeof place?.businessStatus === "string" ? place.businessStatus : "",
    officialUrl: httpsUrl(place?.websiteUri),
    googleMapsUrl: httpsUrl(place?.googleMapsUri),
    discoveryPrefectures: [prefecture],
    discoveryQueries: [`${keyword} ${prefecture}`],
    placesFetchedAt: fetchedAt
  };
}

function isAutoPublishEligible(candidate, requestedPrefectures) {
  return candidate
    && requestedPrefectures.includes(candidate.prefecture)
    && candidate.discoveryPrefectures.includes(candidate.prefecture)
    && candidate.businessStatus === "OPERATIONAL"
    && Boolean(candidate.name && candidate.address && candidate.officialUrl);
}

function selectAutoPublishCandidates(candidates, {
  prefectures,
  limitPerPrefecture = MAX_AUTO_PUBLISH_PER_PREFECTURE,
  existingPublishedCounts = new Map()
} = {}) {
  const options = normalizeOptions({ prefectures, keywords: DEFAULT_KEYWORDS, maxPages: 1 });
  if (!Number.isInteger(limitPerPrefecture) || limitPerPrefecture < 1 || limitPerPrefecture > MAX_AUTO_PUBLISH_PER_PREFECTURE) {
    throw new PlacesSyncError(`都道府県ごとの公開件数は1〜${MAX_AUTO_PUBLISH_PER_PREFECTURE}で指定してください。`, 400);
  }
  const counts = new Map(options.prefectures.map((prefecture) => [
    prefecture,
    Math.max(0, Number(existingPublishedCounts.get(prefecture)) || 0)
  ]));
  const selected = [];
  for (const candidate of candidates) {
    if (!isAutoPublishEligible(candidate, options.prefectures)) continue;
    const count = counts.get(candidate.prefecture) || 0;
    if (count >= limitPerPrefecture) continue;
    selected.push(candidate);
    counts.set(candidate.prefecture, count + 1);
  }
  return selected;
}

async function requestTextSearch({
  apiKey,
  textQuery,
  pageToken = "",
  fetchImpl = fetch,
  wait = sleep,
  retries = 2
}) {
  validText(apiKey, 500, "Google Places APIキー");
  validText(textQuery, 100, "検索内容");
  const body = {
    textQuery,
    languageCode: "ja",
    regionCode: "JP",
    pageSize: 20
  };
  if (pageToken) body.pageToken = pageToken;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl(PLACES_TEXT_SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      const message = data.error?.message || `Google Places API error (${response.status})`;
      lastError = new PlacesSyncError(message, response.status);
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === retries) throw lastError;
    } catch (error) {
      lastError = error.name === "AbortError"
        ? new PlacesSyncError("Google Places APIが時間内に応答しませんでした。", 504)
        : error;
      if (attempt === retries || (lastError.status && ![429, 500, 502, 503, 504].includes(lastError.status))) {
        throw lastError;
      }
    } finally {
      clearTimeout(timeout);
    }
    await wait(500 * (attempt + 1));
  }
  throw lastError;
}

async function discoverClinicCandidates({
  apiKey,
  prefectures,
  keywords,
  maxPages,
  fetchImpl = fetch,
  wait = sleep,
  requestDelayMs = 150,
  now = () => new Date().toISOString()
} = {}) {
  const options = normalizeOptions({ prefectures, keywords, maxPages });
  const candidates = new Map();
  let requests = 0;
  let rawResults = 0;
  let duplicates = 0;
  let discarded = 0;

  for (const prefecture of options.prefectures) {
    for (const keyword of options.keywords) {
      let pageToken = "";
      for (let page = 0; page < options.maxPages; page += 1) {
        const data = await requestTextSearch({
          apiKey,
          textQuery: `${keyword} ${prefecture}`,
          pageToken,
          fetchImpl,
          wait
        });
        requests += 1;
        const places = Array.isArray(data.places) ? data.places : [];
        rawResults += places.length;
        const fetchedAt = now();
        for (const place of places) {
          const candidate = toCandidate(place, prefecture, keyword, fetchedAt);
          if (!candidate) {
            discarded += 1;
            continue;
          }
          const existing = candidates.get(candidate.placeId);
          if (existing) {
            duplicates += 1;
            existing.discoveryPrefectures = [...new Set([
              ...existing.discoveryPrefectures,
              ...candidate.discoveryPrefectures
            ])];
            existing.discoveryQueries = [...new Set([...existing.discoveryQueries, ...candidate.discoveryQueries])];
            if (candidate.placesFetchedAt > existing.placesFetchedAt) {
              Object.assign(existing, candidate, {
                discoveryPrefectures: existing.discoveryPrefectures,
                discoveryQueries: existing.discoveryQueries
              });
            }
          } else {
            candidates.set(candidate.placeId, candidate);
          }
        }
        pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
        if (!pageToken) break;
        if (requestDelayMs > 0) await wait(requestDelayMs);
      }
    }
  }

  return {
    candidates: [...candidates.values()],
    stats: {
      requests,
      rawResults,
      uniqueCandidates: candidates.size,
      duplicates,
      discarded
    }
  };
}

function newClinicDocument(candidate, now) {
  return {
    schemaVersion: 1,
    dataSource: "google_places",
    placeId: candidate.placeId,
    discoveryPrefectures: candidate.discoveryPrefectures,
    discoveryQueries: candidate.discoveryQueries,
    verificationStatus: "unverified",
    publicationStatus: "draft",
    discoveredAt: candidate.placesFetchedAt,
    placesCheckedAt: candidate.placesFetchedAt,
    createdAt: now,
    updatedAt: now
  };
}

function refreshedPlaceFields(candidate, now) {
  return {
    placeId: candidate.placeId,
    discoveryPrefectures: candidate.discoveryPrefectures,
    discoveryQueries: candidate.discoveryQueries,
    placesCheckedAt: candidate.placesFetchedAt,
    updatedAt: now
  };
}

function autoPublishedClinicDocument(candidate, now, existing = {}) {
  const officialSource = { url: candidate.officialUrl, type: "official", checkedAt: now };
  const mapsSource = candidate.googleMapsUrl
    ? [{ url: candidate.googleMapsUrl, type: "google_places", checkedAt: now }]
    : [];
  return {
    schemaVersion: 1,
    dataSource: "google_places",
    placeId: candidate.placeId,
    discoveryPrefectures: candidate.discoveryPrefectures,
    discoveryQueries: candidate.discoveryQueries,
    name: candidate.name,
    prefecture: candidate.prefecture,
    city: candidate.city,
    area: candidate.area,
    address: candidate.address,
    phone: candidate.phone,
    openingHours: candidate.openingHours,
    businessStatus: candidate.businessStatus,
    officialUrl: candidate.officialUrl,
    treatments: Array.isArray(existing.treatments) ? existing.treatments : [],
    tags: Array.isArray(existing.tags) ? existing.tags : [],
    pricing: Array.isArray(existing.pricing) ? existing.pricing : [],
    doctors: Array.isArray(existing.doctors) ? existing.doctors : [],
    caseInformation: existing.caseInformation || null,
    downtimeAndRisks: Array.isArray(existing.downtimeAndRisks) ? existing.downtimeAndRisks : [],
    warrantyAndAftercare: Array.isArray(existing.warrantyAndAftercare) ? existing.warrantyAndAftercare : [],
    sources: [officialSource, ...mapsSource],
    hasPricing: Array.isArray(existing.pricing) && existing.pricing.length > 0,
    verificationStatus: "automated",
    publicationStatus: "published",
    placesCheckedAt: candidate.placesFetchedAt,
    autoPublishedAt: now,
    updatedAt: now,
    createdAt: existing.createdAt || now
  };
}

async function writeAutoPublishedClinics(db, candidates, {
  prefectures,
  limitPerPrefecture = MAX_AUTO_PUBLISH_PER_PREFECTURE,
  now = new Date().toISOString()
} = {}) {
  if (!db || !Array.isArray(candidates)) throw new PlacesSyncError("保存データを確認してください。", 400);
  const normalizedPrefectures = normalizeOptions({ prefectures, keywords: DEFAULT_KEYWORDS, maxPages: 1 }).prefectures;
  const collection = db.collection("clinics");
  const publishedIds = new Set();
  const publishedCounts = new Map();
  for (const prefecture of normalizedPrefectures) {
    const snapshot = await collection.where("prefecture", "==", prefecture).get();
    const published = snapshot.docs.filter((document) => document.data()?.publicationStatus === "published");
    publishedCounts.set(prefecture, published.length);
    for (const document of published) publishedIds.add(document.id);
  }
  const eligible = selectAutoPublishCandidates(
    candidates.filter((candidate) => !publishedIds.has(candidate.placeId)),
    { prefectures: normalizedPrefectures, limitPerPrefecture, existingPublishedCounts: publishedCounts }
  );
  let published = 0;
  let skippedReviewed = 0;
  let skippedExisting = publishedIds.size;
  for (let start = 0; start < eligible.length; start += BATCH_SIZE) {
    const chunk = eligible.slice(start, start + BATCH_SIZE);
    const references = chunk.map((candidate) => collection.doc(candidate.placeId));
    const existing = await db.getAll(...references);
    const batch = db.batch();
    for (const [index, candidate] of chunk.entries()) {
      const previous = existing[index].exists ? existing[index].data() : {};
      const manuallyReviewed = previous.verificationStatus === "verified"
        || previous.verificationStatus === "needs_review"
        || Boolean(previous.reviewedAt || previous.reviewedBy);
      if (manuallyReviewed) {
        skippedReviewed += 1;
        continue;
      }
      batch.set(references[index], autoPublishedClinicDocument(candidate, now, previous), { merge: true });
      published += 1;
    }
    await batch.commit();
  }
  return { published, skippedReviewed, skippedExisting, eligible: eligible.length };
}

async function writeClinicCandidates(db, candidates, { now = new Date().toISOString() } = {}) {
  if (!db || !Array.isArray(candidates)) throw new PlacesSyncError("保存データを確認してください。", 400);
  let inserted = 0;
  let updated = 0;
  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const chunk = candidates.slice(start, start + BATCH_SIZE);
    const references = chunk.map((candidate) => db.collection("clinics").doc(candidate.placeId));
    const existing = await db.getAll(...references);
    const batch = db.batch();
    for (const [index, candidate] of chunk.entries()) {
      if (existing[index].exists) {
        batch.set(references[index], refreshedPlaceFields(candidate, now), { merge: true });
        updated += 1;
      } else {
        batch.set(references[index], newClinicDocument(candidate, now));
        inserted += 1;
      }
    }
    await batch.commit();
  }
  return { inserted, updated };
}

module.exports = {
  PLACES_TEXT_SEARCH_URL,
  PLACES_FIELD_MASK,
  DEFAULT_KEYWORDS,
  MAX_PAGES,
  MAX_AUTO_PUBLISH_PER_PREFECTURE,
  PlacesSyncError,
  normalizeOptions,
  toCandidate,
  requestTextSearch,
  discoverClinicCandidates,
  isAutoPublishEligible,
  selectAutoPublishCandidates,
  newClinicDocument,
  refreshedPlaceFields,
  writeClinicCandidates,
  autoPublishedClinicDocument,
  writeAutoPublishedClinics
};
