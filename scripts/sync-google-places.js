const { Firestore } = require("@google-cloud/firestore");
const firebaseConfig = require("../firebase-config");
const { PREFECTURES } = require("../account-store");
const {
  DEFAULT_KEYWORDS,
  MAX_PAGES,
  normalizeOptions,
  discoverClinicCandidates,
  writeClinicCandidates,
  writeAutoPublishedClinics,
  MAX_AUTO_PUBLISH_PER_PREFECTURE
} = require("../places-clinic-sync");

function readValue(args, index, name) {
  const inline = args[index].startsWith(`--${name}=`) ? args[index].slice(name.length + 3) : "";
  if (inline) return { value: inline, consumed: 0 };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} の値を指定してください。`);
  return { value, consumed: 1 };
}

function parseArguments(args) {
  const result = {
    execute: false,
    write: false,
    autoPublish: false,
    all: false,
    prefectures: [],
    keywords: [],
    maxPages: 1,
    limitPerPrefecture: MAX_AUTO_PUBLISH_PER_PREFECTURE
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") result.execute = true;
    else if (argument === "--write") result.write = true;
    else if (argument === "--auto-publish") result.autoPublish = true;
    else if (argument === "--all") result.all = true;
    else if (argument === "--prefecture" || argument.startsWith("--prefecture=")) {
      const item = readValue(args, index, "prefecture");
      result.prefectures.push(item.value);
      index += item.consumed;
    } else if (argument === "--keyword" || argument.startsWith("--keyword=")) {
      const item = readValue(args, index, "keyword");
      result.keywords.push(item.value);
      index += item.consumed;
    } else if (argument === "--max-pages" || argument.startsWith("--max-pages=")) {
      const item = readValue(args, index, "max-pages");
      result.maxPages = Number(item.value);
      index += item.consumed;
    } else if (argument === "--limit-per-prefecture" || argument.startsWith("--limit-per-prefecture=")) {
      const item = readValue(args, index, "limit-per-prefecture");
      result.limitPerPrefecture = Number(item.value);
      index += item.consumed;
    } else {
      throw new Error(`不明なオプションです: ${argument}`);
    }
  }
  if (result.autoPublish) result.write = true;
  if (result.write) result.execute = true;
  if (result.all && result.prefectures.length) {
    throw new Error("--all と --prefecture は同時に指定できません。");
  }
  result.prefectures = result.all ? PREFECTURES : result.prefectures;
  result.keywords = result.keywords.length ? result.keywords : DEFAULT_KEYWORDS;
  if (!Number.isInteger(result.limitPerPrefecture)
    || result.limitPerPrefecture < 1
    || result.limitPerPrefecture > MAX_AUTO_PUBLISH_PER_PREFECTURE) {
    throw new Error(`--limit-per-prefecture は1〜${MAX_AUTO_PUBLISH_PER_PREFECTURE}で指定してください。`);
  }
  return { ...result, ...normalizeOptions(result) };
}

function plan(options) {
  return {
    mode: options.autoPublish ? "auto-publish" : options.write ? "write" : options.execute ? "api-dry-run" : "plan",
    prefectures: options.prefectures,
    keywords: options.keywords,
    maxPages: options.maxPages,
    maximumRequests: options.prefectures.length * options.keywords.length * options.maxPages,
    limitPerPrefecture: options.limitPerPrefecture
  };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  const requestPlan = plan(options);
  if (!options.execute) {
    console.log(JSON.stringify(requestPlan, null, 2));
    return requestPlan;
  }
  if (process.env.CONFIRM_PLACES_REQUEST !== "yes") {
    throw new Error("API実行には CONFIRM_PLACES_REQUEST=yes が必要です。");
  }
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY が設定されていません。");

  const discovery = await discoverClinicCandidates({
    apiKey,
    prefectures: options.prefectures,
    keywords: options.keywords,
    maxPages: options.maxPages
  });
  const output = {
    ...requestPlan,
    ...discovery.stats,
    preview: discovery.candidates.slice(0, 10)
  };
  if (options.write) {
    if (process.env.CONFIRM_CLINIC_IMPORT !== "yes") {
      throw new Error("Firestore書き込みには CONFIRM_CLINIC_IMPORT=yes が必要です。");
    }
    const db = new Firestore({
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
      databaseId: "(default)"
    });
    if (options.autoPublish) {
      if (process.env.CONFIRM_CLINIC_AUTO_PUBLISH !== "yes") {
        throw new Error("自動公開には CONFIRM_CLINIC_AUTO_PUBLISH=yes が必要です。");
      }
      output.firestore = await writeAutoPublishedClinics(db, discovery.candidates, {
        prefectures: options.prefectures,
        limitPerPrefecture: options.limitPerPrefecture
      });
    } else {
      output.firestore = await writeClinicCandidates(db, discovery.candidates);
    }
  }
  console.log(JSON.stringify(output, null, 2));
  return output;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { parseArguments, plan, main };
