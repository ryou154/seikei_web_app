const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLACES_FIELD_MASK,
  normalizeOptions,
  toCandidate,
  requestTextSearch,
  discoverClinicCandidates,
  selectAutoPublishCandidates,
  autoPublishedClinicDocument,
  writeAutoPublishedClinics,
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

function publishablePlace(id, name, prefecture = "大阪府") {
  return {
    ...place(id, name),
    formattedAddress: `${prefecture}大阪市北区梅田1-1-1`,
    addressComponents: [
      { longText: prefecture, types: ["administrative_area_level_1"] },
      { longText: "大阪市", types: ["locality"] },
      { longText: "北区", types: ["sublocality_level_1"] }
    ],
    nationalPhoneNumber: "06-0000-0000",
    regularOpeningHours: { weekdayDescriptions: ["月曜日: 10:00～19:00"] },
    businessStatus: "OPERATIONAL",
    websiteUri: `https://example.com/${id}`,
    googleMapsUri: `https://maps.google.com/?cid=${id}`
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
  assert.equal(PLACES_FIELD_MASK.includes("websiteUri"), true);
  assert.equal(JSON.parse(captured.options.body).pageSize, 20);
});

test("automatic publication keeps only operational exact-prefecture clinics with official sites", () => {
  const candidates = [
    toCandidate(publishablePlace("ChIJpublishable001", "公開候補"), "大阪府", "美容外科", "now"),
    toCandidate({ ...publishablePlace("ChIJclosedclinic1", "閉業院"), businessStatus: "CLOSED_PERMANENTLY" }, "大阪府", "美容外科", "now"),
    toCandidate({ ...publishablePlace("ChIJwrongprefect1", "県外院", "京都府") }, "大阪府", "美容外科", "now"),
    toCandidate({ ...publishablePlace("ChIJnositeclinic", "サイトなし"), websiteUri: "" }, "大阪府", "美容外科", "now")
  ];
  const selected = selectAutoPublishCandidates(candidates, { prefectures: ["大阪府"], limitPerPrefecture: 10 });
  assert.deepEqual(selected.map((candidate) => candidate.name), ["公開候補"]);
});

test("automatic publication respects each prefecture limit including existing publications", () => {
  const candidates = Array.from({ length: 5 }, (_, index) => toCandidate(
    publishablePlace(`ChIJlimitclinic${index}`, `候補${index}`),
    "大阪府",
    "美容外科",
    "now"
  ));
  const selected = selectAutoPublishCandidates(candidates, {
    prefectures: ["大阪府"],
    limitPerPrefecture: 3,
    existingPublishedCounts: new Map([["大阪府", 2]])
  });
  assert.equal(selected.length, 1);
});

test("automatic publication documents are labelled automated and keep claims empty", () => {
  const candidate = toCandidate(publishablePlace("ChIJdocument001", "自動公開院"), "大阪府", "美容外科", "fetched");
  const document = autoPublishedClinicDocument(candidate, "now");
  assert.equal(document.publicationStatus, "published");
  assert.equal(document.verificationStatus, "automated");
  assert.equal(document.prefecture, "大阪府");
  assert.deepEqual(document.treatments, []);
  assert.deepEqual(document.pricing, []);
  assert.equal(document.sources[0].type, "official");
});

test("automatic publication writes at most the configured number", async () => {
  const candidates = Array.from({ length: 3 }, (_, index) => toCandidate(
    publishablePlace(`ChIJwriteclinic${index}`, `候補${index}`),
    "大阪府",
    "美容外科",
    "fetched"
  ));
  const writes = [];
  const collection = {
    where() { return { async get() { return { docs: [] }; } }; },
    doc(id) { return { id }; }
  };
  const db = {
    collection() { return collection; },
    async getAll(...references) {
      return references.map(() => ({ exists: false, data: () => ({}) }));
    },
    batch() {
      return {
        set(reference, data, options) { writes.push({ reference, data, options }); },
        async commit() {}
      };
    }
  };
  const result = await writeAutoPublishedClinics(db, candidates, {
    prefectures: ["大阪府"],
    limitPerPrefecture: 2,
    now: "now"
  });
  assert.equal(result.published, 2);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].data.verificationStatus, "automated");
});

test("automatic publication never overwrites manually reviewed candidates", async () => {
  const candidate = toCandidate(
    publishablePlace("ChIJreviewedclinic", "確認中の院"),
    "大阪府",
    "美容外科",
    "fetched"
  );
  const writes = [];
  const collection = {
    where() { return { async get() { return { docs: [] }; } }; },
    doc(id) { return { id }; }
  };
  const db = {
    collection() { return collection; },
    async getAll() {
      return [{
        exists: true,
        data: () => ({ verificationStatus: "needs_review", reviewedBy: "admin@example.com" })
      }];
    },
    batch() {
      return {
        set(...args) { writes.push(args); },
        async commit() {}
      };
    }
  };
  const result = await writeAutoPublishedClinics(db, [candidate], {
    prefectures: ["大阪府"],
    limitPerPrefecture: 10,
    now: "now"
  });
  assert.equal(result.published, 0);
  assert.equal(result.skippedReviewed, 1);
  assert.equal(writes.length, 0);
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
  const automatic = parseArguments(["--all", "--auto-publish", "--limit-per-prefecture", "5"]);
  assert.equal(automatic.execute, true);
  assert.equal(automatic.write, true);
  assert.equal(automatic.limitPerPrefecture, 5);
});
