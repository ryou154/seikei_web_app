const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createClinicHandler,
  createClinicStore,
  normalizeClinicQuery,
  publicClinic,
  MAX_LIMIT
} = require("../clinic-store");

const clinics = [
  {
    id: "clinic-osaka",
    name: "大阪テスト美容外科",
    prefecture: "大阪府",
    city: "大阪市",
    area: "梅田",
    address: "大阪府大阪市北区",
    treatments: ["二重・目元", "鼻整形"],
    tags: ["目元"],
    pricing: [{ treatment: "二重", amount: 50000 }],
    hasPricing: true,
    publicationStatus: "published",
    verificationStatus: "verified",
    officialUrl: "https://example.com/osaka",
    doctors: [{ name: "確認医師", internalReviewNotes: "nested secret" }],
    internalReviewNotes: "must not leak"
  },
  {
    id: "clinic-tokyo",
    name: "東京テスト美容外科",
    prefecture: "東京都",
    city: "新宿区",
    treatments: ["輪郭"],
    pricing: [],
    publicationStatus: "published",
    verificationStatus: "needs_review"
  },
  {
    id: "clinic-draft",
    name: "下書きクリニック",
    prefecture: "大阪府",
    city: "大阪市",
    publicationStatus: "draft",
    verificationStatus: "verified"
  }
];

function request(method, url) {
  return { method, url, headers: { authorization: "Bearer test" } };
}

function setup({ authenticate = async () => ({ uid: "user" }) } = {}) {
  const store = {
    async list(filters) {
      const { matchesFilters } = require("../clinic-store");
      return clinics.filter((clinic) => matchesFilters(clinic, filters));
    },
    async get(id) {
      const clinic = clinics.find((item) => item.id === id);
      return clinic?.publicationStatus === "published" ? clinic : null;
    }
  };
  return createClinicHandler({ authenticate, getStore: () => store });
}

test("normalizes supported clinic filters and limits", () => {
  const filters = normalizeClinicQuery(new URLSearchParams(
    "prefecture=大阪府&treatment=鼻&hasPricing=true&verificationStatus=verified&page=2&limit=10"
  ));
  assert.equal(filters.prefecture, "大阪府");
  assert.equal(filters.treatment, "鼻");
  assert.equal(filters.hasPricing, true);
  assert.equal(filters.page, 2);
  assert.equal(filters.limit, 10);
  assert.throws(() => normalizeClinicQuery(new URLSearchParams(`limit=${MAX_LIMIT + 1}`)), /表示件数/);
  assert.throws(() => normalizeClinicQuery(new URLSearchParams("hasPricing=yes")), /料金条件/);
  assert.throws(() => normalizeClinicQuery(new URLSearchParams("verificationStatus=private")), /確認状態/);
});

test("list filters published clinics and returns pagination", async () => {
  const result = await setup()(request(
    "GET",
    "/api/clinics?prefecture=%E5%A4%A7%E9%98%AA%E5%BA%9C&treatment=%E9%BC%BB&hasPricing=true"
  ));
  assert.equal(result.status, 200);
  assert.equal(result.data.clinics.length, 1);
  assert.equal(result.data.clinics[0].id, "clinic-osaka");
  assert.equal(result.data.pagination.total, 1);
  assert.equal(result.data.clinics[0].internalReviewNotes, undefined);
  assert.equal(result.data.clinics[0].doctors, undefined);
});

test("detail returns public detail fields without internal metadata", async () => {
  const result = await setup()(request("GET", "/api/clinics/clinic-osaka"));
  assert.equal(result.status, 200);
  assert.equal(result.data.clinic.doctors[0].name, "確認医師");
  assert.equal(result.data.clinic.doctors[0].internalReviewNotes, undefined);
  assert.equal(result.data.clinic.internalReviewNotes, undefined);
  assert.equal((await setup()(request("GET", "/api/clinics/clinic-draft"))).status, 404);
});

test("route, method, input and authentication fail closed", async () => {
  const handler = setup();
  assert.equal((await handler(request("POST", "/api/clinics"))).status, 405);
  assert.equal((await handler(request("GET", "/api/clinics/clinic-osaka?secret=1"))).status, 404);
  assert.equal((await handler(request("GET", "/api/clinics?limit=999"))).status, 400);
  const denied = setup({ authenticate: async () => { throw Object.assign(new Error("ログインしてください。"), { status: 401 }); } });
  assert.equal((await denied(request("GET", "/api/clinics"))).status, 401);
});

test("public projection tolerates missing optional fields", () => {
  assert.deepEqual(publicClinic("empty", {}).treatments, []);
  assert.equal(publicClinic("empty", {}).verificationStatus, "unverified");
});

test("Firestore query narrows by prefecture before scanning", async () => {
  const calls = [];
  const snapshot = {
    size: 1,
    docs: [{ id: "clinic-osaka", data: () => clinics[0] }]
  };
  const query = {
    where(...args) { calls.push(["where", ...args]); return this; },
    limit(value) { calls.push(["limit", value]); return this; },
    async get() { return snapshot; }
  };
  const store = createClinicStore({ collection: () => query });
  const filters = normalizeClinicQuery(new URLSearchParams("prefecture=大阪府"));
  const result = await store.list(filters);
  assert.deepEqual(calls[0], ["where", "prefecture", "==", "大阪府"]);
  assert.equal(result.clinics.length, 1);
  assert.equal(result.truncated, false);
});
