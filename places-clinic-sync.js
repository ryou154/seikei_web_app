const { PREFECTURES } = require("./account-store");

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "nextPageToken"
].join(",");
const DEFAULT_KEYWORDS = ["美容外科", "美容クリニック"];
const MAX_PAGES = 3;
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

function toCandidate(place, prefecture, keyword, fetchedAt) {
  const placeId = typeof place?.id === "string" ? place.id : "";
  const name = typeof place?.displayName?.text === "string" ? place.displayName.text.trim() : "";
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(placeId) || !name) return null;
  return {
    id: placeId,
    placeId,
    // The name is for this command's preview only. It is not persisted.
    name,
    discoveryPrefectures: [prefecture],
    discoveryQueries: [`${keyword} ${prefecture}`],
    placesFetchedAt: fetchedAt
  };
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
  PlacesSyncError,
  normalizeOptions,
  toCandidate,
  requestTextSearch,
  discoverClinicCandidates,
  newClinicDocument,
  refreshedPlaceFields,
  writeClinicCandidates
};
