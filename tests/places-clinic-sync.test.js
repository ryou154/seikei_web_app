const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLACES_FIELD_MASK,
  normalizeOptions,
  toCandidate,
  requestTextSearch,
  discoverClinicCandidates,
  newClinicDocument,
  refreshedPlaceFields,
  writeClinicCandidates
} = require("../places-clinic-sync");
const { parseArguments, plan } = require("../scripts/sync-google-places");

function place(id, name, prefecture = "大阪府") {
  return {
    id,
    displayName: { text: name, languageCode: "ja" }
  };
}

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; }
  };
}

test("normalizes prefectures, keywords and guarded page count", () => {
  const options = normalizeOptions({
    prefectures: ["大阪府", "大阪府"],
    keywords: ["美容外科"],
    maxPages: 2
  });
  assert.deepEqual(options.prefectures, ["大阪府"]);
  assert.throws(() => normalizeOptions({ prefectures: ["大阪市"] }), /都道府県/);
  assert.throws(() => normalizeOptions({ prefectures: ["大阪府"], maxPages: 4 }), /1〜3/);
});

test("Text Search uses POST and a narrow field mask", async () => {
  let captured;
  const data = await requestTextSearch({
    apiKey: "test-key",
    textQuery: "美容外科 大阪府",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return response({ places: [] });
    }
  });
  assert.deepEqual(data.places, []);
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers["X-Goog-FieldMask"], PLACES_FIELD_MASK);
  assert.equal(PLACES_FIELD_MASK.includes("photos"), false);
  assert.equal(PLACES_FIELD_MASK.includes("reviews"), false);
  assert.equal(JSON.parse(captured.options.body).pageSize, 20);
});

test("transient Places errors retry with bounded attempts", async () => {
  let calls = 0;
  const waits = [];
  const result = await requestTextSearch({
    apiKey: "test-key",
    textQuery: "美容外科 大阪府",
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? response({ error: { message: "busy" } }, 429)
        : response({ places: [] });
    },
    wait: async (milliseconds) => waits.push(milliseconds)
  });
  assert.deepEqual(result.places, []);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [500]);
});

test("candidate conversion keeps only transient preview data and discovery metadata", () => {
  const candidate = toCandidate(place("ChIJabcdefghijklm", "大阪美容外科"), "大阪府", "美容外科", "now");
  assert.equal(candidate.placeId, "ChIJabcdefghijklm");
  assert.equal(candidate.name, "大阪美容外科");
  assert.deepEqual(candidate.discoveryPrefectures, ["大阪府"]);
});

test("discovery paginates sequentially and deduplicates Place IDs", async () => {
  const pages = [
    { places: [place("ChIJabcdefghijklm", "大阪美容外科")], nextPageToken: "next" },
    { places: [place("ChIJabcdefghijklm", "大阪美容外科"), place("ChIJsecondplace12", "梅田美容クリニック")] }
  ];
  let calls = 0;
  const result = await discoverClinicCandidates({
    apiKey: "test-key",
    prefectures: ["大阪府"],
    keywords: ["美容外科"],
    maxPages: 2,
    fetchImpl: async () => response(pages[calls++]),
    wait: async () => {},
    requestDelayMs: 0,
    now: () => "2026-10-13T00:00:00.000Z"
  });
  assert.equal(result.stats.requests, 2);
  assert.equal(result.stats.rawResults, 3);
  assert.equal(result.stats.uniqueCandidates, 2);
  assert.equal(result.stats.duplicates, 1);
});

test("new candidates stay private and refreshes do not overwrite reviewed fields", () => {
  const candidate = toCandidate(place("ChIJabcdefghijklm", "大阪美容外科"), "大阪府", "美容外科", "fetched");
  const created = newClinicDocument(candidate, "now");
  assert.equal(created.publicationStatus, "draft");
  assert.equal(created.verificationStatus, "unverified");
  assert.equal(created.name, undefined);
  assert.equal(created.address, undefined);
  const refreshed = refreshedPlaceFields(candidate, "later");
  assert.equal(refreshed.publicationStatus, undefined);
  assert.equal(refreshed.verificationStatus, undefined);
  assert.equal(refreshed.officialUrl, undefined);
  assert.equal(refreshed.name, undefined);
});

test("Firestore upsert inserts drafts and merges only Places fields into existing records", async () => {
  const candidates = [
    toCandidate(place("ChIJabcdefghijklm", "既存院"), "大阪府", "美容外科", "fetched"),
    toCandidate(place("ChIJsecondplace12", "新規院"), "大阪府", "美容外科", "fetched")
  ];
  const writes = [];
  const db = {
    collection() {
      return { doc(id) { return { id }; } };
    },
    async getAll() {
      return [{ exists: true }, { exists: false }];
    },
    batch() {
      return {
        set(reference, data, options) { writes.push({ reference, data, options }); },
        async commit() {}
      };
    }
  };
  const result = await writeClinicCandidates(db, candidates, { now: "now" });
  assert.deepEqual(result, { inserted: 1, updated: 1 });
  assert.deepEqual(writes[0].options, { merge: true });
  assert.equal(writes[0].data.name, undefined);
  assert.equal(writes[1].data.publicationStatus, "draft");
  assert.equal(writes[1].data.placeId, "ChIJsecondplace12");
});

test("CLI defaults to a zero-cost plan and reports maximum requests", () => {
  const options = parseArguments(["--prefecture", "大阪府", "--max-pages", "2"]);
  assert.equal(options.execute, false);
  assert.equal(plan(options).maximumRequests, 4);
  const nationwide = parseArguments(["--all"]);
  assert.equal(plan(nationwide).maximumRequests, 94);
  assert.throws(() => parseArguments(["--all", "--prefecture", "大阪府"]), /同時/);
});
