const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePage, numericPrice, validateTarget, createHtmlExtractor, htmlExtractionUpdate } = require('../clinic-html-sync');
const { run, parseArguments, saveExtraction } = require('../scripts/sync-clinic-html');
const { createClinicAdminHandler } = require('../clinic-admin');

const url = 'https://clinic.example/price/';
test('doctor resources retain robots checks and JSON content-type validation', async () => {
  const calls=[];
  const extract=createHtmlExtractor({pause:async()=>{},lookup:async()=>[{address:'93.184.216.34'}],fetchImpl:async target=>{
    calls.push(target);
    if(target.endsWith('/robots.txt'))return new Response('User-agent: *\nDisallow: /private');
    if(target.endsWith('/api'))return new Response('{"doctor":[{"Name":"山田 太郎"}]}',{headers:{'content-type':'application/json'}});
    return new Response('<h2>田中 一郎</h2>',{headers:{'content-type':'text/html'}});
  }});
  assert.equal((await extract.readJson('https://clinic.example/api')).doctor[0].Name,'山田 太郎');
  await assert.rejects(extract.readJson('https://clinic.example/doctor'),/JSON/);
  await assert.rejects(extract.readJson('https://clinic.example/private'),/robots/i);
  await assert.rejects(extract.readResource('https://clinic.example/private'),/robots/i);
  assert.equal(calls.some(target=>target.endsWith('/private')),false);
  const page=await extract.readPage('https://clinic.example/doctor',{parse:false});
  assert.match(page.html,/田中/);
  assert.equal(page.parsed,undefined);
});
test('standalone fee pairs remain review candidates without borrowing nearby amounts', () => {
  const result = parsePage('<main><h3>ピーリング：6,600円（1回）</h3></main><footer><p>脱毛：1,000円</p></footer>', url);
  assert.equal(result.pricing.length, 1);
  assert.equal(result.pricing[0].treatment, 'ピーリング');
  assert.equal(result.pricing[0].scope, 'unconfirmed');
  assert.equal(result.pricing[0].requiresReview, true);
});
const fixture = `<main><h2>二重埋没法</h2><p>表示料金は全て税込です。</p><table>
<tr><th>対象</th><th>料金</th></tr><tr><th rowspan="2">両目</th><td>68,000円</td></tr>
<tr><td><span class="monitor-icon"></span>39,000円</td></tr></table>
<h2>鼻整形</h2><table><tr><th>鼻尖形成</th><td>200,000円</td></tr></table>
<h2>ローン</h2><table><tr><th>二重術 月額</th><td>3,000円</td></tr></table></main>`;

test('HTML parser preserves rowspan, monitor restrictions, tax and treatment boundaries', () => {
  const result = parsePage(fixture, url);
  assert.equal(result.pricing.length, 3);
  assert.equal(result.pricing[0].treatment, '二重埋没法');
  assert.equal(result.pricing[0].amountMin, 68000);
  assert.ok(result.pricing[1].conditions.includes('両目'));
  assert.equal(result.pricing[1].amountMin, null);
  assert.match(result.pricing[1].displayPrice, /モニター/);
  assert.equal(result.pricing[2].treatment, '鼻尖形成');
});

test('Lula Japanese amounts choose inclusive tax without inventing a range', () => {
  const { pricing } = parsePage('<h2>全身脱毛</h2><table><tr><td>1回</td><td>1万8,000円 <span>(税込1万9,800円)</span></td></tr></table>', url);
  assert.equal(pricing[0].amountMin, 19800);
  assert.equal(pricing[0].amountMax, 19800);
  assert.equal(numericPrice('12万3,400円'), 123400);
});

test('TCB restrictions in the next row and tax-unknown prices are not budget values', () => {
  const { pricing } = parsePage('<h2>二重埋没法</h2><table><tr><td>青春二重術</td><td>2点留め</td><td>¥39,000(税込)</td></tr><tr class="tr_op_description"><td>20歳未満限定 笑気麻酔サービス</td></tr></table>', url);
  assert.equal(pricing[0].amountMin, null);
  assert.match(pricing[0].conditions.join(' '), /20歳未満/);
  assert.equal(parsePage('<h2>鼻整形</h2><dl><dt>鼻尖形成</dt><dd>100,000円</dd></dl>', url).pricing[0].amountMin, null);
});

test('Shinagawa definition lists use their own treatment heading', () => {
  const html = '<main><div class="c-toggle03"><h3>二重術クイック法</h3><div><dl class="c-table03__item"><dt>2点(両目)</dt><dd><div class="c-price__main">22,000<span>円</span></div></dd></dl></div></div></main>';
  assert.equal(parsePage(html, 'https://www.shinagawa.com/price_eye/').pricing[0].treatment, '二重術クイック法');
});

