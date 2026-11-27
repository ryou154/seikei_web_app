const fs=require('node:fs');
const path=require('node:path');
const {deduplicatePhotos}=require('../clinic-case-photos');
const directory=path.join(__dirname,'..','data');
const inventory=JSON.parse(fs.readFileSync(path.join(directory,'clinic-html-report-case-inventory-2026-11-24.json'),'utf8')).clinics;
const reportFile=path.join(directory,'clinic-html-report-all-case-photos-2026-11-24.json');
const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
if(!report.complete)throw Error('Collection is still running');
const unique=new Set(),summary={checkedAt:new Date().toISOString(),requested:inventory.length,processed:0,withPhotos:0,withoutPhotos:0,withClinicSitePhotos:0,groupOnly:0,photoEntries:0,uniquePhotoUrls:0,remainingClinics:0,pagesChecked:0,excludedAssets:0,unavailableReasons:{},clinics:[]};
for(const clinic of inventory){
  const filename=path.join(directory,'clinic-html-report-case-collection-'+clinic.id+'.json');
  const old=report.results.find(r=>r.id===clinic.id)||{};
  let state;
  try{state=JSON.parse(fs.readFileSync(filename,'utf8'));}catch{state={photos:[],errors:old.errors||[],visited:[],queue:[]};}
  if(state.officialUrl&&state.officialUrl!==clinic.officialUrl)throw Error('Official URL changed: '+clinic.id);
  const before=state.photos.length;state.photos=deduplicatePhotos(state.photos).filter(p=>/^https:\/\//.test(p.sourceUrl||''));
  summary.excludedAssets+=before-state.photos.length;
  if(before!==state.photos.length){state.updatedAt=summary.checkedAt;fs.writeFileSync(filename+'.tmp',JSON.stringify(state));fs.renameSync(filename+'.tmp',filename);}
  const local=state.photos.filter(p=>p.scope!=='group').length;
  let reason='';
  if(!state.photos.length){
    const errors=(state.errors||[]).map(e=>e.error).join(' ');
    reason=/robots.*許可|Crawl-delay/i.test(errors)?'robots・取得間隔による制限':/403|429|503/.test(errors)?'HTTPエラー・アクセス制限':/fetch failed|certificate|ENOTFOUND|timeout|timed out/i.test(errors)?'接続・証明書・応答の問題':/容量/.test(errors)?'HTML容量の上限':'公式HTMLから症例写真を確認できず';
    summary.unavailableReasons[reason]=(summary.unavailableReasons[reason]||0)+1;
  }
  const row={id:clinic.id,name:clinic.name,prefecture:clinic.prefecture,officialUrl:clinic.officialUrl,photos:state.photos.length,clinicSitePhotos:local,groupPhotos:state.photos.length-local,pages:state.visited.length,remaining:state.queue?.length||0,reason};
  summary.clinics.push(row);summary.processed++;summary.photoEntries+=row.photos;summary.pagesChecked+=row.pages;
  if(row.photos){summary.withPhotos++;if(local)summary.withClinicSitePhotos++;else summary.groupOnly++;}else summary.withoutPhotos++;
  if(row.remaining)summary.remainingClinics++;
  for(const photo of state.photos){const url=new URL(photo.imageUrl);if(url.searchParams.get('type')==='original')url.searchParams.delete('type');unique.add(url.href);}
  Object.assign(old,{photos:row.photos,clinicPhotos:local,reason});
}
summary.uniquePhotoUrls=unique.size;
if(summary.processed!==470||new Set(summary.clinics.map(c=>c.id)).size!==470)throw Error('Expected all 470 clinics');
fs.writeFileSync(path.join(directory,'clinic-html-report-all-case-photos-summary-2026-11-24.json'),JSON.stringify(summary,null,2));
fs.writeFileSync(reportFile+'.tmp',JSON.stringify(report));fs.renameSync(reportFile+'.tmp',reportFile);
console.log(JSON.stringify({...summary,clinics:undefined}));
