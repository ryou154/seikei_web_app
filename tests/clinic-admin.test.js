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

function setup({ email = "admin@example.com", store } = {}) {
  const database = store || {
    async list() { return { clinics: [{ id: "candidate-1", publicationStatus: "draft" }], nextCursor: "next" }; },
    async get(id) { return id === "candidate-1" ? { id, publicationStatus: "draft" } : null; },
    async update(id, data) { return id === "candidate-1" ? { id, ...data } : null; }
  };
  return createClinicAdminHandler({
    authenticate: async () => ({ uid: "user", email }),
    getStore: () => database,
    parseBody: async (input) => input.body,
    getPlacePreview: async (id) => ({ placeId: id, name: "候補名", attribution: "Google" }),
    placesApiKey: "test-key"
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

test("non-admins, bad media types and unsupported routes fail closed", async () => {
  assert.equal((await setup({ email: "outsider@example.com" })(request("GET", "/api/admin/clinics"))).status, 403);
  assert.equal((await setup()(request("PUT", "/api/admin/clinics/candidate-1", validBody(), "text/plain"))).status, 415);
  assert.equal((await setup()(request("DELETE", "/api/admin/clinics/candidate-1"))).status, 405);
  assert.equal((await setup()(request("GET", "/api/admin/unknown"))).status, 404);
});

test("Places preview requests only transient identification fields", async () => {
  let captured;
  const preview = await requestPlacePreview("ChIJabcdefghijklm", "key", async (url, options) => {
    captured = { url, options };
    return { ok: true, async json() {
      return { id: "ChIJabcdefghijklm", displayName: { text: "候補名" }, googleMapsUri: "https://maps.google.com/example" };
    } };
  });
  assert.equal(preview.name, "候補名");
  assert.equal(captured.options.headers["X-Goog-FieldMask"], "id,displayName,googleMapsUri");
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
