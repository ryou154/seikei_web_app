const {test}=require('node:test'),assert=require('node:assert/strict');
const {createHtmlSyncStore}=require('../clinic-html-admin');
const {createClinicAdminHandler}=require('../clinic-admin');
test('nationwide HTML batches read each prefecture group once and advance through drafts, failures and missing URLs',async()=>{
 let reads=0;const rows=[{id:'published',prefecture:'大阪府',publicationStatus:'published'},{id:'draft',prefecture:'大阪府',publicationStatus:'draft'},{id:'failed',prefecture:'大阪府',htmlExtractionStatus:'failed'},{id:'fresh',prefecture:'大阪府',officialHtmlCheckedAt:'2026-11-24T01:00:00.000Z'}];
 const store=createHtmlSyncStore({collection:()=>({where(field,operator,values){assert.equal(field,'prefecture');assert.equal(operator,'in');assert.deepEqual(values,['大阪府']);return {get:async()=>{reads++;return {docs:rows.map(c=>({id:c.id,data:()=>c}))};}};}})});
 const options={prefectures:['大阪府'],before:'2026-11-24T00:00:00.000Z',limit:1},ids=[];
 for(let i=0;i<4;i++)ids.push(...(await store.listForHtmlSync(options)).map(c=>c.id));
 assert.equal(reads,1);assert.deepEqual(new Set(ids),new Set(['published','draft','failed']));
});
test('a failed clinic listing releases the HTML update lock so retry can proceed without Gemini',async()=>{
 const previous=process.env.CLINIC_ADMIN_EMAILS;process.env.CLINIC_ADMIN_EMAILS='admin@example.com';let calls=0;
 const handler=createClinicAdminHandler({authenticate:async()=>({email:'admin@example.com',email_verified:true}),parseBody:async()=>({confirmed:true,prefectures:['大阪府'],limit:1}),geminiApiKey:'',placesApiKey:'',getStore:()=>({saveHtmlExtraction(){},listForHtmlSync:async()=>{if(calls++===0)throw Error('一時的な保存先エラー');return [];}})});
 const request={url:'/api/admin/clinics/extract-html',method:'POST',headers:{'content-type':'application/json'}};
 try{assert.equal((await handler(request)).status,503);const retried=await handler(request);assert.equal(retried.status,200);assert.equal(retried.data.requested,0);}finally{if(previous===undefined)delete process.env.CLINIC_ADMIN_EMAILS;else process.env.CLINIC_ADMIN_EMAILS=previous;}
});
