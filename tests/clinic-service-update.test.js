const test=require('node:test');
const assert=require('node:assert/strict');
const {serviceUpdate}=require('../clinic-service-update');
const {matchesFilters,normalizeClinicQuery}=require('../clinic-store');
const date='2026-11-17T00:00:00.000Z';
const fresh={treatmentDetails:[{name:'二重埋没法',parts:['二重','目元'],downtimeMaxDays:7,sourceUrl:'https://clinic.example/eye',verifiedAt:date,extractionMethod:'official-service-html-v1'}],openingHours:'診療時間：10:00〜19:00',openingHoursSourceUrl:'https://clinic.example/access',checkedAt:date,pages:['https://clinic.example/'],downtimeAndRisks:[],warrantyAndAftercare:[]};
test('service updates add searchable procedures and retain unrelated clinic data',()=>{
  const old={treatments:['鼻整形'],treatmentDetails:[],tags:['既存'],doctors:[{name:'田中 一郎'}],pricing:[{treatment:'鼻整形'}],publicationStatus:'draft'};
  const {update,added}=serviceUpdate(old,fresh,date);
  assert.equal(added,1);assert.deepEqual(update.treatments,['鼻整形','二重埋没法']);
  for(const key of ['doctors','pricing','publicationStatus','verificationStatus','hasPricing'])assert.equal(Object.hasOwn(update,key),false);
  assert.equal(old.treatmentDetails.length,0);
  assert.equal(update.openingHoursSourceUrl,fresh.openingHoursSourceUrl);
  assert.equal(matchesFilters({...old,...update,publicationStatus:'published'},normalizeClinicQuery(new URLSearchParams('part=二重&days=14'))),true);
});
test('manual reviews and existing downtime values are protected',()=>{
  assert.equal(serviceUpdate({verificationStatus:'verified'},fresh,date),null);
  const prior={...fresh.treatmentDetails[0],downtimeMaxDays:30};
  const {update}=serviceUpdate({treatmentDetails:[prior]},fresh,date);
  assert.equal(update.treatmentDetails[0].downtimeMaxDays,30);
});
