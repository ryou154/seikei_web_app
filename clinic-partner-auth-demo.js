(() => {
  'use strict';
  const key='meylon-clinic-partner-demo-session-v1',$=id=>document.getElementById(id);
  function readSession(){try{const s=JSON.parse(sessionStorage.getItem(key)||'null');return s?.demo===true&&typeof s.name==='string'?s:null;}catch{return null;}}
  function saveSession(profile){sessionStorage.setItem(key,JSON.stringify({demo:true,name:profile.name||'デモ担当者',role:profile.role||'管理者'}));}
  function error(message){const field=$('partner-auth-error');if(field)field.textContent=message;}
  function erasePasswords(form){for(const input of form.querySelectorAll('input[type=password],input[data-demo-password]'))input.value='';}
  document.querySelectorAll('[data-password]').forEach(button=>button.addEventListener('click',()=>{const input=$(button.dataset.password),visible=input.type==='password';input.dataset.demoPassword='true';input.type=visible?'text':'password';button.textContent=visible?'非表示':'表示';button.setAttribute('aria-pressed',String(visible));}));
  const login=$('partner-login-form');
  login?.addEventListener('submit',event=>{event.preventDefault();error('');if(!login.reportValidity())return;try{saveSession({name:'デモ担当者',role:'管理者'});erasePasswords(login);location.assign('clinic-portal-demo.html#bookings');}catch{error('このブラウザでデモセッションを保存できません。「ログインせずに管理画面デモを見る」からお試しください。');}});
  const register=$('partner-register-form');
  register?.addEventListener('submit',event=>{event.preventDefault();error('');if(!register.reportValidity())return;const f=register.elements,name=f.namedItem('name').value.trim(),clinicName=f.namedItem('clinicName').value.trim();if(!name||!clinicName){error('クリニック名と担当者名を入力してください。');return;}if(f.namedItem('password').value!==f.namedItem('passwordConfirm').value){error('確認用パスワードが一致していません。');f.namedItem('passwordConfirm').focus();return;}try{saveSession({name,role:f.namedItem('role').value});erasePasswords(register);register.hidden=true;$('registration-summary').textContent=`${clinicName} ／ ${name}様の登録フローを確認しました。`;$('registration-success').hidden=false;$('registration-success').focus();}catch{error('デモセッションを保存できませんでした。ブラウザの設定をご確認ください。');}});
  $('forgot-password')?.addEventListener('click',()=>{$('reset-demo-status').textContent='';$('reset-demo-dialog').showModal();});
  $('close-reset-demo')?.addEventListener('click',()=>$('reset-demo-dialog').close());
  $('reset-demo-form')?.addEventListener('submit',event=>{event.preventDefault();if(!event.currentTarget.reportValidity())return;$('reset-demo-status').textContent='再設定メールの案内を確認しました（デモ）。メールは送信していません。';});
  const account=$('partner-demo-session');
  if(account){const session=readSession();if(session){const label=document.createElement('span');label.textContent=`${session.name} · ${session.role}（デモ）`;const logout=document.createElement('button');logout.type='button';logout.textContent='ログアウト';logout.addEventListener('click',()=>{sessionStorage.removeItem(key);location.assign('clinic-partner-login.html');});account.replaceChildren(label,logout);const name=document.querySelector('.sidebar-account b');if(name)name.textContent=session.name;}else{const loginLink=document.createElement('a');loginLink.href='clinic-partner-login.html';loginLink.textContent='担当者ログイン';const signup=document.createElement('a');signup.href='clinic-partner-register.html';signup.textContent='新規登録';account.replaceChildren(loginLink,signup);}}
})();
