const test = require("node:test");
const assert = require("node:assert/strict");
const {
  BillingUsageError,
  categoryFor,
  createBillingUsageService,
  loadBillingConfig,
  monthRange,
  summarizeRows
} = require("../billing-usage");

const configuredEnv = {
  BILLING_EXPORT_PROJECT_ID: "billing-project-123",
  BILLING_EXPORT_DATASET: "cloud_billing",
  BILLING_EXPORT_TABLE: "gcp_billing_export_v1_ABC_123",
  BILLING_QUERY_LOCATION: "US",
  FIREBASE_PROJECT_ID: "project-9e754eaa-8fe7-4918-87c"
};

test("billing configuration is disabled until every required value exists", () => {
  assert.equal(loadBillingConfig({}), null);
  assert.equal(loadBillingConfig(configuredEnv).dataset, "cloud_billing");
  assert.throws(() => loadBillingConfig({ ...configuredEnv, BILLING_EXPORT_TABLE: "bad.table" }), BillingUsageError);
});

test("billing month follows Japan time at the UTC year boundary", () => {
  assert.deepEqual(monthRange(new Date("2026-12-31T16:00:00Z")), {
    month: "2027-01",
    start: "2026-12-31T15:00:00.000Z",
    end: "2027-01-31T15:00:00.000Z"
  });
});

test("billing rows are grouped into the displayed services", () => {
  assert.equal(categoryFor("Google Maps Platform", "Places API Text Search"), "places");
  assert.equal(categoryFor("Gemini API", "Gemini Flash input"), "gemini");
  assert.equal(categoryFor("Cloud Run", "CPU allocation time"), "cloudRun");
  assert.deepEqual(summarizeRows([
    { service: "Gemini API", sku: "Input", currency: "JPY", cost: "12.4" },
    { service: "Google Maps Platform", sku: "Places API", currency: "JPY", cost: 20 },
    { service: "Cloud Run", sku: "CPU", currency: "JPY", cost: 3 },
    { service: "Artifact Registry", sku: "Storage", currency: "JPY", cost: 1 }
  ]), {
    currency: "JPY",
    costs: { gemini: 12.4, places: 20, cloudRun: 3, other: 1, total: 36.4 }
  });
});

test("billing service queries only the configured app project and current month", async () => {
  let options;
  const service = createBillingUsageService({
    env: configuredEnv,
    now: () => new Date("2026-11-10T06:00:00Z"),
    createClient: () => ({
      async query(value) {
        options = value;
        return [[{ service: "Gemini API", sku: "Input", currency: "JPY", cost: 50 }]];
      }
    })
  });
  const result = await service.getMonthUsage();
  assert.equal(result.configured, true);
  assert.equal(result.month, "2026-11");
  assert.equal(result.costs.gemini, 50);
  assert.equal(options.params.appProjectId, configuredEnv.FIREBASE_PROJECT_ID);
  assert.equal(options.maximumBytesBilled, "1000000000");
  assert.match(options.query, /billing-project-123\.cloud_billing\.gcp_billing_export_v1_ABC_123/);
});

test("billing service reports missing setup without opening BigQuery", async () => {
  const service = createBillingUsageService({
    env: {},
    createClient: () => { throw new Error("must not run"); }
  });
  assert.deepEqual(await service.getMonthUsage(), {
    configured: false,
    message: "Cloud BillingのBigQuery出力が未設定です。"
  });
});
