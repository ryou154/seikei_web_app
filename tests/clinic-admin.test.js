const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createClinicAdminHandler,
  createClinicAdminStore,
  normalizeAdminClinicUpdate,
  requestPlacePreview,
  validAdminClinicId
} = require("../clinic-admin");

process.env.AUTH_ALLOWED_EMAILS = "admin@example.com,member@example.com";

test("admin candidate IDs accept Google Place IDs up to 200 characters", () => {
  const id = `place_${"a".repeat(194)}`;
  assert.equal(validAdminClinicId(id), id);
  assert.throws(() => validAdminClinicId(`${id}x`), /候補ID/);
  assert.throws(() => validAdminClinicId("place/id"), /候補ID/);
});

function request(method, url, body, contentType = "application/json") {
  return { method, url, body, headers: { authorization: "Bearer test", "content-type": contentType } };
}

function validBody(overrides = {}) {
  return {
    name: "大阪テスト美容外科",
    prefecture: "大阪府",
    city: "大阪市",
    area: "梅田",
    address: "大阪府大阪市北区",
    phone: "06-0000-0000",
    officialUrl: "https://example.com/clinic",
    businessStatus: "OPERATIONAL",
    openingHours: "10:00-19:00",
    treatments: ["二重", "鼻整形"],
    tags: ["目元"],
    pricing: [{
      treatment: "二重",
      displayPrice: "50,000円〜",
      conditions: ["自由診療"],
      additionalCosts: ["麻酔代別"],
      sourceUrl: "https://example.com/price"
    }],
    doctors: [{
      name: "確認医師",
      title: "院長",
      specialties: ["目元"],
      qualifications: ["専門医"],
      sourceUrl: "https://example.com/doctor"
    }],
    caseInformation: {
      summary: "年間100件",
      period: "2025年",
      scope: "院内集計",
      sourceUrl: "https://example.com/cases"
    },
    downtimeAndRisks: [{
      title: "腫れ",
      description: "1週間程度",
      treatment: "二重",
      sourceUrl: "https://example.com/risk"
    }],
    warrantyAndAftercare: [{
      title: "再診",
      description: "術後診察あり",
      treatment: "二重",
      sourceUrl: "https://example.com/aftercare"
    }],
    sources: [{ url: "https://example.com/clinic", type: "official" }],
    publicationStatus: "draft",
    verificationStatus: "needs_review",
    ...overrides
  };
}

test("admin updates normalize structured official data without accepting ownership fields", () => {
  const result = normalizeAdminClinicUpdate(
    { ...validBody(), placeId: "forged", reviewedBy: "forged@example.com" },
    { email: "admin@example.com" },
    "2026-10-13T00:00:00.000Z"
  );
  assert.equal(result.reviewedBy, "admin@example.com");
  assert.equal(result.placeId, undefined);
  assert.equal(result.pricing[0].verifiedAt, "2026-10-13T00:00:00.000Z");
  assert.equal(result.doctors[0].name, "確認医師");
  assert.equal(result.hasPricing, true);
});

test("publishing requires verified status and essential official sources", () => {
  assert.throws(() => normalizeAdminClinicUpdate(
    validBody({ publicationStatus: "published", verificationStatus: "needs_review" }),
    { email: "admin@example.com" }
  ), /確認済み/);
  assert.throws(() => normalizeAdminClinicUpdate(
    validBody({ publicationStatus: "published", verificationStatus: "verified", sources: [] }),
    { email: "admin@example.com" }
  ), /情報源/);
  const published = normalizeAdminClinicUpdate(
    validBody({ publicationStatus: "published", verificationStatus: "verified" }),
    { email: "admin@example.com" },
    "now"
  );
  assert.equal(published.publicationStatus, "published");
  assert.equal(published.verifiedAt, "now");
});

function setup({ email = "admin@example.com", store, discoverCandidates, extractOfficial, geminiApiKey = "gemini-test-key" } = {}) {
  const database = store || {
    async list() { return { clinics: [{ id: "candidate-1", publicationStatus: "draft" }], nextCursor: "next" }; },
    async get(id) { return id === "candidate-1" ? { id, publicationStatus: "draft" } : null; },
    async update(id, data) { return id === "candidate-1" ? { id, ...data } : null; },
    async importCandidates(candidates) { return { inserted: candidates.length, updated: 0 }; },
    async autoPublishCandidates(candidates) { return { published: candidates.length, skippedReviewed: 0, skippedExisting: 0 }; },
    async listForOfficialSync() {
      return [{ id: "candidate-1", name: "候補名", officialUrl: "https://example.com" }];
    },
    async saveOfficialExtraction() { return { changed: true, autoApplied: false }; }
  };
  return createClinicAdminHandler({
    authenticate: async () => ({ uid: "user", email }),
    getStore: () => database,
    parseBody: async (input) => input.body,
    getPlacePreview: async (id) => ({ placeId: id, name: "候補名", attribution: "Google" }),
    discoverCandidates: discoverCandidates || (async () => ({
      candidates: [{ placeId: "candidate-2" }],
      stats: { requests: 2, rawResults: 3, uniqueCandidates: 1 }
    })),
    extractOfficial: extractOfficial || (async () => ({ extraction: { treatments: [] }, model: "gemini-test" })),
    placesApiKey: "test-key",
    geminiApiKey
  });
}

