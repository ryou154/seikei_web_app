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
  const authPage = document.body.dataset.authPage || "login";
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

  if (authPage === "login") {
    document.getElementById("email-register")?.remove();
    document.getElementById("password-reset")?.remove();
    document.querySelector(".terms-agreement")?.remove();
    document.getElementById("terms-summary")?.remove();
    document.querySelector("#email-login-form .small")?.remove();
    const links = document.createElement("nav");
    links.className = "auth-links";
    links.setAttribute("aria-label", "アカウント操作");
    links.innerHTML = '<a href="register.html">新規登録はこちら</a><a href="reset-password.html">パスワードを忘れた方はこちら</a>';
    document.getElementById("email-login-form")?.after(links);
  }

  if (authPage === "login") document.getElementById("email-login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      await sdk.signInWithEmailAndPassword(auth, document.getElementById("auth-email").value.trim(), document.getElementById("auth-password").value);
      document.getElementById("auth-password").value = "";
    });
  });

  const termsDocument = document.getElementById("terms-document");
  const termsAgreement = document.getElementById("terms-agreement");
  if (termsDocument && termsAgreement) {
    if (authPage === "register") {
      termsDocument.insertAdjacentHTML("beforeend", `
        <h3>画像の利用について</h3>
        <p>登録できる画像は、利用者本人の画像または撮影者と被写体から適切な許可を得た画像に限ります。第三者の顔写真、著作権で保護された画像、本人の同意が確認できない画像は登録しないでください。</p>
        <p>画像は明るさ、撮影角度、表情、髪型、メイク、カメラの性能などによって分析結果が変わります。画像から身元や健康状態を正確に判定する機能ではありません。</p>
        <h3>AIシミュレーションについて</h3>
        <p>AIが作成するAfter画像やコメントは、入力された希望を視覚化するための参考資料です。実際の骨格、皮膚、筋肉、脂肪、歯並びなどを診断するものではなく、画像どおりの結果になることを保証しません。</p>
        <p>「面長を短く見せる」「頬をすっきり見せる」などの細かな希望は、生成結果に反映される場合がありますが、反映の程度や見え方には個人差があります。生成画像を医療機関への説明に使う場合も、希望を伝える補助資料として利用してください。</p>
        <h3>施術情報とクリニック情報</h3>
        <p>本サービスに表示される施術例、費用、ダウンタイム、リスク、クリニック候補は、比較や相談準備のための一般的な情報です。掲載内容の正確性、最新性、特定の施術への適合性を保証するものではありません。</p>
        <p>施術を受けるかどうか、どの方法を選ぶかは、医師の診察、既往歴、服薬状況、アレルギー、希望する仕上がりなどを踏まえて判断してください。緊急性のある症状や健康上の不安がある場合は、本サービスを使わず医療機関へ相談してください。</p>
        <h3>履歴と保存データ</h3>
        <p>ログイン後に保存した設定、入力内容、分析結果、生成結果は、利用者が履歴を確認するために保存されます。画像を保存する場合は、画面上で画像保存に同意したときだけ保存対象になります。</p>
        <p>利用者は履歴画面から保存内容を確認し、不要になった履歴を削除できます。通信障害、端末の変更、サービス停止などにより、保存内容をいつでも復元できるとは限りません。</p>
        <h3>アカウントの管理</h3>
        <p>登録したメールアドレス、パスワード、確認メールは利用者自身が管理してください。第三者との共有、他人のアカウントの利用、本人になりすます登録は禁止します。不正利用に気付いた場合は、パスワード変更などの対策を行い、管理者へ連絡してください。</p>
        <h3>サービスの変更と問い合わせ</h3>
        <p>本サービスは、機能改善、セキュリティ対策、法令対応、保守などのため、画面、入力項目、分析方法、保存期間を変更することがあります。重要な変更がある場合は、画面上で案内します。</p>
        <p>本規約の内容を確認し、すべての内容に同意できる場合のみ、新規登録画面で同意チェックを入れてください。同意しない場合は、登録を中止してログイン画面へ戻ってください。</p>`);
    }
    termsAgreement.disabled = true;
    termsDocument.addEventListener("scroll", () => {
      if (termsDocument.scrollTop + termsDocument.clientHeight < termsDocument.scrollHeight - 4) return;
      termsAgreement.disabled = false;
      const notice = document.getElementById("terms-scroll-notice");
      if (notice) notice.textContent = "利用規約を確認しました。同意する場合はチェックしてください。";
    });
  }

  document.getElementById("email-register")?.addEventListener("click", () => {
    const form = document.getElementById("email-login-form");
    if (!form.reportValidity()) return;
    const termsAgreement = document.getElementById("terms-agreement");
    if (!termsAgreement?.checked) {
      termsAgreement?.focus();
      status.textContent = "新規登録には利用規約への同意が必要です。";
      return;
    }
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
