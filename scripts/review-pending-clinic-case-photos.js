// Review the complete pending-URL snapshot once. Reuse reads across branches.
const fs=require('node:fs');
const path=require('node:path');
const {createHtmlExtractor}=require('../clinic-html-sync');
const {parseCasePhotos,deduplicatePhotos}=require('../clinic-case-photos');
const {linksFor,photoScope}=require('./collect-all-clinic-case-photos');
const host=url=>new URL(url).hostname.replace(/^www\./,'');

async function review({directory=path.join(__dirname,'..','data'),readPage,workers=20,onlyUrls,progressFilename='clinic-html-report-pending-review-2026-11-24.json',onProgress=()=>{}}={}){
  const inventory=JSON.parse(fs.readFileSync(path.join(directory,'clinic-html-report-case-inventory-2026-11-24.json'),'utf8')).clinics;
  const reportFile=path.join(directory,'clinic-html-report-all-case-photos-2026-11-24.json');
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  const reviewFile=path.join(directory,progressFilename);
  const peers=new Map();for(const c of inventory){const h=host(c.officialUrl);if(!peers.has(h))peers.set(h,[]);peers.get(h).push(c);}
  const states=new Map(),targets=new Map(),dirty=new Set(),cache=new Map(),initialQueueUrls=new Set();
  for(const clinic of inventory){
    const file=path.join(directory,'clinic-html-report-case-collection-'+clinic.id+'.json');
    let state;try{state=JSON.parse(fs.readFileSync(file,'utf8'));}catch{continue;}
    if(!state.queue?.length)continue;
    if(state.officialUrl!==clinic.officialUrl)throw Error('Official URL changed: '+clinic.id);
    const seen=new Set(state.visited),queue=new Set(state.queue.filter(u=>!seen.has(u)));
    for(const url of queue)initialQueueUrls.add(url);
    if(!queue.size||onlyUrls&&![...queue].some(url=>onlyUrls.has(url)))continue;
    const branch=new URL(clinic.officialUrl).pathname.replace(/\/$/,'');
    const others=peers.get(host(clinic.officialUrl)).filter(c=>c.id!==clinic.id&&c.officialUrl!==clinic.officialUrl).map(c=>new URL(c.officialUrl).pathname.replace(/\/$/,'')).filter(p=>p.length>1);
    const allowed=url=>host(url)===host(clinic.officialUrl)&&new URL(url).protocol==='https:'&&(branch&&new URL(url).pathname.startsWith(branch+'/')||!others.some(p=>new URL(url).pathname===p||new URL(url).pathname.startsWith(p+'/')));
    states.set(clinic.id,{clinic,state,file,seen,queue,allowed,photos:[...state.photos]});
    for(const url of queue){if(onlyUrls&&!onlyUrls.has(url))continue;if(!targets.has(url))targets.set(url,new Set());targets.get(url).add(clinic.id);}
    state.running=true;state.complete=false;delete state.stoppedReason;dirty.add(clinic.id);
  }
  const originalUrls=new Set(targets.keys());
  const progress={startedAt:new Date().toISOString(),targetClinics:states.size,targetUrls:targets.size,urls:[...targets.keys()],checked:0,successful:0,failed:0,blocked:0,errors:[],complete:false};
  const reader=readPage||createHtmlExtractor({ocr:false,renderJs:false,maxHtmlBytes:25000000}).readPage;
  let lastFlush=0;
  function write(file,value){fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
  function flush(final=false){
    for(const id of dirty){const s=states.get(id);s.state.photos=deduplicatePhotos(s.photos);s.photos=s.state.photos;
      s.state.visited=[...s.seen];s.state.queue=[...s.queue];s.state.updatedAt=new Date().toISOString();
      if(final){s.state.running=false;s.state.complete=!s.queue.size;s.state.limited=s.queue.size>0&&!s.state.stoppedReason;}
      write(s.file,s.state);
    }dirty.clear();progress.updatedAt=new Date().toISOString();write(reviewFile,progress);lastFlush=Date.now();onProgress(progress);
  }
  function apply(id,url,page){
    const s=states.get(id);if(s.seen.has(url))return;
    s.queue.delete(url);s.seen.add(url);
    s.photos.push(...page.photos.map(p=>({...p,scope:photoScope(p,s.clinic,peers.get(host(s.clinic.officialUrl)).length>1)})));
    s.state.errors=s.state.errors.filter(e=>e.url!==url);
    for(const link of page.links)if(s.allowed(link.url)&&!s.seen.has(link.url))s.queue.add(link.url);
    dirty.add(id);
  }
  const byHost=new Map();for(const [url,ids] of targets){const h=host(url);if(!byHost.has(h))byHost.set(h,[]);byHost.get(h).push({url,ids});}
  const jobs=[...byHost.values()].sort((a,b)=>b.length-a.length);let next=0;
  report.complete=false;write(reportFile,report);flush();
  await Promise.all(Array.from({length:Math.min(workers,jobs.length)},async()=>{
    while(next<jobs.length){const entries=jobs[next++];let stopped='';
      for(const {url,ids} of entries){
        try{
          if(stopped)throw Error(stopped);
          const page=await reader(url,{parse:false}),source=page.sourceUrl||url;
          if(host(source)!==host(url)||new URL(source).protocol!=='https:')throw Error('公式サイト外への転送');
          const parsed={photos:parseCasePhotos(page.html,source).photos,links:linksFor(page.html,source)};
          cache.set(url,parsed);for(const id of ids)apply(id,url,parsed);progress.successful++;
        }catch(e){
          const blocked=/\bHTTP\s+(?:403|406|429|503)\b|robots|Crawl-delay|certificate|SELF_SIGNED_CERT|ENOTFOUND|EAI_AGAIN|timeout|timed out|fetch failed/i.test(e.message);
          if(/\bHTTP\s+(?:403|406|429|503)\b|certificate|SELF_SIGNED_CERT|ENOTFOUND|EAI_AGAIN/i.test(e.message))stopped=e.message;
          progress.failed++;if(blocked)progress.blocked++;
          progress.errors.push({url,error:e.message,sharedFailure:Boolean(stopped)});
          for(const id of ids){const s=states.get(id);s.state.errors=s.state.errors.filter(err=>err.url!==url);s.state.errors.push({url,error:e.message});
            if(blocked)s.state.stoppedReason=e.message;else{s.queue.delete(url);s.seen.add(url);}dirty.add(id);}
        }
        progress.checked++;
        if(Date.now()-lastFlush>15000||progress.checked%50===0)flush();
      }
    }
  }));
  // A newly discovered URL may already have been checked for another branch.
  let replay=true;
  while(replay){replay=false;for(const [id,s] of states)for(const url of [...s.queue])if(cache.has(url)&&!s.seen.has(url)){apply(id,url,cache.get(url));replay=true;}}
  progress.originalUrlsRemaining=0;const newUrls=new Set();
  for(const [id,s] of states){for(const url of s.queue)if(!initialQueueUrls.has(url))newUrls.add(url);dirty.add(id);}
  for(const url of originalUrls)if([...states.values()].some(s=>s.queue.has(url)))progress.originalUrlsRemaining++;
  progress.newlyDiscoveredUrls=newUrls.size;progress.complete=true;flush(true);
  for(const [id,s] of states){const row=report.results.find(r=>r.id===id);Object.assign(row,{photos:s.state.photos.length,clinicPhotos:s.state.photos.filter(p=>p.scope!=='group').length,pages:s.seen.size,remaining:s.queue.size,complete:s.state.complete,limited:s.state.limited,errors:s.state.errors,status:s.state.photos.length?(s.queue.size?'partial':'available'):(s.state.stoppedReason?'blocked':'unavailable')});}
  report.complete=true;report.updatedAt=new Date().toISOString();report.pendingReview=progress;write(reportFile,report);
  return progress;
}
if(require.main===module)review({onProgress:p=>console.log(JSON.stringify({targetClinics:p.targetClinics,checked:p.checked,total:p.targetUrls,successful:p.successful,failed:p.failed,blocked:p.blocked,complete:p.complete}))}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={review};
