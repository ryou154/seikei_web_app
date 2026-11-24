const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function section(source,name){
 const match=new RegExp(`^  (?:async )?function ${name}\\(`,'m').exec(source);if(!match)throw Error(`Function missing: ${name}`);
 const start=match.index,next=/\n  (?:async )?function \w+\(/g;next.lastIndex=start+match[0].length;const end=next.exec(source)?.index??source.indexOf('\n  window.addEventListener(',start);
 if(end<0)throw Error(`Function end missing: ${name}`);return {start,end,text:source.slice(start,end)};
}
function replaceFunction(target,source,name){const old=section(target,name),fresh=section(source,name);return target.slice(0,old.start)+fresh.text+target.slice(old.end);}
function patchBackend(source,additions){
 if(source.includes('const htmlMatch =')||source.includes("require('./clinic-html-admin')"))throw Error('HTML route already exists; rebase the overlay');
 const handler='function createClinicAdminHandler({';if(!source.includes(handler))throw Error('Admin handler signature changed');
 source=source.replace(handler,handler+'\n  extractHtml,');
 const state='  let officialSyncRunning = false;';if(!source.includes(state))throw Error('Admin update lock changed');source=source.replace(state,state+'\n  let htmlBatch = null;');
 const start=source.indexOf('function createClinicAdminStore('),ret=source.indexOf('  return {',start);if(start<0||ret<start)throw Error('Admin store signature changed');
 source=source.slice(0,ret)+source.slice(ret).replace('  return {','  return {\n    ...createHtmlSyncStore(db),');
 const field=/^    detectedData:.*$/m;if(!field.test(source))throw Error('Admin clinic projection changed');
 source=source.replace(field,line=>line+'\n    detectedHtmlData: source.detectedHtmlData || null,\n    htmlExtractionStatus: source.htmlExtractionStatus || "",\n    htmlExtractionError: source.htmlExtractionError || "",\n    officialHtmlCheckedAt: source.officialHtmlCheckedAt || "",');
 const marker='      if (extractMatch) {';if(!source.includes(marker))throw Error('Admin route layout changed');source=source.replace(marker,additions.route+'\n'+marker);
 return additions.imports+'\n'+source;
}
function patchFrontend(source,replacement){
 for(const name of ['updateNationwideClinics','extractSelectedClinic','selectClinic'])source=replaceFunction(source,replacement,name);
 for(const name of ['pollClinicExtraction','startClinicExtraction','updateOneClinic'])if(source.includes(`  async function ${name}(`)){const old=section(source,name);source=source.slice(0,old.start)+source.slice(old.end);}
 source=source.replace(/^[ \t]*let activeExtractionClinicId = "";\r?\n/m,'').replace(/^[ \t]*const pollingClinicIds = new Set\(\);\r?\n/m,'');
 source=source.replace(/ \|\| activeExtractionClinicId === currentClinicId/g,'');
 source=source.replace(/^[ \t]*if \(clinic\.officialExtractionJob\?\.status === "running"\) activeExtractionClinicId = clinic\.id;\r?\n[ \t]*else if \(activeExtractionClinicId === clinic\.id\) activeExtractionClinicId = "";\r?\n/m,'');
 source=source.replace(/^[ \t]*if \(activeExtractionClinicId === id\) void pollClinicExtraction\(id\);\r?\n/m,'');
 source=source.replace('currentDetectedData = clinic.detectedData || null;','currentDetectedData = clinic.detectedHtmlData || clinic.detectedData || null;');
 if(source.includes('/extract-official')||source.includes('/auto-publish')||source.includes('/place-preview`'))throw Error('Legacy update API call remains in frontend');
 if(source.includes('activeExtractionClinicId')||source.includes('pollClinicExtraction'))throw Error('Legacy polling references remain');
 return source;
}
function patchHtml(source){
 const panel=/<section\b[^>]*nationwide-update-panel[^>]*>[\s\S]*?<\/section>/;
 if(!panel.test(source))throw Error('Nationwide panel changed');
 const paragraphs=['登録済みの全国のクリニックを対象に、公式サイトから施術・料金・診療時間・医師情報などを取得して更新します。公開中・下書きの院を対象にします。','保存済みデータの閲覧には更新操作は不要です。公式サイトから情報を取り直したい時に、このボタンを使用します。','Gemini API・Google Places APIは使用しません。取得できない項目は既存情報を保持し、手動確認済みの情報は更新候補として保存します。'];
 source=source.replace(panel,block=>{let index=0;return block.replace(/<p([^>]*)>[\s\S]*?<\/p>/g,(all,attributes)=>/eyebrow|kicker|nationwide-update-status/.test(attributes)?all:index<paragraphs.length?`<p${attributes}>${paragraphs[index++]}</p>`:all);});
 return source.replace('Google候補名（一時表示）','登録済みのクリニック');
}
function apply(){
 const overlay=process.argv[2]||'/overlay',app=process.argv[3]||'/app',config=JSON.parse(fs.readFileSync(path.join(overlay,'manifest.json'),'utf8'));
 const backend=fs.readFileSync(path.join(app,'clinic-admin.js'),'utf8'),frontend=fs.readFileSync(path.join(app,'admin-clinics.js'),'utf8');
 if(hash(frontend)!==config.publicJsSha256)throw Error('Base image does not match the inspected public JavaScript');
 const candidates=['admin-clinics.html','admin/clinics.html'].filter(file=>fs.existsSync(path.join(app,file)));
 const htmlPath=candidates.find(file=>hash(fs.readFileSync(path.join(app,file)))===config.publicHtmlSha256);if(!htmlPath)throw Error('Base image does not match the inspected public HTML');
 const result=path.join(overlay,'result');fs.mkdirSync(result,{recursive:true});
 const updates={'clinic-admin.js':patchBackend(backend,config), 'admin-clinics.js':patchFrontend(frontend,fs.readFileSync(path.join(overlay,'replacement-admin-clinics.js'),'utf8'))};
 const html=patchHtml(fs.readFileSync(path.join(app,htmlPath),'utf8'));for(const file of candidates)updates[file]=html;
 for(const [file,content]of Object.entries(updates)){fs.mkdirSync(path.dirname(path.join(result,file)),{recursive:true});fs.writeFileSync(path.join(result,file),content);fs.writeFileSync(path.join(app,file),content);}
 console.log('Patched clinic update endpoints and public controls; other application modules retained');
}
if(require.main===module)apply();
module.exports={patchBackend,patchFrontend,patchHtml,section};
