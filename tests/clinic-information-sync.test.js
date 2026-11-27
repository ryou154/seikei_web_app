const test=require('node:test');
const assert=require('node:assert/strict');
const {createHtmlExtractor}=require('../clinic-html-sync');
const {createClinicInformationExtractor,clinicInformationUpdate}=require('../clinic-information-sync');
const {createClinicAdminHandler,createClinicAdminStore}=require('../clinic-admin');
const url='https://clinic.example/';
const html='<title>田中クリニック</title><main><h2>二重埋没法</h2><a href="/doctor/">医師紹介</a><dl><dt>診療時間</dt><dd>10:00〜19:00</dd></dl></main>';
const doctor='<h1>医師紹介</h1><h2>田中 一郎</h2><h3>資格</h3><p>日本形成外科学会専門医</p>';
function reader(requested){return createHtmlExtractor({maxPages:1,renderJs:false,ocr:false,pause:async()=>{},lookup:async()=>[{address:'93.184.216.34'}],fetchImpl:async target=>{requested.push(target);return new Response(target.endsWith('robots.txt')?'':target.includes('/doctor/')?doctor:html,{headers:{'content-type':target.endsWith('robots.txt')?'text/plain':'text/html'}});}});}
test('full clinic refresh uses HTML only and saves services, hours and doctors without a fee',async()=>{
 const requested=[];const read=reader(requested);
 const {extraction}=await createClinicInformationExtractor({read})({sourceOfficialUrl:url,clinic:{name:'田中クリニック',officialUrl:url,prefecture:'東京都'}});
 assert.equal(extraction.information.treatmentDetails[0].name,'二重埋没法');
 assert.match(extraction.information.openingHours,/10:00/);
 assert.equal(extraction.doctors[0].name,'田中 一郎');
 assert.deepEqual(extraction.doctors[0].qualifications,['日本形成外科学会専門医']);
 assert.ok(requested.every(u=>new URL(u).hostname==='clinic.example'));
 assert.ok(!requested.some(u=>u.includes('/api/')||u.includes('google')||u.includes('gemini')));
 const old={pricing:[{treatment:'既存料金'}],doctors:[{name:'佐藤 花子'}],publicationStatus:'published'};
 const saved=clinicInformationUpdate(old,extraction,{autoApply:true});
 assert.equal(saved.autoApplied,true);assert.ok(saved.update.treatments.includes('二重埋没法'));
 assert.equal(saved.update.doctors.length,2);assert.deepEqual(saved.update.pricing,undefined);
 assert.equal(saved.update.publicationStatus,undefined);
 const second=clinicInformationUpdate({...old,...saved.update},JSON.parse(JSON.stringify(extraction).replaceAll(extraction.information.checkedAt,'2026-11-21T00:00:00.000Z')),{autoApply:true});
 assert.equal(second.changed,false);
});
test('manual review and extraction-only mode never overwrite current clinic fields',async()=>{
 const {extraction}=await createClinicInformationExtractor({read:reader([])})({sourceOfficialUrl:url,clinic:{}});
 for(const [old,autoApply] of [[{reviewedBy:'reviewer@example.com'},true],[{verificationStatus:'verified'},true],[{},false]]){
  const saved=clinicInformationUpdate(old,extraction,{autoApply});assert.equal(saved.autoApplied,false);
  for(const key of ['doctors','treatments','openingHours','pricing','publicationStatus'])assert.equal(Object.hasOwn(saved.update,key),false);
 }
});
test('nationwide admin request works without API keys and never starts discovery or Gemini',async()=>{
 const previous=process.env.CLINIC_ADMIN_EMAILS;process.env.CLINIC_ADMIN_EMAILS='admin@example.com';
 const calls=[];const forbidden=()=>{throw Error('外部APIを呼び出しました');};
 const handler=createClinicAdminHandler({authenticate:async()=>({email:'admin@example.com',email_verified:true}),placesApiKey:'',geminiApiKey:'',discoverCandidates:forbidden,extractOfficial:forbidden,startOfficial:forbidden,extractHtml:reader(calls),parseBody:async()=>({confirmed:true,autoApply:true,prefectures:['東京都'],limit:1}),getStore:()=>({listForHtmlSync:async()=>[{id:'a',name:'田中クリニック',prefecture:'東京都',officialUrl:url}],saveHtmlExtraction:async(id,data,options)=>clinicInformationUpdate({},data,options)})});
 try{const result=await handler({url:'/api/admin/clinics/extract-html',method:'POST',headers:{'content-type':'application/json'}});
  assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.data.autoApplied,1);
  assert.equal(result.data.results[0].doctors,1);assert.equal(result.data.results[0].openingHours,true);
  assert.ok(calls.every(u=>new URL(u).hostname==='clinic.example'));
 }finally{if(previous===undefined)delete process.env.CLINIC_ADMIN_EMAILS;else process.env.CLINIC_ADMIN_EMAILS=previous;}
});
test('nationwide selection includes all 470 public clinics, drafts and previous failures',async()=>{
 const rows=Array.from({length:470},(_,i)=>({id:'public-'+i,name:'登録院'+i,prefecture:'大阪府',officialUrl:url,publicationStatus:'published',htmlExtractionStatus:i%2?'failed':'applied'}));
 rows.push({id:'draft',prefecture:'大阪府',publicationStatus:'draft',officialUrl:url},{id:'missing',prefecture:'大阪府',publicationStatus:'published'});
 const store=createClinicAdminStore({collection:()=>({where:()=>({get:async()=>({docs:rows.map(c=>({id:c.id,data:()=>c}))})})})});
 const selected=await store.listForHtmlSync({prefectures:['大阪府'],limit:1000,before:'2026-11-20T00:00:00.000Z'});
 assert.equal(selected.length,472);assert.equal(selected.filter(c=>c.id.startsWith('public-')).length,470);
 assert.ok(selected.some(c=>c.id==='draft'));assert.ok(selected.some(c=>c.id==='missing'));
});
test('missing official URLs are reported and marked to advance the nationwide loop',async()=>{
 const previous=process.env.CLINIC_ADMIN_EMAILS;process.env.CLINIC_ADMIN_EMAILS='admin@example.com';const marks=[];
 const handler=createClinicAdminHandler({authenticate:async()=>({email:'admin@example.com',email_verified:true}),parseBody:async()=>({confirmed:true,prefectures:['大阪府'],limit:1}),getStore:()=>({listForHtmlSync:async()=>[{id:'missing',name:'URL未登録院',prefecture:'大阪府'}],saveHtmlExtraction:async()=>{throw Error('取得しない');},markHtmlSyncFailed:async(...args)=>marks.push(args)}),extractHtml:async()=>{throw Error('取得しない');}});
 try{const r=await handler({url:'/api/admin/clinics/extract-html',method:'POST',headers:{'content-type':'application/json'}});
 assert.equal(r.data.requested,1);assert.equal(r.data.skipped,1);assert.equal(r.data.failed,0);assert.match(r.data.results[0].error,/公式サイトURL/);assert.equal(marks[0][3].skipped,true);
 }finally{if(previous===undefined)delete process.env.CLINIC_ADMIN_EMAILS;else process.env.CLINIC_ADMIN_EMAILS=previous;}
});
