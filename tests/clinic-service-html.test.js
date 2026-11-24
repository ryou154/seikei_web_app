const test=require('node:test');
const assert=require('node:assert/strict');
const {parseServicePage,treatmentName,serviceParts}=require('../clinic-service-html');
test('service labels exclude promotional text and navigation',()=>{
  for(const s of ['二重の効果とは？','二重 症例','医師の二重紹介記事','二重 10,000円','全身脱毛 ¥168,000','32歳女性/脂肪吸引','ヒアルロン酸製剤のご紹介'])assert.equal(treatmentName(s),'');
  assert.deepEqual(serviceParts('円形脱毛症'),[]);
  assert.deepEqual(serviceParts('医療脱毛'),['体']);
  const parsed=parseServicePage('<nav><a href="/nose">鼻整形</a></nav><main><h2>二重埋没法</h2><a href="/peel">ピーリング</a></main>','https://clinic.example/');
  assert.deepEqual(parsed.treatmentDetails.map(r=>r.name),['二重埋没法','ピーリング']);
});
test('group menus do not prove branch availability',()=>{
  const p=parseServicePage('<main><a href="/menu/nose">鼻整形</a><div class="clinic-treatment"><a href="/menu/eye">二重埋没法</a></div></main>','https://clinic.example/osaka/',{shared:true,branch:true});
  assert.deepEqual(p.treatmentDetails.map(r=>r.name),['二重埋没法']);
});
test('hours and explicit downtime remain bound to a procedure',()=>{
  const p=parseServicePage('<h1>二重埋没法</h1><dl><dt>ダウンタイム</dt><dd>腫れ：7〜14日</dd><dt>診療時間</dt><dd>10:00〜19:00</dd><dt>休診日</dt><dd>水曜日</dd></dl>','https://clinic.example/eye');
  assert.equal(p.treatmentDetails[0].downtimeMaxDays,14);
  assert.match(p.openingHours,/水曜日/);
  const q=parseServicePage('<h1>二重埋没法</h1><dl><dt>ダウンタイム</dt><dd>14日以上かかる場合があります</dd></dl>','https://clinic.example/eye');
  assert.equal(q.treatmentDetails[0].downtimeMaxDays,null);
});
test('timetable image labels retain the type of consultation and weekday columns',()=>{
  const html='<table><tr><th>時間</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th>土</th></tr><tr><td>14:00-18:00</td><td><img alt="一般皮膚科診療あり"></td><td><img alt="美容皮膚科診療あり"></td><td><img alt="再診のみ"></td><td>−</td><td>○</td><td>−</td></tr></table>';
  const result=parseServicePage(html,'https://clinic.example/');
  assert.match(result.openingHours,/月｜火｜水｜木｜金｜土/);
  assert.match(result.openingHours,/一般皮膚科診療あり｜美容皮膚科診療あり｜再診のみ/);
});
