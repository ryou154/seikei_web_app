const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createClinicHandler,
  createClinicStore,
  normalizeClinicQuery,
  publicClinic,
  MAX_LIMIT
} = require("../clinic-store");

test('automated reference prices expose their extraction date without asserting treatment availability', () => {
  const fee = { treatment: 'ピコレーザー', displayPrice: '10,000円', scope: 'reference', amountMin: null, amountMax: null,
    sourceUrl: 'https://clinic.example/price', verifiedAt: '2026-01-01T00:00:00.000Z' };
  const value = { verificationStatus: 'automated', officialUrl: 'https://clinic.example/', pricing: [fee] };
  const result = publicClinic('example', value);
  assert.equal(result.verifiedAt, fee.verifiedAt);
  assert.deepEqual(result.treatments, []);
  assert.equal(result.referenceTreatmentDetails[0].name, 'ピコレーザー');
  assert.equal(publicClinic('example', { ...value, verificationStatus: 'unverified' }).verifiedAt, '');
});

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
    detectedData: { treatments: [{ name: "自動抽出候補" }] },
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
  assert.equal(result.data.clinic.detectedData, undefined);
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

test("public projection preserves automated verification status", () => {
  assert.equal(publicClinic("auto", { verificationStatus: "automated" }).verificationStatus, "automated");
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

test('advanced filters validate values and require one treatment with dated evidence',()=>{
  const {matchesFilters}=require('../clinic-store');
  const source={sourceUrl:'https://example.com/official',verifiedAt:'2026-10-13'};
  const clinic={publicationStatus:'published',prefecture:'東京都',treatments:['鼻整形','二重埋没法'],treatmentDetails:[{name:'鼻整形',parts:['鼻'],downtimeMaxDays:30,...source},{name:'二重埋没法',parts:['二重','目元'],downtimeMaxDays:7,...source}],pricing:[{treatment:'鼻整形',amountMin:100000,...source},{treatment:'二重埋没法',amountMin:50000,...source}]};
  const filters=q=>normalizeClinicQuery(new URLSearchParams(q));
  assert.ok(matchesFilters(clinic,filters('part=二重&budget=50000&days=7')));
  for(const q of ['part=鼻&budget=50000&days=7','part=二重&budget=49999&days=7','part=二重&days=3','prefecture=大阪府&part=二重'])assert.equal(matchesFilters(clinic,filters(q)),false,q);
  for(const q of ['part=不明','budget=-1','budget=1.5','days=-1','days=366','days=abc','budget=1000000001'])assert.throws(()=>filters(q));
  assert.equal(filters('budget=0&days=0').budget,0);assert.equal(filters('budget=0&days=0').days,0);
  const missing=structuredClone(clinic);missing.treatmentDetails[1].downtimeMaxDays=null;assert.equal(matchesFilters(missing,filters('part=二重&days=30')),false);
  missing.treatmentDetails[1].sourceUrl='';assert.equal(matchesFilters(missing,filters('part=二重')),false);
  missing.pricing[1].verifiedAt='';assert.equal(matchesFilters(missing,filters('treatment=二重&budget=100000')),false);
  assert.equal(matchesFilters({...clinic,treatmentDetails:[],pricing:[]},filters('part=二重&days=7')),false);
});
test('advanced filters use same treatment name even when tags contain matching words',()=>{
  const {matchesFilters}=require('../clinic-store');const source={sourceUrl:'https://example.com',verifiedAt:'2026-10-13'};
  const clinic={publicationStatus:'published',treatments:['鼻整形','二重'],tags:['鼻'],treatmentDetails:[{name:'二重',parts:['目元'],downtimeMaxDays:7,...source}],pricing:[{treatment:'二重',amountMin:0,...source}]};
  assert.equal(matchesFilters(clinic,normalizeClinicQuery(new URLSearchParams('treatment=鼻&part=目元&budget=0&days=7'))),false);
  assert.equal(matchesFilters(clinic,normalizeClinicQuery(new URLSearchParams('part=目元&budget=0&days=7'))),true);
  const detail=publicClinic('test',clinic,{detail:true});assert.equal(detail.treatmentDetails[0].downtimeMaxDays,7);assert.deepEqual(detail.treatmentDetails[0].parts,['目元']);
});

test('parts search supports published procedure names with dated official evidence', () => {
  const { matchesFilters } = require('../clinic-store');
  const clinic = { publicationStatus: 'published', treatments: ['二重埋没法', '鼻尖形成'], officialUrl: 'https://clinic.example/', verifiedAt: '2026-10-27' };
  const query = q => normalizeClinicQuery(new URLSearchParams(q));
  assert.equal(matchesFilters(clinic, query('part=二重')), true);
  assert.equal(matchesFilters(clinic, query('part=鼻')), true);
  assert.equal(matchesFilters(clinic, query('part=二重&days=7')), false);
  assert.equal(matchesFilters(clinic, query('part=二重&budget=50000')), false);
  const projection = publicClinic('a', clinic);
  assert.deepEqual(projection.treatmentDetails[0].parts, ['二重', '目元']);
  assert.equal(projection.treatmentDetails[0].downtimeMaxDays, null);
  assert.equal(matchesFilters({ ...clinic, verifiedAt: '' }, query('part=二重')), false);
  assert.equal(matchesFilters({ ...clinic, treatmentDetails: [{ name: '二重埋没法', parts: [], sourceUrl: clinic.officialUrl, verifiedAt: clinic.verifiedAt }] }, query('part=二重')), false);
  assert.equal(matchesFilters({ ...clinic, treatments: [], detectedHtmlData: { treatments: [{ name: '二重埋没法', parts: ['二重'] }] } }, query('part=二重')), false);
});

test('published text prices and explicit downtime periods participate in the same procedure search', () => {
  const { matchesFilters } = require('../clinic-store');
  const source = { sourceUrl: 'https://clinic.example/eye', verifiedAt: '2026-10-27' };
  const clinic = { publicationStatus: 'published', officialUrl: 'https://clinic.example/', verifiedAt: source.verifiedAt,
    treatments: ['二重埋没法'], pricing: [{ treatment: '二重埋没法', displayPrice: '68,000円～99,000円(税込)', ...source }],
    downtimeAndRisks: [{ treatment: '二重埋没法', title: 'ダウンタイム', description: '腫れ・内出血が2日～2週間程度生じます。', ...source }] };
  const query = q => normalizeClinicQuery(new URLSearchParams(q));
  assert.ok(matchesFilters(clinic, query('part=二重&budget=70000&days=14&hasPricing=true')));
  assert.equal(matchesFilters(clinic, query('part=二重&budget=67000')), false);
  assert.equal(matchesFilters(clinic, query('part=二重&days=7')), false);
  const detail = publicClinic('a', clinic, { detail: true });
  assert.equal(detail.pricing[0].amountMin, 68000);
  assert.equal(detail.pricing[0].amountMax, 99000);
  assert.equal(detail.treatmentDetails[0].downtimeMaxDays, 14);
  for (const displayPrice of ['68,000円', 'モニター68,000円(税込)', '税込68,000円 別途麻酔20,000円']) {
    assert.equal(matchesFilters({ ...clinic, pricing: [{ ...clinic.pricing[0], displayPrice }] }, query('budget=100000')), false);
  }
  assert.equal(matchesFilters({ ...clinic, downtimeAndRisks: [{ ...clinic.downtimeAndRisks[0], title: 'リスク', description: '内出血が2週間程度生じます。' }] }, query('days=14')), false);
  assert.equal(matchesFilters({ ...clinic, downtimeAndRisks: [{ ...clinic.downtimeAndRisks[0], description: '1～3ヶ月程度。' }] }, query('days=365')), false);
});

test('automated publications appear as needing review without becoming human verified', () => {
  const { matchesFilters } = require('../clinic-store');
  const clinic = { publicationStatus: 'published', verificationStatus: 'automated' };
  const query = s => normalizeClinicQuery(new URLSearchParams(s));
  assert.ok(matchesFilters(clinic, query('verificationStatus=needs_review')));
  assert.ok(matchesFilters(clinic, query('verificationStatus=automated')));
  assert.equal(matchesFilters(clinic, query('verificationStatus=verified')), false);
});

test('budget bands overlap one evidenced price range and reject inverted limits', () => {
  const { matchesFilters } = require('../clinic-store');
  const clinic = { publicationStatus: 'published', pricing: [{ treatment: '鼻尖形成', displayPrice: '税込140,000円〜550,000円', sourceUrl: 'https://clinic.example/price', verifiedAt: '2026-10-27' }] };
  const query = s => normalizeClinicQuery(new URLSearchParams(s));
  assert.ok(matchesFilters(clinic, query('budgetMin=200000&budget=400000')));
  assert.ok(matchesFilters(clinic, query('budgetMin=400000')));
  assert.equal(matchesFilters(clinic, query('budgetMin=600000')), false);
  assert.throws(() => query('budgetMin=400000&budget=200000'));
  assert.throws(() => query('budgetMin=-1'));
});

test('downtime limits include every shorter duration and the boundary day', () => {
  const { matchesFilters } = require('../clinic-store');
  const records = [0, 3, 7, 14, 30, 31, null].map(days => ({ publicationStatus: 'published', treatments: ['二重埋没法'],
    treatmentDetails: [{ name: '二重埋没法', parts: ['二重'], downtimeMaxDays: days, sourceUrl: 'https://clinic.example/eye', verifiedAt: '2026-10-27' }] }));
  for (const limit of [3, 7, 14, 30]) {
    const filters = normalizeClinicQuery(new URLSearchParams({ days: String(limit) }));
    const actual = records.filter(c => matchesFilters(c, filters)).map(c => c.treatmentDetails[0].downtimeMaxDays);
    assert.deepEqual(actual, [0, 3, 7, 14, 30].filter(days => days <= limit));
  }
});
