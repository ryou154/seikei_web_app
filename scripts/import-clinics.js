const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { Firestore } = require("@google-cloud/firestore");
const firebaseConfig = require("../firebase-config");

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

function loadLegacyClinics(root = path.join(__dirname, "..")) {
  const context = vm.createContext({ window: {} });
  for (const file of ["data/clinics.js", "data/clinic-details.js"]) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    new vm.Script(source, { filename: file }).runInContext(context);
  }
  return JSON.parse(JSON.stringify(context.window.CLINIC_DATA || []));
}

function locationParts(address) {
  const prefecture = PREFECTURES.find((name) => String(address || "").startsWith(name)) || "";
  const remainder = String(address || "").slice(prefecture.length);
  const city = remainder.match(/^(.+?[市区町村郡])/u)?.[1] || "";
  return { prefecture, city };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function source(url, type, verifiedAt) {
  return url ? { url, type, verifiedAt } : null;
}

function legacyClinicId(clinic) {
  const digest = crypto.createHash("sha256")
    .update(`${clinic.name}\n${clinic.sourceUrl}`)
    .digest("hex")
    .slice(0, 20);
  return `legacy-${digest}`;
}

function toClinicDocument(clinic, now = new Date().toISOString()) {
  const { prefecture, city } = locationParts(clinic.address);
  const doctors = clinic.doctor ? [{
    name: clinic.doctor.name || "",
    title: clinic.doctor.title || "",
    specialties: clinic.doctor.specialties || [],
    qualifications: clinic.doctor.qualifications || [],
    sourceUrl: clinic.doctor.sourceUrl || "",
    verifiedAt: clinic.verifiedAt || ""
  }] : [];
  const sources = [
    source(clinic.sourceUrl, "official", clinic.verifiedAt || ""),
    source(clinic.priceUrl, "pricing", clinic.verifiedAt || ""),
    source(clinic.doctor?.sourceUrl, "doctor", clinic.verifiedAt || ""),
    source(clinic.cases?.sourceUrl, "cases", clinic.verifiedAt || "")
  ].filter(Boolean).filter((item, index, items) => (
    items.findIndex((candidate) => candidate.url === item.url && candidate.type === item.type) === index
  ));
  return {
    schemaVersion: 1,
    legacySource: true,
    placeId: "",
    name: clinic.name || "",
    prefecture,
    city,
    area: clinic.area || "",
    regions: clinic.regions || [],
    address: clinic.address || "",
    location: null,
    phone: "",
    officialUrl: clinic.sourceUrl || "",
    googleMapsUrl: "",
    businessStatus: "",
    openingHours: clinic.hours || "",
    treatments: unique([...(clinic.strengths || []), ...(clinic.tags || [])]),
    tags: clinic.tags || [],
    description: clinic.description || "",
    pricing: [],
    hasPricing: false,
    priceUrl: clinic.priceUrl || "",
    doctors,
    caseInformation: clinic.cases ? {
      summary: clinic.cases.summary || "",
      period: clinic.cases.period || "",
      scope: clinic.cases.scope || "",
      sourceUrl: clinic.cases.sourceUrl || "",
      verifiedAt: clinic.verifiedAt || ""
    } : null,
    downtimeAndRisks: [],
    warrantyAndAftercare: [],
    sources,
    verificationStatus: "needs_review",
    publicationStatus: "published",
    verifiedAt: clinic.verifiedAt || "",
    placesFetchedAt: "",
    createdAt: now,
    updatedAt: now
  };
}

async function importClinics({ write = false, root } = {}) {
  const clinics = loadLegacyClinics(root);
  const documents = clinics.map((clinic) => ({
    id: legacyClinicId(clinic),
    data: toClinicDocument(clinic)
  }));
  if (!write) return { written: false, documents };

  if (process.env.CONFIRM_CLINIC_IMPORT !== "yes") {
    throw new Error("書き込みには CONFIRM_CLINIC_IMPORT=yes が必要です。");
  }
  const db = new Firestore({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    databaseId: "(default)"
  });
  const references = documents.map((document) => db.collection("clinics").doc(document.id));
  const existing = await db.getAll(...references);
  const batch = db.batch();
  for (const [index, document] of documents.entries()) {
    const data = { ...document.data };
    if (existing[index].exists) delete data.createdAt;
    batch.set(references[index], data, { merge: true });
  }
  await batch.commit();
  return { written: true, documents };
}

async function main() {
  const write = process.argv.includes("--write");
  const result = await importClinics({ write });
  console.log(JSON.stringify({
    mode: result.written ? "write" : "dry-run",
    count: result.documents.length,
    ids: result.documents.map((document) => document.id)
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { loadLegacyClinics, locationParts, legacyClinicId, toClinicDocument, importClinics };