test('site-specific cards preserve guarantees and exclude installment prices', () => {
  const emma = parsePage('<li><div class="treatment">埋没法 エマ・シングル<small>10年保証/笑気麻酔代込</small></div><div class="amount">通常料金150,000円(税込)</div></li>', 'https://www.emma-clinic.com/price/');
  assert.equal(emma.pricing[0].treatment, '埋没法 エマ・シングル');
  assert.match(emma.pricing[0].additionalCosts.join(' '), /笑気麻酔代込/);
  const eminal = parsePage('<li class="c-datsumou-list01__item"><h3>全身+VIO 6回</h3><div class="one-time"><h4>一括払い</h4><p>45,000円</p><p>49,500円</p></div><div class="installments">月々1,000円</div><p class="note">初回カウンセリング限定料金</p></li>', 'https://eminal-clinic.jp/menu/');
  assert.equal(eminal.pricing.length, 1);
  assert.match(eminal.pricing[0].treatment, /医療脱毛 全身/);
  assert.doesNotMatch(eminal.pricing[0].displayPrice, /1,000/);
  assert.match(eminal.pricing[0].conditions.join(' '), /初回/);
  assert.equal(eminal.pricing[0].amountMin, null);
  const blanc = parsePage('<div class="p-price"><dt class="p-price-box__title">全身(VIO含む)8回</dt><ul><li><dl><dd><div class="p-price-box__monthly">1回あたり12,000円</div><div class="p-price-box__once">一括払い96,000円(税込105,600円)</div></dd></dl></li></ul></div>', 'https://bccl.jp/price/');
  assert.equal(blanc.pricing.length, 1);
  assert.match(blanc.pricing[0].displayPrice, /105,600/);
  assert.doesNotMatch(blanc.pricing[0].displayPrice, /12,000/);
});

test('multiple unrelated charges never become a minimum/maximum price range', () => {
  const page = parsePage('<h2>鼻尖形成</h2><table><tr><th>鼻尖形成</th><td>税込200,000円 別途麻酔20,000円</td></tr></table>', url);
  assert.equal(page.pricing[0].amountMin, null);
  assert.equal(page.pricing[0].amountMax, null);
});

test('a global navigation menu cannot prove treatment availability at a branch', async () => {
  const extract = createHtmlExtractor({ maxPages: 2, pause: async () => {}, lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async target => new Response(target.endsWith('robots.txt') ? '' : target.endsWith('/price') ? fixture : '<header><a href="/price">二重埋没法 料金</a></header>', { headers: { 'content-type': 'text/html' } }) });
  const result = await extract({ sourceOfficialUrl: 'https://clinic.example/clinic/osaka', sharedDomain: false });
  assert.ok(result.extraction.pricing.every(p => p.scope === 'group'));
});

test('crawler follows same-site canonical redirects and rejects external redirects', async () => {
  const visited = [];
  const extract = createHtmlExtractor({ maxPages: 1, pause: async () => {}, lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async target => {
    visited.push(target);
    if (target.endsWith('robots.txt')) return new Response('');
    if (target.endsWith('/branch')) return new Response(null, { status: 301, headers: { location: '/branch/' } });
    if (target.endsWith('/external')) return new Response(null, { status: 302, headers: { location: 'https://unrelated.example/price' } });
    return new Response(fixture, { headers: { 'content-type': 'text/html' } });
  } });
  const result = await extract({ sourceOfficialUrl: 'https://clinic.example/branch' });
  assert.equal(result.extraction.pricing[0].sourceUrl, 'https://clinic.example/branch/');
  await assert.rejects(extract({ sourceOfficialUrl: 'https://clinic.example/external' }), /外部転送/);
  assert.ok(!visited.some(v => v.includes('unrelated')));
});

test('structured data is read without executing JS; off-domain links are excluded', () => {
  const result = parsePage('<header><a href="/fees/">料金</a></header><a href="https://outside.example/price">料金</a><script type="application/ld+json">{"@type":"Product","name":"鼻尖形成","offers":{"price":120000,"priceCurrency":"JPY"}}</script>', url);
  assert.equal(result.pricing[0].displayPrice, '120000円');
  assert.deepEqual(result.links.map(l => l.url), ['https://clinic.example/fees/']);
});

test('crawler rejects private, social and credential-bearing URLs before fetching', async () => {
  const lookup = async () => [{ address: '127.0.0.1' }];
  await assert.rejects(validateTarget('https://clinic.example', lookup), /公開インターネット/);
  for (const target of ['file:///etc/passwd', 'https://instagram.com/a', 'https://user:pass@clinic.example', 'https://127.0.0.1']) await assert.rejects(validateTarget(target), /取得対象外/);
});

