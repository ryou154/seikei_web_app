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
    "auth/network-request-failed": "Google/Firebase認証サーバーとの通信に失敗しました。Chromeの通常タブで開き直し、通信できる状態で再試行してください。",
    "auth/unauthorized-domain": "このアドレスはFirebase Authenticationの承認済みドメインに登録されていません。プロジェクト管理者に設定を依頼してください。",
    "auth/operation-not-allowed": "FirebaseでGoogleログインが有効になっていません。プロジェクト管理者に確認してください。"
  };
  const message = messages[error?.code] || "操作を完了できませんでした。時間をおいて再試行してください。";
  return error?.code === "auth/network-request-failed" || error?.code === "auth/unauthorized-domain"
    ? `${message}（${error.code}）`
    : message;
}

async function waitForAuth() {
  if (window.AppAuth?.firebaseSdk) return window.AppAuth;
  if (window.authCoreFailed) throw new Error("認証機能を読み込めませんでした。");
  await new Promise((resolve) => window.addEventListener("auth-state-changed", resolve, { once: true }));
  if (!window.AppAuth?.firebaseSdk) throw new Error("認証機能を読み込めませんでした。");
  return window.AppAuth;
}

try {
  const appAuth = await waitForAuth();
  const sdk = appAuth.firebaseSdk;
  const auth = appAuth.firebaseAuth;
  const status = document.getElementById("auth-status");
  const controls = document.getElementById("auth-controls");
  let busy = false;
  let ready = false;

  function updateControls() {
    if (controls) controls.disabled = busy || appAuth.busy || !ready;
  }
  window.addEventListener("auth-state-changed", updateControls);

  async function run(action) {
    if (busy) return;
    busy = true;
    updateControls();
    if (status) status.textContent = "処理しています…";
    try { await action(); }
    catch (error) { if (status) status.textContent = messageFor(error); }
    finally {
      busy = false;
      updateControls();
    }
  }

  document.getElementById("google-login")?.addEventListener("click", () => run(async () => {
    const provider = new sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await sdk.signInWithPopup(auth, provider);
  }));

  document.getElementById("email-login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await sdk.signInWithEmailAndPassword(auth, document.getElementById("auth-email").value.trim(), document.getElementById("auth-password").value);
      document.getElementById("auth-password").value = "";
    });
  });

  document.getElementById("email-register")?.addEventListener("click", () => {
    const form = document.getElementById("email-login-form");
    if (!form.reportValidity()) return;
    if (document.getElementById("auth-password").value.length < 8) {
      status.textContent = "新規登録のパスワードは8文字以上にしてください。";
      return;
    }
    run(async () => {
      const { user } = await sdk.createUserWithEmailAndPassword(auth, document.getElementById("auth-email").value.trim(), document.getElementById("auth-password").value);
      document.getElementById("auth-password").value = "";
      await sdk.sendEmailVerification(user);
      status.textContent = "確認メールを送りました。メールのリンクを開いてから「メール確認後に続ける」を押してください。";
    });
  });

  document.getElementById("password-reset")?.addEventListener("click", () => {
    const email = document.getElementById("auth-email");
    if (!email.reportValidity()) return;
    run(async () => {
      await sdk.sendPasswordResetEmail(auth, email.value.trim());
      status.textContent = "登録済みのメールアドレスであれば、再設定メールが届きます。受信箱を確認してください。";
    });
  });

  document.getElementById("verification-send")?.addEventListener("click", () => run(async () => {
    await sdk.sendEmailVerification(auth.currentUser);
    status.textContent = "確認メールを送りました。受信箱・迷惑メールフォルダを確認してください。";
  }));

  document.getElementById("verification-check")?.addEventListener("click", () => run(async () => {
    await appAuth.refreshSession();
  }));

  document.getElementById("logout")?.addEventListener("click", () => appAuth.logout());
  await appAuth.ready;
  ready = true;
  updateControls();
} catch {
  const status = document.getElementById("auth-status");
  if (status) status.textContent = "ログイン画面を読み込めませんでした。ページを再読み込みしてください。";
}
