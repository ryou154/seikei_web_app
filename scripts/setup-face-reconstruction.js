const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'../.tools/reconstruction');
async function main(){
 if(process.platform!=='win32')throw Error('Windows用セットアップです。LinuxではCOLMAP 4.2.1とOpenMVS 2.4.0を別途インストールしてください。');
 const packages=[['colmap/colmap','4.2.1','colmap-x64-windows-nocuda.zip','colmap'],['cdcseacave/openMVS','v2.4.0','OpenMVS_Windows_x64.zip','openmvs']];
 await fs.mkdir(root,{recursive:true});
 for(const [repo,tag,name,folder]of packages){
  const metadata=await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`).then(r=>{if(!r.ok)throw Error(`release ${r.status}`);return r.json();});
  const asset=metadata.assets.find(a=>a.name===name);if(!asset)throw Error('公式配布物が見つかりません。');
  const zip=path.join(root,name),destination=path.join(root,folder);
  const bytes=new Uint8Array(await fetch(asset.browser_download_url).then(r=>{if(!r.ok)throw Error(`download ${r.status}`);return r.arrayBuffer();}));
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(asset.digest&&asset.digest!==`sha256:${hash}`)throw Error('配布物のチェックサムが一致しません。');
  await fs.writeFile(zip,bytes);await fs.mkdir(destination,{recursive:true});
  await new Promise((resolve,reject)=>{const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Expand-Archive -LiteralPath $env:RECON_ZIP -DestinationPath $env:RECON_DEST -Force'],{windowsHide:true,env:{...process.env,RECON_ZIP:zip,RECON_DEST:destination},stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`extract ${code}`)));});
  console.log(`${name}: SHA-256 ${hash}`);
 }
 console.log('COLMAP / OpenMVS を .tools/reconstruction に展開しました。');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
