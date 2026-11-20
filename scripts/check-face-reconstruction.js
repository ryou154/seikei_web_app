const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib');
const {engines,available,reconstruct}=require('../face-reconstruction-engine');
const {jpegSize}=require('../face-reconstruction');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function whiteMask(width,height){
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc32(body),out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=0;
 const pixels=Buffer.alloc((width+1)*height,255);for(let y=0;y<height;y++)pixels[y*(width+1)]=0;
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
async function main(){
 if(!await available(engines()))throw Error('復元エンジンを先にセットアップしてください。');
 console.log('COLMAP / OpenMVS executable files: available');
 if(!process.argv.includes('--sample'))return;
 const root=path.resolve(__dirname,'../.tools/reconstruction/verification');await fs.mkdir(path.join(root,'images'),{recursive:true});await fs.mkdir(path.join(root,'masks'),{recursive:true});
 const response=await fetch('https://api.github.com/repos/cdcseacave/openMVS_sample/contents/images');if(!response.ok)throw Error('公式サンプル一覧を取得できません。');
 const images=(await response.json()).filter(x=>x.name.endsWith('.jpg'));
 for(let i=0;i<images.length;i++){const name=`frame-${String(i).padStart(4,'0')}.jpg`,filename=path.join(root,'images',name);let bytes;try{bytes=await fs.readFile(filename);}catch{const image=await fetch(images[i].download_url);if(!image.ok)throw Error('公式サンプル画像を取得できません。');bytes=Buffer.from(await image.arrayBuffer());await fs.writeFile(filename,bytes);}const size=jpegSize(bytes);await fs.writeFile(path.join(root,'masks',name+'.png'),whiteMask(size.width,size.height));}
 console.log(`Official OpenMVS Sceaux Castle sample: ${images.length} photos (not a face dataset)`);
 const controller=new AbortController();process.once('SIGINT',()=>controller.abort());const bytes=await reconstruct(root,{signal:controller.signal,onProgress:stage=>console.log(stage)});await fs.writeFile(path.join(root,'verified.glb'),bytes);console.log(`GLB verified: ${bytes.length} bytes`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
