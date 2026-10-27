const test = require("node:test");
const assert = require("node:assert/strict");
const { parseArguments, plan, main } = require("../scripts/sync-clinic-official");

test("official sync CLI defaults to a zero-cost plan", () => {
  const options = parseArguments(["--prefecture", "大阪府", "--limit", "5"]);
  assert.deepEqual(plan(options), {
    mode: "plan",
    prefectures: ["大阪府"],
    limit: 5,
    maximumGeminiRequests: 20,
    autoApply: false
  });
  assert.throws(() => parseArguments(["--all", "--prefecture", "大阪府"]), /同時/);
  assert.throws(() => parseArguments(["--prefecture", "海外"]), /有効/);
  assert.throws(() => parseArguments(["--prefecture", "大阪府", "--limit", "51"]), /1〜50/);
});

test("official sync CLI processes oldest candidates through injected services", async () => {
  const previous = {
    apiKey: process.env.GEMINI_API_KEY,
    request: process.env.CONFIRM_GEMINI_REQUEST,
    write: process.env.CONFIRM_CLINIC_OFFICIAL_WRITE
  };
  process.env.GEMINI_API_KEY = "test-key";
  process.env.CONFIRM_GEMINI_REQUEST = "yes";
  process.env.CONFIRM_CLINIC_OFFICIAL_WRITE = "yes";
  const saved = [];
  try {
    const result = await main(["--prefecture", "大阪府", "--limit", "1", "--execute"], {
      store: {
        async listForOfficialSync() { return [{ id: "clinic-1", name: "候補", officialUrl: "https://example.com" }]; },
        async saveOfficialExtraction(id, extraction, options) {
          saved.push({ id, extraction, options });
          return { changed: true, autoApplied: false };
        }
      },
      extract: async () => ({ extraction: { treatments: [] }, model: "gemini-test" })
    });
    assert.equal(result.succeeded, 1);
    assert.equal(result.changed, 1);
    assert.equal(saved[0].id, "clinic-1");
  } finally {
    if (previous.apiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous.apiKey;
    if (previous.request === undefined) delete process.env.CONFIRM_GEMINI_REQUEST;
    else process.env.CONFIRM_GEMINI_REQUEST = previous.request;
    if (previous.write === undefined) delete process.env.CONFIRM_CLINIC_OFFICIAL_WRITE;
    else process.env.CONFIRM_CLINIC_OFFICIAL_WRITE = previous.write;
  }
});
