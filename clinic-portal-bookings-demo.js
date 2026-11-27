(() => {
  'use strict';
  const D=window.ClinicBookingDemo,$=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,fn,cls='text-button')=>{const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;};
  const patient=id=>D.patients.find(p=>p.id===id),service=id=>D.services.find(s=>s.id===id);
  let selectedPatient,selectedAppointment,viewMode='month';
  const store=D.connect(localStorage,()=>render());
  $('schedule-date').value=D.shift(D.today(),1);
  $('schedule-month').value=$('schedule-date').value.slice(0,7);
  function notify(message){$('schedule-sync').textContent=message;}
  const ordered=appointments=>[...appointments].sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  function appointmentButton(a){const p=patient(a.patientId),b=button('',()=>showPatient(a.patientId,a.id),'schedule-booking '+a.status),info=el('span');info.append(el('b',p?.name||'利用者'),el('small',`${a.time}〜${D.time(D.minutes(a.time)+a.duration)} · ${service(a.serviceId)?.name||'予約メニュー'}`));b.append(info,el('span',D.statuses[a.status],'booking-status'));return b;}
  function render(){
    try{const state=store.read(),filter=$('schedule-status').value,onlyBooked=$('schedule-booked-only').checked,dates=D.reservationDates(state,filter).filter(d=>viewMode!=='month'||d.startsWith($('schedule-month').value));
      let date=$('schedule-date').value||D.today();
      if(viewMode==='month'&&!date.startsWith($('schedule-month').value)){date=$('schedule-month').value+'-01';$('schedule-date').value=date;}
      if(onlyBooked&&dates.length&&!dates.includes(date)){date=dates.find(d=>d>=date)||dates.at(-1);$('schedule-date').value=date;}
      const emptyDates=onlyBooked&&!dates.length,day=emptyDates?[]:state.appointments.filter(a=>a.date===date),live=day.filter(a=>a.status!=='cancelled');
      const index=dates.indexOf(date);
      $('previous-date').disabled=onlyBooked&&(emptyDates||index<=0);
      $('next-date').disabled=onlyBooked&&(emptyDates||index>=dates.length-1);
      $('previous-date').setAttribute('aria-label',onlyBooked?'前の予約日':'前の日');
      $('next-date').setAttribute('aria-label',onlyBooked?'次の予約日':'次の日');
      $('week-strip').classList.toggle('booked-only',onlyBooked);
      $('week-strip').hidden=viewMode==='month';$('month-calendar').hidden=viewMode!=='month';$('month-summary').hidden=viewMode!=='month';$('month-controls').hidden=viewMode!=='month';$('day-controls').hidden=viewMode==='month';
      $('view-month').setAttribute('aria-pressed',String(viewMode==='month'));$('view-day').setAttribute('aria-pressed',String(viewMode==='day'));
      renderMonth(state,date,filter,onlyBooked);
      $('booking-metrics').replaceChildren(...[['選択日の予約',live.length],['受付・確定待ち',day.filter(a=>a.status==='requested').length],['対応完了',day.filter(a=>a.status==='completed').length]].map(([label,count])=>{const box=el('article',null,'booking-metric');box.append(el('span',label),el('b',count),el('small','件'));return box;}));
      $('week-strip').replaceChildren(...(onlyBooked?dates:Array.from({length:7},(_,i)=>D.shift(date,i-3))).map(d=>{const n=new Date(d+'T12:00:00+09:00'),count=state.appointments.filter(a=>a.date===d&&(filter?a.status===filter:a.status!=='cancelled')).length,b=button('',()=>{$('schedule-date').value=d;render();},'week-day'+(d===date?' selected':''));b.setAttribute('aria-label',d+` 予約${count}件`);b.setAttribute('aria-pressed',String(d===date));b.append(el('span',new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(n)),el('b',onlyBooked?`${Number(d.slice(5,7))}/${Number(d.slice(-2))}`:Number(d.slice(-2))),el('small',count+'件'));return b;}));
      $('schedule-day-title').textContent=emptyDates?'条件に一致する予約日はありません':new Intl.DateTimeFormat('ja-JP',{month:'long',day:'numeric',weekday:'long',timeZone:'Asia/Tokyo'}).format(new Date(date+'T12:00:00+09:00'));
      const rows=D.slots().map(time=>{const row=el('div',null,'schedule-row');row.append(el('span',time,'schedule-time'));const appointment=live.find(a=>D.minutes(a.time)<=D.minutes(time)&&D.minutes(a.time)+a.duration>D.minutes(time));
        if(appointment){if(filter&&filter!==appointment.status)row.append(el('div','別の状態の予約あり（空き枠ではありません）','schedule-empty closed'));else row.append(appointmentButton(appointment));}
        else{const closed=state.closedSlots.some(s=>s.date===date&&s.time===time),empty=el('div',null,'schedule-empty'+(closed?' closed':''));empty.append(el('span',closed?'－ 受付停止':'○ 空き枠'),button(closed?'受付を再開':'受付を停止',async()=>{try{await store.transact(s=>D.closeSlot(s,date,time,!closed));notify(`${date} ${time}の受付を${closed?'再開':'停止'}しました（デモ）。`);}catch(e){notify(e.message);}}));row.append(empty);}return row;});
      for(const a of day.filter(a=>a.status==='cancelled'&&(!filter||filter==='cancelled'))){const row=el('div',null,'schedule-row');row.append(el('span',a.time,'schedule-time'),appointmentButton(a));rows.push(row);}
      $('schedule-list').replaceChildren(...(emptyDates?[el('p','予約状態の条件を変更するか、「予約がある日だけ表示」をオフにしてください。','empty')]:rows));
      const term=$('patient-search').value.trim().toLowerCase(),ids=new Set(state.appointments.map(a=>a.patientId));const list=D.patients.filter(p=>ids.has(p.id)&&(!term||`${p.name} ${p.kana} ${p.id}`.toLowerCase().includes(term)));
      $('patient-list').replaceChildren(...(list.length?list.map(p=>{const row=el('article',null,'patient-row'),info=el('div');info.append(el('h3',p.name),el('p',`利用者ID：${p.id} · ${p.age} · ${p.phone}`),el('p',`予約 ${state.appointments.filter(a=>a.patientId===p.id).length}件 ／ 確認可能な施術歴 ${D.history(state,p.id).length}件`));row.append(info,button('情報・施術歴を見る',()=>showPatient(p.id),'button secondary'));return row;}):[el('p','該当する予約者はいません。','empty')]));
      if($('booking-detail-dialog').open&&selectedPatient)renderDetail();
    }catch(e){notify(e.message);}
  }
  function renderMonth(state,selected,filter,onlyBooked){
    const month=$('schedule-month').value,allDays=D.monthDates(month),matching=state.appointments.filter(a=>a.date.startsWith(month)&&(filter?a.status===filter:a.status!=='cancelled'));
    const dates=onlyBooked?D.reservationDates(state,filter).filter(d=>d.startsWith(month)):allDays;
    const calendar=$('month-calendar');calendar.classList.toggle('filtered',onlyBooked);
    const content=[];
    if(!onlyBooked){for(const weekday of ['日','月','火','水','木','金','土'])content.push(el('span',weekday,'month-weekday'));const offset=new Date(month+'-01T12:00:00+09:00').getUTCDay();for(let i=0;i<offset;i++){const blank=el('div',null,'month-blank');blank.setAttribute('aria-hidden','true');content.push(blank);}}
    for(const date of dates){const bookings=matching.filter(a=>a.date===date),cell=button('',()=>{$('schedule-date').value=date;render();},'month-day'+(date===selected?' selected':'')+(date===D.today()?' today':''));cell.setAttribute('aria-label',date+' 予約'+bookings.length+'件');cell.setAttribute('aria-pressed',String(date===selected));const number=el('b',Number(date.slice(-2)));cell.append(number);if(onlyBooked)cell.append(el('small',new Intl.DateTimeFormat('ja-JP',{weekday:'short',timeZone:'Asia/Tokyo'}).format(new Date(date+'T12:00:00+09:00'))));cell.append(el('span',bookings.length?bookings.length+'件':'—','month-count'+(bookings.length?' has-bookings':'')));content.push(cell);}
    if(!dates.length)content.push(el('p','この月に条件に一致する予約日はありません。','empty'));
    calendar.replaceChildren(...content);$('month-summary').textContent=Number(month.slice(0,4))+'年'+Number(month.slice(5))+'月 · '+matching.length+'件の予約 ／ '+new Set(matching.map(a=>a.date)).size+'日間'+(onlyBooked?'（予約がある日のみ）':'');
  }
  function showPatient(patientId,appointmentId){selectedPatient=patientId;selectedAppointment=appointmentId;renderDetail();$('booking-detail-dialog').showModal();}
  function renderDetail(){
    const state=store.read(),p=patient(selectedPatient),content=$('booking-detail-content');if(!p||!state.appointments.some(a=>a.patientId===p.id)){$('booking-detail-dialog').close();return;}
    const identity=el('div',null,'patient-identity'),name=el('div');name.append(el('small',`利用者ID：${p.id} · 架空データ`),el('h3',p.name),el('small',p.kana));identity.append(el('span',p.name[0],'avatar'),name);const dl=el('dl',null,'patient-details');for(const [label,value] of [['年齢',p.age],['電話番号',p.phone],['メール',p.email]])dl.append(el('dt',label),el('dd',value));content.replaceChildren(identity,dl);
    let appointments=ordered(state.appointments.filter(a=>a.patientId===p.id));if(selectedAppointment)appointments=appointments.filter(a=>a.id===selectedAppointment);
    for(const a of appointments){const section=el('section',null,'appointment-detail');section.append(el('h3','予約内容'),el('p',`${a.date} ${a.time}〜${D.time(D.minutes(a.time)+a.duration)}`),el('p',service(a.serviceId)?.name||'予約メニュー'),el('p','担当医：山田 みなみ（架空）'),el('span',D.statuses[a.status],'booking-status'));
      if(!['completed','cancelled'].includes(a.status)){const form=el('form',null,'status-editor'),label=el('label','予約状態'),select=el('select');select.setAttribute('aria-label','予約状態');for(const [value,title] of Object.entries(D.statuses)){const option=el('option',title);option.value=value;select.append(option);}select.value=a.status;label.append(select);const submit=el('button','状態を保存','button primary');submit.type='submit';form.append(label,submit);form.addEventListener('submit',async event=>{event.preventDefault();submit.disabled=true;try{await store.transact(s=>D.updateStatus(s,a.id,select.value));notify('予約状態を変更しました（デモ）。');}catch(e){notify(e.message);}finally{submit.disabled=false;}});section.append(form);}
      content.append(section);
    }
    const history=el('section',null,'history-section');history.append(el('h3','過去の施術歴'),el('p',state.consents[p.id]?'他院の本人申告情報：共有に同意済み（デモ）':'他院の本人申告情報：共有同意なし。自院の記録のみ表示します。','muted'));
    const records=D.history(state,p.id);
    if(!records.length)history.append(el('p','確認できる施術歴はありません。','empty'));
    for(const h of records){const item=el('article',null,'history-card');item.append(el('time',h.date),el('span',h.source,'history-source'+(h.source.includes('本人申告')?' self-report':'')),el('h4',h.treatment),el('p',h.clinic),el('p','担当医：'+h.doctor),el('p',h.note));history.append(item);}
    history.append(el('p','予約やカウンセリングの対応完了は、施術の実施履歴には追加されません。','muted'));content.append(history);
  }
  function changeMonth(month){if(!month)return;$('schedule-month').value=month;$('schedule-date').value=month+'-01';render();}
  $('previous-month').addEventListener('click',()=>changeMonth(D.moveMonth($('schedule-month').value,-1)));
  $('next-month').addEventListener('click',()=>changeMonth(D.moveMonth($('schedule-month').value,1)));
  $('schedule-this-month').addEventListener('click',()=>changeMonth(D.today().slice(0,7)));
  $('schedule-month').addEventListener('change',()=>changeMonth($('schedule-month').value));
  for(const mode of ['month','day'])$('view-'+mode).addEventListener('click',()=>{viewMode=mode;if(mode==='month')$('schedule-month').value=$('schedule-date').value.slice(0,7);render();});
  $('close-booking-detail').addEventListener('click',()=>$('booking-detail-dialog').close());
  function moveDate(direction){const current=$('schedule-date').value||D.today();if($('schedule-booked-only').checked){const dates=D.reservationDates(store.read(),$('schedule-status').value);const next=direction>0?dates.find(d=>d>current):[...dates].reverse().find(d=>d<current);if(next)$('schedule-date').value=next;}else $('schedule-date').value=D.shift(current,direction);render();}
  $('previous-date').addEventListener('click',()=>moveDate(-1));
  $('next-date').addEventListener('click',()=>moveDate(1));
  $('schedule-today').addEventListener('click',()=>{$('schedule-date').value=D.today();render();});
  for(const id of ['schedule-date','schedule-status','schedule-booked-only'])$(id).addEventListener('change',render);
  $('patient-search').addEventListener('input',render);
  window.addEventListener('storage',event=>{if(event.key===D.key){render();notify('利用者側の予約内容を同期しました。');}});
  window.addEventListener('focus',render);
  window.addEventListener('portal-demo-reset',async()=>{await store.reset();notify('予約デモも初期状態に戻しました。');});
  notify('同じブラウザの利用者予約と自動同期します。架空データを表示中。');render();
})();
