const {saveExtraction}=require('./scripts/sync-clinic-html');

function createHtmlSyncStore(db){
 const collection=db.collection('clinics'),runs=new Map();
 return {
  async listForHtmlSync({prefectures,limit,before=''}){
   const key=JSON.stringify([prefectures.slice().sort(),before]);
   for(const [id,run]of runs)if(Date.now()-run.created>30*60*1000)runs.delete(id);
   if(!before||!runs.has(key)){
    if(runs.size>=20)runs.delete(runs.keys().next().value);
    const candidates=collection.where('prefecture','in',prefectures).get().then(snapshot=>snapshot.docs.map(d=>({...d.data(),id:d.id}))
     .filter(c=>!before||!c.officialHtmlCheckedAt||c.officialHtmlCheckedAt<before)
     .sort((a,b)=>String(a.officialHtmlCheckedAt||'').localeCompare(String(b.officialHtmlCheckedAt||''))||a.id.localeCompare(b.id)));
    runs.set(key,{created:Date.now(),candidates});
   }
   const run=runs.get(key);
   try{return (await run.candidates).splice(0,limit);}catch(error){runs.delete(key);throw error;}
  },
  async saveHtmlExtraction(id,extraction,options){return saveExtraction(db,id,extraction,options);},
  async markHtmlSyncFailed(id,error,officialUrl,{skipped=false}={}){
   const reference=collection.doc(id);
   await db.runTransaction(async transaction=>{const snapshot=await transaction.get(reference);if(!snapshot.exists||snapshot.data().officialUrl!==officialUrl)return;
    transaction.set(reference,{officialHtmlCheckedAt:new Date().toISOString(),htmlExtractionStatus:skipped?'skipped':'failed',htmlExtractionError:String(error).slice(0,500)},{merge:true});
   });
  }
 };
}
module.exports={createHtmlSyncStore};
