(function(root,factory){
  const canonical=typeof module==='object'&&module.exports?require('./face-3d-canonical'):root.Face3DCanonical;
  const api=factory(canonical);if(typeof module==='object'&&module.exports)module.exports=api;else root.Face3DModel=api;
})(globalThis,function(canonical){
  'use strict';
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const finite=v=>Number.isFinite(Number(v));
  const avg=(points,ids)=>ids.reduce((a,i)=>{const p=points[i];return a.map((v,k)=>v+p[k]/ids.length);},[0,0,0]);
  const anchors=[10,33,133,263,362,168,6,152,234,454];
  function normalized(analysis){
    if(!analysis?.landmarks||analysis.landmarks.length<468)throw Error('顔の特徴点を468点以上取得できる画像を使用してください。');
    const aspect=analysis.imageSize?.height&&analysis.imageSize?.width?analysis.imageSize.height/analysis.imageSize.width:1;
    const raw=analysis.landmarks.slice(0,468).map(p=>{if(![p.x,p.y,p.z??0].every(finite))throw Error('顔の特徴点に不正な座標があります。');return [Number(p.x),Number(p.y)*aspect,Number(p.z||0)];});
    const left=avg(raw,[33,133,159,145]),right=avg(raw,[263,362,386,374]);
    const dx=right[0]-left[0],dy=right[1]-left[1],distance=Math.hypot(dx,dy);
    if(distance<0.02)throw Error('両目が分かる正面に近い画像を使用してください。');
    const center=left.map((v,i)=>(v+right[i])/2),scale=0.65/distance,c=dx/distance,s=dy/distance;
    const points=raw.map(p=>{const x=p[0]-center[0],y=p[1]-center[1];return [(x*c+y*s)*scale,(-y*c+x*s)*scale,-(p[2]-center[2])*scale];});
    return {points,uv:analysis.landmarks.slice(0,468).flatMap(p=>[p.x,1-p.y])};
  }
  function rotate(q,p){const [w,x,y,z]=q,[px,py,pz]=p;return [
    (1-2*y*y-2*z*z)*px+(2*x*y-2*z*w)*py+(2*x*z+2*y*w)*pz,
    (2*x*y+2*z*w)*px+(1-2*x*x-2*z*z)*py+(2*y*z-2*x*w)*pz,
    (2*x*z-2*y*w)*px+(2*y*z+2*x*w)*py+(1-2*x*x-2*y*y)*pz];}
  // Horn's quaternion fit removes camera pose before combining scan depths.
  function align(source,target){
    const a=avg(source,anchors),b=avg(target,anchors),h=Array.from({length:3},()=>[0,0,0]);let variance=0;
    for(const id of anchors){const p=source[id].map((v,k)=>v-a[k]),q=target[id].map((v,k)=>v-b[k]);for(let i=0;i<3;i++)for(let j=0;j<3;j++)h[i][j]+=p[i]*q[j];variance+=p.reduce((n,v)=>n+v*v,0);}
    const [[xx,xy,xz],[yx,yy,yz],[zx,zy,zz]]=h;
    const m=[[xx+yy+zz,yz-zy,zx-xz,xy-yx],[yz-zy,xx-yy-zz,xy+yx,zx+xz],[zx-xz,xy+yx,-xx+yy-zz,yz+zy],[xy-yx,zx+xz,yz+zy,-xx-yy+zz]];
    const eigen=Array.from({length:4},(_,i)=>Array.from({length:4},(_,j)=>Number(i===j)));
    for(let iteration=0;iteration<40;iteration++){
      let p=0,q=1;for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)if(Math.abs(m[i][j])>Math.abs(m[p][q])){p=i;q=j;}
      if(Math.abs(m[p][q])<1e-10)break;
      const angle=0.5*Math.atan2(2*m[p][q],m[q][q]-m[p][p]),c=Math.cos(angle),s=Math.sin(angle);
      for(let k=0;k<4;k++){const x=m[k][p],y=m[k][q];m[k][p]=c*x-s*y;m[k][q]=s*x+c*y;}
      for(let k=0;k<4;k++){const x=m[p][k],y=m[q][k];m[p][k]=c*x-s*y;m[q][k]=s*x+c*y;}
      for(let k=0;k<4;k++){const x=eigen[k][p],y=eigen[k][q];eigen[k][p]=c*x-s*y;eigen[k][q]=s*x+c*y;}
    }
    let best=0;for(let i=1;i<4;i++)if(m[i][i]>m[best][best])best=i;
    const quaternion=eigen.map(row=>row[best]);
    const rotated=source.map(p=>rotate(quaternion,p.map((v,k)=>v-a[k])));
    let numerator=0;for(const id of anchors)for(let k=0;k<3;k++)numerator+=rotated[id][k]*(target[id][k]-b[k]);
    const scale=clamp(numerator/Math.max(variance,1e-9),0.65,1.5);
    const points=rotated.map(p=>p.map((v,k)=>v*scale+b[k]));
    const rms=Math.sqrt(anchors.reduce((sum,id)=>sum+points[id].reduce((n,v,k)=>n+(v-target[id][k])**2,0),0)/anchors.length);
    return {points,rms};
  }
  const g=(p,c,sx,sy)=>Math.exp(-0.5*((p[0]-c[0])**2/(sx*sx)+(p[1]-c[1])**2/(sy*sy)));
  function morph(points,controls={}){
    const nose=points[1],chin=points[152],lip=avg(points,[13,14]),jawY=(points[152][1]+points[1][1])/2;
    const noseHeight=clamp(Number(controls.noseHeight)||0,-1,1),jawWidth=clamp(Number(controls.jawWidth)||0,-1,1),chinLength=clamp(Number(controls.chinLength)||0,-1,1),lips=clamp(Number(controls.lipFullness)||0,-1,1);
    return points.map(p=>{const tip=g(p,nose,0.19,0.29),lower=Math.exp(-0.5*(p[1]-jawY)**2/(0.38**2)),chinArea=g(p,chin,0.38,0.25),mouth=g(p,lip,0.28,0.11);return [p[0]*(1+jawWidth*0.13*lower),p[1]-chinLength*0.14*chinArea,p[2]+noseHeight*0.18*tip+lips*0.06*mouth];});
  }
  function profileControls(profile={}){const s=clamp(Number(profile.strength??50)/100,0,1);return {noseHeight:({high:0.7,sharp:0.45}[profile.nose]||0)*s,jawWidth:({vline:-0.8,slim:-0.7,round:0.35}[profile.face]||0)*s,chinLength:(profile.face==='vline'?0.3:0)*s,lipFullness:(profile.mouth==='full'?0.6:0)*s};}
  function normals(positions,indices){
    const out=new Float32Array(positions.length);
    for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,ab=[0,1,2].map(k=>positions[b+k]-positions[a+k]),ac=[0,1,2].map(k=>positions[c+k]-positions[a+k]);const n=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];for(const id of [a,b,c])for(let k=0;k<3;k++)out[id+k]+=n[k];}
    for(let i=0;i<out.length;i+=3){const length=Math.hypot(out[i],out[i+1],out[i+2])||1;for(let k=0;k<3;k++)out[i+k]/=length;}
    return out;
  }
  function build({before,after,profile={}}){
    const original=normalized(before||after),base=original.points.map(p=>p.slice());let scanViewsUsed=0;
    const depths=base.map(p=>[p[2]]);
    for(const [name,view] of Object.entries(before?.scan?.views||{})){
      if(name==='front'||!view.landmarks?.length)continue;
      try{const analysis={landmarks:view.landmarks,imageSize:view.imageSize||(view.capture?.imageWidth?{width:view.capture.imageWidth,height:view.capture.imageHeight}:before.imageSize)};const fit=align(normalized(analysis).points,base);if(fit.rms>0.2)continue;
        fit.points.forEach((p,i)=>{if(Math.abs(p[2]-base[i][2])<0.3)depths[i].push(p[2]);});scanViewsUsed++;
      }catch{}
    }
    base.forEach((p,i)=>{const values=depths[i].sort((a,b)=>a-b),median=values[Math.floor(values.length/2)];p[2]=p[2]*0.4+median*0.6;});
    const observed=Boolean(after?.ok&&after.landmarks?.length>=468);
    const generated=observed?normalized(after):null;
    let target=generated?generated.points.map((p,i)=>[p[0],p[1],p[2]*0.85+base[i][2]*0.15]):morph(base,profileControls(profile));
    const low=Math.min(...base.map(p=>p[1]),...target.map(p=>p[1])),high=Math.max(...base.map(p=>p[1]),...target.map(p=>p[1])),centerY=(low+high)/2;
    const beforePoints=base.map(p=>[p[0],p[1]-centerY,p[2]]);target=target.map(p=>[p[0],p[1]-centerY,p[2]]);
    const triangles=canonical.triangles.map(([a,b,c])=>{const p=beforePoints[a],q=beforePoints[b],r=beforePoints[c];return (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0])<0?[a,c,b]:[a,b,c];});
    const indices=new Uint16Array(triangles.flat()),beforeUV=original.uv,afterUV=generated?.uv||beforeUV;
    const sample=(amount=1,controls={})=>{const value=clamp(Number(amount)||0,0,1),points=beforePoints.map((p,i)=>p.map((v,k)=>v+(target[i][k]-v)*value));const positions=new Float32Array(morph(points,controls).flat());const uvs=new Float32Array(beforeUV.map((v,i)=>v+(afterUV[i]-v)*value));return {positions,uvs,indices,normals:normals(positions,indices)};};
    return {sample,indices,vertexCount:468,triangleCount:triangles.length,scanViewsUsed,observedAfter:observed,kind:observed?'after-image':'local-estimate'};
  }
  function toGLB(surface,{imageBytes=null,mimeType='image/png'}={}){
    const arrays=[surface.positions,surface.normals,surface.uvs,surface.indices];const chunks=[],views=[];let total=0;
    for(const array of arrays){const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);views.push({buffer:0,byteOffset:total,byteLength:bytes.length,target:views.length===3?34963:34962});chunks.push({offset:total,bytes});total+=Math.ceil(bytes.length/4)*4;}
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<surface.positions.length;i++) {const k=i%3;min[k]=Math.min(min[k],surface.positions[i]);max[k]=Math.max(max[k],surface.positions[i]);}
    const gltf={asset:{version:'2.0',generator:'Local After Face 3D Prototype'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,TEXCOORD_0:2},indices:3,material:0,mode:4}]}],buffers:[{byteLength:0}],bufferViews:views,accessors:[{bufferView:0,componentType:5126,count:surface.positions.length/3,type:'VEC3',min,max},{bufferView:1,componentType:5126,count:surface.normals.length/3,type:'VEC3'},{bufferView:2,componentType:5126,count:surface.uvs.length/2,type:'VEC2'},{bufferView:3,componentType:5123,count:surface.indices.length,type:'SCALAR'}],materials:[{doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[0.76,0.57,0.45,1],metallicFactor:0,roughnessFactor:0.85}}]};
    if(imageBytes){if(!['image/png','image/jpeg'].includes(mimeType))throw Error('GLBの画像はPNGまたはJPEGを使用してください。');const bytes=new Uint8Array(imageBytes);const view=views.length;views.push({buffer:0,byteOffset:total,byteLength:bytes.length});chunks.push({offset:total,bytes});total+=Math.ceil(bytes.length/4)*4;gltf.images=[{bufferView:view,mimeType}];gltf.textures=[{source:0,sampler:0}];gltf.samplers=[{magFilter:9729,minFilter:9729,wrapS:33071,wrapT:33071}];gltf.materials[0].pbrMetallicRoughness.baseColorTexture={index:0};gltf.materials[0].pbrMetallicRoughness.baseColorFactor=[1,1,1,1];}
    gltf.buffers[0].byteLength=total;
    const encoded=new TextEncoder().encode(JSON.stringify(gltf)),jsonLength=Math.ceil(encoded.length/4)*4,length=12+8+jsonLength+8+total,buffer=new ArrayBuffer(length),view=new DataView(buffer),bytes=new Uint8Array(buffer);
    view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,length,true);view.setUint32(12,jsonLength,true);view.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonLength);bytes.set(encoded,20);const bin=20+jsonLength;view.setUint32(bin,total,true);view.setUint32(bin+4,0x004e4942,true);for(const chunk of chunks)bytes.set(chunk.bytes,bin+8+chunk.offset);return buffer;
  }
  function sampleAnalysis(){const landmarks=canonical.vertices.map(([x,y,z])=>({x:0.5+x/24,y:0.49-y/24,z:-z/24}));return {ok:true,landmarks,imageSize:{width:1024,height:1024},meshConnections:[]};}
  function cameraFit(positions, aspect, fov = 35, padding = 1.18) {
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    for(let i=0;i<positions.length;i++) { const k=i%3;min[k]=Math.min(min[k],positions[i]);max[k]=Math.max(max[k],positions[i]); }
    const center=min.map((v,k)=>(v+max[k])/2);
    let radius=0;
    for(let i=0;i<positions.length;i+=3) radius=Math.max(radius,Math.hypot(positions[i]-center[0],positions[i+1]-center[1],positions[i+2]-center[2]));
    radius=Math.max(radius,.01);
    const vertical=fov*Math.PI/360,horizontal=Math.atan(Math.tan(vertical)*Math.max(aspect,.01));
    const distance=radius*Math.max(padding,1)/Math.sin(Math.min(vertical,horizontal));
    return {center,radius,distance,near:Math.max(.001,distance-radius*2),far:distance+radius*3};
  }
  return {build,toGLB,sampleAnalysis,align,profileControls,cameraFit};
});
