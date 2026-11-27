const test = require("node:test");
const assert = require("node:assert/strict");
const {spawn} = require("node:child_process");
test("default clinic preview avoids live authentication and disables Firestore APIs", async () => {
 const env = {...process.env, PORT:"0"}; delete env.CLINIC_PARTNER_ENABLE_FIRESTORE;
 const child = spawn(process.execPath, ["server.js"], {cwd:require("node:path").join(__dirname,".."),env,stdio:["ignore","pipe","pipe"]});
 try {
  const base = await new Promise((resolve,reject)=>{let out="";const timeout=setTimeout(()=>reject(Error("Server startup timeout")),10000);child.stdout.on("data", data=>{out+=data;const m=out.match(/http:\/\/localhost:(\d+)/);if(m){clearTimeout(timeout);resolve("http://127.0.0.1:"+m[1]);}});child.once("error",reject);});
  for(const file of ["clinic-partner-login.html","clinic-partner-register.html","clinic-partner.html","clinic-portal-demo.html","clinic-reservation.html"]) {
   const r = await fetch(base+"/"+file);assert.equal(r.status,200);const html = await r.text();assert.doesNotMatch(html,/src="(?:auth-core|clinic-partner-auth|clinic-partner|clinic-reservation)\.js"/);
  }
  for(const route of ["/api/partner/session","/api/reservations","/api/admin/clinic-partners"]) {const r=await fetch(base+route);assert.equal(r.status,503);assert.match((await r.json()).error,/確認用モード/);}
 } finally {child.kill();}
});
