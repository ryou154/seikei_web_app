const status = document.getElementById("mypage-status");
const content = document.getElementById("app-content");
const byId = (id) => document.getElementById(id);
let busy = false;

function setStatus(id, message, isError = false) {
  const target = byId(id);
  target.textContent = message;
  target.dataset.error = String(isError);
}

function providersFor(user) {
  return new Set((user.providerData || []).map((provider) => provider.providerId));
}

function safeAuthMessage(error) {
  const messages = {
    "auth/wrong-password": "現在のパスワードを確認してください。",
    "auth/invalid-credential": "認証情報を確認してください。もう一度お試しください。",
    "auth/weak-password": "新しいパスワードは8文字以上にしてください。",
    "auth/password-does-not-meet-requirements": "新しいパスワードが条件を満たしていません。",
    "auth/requires-recent-login": "再認証が必要です。もう一度ログインしてください。",
    "auth/popup-closed-by-user": "再認証画面が閉じられました。もう一度お試しください。",
    "auth/popup-blocked": "ポップアップを許可して、もう一度お試しください。",
    "auth/network-request-failed": "通信できませんでした。接続を確認してください。",
    "auth/too-many-requests": "操作回数が多いため、少し待ってからお試しください。"
  };
  return messages[error?.code] || "操作を完了できませんでした。入力内容と通信状態を確認してください。";
}

async function request(path, options = {}) {
  const response = await window.AppAuth.fetch(path, {
    ...options,
    cache: "no-store",
    headers: options.body ? { "Content-Type": "application/json" } : options.headers
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("通信に失敗しました。ページを再読み込みして再試行してください。");
  return data;
}

function setBusy(button, value) {
  busy = value;
  button.disabled = value;
}

async function loadSavedData() {
  setStatus("data-status", "保存データを読み込んでいます…");
  try {
    const [settings, history] = await Promise.all([
      request("/api/account/settings"), request("/api/account/history")
    ]);
    const entries = Array.isArray(history.entries) ? history.entries : [];
    byId("settings-count").textContent = settings.settings ? "保存あり" : "保存なし";
    byId("history-count").textContent = String(entries.length);
    byId("image-count").textContent = `${window.MypageModel.imageCount(entries)}枚`;
    setStatus("data-status", "保存データを更新しました。");
    return true;
  } catch (error) {
    setStatus("data-status", error.message, true);
    return false;
  }
}

function waitForAuthClient() {
  if (window.AppAuth?.firebaseAuth && window.AppAuth?.firebaseSdk) return Promise.resolve(window.AppAuth);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("auth-state-changed", check);
      reject(new Error("認証機能を読み込めませんでした。"));
    }, 15000);
    function check() {
      if (!window.AppAuth?.firebaseAuth || !window.AppAuth?.firebaseSdk) return;
      window.clearTimeout(timeout);
      window.removeEventListener("auth-state-changed", check);
      resolve(window.AppAuth);
    }
    window.addEventListener("auth-state-changed", check);
    check();
  });
}

async function showUser(user) {
  if (!user || !window.AppAuth?.uid) return;
  if (!window.AppAuth?.uid || user.uid !== window.AppAuth.uid) return;
  const providers = providersFor(user);
  const isGoogle = providers.has("google.com");
    const hasPassword = window.MypageModel.usesPassword(user.providerData);
  byId("display-name").value = user.displayName || "";
  byId("account-email").value = user.email || "";
  byId("login-method").textContent = [
    isGoogle ? "Google" : null,
    hasPassword ? "メールとパスワード" : null
  ].filter(Boolean).join("、") || "その他のログイン方法";
  byId("email-verification").textContent = user.emailVerified ? "確認済み" : "未確認";
  byId("password-form").hidden = !hasPassword;
  byId("password-managed").hidden = hasPassword || !isGoogle;
  if (!hasPassword && !isGoogle) byId("password-managed").textContent = "このログイン方法ではパスワードを変更できません。";
  content.hidden = false;
  status.textContent = "マイページを読み込みました。";
  // The account panel should not wait for profile/history network requests.
  await loadSavedData();
}

