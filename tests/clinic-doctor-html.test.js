const test=require('node:test');
const assert=require('node:assert/strict');
const {personName,parseDoctors}=require('../clinic-doctor-html');
test('doctor names reject role headings, locations and incomplete surnames',()=>{
  for(const text of ['幼少時代','大学時代','交通案内','日記 新着','資 格','趣 味','特 技','解剖実習','津田攝子 ポリシー','山口初導入','新規導入','兼 総','就任','大阪院','院長紹介','脇谷','会 認定産業医','鼻整形技術指導医'])assert.equal(personName(text,{explicit:true}),'');
  assert.equal(personName('院長 川端 久雅'),'川端 久雅');
});
test('doctor qualifications remain within each profile and exclude navigation',()=>{
  const html='<title>院長・医師紹介</title><nav><p>院長 山田 太郎</p></nav><main><h2>田中 一郎</h2><h3>資格</h3><p>日本形成外科学会専門医</p><h2>佐藤 花子</h2><h3>所属学会</h3><p>日本皮膚科学会</p></main>';
  const doctors=parseDoctors(html,'https://clinic.example/doctor/').doctors;
  assert.equal(doctors.length,2);
  assert.deepEqual(doctors[0].qualifications,['日本形成外科学会専門医']);
  assert.deepEqual(doctors[1].qualifications,[]);
  assert.deepEqual(doctors[1].memberships,['日本皮膚科学会']);
});
