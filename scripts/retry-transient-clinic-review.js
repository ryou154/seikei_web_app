const fs=require('node:fs');
const path=require('node:path');
const {review}=require('./review-pending-clinic-case-photos');
const {blocked}=require('./finalize-pending-clinic-review');
async function main(){
  const directory=path.join(__dirname,'..','data'),file=path.join(directory,'clinic-html-report-pending-review-2026-11-24.json');
  const first=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!first.complete)throw Error('First review is not complete');
  const onlyUrls=new Set(first.errors.filter(e=>/ENOTFOUND|EAI_AGAIN|timeout|timed out|\bHTTP\s+503\b/i.test(e.error)).map(e=>e.url));
  console.log(JSON.stringify({transientRetryUrls:onlyUrls.size}));
  const retried=await review({directory,onlyUrls,progressFilename:'clinic-html-report-pending-review-retry-2026-11-24.json',onProgress:p=>console.log(JSON.stringify({checked:p.checked,total:p.targetUrls,successful:p.successful,failed:p.failed,complete:p.complete}))});
  const errors=new Map(first.errors.map(e=>[e.url,e])),retryErrors=new Map(retried.errors.map(e=>[e.url,e]));
  for(const url of retried.urls)if(retryErrors.has(url))errors.set(url,retryErrors.get(url));else errors.delete(url);
  first.errors=[...errors.values()];first.failed=first.errors.length;first.successful=first.targetUrls-first.failed;first.blocked=first.errors.filter(e=>blocked(e.error)).length;
  first.transientRetry={checked:retried.checked,successful:retried.successful,failed:retried.failed,newlyDiscoveredUrls:retried.newlyDiscoveredUrls};
  first.updatedAt=new Date().toISOString();fs.writeFileSync(file+'.tmp',JSON.stringify(first));fs.renameSync(file+'.tmp',file);
  const reportFile=path.join(directory,'clinic-html-report-all-case-photos-2026-11-24.json'),report=JSON.parse(fs.readFileSync(reportFile,'utf8'));report.pendingReview=first;report.complete=true;fs.writeFileSync(reportFile+'.tmp',JSON.stringify(report));fs.renameSync(reportFile+'.tmp',reportFile);
  console.log(JSON.stringify({originalUrls:first.targetUrls,successful:first.successful,failed:first.failed,transientRetry:first.transientRetry}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
