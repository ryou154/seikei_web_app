const fs = require('node:fs/promises');
const path = require('node:path');
const { Firestore } = require('@google-cloud/firestore');
const firebaseConfig = require('../firebase-config');
const { createHtmlExtractor, profileFor } = require('../clinic-html-sync');
const { clinicInformationUpdate } = require('../clinic-information-sync');

function parseArguments(args) {
  const options = { execute: false, write: false, autoApply: false, renderJs: false, ocr: false, limit: Infinity, maxPages: 20, concurrency: 4, id: '', report: path.join(__dirname, '../data/clinic-html-report.json') };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--execute') options.execute = true;
    else if (arg === '--write') options.write = options.execute = true;
    else if (arg === '--auto-apply') options.autoApply = true;
    else if (arg === '--render-js') options.renderJs = true;
    else if (arg === '--ocr') options.ocr = true;
    else if (['--limit', '--max-pages', '--concurrency', '--id', '--report'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${arg} の値が必要です`);
      const key = { '--limit': 'limit', '--max-pages': 'maxPages', '--concurrency': 'concurrency', '--id': 'id', '--report': 'report' }[arg];
      options[key] = ['id', 'report'].includes(key) ? value : Number(value);
    } else throw new Error(`不明なオプション: ${arg}`);
  }
  if (options.limit !== Infinity && (!Number.isInteger(options.limit) || options.limit < 1)
    || !Number.isInteger(options.maxPages) || options.maxPages < 1 || options.maxPages > 100
    || !Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error('limitは1以上、max-pagesは1〜100、concurrencyは1〜8で指定してください');
  if (options.autoApply && !options.write) throw new Error('--auto-apply には --write が必要です');
  return options;
}

async function saveExtraction(db, id, extraction, options) {
  const reference = db.collection('clinics').doc(id);
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new Error('対象クリニックが削除されました');
    const existing = snapshot.data();
    if (existing.officialUrl !== extraction.officialUrl) throw new Error('取得中に公式URLが変更されました。再実行してください');
    const result = clinicInformationUpdate(existing, extraction, options);
    if (Buffer.byteLength(JSON.stringify({ ...existing, ...result.update })) > 900000) throw new Error('取得結果が保存容量の上限に近いため、既存情報を保護して保存を中止しました');
    transaction.set(reference, result.update, { merge: true });
    return result;
  });
}

async function run(clinics, options, { extract = createHtmlExtractor({ maxPages: options.maxPages, renderJs: options.renderJs, ocr: options.ocr }), save, onProgress = () => {} } = {}) {
  const counts = new Map();
  for (const c of clinics) {
    try { const origin = new URL(c.officialUrl).origin; counts.set(origin, (counts.get(origin) || 0) + 1); } catch {}
  }
  // Process one domain per worker. The extractor shares downloaded pages across branches.
  const groups = new Map(), results = [];
  for (const clinic of clinics) {
    let origin;
    try { origin = new URL(clinic.officialUrl).origin; }
    catch { results.push({ id: clinic.id, status: 'missing_url', reason: '公式サイトURL未登録' }); continue; }
    if (!groups.has(origin)) groups.set(origin, []);
    groups.get(origin).push(clinic);
  }
  const pending = [...groups.values()];
  let next = 0;
  await Promise.all(Array.from({ length: options.concurrency }, async () => {
    while (next < pending.length) {
      const group = pending[next++];
      for (const clinic of group) {
        let result;
        try {
          const extracted = await extract({ sourceOfficialUrl: clinic.officialUrl, sharedDomain: counts.get(new URL(clinic.officialUrl).origin) > 1 });
          const extraction = extracted.extraction;
          const saved = options.write ? await save(clinic.id, extraction, { autoApply: options.autoApply, model: extracted.model }) : null;
          result = { id: clinic.id, officialUrl: clinic.officialUrl, profile: profileFor(clinic.officialUrl).id, status: extraction.html.errors.length ? 'partial' : extraction.pricing.length ? 'extracted' : 'no_data', saved: Boolean(saved), autoApplied: Boolean(saved?.autoApplied), treatments: extraction.treatments.length, prices: extraction.pricing.length, extraction };
        } catch (error) { result = { id: clinic.id, officialUrl: clinic.officialUrl, status: 'failed', error: error.message }; }
        results.push(result);
        onProgress(result);
      }
    }
  }));
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

async function main(args = process.argv.slice(2), dependencies = {}) {
  const options = parseArguments(args);
  const db = dependencies.db || new Firestore({ projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId, databaseId: '(default)' });
  const snapshot = dependencies.clinics ? null : await db.collection('clinics').get();
  const all = dependencies.clinics || snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
  // Compute shared-domain status from the entire inventory, even when --id or --limit is used.
  const originCounts = new Map();
  for (const c of all) { try { const origin = new URL(c.officialUrl).origin; originCounts.set(origin, (originCounts.get(origin) || 0) + 1); } catch {} }
  const clinics = all.filter(c => !options.id || c.id === options.id).sort((a, b) => String(a.officialHtmlCheckedAt || '').localeCompare(String(b.officialHtmlCheckedAt || '')) || a.id.localeCompare(b.id)).slice(0, options.limit);
  if (options.id && !clinics.length) throw new Error('指定されたクリニックがありません');
  const inventory = {};
  for (const c of clinics) { let host = 'missing_url'; try { host = new URL(c.officialUrl).hostname; } catch {} inventory[host] = (inventory[host] || 0) + 1; }
  if (!options.execute) {
    const plan = { mode: 'plan', registered: all.length, selected: clinics.length, domains: inventory, maxPagesPerClinic: options.maxPages, writes: false, geminiRequests: 0 };
    console.log(JSON.stringify(plan, null, 2)); return plan;
  }
  const extractor = dependencies.extract || createHtmlExtractor({ maxPages: options.maxPages, renderJs: options.renderJs, ocr: options.ocr });
  const results = await run(clinics, options, {
    extract: input => extractor({ ...input, sharedDomain: originCounts.get(new URL(input.sourceOfficialUrl).origin) > 1 }),
    save: dependencies.save || ((id, extraction, settings) => saveExtraction(db, id, extraction, settings)),
    onProgress: result => console.log(`${result.status}: ${result.id} (${result.prices || 0} prices)`)
  });
  const summary = results.reduce((counts, result) => ({ ...counts, [result.status]: (counts[result.status] || 0) + 1 }), {});
  const report = { generatedAt: new Date().toISOString(), mode: options.write ? 'write' : 'preview', geminiRequests: 0, registered: all.length, selected: clinics.length, summary, results };
  const reportPath = path.resolve(options.report);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(`${reportPath}.tmp`, JSON.stringify(report, null, 2) + '\n');
  await fs.rename(`${reportPath}.tmp`, reportPath);
  console.log(JSON.stringify({ report: reportPath, summary }));
  return report;
}

module.exports = { parseArguments, saveExtraction, run, main };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