test("admin routes list, read, preview and update candidates", async () => {
  const handler = setup();
  const list = await handler(request("GET", "/api/admin/clinics?status=draft&limit=30"));
  assert.equal(list.status, 200);
  assert.equal(list.data.clinics[0].id, "candidate-1");
  assert.equal((await handler(request("GET", "/api/admin/clinics/candidate-1"))).status, 200);
  assert.equal((await handler(request("GET", "/api/admin/clinics/candidate-1/place-preview"))).data.place.name, "候補名");
  const updated = await handler(request("PUT", "/api/admin/clinics/candidate-1", validBody()));
  assert.equal(updated.status, 200);
  assert.equal(updated.data.clinic.reviewedBy, "admin@example.com");
});

test("admin list accepts up to ten prefectures as an explicit filter", async () => {
  let received;
  const handler = setup({
    store: {
      async list(options) {
        received = options;
        return { clinics: [], nextCursor: "" };
      }
    }
  });
  const result = await handler(request("GET", "/api/admin/clinics?status=draft&limit=30&prefecture=大阪府&prefecture=京都府"));
  assert.equal(result.status, 200);
  assert.deepEqual(received.prefectures, ["大阪府", "京都府"]);
  assert.equal((await handler(request("GET", "/api/admin/clinics?prefecture=海外"))).status, 400);
});

test("admin can collect one prefecture into private draft candidates", async () => {
  let options;
  const handler = setup({
    discoverCandidates: async (input) => {
      options = input;
      return {
        candidates: [{ placeId: "candidate-2" }, { placeId: "candidate-3" }],
        stats: { requests: 2, rawResults: 4, uniqueCandidates: 2 }
      };
    }
  });
  const result = await handler(request("POST", "/api/admin/clinics/discover", {
    prefecture: "大阪府",
    maxPages: 1,
    confirmed: true
  }));
  assert.equal(result.status, 200);
  assert.equal(result.data.inserted, 2);
  assert.equal(result.data.requests, 2);
  assert.deepEqual(options.prefectures, ["大阪府"]);
  assert.equal(options.apiKey, "test-key");
});

test("admin can automatically publish a guarded number for selected prefectures", async () => {
  let discoveryOptions;
  let publishOptions;
  const handler = setup({
    discoverCandidates: async (options) => {
      discoveryOptions = options;
      return {
        candidates: [{ placeId: "candidate-2" }, { placeId: "candidate-3" }],
        stats: { requests: 4, rawResults: 20, uniqueCandidates: 2 }
      };
    },
    store: {
      async autoPublishCandidates(candidates, options) {
        publishOptions = options;
        return { published: candidates.length, skippedReviewed: 0, skippedExisting: 0 };
      }
    }
  });
  const result = await handler(request("POST", "/api/admin/clinics/auto-publish", {
    prefectures: ["大阪府", "京都府"],
    limitPerPrefecture: 10,
    maxPages: 1,
    confirmed: true
  }));
  assert.equal(result.status, 200);
  assert.equal(result.data.published, 2);
  assert.deepEqual(discoveryOptions.prefectures, ["大阪府", "京都府"]);
  assert.deepEqual(publishOptions, { prefectures: ["大阪府", "京都府"], limitPerPrefecture: 10 });
});

test("admin extracts official information for a guarded published-clinic batch", async () => {
  let listed;
  let extracted;
  let saved;
  const handler = setup({
    store: {
      async listForOfficialSync(options) {
        listed = options;
        return [{ id: "candidate-1", name: "候補名", officialUrl: "https://example.com" }];
      },
      async saveOfficialExtraction(id, extraction, options) {
        saved = { id, extraction, options };
        return { changed: true, autoApplied: true };
      }
    },
    extractOfficial: async (options) => {
      extracted = options;
      return { extraction: { treatments: [{ name: "二重" }] }, model: "gemini-test" };
    }
  });
  const result = await handler(request("POST", "/api/admin/clinics/extract-official", {
    prefectures: ["大阪府"], limit: 5, autoApply: true, confirmed: true
  }));
  assert.equal(result.status, 200);
  assert.deepEqual(listed, { prefectures: ["大阪府"], limit: 5 });
  assert.equal(extracted.sourceOfficialUrl, "https://example.com");
  assert.equal(saved.id, "candidate-1");
  assert.equal(saved.options.autoApply, true);
  assert.equal(result.data.autoApplied, 1);
});

test("official extraction requires confirmation and a configured Gemini key", async () => {
  const unconfirmed = await setup()(request("POST", "/api/admin/clinics/extract-official", {
    prefectures: ["大阪府"], limit: 1, confirmed: false
  }));
  assert.equal(unconfirmed.status, 400);
  const missingKey = await setup({ geminiApiKey: "" })(request("POST", "/api/admin/clinics/extract-official", {
    prefectures: ["大阪府"], limit: 1, confirmed: true
  }));
  assert.equal(missingKey.status, 503);
});

