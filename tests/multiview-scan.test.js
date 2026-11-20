const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const api=require('../face-3d-model'),source=fs.readFileSync('script.js','utf8');
const functionText=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
test('scan completion retains all seven landmark sets, not side photos, and previews the fused model',()=>{
 const front=api.sampleAnalysis();front.metrics={yawRatio:0};
 const views=Object.fromEntries(['front','left','right','left-profile','right-profile','up','down'].map(key=>[key,{imageData:`photo-${key}`,analysis:structuredClone(front)}]));
 let preview,stopped;
 const context=vm.createContext({guidedScan:{views},cameraScanProgressBar:{style:{}},cameraDirection:{classList:{add(){}}},cameraScanStatus:{},selectedImageData:'',latestFaceAnalysis:null,analyzedImageData:'',guidedScanTimer:null,clearTimeout(){},setSelectedImage(data){context.selectedImageData=data;},showScanModel(image,analysis){preview={image,analysis};},stopCamera(message){stopped=message;}});
 vm.runInContext(functionText('function completeGuidedScan()','async function showScanModel('),context);vm.runInContext('completeGuidedScan()',context);
 assert.equal(preview.image,'photo-front');assert.equal(preview.analysis.scan.viewCount,7);assert.equal(Object.keys(preview.analysis.scan.views).length,7);assert.equal(preview.analysis.scan.views.left.landmarks.length,468);assert.ok(!JSON.stringify(preview.analysis.scan).includes('photo-'));assert.equal(context.guidedScan,null);assert.match(stopped,/7方向/);
});
test('deep side views require a deeper pose on the same side and a centered face',()=>{
 const metrics={frameCenterOffsetX:0,frameCenterOffsetY:0,faceWidthInFrame:45,yawRatio:0,eyeTiltDegrees:0};
 const views={front:{analysis:{metrics}},left:{analysis:{metrics:{yawRatio:14}}},right:{analysis:{metrics:{yawRatio:-15}}}};
 const context=vm.createContext({guidedScan:{views},Math});
 vm.runInContext(functionText('function isGuidedScanPoseAccepted(','function acceptGuidedScanView('),context);
 const accept=(key,yaw,offset=0)=>{context.key=key;context.metrics={...metrics,yawRatio:yaw,frameCenterOffsetX:offset};return vm.runInContext('isGuidedScanPoseAccepted(key,metrics)',context);};
 assert.equal(accept('left-profile',14),false);assert.equal(accept('left-profile',-28),false);assert.equal(accept('left-profile',28),true);assert.equal(accept('right-profile',-28),true);assert.equal(accept('right-profile',-28,40),false);
});
test('multiple scan depths influence both the personal base and After while malformed views are excluded',()=>{
 const before=api.sampleAnalysis(),view=structuredClone(before);view.landmarks[1].z-=.025;
 before.scan={views:Object.fromEntries(['left','right','left-profile','right-profile','up','down'].map(k=>[k,structuredClone(view)]))};before.scan.views.invalid={landmarks:[{x:NaN}]};
 const without=api.build({before:api.sampleAnalysis(),after:api.sampleAnalysis()}),withScan=api.build({before,after:api.sampleAnalysis()});
 assert.equal(withScan.scanViewsUsed,6);assert.ok(withScan.sample(0).positions[5]>without.sample(0).positions[5]);assert.ok(withScan.sample(1).positions[5]>without.sample(1).positions[5]);
});
