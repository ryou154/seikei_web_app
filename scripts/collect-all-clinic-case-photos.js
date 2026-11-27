// Bounded, resumable official-HTML collection. No Gemini and no Firestore writes.
const fs=require('node:fs');
const path=require('node:path');
const {createHtmlExtractor}=require('../clinic-html-sync');
const {parseCasePhotos,deduplicatePhotos}=require('../clinic-case-photos');

const host=url=>new URL(url).hostname.replace(/^www\./,'');
const sameSite=(a,b)=>host(a)===host(b)&&new URL(b).protocol==='https:';
const canonical=url=>{const u=new URL(url);u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(?:gclid|fbclid)$/i.test(key))u.searchParams.delete(key);return u.href;};
const decodedPath=url=>{const p=new URL(url).pathname;try{return decodeURI(p);}catch{return p;}};
const caseRoute=url=>/\/(?:case|cases|case_list|reports?|shourei|before[-_]?after|photos?|gallery|photogallery|monitor|症例)(?:[\/_.-]|\d|$)/i.test(decodedPath(url));
const caseLabel=/症例|施術[前後]|ビフォー|アフター|before.?after|case\s*(?:photo|study)|ギャラリー/i;
function linksFor(html,base){
  const {load}=require('cheerio'),$=load(html),links=new Map();
  $('a[href]').each((_,el)=>{
    const a=$(el);let url;
    try{const target=new URL(a.attr('href'),base);if(target.protocol==='http:'&&host(target.href)===host(base))target.protocol='https:';url=canonical(target.href);if(!sameSite(base,url)||new URL(url).username||new URL(url).password)return;}catch{return;}
    const label=a.text().replace(/\s+/g,' ').trim().slice(0,160);
    if(/%3c|%3e|mailto:|javascript:|\.(?:pdf|zip|jpe?g|png|gif|webp)(?:\?|$)/i.test(url))return;
    if(/reserve|reservation|contact|recruit|login|cart|calendar|campaign/.test(new URL(url).pathname))return;
    if(!caseRoute(url)&&!caseLabel.test(label))return;
    if([...new URL(url).searchParams.keys()].some(k=>!['page','paged','post_type','p','cat','category','category_id','treatment','clinic'].includes(k)))return;
    const priority=/症例一覧|症例写真|症例紹介|case\s*photo/i.test(label)||/\/(?:case|cases|photo|photos|gallery)\/?$/.test(new URL(url).pathname)?0:/\/page\//.test(url)?2:1;
    links.set(url,{url,label,priority});
  });return [...links.values()];
}
function photoScope(photo,clinic,shared){
  if(!shared)return 'clinic-site';
  const branch=new URL(clinic.officialUrl).pathname.replace(/\/$/,'');
  return branch&&new URL(photo.sourceUrl).pathname.startsWith(branch+'/')?'clinic-site':'group';
}
async function run({inventoryFile,directory=path.join(__dirname,'..','data'),maxPages=24,workers=20,readPage,targetIds,onProgress=()=>{}}){
  const inventory=JSON.parse(fs.readFileSync(inventoryFile,'utf8')).clinics;
  const reportFile=path.join(directory,'clinic-html-report-all-case-photos-2026-11-24.json');
  const groups=new Map();for(const c of inventory){try{const h=host(c.officialUrl);if(!groups.has(h))groups.set(h,[]);groups.get(h).push(c);}catch{}}
  let previous;try{previous=JSON.parse(fs.readFileSync(reportFile,'utf8'));}catch{}
  const report={startedAt:targetIds&&previous?.startedAt||new Date().toISOString(),requested:inventory.length,maxPagesPerClinic:maxPages,results:targetIds?(previous?.results||[]).filter(r=>!targetIds.has(r.id)):[],complete:false};
  const htmlReader=readPage||createHtmlExtractor({ocr:false,renderJs:false,maxHtmlBytes:25000000}).readPage;
  const parsedCache=new Map();
  async function read(url){
    if(!parsedCache.has(url))parsedCache.set(url,(async()=>{
      const page=await htmlReader(url,{parse:false}),source=page.sourceUrl||url;
      if(!sameSite(url,source))throw Error('公式サイト外への転送');
      return {source,parsed:parseCasePhotos(page.html,source),links:linksFor(page.html,source)};
    })());return parsedCache.get(url);
  }
  const saveReport=()=>{report.updatedAt=new Date().toISOString();fs.writeFileSync(reportFile+'.tmp',JSON.stringify(report));fs.renameSync(reportFile+'.tmp',reportFile);};
  async function collectClinic(clinic,peers){
    const file=path.join(directory,'clinic-html-report-case-collection-'+clinic.id+'.json');
    let old;
    try{old=JSON.parse(fs.readFileSync(file,'utf8'));if(old.officialUrl!==clinic.officialUrl)old=null;}catch{}
    if(old?.complete&&old.photos?.length)return {id:clinic.id,name:clinic.name,prefecture:clinic.prefecture,status:'preserved',photos:old.photos.length,clinicPhotos:old.photos.filter(p=>p.scope!=='group').length,pages:old.visited?.length||0,remaining:0,errors:old.errors||[]};
    const state=old||{id:clinic.id,name:clinic.name,officialUrl:clinic.officialUrl,photos:[],visited:[],queue:[clinic.officialUrl],errors:[]};
    if(!state.queue.length&&!state.photos.length){state.queue=[clinic.officialUrl];state.visited=state.visited.filter(url=>url!==clinic.officialUrl);}
    const oversized=new Set(state.errors.filter(e=>/容量が上限/.test(e.error)).map(e=>e.url));
    if(oversized.size){state.queue=[...new Set([...oversized,...state.queue])];state.visited=state.visited.filter(url=>!oversized.has(url));state.errors=state.errors.filter(e=>!oversized.has(e.url));}
    state.running=true;state.complete=false;delete state.stoppedReason;
    const visited=new Set(state.visited),queue=new Map(state.queue.map(url=>[url,{url,priority:caseRoute(url)?1:0}]));
    const otherBranches=peers.filter(p=>p.id!==clinic.id&&p.officialUrl!==clinic.officialUrl).map(p=>new URL(p.officialUrl).pathname.replace(/\/$/,'' )).filter(p=>p.length>1);
    const branchPath=new URL(clinic.officialUrl).pathname.replace(/\/$/,'');
    const allowed=url=>sameSite(clinic.officialUrl,url)&&(branchPath&&new URL(url).pathname.startsWith(branchPath+'/')||!otherBranches.some(prefix=>new URL(url).pathname===prefix||new URL(url).pathname.startsWith(prefix+'/')));
    let photos=[...state.photos],status='unavailable';
    const checkpoint=()=>{state.photos=deduplicatePhotos(photos);state.queue=[...queue.keys()].filter(url=>!visited.has(url));state.visited=[...visited];state.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);};
    for(let count=0;queue.size&&count<maxPages;){
      const entry=[...queue.values()].sort((a,b)=>a.priority-b.priority)[0];queue.delete(entry.url);
      if(visited.has(entry.url))continue;count++;visited.add(entry.url);
      try{
        const page=await read(entry.url);
        photos.push(...page.parsed.photos.map(p=>({...p,scope:photoScope(p,clinic,peers.length>1)})));
        for(const link of page.links)if(allowed(link.url)&&!visited.has(link.url)&&!queue.has(link.url))queue.set(link.url,link);
        status=photos.length?'available':'unavailable';
      }catch(e){state.errors.push({url:entry.url,error:e.message});
        if(/403|429|503|robots|Crawl-delay|certificate|ENOTFOUND|EAI_AGAIN|timed out|timeout|fetch failed/i.test(e.message)){visited.delete(entry.url);queue.set(entry.url,entry);state.stoppedReason=e.message;status=photos.length?'partial':'blocked';break;}
      }
      checkpoint();
    }
    state.running=false;state.complete=!queue.size&&!state.stoppedReason;state.limited=queue.size>0&&!state.stoppedReason;
    checkpoint();
    return {id:clinic.id,name:clinic.name,prefecture:clinic.prefecture,officialUrl:clinic.officialUrl,status:state.photos.length?(state.limited?'partial':status):status,photos:state.photos.length,clinicPhotos:state.photos.filter(p=>p.scope!=='group').length,pages:state.visited.length,remaining:state.queue.length,complete:state.complete,limited:state.limited,errors:state.errors};
  }
  const tasks=[...groups.values()].sort((a,b)=>b.length-a.length);let next=0;
  await Promise.all(Array.from({length:Math.min(workers,tasks.length)},async()=>{
    while(next<tasks.length){const peers=tasks[next++];for(const clinic of peers){
      if(targetIds&&!targetIds.has(clinic.id))continue;
      try{report.results.push(await collectClinic(clinic,peers));}catch(e){report.results.push({id:clinic.id,name:clinic.name,prefecture:clinic.prefecture,status:'error',photos:0,errors:[{error:e.message}]});}
      saveReport();onProgress(report);
    }}
  }));
  for(const clinic of inventory)if(!report.results.some(r=>r.id===clinic.id))report.results.push({id:clinic.id,name:clinic.name,status:'invalid-url',photos:0,errors:[{error:'公式URLを確認できません'}]});
  report.complete=true;saveReport();onProgress(report);return report;
}
if(require.main===module){
  const maxPages=Number(process.argv[2]||24);
  let targetIds;if(process.argv.includes('--deepen')){const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','clinic-html-report-all-case-photos-2026-11-24.json'),'utf8'));targetIds=new Set(prior.results.filter(r=>r.limited&&r.photos>0||r.errors?.some(e=>/容量が上限/.test(e.error))).map(r=>r.id));console.log(JSON.stringify({additionalTargets:targetIds.size}));}
  if(process.argv.includes('--retry-empty')){const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','clinic-html-report-all-case-photos-2026-11-24.json'),'utf8'));targetIds=new Set(prior.results.filter(r=>!r.photos&&!['blocked','error','invalid-url'].includes(r.status)).map(r=>r.id));console.log(JSON.stringify({retryEmptyTargets:targetIds.size}));}
  run({inventoryFile:path.join(__dirname,'..','data','clinic-html-report-case-inventory-2026-11-24.json'),maxPages,targetIds,onProgress:r=>{if(r.results.length%10===0||r.complete)console.log(JSON.stringify({processed:r.results.length,total:r.requested,withPhotos:r.results.filter(c=>c.photos>0).length,photos:r.results.reduce((n,c)=>n+(c.photos||0),0),blocked:r.results.filter(c=>['blocked','error'].includes(c.status)).length,complete:r.complete}));}}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={run,linksFor,photoScope};
