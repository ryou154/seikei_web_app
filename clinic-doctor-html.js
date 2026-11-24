const { load } = require('cheerio');
const clean = s => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const normalize = s => clean(s).replace(/\s/g, '').replace(/髙/g, '高').replace(/﨑/g, '崎');
const invalid = /紹介|クリニック|医院|病院|学会|専門医|認定|指導|診療|資格|所属|経歴|略歴|挨拶|美容|皮膚科|形成外科|予約|一覧|院長室|料金|治療|患者|担当医|医師名|ドクター|医療|所在地|診察|二重|注射|施術|メッセージ|方針|相談|自己|代表者名|就任|卒業|入職|入局|勤務|外科|技術|学歴|研修|安全|信頼|院$|医$|認証|写真|症例|脂肪|吸引|脱毛|胸|輪郭|リフト|レーザー|ダウン|サーマ|ボトックス|ヒアルロン|スキン|点滴|注入|切開|埋没|時代$|交通案内|日記|新着|趣味|特技|実習|ポリシー|導入|^兼総$/;
function personName(value, { explicit = false } = {}) {
  let s = clean(value).replace(/[（(].*$/, '').replace(/(?:先生|医師|ドクター|院長|理事長|代表)$/, '').trim();
  if (/院長|理事長|医師|代表/.test(s)) s = s.split(/院長|理事長|医師|代表/).at(-1).trim();
  s = s.replace(/^[\s:：・／/|｜-]+/, '').replace(/[A-Za-z].*$/, '').trim();
  const furigana = s.match(/^([一-龥々﨑髙ヶ]{1,5})\s+([一-龥々﨑髙]{1,5})[ぁ-ん]/);
  if (furigana) s = `${furigana[1]} ${furigana[2]}`;
  if (invalid.test(normalize(s))) return '';
  if (/^[一-龥々﨑髙ヶ]{1,5}[\s　]+[一-龥々﨑髙ぁ-んァ-ヶー]{1,7}$/.test(s)) return s;
  if (explicit && /^[一-龥々﨑髙]{3,8}$/.test(s)) return s;
  return '';
}
function parseDoctors(html, url) {
  const $ = load(html);
  const doctorPage = /doctor|director|greeting|aisatsu|dr_|医師紹介|院長/.test(url + ' ' + $('title').text());
  const out = [], seen = new Set();
  $('script,style,nav,header,footer,noscript,aside,[class*="breadcrumb"],[class*="sidebar"]').remove();
  const headings = $('h1,h2,h3,h4,h5,h6');
  const candidates = [];
  $('h1,h2,h3,h4,h5,p,span,dt,div').each((_, element) => {
    const el = $(element), raw = clean(el.text());
    if (!raw || raw.length > 60 || el.find('h1,h2,h3,h4,h5,p,div').length) return;
    const cls = String(el.attr('class') || '');
    const explicit = /(?:doc|doctor|director|dr)[-_]?(?:name|nm)|(?:name)[-_]?(?:doc|doctor)|name-box|doc-name/i.test(cls);
    const role = /(?:院長|理事長|医師|代表)\s*[:：]?\s*[一-龥]/.test(raw);
    const neighbour = clean(el.prev().text()) + ' ' + clean(el.parent().prev().text());
    const contextual = /院長|医師紹介|ドクター紹介/.test(neighbour) && neighbour.length < 60;
    if (!explicit && !role && !contextual && !(doctorPage && el.is('h1,h2,h3,h4'))) return;
    const name = personName(raw, { explicit: explicit || contextual });
    if (name) candidates.push({ name, element, role, explicit });
  });
  for (const c of candidates) {
    if (seen.has(normalize(c.name))) continue;
    let box = $(c.element), chosen = box;
    for (let depth = 0; depth < 5 && box.parent().length; depth++) {
      box = box.parent();
      const names = candidates.filter(n => box.find(n.element).length || box[0] === n.element);
      if (new Set(names.map(n => normalize(n.name))).size > 1) break;
      if (box.text().length > 18000 || box.is('body,html')) break;
      chosen = box;
    }
    if ($(c.element).is('h2')) chosen = $('<div>').append($(c.element).clone(), $(c.element).nextUntil('h2').clone());
    const qualifications = [], memberships = [];
    const labels = chosen.find('h2,h3,h4,h5,dt,th,p,strong').filter((_, e) => /^(?:資格|保有資格|称号・資格|所属学会|所属学会・資格|資格・所属学会|所属学会など|学会活動|主な加盟団体|備考)$/.test(clean($(e).text())));
    for (const label of labels.toArray()) {
      const el = $(label), kind = clean(el.text());
      let content = el.nextUntil('h1,h2,h3,h4,h5,dt,th').clone();
      if (el.is('th')) content = el.next('td').clone();
      if (!content.length && el.is('strong')) content = el.parent().next().clone();
      content.find('script,style').remove(); content.find('br').replaceWith('\n');
      content.find('li,p,tr,dd').each((_, e) => $(e).append('\n'));
      const lines = content.text().split('\n').map(clean).filter(s => s && s.length < 170);
      for (const line of lines.slice(0,25)) {
        if (/\d{4}年|勤務|入職|卒業|入局|就任|院長|メッセージ|詳しく|予約|お問い合わせ/.test(line)) continue;
        if (!/専門医|認定|指導医|実施医|産業医|標榜医|免許|医師免許|博士|学会|会員|修了|終了|研修|ICLS|BLS|ACLS|資格|取得|フェロー|アラガン|ボトックス|ジュビダーム/i.test(line)) continue;
        (/所属|加盟/.test(kind) && !/専門医|認定|指導医/.test(line) ? memberships : qualifications).push(line);
      }
    }
    const roleText = clean($(c.element).text());
    let title = /理事長/.test(roleText) ? '理事長' : /院長/.test(roleText) ? '院長' : '公式医師紹介に掲載';
    if (title === '公式医師紹介に掲載') {
      const context = clean($(c.element).prev().text()) + ' ' + clean($(c.element).parent().prev().text());
      if (context.length < 80 && /院長/.test(context)) title = '院長';
    }
    const profile = chosen.find('a[href]').filter((_, e) => /プロフィール|詳しく|詳細/.test($(e).text())).first().attr('href');
    let profileUrl = '';
    try { if (profile) { const u = new URL(profile,url); if (u.protocol==='https:' && u.hostname.replace(/^www\./,'')===new URL(url).hostname.replace(/^www\./,'')) profileUrl=u.href; } } catch {}
    out.push({name:c.name,title,qualifications:[...new Set(qualifications)],memberships:[...new Set(memberships)],sourceUrl:url,profileUrl,evidence:clean(chosen.text()).slice(0,600)});
    seen.add(normalize(c.name));
  }
  const links = [];
  $('a[href]').each((_, a) => {
    const label = clean($(a).text()), href = $(a).attr('href');
    if (!/医師紹介|ドクター紹介|院長紹介|院長挨拶|院長あいさつ|ご挨拶|医院紹介|クリニック紹介|doctor|greeting|director|profile|aisatsu/i.test(label+' '+href)) return;
    if (/コスメ|症例|blog|column|news|recruit|interview|instagram/i.test(label+' '+href)) return;
    try { const u=new URL(href,url); if (u.protocol!=='https:'||u.hostname.replace(/^www\./,'')!==new URL(url).hostname.replace(/^www\./,'')) return;u.hash=''; if(u.href!==url&&!links.some(l=>l.url===u.href))links.push({url:u.href,label}); } catch {}
  });
  return {doctors:out,links:links.slice(0,12),headings:headings.map((_,e)=>clean($(e).text())).get().slice(0,50)};
}
module.exports = { personName, parseDoctors, clean, normalize };
