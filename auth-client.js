const element = (id) => document.getElementById(id);
const status = element("auth-status");
const controls = element("auth-controls");
const main = element("app-content");
let authorizedUid = null;
let generation = 0;
let busy = false;

function notifyAuthState() {
  window.dispatchEvent(new Event("auth-state-changed"));
}

function lock(message) {
  authorizedUid = null;
  if (main) main.hidden = true;
  status.textContent = message;
  window.dispatchEvent(new Event("app-locked"));
}

try {
  const [{ initializeApp }, sdk, configResponse] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js"),
    fetch("/api/firebase-config", { cache: "no-store" })
  ]);
  if (!configResponse.ok) throw new Error("設定を読み込めませんでした。");
  const auth = sdk.getAuth(initializeApp(await configResponse.json()));
  auth.languageCode = "ja";
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  let lastAuthorizedUid = null;

  function messageFor(error) {
    const messages = {
      "auth/invalid-credential": "メールアドレスまたはパスワードを確認してください。",
      "auth/invalid-email": "メールアドレスを確認してください。",
      "auth/email-already-in-use": "登録できませんでした。ログインまたはパスワード再設定をお試しください。",
      "auth/weak-password": "パスワードは8文字以上で設定してください。",
      "auth/password-does-not-meet-requirements": "パスワードが条件を満たしていません。8文字以上で設定してください。",
      "auth/popup-closed-by-user": "ログイン画面が閉じられました。もう一度お試しください。",
      "auth/popup-blocked": "ポップアップを許可して、もう一度Googleログインを押してください。",
      "auth/account-exists-with-different-credential": "以前使用したログイン方法でログインしてください。",
      "auth/too-many-requests": "操作回数が多いため、少し待ってからお試しください。",
      "auth/network-request-failed": "通信できませんでした。接続を確認して再試行してください。"
    };
    return messages[error.code] || "操作を完了できませんでした。時間をおいて再試行してください。";
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    controls.disabled = true;
    notifyAuthState();
    status.textContent = "処理しています…";
    try { await action(); }
    catch (error) { status.textContent = messageFor(error); }
    finally {
      busy = false;
      controls.disabled = false;
      notifyAuthState();
    }
  }

  async function checkSession(user) {
    const currentGeneration = ++generation;
    lock(user ? "ログインを確認しています…" : "Googleまたはメールでログインしてください。");
    element("auth-signed-out").hidden = Boolean(user);
    element("auth-signed-in").hidden = !user;
    element("verification-actions").hidden = !user || user.emailVerified;
    element("auth-account").textContent = user?.email || "";
    notifyAuthState();
    if (lastAuthorizedUid && lastAuthorizedUid !== user?.uid) {
      location.reload();
      return;
    }
    if (!user) return;
    if (!user.emailVerified) {
      status.textContent = "メールの確認が必要です。確認メールのリンクを開いてから「メール確認後に続ける」を押してください。";
      return;
    }
    try {
      const token = await user.getIdToken(true);
      const response = await fetch("/api/session", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      const session = await response.json();
      if (currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return;
      if (!response.ok) {
        status.textContent = session.error || "ログインを確認できませんでした。";
        return;
      }
      if (session.uid !== user.uid) throw new Error("Session mismatch");
      authorizedUid = session.uid;
      lastAuthorizedUid = session.uid;
      if (main) main.hidden = false;
      status.textContent = "ログインしました。入力設定と履歴は利用者ごとにクラウド保存されます。";
      window.dispatchEvent(new Event("app-authorized"));
      if (location.pathname.endsWith("/login.html") || location.pathname.endsWith("/index.html") || location.pathname === "/") location.replace("app.html");
    } catch {
      if (currentGeneration === generation) status.textContent = "ログインを確認できませんでした。ページを再読み込みしてください。";
    }
  }

  window.AppAuth = {
    get uid() { return authorizedUid; },
    get email() { return auth.currentUser?.email || ""; },
    get signedIn() { return Boolean(auth.currentUser); },
    get busy() { return busy; },
    logout() {
      return run(async () => {
        ++generation;
        lock("ログアウトしています…");
        await sdk.signOut(auth);
        location.reload();
      });
    },
    async fetch(url, options = {}) {
      const user = auth.currentUser;
      if (!authorizedUid || user?.uid !== authorizedUid) throw new Error("ログインしてください。");
      const token = await user.getIdToken();
      if (auth.currentUser?.uid !== user.uid || authorizedUid !== user.uid) throw new Error("ログインが変更されました。");
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      const response = await fetch(url, { ...options, headers });
      if (response.status === 401 || response.status === 403) {
        lock("ログインまたは利用権限を確認できません。ログアウトして、再度ログインしてください。");
        throw new Error("ログインまたは利用権限を確認できません。");
      }
      return response;
    }
  };

  element("google-login").addEventListener("click", () => run(() => sdk.signInWithPopup(auth, provider)));
  element("email-login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await sdk.signInWithEmailAndPassword(auth, element("auth-email").value.trim(), element("auth-password").value);
      element("auth-password").value = "";
    });
  });
  element("email-register").addEventListener("click", () => {
    if (!element("email-login-form").reportValidity()) return;
    if (element("auth-password").value.length < 8) {
      status.textContent = "新規登録のパスワードは8文字以上にしてください。";
      return;
    }
    run(async () => {
      const { user } = await sdk.createUserWithEmailAndPassword(auth, element("auth-email").value.trim(), element("auth-password").value);
      element("auth-password").value = "";
      await sdk.sendEmailVerification(user);
      status.textContent = "確認メールを送りました。メールのリンクを開いてから「メール確認後に続ける」を押してください。";
    });
  });
  element("password-reset").addEventListener("click", () => {
    if (!element("auth-email").reportValidity()) return;
    run(async () => {
      await sdk.sendPasswordResetEmail(auth, element("auth-email").value.trim());
      status.textContent = "登録済みのメールアドレスであれば、再設定メールが届きます。受信箱を確認してください。";
    });
  });
  element("verification-send").addEventListener("click", () => run(async () => {
    await sdk.sendEmailVerification(auth.currentUser);
    status.textContent = "確認メールを送りました。受信箱・迷惑メールフォルダを確認してください。";
  }));
  element("verification-check").addEventListener("click", () => run(async () => {
    await sdk.reload(auth.currentUser);
    await checkSession(auth.currentUser);
  }));
  element("logout").addEventListener("click", () => window.AppAuth.logout());
  sdk.onAuthStateChanged(auth, (user) => { void checkSession(user); }, () => lock("ログインを読み込めませんでした。再読み込みしてください。"));
  controls.disabled = false;
  notifyAuthState();
} catch {
  lock("ログイン機能を読み込めませんでした。インターネット接続を確認し、ページを再読み込みしてください。");
}
