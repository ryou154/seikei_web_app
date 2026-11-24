const test=require('node:test');
const assert=require('node:assert/strict');
const {parseRetryPage}=require('../clinic-service-retry');
test('clinic-specific hours exclude other Eminal branch cards',()=>{
  const html='<dl class="c-datalist__list"><dt>診療時間</dt><dd>10:30〜20:30</dd></dl><dl class="c-datalist__list"><dt>定休日</dt><dd>不定休</dd></dl><div class="p-clinic__clinic-card"><dl><dt>診療時間</dt><dd>11:00〜21:00</dd></dl></div>';
  const p=parseRetryPage(html,'https://eminal-clinic.jp/clinic/wakayama/c_wakayama/',{prefecture:'和歌山県'});
  assert.equal(p.openingHours,'診療時間：10:30〜20:30／定休日：不定休');
});
test('div-based clinic facts are supported without using group-wide navigation',()=>{
  const p=parseRetryPage('<nav><a href="/menu/eye">二重埋没法</a></nav><div class="row"><div class="th">診療時間</div><div class="td">10：00～19：00（最終受付18：10まで）</div></div>','https://www.lula-beauty.jp/clinic/sendai',{});
  assert.match(p.openingHours,/最終受付18:10/);assert.deepEqual(p.treatmentDetails,[]);
});
test('an unconfirmed branch cannot inherit root clinic information',()=>{
  const p=parseRetryPage('<div>群馬県高崎市<dl><dt>開院時間</dt><dd>9:00〜20:00</dd></dl></div>','https://eterna-clinic.com/',{prefecture:'富山県'});
  assert.equal(p.openingHours,'');assert.equal(p.errors.length,1);
});
test('TCB clinic hours retain counseling restrictions and exclude group footer defaults',()=>{
 const html='<dl class="clinic_info"><dt>診療時間</dt><dd>9:00〜19:00 ※9:00〜10:00はカウンセリングのみ 不定休</dd></dl><footer><p>診療時間10:00〜19:00 ※一部クリニックは異なります</p></footer>';
 const p=parseRetryPage(html,'https://aoki-tsuyoshi.com/clinic/saga',{});
 assert.match(p.openingHours,/9:00[~〜]19:00/);assert.match(p.openingHours,/カウンセリングのみ/);assert.doesNotMatch(p.openingHours,/一部クリニック/);
});