test('crawler observes robots and shares pages between branches', async () => {
  const requested = [];
  const extract = createHtmlExtractor({ pause: async () => {}, maxPages: 3, lookup: async () => [{ address: '93.184.216.34' }], fetchImpl: async target => {
    requested.push(target);
    return new Response(target.endsWith('robots.txt') ? 'User-agent: *\nDisallow: /blocked' : target.endsWith('/price') ? fixture : '<a href="/price">料金</a><a href="/blocked">料金表</a>', { headers: { 'content-type': target.endsWith('robots.txt') ? 'text/plain' : 'text/html' } });
  } });
  const first = await extract({ sourceOfficialUrl: 'https://clinic.example/branch-a' });
  const second = await extract({ sourceOfficialUrl: 'https://clinic.example/branch-b' });
  assert.equal(first.extraction.pricing.length, 3);
  assert.equal(second.extraction.pricing.length, 3);
  assert.equal(requested.filter(u => u.endsWith('/price')).length, 1);
  assert.ok(!requested.some(u => u.endsWith('/blocked')));
  assert.equal(first.extraction.pricing[0].scope, 'group');
  assert.match(first.extraction.html.errors[0].error, /robots/);
});

function extraction(scope = 'clinic') {
  const page = parsePage(fixture, url, { scope });
  return { officialUrl: url, pricing: page.pricing, treatments: [{ name: '二重埋没法', parts: ['二重', '目元'], sourceUrl: url, scope }], html: { errors: [], truncated: false } };
}

test('saving protects reviewed data, common catalogues, failures and existing fields', () => {
  for (const existing of [{ verificationStatus: 'verified' }, { reviewedBy: 'admin' }]) {
    const result = htmlExtractionUpdate(existing, extraction(), { autoApply: true });
    assert.equal(result.autoApplied, false);
    assert.ok(!('pricing' in result.update));
  }
  assert.equal(htmlExtractionUpdate({}, extraction('group'), { autoApply: true }).autoApplied, false);
  const existing = { pricing: [{ treatment: '手入力', amountMin: 1 }], doctors: [{ name: '医師' }] };
  const first = htmlExtractionUpdate(existing, extraction(), { autoApply: true });
  assert.equal(first.update.pricing[0].treatment, '手入力');
  assert.ok(!('doctors' in first.update));
  const second = htmlExtractionUpdate({ ...existing, ...first.update }, extraction(), { autoApply: true });
  assert.equal(second.changed, false);
  assert.equal(second.update.pricing.length, first.update.pricing.length);
  const partial = extraction(); partial.html.errors.push({ error: 'HTTP 429' });
  assert.equal(htmlExtractionUpdate(existing, partial, { autoApply: true }).autoApplied, false);
});

test('transaction refuses a changed official URL and never creates a duplicate clinic', async () => {
  let writes = 0;
  const db = { collection: name => { assert.equal(name, 'clinics'); return { doc: id => { assert.equal(id, 'existing'); return {}; } }; }, runTransaction: fn => fn({ get: async () => ({ exists: true, data: () => ({ officialUrl: 'https://different.example' }) }), set: () => { writes++; } }) };
  await assert.rejects(saveExtraction(db, 'existing', extraction(), {}), /公式URLが変更/);
  assert.equal(writes, 0);
});

test('batch accounts for every clinic, keeps fetching after a site fails and needs no Gemini', async () => {
  const clinics = [{ id: 'missing' }, { id: 'a', officialUrl: url }, { id: 'b', officialUrl: 'https://other.example' }];
  const saved = [];
  const results = await run(clinics, { concurrency: 2, write: true, autoApply: false }, { extract: async input => { if (input.sourceOfficialUrl.includes('other')) throw new Error('HTTP 403'); return { extraction: extraction(), model: 'html' }; }, save: async id => { saved.push(id); return { autoApplied: false }; } });
  assert.equal(results.length, 3);
  assert.deepEqual(saved, ['a']);
  assert.deepEqual(results.map(r => r.status).sort(), ['extracted', 'failed', 'missing_url']);
  assert.throws(() => parseArguments(['--max-pages', '0']));
});

test('admin HTML route authenticates and saves without a Gemini API key', async () => {
  const calls = [];
  const handler = createClinicAdminHandler({ authenticate: async () => ({ email: 'admin@example.com', email_verified: true }), geminiApiKey: '', parseBody: async () => ({ confirmed: true }), getStore: () => ({ get: async () => ({ id: 'a', name: '登録クリニック', officialUrl: url }), saveHtmlExtraction: async (...args) => { calls.push(args); return { changed: true }; } }), extractHtml: async () => ({ extraction: extraction(), model: 'html' }) });
  const old = process.env.CLINIC_ADMIN_EMAILS;
  process.env.CLINIC_ADMIN_EMAILS = 'admin@example.com';
  try {
    const result = await handler({ url: '/api/admin/clinics/a/extract-html', method: 'POST', headers: { 'content-type': 'application/json' } });
    assert.equal(result.status, 200, JSON.stringify(result));
    assert.equal(result.data.succeeded, 1);
    assert.equal(calls[0][0], 'a');
  } finally { if (old === undefined) delete process.env.CLINIC_ADMIN_EMAILS; else process.env.CLINIC_ADMIN_EMAILS = old; }
});
