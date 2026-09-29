(() => {
  const bar = document.createElement("div");
  bar.className = "account-bar";
  bar.innerHTML = '<span id="account-status" role="status">ログインを確認中...</span><button type="button" id="account-open">ログイン / 新規登録</button>';
  document.querySelector(".app-header").append(bar);
  const dialog = document.createElement("dialog");
  dialog.className = "auth-dialog";
  dialog.setAttribute("aria-labelledby", "auth-title");
  dialog.innerHTML = `
    <div class="auth-heading"><h2 id="auth-title">アカウント</h2><button type="button" id="auth-close">閉じる</button></div>
    <div id="auth-login">
      <div class="auth-tabs" aria-label="登録方法">
        <button type="button" id="auth-login-tab" aria-pressed="true">ログイン</button>
        <button type="button" id="auth-register-tab" aria-pressed="false">新規登録</button>
      </div>
      <button type="button" id="auth-google" class="auth-google">Googleでログイン</button>
      <form id="auth-form">
        <label>メールアドレス<input id="auth-email" type="email" autocomplete="username" required maxlength="254"></label>
        <label>パスワード<input id="auth-password" type="password" autocomplete="current-password" required></label>
        <label id="auth-confirm-label" hidden>パスワード（確認）<input id="auth-confirm" type="password" autocomplete="new-password"></label>
        <button type="submit" id="auth-submit">ログイン</button>
      </form>
      <button type="button" id="auth-reset">パスワードを忘れた方</button>
    </div>
    <div id="auth-member" hidden>
      <p id="auth-member-email"></p>
      <div class="auth-actions">
        <button type="button" id="auth-resend">確認メールを送信</button>
        <button type="button" id="auth-refresh">確認済み・再確認</button>
        <button type="button" id="auth-logout">ログアウト</button>
      </div>
    </div>
    <p id="auth-message" class="auth-message" role="status" aria-live="polite"></p>`;
  document.body.append(dialog);
  const el = (id) => document.getElementById(id);
  let sdk, auth, account = null, register = false, busy = false, revision = 0;
  let setupError = "";
  function message(value, error = false) {
    el("auth-message").textContent = value;
    el("auth-message").dataset.error = String(error);
  }
  function publish(user) {
    const changed = account?.uid !== user?.uid;
    account = user;
    el("account-status").textContent = user ? user.email : "未ログイン";
    el("account-open").textContent = user ? "アカウント" : "ログイン / 新規登録";
    if (changed) window.dispatchEvent(new CustomEvent("app-auth-change", { detail: user }));
  }
  function show() {
    if (!dialog.open) dialog.showModal();
    if (setupError) message(setupError, true);
  }
  function setMode(value) {
    register = value;
    el("auth-login-tab").setAttribute("aria-pressed", String(!value));
    el("auth-register-tab").setAttribute("aria-pressed", String(value));
    el("auth-confirm-label").hidden = !value;
    el("auth-confirm").required = value;
    el("auth-password").autocomplete = value ? "new-password" : "current-password";
    el("auth-password").minLength = value ? 8 : 1;
    el("auth-submit").textContent = value ? "登録して確認メールを送信" : "ログイン";
    message("");
  }
  function errorText(error) {
    return ({
      "auth/invalid-credential": "メールアドレスまたはパスワードを確認してください。",
      "auth/email-already-in-use": "このメールアドレスでは登録できません。ログインまたはパスワード再設定をお試しください。",
      "auth/weak-password": "パスワードが安全性の条件を満たしていません。",
      "auth/password-does-not-meet-requirements": "パスワードが安全性の条件を満たしていません。",
      "auth/invalid-email": "メールアドレスを確認してください。",
      "auth/too-many-requests": "試行回数が多いため、時間を置いてお試しください。",
      "auth/popup-closed-by-user": "Googleログインがキャンセルされました。",
      "auth/popup-blocked": "ブラウザのポップアップを許可して、もう一度お試しください。",
      "auth/unauthorized-domain": "このサイトのドメインがFirebaseに登録されていません。",
      "auth/operation-not-allowed": "Firebaseでログイン方法を有効にしてください。",
      "auth/network-request-failed": "通信できません。接続を確認してください。"
    })[error.code] || "操作を完了できませんでした。時間を置いて再実行してください。";
  }
  async function action(fn) {
    if (busy) return;
    if (!auth) { message(setupError || "ログインを準備中です。", true); return; }
    busy = true;
    dialog.setAttribute("aria-busy", "true");
    const buttons = [...dialog.querySelectorAll("button")].filter((button) => button.id !== "auth-close");
    buttons.forEach((button) => { button.disabled = true; });
    message("");
    try { await fn(); } catch (error) { message(errorText(error), true); }
    finally {
      busy = false;
      dialog.removeAttribute("aria-busy");
      buttons.forEach((button) => { button.disabled = false; });
      el("auth-password").value = "";
      el("auth-confirm").value = "";
    }
  }
  async function checkUser(user) {
    const current = ++revision;
    if (account?.uid !== user?.uid) publish(null);
    el("auth-login").hidden = Boolean(user);
    el("auth-member").hidden = !user;
    if (!user) return;
    el("auth-member-email").textContent = user.email;
    el("auth-resend").hidden = user.emailVerified;
    if (!user.emailVerified) {
      publish(null);
      message("確認メールのリンクを開いてから「確認済み・再確認」を押してください。");
      return;
    }
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const data = await response.json();
      if (current !== revision) return;
      if (!response.ok) { publish(null); message(data.error || "ログインを確認できません。", true); return; }
      publish(data.user);
      message("ログインしました。入力設定を本人専用のクラウド履歴に保存できます。");
    } catch { if (current === revision) message("ログインを確認できません。接続を確認して再確認してください。", true); }
  }
  el("account-open").onclick = show;
  el("auth-close").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    el("auth-password").value = "";
    el("auth-confirm").value = "";
  });
  el("auth-login-tab").onclick = () => setMode(false);
  el("auth-register-tab").onclick = () => setMode(true);
  el("auth-google").onclick = () => action(async () => {
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await sdk.signInWithPopup(auth, provider);
  });
  el("auth-form").onsubmit = (event) => {
    event.preventDefault();
    action(async () => {
      const email = el("auth-email").value.trim();
      const password = el("auth-password").value;
      if (register) {
        if (password !== el("auth-confirm").value) { message("確認用パスワードが一致しません。", true); return; }
        const result = await sdk.createUserWithEmailAndPassword(auth, email, password);
        await sdk.sendEmailVerification(result.user);
        message("確認メールを送信しました。受信箱と迷惑メールをご確認ください。");
      } else {
        await sdk.signInWithEmailAndPassword(auth, email, password);
      }
    });
  };
  el("auth-reset").onclick = () => action(async () => {
    if (!el("auth-email").reportValidity()) return;
    try { await sdk.sendPasswordResetEmail(auth, el("auth-email").value.trim()); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    message("登録されている場合、パスワード再設定メールが届きます。");
  });
  el("auth-resend").onclick = () => action(async () => {
    await sdk.sendEmailVerification(auth.currentUser);
    message("確認メールを送信しました。");
  });
  el("auth-refresh").onclick = () => action(async () => {
    await sdk.reload(auth.currentUser);
    await checkUser(auth.currentUser);
  });
  el("auth-logout").onclick = () => action(async () => {
    await sdk.signOut(auth);
    message("ログアウトしました。");
  });
  const ready = (async () => {
    try {
      const response = await fetch("/api/auth/config", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const appSdk = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js");
      sdk = await import("https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js");
      auth = sdk.getAuth(appSdk.initializeApp(data.config));
      auth.languageCode = "ja";
      await sdk.setPersistence(auth, sdk.browserSessionPersistence);
      await new Promise((resolve) => {
        sdk.onAuthStateChanged(auth, (user) => { checkUser(user).finally(resolve); }, () => {
          message("ログイン状態を読み込めません。ページを再読み込みしてください。", true);
          resolve();
        });
      });
    } catch (error) {
      setupError = error.message?.includes("設定") ? error.message : "ログインを準備できませんでした。通信とFirebase設定を確認してください。";
      el("account-status").textContent = "ログイン設定待ち";
      message(setupError, true);
    }
  })();
  window.AppAuth = {
    ready,
    get user() { return account; },
    async requireUser() {
      await ready;
      if (!account) { show(); return false; }
      return true;
    },
    async headers() {
      if (!await this.requireUser()) throw new Error("ログインしてから再実行してください。");
      return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
    }
  };
})();
