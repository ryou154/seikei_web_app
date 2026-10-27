const crypto = require("node:crypto");
const net = require("node:net");

const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1/interactions";
const DEFAULT_GEMINI_TEXT_MODEL = "gemini-3.8-flash";
const MAX_EXTRACTED_ITEMS = 50;
const AUTO_APPLY_CONFIDENCE = 0.9;
const EXTRACTION_TIMEOUT_MS = 120_000;

class ClinicOfficialSyncError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const evidenceProperties = {
  sourceUrl: { type: "string", description: "Exact HTTPS URL on the clinic official domain that supports this item." },
  evidence: { type: "string", description: "Short exact Japanese text excerpt supporting this item. Never invent text." },
  confidence: { type: "number", minimum: 0, maximum: 1 }
};

const OFFICIAL_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    treatments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, ...evidenceProperties },
        required: ["name", "sourceUrl", "evidence", "confidence"]
      }
    },
    pricing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          treatment: { type: "string" },
          displayPrice: { type: "string" },
          conditions: { type: "array", items: { type: "string" } },
          additionalCosts: { type: "array", items: { type: "string" } },
          ...evidenceProperties
        },
        required: ["treatment", "displayPrice", "conditions", "additionalCosts", "sourceUrl", "evidence", "confidence"]
      }
    },
    doctors: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          specialties: { type: "array", items: { type: "string" } },
          qualifications: { type: "array", items: { type: "string" } },
          ...evidenceProperties
        },
        required: ["name", "title", "specialties", "qualifications", "sourceUrl", "evidence", "confidence"]
      }
    },
    caseInformation: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          summary: { type: "string" },
          period: { type: "string" },
          scope: { type: "string" },
          ...evidenceProperties
        },
        required: ["summary", "period", "scope", "sourceUrl", "evidence", "confidence"]
      }
    },
    downtimeAndRisks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          treatment: { type: "string" },
          ...evidenceProperties
        },
        required: ["title", "description", "treatment", "sourceUrl", "evidence", "confidence"]
      }
    },
    warrantyAndAftercare: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          treatment: { type: "string" },
          ...evidenceProperties
        },
        required: ["title", "description", "treatment", "sourceUrl", "evidence", "confidence"]
      }
    }
  },
  required: ["treatments", "pricing", "doctors", "caseInformation", "downtimeAndRisks", "warrantyAndAftercare"]
};

const EXTRACTION_GROUPS = [
  {
    label: "施術・料金",
    fields: ["treatments", "pricing"],
    instruction: "Extract treatments and displayed prices, including stated conditions and additional costs."
  },
  {
    label: "医師・症例",
    fields: ["doctors", "caseInformation"],
    instruction: "Extract doctors, explicitly stated qualifications and specialties, and case counts with period and scope."
  },
  {
    label: "リスク・保証",
    fields: ["downtimeAndRisks", "warrantyAndAftercare"],
    instruction: "Extract downtime, risks, warranties, and aftercare for the relevant treatments."
  }
];

function officialUrl(value) {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:" || !hostname || hostname === "localhost" || net.isIP(hostname)) throw new Error();
    parsed.hash = "";
    return parsed;
  } catch {
    throw new ClinicOfficialSyncError("公式サイトURLを確認してください。", 400);
  }
}

function rootHost(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function sameOfficialDomain(value, baseUrl) {
  try {
    const candidate = officialUrl(value);
    const base = rootHost(baseUrl.hostname);
    const host = rootHost(candidate.hostname);
    return host === base || host.endsWith(`.${base}`);
  } catch {
    return false;
  }
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanStrings(value, maxItems = 20, maxLength = 200) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.slice(0, maxItems).map((item) => cleanText(item, maxLength)).filter(Boolean))];
}

function cleanConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : 0;
}

function normalizeEvidenceItem(item, baseUrl, fields) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const sourceUrl = cleanText(item.sourceUrl, 1000);
  const evidence = cleanText(item.evidence, 500);
  if (!sourceUrl || !evidence || !sameOfficialDomain(sourceUrl, baseUrl)) return null;
  const normalized = {
    sourceUrl: officialUrl(sourceUrl).href,
    evidence,
    confidence: cleanConfidence(item.confidence)
  };
  for (const [name, config] of Object.entries(fields)) {
    normalized[name] = config.array
      ? cleanStrings(item[name], config.maxItems, config.maxLength)
      : cleanText(item[name], config.maxLength);
  }
  if (fields.name && !normalized.name) return null;
  if (fields.treatment && !normalized.treatment) return null;
  if (fields.title && !normalized.title) return null;
  if (fields.description && !normalized.description) return null;
  if (fields.summary && !normalized.summary) return null;
  if (fields.displayPrice && !normalized.displayPrice) return null;
  return normalized;
}

