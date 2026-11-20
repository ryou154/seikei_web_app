const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const fsSync=require('node:fs');
const {objToGLB}=require('./face-reconstruction-glb');
function engines(root=__dirname,env=process.env){
 const base=path.join(root,'.tools/reconstruction'),ext=process.platform==='win32'?'.exe':'';
 const colmap=env.COLMAP_EXECUTABLE||path.join(base,'colmap/bin',`colmap${ext}`);
 const mvs=env.OPENMVS_BIN||path.join(base,'openmvs/vc17/x64/Release');
 return {colmap,interface:path.join(mvs,`InterfaceCOLMAP${ext}`),dense:path.join(mvs,`DensifyPointCloud${ext}`),mesh:path.join(mvs,`ReconstructMesh${ext}`),texture:path.join(mvs,`TextureMesh${ext}`)};
}
async function available(executables){for(const executable of Object.values(executables)){try{await fs.access(executable);}catch{return false;}}return true;}
function execute(executable,args,{cwd,signal}={}){
 return new Promise((resolve,reject)=>{
  const log=fsSync.openSync(path.join(cwd,'engine.log'),'a');
  let child;
  try{child=spawn(executable,args,{cwd,signal,windowsHide:true,shell:false,stdio:['ignore',log,log],env:{...process.env,OMP_NUM_THREADS:'4',QT_QPA_PLATFORM:'offscreen'}});}finally{fsSync.closeSync(log);}
  const timer=setTimeout(()=>{child.kill();reject(Error('復元処理が制限時間を超えました。'));},20*60*1000);timer.unref();
  child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`復元エンジンが終了しました (${code})`));});
 });
}
async function reconstruct(work,{executables=engines(),run=execute,signal,onProgress=()=>{}}={}){
 const image=path.join(work,'images'),masks=path.join(work,'masks'),db=path.join(work,'database.db'),sparse=path.join(work,'sparse'),dense=path.join(work,'undistorted');
 await fs.mkdir(sparse,{recursive:true});
 const step=async(label,exe,args)=>{signal?.throwIfAborted();onProgress(label);await run(exe,args,{cwd:work,signal});};
 await step('写真の特徴を抽出',executables.colmap,['feature_extractor','--database_path',db,'--image_path',image,'--ImageReader.mask_path',masks,'--ImageReader.single_camera','1','--ImageReader.camera_model','SIMPLE_RADIAL','--FeatureExtraction.use_gpu','0','--FeatureExtraction.max_image_size','1600','--FeatureExtraction.num_threads','4']);
 await step('写真どうしを照合',executables.colmap,['exhaustive_matcher','--database_path',db,'--FeatureMatching.use_gpu','0','--FeatureMatching.num_threads','4']);
 await step('撮影位置と立体を計算',executables.colmap,['mapper','--database_path',db,'--image_path',image,'--output_path',sparse]);
 const candidates=[];
 for(const entry of await fs.readdir(sparse,{withFileTypes:true})){if(!entry.isDirectory()||!/^\d+$/.test(entry.name))continue;try{const stat=await fs.stat(path.join(sparse,entry.name,'images.bin'));candidates.push({name:entry.name,size:stat.size});}catch{}}
 if(!candidates.length)throw Error('写真の重なりが足りず、撮影位置を復元できませんでした。');
 candidates.sort((a,b)=>b.size-a.size);
 await step('画像のゆがみを補正',executables.colmap,['image_undistorter','--image_path',image,'--input_path',path.join(sparse,candidates[0].name),'--output_path',dense,'--output_type','COLMAP','--max_image_size','1600']);
 await step('復元データを変換',executables.colmap,['model_converter','--input_path',path.join(dense,'sparse'),'--output_path',path.join(dense,'sparse'),'--output_type','TXT']);
 const scene=path.join(work,'scene.mvs'),cloud=path.join(work,'cloud.mvs'),mesh=path.join(work,'mesh.mvs'),textured=path.join(work,'textured.mvs');
 await step('写真からの密な復元を準備',executables.interface,['-i',dense,'-o',scene,'--binary','0']);
 await step('耳・首を含む表面を推定',executables.dense,['-i',scene,'-o',cloud,'--resolution-level','1','--max-resolution','1600','--max-threads','4']);
 await step('立体の表面を作成',executables.mesh,['-i',cloud,'-o',mesh,'--max-threads','4','--target-face-num','60000','--close-holes','0']);
 // OpenMVS interface-format projects export the mesh as a separate PLY;
 // ReconstructMesh need not create mesh.mvs. Reuse cameras from cloud.mvs.
 await step('写真の質感を貼り合わせ',executables.texture,['-i',cloud,'--mesh-file',path.join(work,'mesh.ply'),'-o',textured,'--export-type','obj','--max-threads','4','--max-texture-size','4096','--close-holes','0']);
 const cameras=(await fs.readFile(path.join(dense,'sparse/images.txt'),'utf8')).split(/\r?\n/).map(line=>line.trim().split(/\s+/)).filter(parts=>parts.length>=10&&/^frame-\d+\.jpg$/.test(parts.at(-1))).sort((a,b)=>a.at(-1).localeCompare(b.at(-1)));
 if(!cameras.length)throw Error('復元した撮影位置がありません。');
 onProgress('3Dファイルを作成');return objToGLB(path.join(work,'textured.obj'),{cameraPose:cameras[0].slice(1,8).map(Number)});
}
module.exports={engines,available,execute,reconstruct};
