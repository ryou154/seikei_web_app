const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {authorize:defaultAuthorize}=require('./auth-server');
const engine=require('./face-reconstruction-engine');
const fail=(status,message)=>Object.assign(Error(message),{status});
function jpegSize(bytes){
 if(bytes[0]!==255||bytes[1]!==216)throw fail(400,'JPEG写真を使用してください。');
 let i=2;
 while(i+8<bytes.length){if(bytes[i++]!==255)continue;let marker=bytes[i++];while(marker===255)marker=bytes[i++];if(marker===217||marker===218)break;if(marker===0||marker===216||marker>=208&&marker<=215)continue;const length=bytes.readUInt16BE(i);if(length<2||i+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};i+=length;}
 throw fail(400,'JPEGのサイズを取得できません。');
}
function dataURL(value,type,maxBytes){
 const prefix=`data:image/${type};base64,`;
 if(typeof value!=='string'||!value.startsWith(prefix)||value.length>maxBytes*1.4||!/^[A-Za-z0-9+/]+={0,2}$/.test(value.slice(prefix.length)))throw fail(400,'写真または人物マスクの形式が不正です。');
 const bytes=Buffer.from(value.slice(prefix.length),'base64');if(bytes.length>maxBytes)throw fail(413,'画像が大きすぎます。');return bytes;
}
function validateCapture(payload){
 if(payload?.captureMode!=='stationary-subject')throw fail(400,'本人を動かさず、カメラを移動して撮影してください。');
 if(!Array.isArray(payload.frames)||payload.frames.length<24||payload.frames.length>80)throw fail(400,'角度が少しずつ異なる写真を24〜80枚撮影してください。');
 let total=0,dimensions;const hashes=new Set();
 const frames=payload.frames.map(frame=>{
  const image=dataURL(frame.image,'jpeg',2*1024*1024),mask=dataURL(frame.mask,'png',1024*1024),size=jpegSize(image);
  if(size.width<480||size.height<480||size.width>2400||size.height>2400)throw fail(400,'写真の幅と高さは480〜2400pxにしてください。');
  if(dimensions&&(dimensions.width!==size.width||dimensions.height!==size.height))throw fail(400,'全写真を同じサイズで撮影してください。');dimensions=size;
  if(mask.length<24||mask.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||mask.readUInt32BE(16)!==size.width||mask.readUInt32BE(20)!==size.height)throw fail(400,'写真と人物マスクのサイズが一致しません。');
  total+=image.length+mask.length;if(total>64*1024*1024)throw fail(413,'撮影データは合計64MB以内にしてください。');hashes.add(crypto.createHash('sha256').update(image).digest('hex'));return {image,mask};
 });
 if(hashes.size<24)throw fail(400,'同じ写真の重複があります。角度を変えて撮影してください。');return frames;
}
async function readBody(request){const chunks=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>96*1024*1024)throw fail(413,'撮影データが大きすぎます。');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fail(400,'撮影データを読み込めません。');}}
function createReconstructionHandler({authorize=defaultAuthorize,root=path.join(__dirname,'.face-reconstruction'),executables=engine.engines(),isAvailable=()=>engine.available(executables),reconstruct=engine.reconstruct,ttl=2*60*60*1000}={}){
 const jobs=new Map();root=path.resolve(root);
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
 const directory=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw fail(404,'復元データが見つかりません。');const dest=path.resolve(root,id);if(!dest.startsWith(root+path.sep))throw fail(400,'不正な保存先です。');return dest;};
 const remove=async id=>fs.rm(directory(id),{recursive:true,force:true,maxRetries:5,retryDelay:100});
 const state=job=>({id:job.id,status:job.status,stage:job.stage,error:job.error||null,expiresAt:new Date(job.created+ttl).toISOString()});
 async function run(job){
  const work=path.join(directory(job.id),'work');
  try{job.status='running';const glb=await reconstruct(work,{executables,signal:job.controller.signal,onProgress:stage=>job.stage=stage});job.controller.signal.throwIfAborted();await fs.writeFile(path.join(directory(job.id),'model.glb'),glb);job.status='completed';job.stage='写真からの復元が完了しました。見えなかった部分は復元されません。';}
  catch(error){if(job.controller.signal.aborted)return;job.status='failed';job.stage='復元できませんでした';job.error='写真の重なり・明るさ・ピントを確認し、本人を動かさずに再撮影してください。';}
  finally{await fs.rm(work,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});}
 }
 async function sweep(){
  for(const job of jobs.values())if(Date.now()-job.created>ttl){job.controller.abort();await job.promise?.catch(()=>{});jobs.delete(job.id);await remove(job.id).catch(()=>{});}
  try{for(const entry of await fs.readdir(root,{withFileTypes:true})){if(!entry.isDirectory()||!/^[a-f0-9-]{36}$/.test(entry.name)||jobs.has(entry.name))continue;const stat=await fs.stat(directory(entry.name));if(Date.now()-stat.mtimeMs>ttl)await remove(entry.name);}}catch{}
 }
 const timer=setInterval(()=>void sweep(),60000);timer.unref();void sweep();
 async function handle(request,response){
  try{
   const user=await authorize(request),url=new URL(request.url,'http://localhost'),base='/api/face-reconstruction';
   if(url.pathname===`${base}/capabilities`&&request.method==='GET')return json(response,200,{enabled:await isAvailable(),engine:'COLMAP 4.2.1 / OpenMVS 2.4.0',captureMode:'stationary-subject',minFrames:24,maxFrames:80});
   if(url.pathname===base&&request.method==='POST'){
    if(!await isAvailable())throw fail(503,'写真復元エンジンが未設定です。撮影データは保存せず、処理を開始していません。');
    const active=[...jobs.values()].filter(j=>j.status==='running'||j.status==='preparing');
    if(active.some(j=>j.uid===user.uid)||active.length>=1)throw fail(409,'別の復元処理が実行中です。完了後に再試行してください。');
    // Reserve before reading a large body to prevent concurrent uploads bypassing the limit.
    const id=crypto.randomUUID(),job={id,uid:user.uid,status:'preparing',stage:'撮影データを準備',created:Date.now(),controller:new AbortController()};jobs.set(id,job);
    try{const frames=validateCapture(await readBody(request)),work=path.join(directory(id),'work');await fs.mkdir(path.join(work,'images'),{recursive:true});await fs.mkdir(path.join(work,'masks'),{recursive:true});for(let i=0;i<frames.length;i++){const name=`frame-${String(i).padStart(4,'0')}.jpg`;await fs.writeFile(path.join(work,'images',name),frames[i].image);await fs.writeFile(path.join(work,'masks',`${name}.png`),frames[i].mask);}job.promise=run(job);json(response,202,state(job));}
    catch(error){jobs.delete(id);await remove(id).catch(()=>{});throw error;}return;
   }
   const match=url.pathname.match(/^\/api\/face-reconstruction\/([a-f0-9-]{36})(\/model)?$/);
   if(!match)throw fail(404,'復元データが見つかりません。');
   const job=jobs.get(match[1]);if(!job||job.uid!==user.uid)throw fail(404,'復元データが見つかりません。');
   if(request.method==='DELETE'&&!match[2]){job.controller.abort();await job.promise?.catch(()=>{});jobs.delete(job.id);await remove(job.id);return json(response,200,{deleted:true});}
   if(request.method!=='GET')throw fail(405,'利用できない操作です。');
   if(!match[2])return json(response,200,state(job));
   if(job.status!=='completed')throw fail(409,'復元が完了していません。');
   const bytes=await fs.readFile(path.join(directory(job.id),'model.glb'));response.writeHead(200,{'Content-Type':'model/gltf-binary','Cache-Control':'no-store','Content-Disposition':'attachment; filename="photo-reconstruction.glb"','X-Content-Type-Options':'nosniff'});response.end(bytes);
  }catch(error){json(response,error.status||500,{error:error.status?error.message:'復元処理を開始できませんでした。'});}
 }
 handle.close=async()=>{clearInterval(timer);for(const job of jobs.values())job.controller.abort();await Promise.allSettled([...jobs.values()].map(j=>j.promise));};handle.sweep=sweep;return handle;
}
module.exports={createReconstructionHandler,validateCapture,jpegSize};