function normalizeItems(value, baseUrl, fields) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_EXTRACTED_ITEMS)
    .map((item) => normalizeEvidenceItem(item, baseUrl, fields))
    .filter(Boolean);
}

function normalizeOfficialExtraction(value, sourceOfficialUrl, now = new Date().toISOString()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ClinicOfficialSyncError("Geminiの抽出結果を確認できませんでした。", 502);
  }
  const baseUrl = officialUrl(sourceOfficialUrl);
  return {
    treatments: normalizeItems(value.treatments, baseUrl, { name: { maxLength: 150 } }),
    pricing: normalizeItems(value.pricing, baseUrl, {
      treatment: { maxLength: 150 },
      displayPrice: { maxLength: 100 },
      conditions: { array: true, maxItems: 20, maxLength: 200 },
      additionalCosts: { array: true, maxItems: 20, maxLength: 200 }
    }),
    doctors: normalizeItems(value.doctors, baseUrl, {
      name: { maxLength: 100 },
      title: { maxLength: 100 },
      specialties: { array: true, maxItems: 30, maxLength: 150 },
      qualifications: { array: true, maxItems: 30, maxLength: 200 }
    }),
    caseInformation: normalizeItems(value.caseInformation, baseUrl, {
      summary: { maxLength: 1000 },
      period: { maxLength: 100 },
      scope: { maxLength: 200 }
    }),
    downtimeAndRisks: normalizeItems(value.downtimeAndRisks, baseUrl, {
      title: { maxLength: 150 },
      description: { maxLength: 1000 },
      treatment: { maxLength: 150 }
    }),
    warrantyAndAftercare: normalizeItems(value.warrantyAndAftercare, baseUrl, {
      title: { maxLength: 150 },
      description: { maxLength: 1000 },
      treatment: { maxLength: 150 }
    }),
    extractedAt: now,
    officialUrl: baseUrl.href
  };
}

function extractionSchema(fields) {
  return {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(fields.map((field) => [field, OFFICIAL_EXTRACTION_SCHEMA.properties[field]])),
    required: fields
  };
}

function extractionPrompt(clinicName, sourceOfficialUrl, instruction) {
  const baseUrl = officialUrl(sourceOfficialUrl);
  return [
    `Extract factual cosmetic clinic information for ${clinicName || "the clinic"}.`,
    `Start from ${baseUrl.href} and use Google Search only to locate pages on the same official domain ${rootHost(baseUrl.hostname)}.`,
    instruction,
    "Every item must include an exact supporting URL on the official domain, a short exact Japanese evidence excerpt, and a confidence from 0 to 1.",
    "Do not infer, calculate, summarize missing claims, or use portals, social media, aggregators, reviews, advertisements, or other domains.",
    "Return empty arrays when the official pages do not explicitly state the information."
  ].join(" ");
}

function outputText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const step of Array.isArray(data?.steps) ? data.steps : []) {
    if (step?.type !== "model_output") continue;
    for (const block of Array.isArray(step.content) ? step.content : []) {
      if (block?.type === "text" && typeof block.text === "string") return block.text;
    }
  }
  return "";
}

