const {test}=require('node:test'),assert=require('node:assert/strict'),api=require('../face-3d-model');
test('bust adds inferred ears and neck without replacing the measured face',()=>{
 const face=api.build({before:api.sampleAnalysis()}).sample(),bust=api.withBust(face),ranges=bust.partRanges;
 assert.deepEqual(bust.positions.slice(0,face.positions.length),face.positions);assert.deepEqual(bust.inferredParts,['ears','neck']);
 assert.equal(ranges.face[1],468);assert.ok(ranges.neck[1]>ranges.neck[0]);assert.ok(ranges.ears[1]>ranges.ears[0]);
 assert.ok([...bust.positions,...bust.normals,...bust.uvs].every(Number.isFinite));assert.ok([...bust.indices].every(i=>i<bust.positions.length/3));
 const chin=face.positions[152*3+1],neck=bust.positions.slice(ranges.neck[0]*3,ranges.neck[1]*3);assert.ok(Math.min(...neck.filter((_,i)=>i%3===1))<chin);
 const earX=bust.positions.slice(ranges.ears[0]*3).filter((_,i)=>i%3===0);assert.ok(Math.min(...earX)<face.positions[234*3]);assert.ok(Math.max(...earX)>face.positions[454*3]);
});
test('camera framing includes ears and neck during rotation on narrow screens',()=>{
 const bust=api.withBust(api.build({before:api.sampleAnalysis()}).sample());
 for(const aspect of [.5,1,2]){const f=api.cameraFit(bust.positions,aspect,35,1.24);for(const yaw of [-1.22,0,1.22])for(let i=0;i<bust.positions.length;i+=3){const x=bust.positions[i]-f.center[0],y=bust.positions[i+1]-f.center[1],z=bust.positions[i+2]-f.center[2],rx=x*Math.cos(yaw)+z*Math.sin(yaw),rz=-x*Math.sin(yaw)+z*Math.cos(yaw),span=(f.distance-rz)*Math.tan(35*Math.PI/360);assert.ok(Math.abs(rx)<span*aspect&&Math.abs(y)<span);}}
});
test('ears and neck are included in exported GLB geometry',async()=>{
 const surface=api.withBust(api.build({before:api.sampleAnalysis()}).sample()),buffer=api.toGLB(surface);
 const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');const result=await new Promise((resolve,reject)=>new GLTFLoader().parse(buffer,'',resolve,reject));assert.equal(result.scene.children[0].geometry.attributes.position.count,surface.positions.length/3);
});
