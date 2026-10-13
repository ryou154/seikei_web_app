const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  loadLegacyClinics,
  locationParts,
  legacyClinicId,
  toClinicDocument
} = require("../scripts/import-clinics");

const projectRoot = path.join(__dirname, "..");

test("loads the existing verified clinic source files", () => {
  const clinics = loadLegacyClinics(projectRoot);
  assert.equal(clinics.length, 21);
  assert.ok(clinics.every((clinic) => clinic.name && clinic.sourceUrl));
});

test("converts legacy data to the backend clinic schema", () => {
  const [clinic] = loadLegacyClinics(projectRoot);
  const document = toClinicDocument(clinic, "2026-10-09T00:00:00.000Z");
  assert.equal(document.publicationStatus, "published");
  assert.equal(document.verificationStatus, "needs_review");
  assert.equal(document.prefecture, "東京都");
  assert.equal(document.businessStatus, "");
  assert.ok(document.treatments.length > 0);
  assert.ok(document.sources.some((item) => item.url === clinic.sourceUrl));
  assert.ok(document.sources.some((item) => item.type === "official"));
  assert.equal(document.updatedAt, "2026-10-09T00:00:00.000Z");
});

test("location parsing and generated IDs are deterministic", () => {
  assert.deepEqual(locationParts("大阪府大阪市北区梅田1-1"), {
    prefecture: "大阪府",
    city: "大阪市"
  });
  const clinic = { name: "テスト院", sourceUrl: "https://example.com/clinic" };
  assert.match(legacyClinicId(clinic), /^legacy-[a-f0-9]{20}$/);
  assert.equal(legacyClinicId(clinic), legacyClinicId(clinic));
});
