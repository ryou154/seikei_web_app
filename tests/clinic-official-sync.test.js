const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GEMINI_INTERACTIONS_URL,
  EXTRACTION_GROUPS,
  checkOfficialExtraction,
  normalizeOfficialExtraction,
  officialExtractionUpdate,
  publicFieldsFromExtraction,
  requestOfficialExtraction,
  sameOfficialDomain
} = require("../clinic-official-sync");

function extracted(overrides = {}) {
  return {
    treatments: [{
      name: "二重埋没法",
      sourceUrl: "https://www.example.com/menu/eye",
      evidence: "二重埋没法を行っています",
      confidence: 0.95
    }],
    pricing: [], doctors: [], caseInformation: [], downtimeAndRisks: [], warrantyAndAftercare: [],
    ...overrides
  };
}

test("official evidence accepts HTTPS pages only on the clinic domain", () => {
  const base = new URL("https://example.com/clinic");
  assert.equal(sameOfficialDomain("https://www.example.com/price", base), true);
  assert.equal(sameOfficialDomain("https://sub.example.com/doctor", base), true);
  assert.equal(sameOfficialDomain("https://portal.example.net/clinic", base), false);
  assert.equal(sameOfficialDomain("http://example.com/price", base), false);
  assert.throws(() => normalizeOfficialExtraction(extracted(), "http://example.com"), /公式サイトURL/);
});

test("normalization removes unsupported and cross-domain evidence", () => {
  const normalized = normalizeOfficialExtraction(extracted({
    treatments: [
      extracted().treatments[0],
      { name: "鼻整形", sourceUrl: "https://portal.example.net/nose", evidence: "掲載", confidence: 1 },
      { name: "", sourceUrl: "https://example.com/empty", evidence: "掲載", confidence: 1 }
    ]
  }), "https://example.com", "2026-10-23T00:00:00.000Z");
  assert.deepEqual(normalized.treatments.map((item) => item.name), ["二重埋没法"]);
  assert.equal(normalized.extractedAt, "2026-10-23T00:00:00.000Z");
});

test("normalization removes non-procedure services and generates search tags", () => {
  const normalized = normalizeOfficialExtraction(extracted({
    treatments: [
      extracted().treatments[0],
      { name: "ナース指名制度", sourceUrl: "https://example.com/service", evidence: "指名できます", confidence: 1 }
    ],
    pricing: [
      { treatment: "VIPルーム", displayPrice: "22,000円", conditions: [], additionalCosts: [], sourceUrl: "https://example.com/vip", evidence: "VIPルーム", confidence: 1 }
    ]
  }), "https://example.com");
  assert.deepEqual(normalized.treatments.map((item) => item.name), ["二重埋没法"]);
  assert.deepEqual(normalized.pricing, []);
  assert.deepEqual(publicFieldsFromExtraction(normalized, "now").tags, ["目元"]);
});

test("Gemini request uses URL context, search and structured JSON", async () => {
  const captured = [];
  const pending = new Map();
  const result = await requestOfficialExtraction({
    apiKey: "test-key", clinicName: "テスト美容外科", sourceOfficialUrl: "https://example.com",
    model: "gemini-test", now: () => "2026-10-23T00:00:00.000Z",
    wait: async () => {},
    fetchImpl: async (url, options) => {
      if (options.method === "GET") {
        const id = decodeURIComponent(url.split("/").pop());
        return { ok: true, async json() { return { status: "completed", output_text: JSON.stringify(pending.get(id)), usage: { total_tokens: 10 } }; } };
      }
      const body = JSON.parse(options.body);
      captured.push({ url, options, body });
      const value = extracted();
      const groupResult = Object.fromEntries(
        Object.keys(body.response_format.schema.properties).map((field) => [field, value[field]])
      );
      const id = `interaction-${captured.length}`;
      pending.set(id, groupResult);
      return { ok: true, async json() { return { id, status: "in_progress" }; } };
    }
  });
  assert.equal(captured.length, EXTRACTION_GROUPS.length);
  assert.ok(captured.every((request) => request.url === GEMINI_INTERACTIONS_URL));
  assert.ok(captured.every((request) => request.options.headers["x-goog-api-key"] === "test-key"));
  assert.ok(captured.every((request) => request.body.background === true));
  assert.ok(captured.every((request) => JSON.stringify(request.body.tools) === JSON.stringify([{ type: "google_search" }, { type: "url_context" }])));
  assert.ok(captured.every((request) => request.body.response_format.mime_type === "application/json"));
  assert.deepEqual(captured.map((request) => Object.keys(request.body.response_format.schema.properties)), EXTRACTION_GROUPS.map((group) => group.fields));
  assert.equal(result.extraction.treatments[0].name, "二重埋没法");
  assert.equal(result.model, "gemini-test");
  assert.equal(result.usage.length, EXTRACTION_GROUPS.length);
});