async function initialize() {
  try {
    const appAuth = await waitForAuthClient();
    const sdk = appAuth.firebaseSdk;
    const auth = appAuth.firebaseAuth;

    window.addEventListener("app-authorized", () => { void showUser(auth.currentUser); });
    window.addEventListener("auth-state-changed", () => {
      if (window.AppAuth?.uid && !window.AppAuth.busy && !busy) void showUser(auth.currentUser);
    });

    byId("profile-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const button = event.currentTarget.querySelector('button[type="submit"]');
      const name = window.MypageModel.validateDisplayName(byId("display-name").value);
      if (!name) {
        setStatus("profile-status", "表示名は前後の空白を除いて1〜50文字で入力してください。", true);
        byId("display-name").focus();
        return;
      }
      setBusy(button, true);
      setStatus("profile-status", "表示名を更新しています…");
      try {
        await sdk.updateProfile(auth.currentUser, { displayName: name });
        byId("display-name").value = name;
        window.dispatchEvent(new Event("profile-updated"));
        setStatus("profile-status", "表示名を更新しました。");
      } catch (error) {
        setStatus("profile-status", safeAuthMessage(error), true);
      } finally { setBusy(button, false); }
    });

    byId("password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const currentPassword = byId("current-password").value;
      const newPassword = byId("new-password").value;
      if (newPassword.length < 8) {
        setStatus("password-status", "新しいパスワードは8文字以上にしてください。", true);
        byId("new-password").focus();
        return;
      }
      if (window.MypageModel.passwordMismatch(newPassword, byId("confirm-password").value)) {
        setStatus("password-status", "新しいパスワードと確認入力が一致しません。", true);
        byId("confirm-password").focus();
        return;
      }
      setBusy(button, true);
      setStatus("password-status", "パスワードを変更しています…");
      try {
        const credential = sdk.EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await sdk.reauthenticateWithCredential(auth.currentUser, credential);
        await sdk.updatePassword(auth.currentUser, newPassword);
        form.reset();
        setStatus("password-status", "パスワードを変更しました。");
      } catch (error) {
        setStatus("password-status", safeAuthMessage(error), true);
      } finally { setBusy(button, false); }
    });

    byId("reload-data").addEventListener("click", () => { if (!busy) void loadSavedData(); });
    byId("delete-settings").addEventListener("click", async (event) => {
      if (busy || !window.confirm("保存した入力設定を削除しますか？")) return;
      const button = event.currentTarget;
      setBusy(button, true);
      setStatus("data-status", "保存設定を削除しています…");
      try {
        await request("/api/account/settings", { method: "DELETE" });
        if (await loadSavedData()) setStatus("data-status", "保存設定を削除しました。");
      } catch (error) { setStatus("data-status", error.message, true); }
      finally { setBusy(button, false); }
    });
    byId("delete-history").addEventListener("click", async (event) => {
      if (busy || !window.confirm("履歴と対応するBefore／After画像をすべて削除します。この操作は元に戻せません。続けますか？")) return;
      const button = event.currentTarget;
      setBusy(button, true);
      setStatus("data-status", "履歴と画像を削除しています…");
      try {
        const result = await request("/api/account/history", { method: "DELETE" });
        if (Array.isArray(result.entries) && result.entries.length === 0) {
          byId("history-count").textContent = "0";
          byId("image-count").textContent = "0枚";
        }
        if (await loadSavedData()) setStatus("data-status", "履歴と画像をすべて削除しました。履歴0件、画像0枚です。");
      } catch (error) { setStatus("data-status", error.message, true); }
      finally { setBusy(button, false); }
    });

    byId("delete-confirmation").addEventListener("input", (event) => {
      byId("delete-account").disabled = event.currentTarget.value !== "削除" || busy;
    });
    byId("account-delete-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || byId("delete-confirmation").value !== "削除") return;
      const button = byId("delete-account");
      setBusy(button, true);
      byId("delete-confirmation").disabled = true;
      setStatus("delete-status", "本人確認を行っています…");
      try {
        const user = auth.currentUser;
        const providers = providersFor(user);
        if (providers.has("google.com")) {
          const provider = new sdk.GoogleAuthProvider();
          provider.setCustomParameters({ prompt: "select_account" });
          await sdk.reauthenticateWithPopup(user, provider);
        } else if (providers.has("password")) {
          const currentPassword = window.prompt("本人確認のため、現在のパスワードを入力してください。");
          if (currentPassword === null) throw Object.assign(new Error(), { code: "auth/popup-closed-by-user" });
          const credential = sdk.EmailAuthProvider.credential(user.email, currentPassword);
          await sdk.reauthenticateWithCredential(user, credential);
        } else {
          throw new Error("このログイン方法では再認証できません。サポートへお問い合わせください。");
        }
        setStatus("delete-status", "保存データとアカウントを削除しています…");
        const response = await window.AppAuth.fetch("/api/account", {
          method: "DELETE",
          forceRefresh: true,
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: "削除" })
        });
        if (!response.ok) throw new Error("アカウントを削除できませんでした。再認証してから再試行してください。");
        const result = await response.json().catch(() => ({}));
        if (result.deleted !== true) throw new Error("削除結果を確認できませんでした。時間をおいて再試行してください。");
        setStatus("delete-status", "アカウントを削除しました。ログイン画面へ移動します。");
        byId("display-name").value = "";
        byId("account-email").value = "";
        byId("settings-count").textContent = "—";
        byId("history-count").textContent = "0";
        byId("image-count").textContent = "0枚";
        await window.AppAuth.logout();
      } catch (error) {
        setStatus("delete-status", error.message?.startsWith("このログイン方法")
          ? error.message : safeAuthMessage(error), true);
        byId("delete-confirmation").disabled = false;
        setBusy(button, false);
        button.disabled = byId("delete-confirmation").value !== "削除";
      }
    });

    sdk.onAuthStateChanged(auth, (user) => {
      if (user && window.AppAuth?.uid === user.uid && !window.AppAuth.busy && !busy) void showUser(user);
    });
    const authorized = await appAuth.ready;
    if (authorized && window.AppAuth?.uid && auth.currentUser) void showUser(auth.currentUser);
    else status.textContent = "ログイン状態を確認できません。ログイン画面から再度ログインしてください。";
  } catch {
    status.textContent = "マイページを読み込めませんでした。通信状態を確認して再読み込みしてください。";
  }
}

initialize();
