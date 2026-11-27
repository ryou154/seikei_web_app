const {test}=require('node:test');
const assert=require('node:assert/strict');
const D=require('../clinic-booking-demo-store');
const date=()=>D.shift(D.today(),2);
const input=overrides=>({patientId:'p3',serviceId:'eye',date:date(),time:'11:00',shareHistory:false,...overrides});

test('user booking is visible to another clinic reader and blocks every overlapping slot',async()=>{
  let value;const storage={getItem:()=>value??null,setItem:(_key,v)=>{value=v;}};
  const user=D.connect(storage),clinic=D.connect(storage);
  await user.transact(state=>D.book(state,input()));
  const state=clinic.read();assert.equal(state.appointments.at(-1).patientId,'p3');
  assert.equal(D.available(state,date(),'11:30',30),false);
  assert.equal(D.available(state,date(),'10:30',60),false);
  assert.equal(D.available(state,date(),'12:00',30),true);
  assert.throws(()=>D.book(state,input({serviceId:'consult',time:'11:30'})),/予約できません/);
});
test('simultaneous booking attempts recheck the latest saved state',async()=>{
  let value;const storage={getItem:()=>value??null,setItem:(_key,v)=>{value=v;}};
  const store=D.connect(storage);
  const result=await Promise.allSettled([store.transact(s=>D.book(s,input())),store.transact(s=>D.book(s,input()))]);
  assert.deepEqual(result.map(r=>r.status),['fulfilled','rejected']);
  assert.equal(store.read().appointments.filter(a=>a.date===date()).length,1);
});
test('closed slots and appointment cancellation control availability without deleting history',()=>{
  let state=D.initial();state=D.closeSlot(state,date(),'12:30',true);
  assert.equal(D.available(state,date(),'12:00',60),false);
  state=D.closeSlot(state,date(),'12:30',false);state=D.book(state,input());
  const id=state.appointments.at(-1).id;
  assert.throws(()=>D.closeSlot(state,date(),'11:30',true),/予約のある枠/);
  state=D.updateStatus(state,id,'cancelled');assert.ok(D.available(state,date(),'11:00',60));
  assert.equal(state.appointments.at(-1).status,'cancelled');
});
test('clinic sees self-reported other-clinic history only with consent and only for booked users',()=>{
  let state=D.initial();assert.equal(D.history(state,'p1').length,2);
  assert.equal(D.history(state,'p2').length,1);assert.deepEqual(D.history(state,'p3'),[]);
  state=D.book(state,input({patientId:'p1',shareHistory:false}));
  assert.deepEqual(D.history(state,'p1').map(h=>h.source),['自院の施術記録']);
  state=D.book(state,input({patientId:'p2',time:'13:00',shareHistory:true}));
  assert.equal(D.history(state,'p2').length,2);
});
test('invalid, past, late, unaligned and overlong bookings are rejected',()=>{
  const state=D.initial();for(const overrides of [{date:D.shift(D.today(),-1)},{date:'2026-02-30'},{date:D.shift(D.today(),91)},{time:'18:30'},{time:'11:15'},{patientId:'unknown'},{serviceId:'unknown'}])assert.throws(()=>D.book(state,input(overrides)));
});
test('completed consultations never become treatment history',()=>{
  let state=D.book(D.initial(),input({patientId:'p1'}));const id=state.appointments.at(-1).id;
  const before=D.history(state,'p1');state=D.updateStatus(state,id,'completed');
  assert.deepEqual(D.history(state,'p1'),before);assert.throws(()=>D.updateStatus(state,id,'requested'),/変更できません/);
});

test('reserved-day filter deduplicates and sorts dates, with cancelled-only dates excluded by default',()=>{
 const state={appointments:[{date:'2026-12-03',status:'confirmed'},{date:'2026-11-28',status:'requested'},{date:'2026-11-28',status:'confirmed'},{date:'2026-12-01',status:'cancelled'}]};
 assert.deepEqual(D.reservationDates(state),['2026-11-28','2026-12-03']);
 assert.deepEqual(D.reservationDates(state,'requested'),['2026-11-28']);
 assert.deepEqual(D.reservationDates(state,'cancelled'),['2026-12-01']);
 assert.deepEqual(D.reservationDates(state,'completed'),[]);
 assert.deepEqual(D.reservationDates({appointments:[]}),[]);
});

test('month calendar covers the entire month including leap years and December rollover',()=>{
 assert.equal(D.monthDates('2026-11').length,30);
 assert.equal(D.monthDates('2026-02').length,28);
 assert.equal(D.monthDates('2028-02').length,29);
 assert.equal(D.monthDates('2026-12').at(-1),'2026-12-31');
 assert.equal(D.moveMonth('2026-12',1),'2027-01');
 assert.equal(D.moveMonth('2027-01',-1),'2026-12');
 assert.throws(()=>D.monthDates('2026-13'));
});
