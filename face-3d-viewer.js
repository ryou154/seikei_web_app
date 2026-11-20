import * as THREE from '/vendor/three.module.js';
import './face-3d-canonical.js';
import './face-3d-model.js';
const viewers=new Map(),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function dispose(container){viewers.get(container)?.();}
function disposeAll(){for(const cleanup of [...viewers.values()])cleanup();}
function mount(container,imageData,analysis,options={}){
  if(!container||!imageData||!analysis?.ok)return false;
  let surface,model;
  try{model=window.Face3DModel.build({before:options.beforeAnalysis?.ok?options.beforeAnalysis:analysis,after:options.scanPreview?null:(options.afterAnalysis||analysis)});surface=window.Face3DModel.withBust(model.sample(options.scanPreview?0:1));}catch{return false;}
  dispose(container);container.replaceChildren();
  const root=document.createElement('div');root.className='three-face-viewer';root.tabIndex=0;root.setAttribute('aria-label','Afterの3Dモデル。ドラッグまたは矢印キーで回転');
  const help=document.createElement('p');help.className='face-3d-help';help.textContent='Afterを3Dに反映・ドラッグで回転（奥行きは推定）';
  const scan=analysis.scan||options.beforeAnalysis?.scan;
  if (scan?.completed) help.textContent=`${options.scanPreview?'撮影した顔':'After'}の3D・正面＋${model.scanViewsUsed}${scan.mode==='continuous'?'枚':'方向'}を統合（奥行きは推定）`;
  help.textContent+='／耳・首は推定形状';
  const fallback=document.createElement('img');fallback.src=imageData;fallback.alt='シミュレーション後のAfter画像';fallback.className='three-face-fallback three-face-fallback-layer';root.append(fallback);container.append(root);
  let renderer;
  try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});}catch{return false;}
  renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));root.append(renderer.domElement,help);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,20);camera.position.z=4.4;
  scene.add(new THREE.HemisphereLight(0xffffff,0x75626a,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(.4,.8,2.5);scene.add(light);
  const geometry=new THREE.BufferGeometry();for(const[name,data,size]of [['position',surface.positions,3],['normal',surface.normals,3],['uv',surface.uvs,2]])geometry.setAttribute(name,new THREE.BufferAttribute(data,size));geometry.setIndex(new THREE.BufferAttribute(surface.indices,1));
  const center=window.Face3DModel.cameraFit(surface.positions,1).center;
  geometry.translate(-center[0],-center[1],-center[2]);
  let active=true,textureReady=false;
  const texture=new THREE.TextureLoader().load(imageData,()=>{textureReady=true;},undefined,()=>{help.textContent='3D用画像を読み込めないためAfter画像を表示しています。';});texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,roughness:.85,side:THREE.DoubleSide}),mesh=new THREE.Mesh(geometry,material);scene.add(mesh);
  let pointer;
  root.addEventListener('pointerdown',e=>{pointer=[e.clientX,e.clientY];root.setPointerCapture(e.pointerId);});
  root.addEventListener('pointermove',e=>{if(!pointer)return;mesh.rotation.y=clamp(mesh.rotation.y+(e.clientX-pointer[0])*.01,-1.22,1.22);mesh.rotation.x=clamp(mesh.rotation.x+(e.clientY-pointer[1])*.01,-.5,.5);pointer=[e.clientX,e.clientY];});
  root.addEventListener('pointerup',()=>pointer=null);root.addEventListener('pointercancel',()=>pointer=null);
  root.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();mesh.rotation.y=clamp(mesh.rotation.y+(e.key==='ArrowLeft'?-.15:e.key==='ArrowRight'?.15:0),-1.22,1.22);mesh.rotation.x=clamp(mesh.rotation.x+(e.key==='ArrowUp'?-.15:e.key==='ArrowDown'?.15:0),-.5,.5);});
  const resize=()=>{const w=Math.max(root.clientWidth,1),h=Math.max(root.clientHeight,1);renderer.setSize(w,h,false);camera.aspect=w/h;const fit=window.Face3DModel.cameraFit(surface.positions,camera.aspect,camera.fov,1.24);camera.position.set(0,0,fit.distance);camera.near=fit.near;camera.far=fit.far;camera.updateProjectionMatrix();};const observer=new ResizeObserver(resize);observer.observe(root);resize();
  const cleanup=()=>{if(!active)return;active=false;renderer.setAnimationLoop(null);observer.disconnect();texture.dispose();geometry.dispose();material.dispose();renderer.dispose();viewers.delete(container);};viewers.set(container,cleanup);
  renderer.setAnimationLoop(()=>{if(!active)return;if(!root.isConnected){cleanup();return;}renderer.render(scene,camera);if(textureReady)fallback.hidden=true;});return true;
}
window.Face3DViewer={mount,dispose,disposeAll};window.addEventListener('app-locked',disposeAll);