async function requestExtractionGroup({
  apiKey,
  clinicName,
  sourceOfficialUrl,
  model,
  group,
  fetchImpl
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
  try {
    const response = await fetchImpl(GEMINI_INTERACTIONS_URL, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: extractionPrompt(cleanText(clinicName, 200), sourceOfficialUrl, group.instruction),
        tools: [{ type: "google_search" }, { type: "url_context" }],
        response_format: { type: "text", mime_type: "application/json", schema: extractionSchema(group.fields) }
      }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ClinicOfficialSyncError(data.error?.message || `Gemini API error (${response.status})`, response.status);
    }
    try {
      return { data: JSON.parse(outputText(data)), usage: data.usage || null };
    } catch {
      throw new ClinicOfficialSyncError("GeminiのJSONを解析できませんでした。", 502);
    }
  } catch (error) {
    const message = error.name === "AbortError"
      ? `${group.label}の抽出がタイムアウトしました。`
      : `${group.label}の抽出に失敗しました: ${error.message}`;
    throw new ClinicOfficialSyncError(message, error.name === "AbortError" ? 504 : (error.status || 502));
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOfficialExtraction({
  apiKey,
  clinicName,
  sourceOfficialUrl,
  model = process.env.GEMINI_TEXT_MODEL || DEFAULT_GEMINI_TEXT_MODEL,
  fetchImpl = fetch,
  now = () => new Date().toISOString()
} = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new ClinicOfficialSyncError("GEMINI_API_KEYが設定されていません。", 503);
  officialUrl(sourceOfficialUrl);
  const results = await Promise.all(EXTRACTION_GROUPS.map((group) => requestExtractionGroup({
    apiKey,
    clinicName,
    sourceOfficialUrl,
    model,
    group,
    fetchImpl
  })));
  const combined = Object.fromEntries(Object.keys(OFFICIAL_EXTRACTION_SCHEMA.properties).map((field) => [field, []]));
  for (const result of results) Object.assign(combined, result.data);
  return {
    extraction: normalizeOfficialExtraction(combined, sourceOfficialUrl, now()),
    model,
    usage: results.map((result, index) => ({ group: EXTRACTION_GROUPS[index].label, usage: result.usage }))
  };
}

function extractionHash(extraction) {
  const stable = {
    treatments: extraction.treatments || [],
    pricing: extraction.pricing || [],
    doctors: extraction.doctors || [],
    caseInformation: extraction.caseInformation || [],
    downtimeAndRisks: extraction.downtimeAndRisks || [],
    warrantyAndAftercare: extraction.warrantyAndAftercare || []
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function confident(items) {
  return (items || []).filter((item) => item.confidence >= AUTO_APPLY_CONFIDENCE);
}

function publicFieldsFromExtraction(extraction, now) {
  const treatments = confident(extraction.treatments);
  const pricing = confident(extraction.pricing).map((item) => ({
    treatment: item.treatment,
    displayPrice: item.displayPrice,
    conditions: item.conditions,
    additionalCosts: item.additionalCosts,
    sourceUrl: item.sourceUrl,
    verifiedAt: now
  }));
  const doctors = confident(extraction.doctors).map((item) => ({
    name: item.name,
    title: item.title,
    specialties: item.specialties,
    qualifications: item.qualifications,
    sourceUrl: item.sourceUrl,
    verifiedAt: now
  }));
  const information = (items) => confident(items).map((item) => ({
    title: item.title,
    description: item.description,
    treatment: item.treatment,
    sourceUrl: item.sourceUrl,
    verifiedAt: now
  }));
  const cases = confident(extraction.caseInformation);
  return {
    treatments: [...new Set(treatments.map((item) => item.name))],
    pricing,
    doctors,
    caseInformation: cases[0] ? {
      summary: cases[0].summary,
      period: cases[0].period,
      scope: cases[0].scope,
      sourceUrl: cases[0].sourceUrl,
      verifiedAt: now
    } : null,
    downtimeAndRisks: information(extraction.downtimeAndRisks),
    warrantyAndAftercare: information(extraction.warrantyAndAftercare),
    hasPricing: pricing.length > 0
  };
}

function officialExtractionUpdate(existing, extraction, {
  model,
  autoApply = false,
  now = new Date().toISOString()
} = {}) {
  const nextHash = extractionHash(extraction);
  const previousHash = typeof existing.officialExtractionHash === "string" ? existing.officialExtractionHash : "";
  const changed = previousHash !== nextHash;
  const manuallyReviewed = existing.verificationStatus === "verified"
    || (typeof existing.reviewedBy === "string" && existing.reviewedBy.trim() !== "");
  const canAutoApply = autoApply && !manuallyReviewed;
  const history = Array.isArray(existing.changeHistory) ? existing.changeHistory.slice(-19) : [];
  if (changed && previousHash) {
    history.push({ detectedAt: now, previousHash, nextHash, autoApplied: canAutoApply });
  }
  const update = {
    detectedData: extraction,
    officialExtractionHash: nextHash,
    officialDataCheckedAt: now,
    extractionModel: cleanText(model, 100),
    extractionError: "",
    extractionStatus: changed ? (canAutoApply ? "applied" : "needs_review") : "unchanged",
    changeHistory: history,
    updatedAt: now
  };
  if (canAutoApply) {
    Object.assign(update, publicFieldsFromExtraction(extraction, now), {
      verificationStatus: "automated",
      verifiedAt: now
    });
  }
  return { update, changed, autoApplied: canAutoApply };
}

module.exports = {
  GEMINI_INTERACTIONS_URL,
  DEFAULT_GEMINI_TEXT_MODEL,
  MAX_EXTRACTED_ITEMS,
  AUTO_APPLY_CONFIDENCE,
  EXTRACTION_GROUPS,
  EXTRACTION_TIMEOUT_MS,
  OFFICIAL_EXTRACTION_SCHEMA,
  ClinicOfficialSyncError,
  officialUrl,
  sameOfficialDomain,
  normalizeOfficialExtraction,
  extractionPrompt,
  outputText,
  requestOfficialExtraction,
  extractionHash,
  publicFieldsFromExtraction,
  officialExtractionUpdate
};
