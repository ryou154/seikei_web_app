(() => {
  'use strict';
  const unknown = '公式サイトで確認できませんでした';
  const prefectures = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
  const normalize = text => String(text ?? '').normalize('NFKC').trim().replace(/\s+/g, '').toLowerCase();
  const valueOf = item => item && typeof item === 'object' && Object.hasOwn(item, 'value') ? item.value : item;
  const array = item => { const value = valueOf(item); return Array.isArray(value) ? value : []; };
  function display(value) {
    value = valueOf(value);
    if (value === null || value === undefined || value === '') return unknown;
    if (Array.isArray(value)) return value.length ? value.map(display).join('・') : unknown;
    if (typeof value === 'object') return unknown;
    return String(value);
  }
  function safeUrl(value, maps = false) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.username || url.password) return null;
      if (maps && !['www.google.com', 'google.com', 'maps.google.com', 'maps.app.goo.gl'].includes(url.hostname)) return null;
      return url.href;
    } catch { return null; }
  }
  function stale(date, today = new Date()) {
    const time = typeof date === 'string' && date.trim() ? Date.parse(date) : NaN;
    return !Number.isFinite(time) || time > today.getTime() || today.getTime() - time > 90 * 86400000;
  }
  function evidence(item, fallback = {}) {
    const record = item && typeof item === 'object' ? item : {};
    const sourceUrl = record.sourceUrl || record.url || fallback.sourceUrl;
    const verifiedAt = record.verifiedAt || record.lastVerified || fallback.verifiedAt;
    const requested = record.verificationStatus || fallback.verificationStatus || 'unverified';
    const hasValue = valueOf(item) !== null && valueOf(item) !== undefined && valueOf(item) !== '' && (!Array.isArray(valueOf(item)) || valueOf(item).length > 0);
    const validDate = typeof verifiedAt === 'string' && Number.isFinite(Date.parse(verifiedAt)) && Date.parse(verifiedAt) <= Date.now();
    const status = !hasValue ? 'unverified' : requested === 'automated' && safeUrl(sourceUrl) && validDate ? 'automated' : requested === 'verified' && safeUrl(sourceUrl) && validDate ? 'verified' : requested === 'verified' || requested === 'needs_review' ? 'needs_review' : 'unverified';
    return {sourceUrl, verifiedAt, verificationStatus: status, notes: record.notes || fallback.notes};
  }
  function adaptClinic(raw) {
    const modern = Object.hasOwn(raw, 'prefecture');
    const prefecture = raw.prefecture || prefectures.find(p => String(raw.address || '').includes(p)) || '';
    const status = raw.verificationStatus || (raw.sources?.length ? 'needs_review' : 'unverified');
    const treatments = array(raw.treatments).map(t => {
      const item=typeof t==='string'?{name:t,parts:[],pricing:[]}: {...t,parts:array(t.parts),pricing:array(t.pricing)};
      const detail=array(raw.treatmentDetails).find(d=>d.name===item.name);
      return detail?{...item,...detail,downtime:{maxDays:detail.downtimeMaxDays,text:detail.downtimeMaxDays==null?null:`掲載目安の上限${detail.downtimeMaxDays}日（個人差あり）`}}:item;
    });
    const sources = array(raw.sources);
    return {...raw, prefecture, city:raw.city || '', treatments, sources,
      officialUrl:raw.officialUrl || raw.sourceUrl, openingHours:raw.openingHours || raw.hours,
      verifiedAt:raw.verifiedAt || raw.lastVerified, verificationStatus:status,
      pricing:array(raw.pricing).length ? array(raw.pricing).map(p=>({...p,text:p.text||p.displayPrice,minAmount:p.minAmount??p.amountMin,maxAmount:p.maxAmount??p.amountMax,extraCosts:p.extraCosts??p.additionalCosts})) : treatments.flatMap(t => t.pricing.map(p => ({...p,treatment:t.name}))),
      doctors:array(raw.doctors), caseInformation:raw.caseInformation ?? raw.officialCases ?? null,
      downtimeAndRisks:raw.downtimeAndRisks ?? treatments.map(t => ({treatment:t.name,downtime:t.downtime,risks:t.risks,sourceUrl:t.sourceUrl,verifiedAt:t.lastVerified,verificationStatus:'needs_review'})),
      warrantyAndAftercare:raw.warrantyAndAftercare ?? treatments.map(t => ({treatment:t.name,warranty:t.warranty,aftercare:t.aftercare,sourceUrl:t.sourceUrl,verifiedAt:t.lastVerified,verificationStatus:'needs_review'})),
      legacy: raw.legacy ?? !modern};
  }
  function clinicStatus(c) { return c.isDemo ? c.demoStatus : evidence(c, {sourceUrl:c.officialUrl}).verificationStatus; }
  function search(data, conditions = {}) {
    const area = normalize(conditions.keyword || conditions.area);
    const priceChoice = conditions.hasPricing;
    return data.flatMap(raw => {
      const c = adaptClinic(raw);
      if (conditions.prefecture && c.prefecture !== conditions.prefecture) return [];
      if (conditions.city && !normalize(c.city).includes(normalize(conditions.city))) return [];
      const haystack = [c.name,c.city,c.address,c.access,...(c.areas || [])].map(normalize).join(' ');
      if (area && !haystack.includes(area)) return [];
      if (conditions.verificationStatus && (conditions.verificationStatus === 'needs_review' ? !['needs_review','automated'].includes(clinicStatus(c)) : clinicStatus(c) !== conditions.verificationStatus)) return [];
      const hasPricing = c.pricing.some(p => Number.isFinite(valueOf(p.amount)) || (typeof valueOf(p) === 'string' && valueOf(p).trim()) || p.text || p.minAmount != null || p.maxAmount != null);
      if ((priceChoice === true || priceChoice === 'true') && !hasPricing) return [];
      if ((priceChoice === false || priceChoice === 'false') && hasPricing) return [];
      const treatments = c.treatments.filter(t => (!conditions.part || t.parts.includes(conditions.part)) &&
        (!conditions.treatment || normalize(t.name).includes(normalize(conditions.treatment))) &&
        (conditions.budget == null && conditions.budgetMin == null || [...t.pricing,...c.pricing.filter(p=>p.treatment===t.name)].filter(p=>!['group','reference','unconfirmed'].includes(p.scope)).some(p=>{
          const min=valueOf(p.amount) ?? p.minAmount,max=p.maxAmount ?? min;
          return Number.isFinite(min) && (conditions.budget==null || min<=conditions.budget) && (conditions.budgetMin==null || Number.isFinite(max)&&max>=conditions.budgetMin);
        })) &&
        (conditions.days == null || (Number.isFinite(t.downtime?.maxDays) && t.downtime.maxDays<=conditions.days)));
      const constrained = conditions.part || conditions.treatment || conditions.budget != null || conditions.budgetMin != null || conditions.days != null;
      return !constrained || treatments.length ? [{clinic:c,treatments:constrained?treatments:c.treatments}] : [];
    });
  }
  // Synthetic UI fixtures have no medical evidence and cannot become published verified data.
  const demo = Array.from({length:6},(_,i) => {
    const tokyo = i<3, n = i%3;
    const item = (value) => ({value,verificationStatus:['verified','needs_review','unverified'][n],sourceUrl:null,verifiedAt:null,notes:'画面確認用の架空データ。公式情報ではありません。'});
    return {id:`demo-${i}`,placeId:null,name:`【仮データ】${tokyo?'東京':'大阪'}サンプルクリニック${n+1}`,prefecture:tokyo?'東京都':'大阪府',city:tokyo?'新宿区':'大阪市北区',address:tokyo?'東京都新宿区（架空の住所）':'大阪府大阪市北区（架空の住所）',location:null,phone:null,officialUrl:null,googleMapsUrl:null,businessStatus:n===2?'CLOSED_TEMPORARILY':'OPERATIONAL',openingHours:n===2?null:['10:00〜18:00（仮）'],placesFetchedAt:null,verifiedAt:null,verificationStatus:['verified','needs_review','unverified'][n],createdAt:null,updatedAt:null,
      treatments:[{name:n===2?'肌の施術（仮）':'二重埋没法（仮）',parts:[n===2?'肌':'二重'],pricing:[]}],pricing:n===2?[]:[{amount:50000+i*1000,conditions:'税込・両目（仮）',notes:'モニター条件・麻酔代は未確認',verificationStatus:'unverified'}],doctors:n===2?[]:[{name:item('サンプル医師（架空）'),specialties:item(['二重（仮）']),qualifications:item(null)}],caseInformation:item(null),downtimeAndRisks:item(null),warrantyAndAftercare:item(null),sources:[],isDemo:true,demoStatus:['verified','needs_review','unverified'][n]};
  });
  function createLocalRepository(getData) {
    return {
      async fetchClinics(filters = {}) {
        const rows = search(getData(),filters).map(r=>r.clinic);
        const page = Math.max(1,Number(filters.page)||1), limit = Math.min(100,Math.max(1,Number(filters.limit)||12));
        return {items:rows.slice((page-1)*limit,page*limit),total:rows.length,page,limit};
      },
      async fetchClinicDetail(id) {
        const c = getData().find(c=>c.id===id);
        if (!c) throw new Error('Clinic unavailable');
        return adaptClinic(c);
      }
    };
  }
  function createApiRepository({request = (...args)=>fetch(...args),baseUrl = '/api/clinics'} = {}) {
    // Inject the application's authenticated request here when the API contract is ready.
    return {
      async fetchClinics(filters = {}) {
        const params = new URLSearchParams();
        for (const key of ['prefecture','city','keyword','treatment','hasPricing','verificationStatus','page','limit','part','budget','budgetMin','days']) if (filters[key] !== '' && filters[key] != null) params.set(key,String(filters[key]));
        const response = await request(`${baseUrl}?${params}`,{headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error('Clinic list unavailable');
        const body = await response.json();
        const items=body.clinics??body.items,total=body.pagination?.total??body.total;
        if (!Array.isArray(items) || !Number.isInteger(total) || total<0) throw new Error('Invalid clinic list');
        return {items:items.map(adaptClinic),total,page:body.pagination?.page??body.page??filters.page,limit:body.pagination?.limit??body.limit??filters.limit,truncated:Boolean(body.pagination?.truncated)};
      },
      async fetchClinicDetail(id) {
        const response = await request(`${baseUrl}/${encodeURIComponent(id)}`,{headers:{Accept:'application/json'}});
        if (!response.ok) throw new Error('Clinic detail unavailable');
        const payload = await response.json();
        const body=payload.clinic??payload;
        if (!body || body.id !== id) throw new Error('Invalid clinic detail');
        return adaptClinic(body);
      }
    };
  }
  let repository = window.ClinicRepository || createLocalRepository(()=>window.CLINIC_DATA || []);
  function visibleTreatmentNames(raw, filters = {}) {
    const clinic = adaptClinic(raw);
    return [...new Set(clinic.treatments.filter(t => !filters.part || t.parts.includes(filters.part)).map(t => t.name))];
  }
  function referenceTreatmentNames(raw, filters = {}) {
    return [...new Set(array(raw.referenceTreatmentDetails).filter(t => !filters.part || array(t.parts).includes(filters.part)).map(t => t.name).filter(Boolean))];
  }
  const backendRepository=createApiRepository({request:(...args)=>window.AppAuth.fetch(...args)});
  const api = window.ClinicSearch = {casePhotoLayout,groupCasePhotos,groupProcedures,search,stale,evidence,adaptClinic,visibleTreatmentNames,referenceTreatmentNames,createLocalRepository,createApiRepository,demo,
    fetchClinics:(filters,provider=backendRepository)=>provider.fetchClinics(filters),fetchClinicDetail:(id,provider=backendRepository)=>provider.fetchClinicDetail(id),
    setRepository:next=>{repository=next;}};
  // These are appearance search words, not a diagnosis or a prescribed treatment.
  const simulationTerms={eye:{wide:['二重'],cat:['目元'],soft:['目元'],natural:['目元']},nose:{high:['鼻'],small:['鼻'],sharp:['鼻'],natural:['鼻']},face:{vline:['輪郭','小顔'],oval:['輪郭','小顔'],sharp:['輪郭','小顔'],natural:['輪郭','小顔']},mouth:{full:['口元','唇'],small:['口元','唇'],smile:['口元','唇'],natural:['口元','唇']},forehead:{round:['額'],smooth:['額'],balanced:['額'],natural:['額']}};
  const procedureSearchTerms={
    '二重整形（埋没法・切開法など）':['二重'], '目尻切開など':['目尻切開'], 'たれ目形成など':['たれ目','下眼瞼下制'],
    '隆鼻術など':['隆鼻'], '鼻翼縮小術など':['鼻翼縮小','小鼻縮小'], '鼻尖形成術など':['鼻尖形成'],
    '輪郭形成':['輪郭形成'], '脂肪吸引など':['脂肪吸引'], '脂肪注入など':['脂肪注入'], '脂肪注入':['脂肪注入'],
    '唇へのヒアルロン酸注入など':['ヒアルロン酸'], '口唇縮小術など':['口唇縮小'], '口角挙上術など':['口角挙上'],
    '額形成':['額形成'], '額形成など':['額形成'], 'ヒアルロン酸注入など':['ヒアルロン酸']
  };
  function simulationConditions(profile={},procedureSummary=window.SimulationAdjustments?.create(profile)) {
    const region=String(profile.region||'').trim();
    const prefecture=prefectures.find(p=>region===p||region===p.replace(/[都府県]$/,''))||prefectures.find(p=>region.startsWith(p))||'';
    const procedureQueries=procedureSummary?array(procedureSummary.relatedProcedures).flatMap(row=>array(row.examples).flatMap(example=>(procedureSearchTerms[example]||[]).map(term=>({term,part:row.part,example})))):null;
    const terms=[...new Set(procedureQueries?procedureQueries.map(q=>q.term):Object.entries(simulationTerms).flatMap(([key,map])=>map[profile[key]]||[]))];
    const filters={prefecture,keyword:prefecture?region.slice(region.startsWith(prefecture)?prefecture.length:region.length).trim():region,page:1,limit:5};
    if(profile.budget==='under20')filters.budget=199999;
    if(profile.budget==='20to40')filters.budget=400000;
    if(profile.budget==='20to40')filters.budgetMin=200000;
    if(profile.budget==='over40')filters.budgetMin=400000;
    if(profile.downtime==='short')filters.days=7;
    if(profile.downtime==='standard')filters.days=14;
    if(profile.clinicPriority==='cost'||profile.budget&&profile.budget!=='any')filters.hasPricing=true;
    const notes=[procedureQueries?'表示した施術例のいずれかに対応する候補です。診察での適応や全施術への対応を保証しません。':'複数の希望部位は、いずれかの検索語に一致する候補を表示します。全施術への対応を保証しません。','料金・ダウンタイムは各公式情報で要確認。予算は最低掲載料金、日数は掲載目安の上限で判定します。'];
    if(['20to40','over40'].includes(profile.budget))notes.push('掲載料金帯と予算の下限・上限が重なる施術を検索します。追加費用や実際の選択プランは公式情報で確認してください。');
    if(Object.values(profile.custom||{}).some(v=>String(v||'').trim()))notes.push('自由入力は具体的な施術名に変換していません。');
    return {filters,terms,procedureQueries,notes,priority:({match:'希望内容との相性',cost:'費用',downtime:'ダウンタイム'})[profile.clinicPriority]||'希望内容との相性'};
  }
  api.simulationConditions=simulationConditions;
  api.fetchSimulationClinics=async(profile,procedureSummary)=>{
    const plan=simulationConditions(profile,procedureSummary);
    if(plan.procedureQueries&&!plan.terms.length)return {...plan,items:[]};
    const requests=plan.terms.length?plan.terms:[''];
    const responses=await Promise.all(requests.map(treatment=>api.fetchClinics({...plan.filters,treatment})));
    const candidates=new Map();
    responses.forEach((response,index)=>{for(const raw of response.items){const c=adaptClinic(raw);if(clinicStatus(c)!=='verified'||(plan.filters.prefecture&&c.prefecture!==plan.filters.prefecture))continue;
      const reasons=[plan.filters.prefecture?`地域：${plan.filters.prefecture}`:plan.filters.keyword?`地域キーワード：${plan.filters.keyword}`:'地域：指定なし'];
      if(plan.procedureQueries){
        const matches=plan.procedureQueries.filter(q=>q.term===requests[index]&&c.treatments.some(t=>normalize(t.name).includes(normalize(q.term))&&(!['脂肪吸引','脂肪注入','ヒアルロン酸'].includes(q.term)||({輪郭:['輪郭','顔','頬','顎'],口元:['唇','口元','口唇'],おでこ:['額','おでこ']})[q.part]?.some(word=>normalize(t.name).includes(normalize(word))))));
        if(!matches.length)continue;
        reasons.push(...matches.map(q=>`施術例との一致：${q.part}・${q.example}（登録施術：${c.treatments.filter(t=>normalize(t.name).includes(normalize(q.term))).map(t=>t.name).join('、')}）`));
      }else if(requests[index])reasons.push(`希望部位の検索語：${requests[index]}`);
      if(plan.filters.hasPricing)reasons.push('料金情報の登録あり');
      if(plan.filters.budget!=null)reasons.push(`最低掲載料金：${plan.filters.budget.toLocaleString('ja-JP')}円以下`);
      if(plan.filters.budgetMin!=null)reasons.push(`掲載料金帯が${plan.filters.budgetMin.toLocaleString('ja-JP')}円以上の予算に対応`);
      if(plan.filters.days!=null)reasons.push(`掲載ダウンタイム目安の上限：${plan.filters.days}日以内`);
      reasons.push(`公式情報の確認状態：${c.verificationStatus === 'verified' ? '確認済み' : c.verificationStatus === 'automated' ? '自動取得（要確認）' : '要確認'}`);
      if(candidates.has(c.id))candidates.get(c.id).matchReasons=[...new Set([...candidates.get(c.id).matchReasons,...reasons])];else candidates.set(c.id,{...c,matchReasons:reasons});
    }});
    return {...plan,items:[...candidates.values()].slice(0,5)};
  };
  const existingForm = document.getElementById('clinic-search-form');
  if (!existingForm && !document.getElementById('hospital-list')) return;
  const automatic = !existingForm;
  const form = existingForm || document.createElement('form');
  const results = document.getElementById('hospital-list'), summary = document.getElementById('clinic-summary');
  const detailPanel = document.getElementById('clinic-detail'), pagination = document.getElementById('clinic-pagination');
  const collection = document.getElementById('collection-status');
  const labels = {verified:'確認済み',automated:'自動取得（要確認）',needs_review:'要確認',unverified:'未確認'};
  let page=1, pending=false, listVersion=0, detailVersion=0, snapshot=null, detailPending=false, clearing=false;
  let detailDialog=null, detailTrigger=null;
  function closeDetail({restoreFocus=true}={}) {
    ++detailVersion;detailPending=false;
    if(detailDialog?.open)detailDialog.close();
    if(detailPanel)detailPanel.hidden=true;
    document.body?.classList.toggle('clinic-modal-open',false);
    if(restoreFocus)(detailTrigger?.isConnected?detailTrigger:document.getElementById('clinic-title'))?.focus({preventScroll:true});
    detailTrigger=null;
  }
  function openDetailModal() {
    if(!detailDialog && detailPanel?.parentNode) {
      const dialog=node('dialog',undefined,'clinic-detail-modal');
      if(typeof dialog.showModal==='function') {
        dialog.setAttribute('aria-label','クリニック情報');dialog.setAttribute('aria-labelledby','clinic-detail-title');
        detailPanel.parentNode.insertBefore(dialog,detailPanel);dialog.append(detailPanel);detailDialog=dialog;
        dialog.addEventListener('cancel',event=>{event.preventDefault();closeDetail();});
        dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDetail();});
      }
    }
    if(detailDialog && !detailDialog.open) {
      detailTrigger=document.activeElement;
      detailDialog.showModal();document.body.classList.toggle('clinic-modal-open',true);
    }
  }
  function detailControls() {
    const controls=node('div',undefined,'clinic-modal-controls'),close=button('閉じる ×',()=>closeDetail(),true);
    close.setAttribute('aria-label','クリニック情報を閉じる');controls.append(close);return controls;
  }
  function node(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
  function button(label,action,secondary=false) {const b=node('button',label,secondary?'secondary':'');b.type='button';b.addEventListener('click',action);return b;}
  function link(label,url,maps=false) {
    const href=safeUrl(url,maps);if(!href)return node('span',`${label}：${unknown}`);
    const a=node('a',label,'clinic-link-button');a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function badge(item,fallback={}) {const e=evidence(item,fallback);return node('span',labels[e.verificationStatus],`verification ${e.verificationStatus}`);}
  function metadata(parent,item,fallback={}) {
    const e=evidence(item,fallback), line=node('p',undefined,'note');
    line.append(badge(item,fallback),node('span',` 最終確認日：${display(e.verifiedAt)} `));
    if(!safeUrl(e.sourceUrl))line.append(node('span','出典：'+unknown));
    if(e.notes)line.append(node('span',' 条件・注意：'+display(e.notes)));
    if(e.verifiedAt && stale(e.verifiedAt))line.append(node('span',' 情報が古い、または確認日が不正です。再確認が必要です。','warning'));
    parent.append(line);
  }
  function field(parent,label,item,fallback={}) {
    const group=node('div',undefined,'detail-field');group.append(node('h4',label),node('p',display(item)));metadata(group,item,fallback);parent.append(group);
  }
  function conditions() {
    const data=new FormData(form), number=name=>data.get(name)==='' || data.get(name)==null?null:Number(data.get(name));
    return {prefecture:data.get('prefecture')||'',city:'',keyword:data.get('area')||'',area:data.get('area')||'',treatment:data.get('treatment')||'',part:data.get('part')||'',hasPricing:data.get('hasPricing')||'',verificationStatus:data.get('verificationStatus')||'',budget:number('budget'),budgetMin:number('budgetMin'),days:number('days'),page,limit:12};
  }
  function isBackend(){return automatic || form.elements.namedItem('dataMode')?.value==='backend';}
  function selectedRepository() {return isBackend()?backendRepository:form.elements.namedItem('dataMode')?.value==='demo'?createLocalRepository(()=>demo):repository;}
  function busy(value) {pending=value;form.setAttribute('aria-busy',String(value));for(const el of form.elements)el.disabled=value;}
  function collectionText() {
    if(!collection)return;
    const isDemo=form.elements.namedItem('dataMode')?.value==='demo',info=window.CLINIC_SCRAPE_INFO;
    collection.textContent=isBackend()?'管理者が公開したクリニック情報を表示します。希望部位・予算・ダウンタイムは、出典付きの条件が登録された同じ施術で判定します。未登録の値は一致に含めません。':isDemo?'仮データ：東京3院・大阪3院。架空の値と確認状態の表示例です。医療機関選びには使用できません。':info?`自動取得した登録データ：${info.clinicCount}院・${info.prefectureCount||'?'}都道府県（${info.lastVerified}）。目視確認済みとは別です。${info.coverage||''}`:'既存の登録データを表示します。各項目の確認状態をご確認ください。';
  }
  function renderList(response) {
    results.replaceChildren();pagination?.replaceChildren();
    summary.textContent=`${response.total}院が登録情報上の条件に一致しました。`;
    if(response.truncated)summary.textContent+=' 取得上限に達しています。都道府県を指定して絞り込んでください。';
    if(!response.items.length){results.append(node('p',automatic?'条件に一致する公開済みクリニックがありません。シミュレーションの入力条件を変更すると自動更新します。':'条件に合う登録がありません。条件を変更して再検索してください。別の地域の院は代替表示しません。','empty'));return;}
    for(const raw of response.items){
      const c=adaptClinic(raw),card=node('article',undefined,'clinic-card');
      const bar=button('',()=>showDetail(c.id));
      bar.className='clinic-result-bar';bar.setAttribute('aria-controls','clinic-detail');bar.title='クリックして詳細を見る';
      const main=node('span',undefined,'clinic-row-main'),heading=node('span',undefined,'clinic-row-heading');
      heading.append(node('span',c.name,'clinic-row-title'),c.isDemo?node('span',`表示例：${labels[c.demoStatus]}（仮）`,`verification ${c.demoStatus}`):badge(c,{sourceUrl:c.officialUrl}));
      const meta=node('span',undefined,'clinic-row-meta'),date=new Date(c.verifiedAt);
      const formatted=c.verifiedAt&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'Asia/Tokyo'}).format(date):unknown;
      const fetched=node('span',`${c.verificationStatus==='automated'?'公式情報取得日':'最終確認日'}：${formatted}`);fetched.title=display(c.verifiedAt);
      meta.append(node('span',`${c.prefecture} ${c.city}`.trim()),fetched);main.append(heading,meta);
      const chevron=node('span','›','clinic-row-chevron');chevron.setAttribute('aria-hidden','true');
      bar.append(main,chevron);card.append(bar);results.append(card);
    }
    if(pagination && response.total>response.limit){
      const pages=Math.ceil(response.total/response.limit);
      const prev=button('前のページ',()=>loadList(page-1),true),next=button('次のページ',()=>loadList(page+1),true);prev.disabled=page<=1;next.disabled=page>=pages;
      pagination.append(prev,node('span',`${page} / ${pages}ページ`),next);
    }
  }
  async function loadList(nextPage=1) {
    if(pending)return;
    if(isBackend()&&!window.AppAuth?.uid){collectionText();summary.textContent='ログイン確認後に公開済みデータを読み込みます。';busy(false);return;}
    page=nextPage;const version=++listVersion,filters=automatic?{}:conditions(),provider=selectedRepository();
    collectionText();busy(true);summary.textContent='クリニック情報を読み込み中です。';
    for(const b of pagination?.querySelectorAll('button')||[])b.disabled=true;
    try{
      let response;
      if(automatic){const matched=await api.fetchSimulationClinics(readSimulationProfile());response={items:matched.items,total:matched.items.length,page:1,limit:5};if(version===listVersion){const hint=document.getElementById('clinic-simulation-sync');if(hint)hint.textContent='入力条件を自動反映しています。 '+matched.notes.join(' ');}}
      else response=await api.fetchClinics(filters,provider);
      if(version!==listVersion)return;
      if(!Array.isArray(response.items) || !Number.isInteger(response.total))throw new Error('Invalid response');
      snapshot={...response,filters:{...filters},page,limit:response.limit||filters.limit};renderList(snapshot);
      // A new result set closes the previously selected clinic only after successful retrieval.
      closeDetail({restoreFocus:false});if(detailPanel)detailPanel.replaceChildren();
    }catch{
      if(version===listVersion){summary.textContent='クリニック情報を取得できませんでした。'+(snapshot?'前回の検索結果を表示しています。':'');if(!snapshot){results.replaceChildren(node('p','通信に失敗しました。','empty'));}else renderPaginationRestore();if(automatic)results.append(button('再試行',()=>loadList(1),true));}
    }finally{if(version===listVersion)busy(false);}
  }
  function renderPaginationRestore(){if(snapshot){page=snapshot.page;const message=summary.textContent;renderList(snapshot);summary.textContent=message;}}
  function groupProcedures(c) {
    const order=['目元・二重','鼻','輪郭・小顔','口元・唇','額','肌','胸','体','その他・部位未確認'];
    const rules=[/二重|目元|まぶた|目頭|目尻|眼瞼|クマ|くま|涙袋/,/鼻/,/輪郭|小顔|顎|あご|アゴ|フェイス|エラ/,/口元|唇|口唇|口角|人中/,/額|おでこ|こめかみ/,/肌|しみ|シミ|しわ|シワ|肝斑|ほくろ|いぼ|毛穴|ピーリング/,/胸|バスト|乳/,/体|痩身|脂肪吸引|ダイエット|脱毛/];
    const classify=(parts,name)=>{
      const explicit=array(parts).join('・');
      const labels=rules.flatMap((rule,i)=>rule.test(explicit)?[order[i]]:[]);
      if(labels.length)return labels;
      const inferred=rules.flatMap((rule,i)=>rule.test(String(name||''))?[order[i]]:[]);
      return inferred.length?inferred:[order[8]];
    };
    const groups=new Map(order.map(part=>[part,{part,treatments:[],pricing:[]}]));
    for(const t of c.treatments)for(const part of classify(t.parts,t.name))groups.get(part).treatments.push(t);
    for(const p of c.pricing){
      const treatment=c.treatments.find(t=>p.treatment&&normalize(t.name)===normalize(p.treatment));
      for(const part of classify(p.parts||treatment?.parts,p.treatment))groups.get(part).pricing.push(p);
    }
    return [...groups.values()].filter(g=>g.treatments.length||g.pricing.length);
  }
  function detailView(c) {
    const fragment=node('div');
    fragment.append(detailControls());
    const title=node('h3',c.name);title.id='clinic-detail-title';title.tabIndex=-1;fragment.append(title,badge(c,{sourceUrl:c.officialUrl}));
    if(c.isDemo)fragment.append(node('p','画面確認用の架空データです。実際の医療情報ではありません。','warning'));
    const basic=node('dl');for(const [label,value]of [['住所',c.address],['電話番号',c.phone],['営業時間',c.openingHours],['営業状態',({OPERATIONAL:'営業中',CLOSED_TEMPORARILY:'一時休業',CLOSED_PERMANENTLY:'閉業'})[c.businessStatus]],['市区町村',c.city],['Google Place ID',c.placeId],['基本情報の最終取得日時',c.placesFetchedAt]])basic.append(node('dt',label),node('dd',display(value)));fragment.append(basic);
    const actions=node('div',undefined,'actions');actions.append(link(clinicStatus(c)==='verified'?'公式サイトを開く':'公式サイト候補を開く（要確認）',c.officialUrl),link('Google Mapsで確認する',c.googleMapsUrl,true));fragment.append(actions);
    const fallback={verificationStatus:c.legacy?'needs_review':c.verificationStatus||'unverified'};
    fragment.append(node('h3','部位別の施術・料金'));
    const selectedPart=form.elements.namedItem('part')?.value||'';
    const selectedGroup=({'二重':'目元・二重','目元':'目元・二重','輪郭':'輪郭・小顔','口元':'口元・唇'})[selectedPart]||selectedPart;
    const groups=groupProcedures(c).sort((a,b)=>Number(b.part===selectedGroup)-Number(a.part===selectedGroup));
    for(const group of groups){
      if(!group.pricing.length&&!group.treatments.some(t=>t.extraCosts))continue;
      const section=node('details',undefined,'clinic-part-group');
      section.open=!selectedPart||group.part===selectedGroup;
      section.append(node('summary',group.part,'clinic-part-heading'));
    section.append(node('h3','施術料金・追加費用'));

    for(const p of group.pricing){const price=valueOf(p);let text;
      if(typeof price==='string')text=price;else {text=p.text || (Number.isFinite(p.amount)?`${p.amount.toLocaleString('ja-JP')}円`:p.minAmount!=null&&p.maxAmount!=null?`${display(p.minAmount)}〜${display(p.maxAmount)}円`:p.minAmount!=null?`${display(p.minAmount)}円から`:unknown);}
      field(section,`${['group','reference','unconfirmed'].includes(p.scope)?'参考料金（適用要確認）：':''}${p.treatment||'掲載料金'}`,text,evidence(p,fallback));
      for(const [label,v]of [['料金条件（税込・片側／両側など）',p.conditions],['モニター条件',p.monitorConditions],['麻酔代・薬代などの追加費用',p.extraCosts]])if(valueOf(v))field(section,label,v,evidence(p,fallback));
    }
    for(const t of group.treatments)if(t.extraCosts)field(section,`${t.name}の追加費用`,t.extraCosts,evidence(t,fallback));

      fragment.append(section);
    }
    fragment.append(node('h3','医師の得意分野・資格'));
    if(!c.doctors.length)field(fragment,'医師情報',null);for(const d of c.doctors){const source=evidence(d,fallback);for(const [label,v]of [['医師名',d.name],['役職',d.title],['得意分野（公式掲載）',d.specialties],['資格・所属（公式掲載）',d.qualifications]])field(fragment,label,v,source);if(d.profileUrl)fragment.append(link('公式医師プロフィールを開く',d.profileUrl));}
    fragment.append(node('h3','症例写真'));
    const gallery=node('div',undefined,'clinic-case-gallery');gallery.id='clinic-case-gallery';gallery.append(node('p','症例写真を読み込み中です。','note'));fragment.append(gallery);
    fragment.append(node('h3','症例情報'));
    const cases=array(c.caseInformation).length?array(c.caseInformation):[valueOf(c.caseInformation)];
    for(const item of cases){const source=evidence(item,evidence(c.caseInformation,fallback));if(!item || typeof item!=='object'){field(fragment,'症例情報',item,source);continue;}if(item.summary)field(fragment,'公式掲載の症例説明',item.summary,source);field(fragment,'対象施術・範囲',item.treatment||item.scope,source);field(fragment,'症例件数',item.count!=null&&item.period?`${item.count}件`:null,source);field(fragment,'集計期間',item.period,source);if(item.scope)field(fragment,'症例の対象範囲',item.scope,source);}
    for(const item of c.officialCaseLinks||[]){fragment.append(link(`公式症例：${item.name}`,item.sourceUrl));metadata(fragment,item,{verifiedAt:c.verifiedAt,verificationStatus:'needs_review'});}
    fragment.append(node('h3','ダウンタイム・副作用・リスク'));
    renderGroup(fragment,c.downtimeAndRisks,[['downtime','ダウンタイム'],['sideEffects','副作用'],['risks','主なリスク']],fallback);
    fragment.append(node('h3','保証・アフターケア'));
    renderGroup(fragment,c.warrantyAndAftercare,[['warranty','保証'],['aftercare','アフターケア']],fallback);
    fragment.append(node('p','掲載情報は各クリニックの公式サイト等を確認した参考情報です。料金・施術内容・リスク・保証条件は変更される場合があります。最新情報は必ず公式サイトまたはカウンセリングで確認してください。本サービスは医療機関や施術効果を保証するものではありません。','note'));
    const officialEvidenceUrl=[c.officialUrl,...c.sources.map(s=>s.sourceUrl||s.url),...c.treatments.map(t=>t.sourceUrl),...c.pricing.map(p=>p.sourceUrl)].find(url=>safeUrl(url));
    const footer=node('div',undefined,'actions clinic-evidence-footer');
    footer.append(link('根拠の公式ページを開く',officialEvidenceUrl));fragment.append(footer);
    return fragment;
  }
  function renderGroup(parent,group,fields,fallback) {
    const raw=valueOf(group),rows=Array.isArray(raw)?raw:[raw];
    for(const row of rows){const source=evidence(row,evidence(group,fallback));if(row?.treatment)parent.append(node('h4',row.treatment));
      if(row?.description){field(parent,row.title||'公式掲載情報',row.description,source);continue;}
      if(typeof row==='string'){field(parent,'掲載情報',row,source);continue;}
      for(const [key,label]of fields){const v=row?.[key];field(parent,label,key==='downtime'&&v&&typeof v==='object'&&!Object.hasOwn(v,'value')?v.text:v,source);}
    }
  }
  function groupCasePhotos(photos){
    const groups=new Map();
    for(const p of photos){
      const label=String(p.title||'');
      const before=/術前|before/i.test(label),after=/術後|施術直後|after/i.test(label);
      const caption=String(p.description||'').trim();
      const phase=before&&after?'':before?'Before':after?'After':['Before','After'].includes(p.phase)?p.phase:/^before$/i.test(caption)?'Before':/^after$/i.test(caption)?'After':'';
      const source=new URL(p.sourceUrl);
      source.hash='';
      const specific=/^\/(?:case|cases|report|reports|photo|shourei)\/(?!page(?:\/|$))[^/]+\/?$/i.test(source.pathname)||source.searchParams.get('post_type')==='case'&&source.searchParams.has('p');
      const stem=normalize(label.replace(/(?:術前|術後|施術直後|before|after).*$/i,''));
      const key=specific?source.href:phase&&stem?source.href+'|'+stem:p.imageUrl;
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push({...p,phase});
    }
    return [...groups.values()].map(items=>items.sort((a,b)=>({'Before':0,'After':1,'':2})[a.phase]-({'Before':0,'After':1,'':2})[b.phase]));
  }
  function casePhotoLayout(items){
    const before=items.filter(p=>p.phase==='Before'),after=items.filter(p=>p.phase==='After'),unknown=items.filter(p=>!p.phase);
    const paired=Math.min(before.length,after.length),layout=[];let row=1;
    for(let i=0;i<paired;i++,row++){layout.push({photo:before[i],column:'1',row},{photo:after[i],column:'2',row});}
    for(const photo of [...before.slice(paired),...after.slice(paired),...unknown])layout.push({photo,column:'1 / -1',row:row++});
    return layout;
  }
  async function loadCasePhotos(c,version,provider){
    const target=document.getElementById('clinic-case-gallery');if(!target)return;
    try{
      let response;
      if(provider!==backendRepository)response={photos:array(c.casePhotos)};
      else {const result=await window.AppAuth.fetch('/api/clinics/'+encodeURIComponent(c.id)+'/case-photos'+(form.elements.namedItem('part')?.value?'?part='+encodeURIComponent(form.elements.namedItem('part').value):''));if(!result.ok)throw Error();response=await result.json();}
      if(version!==detailVersion)return;
      target.replaceChildren();
      const photos=array(response.photos).filter(p=>safeUrl(p.imageUrl)&&safeUrl(p.sourceUrl));
      if(!photos.length){target.append(node('p','公式サイトから表示できる症例写真を取得できませんでした。','note'));return;}
      target.append(node('p','公式サイト掲載の症例です。撮影時期・施術条件によって結果は異なります。詳細は掲載元で確認してください。','note'));
      const selected=form.elements.namedItem('part')?.value||'';
      const preferred=p=>!selected||array(p.parts).includes(selected)||selected==='二重'&&array(p.parts).includes('目元');
      const others=node('details',undefined,'clinic-case-other');others.append(node('summary','その他の部位・部位未確認の症例写真'));
      target.append(node('p','取得済み：'+photos.length+'枚'+(response.collection?.complete?'（収集完了）':response.collection?.running?'（収集中）':''),'note'));
      const groups=groupCasePhotos(photos),selectedGroups=groups.filter(items=>items.some(preferred)),otherGroups=groups.filter(items=>!items.some(preferred));
      function renderBatch(parent,entries){
        let offset=0;
        const more=button('さらに症例写真を表示',()=>appendNext(),true);
        function appendNext(){
          for(const items of entries.slice(offset,offset+10)){
            const card=node('article',undefined,'clinic-case-comparison');
            const row=node('div',undefined,'clinic-case-pair');
            for(const placement of casePhotoLayout(items)){
              const p=placement.photo;
              const figure=node('figure',undefined,'clinic-case-photo'+(placement.column==='1 / -1'?' clinic-case-single':''));
              figure.setAttribute('style','grid-column:'+placement.column+';grid-row:'+placement.row);
              if(p.phase)figure.append(node('p',p.phase,'clinic-case-phase'));
              const image=node('img');image.src=p.imageUrl;image.alt=p.title||'公式症例写真';image.loading='lazy';image.referrerPolicy='no-referrer';image.decoding='async';
              image.addEventListener('error',()=>{image.hidden=true;figure.append(node('p','写真を表示できません。掲載元をご確認ください。','note'));});
              figure.append(image,node('figcaption',p.title||'公式サイト掲載の症例写真'));row.append(figure);
            }
            card.append(row);
            if(items.some(p=>p.scope==='group'))card.append(node('p','グループ公式の症例です。この院の症例かは掲載元をご確認ください。','note'));
            const description=items.find(p=>p.description)?.description;
            if(description&&!/^(?:before|after|施?術前|施?術後)$/i.test(description.trim()))card.append(node('p',description,'note'));
            card.append(link('症例の掲載元を確認',items[0].sourceUrl));parent.append(card);
          }
          offset+=10;more.hidden=offset>=entries.length;more.textContent='さらに症例写真を表示（残り'+Math.max(0,entries.length-offset)+'件）';parent.append(more);
        }
        appendNext();
      }
      if(selectedGroups.length)renderBatch(target,selectedGroups);
      else if(selected)target.append(node('p','選択した部位の症例写真は確認できませんでした。','note'));
      if(otherGroups.length){renderBatch(others,otherGroups);target.append(others);}
    }catch{if(version===detailVersion)target.replaceChildren(node('p','症例写真を取得できませんでした。','note'));}
  }
  async function showDetail(id,provider=selectedRepository()) {
    if(!detailPanel || detailPending)return;
    detailPending=true;const version=++detailVersion,previous=detailPanel.hidden?null:detailPanel.firstChild;
    detailPanel.hidden=false;detailPanel.setAttribute('aria-busy','true');
    if(!previous)detailPanel.replaceChildren(detailControls());
    const loading=node('p','詳細を読み込み中です。');loading.setAttribute('role','status');detailPanel.append(loading);
    openDetailModal();
    try{const c=await api.fetchClinicDetail(id,provider);if(version!==detailVersion)return;detailPanel.replaceChildren(detailView(adaptClinic(c)));loadCasePhotos(c,version,provider);document.getElementById('clinic-detail-title')?.focus({preventScroll:true});}
    catch{if(version===detailVersion){loading.textContent='詳細を取得できませんでした。'+(previous?'前回の詳細を表示しています。':'');detailPanel.append(button('詳細を再取得',()=>showDetail(id,provider),true));}}
    finally{if(version===detailVersion){detailPending=false;detailPanel.setAttribute('aria-busy','false');}}
  }
  const select=form.elements.namedItem('prefecture');if(select)for(const p of prefectures){const option=node('option',p);option.value=p;select.append(option);}
  function updateClinicView(){document.body?.classList.toggle('clinic-view',window.location?.pathname?.endsWith('/clinics.html') || window.location?.hash==='#clinic-title');}
  window.addEventListener('hashchange',updateClinicView);updateClinicView();
  window.addEventListener('popstate',updateClinicView);
  // The shared navigation uses pushState, which does not emit hashchange.
  window.addEventListener('click',event=>{if(event.target?.closest?.('.common-navigation a'))updateClinicView();});
  form.addEventListener('submit',event=>{event.preventDefault();loadList(1);});
  form.elements.namedItem('dataMode')?.addEventListener('change',()=>{for(const name of ['part','budget','budgetMin','days']){const input=form.elements.namedItem(name);if(input)input.value='';}loadList(1);});
  form.addEventListener('reset',()=>{if(!clearing)setTimeout(()=>loadList(1),0);});
  api.setRegion=region=>{const area=form.elements.namedItem('area');if(area)area.value=region||'';loadList(1);};
  function readSimulationProfile(){
    const read=id=>document.getElementById(id)?.value||'';
    const profile={region:read('region-input'),budget:read('budget-select'),downtime:read('downtime-select'),clinicPriority:read('clinic-priority'),custom:{}};
    for(const key of ['style','eye','nose','face','mouth','forehead']){profile[key]=read(`${key}-select`);profile.custom[key]=read(`${key}-custom`);}
    return profile;
  }
  let automaticTimer;
  let lastSimulationPart='';
  const simulationPartMap={eye:'二重',nose:'鼻',face:'輪郭',mouth:'',forehead:''};
  api.syncFromSimulation=(changedPart='')=>{
    if(!document.getElementById('eye-select'))return;
    if(automatic){clearTimeout(automaticTimer);++listVersion;busy(false);closeDetail({restoreFocus:false});summary.textContent='入力条件を反映しています。';automaticTimer=setTimeout(()=>loadList(1),400);return;}
    const read=id=>document.getElementById(id)?.value||'';
    const profile={region:read('region-input'),budget:read('budget-select'),downtime:read('downtime-select'),clinicPriority:read('clinic-priority')};
    for(const key of Object.keys(simulationPartMap))profile[key]=read(`${key}-select`);
    if(Object.hasOwn(simulationPartMap,changedPart))lastSimulationPart=changedPart;
    const active=key=>profile[key]&&profile[key]!=='none';
    const part=active(lastSimulationPart)?lastSimulationPart:Object.keys(simulationPartMap).find(active);
    const plan=simulationConditions(profile);
    const set=(name,value)=>{const el=form.elements.namedItem(name);if(el)el.value=value;};
    set('prefecture',plan.filters.prefecture);set('area',plan.filters.keyword);
    set('budget',plan.filters.budget??'');set('days',plan.filters.days??'');
    set('budgetMin',plan.filters.budgetMin??'');
    set('hasPricing',plan.filters.hasPricing?'true':'');
    set('part',part==='eye'?(profile.eye==='wide'?'二重':'目元'):simulationPartMap[part]||'');
    set('treatment',part==='mouth'?'口':part==='forehead'?'額':'');
    const hint=document.getElementById('clinic-simulation-sync');
    if(hint)hint.textContent='シミュレーションの地域・予算帯・ダウンタイムを反映しました。希望部位は最後に変更した部位を優先します。「この条件で検索」で結果を更新できます。';
  };
  document.addEventListener?.('change',event=>{
    const id=event.target?.id||'';
    const part=Object.keys(simulationPartMap).find(key=>id===`${key}-select`||id===`${key}-custom`);
    if(part||['region-input','budget-select','downtime-select','clinic-priority'].includes(id))api.syncFromSimulation(part);
    else if(event.target?.name==='detail-option'){
      const container=event.target.closest?.('.integrated-part');
      const select=container?.querySelector('select');
      api.syncFromSimulation(select?.id.replace('-select','')||'');
    }
  });
  document.addEventListener?.('input',event=>{if(['region-input','eye-custom','nose-custom','face-custom','mouth-custom','forehead-custom'].includes(event.target?.id))api.syncFromSimulation();});
  api.syncFromSimulation();
  api.clearConditions=()=>{clearTimeout(automaticTimer);++listVersion;closeDetail({restoreFocus:false});busy(false);snapshot=null;page=1;clearing=true;form.reset();clearing=false;results.replaceChildren();pagination?.replaceChildren();if(detailPanel)detailPanel.replaceChildren();};
  let simulationVersion=0,simulationPending=false;
  const simulationPanel=document.getElementById('simulation-clinics');
  const simulationList=document.getElementById('simulation-clinic-list');
  const simulationStatus=document.getElementById('simulation-clinic-status');
  const simulationNotes=document.getElementById('simulation-clinic-notes');
  api.renderSimulationClinics=async(profile,{isCurrent=()=>true,procedureSummary}={})=>{
    if(!simulationPanel||!simulationList)return [];
    const version=++simulationVersion,owner=window.AppAuth?.uid;
    const current=()=>version===simulationVersion&&owner===window.AppAuth?.uid&&isCurrent();
    simulationPending=true;simulationPanel.hidden=false;simulationPanel.setAttribute('aria-busy','true');
    simulationStatus.textContent='条件に合う公開済みクリニックを取得中です。';
    simulationList.replaceChildren();simulationNotes.textContent='';
    try{
      const response=await api.fetchSimulationClinics(profile,procedureSummary);if(!current())return [];
      simulationStatus.textContent=response.items.length?`条件に合うクリニック候補：${response.items.length}院（最大5院）`:'条件に一致する公開済みクリニックがありません';
      simulationNotes.textContent=`重視項目：${response.priority}。掲載順はAPIの取得順です。 ${response.notes.join(' ')}`;
      for(const c of response.items){const card=node('article',undefined,'clinic-card');
        card.append(node('h4',c.name),node('p',`${c.prefecture} ${c.city}`),badge(c,{sourceUrl:c.officialUrl}),node('p',`最終確認日：${display(c.verifiedAt)}`),node('p',`条件との一致理由：${c.matchReasons.join(' / ')}`),node('p',`主な対応施術：${display(c.treatments.map(t=>t.name))}`));
        if(stale(c.verifiedAt))card.append(node('p','料金・症例情報の確認日が古いため再確認が必要です。','warning'));
        const actions=node('div',undefined,'actions');actions.append(button('詳細を見る',()=>{window.location.hash='#clinic-title';showDetail(c.id,backendRepository);}),link('公式サイトを開く',c.officialUrl));card.append(actions);simulationList.append(card);
      }return response.items;
    }catch{if(current()){simulationStatus.textContent='クリニック候補を取得できませんでした。';simulationList.replaceChildren(button('候補を再取得',()=>{if(!simulationPending&&isCurrent())api.renderSimulationClinics(profile,{isCurrent,procedureSummary});},true));}return [];
    }finally{if(current()){simulationPending=false;simulationPanel.setAttribute('aria-busy','false');}}
  };
  window.addEventListener('app-locked',()=>{api.clearConditions();++simulationVersion;simulationPending=false;simulationPanel?.setAttribute('aria-busy','false');if(simulationPanel)simulationPanel.hidden=true;simulationList?.replaceChildren();if(simulationStatus)simulationStatus.textContent='';if(simulationNotes)simulationNotes.textContent='';});
  window.addEventListener('app-authorized',()=>loadList(1));
  // Initial data is public clinic information; authentication visibility remains owned by the existing app.
  loadList(1);
})();