test("non-admins, bad media types and unsupported routes fail closed", async () => {
  assert.equal((await setup({ email: "outsider@example.com" })(request("GET", "/api/admin/clinics"))).status, 403);
  assert.equal((await setup()(request("PUT", "/api/admin/clinics/candidate-1", validBody(), "text/plain"))).status, 415);
  assert.equal((await setup()(request("DELETE", "/api/admin/clinics/candidate-1"))).status, 405);
  assert.equal((await setup()(request("GET", "/api/admin/unknown"))).status, 404);
  assert.equal((await setup()(request("POST", "/api/admin/clinics/discover", {
    prefecture: "大阪府", maxPages: 1, confirmed: false
  }))).status, 400);
});

test("Places preview returns temporary basic information for review", async () => {
  let captured;
  const preview = await requestPlacePreview("ChIJabcdefghijklm", "key", async (url, options) => {
    captured = { url, options };
    return { ok: true, async json() {
      return {
        id: "ChIJabcdefghijklm",
        displayName: { text: "候補名" },
        formattedAddress: "大阪府大阪市北区梅田1-1-1",
        addressComponents: [
          { longText: "大阪府", types: ["administrative_area_level_1"] },
          { longText: "大阪市", types: ["locality"] },
          { longText: "北区", types: ["sublocality_level_1"] }
        ],
        nationalPhoneNumber: "06-0000-0000",
        regularOpeningHours: { weekdayDescriptions: ["月曜日: 10:00～19:00"] },
        businessStatus: "OPERATIONAL",
        websiteUri: "https://example.com/clinic",
        googleMapsUri: "https://maps.google.com/example"
      };
    } };
  });
  assert.equal(preview.name, "候補名");
  assert.equal(preview.prefecture, "大阪府");
  assert.equal(preview.city, "大阪市");
  assert.equal(preview.area, "北区");
  assert.equal(preview.officialUrl, "https://example.com/clinic");
  assert.match(captured.options.headers["X-Goog-FieldMask"], /websiteUri/);
  assert.doesNotMatch(captured.options.headers["X-Goog-FieldMask"], /reviews|photos|rating/);
});

test("Firestore admin store paginates drafts and merges reviewed fields", async () => {
  const calls = [];
  const documents = [
    { id: "a", data: () => ({ placeId: "a", publicationStatus: "draft" }) },
    { id: "b", data: () => ({ placeId: "b", publicationStatus: "draft" }) },
    { id: "c", data: () => ({ placeId: "c", publicationStatus: "draft" }) }
  ];
  const reference = {
    async get() { return { exists: true, id: "a", data: () => ({ placeId: "a", publicationStatus: "draft" }) }; },
    async set(data, options) { calls.push(["set", data, options]); }
  };
  const query = {
    where(...args) { calls.push(["where", ...args]); return this; },
    orderBy(value) { calls.push(["orderBy", value]); return this; },
    startAfter(value) { calls.push(["startAfter", value]); return this; },
    limit(value) { calls.push(["limit", value]); return this; },
    async get() { return { docs: documents }; },
    doc() { return reference; }
  };
  const store = createClinicAdminStore({ collection: () => query });
  const result = await store.list({ status: "draft", limit: 2, cursor: "previous" });
  assert.deepEqual(result.clinics.map((item) => item.id), ["a", "b"]);
  assert.equal(result.nextCursor, "b");
  assert.equal(calls.some((call) => call[0] === "where" && call[3] === "draft"), true);
  await store.update("a", { name: "確認済み" });
  assert.deepEqual(calls.at(-1), ["set", { name: "確認済み" }, { merge: true }]);
});

test("Firestore admin store merges selected prefectures without duplicates", async () => {
  const document = (id, prefecture, publicationStatus = "draft") => ({
    id,
    data: () => ({ placeId: id, prefecture, discoveryPrefectures: [prefecture], publicationStatus })
  });
  const osaka = document("osaka", "大阪府");
  const shared = document("shared", "大阪府");
  const kyoto = document("kyoto", "京都府");
  const published = document("published", "京都府", "published");
  const collection = {
    where(field, operator, value) {
      assert.ok(["discoveryPrefectures", "prefecture"].includes(field));
      assert.ok(["array-contains", "=="].includes(operator));
      const docs = value === "大阪府" ? [osaka, shared] : [shared, kyoto, published];
      return { async get() { return { docs }; } };
    }
  };
  const store = createClinicAdminStore({ collection: () => collection });
  const result = await store.list({ status: "draft", limit: 30, cursor: "", prefectures: ["大阪府", "京都府"] });
  assert.deepEqual(result.clinics.map((clinic) => clinic.id), ["kyoto", "osaka", "shared"]);
  assert.equal(result.nextCursor, "");
});
