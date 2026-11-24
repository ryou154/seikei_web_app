const { load } = require('cheerio');
const dns = require('node:dns/promises');
const net = require('node:net');
const { createHash } = require('node:crypto');
const robotsParser = require('robots-parser');
const SITE_CONFIG = require('./data/clinic-html-sites.json').sites;
const { partsFromTreatmentName } = require('./treatment-parts');
const { extractPdf, recognizeImage, renderOfficialPage } = require('./clinic-media-extract');

const VERSION = 'official-html-v1';
const clean = value => String(value || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const MONEY = /(?:[¥￥]\s*\d[\d,]*(?:万[\d,]*)?|\d[\d,]*(?:万[\d,]*)?\s*円)/g;
const TREATMENT = /二重|目元|眼瞼|まぶた|目頭|目尻|クマ|涙袋|鼻|輪郭|小顔|リフト|たるみ|エラ|顎|あご|唇|人中|肌|シミ|しみ|毛穴|ニキビ|レーザー|ピーリング|脱毛|豊胸|バスト|乳|脂肪|脱脂|切除|痩身|ボトックス|ヒアルロン|注入|点滴|ほくろ|ホクロ|多汗|ワキガ|薄毛|育毛|医療|埋没|切開|注射|糸|ダーマ|ポテンツァ|グルタチオン|ビタミン|HIFU|ハイフ/i;
const EXCLUDE = /月々|月額|分割|ローン|指名料|予約料|キャンセル料|診察料|カウンセリング料|診断書|証明書|紹介状|請求明細|交通共済|自賠|保険請求|送料|採用|求人/;
const SOCIAL = /(^|\.)(instagram\.com|lin\.ee|line\.me|facebook\.com|x\.com|twitter\.com|doctorqube\.com|medicomcloud\.com|icon-generator\.net)$/;
const PROFILES = [
  { id: 'shinagawa', hosts: ['shinagawa.com'], seeds: ['/price/'], pricePath: /^\/price(?:_|\/)/, rows: 'dl.c-table03__item', chain: true },
  { id: 'sbc', hosts: ['s-b-c.net'], seeds: ['/charge_list/'], pricePath: /\/charge_list\/$/, chain: true },
  { id: 'tcb', hosts: ['aoki-tsuyoshi.com'], seeds: ['/price'], pricePath: /^\/price(?:\/|$)/, chain: true },
  { id: 'lula', hosts: ['lula-beauty.jp'], seeds: ['/price/'], pricePath: /price|charge/, chain: true },
  { id: 'shiromoto', hosts: ['shiromoto.to'], seeds: ['/price/'], pricePath: /price|charge/, chain: true },
  { id: 'emma', hosts: ['emma-clinic.com'], seeds: ['/price/'], pricePath: /price/ },
  { id: 'shirasagi', hosts: ['shirasagi-clinic.com'], seeds: ['/price'], pricePath: /price/ },
  { id: 'eminal', hosts: ['eminal-clinic.jp'], seeds: ['/menu/'], pricePath: /\/menu(?:\/|$)/, chain: true },
  { id: 'seishin', hosts: ['biyougeka.com'], seeds: ['/cost/'], pricePath: /\/cost\//, chain: true },
  { id: 'blanc', hosts: ['bccl.jp'], seeds: ['/price/'], pricePath: /\/price\//, chain: true },
  { id: 'kclinic', hosts: ['kclinic-matsuyama.com'], seeds: ['/price/'], pricePath: /price/ },
  { id: 'myu', hosts: ['myuclinic.jp'], seeds: ['/price/'], pricePath: /price/ }
];

function partsFromName(name) {
  return partsFromTreatmentName(name);
}

function profileFor(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const site = SITE_CONFIG[host];
  const profile = PROFILES.find(p => p.hosts.includes(host)) || { id: 'semantic', seeds: [], pricePath: /price|pricing|charge|fee|cost|ryokin|料金/i };
  return { ...profile, seeds: [...new Set([...profile.seeds, ...(site?.seeds || [])])], chain: Boolean(profile.chain || site?.clinicCount > 1) };
}

function publicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 || a >= 224 || a === 198 && (b === 18 || b === 19));
  }
  // Accept global IPv6 only, including no IPv4-mapped/local/multicast addresses.
  return net.isIP(address) === 6 && /^[23]/.test(address);
}

async function validateTarget(value, lookup = dns.lookup) {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port && !['80', '443'].includes(url.port)
    || net.isIP(url.hostname) || SOCIAL.test(url.hostname) || !url.hostname.includes('.')) throw new Error('公式HTMLの取得対象外URLです');
  const records = await lookup(url.hostname, { all: true });
  if (!records.length || records.some(r => !publicAddress(r.address))) throw new Error('公開インターネット以外の取得先には接続できません');
  url.hash = '';
  return url;
}

