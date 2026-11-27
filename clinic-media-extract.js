const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { pathToFileURL } = require('node:url');

function semaphore(limit) {
  let active = 0; const pending = [];
  return async () => {
    if (active < limit) active++; else await new Promise(resolve => pending.push(resolve));
    return () => { const next = pending.shift(); if (next) next(); else active--; };
  };
}
const acquireOcr = semaphore(2), acquireBrowser = semaphore(2);

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const type = buffer.toString('ascii', 12, 16);
    if (type === 'VP8X') return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    if (type === 'VP8L') return { width: 1 + buffer[21] + ((buffer[22] & 63) << 8), height: 1 + (buffer[22] >> 6) + (buffer[23] << 2) + ((buffer[24] & 15) << 10) };
    if (type === 'VP8 ') return { width: buffer.readUInt16LE(26) & 16383, height: buffer.readUInt16LE(28) & 16383 };
  }
  if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216) {
    for (let p = 2; p + 9 < buffer.length;) {
      if (buffer[p++] !== 255) continue;
      const marker = buffer[p++];
      if (marker === 216 || marker === 217 || marker >= 208 && marker <= 215) continue;
      const size = buffer.readUInt16BE(p);
      if (size < 2 || p + size > buffer.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return { width: buffer.readUInt16BE(p + 5), height: buffer.readUInt16BE(p + 3) };
      p += size;
    }
  }
  throw new Error('OCRはPNG・JPEG・WebP画像に対応しています');
}

const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function mediaRowIsClear(name, price) {
  return !/[¥￥]|\d[,.]\s*\d{3}|[,\.]\s*$/.test(name)
    && /^(?:税込\s*)?(?:[¥￥]\s*)?\d[\d,.]*(?:万[\d,.]*)?\s*円?(?:\s*[()税込税別税抜]*)?$/.test(price);
}

function linesToHtml(lines) {
  // Preserve each visual line; do not associate prices in another column/row.
  return `<main>${lines.map(line => {
    const text = String(line.text || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (/^(?:ダウンタイム|副作用[・と／/]*リスク|副作用|リスク|保証|保障|アフターケア|術後対応)(?:について)?$/.test(text)) return `<h3>${escape(text)}</h3>`;
    const match = text.match(/^(.*?)\s*((?:[¥￥]\s*\d|\d[\d,.]*(?:万[\d,.]*)?\s*円).*)$/);
    if (match && match[1].trim() && mediaRowIsClear(match[1].trim(), match[2])) return `<table><tr><th>${escape(match[1].trim())}</th><td>${escape(match[2])}</td></tr></table>`;
    return `<p data-unparsed-media="true">${escape(text)}</p>`;
  }).join('\n')}</main>`;
}

function groupPdfLines(items) {
  if (items.length > 20000) throw new Error('PDFページの文字要素数が上限を超えています');
  const rows = [];
  for (const item of items.filter(i => typeof i.str === 'string' && i.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const y = item.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  return rows.map(row => ({ text: row.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' '), y: row.y }));
}

async function extractPdf(buffer, { maxPages = 5, ocr = null } = {}) {
  const pdfjs = await import(pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true,
    useSystemFonts: false, cMapUrl: `${root}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${root}/standard_fonts/`, verbosity: 0 });
  const timer = setTimeout(() => { void task.destroy(); }, 60000);
  let pdf;
  try {
    pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= Math.min(pdf.numPages, maxPages); number++) {
      const page = await pdf.getPage(number);
      let lines = groupPdfLines((await page.getTextContent()).items), method = 'pdf-text';
      if (!lines.length && ocr) {
        const viewport = page.getViewport({ scale: 1.5 });
        if (viewport.width * viewport.height > 16000000) throw new Error('PDFページの画像サイズが上限を超えています');
        const { createCanvas } = require('@napi-rs/canvas');
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        lines = (await ocr(canvas.toBuffer('image/png'))).lines; method = 'pdf-ocr';
      }
      pages.push({ number, method, lines, html: linesToHtml(lines) });
      page.cleanup();
    }
    return { pages, truncated: pdf.numPages > maxPages };
  } finally { clearTimeout(timer); await task.destroy(); }
}

