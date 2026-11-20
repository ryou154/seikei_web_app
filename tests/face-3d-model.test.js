const {test}=require('node:test');
const assert=require('node:assert/strict');
const api=require('../face-3d-model');
test('camera fits the entire face at every supported rotation and viewport shape',()=>{
 const surface=api.build({before:api.sampleAnalysis()}).sample(1,{chinLength:1,noseHeight:1});
 for(const aspect of [.5,1,4/3,2.5]) {
  const fit=api.cameraFit(surface.positions,aspect,35,1.24);
  for(const yaw of [-1.22,0,1.22])for(const pitch of [-.5,0,.5])for(let i=0;i<surface.positions.length;i+=3){
   const [x,y,z]=[0,1,2].map(k=>surface.positions[i+k]-fit.center[k]);
   const rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw);
   const ry=y*Math.cos(pitch)-rz*Math.sin(pitch),depth=fit.distance-(y*Math.sin(pitch)+rz*Math.cos(pitch));
   const vertical=Math.tan(35*Math.PI/360)*depth;
   assert.ok(Math.abs(rx)<vertical*aspect);assert.ok(Math.abs(ry)<vertical);
   assert.ok(depth>fit.near&&depth<fit.far);
  }
 }
});
test('canonical mesh has finite geometry and valid triangle indices',()=>{const m=api.build({before:api.sampleAnalysis()});const s=m.sample();assert.equal(m.vertexCount,468);assert.equal(m.triangleCount,898);assert.equal(s.positions.length,1404);assert.ok([...s.positions,...s.normals,...s.uvs].every(Number.isFinite));assert.ok([...s.indices].every(i=>i<468));});
test('nose and jaw controls change geometry without mutating source',()=>{const before=api.sampleAnalysis(),snapshot=JSON.stringify(before),m=api.build({before});const base=m.sample(0),nose=m.sample(0,{noseHeight:1}),jaw=m.sample(0,{jawWidth:-1});assert.ok(nose.positions[1*3+2]>base.positions[1*3+2]);assert.notDeepEqual(jaw.positions,base.positions);assert.equal(JSON.stringify(before),snapshot);});
test('After depth changes survive model reconstruction',()=>{const before=api.sampleAnalysis(),after=structuredClone(before);after.landmarks[1].z-=.03;const m=api.build({before,after});assert.ok(m.sample(1).positions[5]>m.sample(0).positions[5]);assert.equal(m.observedAfter,true);});
test('GLB export parses as glTF geometry',async()=>{const surface=api.build({before:api.sampleAnalysis()}).sample();const buffer=api.toGLB(surface);const view=new DataView(buffer);assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(8,true),buffer.byteLength);const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const result=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',resolve,reject));assert.equal(result.scene.children[0].geometry.attributes.position.count,468);});
test('similarity alignment recovers rotated and translated scan',()=>{const target=api.sampleAnalysis().landmarks.map(p=>[p.x,p.y,p.z]),source=target.map(([x,y,z])=>[1.2*(-y)+3,1.2*x-4,1.2*z+1]);const fit=api.align(source,target);assert.ok(fit.rms<1e-6,`rms ${fit.rms}`);});

