(() => {
  'use strict';
  const D=window.ClinicBookingDemo,$=id=>document.getElementById(id),form=$('user-booking-form');
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  let selectedTime='',toastTimer;
  const notify=message=>{$('booking-toast').textContent=message;$('booking-toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('booking-toast').hidden=true,6500);};
  const store=D.connect(localStorage,()=>render());
  D.patients.forEach(p=>{const option=el('option',p.name);option.value=p.id;$('booking-patient').append(option);});
  D.services.forEach(s=>{const option=el('option',`${s.name}（${s.duration}分）`);option.value=s.id;$('booking-service').append(option);});
  $('booking-date').min=D.today();$('booking-date').max=D.shift(D.today(),90);$('booking-date').value=D.shift(D.today(),1);
  function render(){
    try{const state=store.read(),p=D.patients.find(p=>p.id===$('booking-patient').value),s=D.services.find(s=>s.id===$('booking-service').value),date=$('booking-date').value;
      $('booking-profile').replaceChildren(el('b',p.name),el('small',`${p.age} · ${p.phone}`),el('small',p.email));
      if(selectedTime&&!D.available(state,date,selectedTime,s.duration))selectedTime='';
      form.elements.namedItem('time').value=selectedTime;
      $('user-slots').replaceChildren(...D.slots().map(time=>{const button=el('button',time,'slot-option');button.type='button';button.disabled=!D.available(state,date,time,s.duration);button.setAttribute('aria-pressed',String(time===selectedTime));button.setAttribute('aria-label',time+(button.disabled?' 予約不可':' 予約可能'));button.addEventListener('click',()=>{selectedTime=time;render();});return button;}));
      $('booking-summary').textContent=selectedTime?`${date} ${selectedTime}〜${D.time(D.minutes(selectedTime)+s.duration)}\n${s.name} · 山田 みなみ（架空）`:'希望日時を選択してください。';
      const appointments=state.appointments.filter(a=>a.patientId===p.id).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
      $('user-reservations').replaceChildren(...(appointments.length?appointments.map(a=>{const item=el('article',null,'user-reservation');item.append(el('h3',`${a.date} ${a.time}`),el('p',D.services.find(s=>s.id===a.serviceId)?.name||'予約メニュー'),el('span',D.statuses[a.status],'booking-status'));return item;}):[el('p','予約はまだありません。','muted')]));
      $('user-history').replaceChildren(...(p.history.length?p.history.map(h=>{const item=el('article',null,'history-card');item.append(el('time',h.date),el('h4',h.treatment),el('span',h.source,'history-source'),el('p',h.clinic));return item;}):[el('p','登録されている施術歴はありません。','muted')]));
      $('user-booking-error').textContent='';
    }catch(error){$('user-booking-error').textContent=error.message;}
  }
  function loadConsent(){try{$('booking-consent').checked=store.read().consents[$('booking-patient').value]===true;}catch{}}
  $('booking-patient').addEventListener('change',()=>{selectedTime='';loadConsent();render();});
  for(const id of ['booking-service','booking-date'])$(id).addEventListener('change',()=>{selectedTime='';render();});
  form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type=submit]');button.disabled=true;const input={patientId:$('booking-patient').value,serviceId:$('booking-service').value,date:$('booking-date').value,time:selectedTime,shareHistory:$('booking-consent').checked};try{const result=await store.transact(state=>D.book(state,input));selectedTime='';render();notify(`予約を受け付けました。${input.date} ${input.time}。クリニックのスケジュールへ反映しました（デモ）。`);const card=document.querySelector('.booking-confirmation')||el('p',null,'booking-confirmation');card.setAttribute('role','status');card.textContent=`予約受付完了：${input.date} ${input.time} ／ ${D.patients.find(p=>p.id===input.patientId).name}。予約番号 ${result.appointments.at(-1).id}`;$('user-reservations').before(card);}catch(error){selectedTime='';render();$('user-booking-error').textContent=error.message;}finally{button.disabled=false;}});
  function renderSlotsAfterConflict(){selectedTime='';form.elements.namedItem('time').value='';}
  window.addEventListener('storage',event=>{if(event.key===D.key){render();loadConsent();}});
  window.addEventListener('focus',()=>render());
  loadConsent();render();
})();
