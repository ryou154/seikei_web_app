const method='official-service-html-v1';
function serviceUpdate(old,c,now=new Date().toISOString()){
  if(old.verificationStatus==='verified'||old.reviewedBy)return null;
  const details=[...(old.treatmentDetails||[])],treatments=[...(old.treatments||[])];let added=0,enriched=0;
  for(const t of c.treatmentDetails){
    const index=details.findIndex(d=>d.name===t.name);
    if(index<0){if(details.length>=500||(!treatments.includes(t.name)&&treatments.length>=500))continue;details.push(t);added++;}
    else{
      const prior=details[index];
      const owned=/^official-/.test(prior.extractionMethod||'');
      if(owned&&prior.verificationStatus!=='verified'&&!prior.reviewedBy){
        const parts=[...new Set([...(prior.parts||[]),...t.parts])];
        const days=prior.downtimeMaxDays===null||prior.downtimeMaxDays===undefined?t.downtimeMaxDays:prior.downtimeMaxDays;
        if(parts.length!==(prior.parts||[]).length||days!==(prior.downtimeMaxDays??null)){
          details[index]={...prior,parts,downtimeMaxDays:days,sourceUrl:days!==prior.downtimeMaxDays?t.sourceUrl:prior.sourceUrl,verifiedAt:t.verifiedAt};enriched++;
        }
      }
    }
    if(!treatments.includes(t.name)&&treatments.length<500)treatments.push(t.name);
  }
  const tags=[...(old.tags||[])];for(const tag of c.treatmentDetails.flatMap(d=>d.parts))if(!tags.includes(tag)&&tags.length<100)tags.push(tag);
  const update={treatments,treatmentDetails:details,tags,updatedAt:now,serviceInformationReview:{checkedAt:now,method,sourcePages:c.pages,notes:'公式サイトから自動取得。施術・条件・診療時間の最新情報は公式サイトで確認してください。'}};
  if(c.openingHours){update.openingHours=c.openingHours;update.openingHoursVerifiedAt=c.checkedAt;update.openingHoursSourceUrl=c.openingHoursSourceUrl||c.pages[0];}
  for(const field of ['downtimeAndRisks','warrantyAndAftercare']){
    const information=[...(old[field]||[])];
    for(const item of c[field])if(information.length<50&&!information.some(i=>i.treatment===item.treatment&&i.title===item.title&&i.description===item.description))information.push(item);
    if(c[field].length)update[field]=information;
  }
  const sources=[...(old.sources||[])];
  for(const url of new Set([...c.treatmentDetails.map(d=>d.sourceUrl),...(c.openingHours?[c.openingHoursSourceUrl||c.pages[0]]:[]),...c.downtimeAndRisks.map(i=>i.sourceUrl),...c.warrantyAndAftercare.map(i=>i.sourceUrl)]))if(!sources.some(s=>s.url===url))sources.push({url,type:method,verifiedAt:c.checkedAt});
  update.sources=sources;
  return {update,added,enriched};
}
module.exports={serviceUpdate};
