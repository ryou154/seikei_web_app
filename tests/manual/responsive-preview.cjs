// Local-only layout fixture. Run: node tests/manual/responsive-preview.cjs
// Production server does not expose this file or these fixture routes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const allowed = new Set(['style.css', 'navigation.css', 'navigation.js', 'history-page.css']);
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const name = url.pathname.slice(1);
  if (allowed.has(name)) {
    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : 'text/javascript');
    return res.end(fs.readFileSync(path.join(root, name)));
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (name === 'login.html' || name === 'app.html') {
    let html = fs.readFileSync(path.join(root, name), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace('id="auth-controls" disabled', 'id="auth-controls"');
    if (name === 'app.html') html = html
      .replace('class="layout" hidden', 'class="layout"')
      .replace('id="auth-signed-out"', 'id="auth-signed-out" hidden')
      .replace('id="auth-signed-in" hidden', 'id="auth-signed-in"')
      .replace('id="result-content" class="hidden"', 'id="result-content"')
      .replace('id="empty-result"', 'id="empty-result" hidden')
      .replace('id="auth-account"></p>', 'id="auth-account">layout-check@example.test</p>');
    return res.end(html.replace('</body>', `<script>
      window.AppAuth={signedIn:${name === 'app.html'}, email:'long-layout-check-account@example.test',busy:false,logout(){}};
      document.getElementById('auth-status').textContent='表示確認用ダミーデータ（認証・生成処理なし）';
      for(const id of ['before-image','after-image']) {const el=document.getElementById(id);if(el)el.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" style="max-width:100%;height:auto"><rect width="240" height="240" fill="#fff0f4"/><text x="30" y="120" font-size="20">画像表示テスト</text></svg>';}
      </script><script src="navigation.js"></script></body>`));
  }
  if (name === 'history.html') {
    const count = Math.max(0, Math.min(10, Number(url.searchParams.get('count')) || 0));
    const cards = Array.from({ length: count }, (_, index) => `
      <article class="history-card">
        <div class="history-card-header"><div><h3>目元のシミュレーション ${index + 1}</h3><p class="history-date">作成日時：2026/10/06 12:00</p></div></div>
        <p class="history-request">スマートフォンでも読みやすさを確認するための長めの入力テキストです。表示幅が狭い場合に横にはみ出さないことを確認します。</p>
        <dl class="history-details">${[['希望スタイル','ナチュラル'],['目','自然な二重'],['鼻','変更なし'],['輪郭','変更なし'],['口','変更なし'],['額','変更なし'],['変化の強さ','35%'],['地域','東京都'],['予算','30万円まで'],['ダウンタイム','1週間程度']].map(([label,value]) => `<div class="history-detail"><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
        <div class="history-scores"><div class="history-score"><span>Before スコア</span><strong>72 / 100</strong></div><div class="history-score"><span>After スコア</span><strong>78 / 100</strong></div></div>
        <p class="history-disclaimer">スコアは写真上の幾何比率から算出した学習用の参考値です。容姿の優劣や医療効果を示すものではありません。</p>
        <p class="history-image-message">画像は保存されていません。</p>
        <div class="history-actions"><button>この設定を読込</button><button>同じ設定でもう一度生成</button><button data-danger="true">1件削除</button></div>
      </article>`).join('');
    let html = fs.readFileSync(path.join(root, 'history.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
      .replace('<section id="auth-panel" class="panel auth-panel"', '<section id="auth-panel" class="panel auth-panel" hidden')
      .replace('id="app-content" class="history-layout" hidden', 'id="app-content" class="history-layout"')
      .replace('id="history-list" class="history-list" aria-live="polite"></div>', `id="history-list" class="history-list" aria-live="polite">${cards || '<p class="history-empty">保存された履歴はありません。シミュレーション結果を保存すると、ここに表示されます。</p>'}</div>`)
      .replace(/(<p id="history-status"[^>]*>)[\s\S]*?<\/p>/, `$1${count}件の履歴を表示しています。</p>`);
    return res.end(html);
  }
  if (name !== '') { res.statusCode=404; return res.end('Not found'); }
  const width = [1366,375,412].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 375;
  const requestedPage = url.searchParams.get('page');
  const page = ['app', 'history'].includes(requestedPage) ? requestedPage : 'login';
  const count = Math.max(0, Math.min(10, Number(url.searchParams.get('count')) || 0));
  res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>表示幅QA</title>
    <style>body{font:16px sans-serif;margin:12px}iframe{display:block;border:1px solid #777}pre{white-space:pre-wrap}</style>
    <h1>${width}px / ${page} 表示確認</h1><p>ローカル専用・ダミーデータ</p>
    <pre id="report">測定中</pre><iframe title="表示確認" width="${width}" height="800" src="/${page}.html${page === 'history' ? `?count=${count}` : ''}"></iframe>
    <script>document.querySelector('iframe').onload=function(){
      const d=this.contentDocument;const w=this.contentWindow;
      const overflow=[...d.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>w.innerWidth+1||r.left< -1)}).map(e=>e.id||e.className||e.tagName);
      document.getElementById('report').textContent=JSON.stringify({viewport:w.innerWidth,documentWidth:d.documentElement.scrollWidth,overflow},null,2);
    }</script></html>`);
}).listen(3108, '127.0.0.1', () => console.log('Layout QA: http://127.0.0.1:3108'));