async function recognizeImageImpl(buffer, { langPath = process.env.CLINIC_OCR_LANG_PATH || path.join(__dirname, 'data/ocr'), timeoutMs = 60000 } = {}) {
  for (const language of ['jpn', 'eng']) if (!fs.existsSync(path.join(langPath, `${language}.traineddata.gz`))) throw new Error('OCR辞書がありません。npm run clinics:ocr:setup を実行してください');
  const image = imageDimensions(buffer);
  if (image.width * image.height > 16000000) throw new Error('OCR画像の画素数が上限を超えています');
  const { createWorker } = require('tesseract.js');
  let worker, timer, aborted = false;
  try {
    const work = (async () => {
      worker = await createWorker('jpn+eng', 1, { langPath, gzip: true, cachePath: os.tmpdir(), cacheMethod: 'none', errorHandler: () => {} });
      if (aborted) { await worker.terminate(); throw new Error('OCRがタイムアウトしました'); }
      const { data } = await worker.recognize(buffer, {}, { blocks: true, text: true });
      const lines = (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []))
        .filter(line => line.confidence >= 60).map(line => ({ text: line.text, confidence: line.confidence, bbox: line.bbox }));
      return { lines, html: linesToHtml(lines), confidence: data.confidence };
    })();
    return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => { aborted = true; reject(new Error('OCRがタイムアウトしました')); }, timeoutMs); })]);
  } finally { clearTimeout(timer); if (worker) await worker.terminate(); }
}

function browserExecutable() {
  if (process.env.CLINIC_BROWSER_EXECUTABLE) return process.env.CLINIC_BROWSER_EXECUTABLE;
  return ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(file => fs.existsSync(file));
}

async function renderOfficialPageImpl({ url, html, fetchResource, maxRequests = 60 }) {
  const { chromium } = require('playwright-core');
  const executablePath = browserExecutable();
  if (!executablePath) throw new Error('JavaScript表示用のChromium/Edgeがありません。CLINIC_BROWSER_EXECUTABLEを設定してください');
  const browser = await chromium.launch({ executablePath, headless: true });
  const blocked = [], errors = [];
  let requests = 0;
  try {
    const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false, userAgent: 'SeikeiClinicCollector/1.0' });
    const page = await context.newPage();
    await context.routeWebSocket('**/*', socket => socket.close());
    const host = new URL(url).hostname.replace(/^www\./, '');
    const assetHosts = new Set();
    const { load } = require('cheerio'); const $ = load(html);
    $('script[src],link[rel="stylesheet"][href]').each((_, e) => { try { assetHosts.add(new URL($(e).attr('src') || $(e).attr('href'), url).hostname); } catch {} });
    if (/studiodesignapp|studio\.design/.test(html)) ['api.studiodesignapp.com', 'api.cms.studiodesignapp.com', 'storage.googleapis.com'].forEach(h => assetHosts.add(h));
    await context.route('**/*', async route => {
      const request = route.request();
      let target;
      try { target = new URL(request.url()); } catch { return route.abort(); }
      const type = request.resourceType();
      if (++requests > maxRequests || request.method() !== 'GET' || !['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(type)
        || /analytics|googletagmanager|doubleclick|facebook|hotjar/i.test(target.hostname)
        || (target.hostname.replace(/^www\./, '') !== host && !assetHosts.has(target.hostname))
        || (type === 'document' && (request.frame() !== page.mainFrame() || target.hostname.replace(/^www\./, '') !== host))) {
        blocked.push(target.origin); return route.abort();
      }
      try {
        if (request.isNavigationRequest() && target.href === url) return await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
        const response = await fetchResource(target.href);
        await route.fulfill({ status: 200, contentType: response.contentType, body: response.buffer });
      } catch (error) { errors.push({ url: target.href, error: error.message }); await route.abort().catch(() => {}); }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // Bound the wait; do not wait forever for advertising/network idle.
    await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
    await page.waitForFunction(() => document.body?.innerText?.trim().length > 200 || document.querySelector('table,dl,[class*="price"]'), null, { timeout: 10000 }).catch(() => {});
    return { html: await page.content(), blocked: [...new Set(blocked)], errors };
  } finally { await browser.close(); }
}

async function recognizeImage(buffer, options) {
  const release = await acquireOcr();
  try { return await recognizeImageImpl(buffer, options); } finally { release(); }
}

async function renderOfficialPage(options) {
  const release = await acquireBrowser();
  try { return await renderOfficialPageImpl(options); } finally { release(); }
}

module.exports = { escape, linesToHtml, groupPdfLines, extractPdf, recognizeImage, renderOfficialPage, browserExecutable, imageDimensions, mediaRowIsClear };
