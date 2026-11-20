const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../continuous-face-scan'),model=require('../face-3d-model');
function frame(yaw=0,pitch=0){const analysis=model.sampleAnalysis();analysis.metrics={yawRatio:yaw,pitchRatio:50+pitch,eyeTiltDegrees:0,frameCenterOffsetX:0,frameCenterOffsetY:0,faceWidthInFrame:45};return {imageData:`image-${yaw}-${pitch}`,analysis};}
function sweep(scan,sign=1){let result=scan.add(frame(),0),clock=0;
 for(const [yaw,pitch]of [...Array.from({length:10},(_,i)=>[(i+1)*3*sign,0]),...Array.from({length:21},(_,i)=>[(30-i*3)*sign,0]),...[2,4,6,8].map(p=>[0,p*sign]),...[6,4,2,0,-2,-4,-6,-8].map(p=>[0,p*sign]),[0,0]])result=scan.add(frame(yaw,pitch),clock+=400);
 return result;
}
test('continuous sweep captures intermediate poses and completes only after returning front',()=>{
 const scan=create(),result=sweep(scan);
 assert.equal(result.completed,true);assert.ok(result.count>=18&&result.count<=48);assert.equal(result.progress,100);
 const views=scan.views();assert.equal(views.front.imageData,'image-0-0');assert.ok(Object.keys(views).some(k=>k.startsWith('yaw-')));assert.ok(Object.keys(views).some(k=>k.startsWith('pitch-')));
 const before=frame().analysis;before.scan={views:Object.fromEntries(Object.entries(views).map(([k,v])=>[k,{landmarks:v.analysis.landmarks,imageSize:v.analysis.imageSize}]))};assert.ok(model.build({before}).scanViewsUsed>=18);
});
test('mirrored cameras support the same continuous capture sequence',()=>{assert.equal(sweep(create(),-1).completed,true);});
test('stationary, off-center and invalid detections do not count as a sweep',()=>{
 const scan=create();scan.add(frame(),0);for(let i=1;i<80;i++)scan.add(frame(),i*400);assert.equal(scan.status().count,1);
 const bad=frame(15);bad.analysis.metrics.frameCenterOffsetX=40;scan.add(bad,40000);assert.equal(scan.status().count,1);
 bad.analysis.landmarks[0].z=NaN;scan.add(bad,41000);assert.equal(scan.status().count,1);assert.notEqual(scan.status().phase,'finish');
});
test('capture expires, clears retained images, and ignores later frames',()=>{
 const scan=create();scan.add(frame(),0);assert.equal(scan.add(frame(10),120001).expired,true);scan.clear();assert.deepEqual(scan.views(),{});scan.add(frame(),130000);assert.equal(scan.status().count,0);
});
