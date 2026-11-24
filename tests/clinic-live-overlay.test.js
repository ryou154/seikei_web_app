const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {patchBackend,patchFrontend,patchHtml}=require('../scripts/patch-live-clinic-html');
test('production overlay preserves unrelated backend code and refuses an unexpected route layout',()=>{
 const source=`const unchangedAuthenticationPolicy = 'keep';
function adminClinic(id, source) { return {
    detectedData: source.detectedData || null,
}; }
function createClinicAdminStore(db) {
  return { otherStoreMethod() {} };
}
function createClinicAdminHandler({ getStore } = {}) {
  let officialSyncRunning = false;
  return async () => { const store = getStore(), extractMatch = false;
      if (extractMatch) { return 'legacy'; }
  };
}`;
 const patched=patchBackend(source,{imports:'const createHtmlSyncStore = () => ({});',route:'      const htmlMatch = false;'});
 new vm.Script(patched);assert.ok(patched.includes("unchangedAuthenticationPolicy = 'keep'"));assert.ok(patched.includes('...createHtmlSyncStore(db)'));assert.ok(patched.includes('detectedHtmlData: source.detectedHtmlData'));assert.throws(()=>patchBackend('different backend',{}),/signature changed/);assert.throws(()=>patchBackend(patched,{}),/already exists/);
});
test('production frontend replacement removes old Gemini helpers and retains unrelated UI handlers',()=>{
 const replacement=fs.readFileSync('admin-clinics.js','utf8');
 const source=`(() => {
  let currentDetectedData;
  function unrelatedPublishHandler() { return 'keep publication workflow'; }
  async function startClinicExtraction() { return api('/extract-official'); }
  async function updateOneClinic() { return api('/extract-official'); }
  async function updateNationwideClinics() { return api('/auto-publish'); }
  async function selectClinic() { return api('/place-preview'); }
  async function pollClinicExtraction() { return api('/extract-official'); }
  async function extractSelectedClinic() { return api('/extract-official'); }
  function initialize() { return 'keep authorization'; }
  window.addEventListener('app-authorized', initialize);
})();`;
 const patched=patchFrontend(source,replacement);new vm.Script(patched);assert.ok(!patched.includes('/extract-official'));assert.ok(!patched.includes('/auto-publish'));assert.ok(patched.includes('/extract-html'));assert.ok(patched.includes('keep publication workflow'));assert.ok(patched.includes('keep authorization'));
});
test('production HTML retains the sidebar and login script while changing only update guidance',()=>{
 const html='<aside>existing sidebar</aside><section class="nationwide-update-panel"><p class="eyebrow">Nationwide</p><p>old API description</p><p>old usage</p><p>old fee</p><button id="update-nationwide-clinics">更新</button></section><script src="/auth-core.js"></script>';
 const patched=patchHtml(html);assert.ok(patched.includes('existing sidebar'));assert.ok(patched.includes('/auth-core.js'));assert.ok(patched.includes('Gemini API・Google Places APIは使用しません'));assert.ok(patched.includes('id="update-nationwide-clinics"'));assert.ok(!patched.includes('old fee'));
});
