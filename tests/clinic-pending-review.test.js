const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {review}=require('../scripts/review-pending-clinic-case-photos');
function fixture(clinics){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-pending-review-'));fs.writeFileSync(path.join(dir,'clinic-html-report-case-inventory-2026-11-24.json'),JSON.stringify({clinics}));fs.writeFileSync(path.join(dir,'clinic-html-report-all-case-photos-2026-11-24.json'),JSON.stringify({complete:true,results:clinics.map(c=>({id:c.id,photos:0}))}));return {dir,save(c,state){fs.writeFileSync(path.join(dir,'clinic-html-report-case-collection-'+c.id+'.json'),JSON.stringify({id:c.id,officialUrl:c.officialUrl,photos:[],visited:[],queue:[],errors:[],...state}));},get(c){return JSON.parse(fs.readFileSync(path.join(dir,'clinic-html-report-case-collection-'+c.id+'.json')));},close(){for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);}};}
test('pending review checks each shared URL once and records newly discovered pages separately',async()=>{
 const a={id:'a',officialUrl:'https://group.example/clinic/a/'},b={id:'b',officialUrl:'https://group.example/clinic/b/'},saved={id:'saved',officialUrl:'https://other.example/'};const f=fixture([a,b,saved]);
 try{for(const c of [a,b])f.save(c,{queue:['https://group.example/case/old/']});f.save(saved,{complete:true,photos:[{imageUrl:'https://other.example/before.jpg'}]});let calls=0;
 const p=await review({directory:f.dir,readPage:async url=>{calls++;return {sourceUrl:url,html:`<h1>鼻形成</h1><img src='/before.jpg' alt='鼻 術前'><a href='/case/new/'>症例</a>`};}});
 assert.equal(calls,1);assert.equal(p.targetClinics,2);assert.equal(p.checked,1);assert.equal(p.originalUrlsRemaining,0);assert.equal(p.newlyDiscoveredUrls,1);assert.equal(f.get(a).photos[0].scope,'group');assert.equal(f.get(a).queue[0],'https://group.example/case/new/');assert.equal(f.get(a).running,false);assert.equal(f.get(saved).photos.length,1);
 }finally{f.close();}
});
test('access restrictions preserve prior photos and leave blocked URLs pending without a workaround',async()=>{
 const c={id:'one',officialUrl:'https://clinic.example/'},f=fixture([c]);try{f.save(c,{queue:['https://clinic.example/case/1/','https://clinic.example/case/2/'],photos:[{imageUrl:'https://clinic.example/before.jpg',sourceUrl:'https://clinic.example/case/old/'}]});let calls=0;const p=await review({directory:f.dir,readPage:async()=>{calls++;throw Error('HTTP 403');}});assert.equal(calls,1);assert.equal(p.checked,2);assert.equal(p.blocked,2);assert.equal(p.originalUrlsRemaining,2);assert.equal(f.get(c).photos.length,1);assert.equal(f.get(c).running,false);}finally{f.close();}
});

test('transient retry reads only the requested URL snapshot and preserves other queued pages',async()=>{
 const c={id:'one',officialUrl:'https://clinic.example/'},f=fixture([c]);try{f.save(c,{queue:['https://clinic.example/case/retry/','https://clinic.example/case/new/']});const seen=[];const p=await review({directory:f.dir,onlyUrls:new Set(['https://clinic.example/case/retry/']),progressFilename:'retry.json',readPage:async url=>{seen.push(url);return {sourceUrl:url,html:`<h1>鼻</h1><img src='/before.jpg' alt='術前'>`};}});assert.deepEqual(seen,['https://clinic.example/case/retry/']);assert.equal(p.checked,1);assert.equal(f.get(c).queue[0],'https://clinic.example/case/new/');}finally{f.close();}
});
test('numeric case identifiers do not turn a 404 into an access restriction',()=>{
 const {blocked}=require('../scripts/finalize-pending-clinic-review');assert.equal(blocked('HTTP 404: https://clinic.example/case/503403429/'),false);assert.equal(blocked('HTTP 406: https://clinic.example/case/1/'),true);assert.equal(blocked('getaddrinfo ENOTFOUND clinic.example'),true);
});