test("progress checks remain compatible with jobs started by the previous three-group version", async () => {
  const value = extracted();
  const groups = [
    { label: "施術・料金", fields: ["treatments", "pricing"], interactionId: "old-1" },
    { label: "医師・症例", fields: ["doctors", "caseInformation"], interactionId: "old-2" },
    { label: "リスク・保証", fields: ["downtimeAndRisks", "warrantyAndAftercare"], interactionId: "old-3" }
  ];
  const result = await checkOfficialExtraction({
    apiKey: "test-key",
    job: {
      version: 1, status: "running", model: "gemini-test",
      sourceOfficialUrl: "https://example.com", startedAt: "now", groups
    },
    fetchImpl: async (url) => {
      const group = groups.find((item) => url.endsWith(item.interactionId));
      const output = Object.fromEntries(group.fields.map((field) => [field, value[field]]));
      return { ok: true, async json() { return { status: "completed", output_text: JSON.stringify(output) }; } };
    }
  });
  assert.equal(result.status, "completed");
  assert.equal(result.extraction.treatments[0].name, "二重埋没法");
});

test("split extraction identifies the failed information group", async () => {
  await assert.rejects(
    requestOfficialExtraction({
      apiKey: "test-key", clinicName: "テスト美容外科", sourceOfficialUrl: "https://example.com",
      model: "gemini-test",
      wait: async () => {},
      fetchImpl: async (_url, options) => {
        if (options.method === "GET") throw new Error("unexpected poll");
        const body = JSON.parse(options.body);
        if (body.response_format.schema.properties.doctors) {
          return { ok: false, status: 429, async json() { return { error: { message: "quota exceeded" } }; } };
        }
        const value = extracted();
        const groupResult = Object.fromEntries(
          Object.keys(body.response_format.schema.properties).map((field) => [field, value[field]])
        );
        return { ok: true, async json() { return { id: `interaction-${Object.keys(groupResult)[0]}`, status: "in_progress" }; } };
      }
    }),
    /医師・症例の抽出開始に失敗しました: quota exceeded/
  );
});

test("progress checks report a terminal failure instead of an earlier running group", async () => {
  const groups = EXTRACTION_GROUPS.map((group, index) => ({
    ...group,
    interactionId: `interaction-${index + 1}`
  }));
  await assert.rejects(
    checkOfficialExtraction({
      apiKey: "test-key",
      job: {
        version: 1, status: "running", model: "gemini-test",
        sourceOfficialUrl: "https://example.com", startedAt: "now", groups
      },
      fetchImpl: async (url) => {
        const index = groups.findIndex((group) => url.endsWith(group.interactionId));
        if (index === 1) {
          return {
            ok: true,
            async json() {
              return { status: "failed", errors: [{ message: "Gemini API error (402)" }] };
            }
          };
        }
        return { ok: true, async json() { return { status: "in_progress" }; } };
      }
    }),
    /Gemini API error \(402\)/
  );
});

test("automatic records apply only high-confidence official information", () => {
  const extraction = normalizeOfficialExtraction(extracted({
    treatments: [
      extracted().treatments[0],
      { name: "鼻整形", sourceUrl: "https://example.com/nose", evidence: "鼻整形", confidence: 0.89 }
    ]
  }), "https://example.com", "extracted");
  const result = officialExtractionUpdate(
    { verificationStatus: "automated", treatments: ["旧情報"] }, extraction,
    { model: "gemini-test", autoApply: true, now: "now" }
  );
  assert.equal(result.autoApplied, true);
  assert.deepEqual(result.update.treatments, ["二重埋没法"]);
  assert.equal(result.update.extractionStatus, "applied");
  assert.equal(result.update.extractionError, "");
  assert.equal(result.update.verificationStatus, "automated");
});

test("untouched legacy records can be upgraded automatically", () => {
  const extraction = normalizeOfficialExtraction(extracted(), "https://example.com");
  const result = officialExtractionUpdate(
    { verificationStatus: "needs_review", reviewedBy: "" }, extraction,
    { model: "gemini-test", autoApply: true, now: "now" }
  );
  assert.equal(result.autoApplied, true);
  assert.deepEqual(result.update.treatments, ["二重埋没法"]);
  assert.equal(result.update.verificationStatus, "automated");
});

test("human-reviewed records keep public fields and become review candidates", () => {
  const extraction = normalizeOfficialExtraction(extracted(), "https://example.com");
  const result = officialExtractionUpdate(
    { verificationStatus: "verified", treatments: ["確認済み情報"] }, extraction,
    { model: "gemini-test", autoApply: true, now: "now" }
  );
  assert.equal(result.autoApplied, false);
  assert.equal(result.update.treatments, undefined);
  assert.equal(result.update.extractionStatus, "needs_review");
});

test("records edited by a reviewer are protected even before final verification", () => {
  const extraction = normalizeOfficialExtraction(extracted(), "https://example.com");
  const result = officialExtractionUpdate(
    { verificationStatus: "needs_review", reviewedBy: "admin@example.com", treatments: ["手動入力"] }, extraction,
    { model: "gemini-test", autoApply: true, now: "now" }
  );
  assert.equal(result.autoApplied, false);
  assert.equal(result.update.treatments, undefined);
});
