const fs=require('node:fs');
const path=require('node:path');
const {createHtmlExtractor}=require('../clinic-html-sync');
const {parseCasePhotos,deduplicatePhotos}=require('../clinic-case-photos');
async function main(){
  const id=process.argv[2];if(!/^[a-zA-Z0-9_-]{1,128}$/.test(id||''))throw Error('Invalid id');
  const file=path.join(__dirname,'..','data','clinic-html-report-case-collection-'+id+'.json');
  const state=JSON.parse(fs.readFileSync(file,'utf8')),bySource=new Map();
  for(const p of state.photos){
    const phase=/術前|before/i.test(p.title)?'Before':/術後|施術直後|after/i.test(p.title)?'After':p.phase||(/^(Before|After)$/i.test(p.description||'')?p.description:'');
    if(!bySource.has(p.sourceUrl))bySource.set(p.sourceUrl,new Set());bySource.get(p.sourceUrl).add(phase);
  }
  const urls=state.visited.filter(url=>/^\/case\/[^/]+\/$/.test(new URL(url).pathname)).filter(url=>{
    const phases=bySource.get(url);return !phases||phases.has('Before')!==phases.has('After');
  }).sort((a,b)=>Number(/case-0-4[01]\//.test(b))-Number(/case-0-4[01]\//.test(a)));
  const read=createHtmlExtractor({ocr:false,renderJs:false}).readPage;
  state.repair={requested:urls.length,checked:0,added:0,errors:[],complete:false};state.complete=false;
  const save=()=>{state.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.tmp',JSON.stringify(state));fs.renameSync(file+'.tmp',file);};
  save();
  for(const url of urls){
    try{const page=await read(url,{parse:false});const photos=parseCasePhotos(page.html,page.sourceUrl||url).photos;
      const merged=deduplicatePhotos([...state.photos,...photos]);state.repair.added+=merged.length-state.photos.length;state.photos=merged;
    }catch(e){state.repair.errors.push({url,error:e.message});}
    state.repair.checked++;save();
    if(state.repair.checked%10===0)console.log(JSON.stringify(state.repair));
  }
  state.repair.complete=true;state.complete=true;save();console.log(JSON.stringify({photos:state.photos.length,repair:state.repair}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
