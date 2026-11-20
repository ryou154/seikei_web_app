const $=id=>document.getElementById(id);
let frames=[],stream=null,capturing=false,captureGeneration=0,privacyGeneration=0,segmenterPromise,job=null,pollTimer=null,requestController=new AbortController(),disposeModel=null,modelBytes=null,enabled=false,preparing=false;
const say=(id,text,error=false)=>{$(id).textContent=text;$(id).dataset.error=String(error);};
function sync(){ $('reconstruct').disabled=!enabled||frames.length<24||capturing||preparing||Boolean(job);$('start-capture').disabled=!stream||capturing||preparing||frames.length>=80;$('stop-capture').disabled=!stream;$('open-camera').disabled=Boolean(stream)||preparing;$('photo-files').disabled=capturing||preparing||Boolean(job);$('clear-photos').disabled=capturing||preparing;$('capture-count').textContent=`${frames.length}枚 / 最大80枚`;$('delete-reconstruction').disabled=!job;$('download-reconstruction').disabled=!modelBytes; }
async function request(url,options={}){const response=await window.AppAuth.fetch(url,{...options,cache:'no-store',signal:requestController.signal,headers:{...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.error||'復元処理と通信できません。');}return response;}
async function segmenter(){
 if(!segmenterPromise)segmenterPromise=(async()=>{const {ImageSegmenter,FilesetResolver}=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm');return ImageSegmenter.createFromOptions(await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'),{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:true,outputConfidenceMasks:false});})().catch(error=>{segmenterPromise=null;throw error;});
 return segmenterPromise;
}
async function prepare(source){
 const sourceWidth=source.videoWidth||source.naturalWidth||source.width,sourceHeight=source.videoHeight||source.naturalHeight||source.height;
 if(!sourceWidth||!sourceHeight)throw Error('カメラ映像を準備しています。');
 const ratio=Math.min(1,1600/Math.max(sourceWidth,sourceHeight)),width=Math.round(sourceWidth*ratio),height=Math.round(sourceHeight*ratio);
 if(width<480||height<480)throw Error('耳・首の復元には、幅と高さが480px以上の写真を使用してください。');
 if(frames.length&&(frames[0].width!==width||frames[0].height!==height))throw Error('カメラの向き・写真サイズを途中で変更しないでください。');
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0,width,height);
 const analyzer=await segmenter();
 let result;
 try{
  result=analyzer.segment(canvas);const mask=result.categoryMask;if(!mask)throw Error('人物の背景除去に失敗しました。');
  const categories=mask.getAsUint8Array(),small=document.createElement('canvas');small.width=mask.width;small.height=mask.height;const smallCtx=small.getContext('2d'),pixels=smallCtx.createImageData(mask.width,mask.height);let kept=0;
  for(let i=0;i<categories.length;i++){const keep=[1,2,3].includes(categories[i]);kept+=keep?1:0;pixels.data[i*4]=pixels.data[i*4+1]=pixels.data[i*4+2]=255;pixels.data[i*4+3]=keep?255:0;}
  if(kept/categories.length<.08)throw Error('顔・耳・首が映る距離で撮影してください。');
  smallCtx.putImageData(pixels,0,0);const full=document.createElement('canvas');full.width=width;full.height=height;const fullCtx=full.getContext('2d');fullCtx.imageSmoothingEnabled=false;fullCtx.drawImage(small,0,0,width,height);
  ctx.globalCompositeOperation='destination-in';ctx.drawImage(full,0,0);ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
  fullCtx.globalCompositeOperation='destination-over';fullCtx.fillStyle='#000';fullCtx.fillRect(0,0,width,height);
  return {image:canvas.toDataURL('image/jpeg',.9),mask:full.toDataURL('image/png'),width,height};
 }finally{result?.close?.();}
}
function addFrame(frame){
 const bytes=frames.reduce((sum,f)=>sum+(f.image.length+f.mask.length)*.75,0)+(frame.image.length+frame.mask.length)*.75;
 if(bytes>64*1024*1024)throw Error('写真が64MBに達しました。撮影を終了してください。');
 frames.push(frame);if(frames.length%5===1){const image=document.createElement('img');image.src=frame.image;image.alt=`背景除去後の写真 ${frames.length}`;$('photo-thumbnails').append(image);}sync();
}
function instruction(){const n=frames.length;return n<10?'撮影者は正面から、本人の左側へゆっくり移動してください':n<20?'撮影者は左側から正面へ、ゆっくり戻ってください':n<30?'撮影者は正面から、本人の右側へゆっくり移動してください':n<40?'撮影者は右側から正面へ、ゆっくり戻ってください':'本人は動かず、カメラの高さを少し変えて顎・首も撮影してください';}
function stopCamera(){capturing=false;captureGeneration++;stream?.getTracks().forEach(track=>track.stop());stream=null;$('photo-camera').srcObject=null;sync();}
async function captureLoop(token){
 while(capturing&&token===captureGeneration&&frames.length<80){
  const start=performance.now();$('capture-instruction').textContent=instruction();
  try{const frame=await prepare($('photo-camera'));if(token!==captureGeneration)return;addFrame(frame);}catch(error){if(token!==captureGeneration)return;say('reconstruction-status',error.message,true);stopCamera();return;}
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,900-(performance.now()-start))));
 }
 if(token===captureGeneration)stopCamera();
}
$('open-camera').onclick=async()=>{if(stream||preparing)return;preparing=true;sync();const generation=privacyGeneration;try{await segmenter();if(generation!==privacyGeneration)return;const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1440}},audio:false});if(generation!==privacyGeneration){next.getTracks().forEach(track=>track.stop());return;}stream=next;$('photo-camera').srcObject=stream;await $('photo-camera').play();say('reconstruction-status','本人の顔と首を固定して撮影してください。');}catch(error){if(generation===privacyGeneration)say('reconstruction-status',`カメラを開始できません：${error.message}`,true);}finally{preparing=false;sync();}};
$('start-capture').onclick=()=>{if(!stream||capturing)return;capturing=true;const token=++captureGeneration;sync();void captureLoop(token);};
$('stop-capture').onclick=()=>{stopCamera();say('reconstruction-status',`${frames.length}枚を準備しました。24枚以上あれば復元できます。`);};
$('photo-files').onchange=async event=>{const files=[...event.target.files],generation=privacyGeneration;if(files.length+frames.length>80){say('reconstruction-status','写真は最大80枚までです。',true);return;}preparing=true;sync();try{for(const file of files){const image=await createImageBitmap(file);try{const frame=await prepare(image);if(generation!==privacyGeneration)return;addFrame(frame);}finally{image.close();}say('reconstruction-status',`背景を除去しています：${frames.length}枚`);}say('reconstruction-status',`${frames.length}枚を準備しました。`);}catch(error){say('reconstruction-status',error.message,true);}finally{preparing=false;event.target.value='';sync();}};
function clearPhotos(){frames=[];$('photo-thumbnails').replaceChildren();$('photo-files').value='';sync();}
$('clear-photos').onclick=()=>{clearPhotos();say('reconstruction-status','ブラウザー内の撮影写真を消去しました。');};
async function poll(generation){
 if(generation!==privacyGeneration||!job)return;
 try{const state=await(await request(`/api/face-reconstruction/${job}`)).json();if(generation!==privacyGeneration)return;say('reconstruction-status',state.error||state.stage,state.status==='failed');
  if(state.status==='completed'){const buffer=await(await request(`/api/face-reconstruction/${job}/model`)).arrayBuffer();if(generation!==privacyGeneration)return;modelBytes=buffer;const {showModel}=await import('./photo-reconstruction-viewer.js');if(generation!==privacyGeneration)return;disposeModel?.();const cleanup=await showModel($('reconstructed-model'),buffer);if(generation!==privacyGeneration){cleanup();return;}disposeModel=cleanup;sync();return;}
  if(state.status==='failed')return;pollTimer=setTimeout(()=>void poll(generation),2000);
 }catch(error){if(generation===privacyGeneration)say('reconstruction-status',error.message,true);}
}
$('reconstruct').onclick=async()=>{if(!enabled||frames.length<24||job)return;const generation=privacyGeneration;preparing=true;sync();try{say('reconstruction-status','撮影写真を復元処理へ送信しています…');const state=await(await request('/api/face-reconstruction',{method:'POST',body:JSON.stringify({captureMode:'stationary-subject',frames:frames.map(({image,mask})=>({image,mask}))})})).json();if(generation!==privacyGeneration)return;job=state.id;clearPhotos();void poll(generation);}catch(error){if(generation===privacyGeneration)say('reconstruction-status',error.message,true);}finally{preparing=false;sync();}};
$('delete-reconstruction').onclick=async()=>{if(!job)return;const id=job;try{await request(`/api/face-reconstruction/${id}`,{method:'DELETE'});privacyGeneration++;requestController.abort();requestController=new AbortController();clearTimeout(pollTimer);job=null;modelBytes=null;disposeModel?.();disposeModel=null;clearPhotos();say('reconstruction-status','撮影写真と復元データを削除しました。');sync();}catch(error){say('reconstruction-status',error.message,true);}};
$('download-reconstruction').onclick=()=>{if(!modelBytes)return;const url=URL.createObjectURL(new Blob([modelBytes],{type:'model/gltf-binary'})),link=document.createElement('a');link.href=url;link.download='photo-reconstruction.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
function lock(){privacyGeneration++;requestController.abort();requestController=new AbortController();clearTimeout(pollTimer);stopCamera();clearPhotos();disposeModel?.();disposeModel=null;modelBytes=null;job=null;sync();}
window.addEventListener('app-locked',lock);window.addEventListener('pagehide',lock);
async function init(){try{const config=await(await request('/api/face-reconstruction/capabilities')).json();enabled=config.enabled;say('engine-status',enabled?'写真復元エンジンを利用できます。CPUで処理するため時間がかかります。':'復元エンジンが未設定です。処理サーバーへCOLMAPとOpenMVSを導入してください。',!enabled);sync();}catch(error){say('engine-status',error.message,true);}}
window.addEventListener('app-authorized',()=>void init());if(window.AppAuth&&await window.AppAuth.ready)void init();sync();
