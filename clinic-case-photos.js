const fs=require('node:fs');
const path=require('node:path');
const {load}=require('cheerio');
const {createHtmlExtractor}=require('./clinic-html-sync');
const {partsFromTreatmentName}=require('./treatment-parts');

function httpsUrl(value,base){
  try{const u=new URL(value,base);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}
}
function officialLink(value,base){
  try{const u=new URL(value,base);if(u.protocol==='http:'&&base&&u.hostname.replace(/^www\./,'')===new URL(base).hostname.replace(/^www\./,''))u.protocol='https:';return httpsUrl(u.href);}catch{return null;}
}
const casePath=url=>/\/(?:case|cases|case_list|report|reports|before[-_]?after|shourei|photo)(?:[\/_-]|\d|$)/i.test(new URL(url).pathname);
function auxiliaryPhoto(photo){
  const text=String(photo.title||'')+' '+String(photo.imageUrl||'');
  if(/術前|術後|before|after/i.test(text))return false;
  let pathname;try{pathname=new URL(photo.imageUrl).pathname;}catch{return true;}
  return /(?:^|[\/_-])(?:doctor|case_doctor|staff|icon|logo|arrow|button|btn|banner|bnr)(?:[\/_.-]|\d|$)/i.test(pathname)||/^(?:img[-_])?(?:doc|dr|ttl|nav|close|loading)[-_\d.]/i.test(pathname.split('/').at(-1))||/^(?:担当医[：:]?)?.{1,20}(?:先生|医師|院長|看護師)$/.test(String(photo.title||'').trim());
}
function deduplicatePhotos(photos){
  const unique=new Map();
  for(const photo of photos){
    const url=httpsUrl(photo.imageUrl);if(!url||auxiliaryPhoto(photo))continue;
    const key=new URL(url);if(key.searchParams.get('type')==='original')key.searchParams.delete('type');
    const old=unique.get(key.href);
    if(!old)unique.set(key.href,photo);
    else unique.set(key.href,{...old,parts:[...new Set([...(old.parts||[]),...(photo.parts||[])])],phase:old.phase||photo.phase||'',description:(old.description||'').length>=(photo.description||'').length?old.description:photo.description});
  }
  return [...unique.values()];
}
function parseCasePhotos(html,sourceUrl){
  const $=load(html),photos=[],seen=new Set();
  const partLinks=[];
  $('a[href]').each((_,el)=>{const a=$(el),url=officialLink(a.attr('href'),sourceUrl);if(url&&new URL(url).origin===new URL(sourceUrl).origin&&!new URL(url).hash){const parts=partsFromTreatmentName(a.text());if(parts.length&&!partLinks.some(p=>p.url===url))partLinks.push({url,parts});}});
  const pageTitle=$('h1').first().text().replace(/\s+/g,' ').trim();
  $('script,style,nav,header,footer').remove();
  $('img').each((_,el)=>{
    const img=$(el),anchor=img.closest('a');
    let raw=img.attr('data-src')||img.attr('data-lazy-src')||img.attr('data-original')||img.attr('src')||'';
    if(!raw||raw.startsWith('data:'))raw=(img.attr('data-srcset')||img.attr('srcset')||img.closest('picture').find('source').first().attr('srcset')||'').split(',').at(-1).trim().split(/\s+/)[0]||raw;
    const imageUrl=officialLink(raw,sourceUrl),alt=(img.attr('alt')||'').replace(/\s+/g,' ').trim();
    const linked=officialLink(anchor.attr('href')||sourceUrl,sourceUrl);
    if(!imageUrl||seen.has(imageUrl)||/(?:^|\/)(?:logo|banner|bnr|icon|arrow|nav)(?:[_.\/-]|$)|\.svg(?:\?|$)/i.test(imageUrl))return;
    const nearby=img.closest('.img_wrap').text().replace(/\s+/g,' ').trim().slice(0,200);
    const layout=img.closest('.photo_flex,.img_wrap,.case_img,.case__img,.case-image,.case_photo,.casePhoto,.before_after,.before-after,.beforeafter,.before,.after');
    const structuredCasePhoto=layout.length>0&&(linked&&casePath(linked)||casePath(sourceUrl)||/(?:^|\/)(?:case|shourei|photo)[_-]?\d/i.test(imageUrl));
    // A case-specific image or case detail link is required; section banners and staff portraits are excluded.
    if(!(/術前|術後|before|after|症例.{0,20}(?:写真|比較)|公式症例/i.test(alt+' '+imageUrl+' '+nearby)||structuredCasePhoto||linked&&casePath(linked)&&/\/case\//i.test(imageUrl)))return;
    if(/医師紹介|院内|アクセス|症例写真を見る/.test(alt))return;
    const container=img.closest('figure,article,li');
    const description=(container.length?container.text():img.parent().parent().text()).replace(/\s+/g,' ').trim().slice(0,2000);
    const contextTitle=anchor.find('h2,h3,h4,.title,.case-title').first().text().trim()||anchor.text().replace(/\s+/g,' ').trim().split(/担当医師|施術のリスク|施術の総額/)[0].slice(0,160);
    const title=alt&& !/^(?:before|after|術前|術後)[\s0-9ヶ月か月週間]*$/i.test(alt)?alt:[contextTitle||pageTitle,alt].filter(Boolean).join('｜')||'公式サイト掲載の症例写真';
    const phaseText=nearby+' '+alt+' '+imageUrl;
    const hasBefore=/before|術前/i.test(phaseText),hasAfter=/after|術後/i.test(phaseText);
    const phase=hasBefore&&!hasAfter?'Before':hasAfter&&!hasBefore?'After':'';
    seen.add(imageUrl);photos.push({imageUrl,title,phase,description,parts:(partsFromTreatmentName(title+' '+contextTitle).length?partsFromTreatmentName(title+' '+contextTitle):partsFromTreatmentName(casePath(sourceUrl)&&!/\/page\//.test(sourceUrl)?pageTitle:'')),sourceUrl:linked&&casePath(linked)?linked:sourceUrl,verifiedAt:new Date().toISOString()});
  });
  const links=[];$('a[href]').each((_,el)=>{const url=officialLink($(el).attr('href'),sourceUrl);if(url&&new URL(url).origin===new URL(sourceUrl).origin&&casePath(url)&&!links.includes(url))links.push(url);});
  return {photos:deduplicatePhotos(photos),links,partLinks};
}
function createCasePhotoReader({readPage,now=Date.now,catalogDirectory=path.join(__dirname,'data')}={}){
  const cache=new Map();let active=0;
  return async (clinic,{part=''}={})=>{
    const officialUrl=httpsUrl(clinic.officialUrl||clinic.sourceUrl);
    if(!officialUrl)return {photos:[],status:'unavailable'};
    if(/^[a-zA-Z0-9_-]{1,128}$/.test(clinic.id||'')){
      try{const saved=JSON.parse(fs.readFileSync(path.join(catalogDirectory,'clinic-html-report-case-collection-'+clinic.id+'.json'),'utf8'));
        if(httpsUrl(saved.officialUrl)===officialUrl&&Array.isArray(saved.photos)&&(saved.photos.length||now()-Date.parse(saved.updatedAt)<3600000))return {photos:deduplicatePhotos(saved.photos),status:saved.photos.length?'available':'unavailable',collection:{complete:saved.complete,running:Boolean(saved.running),limited:Boolean(saved.limited),pages:saved.visited?.length||0,errors:saved.errors?.length||0,checkedAt:saved.updatedAt}};
      }catch{}
    }
    const key=clinic.id+'|'+officialUrl+'|'+part,prior=cache.get(key);
    if(prior&&now()-prior.at<3600000)return prior.promise;
    if(active>=3)return {photos:[],status:'busy'};
    if(cache.size>=200)cache.delete(cache.keys().next().value);
    active++;
    const promise=(async()=>{
      try{
        // One bounded collector per job; reuse existing public DNS, redirects, robots and size checks.
        const read=readPage||createHtmlExtractor({ocr:false,renderJs:false,maxPages:3}).readPage;
        const first=await read(officialUrl,{parse:false});
        const parsed=parseCasePhotos(first.html,first.sourceUrl||officialUrl),photos=[...parsed.photos];
        const matches=p=>!part||p.parts.includes(part);
        const queue=part?parsed.partLinks.filter(p=>p.parts.includes(part)).map(p=>p.url):parsed.links;
        const visited=new Set([officialUrl]);
        for(let count=0;count<5&&queue.length;){
          if(photos.filter(matches).length>=4)break;
          const url=queue.shift();if(visited.has(url))continue;visited.add(url);count++;
          try{
            const page=await read(url,{parse:false}),next=parseCasePhotos(page.html,page.sourceUrl||url);photos.push(...next.photos);
            if(part&&!next.photos.some(matches))queue.unshift(...next.partLinks.filter(p=>p.parts.includes(part)).map(p=>p.url));
            if(!next.photos.length)queue.push(...next.links);
          }catch{}
        }
        return {photos:[...new Map(photos.map(p=>[p.imageUrl,p])).values()].sort((a,b)=>Number(matches(b))-Number(matches(a))),status:photos.length?'available':'unavailable'};
      }catch{return {photos:[],status:'unavailable'};}finally{active--;}
    })();
    cache.set(key,{at:now(),promise});return promise;
  };
}
module.exports={parseCasePhotos,createCasePhotoReader,deduplicatePhotos};
