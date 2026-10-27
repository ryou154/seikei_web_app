const { Firestore } = require("@google-cloud/firestore");
const firebaseConfig = require("../firebase-config");
const { PREFECTURES } = require("../account-store");
const { createClinicAdminStore } = require("../clinic-admin");
const { EXTRACTION_GROUPS, requestOfficialExtraction } = require("../clinic-official-sync");

function readValue(args, index, name) {
  const inline = args[index].startsWith(`--${name}=`) ? args[index].slice(name.length + 3) : "";
  if (inline) return { value: inline, consumed: 0 };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} の値を指定してください。`);
  return { value, consumed: 1 };
}

function parseArguments(args) {
  const result = { execute: false, autoApply: false, all: false, prefectures: [], limit: 5 };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") result.execute = true;
    else if (argument === "--auto-apply") result.autoApply = true;
    else if (argument === "--all") result.all = true;
    else if (argument === "--prefecture" || argument.startsWith("--prefecture=")) {
      const item = readValue(args, index, "prefecture");
      result.prefectures.push(item.value);
      index += item.consumed;
    } else if (argument === "--limit" || argument.startsWith("--limit=")) {
      const item = readValue(args, index, "limit");
      result.limit = Number(item.value);
      index += item.consumed;
    } else throw new Error(`不明なオプションです: ${argument}`);
  }
  if (result.all && result.prefectures.length) throw new Error("--all と --prefecture は同時に指定できません。");
  result.prefectures = result.all ? PREFECTURES : [...new Set(result.prefectures)];
  if (!result.prefectures.length || result.prefectures.some((item) => !PREFECTURES.includes(item))) {
    throw new Error("--all または有効な --prefecture を指定してください。");
  }
  if (!Number.isInteger(result.limit) || result.limit < 1 || result.limit > 50) {
    throw new Error("--limit は1〜50で指定してください。");
  }
  return result;
}

function plan(options) {
  return {
    mode: options.execute ? "execute" : "plan",
    prefectures: options.prefectures,
    limit: options.limit,
    maximumGeminiRequests: options.limit * EXTRACTION_GROUPS.length,
    autoApply: options.autoApply
  };
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(args);
  const output = plan(options);
  if (!options.execute) {
    console.log(JSON.stringify(output, null, 2));
    return output;
  }
  if (process.env.CONFIRM_GEMINI_REQUEST !== "yes") {
    throw new Error("Gemini API実行には CONFIRM_GEMINI_REQUEST=yes が必要です。");
  }
  if (process.env.CONFIRM_CLINIC_OFFICIAL_WRITE !== "yes") {
    throw new Error("Firestore書き込みには CONFIRM_CLINIC_OFFICIAL_WRITE=yes が必要です。");
  }
  if (options.autoApply && process.env.CONFIRM_CLINIC_OFFICIAL_AUTO_APPLY !== "yes") {
    throw new Error("自動反映には CONFIRM_CLINIC_OFFICIAL_AUTO_APPLY=yes が必要です。");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY が設定されていません。");
  const db = dependencies.db || new Firestore({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    databaseId: "(default)"
  });
  const store = dependencies.store || createClinicAdminStore(db);
  const extract = dependencies.extract || requestOfficialExtraction;
  const clinics = await store.listForOfficialSync(options);
  const results = [];
  for (const clinic of clinics) {
    try {
      const extracted = await extract({
        apiKey,
        clinicName: clinic.name,
        sourceOfficialUrl: clinic.officialUrl,
        model: process.env.GEMINI_TEXT_MODEL
      });
      const saved = await store.saveOfficialExtraction(clinic.id, extracted.extraction, {
        model: extracted.model,
        autoApply: options.autoApply
      });
      results.push({ id: clinic.id, ok: Boolean(saved), changed: Boolean(saved?.changed), autoApplied: Boolean(saved?.autoApplied) });
    } catch (error) {
      results.push({ id: clinic.id, ok: false, error: error.message });
    }
  }
  const summary = {
    ...output,
    requested: clinics.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    changed: results.filter((result) => result.changed).length,
    autoApplied: results.filter((result) => result.autoApplied).length,
    results
  };
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, plan, main };
