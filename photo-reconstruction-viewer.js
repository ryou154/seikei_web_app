import * as THREE from '/vendor/three.module.js';
import {GLTFLoader} from '/vendor/loaders/GLTFLoader.js';
export async function showModel(container,buffer){
 const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',resolve,reject));
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));container.replaceChildren(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,10000),group=new THREE.Group();
 const box=new THREE.Box3().setFromObject(gltf.scene),center=box.getCenter(new THREE.Vector3());gltf.scene.position.sub(center);group.add(gltf.scene);scene.add(group);
 scene.add(new THREE.HemisphereLight(0xffffff,0x75626a,2.5));const light=new THREE.DirectionalLight(0xffffff,1.5);light.position.set(2,3,4);scene.add(light);
 const radius=Math.max(.001,box.getSize(new THREE.Vector3()).length()/2);
 function resize(){const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;const half=Math.min(camera.fov*Math.PI/360,Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));camera.position.z=radius*1.2/Math.sin(half);camera.near=Math.max(.0001,camera.position.z-radius*2);camera.far=camera.position.z+radius*3;camera.updateProjectionMatrix();}
 const observer=new ResizeObserver(resize);observer.observe(container);resize();
 let pointer;
 const down=e=>{pointer=[e.clientX,e.clientY];container.setPointerCapture(e.pointerId);},move=e=>{if(!pointer)return;group.rotation.y=Math.max(-1.5,Math.min(1.5,group.rotation.y+(e.clientX-pointer[0])*.01));group.rotation.x=Math.max(-.6,Math.min(.6,group.rotation.x+(e.clientY-pointer[1])*.01));pointer=[e.clientX,e.clientY];},up=()=>pointer=null;
 container.addEventListener('pointerdown',down);container.addEventListener('pointermove',move);container.addEventListener('pointerup',up);container.addEventListener('pointercancel',up);
 renderer.setAnimationLoop(()=>renderer.render(scene,camera));
 return ()=>{renderer.setAnimationLoop(null);observer.disconnect();for(const [event,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up]])container.removeEventListener(event,fn);gltf.scene.traverse(obj=>{obj.geometry?.dispose();for(const m of Array.isArray(obj.material)?obj.material:obj.material?[obj.material]:[]){for(const value of Object.values(m))if(value?.isTexture)value.dispose();m.dispose();}});renderer.dispose();container.replaceChildren();};
}