function sameOriginLink(href, base, { media = false } = {}) {
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin || url.username || url.password || !/^https?:$/.test(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    if ([...url.searchParams.keys()].some(key => !/^(page|id|p|cat|category|menu|service|post_type|type|treatment)$/i.test(key))) return null;
    if (media ? /\.(zip|exe|js|css)$/i.test(url.pathname) : /\.(pdf|jpe?g|png|webp|gif|zip|js|css)$/i.test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

function document(html) {
  const $ = load(html);
  $('script,style,noscript,header,footer,nav,[hidden],[aria-hidden="true"],del,s,.loan-pop').remove();
  $('[class*="monitor-icon"]').replaceWith(' モニター ');
  $('img[alt]').each((_, e) => { const alt = $(e).attr('alt'); if (/モニター|会員|初回/.test(alt)) $(e).replaceWith(` ${alt} `); });
  $('br').replaceWith(' ');
  return $;
}

// Find preceding headings along the ancestor path, never a later or sibling treatment.
function headingContext($, element) {
  let current = $(element), values = [];
  for (let depth = 0; current.length && depth < 9; depth++, current = current.parent()) {
    const previous = current.prevAll('h2,h3,h4,h5,h6,.price_header').first();
    if (previous.length) values.push(clean(previous.text()));
    if (current.is('section,article,[class*="group-itembox"],.c-toggle03')) {
      const head = current.children('h2,h3,h4,h5,h6').first();
      if (head.length) values.push(clean(head.text()));
    }
    if (values.some(v => TREATMENT.test(v))) break;
  }
  return [...new Set(values)].reverse().filter(v => v.length < 180);
}

function numericPrice(text) {
  const value = clean(text).replace(/[¥￥円,\s]/g, '');
  if (!/^\d+(?:万\d*)?$/.test(value)) return null;
  const [high, low] = value.split('万');
  const amount = low === undefined ? Number(high) : Number(high) * 10000 + Number(low || 0);
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 1e9 ? amount : null;
}

function priceItem({ name, price, conditions = [], evidence, sourceUrl, scope, taxIncluded = false }) {
  name = clean(name);
  price = clean(price);
  evidence = clean(evidence);
  if (!name || name.length > 150 || !TREATMENT.test(name) || EXCLUDE.test(price) || EXCLUDE.test(name)) return null;
  const amounts = [...price.matchAll(MONEY)].map(m => m[0]);
  if (!amounts.length) return null;
  const taxed = price.match(/税込\s*([¥￥]?\s*\d[\d,]*(?:万[\d,]*)?\s*円?)/);
  const range = /[〜～~－–-]/.test(price);
  const rangeMatch = price.match(/([¥￥])?\s*(\d[\d,]*(?:万[\d,]*)?)\s*(円)?\s*[〜～~－–-]\s*([¥￥])?\s*(\d[\d,]*(?:万[\d,]*)?)\s*(円)?/);
  const moneyRange = rangeMatch && (rangeMatch[1] || rangeMatch[3] || rangeMatch[4] || rangeMatch[6]);
  const numbers = moneyRange ? [numericPrice(rangeMatch[2]), numericPrice(rangeMatch[5])] : taxed && !range ? [numericPrice(taxed[1])] : amounts.map(numericPrice);
  const restriction = /モニター|会員|初回|限定|キャンペーン|割引|学生|歳未満|片目|片側/.test([name, price, ...conditions].join(' '));
  const explicitTax = taxed || /税込/.test(price) || taxIncluded;
  const unambiguous = amounts.length === 1 || Boolean(taxed) && amounts.length === 2 || range && amounts.length === 2;
  const numeric = explicitTax && !restriction && unambiguous && !/\d\.\d/.test(price) && !(range && /税抜|税別/.test(price)) && !/追加|別途|麻酔|針|薬|参考|最大割引/.test(price) && numbers.every(n => n !== null) && numbers.length <= 2 && !(moneyRange && numbers[0] > numbers[1]);
  return {
    treatment: name, displayPrice: price.slice(0, 100),
    amountMin: numeric ? Math.min(...numbers) : null, amountMax: numeric ? Math.max(...numbers) : null,
    conditions: [...new Set(conditions.map(clean).filter(Boolean))].slice(0, 20).map(t => t.slice(0, 200)),
    additionalCosts: conditions.filter(t => /麻酔|針代|薬代|別途|追加/.test(t)).slice(0, 20).map(t => t.slice(0, 200)),
    sourceUrl, evidence: evidence.slice(0, 500), confidence: 0.95, scope
  };
}

function parsePage(html, sourceUrl, { scope = 'unconfirmed' } = {}) {
  const $ = document(html), profile = profileFor(sourceUrl), pricing = [], warnings = [];
  const wholeText = clean(($('main').length ? $('main') : $('body')).text());
  const globalTax = /(?:すべて|全て|すべての|全ての|料金表示はすべて)[^。]{0,30}税込|(?:表示価格|表示料金|料金)[^。]{0,20}(?:すべて|全て)[^。]{0,20}税込/.test(wholeText);
  function add(element, labels, price, extra = []) {
    const context = headingContext($, element);
    const candidates = labels.filter(t => TREATMENT.test(t));
    const name = candidates[0] || context.filter(t => TREATMENT.test(t)).at(-1);
    const contextText = [...context, ...labels, ...extra].join(' ');
    const item = priceItem({ name, price, conditions: [...context, ...labels.filter(v => v !== name), ...extra], evidence: `${contextText} ${price}`, sourceUrl, scope, taxIncluded: globalTax });
    if (item) pricing.push(item);
  }

  // Expand rowspan/colspan within each individual table; ignore outer layout tables.
  $('table').each((_, table) => {
    if ($(table).find('table').length) return;
    const pending = [];
    const header = [];
    $(table).find('tr').each((__, tr) => {
      const cells = [], nodes = [];
      for (let i = 0; i < pending.length; i++) if (pending[i]?.remaining > 0) {
        cells[i] = pending[i].text; pending[i].remaining--;
      }
      $(tr).children('th,td').each((___, cell) => {
        let index = 0; while (cells[index] !== undefined) index++;
        const text = clean($(cell).text());
        const colspan = Math.min(20, Number($(cell).attr('colspan')) || 1);
        const rowspan = Math.min(100, Number($(cell).attr('rowspan')) || 1);
        for (let n = 0; n < colspan; n++) {
          cells[index + n] = text; nodes[index + n] = cell;
          if (rowspan > 1) pending[index + n] = { text, remaining: rowspan - 1 };
        }
      });
      if (!cells.some(t => t && [...t.matchAll(MONEY)].length)) {
        cells.forEach((t, i) => { if (t) header[i] = t; });
        return;
      }
      const labels = [...new Set(cells.filter(t => t && ![...t.matchAll(MONEY)].length))];
      cells.forEach((price, index) => {
        if (!price || ![...price.matchAll(MONEY)].length || !nodes[index]) return;
        if (price.length > 300) { warnings.push('複雑な価格セルを除外'); return; }
        const extra = [];
        if (header[index]) extra.push(header[index]);
        // TCB keeps age restrictions and anesthesia notes in the following row.
        const next = $(tr).next('.tr_op_description');
        if (next.length) extra.push(clean(next.text()));
        add(tr, labels, price, extra);
      });
    });
  });
  // Definition lists include Shinagawa's c-table03 and many independent clinics.
  $('dt').each((_, dt) => {
    if (profile.id === 'kclinic' && $(dt).closest('.price-section__row').length) return;
    const label = clean($(dt).text());
    const descriptions = $(dt).nextUntil('dt').filter('dd');
    const supplements = descriptions.toArray().map(dd => clean($(dd).text())).filter(t => t && ![...t.matchAll(MONEY)].length && t.length < 200);
    descriptions.each((__, dd) => {
      if ($(dd).find('dl,table').length) return;
      const price = clean($(dd).text());
      if (price.length <= 300) add(dt, [label], price, supplements);
    });
  });
  // Clinic-specific cards retain the exact local treatment and its attached notes.
  if (profile.id === 'emma') {
    $('li').each((_, row) => {
      const price = clean($(row).children('.amount').text());
      if (!price) return;
      const treatment = $(row).children('.treatment').clone();
      const notes = clean(treatment.find('small').text()); treatment.find('small').remove();
      add(row, [clean(treatment.text())], price, [notes, clean($(row).children('.cubic').text())]);
    });
  }
  if (profile.id === 'shirasagi') {
    $('ul.list').each((_, row) => {
      const name = clean($(row).children('li').first().text());
      const price = clean($(row).children('div').children('li').first().text());
      const note = clean($(row).children('div').children('li').slice(1).text());
      add(row, [name], price, [note]);
    });
  }
  if (profile.id === 'eminal') {
    $('li.c-datsumou-list01__item').each((_, row) => {
      const name = `医療脱毛 ${clean($(row).find('h3').first().text())}`;
      const oneTime = $(row).find('.one-time').first();
      const prices = clean(oneTime.text());
      const notes = clean($(row).find('[class*="note"]').text());
      const item = priceItem({ name, price: prices, conditions: [notes], evidence: `${name} ${prices} ${notes}`, sourceUrl, scope });
      if (item) pricing.push(item);
    });
    $('.one-time').each((_, row) => {
      if ($(row).closest('li.c-datsumou-list01__item').length) return;
      const name = clean($(row).children('h4').first().text());
      $(row).children('.one-time__price').each((__, p) => add(row, [name], clean($(p).text())));
    });
  }
  if (profile.id === 'blanc') {
    $('.p-price-box__once').each((_, row) => {
      const list = $(row).closest('ul');
      const title = clean(list.prevAll('.p-price-box__title').first().text());
      const notes = clean($(row).closest('.p-price').find('[class*="note"]').text());
      add(row, [`医療脱毛 ${title}`], clean($(row).text()), [notes]);
    });
  }
  if (profile.id === 'kclinic') {
    $('.price-section__row').each((_, row) => {
      const title = clean($(row).closest('.price-section__block').find('.price-section__title').first().text());
      const label = clean($(row).children('dt').text());
      if (!TREATMENT.test(`${title} ${label}`)) return;
      const notes = clean($(row).closest('.price-section__group').children('.price-section__notes').text());
      $(row).find('.price-section__price-inner').each((__, price) => add(row, [`${title} ${label}`], clean($(price).text()), [notes]));
    });
  }
  if (profile.id === 'myu') {
    $('.p-price-card').each((_, row) => {
      const name = clean($(row).find('h3,h4,.p-price-card__title').first().text());
      const note = clean($(row).find('[class*="note"]').text());
      $(row).find('.p-price-card__amount').each((__, amount) => add(row, [name], clean($(amount).text()), [note]));
    });
  }
  // Flex/grid cards often use ordinary paragraphs instead of table semantics.
  // Only accept one explicit treatment label in the same small container.
  if (!pricing.length) {
    $('p,span,div').each((_, element) => {
      if ($(element).closest('table,dl').length) return;
      const price = clean($(element).text());
      if (!/^(?:税込\s*)?[¥￥]?\s*\d[\d,.]*(?:万[\d,.]*)?\s*円(?:\s*[()税込税別税抜]*)?$/.test(price)) return;
      if ($(element).children().toArray().some(child => [...clean($(child).text()).matchAll(MONEY)].length)) return;
      let container = $(element).parent();
      for (let depth = 0; depth < 2 && container.length; depth++, container = container.parent()) {
        if (clean(container.text()).length > 600) break;
        const names = [...new Set(container.children('h2,h3,h4,h5,p,span,[class*="name"],[class*="title"],[class*="treatment"]').toArray()
          .map(node => clean($(node).text())).filter(text => text.length <= 150 && TREATMENT.test(text) && ![...text.matchAll(MONEY)].length))];
        if (names.length !== 1) continue;
        const before = clean($(element).prev().text());
        const count = pricing.length;
        add(container, names, price, before && before !== names[0] && before.length < 200 ? [before] : []);
        if (pricing.length > count) { pricing.at(-1).scope = 'unconfirmed'; pricing.at(-1).requiresReview = true; }
        break;
      }
    });
  }
  // Explicit schema.org Offer/Product data is parsed without executing scripts.
  // Some local practices publish a complete procedure/fee pair in one heading.
  // Keep this as a review candidate; do not join neighbouring unrelated text.
  if (!pricing.length) {
    $('h2,h3,h4,h5,p,li').each((_, element) => {
      if ($(element).closest('table,dl,nav,header,footer,[data-unparsed-media]').length || $(element).find('h2,h3,h4,h5,p,li').length) return;
      const text = clean($(element).text());
      if (text.length > 180) return;
      const amounts = [...text.matchAll(MONEY)];
      if (amounts.length !== 1) return;
      const amount = amounts[0], name = text.slice(0, amount.index).replace(/[\s：:/／・]+$/, '').trim();
      if (!TREATMENT.test(name) || !name || /初診|再診|診察|カウンセリング/.test(name)) return;
      const count = pricing.length;
      add(element, [name], amount[0], [text.slice(amount.index + amount[0].length)].filter(Boolean));
      if (pricing.length > count) { pricing.at(-1).scope = 'unconfirmed'; pricing.at(-1).requiresReview = true; }
    });
  }
  const raw = load(html);
  raw('script[type="application/ld+json"]').each((_, script) => {
    try {
      const walk = (value, depth = 0) => {
        if (depth > 15 || !value || typeof value !== 'object') return;
        if (value.name && value.offers) {
          for (const offer of [value.offers].flat()) {
            if (offer?.priceCurrency !== 'JPY' || !/^\d+$/.test(String(offer.price))) continue;
            const item = priceItem({ name: value.name, price: `${offer.price}円`, evidence: JSON.stringify({ name: value.name, offers: offer }), sourceUrl, scope });
            if (item) pricing.push(item);
          }
        }
        for (const child of Object.values(value)) if (typeof child === 'object') Array.isArray(child) ? child.forEach(v => walk(v, depth + 1)) : walk(child, depth + 1);
      };
      walk(JSON.parse(raw(script).text()));
    } catch { warnings.push('構造化データを解析できません'); }
  });
  const links = [];
  raw('a[href]').each((_, a) => {
    const url = sameOriginLink(raw(a).attr('href'), sourceUrl);
    if (!url) return;
    const label = clean([raw(a).text(), raw(a).attr('aria-label'), raw(a).attr('title'), ...raw(a).find('img').map((_, img) => raw(img).attr('alt')).get()].filter(Boolean).join(' '));
    links.push({ url, label, price: profile.pricePath.test(new URL(url).pathname) || /料金|費用|価格表/.test(label), treatment: /診療案内|診療メニュー|施術一覧|治療一覧|診療内容/.test(label) || TREATMENT.test(label) });
  });
  raw('frame[src],iframe[src]').each((_, frame) => {
    const url = sameOriginLink(raw(frame).attr('src'), sourceUrl);
    if (url) links.push({ url, label: '公式サイト内の埋め込み', price: true });
  });
  const media = [];
  raw('a[href],iframe[src],object[data],embed[src]').each((_, element) => {
    const href = raw(element).attr('href') || raw(element).attr('src') || raw(element).attr('data');
    const url = sameOriginLink(href, sourceUrl, { media: true });
    if (url && /\.pdf(?:[?#]|$)/i.test(url)) {
      const label = clean(raw(element).text());
      media.push({ url, kind: 'pdf', label, priority: /料金|価格|費用|price|charge|fee/i.test(`${label} ${url}`) ? 10 : 2 });
    }
  });
  $('img').each((_, img) => {
    const href = $(img).attr('data-src') || $(img).attr('src');
    if (!href) return;
    let url; try { url = new URL(href, sourceUrl); if (!/^https?:$/.test(url.protocol) || url.username || url.password) return; } catch { return; }
    const label = clean($(img).attr('alt'));
    const relevant = /料金|価格|費用|円|price|charge|fee/i.test(`${label} ${url.pathname}`);
    const onPricePage = profile.pricePath.test(new URL(sourceUrl).pathname) && !/logo|icon|banner|doctor|case|bnr|arrow/i.test(url.pathname);
    if (relevant || onPricePage && (!$(img).attr('width') || Number($(img).attr('width')) >= 400)) media.push({ url: url.href, kind: 'image', label, priority: relevant ? 9 : 5 });
  });
  if (profile.pricePath.test(new URL(sourceUrl).pathname)) {
    $('[style*="background"],picture source[srcset]').each((_, element) => {
      const style = $(element).attr('style') || '';
      const candidates = [...style.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]);
      const srcset = $(element).attr('srcset');
      if (srcset) candidates.push(...srcset.split(',').map(part => part.trim().split(/\s+/)[0]).reverse());
      for (const href of candidates.slice(0, 2)) {
        try {
          const url = new URL(href, sourceUrl);
          if (!/^https?:$/.test(url.protocol) || url.username || url.password || /logo|icon|arrow/i.test(url.pathname)) continue;
          media.push({ url: url.href, kind: 'image', label: clean($(element).attr('aria-label')), priority: 5 });
        } catch {}
      }
    });
  }
  const information = { downtimeAndRisks: [], warrantyAndAftercare: [] };
  $('h2,h3,h4,h5').each((_, heading) => {
    const title = clean($(heading).text());
    const field = /ダウンタイム|副作用|リスク/.test(title) ? 'downtimeAndRisks' : /保証|保障|アフターケア|術後対応/.test(title) ? 'warrantyAndAftercare' : '';
    if (!field || title.length > 100) return;
    const description = clean($(heading).nextUntil('h1,h2,h3,h4,h5,h6').slice(0, 4).text());
    if (!description || description.length > 1000) return;
    const treatment = headingContext($, heading).filter(t => TREATMENT.test(t) && !/ダウンタイム|副作用|リスク|保証|保障/.test(t)).at(-1) || '';
    information[field].push({ title, description, treatment, sourceUrl, evidence: `${title} ${description}`.slice(0, 500), confidence: 0.9, scope });
  });
  const availabilityLinks = [];
  $('#case a[href], [id*="treatment"] a[href], .clinic-treatment a[href], [class*="clinic-menu"] a[href], [class*="clinic_menu"] a[href]').each((_, a) => {
    const href = sameOriginLink($(a).attr('href'), sourceUrl), label = clean($(a).text());
    if (href && TREATMENT.test(label)) availabilityLinks.push({ url: href, label });
  });
  const unique = [...new Map(pricing.map(p => [`${p.treatment}\n${p.displayPrice}\n${p.conditions.join('|')}`, p])).values()];
  const diagnostics = {
    moneyMarkers: [...wholeText.matchAll(MONEY)].length,
    pdfPriceLinks: raw('a[href]').toArray().filter(a => /\.pdf(?:[?#]|$)/i.test(raw(a).attr('href')) && /料金|価格|費用|price/i.test(`${raw(a).text()} ${raw(a).attr('href')}`)).length,
    priceImages: raw('img').toArray().filter(img => /料金|価格|price|charge/i.test(`${raw(img).attr('alt')} ${raw(img).attr('src')}`)).length,
    scriptRendered: /__NUXT__|__NEXT_DATA__|wixstatic|studiodesignapp/.test(html)
  };
  return { pricing: unique, links, media: media.map(m => ({ ...m, sourcePageUrl: sourceUrl })), information, availabilityLinks, diagnostics, profile: profile.id, warnings: [...new Set(warnings)] };
}

function createHtmlExtractor({ fetchImpl = fetch, lookup = dns.lookup, pause, maxPages = 30,
  renderJs = process.env.CLINIC_HTML_RENDER_JS === 'yes', ocr = process.env.CLINIC_HTML_OCR === 'yes',
  maxMedia = 3, maxPdfPages = 5, renderPage = renderOfficialPage, pdfExtractor = extractPdf, imageRecognizer = recognizeImage } = {}) {
  const origins = new Map();
  const pageCache = new Map(), canonicalUrls = new Map();
  const wait = pause || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const sameSite = (a, b) => a.hostname.replace(/^www\./, '') === b.hostname.replace(/^www\./, '') && !(a.protocol === 'https:' && b.protocol !== 'https:');
  async function readBuffer(response, maximum = 5000000) {
    if (Number(response.headers.get('content-length')) > maximum) throw new Error('ページ容量が上限を超えています');
    let size = 0;
    const chunks = [];
    for await (const chunk of response.body || []) {
      size += chunk.length;
      if (size > maximum) throw new Error('ページ容量が上限を超えています');
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  async function readResponse(response) {
    const buffer = await readBuffer(response);
    const charset = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1]
      || buffer.subarray(0, 3000).toString('ascii').match(/charset\s*=\s*["']?([\w-]+)/i)?.[1] || 'utf-8';
    try { return new TextDecoder(charset).decode(buffer); } catch { return buffer.toString('utf8'); }
  }
  async function rawRequest(url) {
    await validateTarget(url, lookup);
    try {
      return await fetchImpl(url, { redirect: 'manual', headers: { 'User-Agent': 'SeikeiClinicCollector/1.0', Accept: 'text/html,text/plain' }, signal: AbortSignal.timeout(20000) });
    } catch (error) { throw new Error(`${error.message}${error.cause?.code ? ` (${error.cause.code})` : ''}`); }
  }
  function originState(origin) {
    if (!origins.has(origin)) {
      const state = { stopped: '', delay: 1500, last: 0, queue: Promise.resolve(), robots: null };
      origins.set(origin, state);
      state.initialized = (async () => {
        let robotsUrl = new URL('/robots.txt', origin);
        for (let hop = 0; hop < 4; hop++) {
          const response = await rawRequest(robotsUrl.href);
          state.last = Date.now();
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            const target = new URL(response.headers.get('location'), robotsUrl);
            if (!sameSite(robotsUrl, target) || hop === 3) throw new Error('robots.txtの外部転送または転送上限');
            await response.body?.cancel(); await wait(1500); robotsUrl = target; continue;
          }
          if (!response.ok && response.status !== 404) throw new Error(`HTTP ${response.status}: ${robotsUrl.href}`);
          const text = await readResponse(response);
          if (response.status !== 404 && /^\s*</.test(text)) throw new Error('robots.txtがHTMLのため取得を停止しました');
          state.robots = robotsParser(new URL('/robots.txt', origin).href, response.status === 404 ? '' : text);
          state.delay = Math.max(1500, (state.robots.getCrawlDelay('SeikeiClinicCollector') || 0) * 1000);
          if (state.delay > 60000) throw new Error('Crawl-delayが60秒を超えています');
          return;
        }
      })().catch(error => { state.stopped = error.message; throw error; });
      state.initialized.catch(() => {});
    }
    return origins.get(origin);
  }
  async function request(url, hops = 0, resource = false) {
    const parsed = await validateTarget(url, lookup), state = originState(parsed.origin);
    await state.initialized;
    const task = state.queue.then(async () => {
      if (state.stopped) throw new Error(state.stopped);
      if (state.robots.isAllowed(url, 'SeikeiClinicCollector') === false) throw new Error(`robots.txtで取得が許可されていません: ${url}`);
      await wait(Math.max(0, state.delay - (Date.now() - state.last)));
      const response = await rawRequest(url);
      state.last = Date.now();
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = new URL(response.headers.get('location'), url);
        await response.body?.cancel();
        if (!sameSite(parsed, target) || hops >= 3) throw new Error(`外部転送または転送上限: ${url}`);
        return { redirect: target.href };
      }
      if (!response.ok) {
        if ([403, 429, 503].includes(response.status)) state.stopped = `HTTP ${response.status}: ${url}`;
        throw new Error(`HTTP ${response.status}: ${url}`);
      }
      if (resource) return { buffer: await readBuffer(response, 15000000), contentType: response.headers.get('content-type') || '', url };
      if (!/text\/html/i.test(response.headers.get('content-type') || '')) throw new Error(`HTMLではありません: ${url}`);
      return { html: await readResponse(response), url };
    });
    state.queue = task.catch(() => {});
    const result = await task;
    return result.redirect ? request(result.redirect, hops + 1, resource) : result;
  }
  function get(url) {
    if (!pageCache.has(url) && pageCache.size >= 60) { const oldest = pageCache.keys().next().value; pageCache.delete(oldest); canonicalUrls.delete(oldest); }
    if (!pageCache.has(url)) pageCache.set(url, request(url).then(result => { canonicalUrls.set(url, result.url); return result.html; }));
    return pageCache.get(url);
  }
  const resourceCache = new Map();
  const resourceSizes = new Map(); let resourceBytes = 0;
  function getResource(url) {
    if (!resourceCache.has(url)) resourceCache.set(url, request(url, 0, true).then(result => {
      if (resourceCache.has(url)) {
        resourceSizes.set(url, result.buffer.length); resourceBytes += result.buffer.length;
        while (resourceBytes > 64000000 && resourceCache.size > 1) {
          const oldest = resourceCache.keys().next().value;
          resourceBytes -= resourceSizes.get(oldest) || 0; resourceSizes.delete(oldest); resourceCache.delete(oldest);
        }
      }
      return result;
    }));
    return resourceCache.get(url);
  }
  const extract = async function ({ sourceOfficialUrl, sharedDomain = true }) {
    const registered = await validateTarget(sourceOfficialUrl, lookup);
    let initialHtml = await get(registered.href);
    const initial = new URL(canonicalUrls.get(registered.href));
    const profile = profileFor(initial.href);
    const branchPath = /\/(clinic|branch|store|about2?)\/[^/]+/i.test(initial.pathname);
    let preliminary = parsePage(initialHtml, initial.href);
    const renderAttempts = [];
    if (renderJs && !preliminary.pricing.length && (preliminary.diagnostics.scriptRendered || !preliminary.links.some(l => l.price))) {
      try {
        const rendered = await renderPage({ url: initial.href, html: initialHtml, fetchResource: getResource });
        initialHtml = rendered.html; preliminary = parsePage(initialHtml, initial.href);
        renderAttempts.push({ url: initial.href, ok: true, blocked: rendered.blocked || [], errors: rendered.errors || [] });
      } catch (error) { renderAttempts.push({ url: initial.href, ok: false, error: error.message }); }
    }
    const branchCount = new Set(preliminary.links.filter(l => /\/(clinic|branch|store)\/[^/]+/i.test(new URL(l.url).pathname)).map(l => l.url)).size;
    const shared = profile.chain || sharedDomain || branchPath || branchCount > 1;
    const scope = shared ? 'group' : profile.id === 'semantic' ? 'unconfirmed' : 'clinic';
    const branchPage = parsePage(initialHtml, initial.href, { scope });
    const queue = [...profile.seeds.map(s => new URL(s, initial.origin).href), ...branchPage.links.filter(l => l.price).map(l => l.url), ...branchPage.links.filter(l => l.treatment).map(l => l.url)];
    const visited = new Set([initial.href]), pricing = [...branchPage.pricing], errors = [], warnings = [...branchPage.warnings], diagnostics = [branchPage.diagnostics];
    const mediaQueue = [...branchPage.media], mediaResults = [];
    const information = { downtimeAndRisks: [...branchPage.information.downtimeAndRisks], warrantyAndAftercare: [...branchPage.information.warrantyAndAftercare] };
    const appendPage = page => {
      mediaQueue.push(...page.media);
      for (const field of Object.keys(information)) information[field].push(...page.information[field]);
    };
    const branchLinks = new Set(branchPath ? branchPage.availabilityLinks.map(l => l.label) : []);
    while (queue.length && visited.size < maxPages) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);
      try {
        let html = await get(url);
        let page = parsePage(html, canonicalUrls.get(url), { scope });
        if (renderJs && !page.pricing.length && page.diagnostics.scriptRendered && renderAttempts.length < 2) {
          try { const rendered = await renderPage({ url: canonicalUrls.get(url), html, fetchResource: getResource }); html = rendered.html; page = parsePage(html, canonicalUrls.get(url), { scope }); renderAttempts.push({ url, ok: true, errors: rendered.errors || [] }); }
          catch (error) { renderAttempts.push({ url, ok: false, error: error.message }); }
        }
        pricing.push(...page.pricing.map(p => ({ ...p, scope: branchLinks.has(p.treatment) ? 'clinic' : p.scope })));
        warnings.push(...page.warnings);
        diagnostics.push(page.diagnostics);
        appendPage(page);
        queue.push(...page.links.filter(l => l.price).map(l => l.url));
        if (!page.pricing.length) queue.push(...page.links.filter(l => l.treatment).map(l => l.url));
      } catch (error) {
        errors.push({ url, error: error.message });
        if (/HTTP (403|429|503)|robots/.test(error.message)) break;
      }
    }
    const mediaTargets = [...new Map(mediaQueue.filter(m => m.kind === 'pdf' || ocr).map(m => [m.url, m])).values()].sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const target of mediaTargets.slice(0, maxMedia)) {
      try {
        const resource = await getResource(target.url);
        const hash = createHash('sha256').update(resource.buffer).digest('hex');
        const pages = target.kind === 'pdf'
          ? (await pdfExtractor(resource.buffer, { maxPages: maxPdfPages, ocr: ocr ? imageRecognizer : null }))
          : { pages: [{ number: 1, method: 'image-ocr', ...(await imageRecognizer(resource.buffer)) }], truncated: false };
        let found = 0;
        for (const page of pages.pages) {
          const sourceUrl = target.kind === 'pdf' ? `${resource.url}#page=${page.number}` : target.sourcePageUrl || initial.href;
          const parsed = parsePage(page.html, sourceUrl, { scope: 'unconfirmed' });
          pricing.push(...parsed.pricing.map(p => ({ ...p, scope: 'unconfirmed', extractionMethod: page.method,
            sourceMediaUrl: resource.url, mediaPage: page.number, requiresReview: true,
            ...(page.method.includes('ocr') ? { amountMin: null, amountMax: null, confidence: 0.6 } : {}) })));
          found += parsed.pricing.length;
          for (const field of Object.keys(information)) information[field].push(...parsed.information[field].map(item => ({ ...item,
            scope: 'unconfirmed', requiresReview: true, extractionMethod: page.method, sourceMediaUrl: resource.url, mediaPage: page.number })));
        }
        mediaResults.push({ url: resource.url, sourcePageUrl: target.sourcePageUrl, kind: target.kind, sha256: hash, pages: pages.pages.length, prices: found, truncated: pages.truncated,
          textSamples: pages.pages.flatMap(p => p.lines || []).map(l => clean(l.text)).filter(t => /円|¥|￥|ダウンタイム|保証|保障|副作用|リスク|術後|追加費用|麻酔/.test(t)).slice(0, 12).map(t => t.slice(0, 200)) });
      } catch (error) { mediaResults.push({ url: target.url, kind: target.kind, error: error.message }); }
    }
    let unique = [...new Map(pricing.map(p => [`${p.treatment}|${p.displayPrice}|${p.conditions.join('|')}|${p.sourceUrl}`, p])).values()];
    const originalCount = unique.length;
    // Firestore has a 1 MiB document limit; leave space for the existing clinic.
    while (unique.length > 300 || Buffer.byteLength(JSON.stringify(unique)) > 350000) unique.pop();
    const treatments = [...new Map(unique.map(p => [p.treatment, { name: p.treatment, parts: partsFromName(p.treatment), sourceUrl: p.sourceUrl, evidence: p.evidence, confidence: p.confidence, scope: p.scope }])).values()];
    const missing = [];
    if (!unique.length) {
      if (diagnostics.some(d => d.pdfPriceLinks)) missing.push('料金PDFがありますが、今回の解析では施術と料金の対応を確認できません');
      if (diagnostics.some(d => d.priceImages)) missing.push(ocr ? '料金に関連する画像をOCR対象としましたが、今回の解析では料金を確定できません' : '料金に関連する画像があります。--ocr または管理画面から文字認識できます');
      if (diagnostics.some(d => d.moneyMarkers)) missing.push('金額の記載はありますが施術との対応を解析できません');
      if (diagnostics.some(d => d.scriptRendered)) missing.push('JavaScriptによる表示や独自のページ構造の確認が必要です');
      if (visited.size === 1) missing.push('公式HTMLから料金ページへのリンクを発見できません');
      if (!missing.length) missing.push('取得したHTMLでは施術と料金の対応を確認できません');
    }
    return {
      model: `${VERSION}:${profile.id}`,
      extraction: { officialUrl: sourceOfficialUrl, extractedAt: new Date().toISOString(), treatments, pricing: unique, doctors: [], caseInformation: [],
        downtimeAndRisks: information.downtimeAndRisks.slice(0, 50), warrantyAndAftercare: information.warrantyAndAftercare.slice(0, 50),
        html: { profile: profile.id, pages: [...visited], errors, warnings: [...new Set(warnings)], renderAttempts, media: mediaResults,
          truncated: originalCount > unique.length || queue.some(u => !visited.has(u)) || mediaTargets.length > maxMedia || mediaResults.some(m => m.truncated), missing } }
    };
  };
  // Reuse the same DNS checks, robots rules, rate limits and cache for source review.
  extract.readPage = async (url, { parse = true } = {}) => {
    const target = await validateTarget(url, lookup);
    const html = await get(target.href);
    const sourceUrl = canonicalUrls.get(target.href);
    return { html, sourceUrl, ...(parse ? { parsed: parsePage(html, sourceUrl) } : {}), fetchedAt: new Date().toISOString() };
  };
  extract.readJson = async url => {
    const target = await validateTarget(url, lookup);
    const resource = await getResource(target.href);
    if (!/application\/json|text\/json/.test(resource.contentType)) throw new Error('JSONではありません');
    return JSON.parse(resource.buffer.toString('utf8'));
  };
  extract.readResource = async url => {
    const target = await validateTarget(url, lookup);
    return getResource(target.href);
  };
  return extract;
}

function htmlExtractionUpdate(existing, extraction, { autoApply = false, now = new Date().toISOString(), model = VERSION } = {}) {
  const hash = createHash('sha256').update(JSON.stringify({ treatments: extraction.treatments, pricing: extraction.pricing,
    downtimeAndRisks: extraction.downtimeAndRisks || [], warrantyAndAftercare: extraction.warrantyAndAftercare || [] })).digest('hex');
  const changed = existing.officialHtmlHash !== hash;
  const manuallyReviewed = existing.verificationStatus === 'verified' || Boolean(existing.reviewedBy?.trim());
  const eligible = extraction.pricing.filter(p => p.scope === 'clinic');
  const apply = autoApply && !manuallyReviewed && eligible.length > 0 && !extraction.html?.errors?.length && !extraction.html?.truncated
    && !extraction.html?.media?.some(m => m.error) && !extraction.html?.renderAttempts?.some(r => !r.ok || r.errors?.length);
  const update = { detectedHtmlData: extraction, officialHtmlHash: hash, officialHtmlCheckedAt: now, htmlExtractionModel: model, htmlExtractionError: '', htmlExtractionStatus: apply ? 'applied' : extraction.pricing.length ? 'needs_review' : 'no_data', updatedAt: now };
  if (apply) {
    const names = new Set(eligible.map(p => p.treatment));
    const withoutEvidence = ({ evidence, confidence, scope, ...item }) => ({ ...item, verifiedAt: now });
    // Replace only fields owned by this collector. Preserve manually entered data.
    const merge = (old, fresh) => [...(old || []).filter(p => p.extractionMethod !== VERSION), ...fresh.map(p => ({ ...withoutEvidence(p), extractionMethod: VERSION }))];
    update.pricing = merge(existing.pricing, eligible);
    update.treatmentDetails = merge(existing.treatmentDetails, extraction.treatments.filter(t => names.has(t.name)).map(t => ({ ...t, downtimeMaxDays: null })));
    const previousOwnedNames = new Set(existing.htmlAppliedTreatments || []);
    const manualNames = new Set([...(existing.pricing || []).filter(p => p.extractionMethod !== VERSION).map(p => p.treatment), ...(existing.treatmentDetails || []).filter(t => t.extractionMethod !== VERSION).map(t => t.name)]);
    const preservedNames = (existing.treatments || []).filter(name => !previousOwnedNames.has(name) || manualNames.has(name));
    update.treatments = [...new Set([...preservedNames, ...names])];
    update.htmlAppliedTreatments = [...names].filter(name => !preservedNames.includes(name));
    update.hasPricing = update.pricing.length > 0;
    update.sources = [...(existing.sources || []).filter(s => s.type !== VERSION), ...[...new Set(eligible.map(p => p.sourceUrl))].map(url => ({ url, type: VERSION, verifiedAt: now }))];
    update.verificationStatus = 'automated';
  }
  return { update, changed, autoApplied: apply };
}

module.exports = { VERSION, PROFILES, profileFor, publicAddress, validateTarget, sameOriginLink, partsFromName, numericPrice, priceItem, parsePage, createHtmlExtractor, htmlExtractionUpdate };
