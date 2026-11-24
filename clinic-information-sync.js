const {createHash}=require('node:crypto');
const {htmlExtractionUpdate,sameOriginLink}=require('./clinic-html-sync');
const {parseRetryPage,chainHost}=require('./clinic-service-retry');
const {treatmentName,serviceParts}=require('./clinic-service-html');
const {parseDoctors,personName,normalize}=require('./clinic-doctor-html');
const {serviceUpdate}=require('./clinic-service-update');

function createClinicInformationExtractor({read}){
  return async ({clinic,sourceOfficialUrl,sharedDomain=true})=>{
    const result=await read({sourceOfficialUrl,sharedDomain});
    const extraction=result.extraction;
    const info={treatmentDetails:[],openingHours:'',openingHoursSourceUrl:'',doctors:[],downtimeAndRisks:[],warrantyAndAftercare:[],pages:[],errors:[],checkedAt:new Date().toISOString()};
    const visited=new Set();let homeDoctors=null;let branchUrl=sourceOfficialUrl;
    const shared=chainHost(new URL(sourceOfficialUrl).hostname);
    const append=async(url,{doctor=false,detailName=''}={})=>{
      if(visited.has(url))return null;visited.add(url);
      try{
        const page=await read.readPage(url,{parse:false});const source=page.sourceUrl||url;
        info.pages.push(source);
        const parsed=parseRetryPage(page.html,source,clinic||{});
        for(const error of parsed.errors)info.errors.push({url:source,error});
        if(parsed.errors.length)return null;
        if(parsed.openingHours&&!info.openingHours){info.openingHours=parsed.openingHours;info.openingHoursSourceUrl=source;}
        if(!doctor){
          for(const t of parsed.treatmentDetails){const name=treatmentName(t.name);if(!name||info.treatmentDetails.some(d=>d.name===name))continue;
            // Numeric downtime is accepted only from one explicit, procedure-bound section.
            const risks=parsed.downtimeAndRisks.filter(r=>r.treatment===t.name&&/^ダウンタイム[：:]?$/.test(r.title));
            const safe=risks.length===1&&!/抜糸|通院|施術回数|所要時間|(?:日|週間)以上|長引|ヶ月|か月|カ月|週間ごと|日後に|週間ほどすると/.test(risks[0].description);
            info.treatmentDetails.push({...t,name,parts:serviceParts(name),downtimeMaxDays:safe?t.downtimeMaxDays:null,verifiedAt:info.checkedAt,extractionMethod:'official-service-html-v1',verificationStatus:'automated'});
          }
          for(const field of ['downtimeAndRisks','warrantyAndAftercare']){
            const ambiguous=parsed.downtimeAndRisks.filter(r=>/^ダウンタイム[：:]?$/.test(r.title)).length>2;
            if(!ambiguous)for(const item of parsed[field])if(info[field].length<30&&!info[field].some(p=>p.treatment===item.treatment&&p.title===item.title&&p.description===item.description))info[field].push({...item,verifiedAt:info.checkedAt,extractionMethod:'official-service-html-v1'});
          }
        }
        const doctors=parseDoctors(page.html,source);
        const branchPath=new URL(branchUrl).pathname.replace(/\/$/,'');
        for(const d of doctors.doctors){
          if(!personName(d.name,{explicit:true}))continue;
          const first=homeDoctors===null;
          const scoped=!shared||first&&branchPath||homeDoctors?.has(normalize(d.name))||branchPath&&new URL(source).pathname.startsWith(branchPath+'/');
          if(!scoped)continue;
          const record={name:d.name,title:`${d.title||'公式医師紹介に掲載'}（所属・診療日は公式で要確認）`.slice(0,100),specialties:[],qualifications:[...new Set([...d.qualifications,...d.memberships.map(s=>'所属学会：'+s)])].slice(0,30),sourceUrl:d.sourceUrl,verifiedAt:info.checkedAt,verificationStatus:'automated',extractionMethod:'official-national-doctors-html-v1'};
          const prior=info.doctors.find(p=>normalize(p.name)===normalize(d.name));
          if(!prior&&info.doctors.length<100)info.doctors.push(record);
          else if(prior){prior.qualifications=[...new Set([...prior.qualifications,...record.qualifications])].slice(0,30);if(record.qualifications.length)prior.sourceUrl=record.sourceUrl;}
        }
        if(homeDoctors===null){homeDoctors=new Set(doctors.doctors.map(d=>normalize(d.name)));branchUrl=source;}
        return {services:parsed,doctors};
      }catch(e){info.errors.push({url,error:e.message});return null;}
    };
    const first=await append(sourceOfficialUrl);
    if(first){
      const branchPath=new URL(branchUrl).pathname.replace(/\/$/,'');
      const local=url=>!shared||branchPath&&new URL(url).pathname.startsWith(branchPath+'/');
      const pages=[...first.services.generalLinks,...first.services.links].filter(l=>local(l.url));
      for(const link of [...new Map(pages.map(l=>[l.url,l])).values()].slice(0,2))await append(link.url,{detailName:link.name||''});
      const doctors=[...first.doctors.links,...first.doctors.doctors.filter(d=>d.profileUrl).map(d=>({url:d.profileUrl}))];
      for(const link of [...new Map(doctors.map(l=>[l.url,l])).values()].slice(0,3)){
        // Only HTML pages; no Google, Gemini, or clinic JSON API requests.
        if(sameOriginLink(link.url,branchUrl)&&!/(?:\/api\/|\.json(?:[?#]|$))/.test(link.url))await append(link.url,{doctor:true});
      }
    }
    info.treatmentDetails=info.treatmentDetails.slice(0,250);
    extraction.information=info;
    extraction.doctors=info.doctors;
    if(info.openingHours)extraction.openingHours=info.openingHours;
    return {...result,extraction};
  };
}

function clinicInformationUpdate(existing,extraction,options={}){
  const base=htmlExtractionUpdate(existing,extraction,options);
  const info=extraction.information;
  if(!info)return base;
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['checkedAt','verifiedAt'].includes(key)).map(([key,item])=>[key,stable(item)])):value;
  const hash=createHash('sha256').update(JSON.stringify({base:base.update.officialHtmlHash,information:stable(info)})).digest('hex');
  const changed=existing.officialHtmlHash!==hash;base.update.officialHtmlHash=hash;base.changed=changed;
  const reviewed=existing.verificationStatus==='verified'||Boolean(existing.reviewedBy);
  if(!options.autoApply||reviewed)return base;
  const merged={...existing,...base.update};let applied=false;
  if(info.treatmentDetails.length||info.openingHours||info.downtimeAndRisks.length||info.warrantyAndAftercare.length){
    const saved=serviceUpdate(merged,info,options.now);if(saved){Object.assign(base.update,saved.update);applied=true;}
  }
  if(info.doctors.length){
    const doctors=[...(existing.doctors||[])];
    for(const d of info.doctors){const index=doctors.findIndex(p=>normalize(p.name)===normalize(d.name));
      if(index<0){if(doctors.length<100)doctors.push(d);}
      else if(doctors[index].verificationStatus!=='verified'&&!doctors[index].reviewedBy){const old=doctors[index];doctors[index]={...old,...d,specialties:old.specialties||[],qualifications:[...new Set([...(old.qualifications||[]),...d.qualifications])].slice(0,30),sourceUrl:d.qualifications.length?d.sourceUrl:old.sourceUrl||d.sourceUrl,sourceUrls:[...new Set([...(old.sourceUrls||[]),old.sourceUrl,d.sourceUrl].filter(Boolean))]};}
    }
    base.update.doctors=doctors;applied=true;
    const sources=[...(base.update.sources||existing.sources||[])];for(const d of info.doctors)if(!sources.some(s=>s.url===d.sourceUrl))sources.push({url:d.sourceUrl,type:'official-national-doctors-html-v1',verifiedAt:info.checkedAt});base.update.sources=sources;
  }
  if(applied){base.autoApplied=true;base.update.htmlExtractionStatus=info.errors.length?'partially_applied':'applied';}
  return base;
}
module.exports={createClinicInformationExtractor,clinicInformationUpdate};
