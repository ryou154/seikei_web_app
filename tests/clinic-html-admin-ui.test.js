const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const nodes=new Map(),calls=[],counts=new Map();
 const element=()=>({value:'',dataset:{},textContent:'',hidden:false,listeners:{},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},addEventListener(name,fn){this.listeners[name]=fn;}});
 const node=id=>{if(!nodes.has(id)){const value=element();if(id==='published-prefecture')value.value='大阪府';nodes.set(id,value);}return nodes.get(id);};
 const window={addEventListener(){},AppAuth:{uid:'admin',fetch:async(url,options={})=>{
  calls.push({url,options});let data;
  if(url==='/api/admin/session')data={};
  else if(url.startsWith('/api/admin/clinics?'))data={clinics:[]};
  else if(url==='/api/admin/clinics/extract-html'){
   const body=JSON.parse(options.body),key=body.prefectures.join(','),n=counts.get(key)||0;counts.set(key,n+1);
   data={requested:key.startsWith('北海道')&&n===0?1:0,succeeded:1,autoApplied:1};
  }else if(url==='/api/admin/clinics/one')data={clinic:{id:'one',name:'登録済みクリニック',officialUrl:'https://clinic.example/',officialExtractionJob:{status:'running'}}};
  else throw Error('呼び出し禁止: '+url);
  return {ok:true,json:async()=>data};
 }}};
 const context=vm.createContext({window,document:{body:element(),getElementById:node,createElement:element},URLSearchParams,confirm:()=>true});
 const source=fs.readFileSync('admin-clinics.js','utf8').replace('  window.addEventListener("app-authorized", initialize);','  window.selectForTest = selectClinic;\n  window.addEventListener("app-authorized", initialize);');vm.runInContext(source,context);
 return {node,calls,window};
}
test('nationwide button covers 47 prefectures using HTML only and never starts API discovery',async()=>{
 const app=setup();await new Promise(setImmediate);app.node('update-nationwide-clinics').listeners.click();await new Promise(setImmediate);
 const batches=app.calls.filter(c=>c.options.method==='POST');assert.equal(batches.length,6);assert.ok(batches.every(c=>c.url==='/api/admin/clinics/extract-html'));
 const prefs=new Set(batches.flatMap(c=>JSON.parse(c.options.body).prefectures));assert.equal(prefs.size,47);assert.ok(batches.every(c=>JSON.parse(c.options.body).autoApply===true));assert.match(app.node('nationwide-update-status').textContent,/確認完了：1院/);
});
test('opening an existing clinic uses stored details and does not poll a previous Gemini job or Places API',async()=>{
 const app=setup();await new Promise(setImmediate);await app.window.selectForTest('one');assert.equal(app.node('place-preview-name').textContent,'登録済みクリニック');assert.ok(app.calls.every(c=>c.url==='/api/admin/session'||c.url.startsWith('/api/admin/clinics?')||c.url==='/api/admin/clinics/one'));
});
