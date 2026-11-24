const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {patchFrontend,patchHtml}=require('./patch-live-clinic-html');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function main(){
 const root=path.resolve(__dirname,'..'),target=path.join(root,'data/clinic-html-report-deploy/overlay'),runtime=JSON.parse(await fs.readFile(path.join(root,'data/clinic-html-report-deploy/runtime.json'),'utf8'));
 if(!runtime.image?.includes('@sha256:'))throw Error('A pinned production image is required');
 const base='https://seikei-web-app-688786456161.asia-northeast1.run.app';
 const fetchText=async file=>{const r=await fetch(base+file);if(!r.ok)throw Error(`Public asset ${r.status}`);return r.text();};
 const [js,html,replacement,backend]=await Promise.all([fetchText('/admin-clinics.js'),fetchText('/admin/clinics.html'),fs.readFile(path.join(root,'admin-clinics.js'),'utf8'),fs.readFile(path.join(root,'clinic-admin.js'),'utf8')]);
 const start=backend.indexOf('      const htmlMatch ='),end=backend.indexOf('      if (extractMatch) {',start);if(start<0||end<start)throw Error('HTML route not found');
 const manifest={...runtime,publicJsSha256:hash(js),publicHtmlSha256:hash(html),route:backend.slice(start,end),imports:backend.split('\n').slice(0,3).join('\n'),sourceFiles:[]};
 patchFrontend(js,replacement);patchHtml(html);
 const files=['clinic-html-sync.js','clinic-media-extract.js','clinic-information-sync.js','clinic-service-html.js','clinic-service-update.js','clinic-service-retry.js','clinic-doctor-html.js','clinic-html-downtime.js','clinic-html-admin.js','data/clinic-html-sites.json','scripts/sync-clinic-html.js'];
 await fs.mkdir(path.join(target,'new'),{recursive:true});
 for(const file of files){let contents=await fs.readFile(path.join(root,file));if(file==='clinic-html-sync.js')contents=Buffer.from(contents.toString().replace("require('./treatment-parts')","require('./clinic-html-parts')"));await fs.mkdir(path.dirname(path.join(target,'new',file)),{recursive:true});await fs.writeFile(path.join(target,'new',file),contents);manifest.sourceFiles.push({file,sha256:hash(contents),bytes:contents.length});}
 const parts=await fs.readFile(path.join(root,'treatment-parts.js'));await fs.writeFile(path.join(target,'new/clinic-html-parts.js'),parts);manifest.sourceFiles.push({file:'clinic-html-parts.js',sha256:hash(parts),bytes:parts.length});
 await fs.writeFile(path.join(target,'replacement-admin-clinics.js'),replacement);await fs.copyFile(path.join(__dirname,'patch-live-clinic-html.js'),path.join(target,'patch-live-clinic-html.js'));await fs.writeFile(path.join(target,'manifest.json'),JSON.stringify(manifest,null,2));
 const dependencies={name:'clinic-html-runtime',version:'1.0.0',private:true,dependencies:{cheerio:'1.2.0','robots-parser':'3.0.1','pdfjs-dist':'6.5.438','@napi-rs/canvas':'1.1.0','tesseract.js':'7.0.0'}};
 await fs.writeFile(path.join(target,'package.json'),JSON.stringify(dependencies,null,2));
 const docker=`FROM node:22-slim AS dependencies\nWORKDIR /opt/clinic-html-runtime\nCOPY package.json ./\nRUN npm install --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false\nFROM ${runtime.image} AS patched\nUSER root\nCOPY --from=dependencies /opt/clinic-html-runtime /opt/clinic-html-runtime\nENV NODE_PATH=/opt/clinic-html-runtime/node_modules:/app/node_modules:/usr/local/lib/node_modules\nCOPY new/ /app/\nCOPY manifest.json replacement-admin-clinics.js patch-live-clinic-html.js /overlay/\nWORKDIR /app\nRUN node /overlay/patch-live-clinic-html.js && node --check clinic-admin.js && node --check admin-clinics.js && node -e "if(typeof require('./clinic-admin').createClinicAdminHandler!=='function')throw Error('handler missing'); require('./clinic-information-sync'); console.log('HTML updater module loading verified');"\nFROM ${runtime.image}\nCOPY --from=dependencies /opt/clinic-html-runtime /opt/clinic-html-runtime\nENV NODE_PATH=/opt/clinic-html-runtime/node_modules:/app/node_modules:/usr/local/lib/node_modules\nCOPY new/ /app/\nCOPY --from=patched /overlay/result/ /app/\n`;
 await fs.writeFile(path.join(target,'Dockerfile'),docker);await fs.writeFile(path.join(target,'.dockerignore'),'.env\n.env.*\n.git\n');
 console.log(JSON.stringify({directory:target,baseRevision:runtime.revision,baseImage:runtime.image,frontendValidated:true,preservesRuntimeUser:true,containsSecrets:false,productionChanged:false}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
