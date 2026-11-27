(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const sampleImage = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="260" height="190" viewBox="0 0 260 190"><rect width="260" height="190" fill="#edf3f1"/><ellipse cx="130" cy="196" rx="69" ry="44" fill="#c3d6d0"/><path d="M111 140v24q19 15 38 0v-24" fill="#d5e2dc"/><ellipse cx="130" cy="91" rx="44" ry="60" fill="#dce7e1"/><path d="M86 82q-7-62 44-62t44 62q-13-16-21-37-28 25-67 37" fill="#78968c"/><path d="M104 92h13m26 0h13m-28 7-3 17h8m-16 15q13 7 26 0" stroke="#8ba398" stroke-width="2" stroke-linecap="round" fill="none"/><text x="130" y="181" text-anchor="middle" font-family="sans-serif" font-size="9" fill="#758f85">SAMPLE ILLUSTRATION</text></svg>');
  const seed = () => ({
    basic: {"name":"エースクリニック 大阪梅田HEPナビオ院","prefecture":"大阪府","address":"〒530-0017 大阪府大阪市北区角田町7-10 HEP NAVIO 6階 HEPナビオ ウェルネスモール","phone":"06-6379-5701","hours":"10:00〜19:00（完全予約制）","closed":"日曜日・祝日","website":"https://osaka.ace-clinic.com/","description":"大阪梅田HEPナビオ6階にある、美容外科・美容皮膚科・形成外科のクリニック。阪急大阪梅田駅から徒歩2分。\n公式サイトの公開情報を参照した非公式の管理画面デモです。実際の予約・診療には接続していません。"},
    treatments:[{"id":"t1","name":"プレミアム埋没法2点留め","part":"二重","price":66000,"days":null,"conditions":"1回・税込／診察・カウンセリング料は別途。自費初診・カウンセリング料3,300円。通常料金。部分モニター料金とは異なります。","risk":"出血・皮下出血、感染、左右差、しこり、糸の露出など。詳細は公式施術ページをご確認ください。","sourceUrl":"https://osaka.ace-clinic.com/shinryo/face_futae/bury/"},{"id":"t2","name":"隆鼻術（シリコンプロテーゼ）","part":"鼻","price":220000,"days":null,"conditions":"1回・税込／診察・カウンセリング料は別途。自費初診・カウンセリング料3,300円。","risk":"出血・血腫、感染、鼻筋が曲がって見えるなど。詳細は公式施術ページをご確認ください。","sourceUrl":"https://osaka.ace-clinic.com/shinryo/face_nose/ryu/"},{"id":"t3","name":"ピコトーニング 顔全体","part":"肌","price":13200,"days":null,"conditions":"1回・税込／診察・カウンセリング料は別途。自費初診・カウンセリング料3,300円。通常1回料金。初回限定料金やコース料金とは異なります。目周りは対象外。","risk":"色素沈着・色素脱失、肌荒れなど。詳細は公式施術ページをご確認ください。","sourceUrl":"https://osaka.ace-clinic.com/shinryo/laser/lasertoning/"}],
    doctors:[{"id":"d1","name":"谷 聡柄","title":"大阪梅田HEPナビオ院 院長","qualifications":"日本形成外科学会認定形成外科専門医／日本美容外科学会認定美容外科専門医（JSAS）／医学博士","specialties":"公式プロフィール参照（個別の得意施術は未転記）","career":"1998年 大阪医科大学卒業\n2021年 エースクリニック大阪梅田院 院長\n2024年 大阪梅田HEPナビオ院 院長","sourceUrl":"https://osaka.ace-clinic.com/doctor/"},{"id":"d2","name":"中山 理華子","title":"大阪梅田HEPナビオ院 医師","qualifications":"日本形成外科学会認定形成外科専門医／ミラドライ認定医／ジュビダームビスタ施注資格","specialties":"公式プロフィール参照（個別の得意施術は未転記）","career":"2015年 滋賀医科大学卒業\n2023年 エースクリニック大阪梅田院 勤務\n2024年 大阪梅田HEPナビオ院 勤務","sourceUrl":"https://osaka.ace-clinic.com/doctor/"},{"id":"d3","name":"宇根 千尋","title":"大阪梅田HEPナビオ院 医師","qualifications":"日本形成外科学会認定形成外科専門医／ミラドライ認定医／ジュビダームビスタ施注資格","specialties":"公式プロフィール参照（個別の得意施術は未転記）","career":"2005年 滋賀医科大学医学部医学科卒業\n2024年 エースクリニック大阪梅田HEPナビオ院 勤務","sourceUrl":"https://osaka.ace-clinic.com/doctor/"}],
    cases:[{id:'c1',name:'症例写真の配置サンプル（実症例ではありません）',part:'二重',description:'プレミアム埋没法2点留め 通常66,000円（税込・診察料別）\n主なリスク：腫れ・内出血・左右差など\n術前／術後の配置例（イラスト）\n写真の配置を確認するためのイラストです。施術結果を示すものではありません。',before:sampleImage,after:sampleImage}],
    activity:[{title:'エースクリニックの公式公開情報を参照しました',time:'デモ開始時'}],pending:false,dirty:false
  });
  let state = seed(), activeTab = 'overview', editing, toastTimer, dialogVersion = 0, confirmAction;
  const labels = {bookings:'予約スケジュール',patients:'予約者・施術歴',overview:'ダッシュボード',basic:'基本情報',treatments:'施術・料金',doctors:'医師情報',cases:'症例写真'};
  const parts = ['二重','目元','鼻','輪郭','肌','胸','体'];
  const money = value => Number(value).toLocaleString('ja-JP') + '円';
  function node(tag, text, className) { const el=document.createElement(tag); if(text!=null)el.textContent=text;if(className)el.className=className;return el; }
  function action(text, handler, extra='') { const el=node('button',text,'text-button '+extra);el.type='button';el.addEventListener('click',handler);return el; }
  function sourceLink(title,url){const a=node('a',title+' ↗','official-source-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function badge(text) { return node('span',text,'soft-badge'); }
  function notify(message) { byId('toast').textContent=message;byId('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>byId('toast').hidden=true,5000); }
  function log(title) { state.activity.unshift({title,time:new Date().toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})+' · このデモ内'});state.activity=state.activity.slice(0,5); }
  function changed(message) {state.dirty=true;state.pending=false;log(message);render();notify(message+'（デモ）');}
  function setTab(tab, focus=false) {
    if(!labels[tab])return;activeTab=tab;document.body.classList.toggle('portal-operations',['bookings','patients'].includes(tab));byId('page-title').textContent=labels[tab];
    for(const key of Object.keys(labels)){byId('panel-'+key).hidden=tab!==key;const button=byId('tab-'+key);button.setAttribute('aria-selected',String(tab===key));button.tabIndex=tab===key?0:-1;}
    document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.tab===tab));
    if(focus)byId('tab-'+tab).focus();
  }
  document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.tab)));
  document.querySelector('.tabs').addEventListener('keydown',event=>{
    const tabs=Object.keys(labels);let i=tabs.indexOf(activeTab);
    if(event.key==='ArrowRight')i=(i+1)%tabs.length;else if(event.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(event.key==='Home')i=0;else if(event.key==='End')i=tabs.length-1;else return;
    event.preventDefault();setTab(tabs[i],true);
  });
  function recordActions(type, item) {const group=node('div',null,'record-actions');group.append(action('編集する',()=>openEditor(type,item.id)),action('削除',()=>confirmDelete(type,item.id),'delete'));return group;}
  function treatmentRecord(t, preview=false) {const el=node('article',null,'record'),info=node('div');info.append(badge(t.part),node('h3',t.name),node('p',t.conditions),node('p',`ダウンタイム目安：${t.days==null?'個別確認（日数は未転記）':t.days+'日以内（個人差あり）'}`));info.append(sourceLink('公式の料金表', 'https://osaka.ace-clinic.com/price/'));if(preview)info.append(node('p',t.risk));el.append(info,node('strong',money(t.price),'price'));if(!preview)el.append(recordActions('treatments',t));return el;}
  function doctorCard(d, preview=false) {const el=node('article',null,'doctor-card'),header=node('div',null,'doctor-header'),name=node('div');name.append(node('small',d.title),node('h3',d.name));header.append(node('span','医','doctor-avatar'),name);el.append(header,node('small','資格'),node('p',d.qualifications||'未登録'),node('small','得意な施術'),node('p',d.specialties||'未登録'),node('small','経歴'),node('p',d.career||'未登録'));if(d.sourceUrl)el.append(sourceLink('公式の医師紹介',d.sourceUrl));if(!preview)el.append(recordActions('doctors',d));return el;}
  function caseCard(c, preview=false) {const el=node('article',null,'case-card'),images=node('div',null,'case-images');for(const [key,label] of [['before','BEFORE'],['after','AFTER']]){const fig=node('figure'),img=node('img');img.src=c[key];img.alt=`${c.name}：${label}${c[key]===sampleImage?'（配置確認用イラスト）':''}`;fig.append(img,node('figcaption',label));images.append(fig);}const body=node('div',null,'case-body');body.append(badge(c.part),node('h3',c.name),node('p',c.description));if(!preview)body.append(recordActions('cases',c));el.append(images,body);return el;}
  function render() {
    byId('banner-name').textContent=state.basic.name;byId('banner-address').textContent=state.basic.prefecture+' · '+state.basic.address;
    const status=byId('publication-status');status.textContent=state.pending?'申請受付済み（デモ）':state.dirty?'未申請の変更あり':'デモ掲載中';status.classList.toggle('pending',state.dirty||state.pending);
    byId('submit-button').disabled=state.pending;
    byId('treatment-count').textContent=state.treatments.length;byId('case-count').textContent=state.cases.length;
    const steps=[['basic','基本情報を登録','診療時間・アクセス・クリニック紹介',Boolean(state.basic.name&&state.basic.address&&state.basic.hours)],['treatments','施術・料金を登録','希望部位・料金条件・ダウンタイム',state.treatments.length>0],['doctors','所属医師を紹介','医師の経歴・資格・得意な施術',state.doctors.length>0],['cases','症例写真を追加','術前・術後の写真と施術説明',state.cases.length>0]];
    const complete=steps.filter(s=>s[3]).length*25;byId('completion-value').textContent=complete;byId('completion-bar').style.width=complete+'%';
    byId('checklist').replaceChildren(...steps.map(([tab,title,description,done])=>{const el=node('button',null,'check-item');el.type='button';const text=node('span');text.append(node('b',title),node('small',description));el.append(node('span',done?'✓':'＋','check-icon'),text,node('span','›','check-arrow'));el.addEventListener('click',()=>setTab(tab));return el;}));
    byId('activity-list').replaceChildren(...state.activity.map(item=>{const el=node('li',item.title);el.append(node('small',item.time));return el;}));
    for(const [key,value] of Object.entries(state.basic))byId('basic-form').elements.namedItem(key).value=value;
    for(const [type,renderer,id] of [['treatments',treatmentRecord,'treatment-list'],['doctors',doctorCard,'doctor-list'],['cases',caseCard,'case-list']])byId(id).replaceChildren(...(state[type].length?state[type].map(item=>renderer(item)): [node('p','まだ登録がありません。「追加」から登録できます。','empty')]));
  }
  byId('basic-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const data=Object.fromEntries(new FormData(form));for(const key of ['name','address','hours'])if(!data[key].trim()){notify('必須項目を入力してください。');return;}if(data.website&&!/^https?:\/\//i.test(data.website)){notify('公式サイトはhttps://またはhttp://で入力してください。');return;}state.basic=data;changed('基本情報を保存しました');});
  const configs={
    treatments:[['name','施術名','text',true],['part','部位','select',true],['price','料金（税込・円）','number',true],['days','ダウンタイム目安の上限（日・不明なら空欄）','number',false],['conditions','料金条件・別途費用','text',true],['risk','主なリスク・副作用','textarea',true]],
    doctors:[['name','医師名','text',true],['title','役職','text',true],['qualifications','資格','textarea',false],['specialties','得意な施術','text',false],['career','経歴','textarea',false]],
    cases:[['name','症例タイトル','text',true],['part','部位','select',true],['description','施術説明・費用・リスク・撮影時期','textarea',true],['before','Before写真','file',true],['after','After写真','file',true]]
  };
  function openEditor(type,id) {
    editing={type,id};dialogVersion++;const item=state[type].find(x=>x.id===id)||{};byId('editor-title').textContent=({treatments:'施術',doctors:'医師',cases:'症例'})[type]+(id?'を編集':'を追加');byId('editor-error').textContent='';
    byId('editor-fields').replaceChildren(...configs[type].map(([key,title,kind,required])=>{
      const label=node('label',title+(required?' *':''),'wide');let input;
      if(kind==='select'){input=node('select');parts.forEach(part=>{const option=node('option',part);option.value=part;input.append(option);});}
      else if(kind==='textarea'){input=node('textarea');input.rows=3;input.maxLength=1500;}
      else {input=node('input');input.type=kind;if(kind==='number'){input.min='0';input.max=key==='days'?'365':'1000000000';input.step='1';}else if(kind==='file'){input.accept='image/jpeg,image/png,image/webp';}else input.maxLength=200;}
      input.name=key;input.required=required&&!(kind==='file'&&item[key]);if(kind!=='file')input.value=item[key]??(kind==='select'?'二重':'');label.append(input);
      if(kind==='file')label.append(node('small',id?'変更する場合のみ選択。JPEG・PNG・WebP、1枚5MB以内。':'JPEG・PNG・WebP、1枚5MB以内。画像はこの画面内のみで扱います。'));
      return label;
    }));byId('editor-dialog').showModal();
  }
  for(const [id,type] of [['add-treatment','treatments'],['add-doctor','doctors'],['add-case','cases']])byId(id).addEventListener('click',()=>openEditor(type));
  function readImage(file){return new Promise((resolve,reject)=>{if(file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type)){reject(Error('写真はJPEG・PNG・WebP形式、1枚5MB以内で選択してください。'));return;}const reader=new FileReader();reader.onload=()=>{const img=new Image();img.onload=()=>resolve(reader.result);img.onerror=()=>reject(Error('写真を読み込めませんでした。別の画像を選択してください。'));img.src=reader.result;};reader.onerror=()=>reject(Error('写真を読み込めませんでした。'));reader.readAsDataURL(file);});}
  byId('editor-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const version=dialogVersion,{type,id}=editing,old=state[type].find(x=>x.id===id);const item={...old,id:id||'demo-'+Date.now()};const save=form.querySelector('button[type=submit]');save.disabled=true;
    try{for(const [key,,kind,required] of configs[type]){const input=form.elements.namedItem(key);if(kind==='file')item[key]=input.files[0]?await readImage(input.files[0]):old[key];else if(kind==='number'){item[key]=key==='days'&&input.value===''?null:Number(input.value);if(item[key]!==null&&(!Number.isSafeInteger(item[key])||item[key]<0||item[key]>Number(input.max)))throw Error('料金・日数は指定範囲内の整数で入力してください。');}else{item[key]=input.value.trim();if(required&&!item[key])throw Error('必須項目を入力してください。');}}
      if(version!==dialogVersion||!byId('editor-dialog').open)return;
      if(id)state[type]=state[type].map(x=>x.id===id?item:x);else state[type].push(item);byId('editor-dialog').close();changed(({treatments:'施術・料金',doctors:'医師情報',cases:'症例写真'})[type]+'を保存しました');
    }catch(error){if(version===dialogVersion)byId('editor-error').textContent=error.message;}finally{save.disabled=false;}
  });
  function ask(title,message,label,handler){byId('confirm-title').textContent=title;byId('confirm-message').textContent=message;byId('confirm-action').textContent=label;confirmAction=handler;byId('confirm-dialog').showModal();}
  function confirmDelete(type,id){ask('登録情報を削除しますか？','このデモ内の登録情報を削除します。実際のクリニック情報は変更されません。','削除する',()=>{state[type]=state[type].filter(x=>x.id!==id);changed('登録情報を削除しました');});}
  byId('confirm-action').addEventListener('click',()=>{byId('confirm-dialog').close();confirmAction?.();});
  byId('submit-button').addEventListener('click',()=>ask('更新を申請する（デモ）','編集した情報を確認しましたか？申請すると、この画面内のステータスが「申請受付済み」に変わります。実際の送信や公開は行いません。','申請する（デモ）',()=>{state.pending=true;state.dirty=false;log('更新申請を受け付けました（デモ）');render();notify('申請受付済みに変更しました。実際の送信・公開は行っていません。');}));
  byId('reset-button').addEventListener('click',()=>ask('デモを初期状態に戻しますか？','この画面で編集した内容と選択した画像をクリアして、最初のサンプルへ戻します。','初期状態に戻す',()=>{state=seed();render();window.dispatchEvent(new Event('portal-demo-reset'));notify('デモを初期状態に戻しました。');}));
  byId('preview-button').addEventListener('click',()=>{
    const content=byId('preview-content'),description=node('p',state.basic.description,'preview-description'),dl=node('dl',null,'preview-dl');
    for(const [title,key] of [['住所','address'],['診療時間','hours'],['休診日','closed'],['電話番号','phone'],['公式サイト','website']])dl.append(node('dt',title),node('dd',state.basic[key]||'未登録'));
    content.replaceChildren(badge('架空のクリニック・掲載イメージ'),node('h2',state.basic.name),description,dl);
    for(const [title,items,renderer] of [['施術・料金',state.treatments,treatmentRecord],['医師情報',state.doctors,doctorCard],['症例写真',state.cases,caseCard]]){const section=node('section',null,'preview-section');section.append(node('h3',title));items.forEach(item=>section.append(renderer(item,true)));if(!items.length)section.append(node('p','未登録','muted'));content.append(section);}byId('preview-dialog').showModal();
  });
  document.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  byId('editor-dialog').addEventListener('close',()=>{dialogVersion++;});
  render();
  if (location.hash === '#bookings') setTab('bookings');
  if (location.hash === '#patients') setTab('patients');
})();
