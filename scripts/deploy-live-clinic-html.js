const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {GoogleAuth}=require('google-auth-library');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'data/clinic-html-report-deploy');
const json=async filename=>JSON.parse(await fs.readFile(path.join(directory,filename),'utf8'));
const write=async(filename,value)=>fs.writeFile(path.join(directory,filename),JSON.stringify(value,null,2));
async function main(){
 const mode=process.argv[2];if(!['--build','--status','--deploy','--operation'].includes(mode))throw Error('Use --build, --status, --deploy, or --operation');
 const runtime=await json('runtime.json'),client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']}).getClient();
 const api=async(url,options={})=>(await client.request({url,...options})).data;
 const buildBase=`https://cloudbuild.googleapis.com/v1/projects/${runtime.project}/locations/${runtime.location}/builds`;
 if(mode==='--build'){
  const manifest=await json('overlay/manifest.json'),overlay=path.join(directory,'overlay');
  if(manifest.image!==runtime.image||manifest.revision!==runtime.revision)throw Error('Overlay base metadata changed');
  for(const file of manifest.sourceFiles){const bytes=await fs.readFile(path.join(overlay,'new',file.file));if(crypto.createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('Prepared source hash mismatch');}
  const files=['Dockerfile','package.json','manifest.json','replacement-admin-clinics.js','patch-live-clinic-html.js',...manifest.sourceFiles.map(f=>'new/'+f.file)];
  const archive=path.join(directory,'source.tgz');execFileSync(process.platform==='win32'?'tar.exe':'tar',['-czf',archive,'-C',overlay,...files],{stdio:'pipe'});
  const bucket=`run-sources-${runtime.project}-${runtime.location}`,object=`clinic-html-update/overlay-${Date.now()}.tgz`;
  await api(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(object)}`,{method:'POST',headers:{'Content-Type':'application/gzip'},data:await fs.readFile(archive)});
  const image=runtime.image.split('@')[0]+`:clinic-html-no-gemini-${Date.now()}`;
  const operation=await api(buildBase+`?projectId=${runtime.project}`,{method:'POST',data:{source:{storageSource:{bucket,object}},steps:[{name:'gcr.io/cloud-builders/docker',args:['build','-t',image,'.']}],images:[image],timeout:'1200s',options:{logging:'CLOUD_LOGGING_ONLY'}}});
  const id=operation.metadata?.build?.id;if(!id)throw Error('Build ID not returned');await write('build.json',{id,image,baseRevision:runtime.revision,operation:operation.name});console.log(JSON.stringify({buildId:id,image,status:operation.metadata.build.status,productionChanged:false}));return;
 }
 if(mode==='--status'){
  const build=await json('build.json'),current=await api(`${buildBase}/${build.id}`);
  const result={id:current.id,status:current.status,steps:current.steps?.map((s,index)=>({index,status:s.status})),failure:current.failureInfo?.detail||null,image:build.image,digest:current.results?.images?.[0]?.digest};
  if(result.status==='SUCCESS')await write('built-image.json',{...build,digest:result.digest});console.log(JSON.stringify(result));return;
 }
 if(mode==='--deploy'){
  const built=await json('built-image.json');if(!built.digest?.startsWith('sha256:'))throw Error('A successful pinned build is required');
  const service=await api(`https://run.googleapis.com/v2/${runtime.name}`);
  if(service.latestReadyRevision.split('/').pop()!==runtime.revision||service.etag!==runtime.etag)throw Error('Production changed since preparation; do not overwrite it');
  const active=service.traffic?.filter(t=>t.percent>0)||[];if(active.length!==1||active[0].percent!==100||active[0].tag)throw Error('Nonstandard traffic allocation requires separate review');
  const containers=structuredClone(service.template.containers);if(containers.length!==1)throw Error('Unexpected multi-container service');
  containers[0].image=built.image.split(':clinic-html-no-gemini-')[0]+'@'+built.digest;
  const traffic=service.traffic.map(t=>t.percent===100?{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',percent:100}:t);
  const operation=await api(`https://run.googleapis.com/v2/${runtime.name}?updateMask=template.containers,traffic`,{method:'PATCH',data:{name:runtime.name,etag:service.etag,template:{containers},traffic}});
  await write('operation.json',{name:operation.name,image:containers[0].image,baseRevision:runtime.revision});console.log(JSON.stringify({operation:operation.name,done:operation.done||false,service:runtime.service,mainBranchChanged:false}));return;
 }
 const operation=await json('operation.json'),result=await api(`https://run.googleapis.com/v2/${operation.name}`);console.log(JSON.stringify({done:result.done||false,error:result.error?.message||null,revision:result.response?.latestReadyRevision?.split('/').pop(),uri:result.response?.uri}));
}
main().catch(error=>{console.error(JSON.stringify({message:error.response?'Cloud API request failed':error.message,status:error.response?.status,reason:error.response?.data?.error?.message?.slice(0,350)}));process.exitCode=1;});
