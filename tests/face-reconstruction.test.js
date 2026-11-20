const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {createReconstructionHandler,validateCapture}=require('../face-reconstruction');
const {objToGLB}=require('../face-reconstruction-glb');
const {reconstruct}=require('../face-reconstruction-engine');
const fixture=()=>{const jpeg=Buffer.from('ffd8ffc000110801e0028003011100021101031100ffd9','hex'),mask=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(mask);mask.writeUInt32BE(640,16);mask.writeUInt32BE(480,20);return {captureMode:'stationary-subject',frames:Array.from({length:24},(_,i)=>({image:'data:image/jpeg;base64,'+Buffer.concat([jpeg,Buffer.from([i])]).toString('base64'),mask:'data:image/png;base64,'+mask.toString('base64')}))};};
async function temp(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'photo-reconstruction-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
async function server(t,options){const handler=createReconstructionHandler(options),s=http.createServer(handler);await new Promise(resolve=>s.listen(0,'127.0.0.1',resolve));t.after(async()=>{await handler.close();await new Promise(resolve=>s.close(resolve));});return {url:`http://127.0.0.1:${s.address().port}`,handler};}
test('photo restoration rejects head rotation mode, duplicate photos and masks of a different size',()=>{
 assert.equal(validateCapture(fixture()).length,24);const input=fixture();input.captureMode='moving-head';assert.throws(()=>validateCapture(input),/本人を動かさず/);const duplicate=fixture();duplicate.frames.fill(duplicate.frames[0]);assert.throws(()=>validateCapture(duplicate),/重複/);const wrong=fixture();wrong.frames[0].mask='data:image/png;base64,'+Buffer.alloc(30).toString('base64');assert.throws(()=>validateCapture(wrong),/サイズ/);
});
test('textured OBJ becomes a self-contained GLB with no template additions',async t=>{
 const dir=await temp(t);await fs.writeFile(path.join(dir,'mesh.obj'),'v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n');const bytes=await objToGLB(path.join(dir,'mesh.obj'),{cameraPose:[1,0,0,0,0,0,0]});assert.equal(bytes.readUInt32LE(0),0x46546c67);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.equal(json.asset.extras.templatePartsAdded,false);assert.equal(json.accessors[0].count,3);assert.equal(json.nodes[0].matrix[5],-1);const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const array=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);const parsed=await new Promise((resolve,reject)=>new GLTFLoader().parse(array,'',resolve,reject));assert.ok(parsed.scene.children.length);
});
test('OBJ texture and material references cannot escape the private work folder',async t=>{const dir=await temp(t);await fs.writeFile(path.join(dir,'mesh.obj'),'mtllib ../secret.mtl\nv 0 0 0\nf 1 1 1');await assert.rejects(objToGLB(path.join(dir,'mesh.obj')),/不正な参照/);});
test('real reconstruction stages are ordered and missing sparse geometry fails rather than adding a template',async t=>{
 const dir=await temp(t),calls=[];await assert.rejects(reconstruct(dir,{executables:{colmap:'colmap'},run:async(exe,args)=>calls.push(args[0])}),/撮影位置を復元できません/);assert.deepEqual(calls,['feature_extractor','exhaustive_matcher','mapper']);
});
test('complete engine adapter converts the native textured mesh and uses the first registered camera',async t=>{
 const dir=await temp(t),calls=[],executables={colmap:'colmap',interface:'interface',dense:'dense',mesh:'mesh',texture:'texture'};
 const bytes=await reconstruct(dir,{executables,run:async(exe,args)=>{
  calls.push(exe==='colmap'?args[0]:exe);
  if(args[0]==='mapper'){await fs.mkdir(path.join(dir,'sparse/0'),{recursive:true});await fs.writeFile(path.join(dir,'sparse/0/images.bin'),'registered');}
  if(args[0]==='model_converter'){await fs.mkdir(path.join(dir,'undistorted/sparse'),{recursive:true});await fs.writeFile(path.join(dir,'undistorted/sparse/images.txt'),'1 1 0 0 0 0 0 0 1 frame-0000.jpg\n');}
  if(exe==='texture'){
   assert.equal(args[1],path.join(dir,'cloud.mvs'));
   assert.equal(args[args.indexOf('--mesh-file')+1],path.join(dir,'mesh.ply'));
   await fs.writeFile(path.join(dir,'textured.obj'),'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');
  }
 }});
 assert.deepEqual(calls,['feature_extractor','exhaustive_matcher','mapper','image_undistorter','model_converter','interface','dense','mesh','texture']);assert.equal(bytes.readUInt32LE(0),0x46546c67);const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());assert.equal(json.nodes[0].matrix[10],-1);
});
test('authentication is required and unconfigured engines refuse uploads',async t=>{
 const root=await temp(t),api=await server(t,{root,isAvailable:async()=>false,authorize:async req=>{if(req.headers.authorization!=='Bearer owner')throw Object.assign(Error('ログインしてください。'),{status:401});return {uid:'owner'};}});
 assert.equal((await fetch(api.url+'/api/face-reconstruction/capabilities')).status,401);
 assert.equal((await fetch(api.url+'/api/face-reconstruction',{method:'POST',headers:{authorization:'Bearer owner'},body:'invalid'})).status,503);
});
test('only the owner can download or delete a job; raw photographs are removed after processing',async t=>{
 const root=await temp(t);let resolveWork;const workGate=new Promise(resolve=>resolveWork=resolve);const api=await server(t,{root,isAvailable:async()=>true,authorize:async req=>({uid:req.headers.authorization}),reconstruct:async()=>{await workGate;return Buffer.from('test-glb');}});
 const start=await fetch(api.url+'/api/face-reconstruction',{method:'POST',headers:{authorization:'owner'},body:JSON.stringify(fixture())});assert.equal(start.status,202);const job=await start.json();const route=api.url+'/api/face-reconstruction/'+job.id;
 assert.equal((await fetch(route,{headers:{authorization:'other'}})).status,404);assert.equal((await fetch(route,{method:'DELETE',headers:{authorization:'other'}})).status,404);assert.equal((await fetch(route+'/model',{headers:{authorization:'owner'}})).status,409);
 assert.equal((await fetch(api.url+'/api/face-reconstruction',{method:'POST',headers:{authorization:'owner'},body:'{}'})).status,409);resolveWork();
 let state;for(let i=0;i<40;i++){state=await(await fetch(route,{headers:{authorization:'owner'}})).json();if(state.status==='completed')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(state.status,'completed');await new Promise(resolve=>setTimeout(resolve,50));await assert.rejects(fs.access(path.join(root,job.id,'work')));const model=await fetch(route+'/model',{headers:{authorization:'owner'}});assert.equal(model.headers.get('content-type'),'model/gltf-binary');assert.equal(await model.text(),'test-glb');assert.equal((await fetch(route,{method:'DELETE',headers:{authorization:'owner'}})).status,200);await assert.rejects(fs.access(path.join(root,job.id)));
});
test('cancelling a reconstruction aborts its worker and deletes the private job folder',async t=>{
 const root=await temp(t);let aborted=false;const api=await server(t,{root,isAvailable:async()=>true,authorize:async()=>({uid:'owner'}),reconstruct:async(work,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}))});
 const response=await fetch(api.url+'/api/face-reconstruction',{method:'POST',body:JSON.stringify(fixture())}),job=await response.json();assert.equal(response.status,202);assert.equal((await fetch(api.url+'/api/face-reconstruction/'+job.id,{method:'DELETE'})).status,200);assert.equal(aborted,true);await assert.rejects(fs.access(path.join(root,job.id)));
});
