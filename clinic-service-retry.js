const {load}=require('cheerio');
const {parseServicePage,treatmentName,serviceParts}=require('./clinic-service-html');
const {sameOriginLink}=require('./clinic-html-sync');
const clean=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const chainHost=host=>/(^|\.)(lula-beauty\.jp|s-b-c\.net|aoki-tsuyoshi\.com|eminal-clinic\.jp|norst\.co\.jp|biyougeka\.com|otsuka-biyo\.co\.jp|agaskin\.net|keisei\.ne\.jp|shibu-cli\.com|shinjukubc\.com|wi-clinic\.com)$/.test(host);
function parseRetryPage(html,url,clinic){
  const host=new URL(url).hostname;const shared=chainHost(host);
  const doc=load(html);doc('script,style,noscript').remove();
  const text=clean(doc('body').text());
  // These shared roots no longer establish the requested branch by URL alone.
  const multiRoot=/kia-beauty\.jp|eterna-clinic\.com/.test(host)||/akaikeskincare\.com|saishin-sp\.com/.test(host)&&new URL(url).pathname==='/'||shared&&/^\/(?:access|clinic)\/?$/.test(new URL(url).pathname);
  let hoursDoc=doc;
  if(multiRoot){
    const candidates=doc('section,article,div').toArray().filter(e=>{const s=clean(doc(e).text());return s.length>50&&s.length<4000&&s.includes(clinic.prefecture)&&/診療時間|診察時間|開院時間|営業時間/.test(s);}).sort((a,b)=>clean(doc(a).text()).length-clean(doc(b).text()).length);
    if(!candidates.length)return {treatmentDetails:[],openingHours:'',downtimeAndRisks:[],warrantyAndAftercare:[],errors:['公式ページで登録院の所在地と診療情報の対応を確認できません']};
    hoursDoc=load(doc.html(candidates[0]));
  }
  // Exclude other-branch recommendation cards before reading clinic facts.
  hoursDoc('script,style,nav,header,.p-clinic__clinic-card,[class*="clinic-card"],[class*="other-clinic"],[class*="related-clinic"]').remove();
  if(shared)hoursDoc('footer,[class*="footer"],[id*="footer"]').remove();
  const parsed=parseServicePage(html,url,{shared:shared||multiRoot,branch:true});
  let openingHours='';const holiday=[];
  if(/eminal-clinic\.jp$/.test(host)){
    const labelled=hoursDoc('.c-datalist__list');
    labelled.each((_,e)=>{const label=clean(hoursDoc(e).find('dt').text()),value=clean(hoursDoc(e).find('dd').text());if(label==='診療時間'&&!openingHours)openingHours=`診療時間：${value}`;if(/^(定休日|休診日)$/.test(label)&&value)holiday.push(`${label}：${value}`);});
  }
  const facts=[];
  hoursDoc('dt,th,.th,h2,h3,h4,p,span,strong,b,div').each((_,e)=>{
    const el=hoursDoc(e),label=clean(el.text());if(el.find('dt,th,h2,h3,h4,p,div').length)return;
      if(/^(?:診療時間|診察時間|営業時間|開院時間|休診日|定休日)[：:]?$/.test(label)){
      const value=clean(el.next('dd,td,.td,p,div,span').text());
      if(value&&value.length<250){if(/休診日|定休日/.test(label))holiday.push(`${label}：${value}`);else if(/\d.*(?:[:：]|時)/.test(value))facts.push(`${label}：${value}`);}
    }
    if(/^(?:診療時間|診察時間|営業時間|開院時間|Open)\s*[：:／/]?\s*(?:完全予約制\s*)?\d/i.test(label)&&label.length<230&&/\d.*(?:[:：]|時)/.test(label))facts.push(label);
  });
  if(/aoki-tsuyoshi\.com$/.test(host)){
    const label=hoursDoc('.clinic_info dt').filter((_,e)=>clean(hoursDoc(e).text())==='診療時間').first();
    const value=clean(label.next('dd').text());if(value&&value.length<250)openingHours=`診療時間：${value}`;
  }
  if(!openingHours&&facts.length){
    // TCB repeats the same clinic hours with and without the holiday in a second panel.
    const times=facts.map(s=>(s.match(/(?:AM|PM)?\d{1,2}\s*(?:[:：]\d{2}|時)\s*[~〜～−-]\s*(?:AM|PM)?\d{1,2}\s*(?:[:：]\d{2}|時)/i)||[])[0]?.replace(/\s/g,'').replace(/[〜～−]/g,'~')).filter(Boolean);
    if(new Set(times).size<=1)openingHours=facts[0];
  }
  if(openingHours&&holiday.length)openingHours+='／'+[...new Set(holiday)].slice(0,3).join('／');
  if(!openingHours){
    const scopeText=clean(hoursDoc('body').text());
    const match=scopeText.match(/(?:診療時間|診察時間|開院時間|営業時間)\s*[：:／/は]?\s*((?:AM|PM)?\d{1,2}\s*(?:[:：]\d{2}|時)\s*[~〜～−-]\s*(?:AM|PM)?\d{1,2}\s*(?:[:：]\d{2}|時)(?:\s*[（(][^）)]{0,70}[）)])?)/i);
    if(match&&!/一部クリニックは異な/.test(scopeText.slice(match.index,match.index+120))){openingHours=match[0];if(holiday.length)openingHours+='／'+[...new Set(holiday)].slice(0,3).join('／');}
  }
  if(!openingHours&&!shared&&!multiRoot){
    const reception=hoursDoc('p,div,span').filter((_,e)=>{const s=clean(hoursDoc(e).text());return s.length<220&&/^受付時間[：:]?\s*\d/.test(s)&&!/電話|予約|カウンセリング/.test(s);}).first();
    if(reception.length){openingHours=clean(reception.text());if(holiday.length)openingHours+='／'+[...new Set(holiday)].slice(0,3).join('／');}
  }
  if(!openingHours&&!multiRoot)openingHours=parsed.openingHours;
  // A dedicated clinic's own menu navigation is valid evidence; group navigation is not.
  if(!shared&&!multiRoot){
    const menuDoc=load(html);menuDoc('script,style,[class*="news"],[class*="blog"]').remove();
    menuDoc('a[href]').each((_,e)=>{const link=menuDoc(e),name=treatmentName(clean(link.text())||link.find('img').attr('alt'));const source=sameOriginLink(link.attr('href'),url);
      if(!name||!source||/blog|column|case|news|doctor|staff|recruit|campaign|shop|price|charge|fee/.test(new URL(source).pathname))return;
      if(!parsed.treatmentDetails.some(t=>t.name===name))parsed.treatmentDetails.push({name,parts:serviceParts(name),downtimeMaxDays:null,sourceUrl:url,evidence:name});
    });
  }
  return {...parsed,openingHours:openingHours.slice(0,1000),errors:[]};
}
module.exports={parseRetryPage,chainHost};
