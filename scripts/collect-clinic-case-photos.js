// Read official HTML only; save a resumable local photo URL catalogue, never write to Firestore.
const fs=require('node:fs');
const path=require('node:path');
const {load}=require('cheerio');
const {createHtmlExtractor}=require('../clinic-html-sync');
const {parseCasePhotos,deduplicatePhotos}=require('../clinic-case-photos');

function caseLinks(html,base){
  const $=load(html),urls=new Set();
  $('a[href]').each((_,el)=>{
    try{
      const u=new URL($(el).attr('href'),base),origin=new URL(base).origin;
      if(u.origin!==origin||u.protocol!=='https:'||u.username||u.password)return;
      if(!/\/(?:case|cases|case_list|reports?|shourei|before[-_]?after|photo)(?:[\/_-]|\d|$)/i.test(u.pathname)&&u.searchParams.get('post_type')!=='case')return;
      if([...u.searchParams.keys()].some(k=>!['page','paged','post_type','p'].includes(k)))return;
      u.hash='';urls.add(u.href);
    }catch{}
  });return [...urls];
}
async function collect({id,officialUrl,name='',readPage,onProgress=()=>{},directory=path.join(__dirname,'..','data')}){
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id))throw Error('Invalid clinic id');
  const origin=new URL(officialUrl).origin;
  const filename=path.join(directory,'clinic-html-report-case-collection-'+id+'.json');
  let state={id,name,officialUrl,queue:[officialUrl],visited:[],photos:[],errors:[],complete:false};
  if(fs.existsSync(filename)){const prior=JSON.parse(fs.readFileSync(filename,'utf8'));if(prior.officialUrl===officialUrl)state=prior;}
  const seen=new Set(state.visited),queued=new Set(state.queue),photos=new Map(state.photos.map(p=>[p.imageUrl,p]));
  const reader=readPage||createHtmlExtractor({ocr:false,renderJs:false}).readPage;
  const save=()=>{state.photos=deduplicatePhotos([...photos.values()]);state.updatedAt=new Date().toISOString();fs.writeFileSync(filename+'.tmp',JSON.stringify(state));fs.renameSync(filename+'.tmp',filename);};
  while(state.queue.length){
    const priority=url=>/\/case_list\/(?:face_nose|chin|nose_ryu|chin_prote_ha)\//.test(url)?0:/\/case\/(?:page\/\d+\/)?$/.test(url)?1:2;
    state.queue.sort((a,b)=>priority(a)-priority(b));
    const url=state.queue.shift();queued.delete(url);if(seen.has(url))continue;
    try{
      const page=await reader(url,{parse:false}),source=page.sourceUrl||url;
      if(new URL(source).origin!==origin)throw Error('公式サイト外への転送');
      const parsed=parseCasePhotos(page.html,source);
      for(const p of parsed.photos){const old=photos.get(p.imageUrl);if(!old)photos.set(p.imageUrl,p);else photos.set(p.imageUrl,{...old,parts:[...new Set([...old.parts,...p.parts])],description:old.description||p.description});}
      let links=caseLinks(page.html,source);
      // The global case archive covers the category archives too, avoiding repeated copies of each case.
      if(new URL(source).pathname==='/case/'||state.globalArchive) {
        state.globalArchive=true;links=links.filter(link=>!new URL(link).pathname.startsWith('/case_list/')||/\/case_list\/(?:face_nose|chin|nose_ryu|chin_prote_ha)\//.test(new URL(link).pathname));
      }
      for(const link of links)if(!seen.has(link)&&!queued.has(link)){state.queue.push(link);queued.add(link);}
    }catch(error){state.errors.push({url,error:error.message});
      if(/403|429|robots|Crawl-delay/i.test(error.message)){state.queue.unshift(url);state.stoppedReason=error.message;save();onProgress(state);return state;}
    }
    seen.add(url);state.visited.push(url);save();onProgress(state);
  }
  state.complete=true;save();onProgress(state);return state;
}
if(require.main===module){
  const [id,officialUrl,name]=process.argv.slice(2);
  collect({id,officialUrl,name,onProgress:s=>{if(s.visited.length%10===0||s.complete||s.stoppedReason)console.log(JSON.stringify({pages:s.visited.length,remaining:s.queue.length,photos:s.photos.length,cases:new Set(s.photos.map(p=>p.sourceUrl)).size,errors:s.errors.length,complete:s.complete,stoppedReason:s.stoppedReason}));}}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={caseLinks,collect};
