const test=require('node:test'),assert=require('node:assert/strict');const {parseCasePhotos,createCasePhotoReader}=require('../clinic-case-photos');
test('case photos resolve lazy images, preserve source and reject banners, staff and unsafe URLs',()=>{
 const r=parseCasePhotos(`<header><img src='/before-nav.jpg' alt='術前'></header><a href='/case/123'><img data-src='/case/eye-before.jpg' alt='二重 術前'></a><img src='/banner-after.jpg' alt='術後'><img src='javascript:alert(1)' alt='術前'><img src='/case/eye-before.jpg' alt='二重 術前'><img src='/doctor.jpg' alt='医師紹介 術前'>`,'https://clinic.example/branch/');
 assert.equal(r.photos.length,1);assert.equal(r.photos[0].imageUrl,'https://clinic.example/case/eye-before.jpg');assert.equal(r.photos[0].sourceUrl,'https://clinic.example/case/123');assert.ok(r.photos[0].parts.includes('二重'));
});
test('photo reader follows only case links, caches requests and tolerates unavailable pages',async()=>{
 let calls=[];const reader=createCasePhotoReader({readPage:async url=>{calls.push(url);return {html:url.endsWith('/case/1')?`<img src='/eye-before.jpg' alt='二重 術前'>`:`<a href='/case/1'>症例</a><a href='https://other.example/case/2'>別院</a>`,sourceUrl:url};}});
 const clinic={id:'one',officialUrl:'https://clinic.example/'};assert.equal((await reader(clinic)).photos.length,1);assert.equal((await reader(clinic)).photos.length,1);assert.equal(calls.length,2);
 assert.equal((await createCasePhotoReader({readPage:async()=>{throw Error('blocked');}})(clinic)).status,'unavailable');
});

test('case photo route reads only published clinics after authentication',async()=>{
 const {createClinicHandler}=require('../clinic-store');let reads=0;
 const handler=createClinicHandler({authenticate:async()=>{},getStore:()=>({get:async id=>id==='published'?{id,officialUrl:'https://clinic.example/'}:null}),readCasePhotos:async c=>{reads++;return {photos:[{imageUrl:'https://clinic.example/before.jpg'}],status:'available'};}});
 assert.equal((await handler({url:'/api/clinics/published/case-photos',method:'GET'})).data.photos.length,1);
 assert.equal((await handler({url:'/api/clinics/draft/case-photos',method:'GET'})).status,404);
 assert.equal((await handler({url:'/api/clinics/published/case-photos?url=https://other.example',method:'GET'})).status,404);assert.equal(reads,1);
 const denied=createClinicHandler({authenticate:async()=>{throw {status:401,message:'login'};},getStore:()=>{throw Error('must not access store');}});
 assert.equal((await denied({url:'/api/clinics/published/case-photos',method:'GET'})).status,401);
});

test('selected area is collected beyond unrelated home page cases',async()=>{
 const reader=createCasePhotoReader({readPage:async url=>({sourceUrl:url,html:url.endsWith('/nose/')?`<a href='/case/nose1'><h3>鼻尖形成</h3><img src='/nose-before.jpg'><img src='/nose-after.jpg'></a>`:`<nav><a href='/nose/'>鼻</a></nav><img src='/skin-before.jpg' alt='肌 術前'>`})});
 const result=await reader({id:'target',officialUrl:'https://clinic.example/'},{part:'鼻'});assert.equal(result.photos.filter(p=>p.parts.includes('鼻')).length,2);assert.equal(result.photos[0].phase,'Before');assert.equal(result.photos[1].phase,'After');
});

test('parser keeps every eligible photo rather than a first-page photo cap',()=>{
 const html=Array.from({length:35},(_,i)=>`<a href='/case/${i}'><img src='/nose-before-${i}.jpg' alt='鼻 術前'></a>`).join('');assert.equal(parseCasePhotos(html,'https://clinic.example/').photos.length,35);
});
test('full collection follows the archive and pagination, saves all photos and resumes without rereading',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {collect}=require('../scripts/collect-clinic-case-photos');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-photo-tests-'));let calls=0;
 const pages={'/':`<a href='/case/'>症例</a>`,'/case/':`<a href='/case/a/'>症例A</a><a href='/case/page/2/'>次へ</a>`,'/case/a/':`<h1>鼻尖形成</h1><img src='/before-a.jpg'><img src='/after-a.jpg'>`,'/case/page/2/':`<a href='/case/b/'>症例B</a><a href='/case/'>前へ</a>`,'/case/b/':`<h1>小顔 輪郭</h1><img src='/before-b.jpg'><img src='/after-b.jpg'>`};
 const options={id:'test',officialUrl:'https://clinic.example/',directory,readPage:async url=>{calls++;return {html:pages[new URL(url).pathname],sourceUrl:url};}};
 try{const result=await collect(options);assert.equal(result.complete,true);assert.equal(result.photos.length,4);assert.equal(result.visited.length,5);assert.equal(result.errors.length,0);await collect(options);assert.equal(calls,5);}finally{for(const f of fs.readdirSync(directory))fs.unlinkSync(path.join(directory,f));fs.rmdirSync(directory);}
});

