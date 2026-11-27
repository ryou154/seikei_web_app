const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {deduplicatePhotos}=require('../clinic-case-photos');
const blocked=message=>/\bHTTP\s+(?:403|406|429|503)\b|robots|Crawl-delay|certificate|SELF_SIGNED_CERT|ENOTFOUND|EAI_AGAIN|timeout|timed out|fetch failed/i.test(message);
function main(){
  const dir=path.join(__dirname,'..','data');
  const reviewFile=path.join(dir,'clinic-html-report-pending-review-2026-11-24.json');
  const progress=JSON.parse(fs.readFileSync(reviewFile,'utf8'));
  if(!progress.complete)throw Error('Review is still running');
  const inventory=JSON.parse(fs.readFileSync(path.join(dir,'clinic-html-report-case-inventory-2026-11-24.json'),'utf8')).clinics;
  const errors=new Map(progress.errors.map(e=>[e.url,e.error])),blockedUrls=new Set(),imageUrls=new Set();
  const reportFile=path.join(dir,'clinic-html-report-all-case-photos-2026-11-24.json');
  const report=JSON.parse(fs.readFileSync(reportFile,'utf8'));
  const write=(file,value)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);};
  for(const clinic of inventory){
    const file=path.join(dir,'clinic-html-report-case-collection-'+clinic.id+'.json');
    const s=JSON.parse(fs.readFileSync(file,'utf8')),queue=new Set(s.queue),seen=new Set(s.visited);let changed=false;
    for(const url of queue)if(errors.has(url)&&!blocked(errors.get(url))){queue.delete(url);seen.add(url);changed=true;}
    // HTTP 406 also means the page contents could not be confirmed.
    for(const e of s.errors)if(errors.has(e.url)&&blocked(e.error)){queue.add(e.url);seen.delete(e.url);changed=true;}
    for(const url of queue)if(errors.has(url)&&blocked(errors.get(url)))blockedUrls.add(url);
    s.photos=deduplicatePhotos(s.photos);for(const photo of s.photos)imageUrls.add(photo.imageUrl);
    if(changed){s.queue=[...queue];s.visited=[...seen];s.complete=!queue.size;s.running=false;s.updatedAt=new Date().toISOString();write(file,s);}
    const row=report.results.find(r=>r.id===clinic.id);Object.assign(row,{photos:s.photos.length,clinicPhotos:s.photos.filter(p=>p.scope!=='group').length,pages:s.visited.length,remaining:s.queue.length,complete:s.complete});
  }
  progress.originalUrlsRemaining=blockedUrls.size;
  progress.alreadyCollectedImageLinks=progress.errors.filter(e=>/HTMLではありません/.test(e.error)&&imageUrls.has(e.url)).length;
  progress.missingLinks=progress.errors.filter(e=>/404|410/.test(e.error)).length;
  write(reviewFile,progress);report.pendingReview=progress;report.complete=true;write(reportFile,report);
  execFileSync(process.execPath,[path.join(__dirname,'summarize-clinic-case-photos.js')],{stdio:'ignore'});
  const before=JSON.parse(fs.readFileSync(path.join(dir,'clinic-html-report-case-summary-before-pending-review-2026-11-24.json'),'utf8'));
  const after=JSON.parse(fs.readFileSync(path.join(dir,'clinic-html-report-all-case-photos-summary-2026-11-24.json'),'utf8'));
  const result={checkedAt:new Date().toISOString(),targetClinics:progress.targetClinics,targetUrls:progress.targetUrls,checkedUrls:progress.checked,successfulPages:progress.successful,alreadyCollectedImageLinks:progress.alreadyCollectedImageLinks,missingLinks:progress.missingLinks,originalUrlsStillUnconfirmed:progress.originalUrlsRemaining,newlyDiscoveredUrls:progress.newlyDiscoveredUrls,before:{clinicsWithPhotos:before.withPhotos,uniquePhotoUrls:before.uniquePhotoUrls},after:{clinicsWithPhotos:after.withPhotos,uniquePhotoUrls:after.uniquePhotoUrls,remainingClinics:after.remainingClinics},addedUniquePhotoUrls:after.uniquePhotoUrls-before.uniquePhotoUrls};
  write(path.join(dir,'clinic-html-report-pending-review-result-2026-11-24.json'),result);console.log(JSON.stringify(result));
}
if(require.main===module)main();
module.exports={blocked};
