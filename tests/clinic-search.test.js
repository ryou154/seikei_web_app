const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = { window: {}, document: {getElementById: () => null} };
vm.createContext(context);
for (const file of ['data/clinics.js','data/clinic-details.js','clinic-search.js']) vm.runInContext(fs.readFileSync(file,'utf8'),context);
const {CLINIC_DATA: data, ClinicSearch: {search, stale}} = context.window;
const defaults = {area:'',part:'',budget:null,days:null};
test('reference procedure labels follow the selected body part without entering supported procedures', () => {
  const clinic = { prefecture: '愛知県', treatments: [], referenceTreatmentDetails: [{ name: '二重埋没法', parts: ['二重'] }, { name: '鼻整形', parts: ['鼻'] }] };
  assert.equal(context.window.ClinicSearch.referenceTreatmentNames(clinic, {part:'二重'}).join(), '二重埋没法');
  assert.equal(context.window.ClinicSearch.visibleTreatmentNames(clinic).length, 0);
});
test('all four filters apply to the same treatment without geographic fallback', () => {
  assert.equal(search(data, defaults).length, 3);
  assert.equal(search(data, {...defaults,area:'東京',part:'二重',budget:68000,days:14})[0].clinic.id, 'shinagawa-shinjuku');
  for (const change of [{area:'沖縄'}, {part:'鼻'}, {budget:67999}, {days:7}, {budget:0}]) assert.equal(search(data,{...defaults,...change}).length,0);
  assert.equal(search(data,{...defaults,area:' 大阪 '}).length,1);
  const fixture = [{areas:['東京'], treatments:[{parts:['鼻'],pricing:[{amount:100}],downtime:{maxDays:30}},{parts:['目元'],pricing:[{amount:10}],downtime:{maxDays:1}}]}];
  assert.equal(search(fixture,{area:'東京',part:'鼻',budget:20,days:7}).length,0);
  fixture[0].treatments[0].pricing[0].amount = null;
  fixture[0].treatments[0].downtime.maxDays = null;
  assert.equal(search(fixture,{area:'東京',part:'鼻',budget:100,days:30}).length,0);
});
test('every published clinic, doctor, treatment price and case has dated official evidence', () => {
  for (const c of data) {
    assert.ok(c.sourceUrl.startsWith('https://www.shinagawa.com/'));
    assert.match(c.lastVerified,/^\d{4}-\d{2}-\d{2}$/);
    for (const s of [...c.sources,...c.doctors,...c.treatments.flatMap(t=>t.pricing),c.officialCases]) {
      assert.ok(s.url || s.sourceUrl); assert.equal(s.lastVerified,c.lastVerified);
    }
    assert.equal(c.officialCases.count,null); assert.equal(c.officialCases.period,null);
  }
});
test('old, missing and future verification dates trigger warnings', () => {
  const today = new Date('2026-10-09T12:00:00Z');
  assert.equal(stale('2026-10-09',today),false);
  for (const date of ['2026-01-01',undefined,'invalid','2027-01-01']) assert.equal(stale(date,today),true);
});
