const fs=require('node:fs/promises');
const path=require('node:path');

function localAsset(root,name){
  const resolved=path.resolve(root,name);
  if(path.isAbsolute(name)||!resolved.startsWith(path.resolve(root)+path.sep))throw Error('モデル内に不正な参照があります。');
  return resolved;
}

// Convert the reconstructed textured OBJ into one self-contained GLB. No template
// geometry is added; missing ears/neck stay missing instead of being fabricated.
async function objToGLB(filename,{cameraPose}={}){
  const root=path.dirname(filename),text=await fs.readFile(filename,'utf8');
  const vertices=[],uvs=[],normals=[],groups=new Map(),libraries=[];
  let material='default';
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const [kind,...parts]=line.split(/\s+/);
    if(kind==='v')vertices.push(parts.slice(0,3).map(Number));
    if(kind==='vt')uvs.push(parts.slice(0,2).map(Number));
    if(kind==='vn')normals.push(parts.slice(0,3).map(Number));
    if(kind==='mtllib')libraries.push(parts.join(' '));
    if(kind==='usemtl')material=parts.join(' ');
    if(kind==='f'){
      if(!groups.has(material))groups.set(material,[]);
      for(let i=1;i<parts.length-1;i++)groups.get(material).push(parts[0],parts[i],parts[i+1]);
    }
  }
  if(!vertices.length||vertices.length>2000000||!groups.size)throw Error('復元された形状がありません。');
  const textures=new Map();
  for(const library of libraries){
    let current;
    for(const raw of (await fs.readFile(localAsset(root,library),'utf8')).split(/\r?\n/)){
      const [kind,...parts]=raw.trim().split(/\s+/);
      if(kind==='newmtl')current=parts.join(' ');
      if(kind==='map_Kd'&&current)textures.set(current,parts.join(' '));
    }
  }
  const gltf={asset:{version:'2.0',generator:'COLMAP + OpenMVS photo reconstruction',extras:{source:'photographs',templatePartsAdded:false}},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[]}],accessors:[],bufferViews:[],buffers:[{byteLength:0}],materials:[],images:[],textures:[],samplers:[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}]};
  if(cameraPose){
    const [w,x,y,z,tx,ty,tz]=cameraPose;
    if(cameraPose.length!==7||!cameraPose.every(Number.isFinite))throw Error('撮影位置が不正です。');
    gltf.nodes[0].matrix=[1-2*y*y-2*z*z,-(2*x*y+2*z*w),-(2*x*z-2*y*w),0,2*x*y-2*z*w,-(1-2*x*x-2*z*z),-(2*y*z+2*x*w),0,2*x*z+2*y*w,-(2*y*z-2*x*w),-(1-2*x*x-2*y*y),0,tx,-ty,-tz,1];
  }
  const chunks=[];let size=0;
  function bufferView(data,target){const bytes=Buffer.from(data.buffer||data,data.byteOffset||0,data.byteLength);const id=gltf.bufferViews.length;gltf.bufferViews.push({buffer:0,byteOffset:size,byteLength:bytes.length,...(target?{target}:{})});chunks.push({offset:size,bytes});size+=Math.ceil(bytes.length/4)*4;return id;}
  function accessor(data,type,components,target,bounds=false){
    const a={bufferView:bufferView(data,target),componentType:data instanceof Uint32Array?5125:5126,count:data.length/components,type};
    if(bounds){a.min=Array(components).fill(Infinity);a.max=Array(components).fill(-Infinity);for(let i=0;i<data.length;i++){const k=i%components;a.min[k]=Math.min(a.min[k],data[i]);a.max[k]=Math.max(a.max[k],data[i]);}}
    const id=gltf.accessors.length;gltf.accessors.push(a);return id;
  }
  const lookup=(array,index)=>{const n=Number(index);return array[n<0?array.length+n:n-1];};
  for(const [name,faces]of groups){
    if(faces.length>600000)throw Error('復元モデルの面数が大きすぎます。');
    const positions=[],texcoords=[],ns=[];
    for(let i=0;i<faces.length;i+=3){
      const triangle=faces.slice(i,i+3).map(token=>{const [v,t,n]=token.split('/');return {p:lookup(vertices,v),uv:t?lookup(uvs,t):[0,0],normal:n?lookup(normals,n):null};});
      if(triangle.some(v=>!v.p||!v.uv||![...v.p,...v.uv,...(v.normal||[])].every(Number.isFinite)))throw Error('復元モデルの座標が不正です。');
      const [a,b,c]=triangle.map(v=>v.p),u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross)||1;
      for(const vertex of triangle){positions.push(...vertex.p);texcoords.push(vertex.uv[0],1-vertex.uv[1]);ns.push(...(vertex.normal||cross.map(n=>n/length)));}
    }
    const mat={doubleSided:true,pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.9}};
    if(textures.has(name)){
      const textureName=textures.get(name),bytes=await fs.readFile(localAsset(root,textureName));
      const ext=path.extname(textureName).toLowerCase();if(!['.png','.jpg','.jpeg'].includes(ext))throw Error('PNG/JPEGのテクスチャが必要です。');
      const image=gltf.images.length;gltf.images.push({bufferView:bufferView(bytes),mimeType:ext==='.png'?'image/png':'image/jpeg'});gltf.textures.push({source:image,sampler:0});mat.pbrMetallicRoughness.baseColorTexture={index:gltf.textures.length-1};
    }
    const materialIndex=gltf.materials.length;gltf.materials.push(mat);
    gltf.meshes[0].primitives.push({attributes:{POSITION:accessor(new Float32Array(positions),'VEC3',3,34962,true),NORMAL:accessor(new Float32Array(ns),'VEC3',3,34962),TEXCOORD_0:accessor(new Float32Array(texcoords),'VEC2',2,34962)},material:materialIndex,mode:4});
  }
  gltf.buffers[0].byteLength=size;
  const json=Buffer.from(JSON.stringify(gltf)),jsonSize=Math.ceil(json.length/4)*4,total=28+jsonSize+size;
  if(total>256*1024*1024)throw Error('復元モデルが大きすぎます。');
  const result=Buffer.alloc(total);result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(total,8);result.writeUInt32LE(jsonSize,12);result.writeUInt32LE(0x4e4f534a,16);result.fill(32,20,20+jsonSize);json.copy(result,20);result.writeUInt32LE(size,20+jsonSize);result.writeUInt32LE(0x004e4942,24+jsonSize);for(const chunk of chunks)chunk.bytes.copy(result,28+jsonSize+chunk.offset);return result;
}
module.exports={objToGLB,localAsset};
