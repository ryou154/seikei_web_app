const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {load} = require('cheerio');
const flush = () => new Promise(resolve=>setImmediate(resolve));
test('simulation candidates render reasons, retry safely and discard late responses after lock',async()=>{
  const {context,nodes,events}=harness();await flush();context.window.AppAuth={uid:'viewer'};
  const api=context.window.ClinicSearch;
  const fixture={id:'test',name:'<script>safe text</script>',prefecture:'東京都',city:'新宿区',officialUrl:'https://clinic.example.org/',verifiedAt:'2026-10-09',verificationStatus:'verified',treatments:[{name:'二重'}],matchReasons:['地域：東京都','希望部位：二重']};
  api.fetchSimulationClinics=async()=>({items:[fixture],notes:['公式情報で要確認'],priority:'費用'});
  await api.renderSimulationClinics({});assert.match(nodes['simulation-clinic-status'].textContent,/1院/);assert.match(nodes['simulation-clinic-list'].textContent,/一致理由.*東京都.*二重/);assert.match(nodes['simulation-clinic-notes'].textContent,/費用.*取得順/);assert.equal(nodes['simulation-clinic-list'].querySelectorAll('script').length,0);
  api.fetchSimulationClinics=async()=>{throw Error('secret');};await api.renderSimulationClinics({});assert.match(nodes['simulation-clinic-status'].textContent,/取得できません/);assert.ok(!nodes['simulation-clinic-status'].textContent.includes('secret'));
  api.fetchSimulationClinics=async()=>({items:[],notes:[],priority:'相性'});nodes['simulation-clinic-list'].querySelectorAll('button')[0].listeners.click();await flush();assert.match(nodes['simulation-clinic-status'].textContent,/一致する公開済みクリニックがありません/);
  let resolve;api.fetchSimulationClinics=()=>new Promise(r=>resolve=r);const waiting=api.renderSimulationClinics({});assert.equal(nodes['simulation-clinics']['aria-busy'],'true');context.window.AppAuth.uid=null;events['app-locked']();resolve({items:[fixture],notes:[],priority:'相性'});await waiting;assert.equal(nodes['simulation-clinic-list'].children.length,0);assert.equal(nodes['simulation-clinics'].hidden,true);
});
function harness() {
  class Element {
    constructor(tag='div') { this.tag=tag; this.children=[];this.value='';this.listeners={};this.ownText='';this.hidden=false;this.disabled=false;this.isConnected=true;if(tag==='dialog'){this.showModal=()=>{this.open=true;this.focus();};this.close=()=>{this.open=false;};} }
    set textContent(text) {this.ownText=String(text);this.children=[];}
    get textContent(){return this.ownText+this.children.map(c=>c.textContent).join(' ');}
    get firstChild(){return this.children[0];}
    append(...children){for(const child of children){child.parentNode=this;this.children.push(child);}}
    insertBefore(child,reference){child.parentNode=this;this.children.splice(this.children.indexOf(reference),0,child);}
    replaceChildren(...children){this.ownText='';this.children=children;}
    addEventListener(name,handler){this.listeners[name]=handler;}
    setAttribute(name,value){this[name]=value;}
    focus(){context.document.activeElement=this;}
    querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
  }
  const names=['area','part','budget','days','prefecture','treatment','hasPricing','verificationStatus','dataMode'];
  const fields=Object.fromEntries(names.map(n=>[n,new Element()]));fields.dataMode.value='registered';
  const ids=['clinic-search-form','clinic-summary','hospital-list','collection-status','clinic-pagination','clinic-detail','clinic-title','simulation-clinics','simulation-clinic-list','simulation-clinic-status','simulation-clinic-notes'];
  const nodes=Object.fromEntries(ids.map(id=>[id,new Element()]));nodes['clinic-detail'].hidden=true;
  new Element('main').append(nodes['clinic-detail']);
  const elements=Object.values(fields);elements.namedItem=name=>fields[name];nodes['clinic-search-form'].elements=elements;
  nodes['clinic-search-form'].reset=()=>{for(const f of elements)f.value='';fields.dataMode.value='registered';nodes['clinic-search-form'].listeners.reset?.();};
  const events={},classes=new Set();
  const context={window:{location:{hash:'#clinic-title'},addEventListener:(n,h)=>events[n]=h},document:{body:{classList:{toggle:(n,a)=>a?classes.add(n):classes.delete(n)}},getElementById:id=>nodes[id],createElement:tag=>new Element(tag)},URL,URLSearchParams,Date,setTimeout,clearTimeout,
    FormData:class {get(name){return fields[name]?.value??null;}}};
  vm.createContext(context);
  for(const file of ['data/clinics.js','data/clinic-details.js','clinic-search.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
  return {context,nodes,fields,events,classes,submit:()=>nodes['clinic-search-form'].listeners.submit({preventDefault(){}})};
}
test('integrated list, detail, prefecture filters, demo states and authentication lifecycle', async()=>{
  const $=load(fs.readFileSync('clinics.html','utf8')),panel=$('.clinic-panel');assert.equal(panel.length,1);
  for(const id of ['clinic-title','clinic-summary','hospital-list','clinic-detail','clinic-pagination'])assert.equal(panel.find('#'+id).length,1);
  const standalone=load(fs.readFileSync('clinics.html','utf8'));
  assert.equal(standalone('#clinic-search-form').length,1);
  assert.equal(standalone('#app-content[hidden]').length,1);
  assert.equal(standalone('script[src="auth-core.js"]').length,1);
  assert.equal(standalone('input[name="dataMode"]').val(),'backend');
  assert.equal(standalone('#simulate-button').length,0);
  assert.equal(panel.find('#clinic-search-form').length,1);
  const {context,nodes,fields,events,classes,submit}=harness();await flush();assert.equal(nodes['hospital-list'].children.length,3);
  assert.ok(classes.has('clinic-view'));context.window.location.hash='#input-title';events.hashchange();assert.ok(!classes.has('clinic-view'));
  context.window.location.hash='#clinic-title';events.click({target:{closest:()=>true}});assert.ok(classes.has('clinic-view'));context.window.location.hash='#input-title';events.popstate();assert.ok(!classes.has('clinic-view'));
  fields.prefecture.value='東京都';fields.part.value='二重';fields.budget.value='68000';fields.days.value='14';submit();await flush();assert.match(nodes['clinic-summary'].textContent,/1院/);
  const first=nodes['hospital-list'].children[0].querySelectorAll('button')[0];first.listeners.click();await flush();assert.equal(nodes['clinic-detail'].hidden,false);assert.match(nodes['clinic-detail'].textContent,/新宿院.*医師.*症例.*ダウンタイム.*保証/);
  assert.match(nodes['clinic-detail'].textContent,/公式サイトで確認できませんでした/);
  fields.prefecture.value='鳥取県';submit();await flush();assert.match(nodes['hospital-list'].textContent,/条件に合う登録がありません/);
  context.window.ClinicSearch.clearConditions();await flush();assert.equal(nodes['hospital-list'].children.length,0);assert.equal(nodes['clinic-detail'].hidden,true);
  fields.dataMode.value='demo';fields.verificationStatus.value='verified';submit();await flush();assert.match(nodes['clinic-summary'].textContent,/2院/);assert.match(nodes['hospital-list'].textContent,/表示例：確認済み（仮）/);
  context.window.ClinicSearch.clearConditions();events['app-authorized']();await flush();assert.equal(nodes['hospital-list'].children.length,3);
});

test('clinic modal returns focus on Escape and ignores a detail response received after closing',async()=>{
  const {context,nodes,classes}=harness();await flush();
  const bar=nodes['hospital-list'].children[0].querySelectorAll('button')[0];bar.focus();bar.listeners.click();await flush();
  const modal=nodes['clinic-detail'].parentNode;assert.equal(modal.open,true);assert.equal(classes.has('clinic-modal-open'),true);
  let prevented=false;modal.listeners.cancel({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(modal.open,false);assert.equal(nodes['clinic-detail'].hidden,true);assert.equal(classes.has('clinic-modal-open'),false);assert.equal(context.document.activeElement,bar);
  let resolve;context.window.ClinicSearch.setRepository({fetchClinicDetail:()=>new Promise(r=>resolve=r)});
  bar.focus();bar.listeners.click();assert.equal(modal.open,true);modal.listeners.cancel({preventDefault(){}});resolve(context.window.CLINIC_DATA[0]);await flush();
  assert.equal(modal.open,false);assert.equal(nodes['clinic-detail'].hidden,true);assert.equal(context.document.activeElement,bar);
});
test('pending requests cannot restore clinic data after lock; failures retain previous list and details',async()=>{
  const {context,nodes,submit}=harness();await flush();const initial=nodes['hospital-list'].textContent;
  const open=nodes['hospital-list'].children[0].querySelectorAll('button')[0];open.listeners.click();await flush();
  const previousDetail=nodes['clinic-detail'].textContent;
  context.window.ClinicSearch.setRepository({fetchClinics:async()=>{throw Error('private API details');},fetchClinicDetail:async()=>{throw Error('secret');}});
  open.listeners.click();await flush();assert.ok(nodes['clinic-detail'].textContent.startsWith(previousDetail));assert.match(nodes['clinic-detail'].textContent,/前回の詳細/);assert.ok(!nodes['clinic-detail'].textContent.includes('secret'));
  submit();await flush();assert.equal(nodes['hospital-list'].textContent,initial);assert.match(nodes['clinic-summary'].textContent,/前回の検索結果/);assert.ok(!nodes['clinic-summary'].textContent.includes('private'));
  let resolve;context.window.ClinicSearch.setRepository({fetchClinics:()=>new Promise(r=>resolve=r)});submit();assert.equal(nodes['clinic-search-form']['aria-busy'],'true');submit();
  context.window.ClinicSearch.clearConditions();resolve({items:context.window.CLINIC_DATA,total:3,page:1,limit:12});await flush();assert.equal(nodes['hospital-list'].children.length,0);
});
test('backend detail renders field evidence, distinct official/Maps buttons and safe text',async()=>{
  const {context,nodes,submit}=harness();await flush();
  const meta={sourceUrl:'https://clinic.example.org/info',verifiedAt:'2026-10-09',verificationStatus:'verified'};
  const field=value=>({value,...meta});
  const record={id:'api-clinic',name:'院名 <script>display only</script>',prefecture:'東京都',city:'新宿区',officialUrl:'https://clinic.example.org/',googleMapsUrl:'https://www.google.com/maps?cid=example',...meta,
    treatments:[{name:'二重埋没法',...meta}],pricing:[{minAmount:50000,maxAmount:80000,conditions:'税込・両目',monitorConditions:'対象者限定',extraCosts:'麻酔別途',...meta}],
    doctors:[{name:field('医師A'),specialties:field(['二重']),qualifications:field(null)}],caseInformation:{count:20,period:'2025年1月〜12月',treatment:'二重',scope:'院別',...meta},
    downtimeAndRisks:{downtime:field('約2週間'),sideEffects:field('腫れ'),risks:field('内出血'),...meta},warrantyAndAftercare:{warranty:field('条件付き'),aftercare:field('術後相談'),...meta},sources:[meta]};
  context.window.ClinicSearch.setRepository({fetchClinics:async()=>({items:[record],total:1,page:1,limit:12}),fetchClinicDetail:async()=>record});submit();await flush();
  nodes['hospital-list'].children[0].querySelectorAll('button')[0].listeners.click();await flush();const text=nodes['clinic-detail'].textContent;
  assert.match(text,/50,?000.*80,?000|50000〜80000/);assert.match(text,/対象者限定.*麻酔別途/);assert.match(text,/20件.*2025年1月〜12月/);assert.match(text,/確認済み/);assert.match(text,/公式サイトで確認できませんでした/);
  const links=nodes['clinic-detail'].querySelectorAll('a');assert.equal(links.filter(a=>a.textContent==='根拠の公式ページを開く').length,1);assert.equal(nodes['clinic-detail'].children[0].children.at(-1).children[0].textContent,'根拠の公式ページを開く');assert.ok(links.some(a=>a.textContent==='公式サイトを開く'&&a.href==='https://clinic.example.org/'));assert.ok(links.some(a=>a.textContent==='Google Mapsで確認する'&&a.href.startsWith('https://www.google.com/maps')));
  assert.ok(!nodes['clinic-detail'].querySelectorAll('script').length);assert.ok(text.includes('<script>display only</script>'));
});

test('selected body area opens first while other areas remain collapsed',async()=>{
  const {context,nodes,fields,submit}=harness();await flush();
  const record={...context.window.CLINIC_DATA[0],treatments:[{name:'二重埋没',parts:['二重']},{name:'隆鼻術',parts:['鼻']}],pricing:[{treatment:'二重埋没',amount:50000},{treatment:'隆鼻術',amount:100000}]};
  context.window.ClinicSearch.setRepository({fetchClinics:async()=>({items:[record],total:1,page:1,limit:12}),fetchClinicDetail:async()=>record});
  fields.part.value='鼻';submit();await flush();nodes['hospital-list'].children[0].querySelectorAll('button')[0].listeners.click();await flush();
  let groups=nodes['clinic-detail'].querySelectorAll('details');assert.equal(groups[0].children[0].textContent,'鼻');assert.equal(groups[0].open,true);assert.equal(groups[1].children[0].textContent,'目元・二重');assert.equal(groups[1].open,false);
  fields.part.value='二重';submit();await flush();nodes['hospital-list'].children[0].querySelectorAll('button')[0].listeners.click();await flush();
  groups=nodes['clinic-detail'].querySelectorAll('details');assert.equal(groups[0].children[0].textContent,'目元・二重');assert.equal(groups[0].open,true);assert.equal(groups[1].open,false);
  fields.part.value='';submit();await flush();nodes['hospital-list'].children[0].querySelectorAll('button')[0].listeners.click();await flush();
  groups=nodes['clinic-detail'].querySelectorAll('details');assert.ok(groups.every(g=>g.open));
});

test('case photos pair only the same case and place Before to the left of After',()=>{
 const {context}=harness();const group=context.window.ClinicSearch.groupCasePhotos;
 const p=(title,path,image)=>({title,sourceUrl:'https://clinic.example/'+path,imageUrl:'https://clinic.example/'+image});
 const pairs=group([p('鼻 術後','case/1','after.jpg'),p('鼻 術前','case/1','before.jpg'),p('二重 術前','case/2','eye.jpg')]);
 assert.equal(pairs.length,2);assert.equal(pairs[0][0].phase,'Before');assert.equal(pairs[0][1].phase,'After');assert.equal(pairs[1].length,1);
 const home=group([p('鼻 術前','index','a.jpg'),p('鼻 術後1ヶ月','index','b.jpg'),p('二重 術後','index','c.jpg')]);assert.equal(home.length,2);assert.equal(home[0].length,2);
});

test('single and unmatched case photos span both columns without creating empty grid cells',()=>{
 const {context}=harness(),{groupCasePhotos:group,casePhotoLayout:layout}=context.window.ClinicSearch;
 const after={imageUrl:'https://clinic.example/after.jpg',sourceUrl:'https://clinic.example/case/one/',title:'術後'};
 assert.equal(layout(group([after])[0])[0].column,'1 / -1');
 const before={...after,imageUrl:'https://clinic.example/before.jpg',title:'術前'};
 const extra={...after,imageUrl:'https://clinic.example/after2.jpg',title:'術後1ヶ月'};
 const rows=layout(group([after,before,extra])[0]);assert.deepEqual(Array.from(rows,p=>p.column),['1','2','1 / -1']);assert.equal(rows[2].row,2);
 const unknown={...after,imageUrl:'https://clinic.example/unknown.jpg',title:'クマ治療',phase:''};assert.equal(group([after,unknown]).length,1);
 const other={...after,imageUrl:'https://clinic.example/another.jpg',sourceUrl:'https://clinic.example/case/two/',title:'術前'};assert.equal(group([after,other]).length,2);
});
