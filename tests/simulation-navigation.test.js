const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function setup(){
 const nodes=new Map(),events={},calls=[];
 const node=id=>{
  if(!nodes.has(id)){const classes=new Set(id==='conditions-panel'?['step-hidden']:[]);nodes.set(id,{value:'',textContent:'',innerHTML:'',dataset:{},style:{removeProperty(){}},files:[],width:720,listeners:{},
   addEventListener(key,fn){this.listeners[key]=fn;},removeAttribute(){},replaceChildren(){this.innerHTML='';this.textContent='';},
   classList:{add:(...v)=>v.forEach(k=>classes.add(k)),remove:(...v)=>v.forEach(k=>classes.delete(k)),contains:k=>classes.has(k),toggle(k,value){const next=value??!classes.has(k);if(next)classes.add(k);else classes.delete(k);return next;}},
   querySelectorAll:()=>[],scrollIntoView(){calls.push('scroll:'+id);},focus(){calls.push('focus:'+id);}
  });}return nodes.get(id);
 };
 const indicators=['capture','conditions','result'].map(step=>{const n=node('indicator-'+step);n.dataset.stepIndicator=step;return n;});
 const window={AppAuth:{uid:'test-user'},AccountData:{init(){}},addEventListener:(key,fn)=>events[key]=fn,requestAnimationFrame:fn=>fn()};
 const context=vm.createContext({window,document:{getElementById:node,querySelector:s=>node(s.slice(1)),querySelectorAll:s=>s==='[data-step-indicator]'?indicators:[],body:node('body')},console,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
 vm.runInContext(fs.readFileSync('script.js','utf8'),context);
 return {node,events,context,calls};
}
test('next step requires an image and keeps capture visible when missing',()=>{
 const app=setup();app.node('to-conditions-button').listeners.click();
 assert.equal(app.node('capture-panel').classList.contains('step-hidden'),false);
 assert.equal(app.node('conditions-panel').classList.contains('step-hidden'),true);
 assert.match(app.node('camera-message').textContent,/顔画像/);
 assert.ok(app.calls.includes('focus:face-image'));
});
test('image, conditions, back and simulation execution remain connected',async()=>{
 const app=setup();vm.runInContext('selectedImageData="test-image";',app.context);
 app.node('request-text').value='自然な目元';app.node('gender-select').value='female';
 app.node('to-conditions-button').listeners.click();
 assert.equal(app.node('conditions-panel').classList.contains('step-hidden'),false);
 assert.equal(app.node('capture-panel').classList.contains('step-hidden'),true);
 assert.equal(app.node('indicator-conditions').classList.contains('is-active'),true);
 app.node('back-to-capture-button').listeners.click();
 assert.equal(app.node('capture-panel').classList.contains('step-hidden'),false);
 assert.equal(vm.runInContext('selectedImageData',app.context),'test-image');
 assert.equal(app.node('request-text').value,'自然な目元');
 app.node('to-conditions-button').listeners.click();
 app.context.renderCalls=[];
 vm.runInContext('createSimulationResult=text=>({text});renderResult=async result=>{renderCalls.push(result.text);};',app.context);
 await app.node('simulate-button').listeners.click();
 assert.equal(app.context.renderCalls[0],'自然な目元');
 assert.equal(app.node('indicator-result').classList.contains('is-active'),true);
 assert.equal(app.node('simulate-button').disabled,false);
});
test('locking the app returns the wizard to capture and clears the selected image',()=>{
 const app=setup();vm.runInContext('selectedImageData="test-image";',app.context);
 app.node('to-conditions-button').listeners.click();app.events['app-locked']();
 assert.equal(app.node('conditions-panel').classList.contains('step-hidden'),true);
 assert.equal(app.node('capture-panel').classList.contains('step-hidden'),false);
 assert.equal(vm.runInContext('selectedImageData',app.context),'');
});
