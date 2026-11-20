const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const model=require('../face-3d-model');
const source=fs.readFileSync('script.js','utf8');
test('simulation generated After is passed to 3D with its own depth and texture',async()=>{
 const before=model.sampleAnalysis(),after=structuredClone(before);after.landmarks[1].z-=.04;
 const result={profile:{imageEngine:'gemini'},hospitals:[]},calls=[];
 const node={innerHTML:'',textContent:'',classList:{add(){},remove(){}}};
 const container={...node,querySelector:()=>({parentElement:container})};
 const context=vm.createContext({window:{Face3DViewer:{disposeAll(){},mount(...args){calls.push(args);return true;}}},latestResult:result,selectedImageData:'before-image',emptyResult:node,resultContent:node,saveButton:{},beforeImage:node,afterImage:container,analysisText:node,
 setSimulationStep(){},setSimulationStatus(){},analyzeSelectedFace:async()=>before,appendFaceAnalysis:()=>'',renderFaceScoreComparison(){},runScanAnimation:async()=>{},createGeminiAfterImage:async()=>({image:'generated-after',model:'mock'}),renderAfterImageViewer(){},analyzeFaceImage:async image=>{assert.equal(image,'generated-after');return after;},appendFaceScoreComparison:()=>'',console});
 const start=source.indexOf('async function renderResult('),end=source.indexOf('  result.beforeScore =',start);
 vm.runInContext(source.slice(start,end).replace("await import('./face-3d-viewer.js');", "await Promise.resolve();")+'}',context);await vm.runInContext('renderResult(latestResult)',context);
 assert.equal(calls.length,1);assert.equal(calls[0][1],'generated-after');assert.equal(calls[0][2],after);assert.equal(calls[0][3].beforeAnalysis,before);assert.equal(calls[0][3].afterAnalysis,after);
 const mesh=model.build({before:calls[0][3].beforeAnalysis,after:calls[0][3].afterAnalysis});assert.ok(mesh.sample(1).positions[5]>mesh.sample(0).positions[5]);
});
