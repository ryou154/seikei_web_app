// Local-only layout fixture. Run: node tests/manual/responsive-preview.cjs
// Production server does not expose this file or these fixture routes.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const allowed = new Set(['style.css', 'navigation.css', 'navigation.js']);
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
      const authStatus=document.getElementById('auth-status');if(authStatus)authStatus.textContent='表示確認用ダミーデータ（認証・生成処理なし）';
      for(const id of ['before-image','after-image']) {const el=document.getElementById(id);if(el)el.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240" style="max-width:100%;height:auto"><rect width="240" height="240" fill="#fff0f4"/><text x="30" y="120" font-size="20">画像表示テスト</text></svg>';}
      </script><script src="navigation.js"></script></body>`));
  }
  if (name !== '') { res.statusCode=404; return res.end('Not found'); }
  const width = [1366,375,412].includes(Number(url.searchParams.get('width'))) ? Number(url.searchParams.get('width')) : 375;
  const page = url.searchParams.get('page') === 'app' ? 'app' : 'login';
  res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><title>表示幅QA</title>
    <style>body{font:16px sans-serif;margin:12px}iframe{display:block;border:1px solid #777}pre{white-space:pre-wrap}</style>
    <h1>${width}px / ${page} 表示確認</h1><p>ローカル専用・ダミーデータ</p>
    <pre id="report">測定中</pre><iframe title="表示確認" width="${width}" height="800" src="/${page}.html"></iframe>
    <script>document.querySelector('iframe').onload=function(){
      const d=this.contentDocument;const w=this.contentWindow;
      const overflow=[...d.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>w.innerWidth+1||r.left< -1)}).map(e=>e.id||e.className||e.tagName);
      document.getElementById('report').textContent=JSON.stringify({viewport:w.innerWidth,documentWidth:d.documentElement.scrollWidth,overflow},null,2);
    }</script></html>`);
}).listen(3108, '127.0.0.1', () => console.log('Layout QA: http://127.0.0.1:3108'));