test('older case layouts use explicit before/after captions even when image alt is empty',()=>{
 const r=parseCasePhotos(`<h1>鼻翼縮小</h1><div class='img_wrap'><p>施術前</p><div class='img'><img src='/upload/001.jpg'></div></div><div class='img_wrap'><p>施術後3ヶ月</p><div class='img'><img src='/upload/002.jpg'></div></div><div class='name-box'><img src='/doctor.jpg' alt='理事長 医師'></div>`,'https://clinic.example/case/old/');
 assert.equal(r.photos.length,2);assert.equal(r.photos[0].phase,'Before');assert.equal(r.photos[1].phase,'After');assert.ok(r.photos[0].parts.includes('鼻'));
});

test('original-size query variants do not repeat the same case photograph',()=>{
 const {deduplicatePhotos}=require('../clinic-case-photos');const photos=deduplicatePhotos([{imageUrl:'https://clinic.example/a.jpg',parts:['鼻'],phase:'Before'},{imageUrl:'https://clinic.example/a.jpg?type=original',parts:['輪郭'],phase:'Before'},{imageUrl:'https://clinic.example/b.jpg?type=original',parts:['鼻'],phase:'After'}]);assert.equal(photos.length,2);assert.deepEqual(photos[0].parts,['鼻','輪郭']);assert.equal(photos[1].phase,'After');
});

test('watermarked case photographs are not mistaken for logo assets',()=>{
 const r=parseCasePhotos(`<h1>クマ治療</h1><div class='img_wrap'><p>Before</p><img src='/uploads/kuma_before_logo-1.jpg'></div><div class='img_wrap'><p>After</p><img src='/uploads/kuma_after_logo-1.jpg'></div><img src='/assets/logo.png' alt='ロゴ'>`,'https://clinic.example/case/one/');assert.equal(r.photos.length,2);assert.equal(r.photos[0].phase,'Before');assert.equal(r.photos[1].phase,'After');
});

test('case layout images and same-site legacy HTTP links remain available over HTTPS',()=>{
 const r=parseCasePhotos(`<div class='case_img'><a href='http://clinic.example/case/one/'><img src='http://clinic.example/uploads/case_01.jpg'></a></div><img src='http://other.example/before.jpg' alt='術前'>`,'https://clinic.example/');assert.equal(r.photos.length,1);assert.equal(r.photos[0].imageUrl,'https://clinic.example/uploads/case_01.jpg');assert.equal(r.photos[0].sourceUrl,'https://clinic.example/case/one/');
});

test('doctor portraits inside case directories do not become patient case photographs',()=>{
 const r=parseCasePhotos(`<a href='/case/'><img src='/case/images/case_doctor/img-doc7_hirata.jpg' alt='平田先生'><img src='/case/images/case_quick/case_quick001.jpg' alt='小顔脂肪吸引'></a>`,'https://clinic.example/case/');assert.equal(r.photos.length,1);assert.match(r.photos[0].imageUrl,/case_quick/);
});

test('catalogue lookup accepts an equivalent official root URL with or without a trailing slash',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-photo-catalog-')),file=path.join(dir,'clinic-html-report-case-collection-normalized.json');
 try{fs.writeFileSync(file,JSON.stringify({officialUrl:'https://clinic.example',photos:[{imageUrl:'https://clinic.example/before.jpg',sourceUrl:'https://clinic.example/case/1/'}],complete:true,updatedAt:new Date().toISOString()}));const reader=createCasePhotoReader({catalogDirectory:dir,readPage:async()=>{throw Error('must use saved catalogue');}});assert.equal((await reader({id:'normalized',officialUrl:'https://clinic.example/'})).photos.length,1);}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
