const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {run,linksFor,photoScope}=require('../scripts/collect-all-clinic-case-photos');
function temporary(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'clinic-all-photos-'));return {dir,cleanup(){for(const f of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,f));fs.rmdirSync(dir);}};}
test('official case discovery rejects unrelated hosts and accepts labelled official galleries',()=>{
 const links=linksFor(`<a href='/pictures.html'>症例写真</a><a href='/case/page/2/'>次へ</a><a href='https://elsewhere.example/case/'>外部</a><a href='/reserve/'>症例予約</a><a href='/case/foo/%3C/a'>broken</a>`,'https://clinic.example/');
 assert.ok(links.some(l=>l.url==='https://clinic.example/pictures.html'));assert.ok(links.some(l=>l.url.endsWith('/page/2/')));assert.ok(links.every(l=>!l.url.includes('elsewhere')&&!l.url.includes('/reserve/')&&!l.url.includes('%3C')));
});
test('batch collects every target, shares public page reads, preserves prior photos and labels group cases',async()=>{
 const temp=temporary();try{
 const clinics=[{id:'a',name:'A',officialUrl:'https://group.example/clinic/a/'},{id:'b',name:'B',officialUrl:'https://group.example/clinic/b/'},{id:'saved',name:'Saved',officialUrl:'https://saved.example/'}];
 const inventoryFile=path.join(temp.dir,'inventory.json');fs.writeFileSync(inventoryFile,JSON.stringify({clinics}));fs.writeFileSync(path.join(temp.dir,'clinic-html-report-case-collection-saved.json'),JSON.stringify({officialUrl:clinics[2].officialUrl,complete:true,photos:[{imageUrl:'https://saved.example/before.jpg'}],visited:[]}));
 const calls=[];const result=await run({inventoryFile,directory:temp.dir,maxPages:3,workers:2,readPage:async url=>{calls.push(url);return {sourceUrl:url,html:url.includes('/case/one')?`<h1>鼻形成</h1><img src='/before.jpg' alt='鼻 術前'>`:`<a href='/case/one/'>症例写真</a><a href='/clinic/b/photo/'>他院症例写真</a>`};}});
 assert.equal(result.results.length,3);assert.equal(result.complete,true);assert.equal(calls.filter(u=>u==='https://group.example/case/one/').length,1);assert.equal(result.results.find(r=>r.id==='saved').status,'preserved');
 const a=JSON.parse(fs.readFileSync(path.join(temp.dir,'clinic-html-report-case-collection-a.json')));assert.equal(a.photos[0].scope,'group');assert.ok(!a.visited.includes('https://group.example/clinic/b/photo/'));
 assert.equal(photoScope({sourceUrl:'https://group.example/clinic/a/photo/1'},clinics[0],true),'clinic-site');
 }finally{temp.cleanup();}
});
test('blocked official pages remain resumable and are reported without discarding existing data',async()=>{
 const temp=temporary();try{const inventoryFile=path.join(temp.dir,'inventory.json');fs.writeFileSync(inventoryFile,JSON.stringify({clinics:[{id:'one',officialUrl:'https://clinic.example/'}]}));const r=await run({inventoryFile,directory:temp.dir,readPage:async()=>{throw Error('HTTP 403');}});assert.equal(r.results[0].status,'blocked');const state=JSON.parse(fs.readFileSync(path.join(temp.dir,'clinic-html-report-case-collection-one.json')));assert.equal(state.queue[0],'https://clinic.example/');assert.equal(state.running,false);assert.equal(state.complete,false);}finally{temp.cleanup();}
});

test('additional collection preserves the results of clinics outside the selected retry set',async()=>{
 const temp=temporary();try{const inventoryFile=path.join(temp.dir,'inventory.json');fs.writeFileSync(inventoryFile,JSON.stringify({clinics:[{id:'a',officialUrl:'https://a.example/'},{id:'b',officialUrl:'https://b.example/'}]}));const reader=async url=>({sourceUrl:url,html:new URL(url).pathname==='/'?`<a href='/case/one/'>症例</a>`:`<h1>鼻</h1><img src='/before.jpg' alt='鼻 術前'>`});
 await run({inventoryFile,directory:temp.dir,maxPages:1,readPage:reader});const r=await run({inventoryFile,directory:temp.dir,maxPages:2,readPage:reader,targetIds:new Set(['a'])});assert.equal(r.results.length,2);assert.equal(new Set(r.results.map(c=>c.id)).size,2);assert.equal(r.results.find(c=>c.id==='a').photos,1);assert.equal(r.results.find(c=>c.id==='b').photos,0);
 }finally{temp.cleanup();}
});

test('large official HTML has an explicit bounded opt-in limit while the normal default stays unchanged',async()=>{
 const {createHtmlExtractor}=require('../clinic-html-sync');
 const options={lookup:async()=>[{address:'93.184.216.34',family:4}],pause:async()=>{},fetchImpl:async url=>new Response(url.endsWith('/robots.txt')?'':`<html><h1>症例一覧</h1></html>`,{status:url.endsWith('/robots.txt')?404:200,headers:{'content-type':url.endsWith('/robots.txt')?'text/plain':'text/html','content-length':url.endsWith('/robots.txt')?'0':'6000000'}})};
 await assert.rejects(createHtmlExtractor(options).readPage('https://clinic.example/case/',{parse:false}),/容量/);assert.match((await createHtmlExtractor({...options,maxHtmlBytes:25000000}).readPage('https://clinic.example/case/',{parse:false})).html,/症例一覧/);
});
