const status = document.getElementById("auth-status") || document.getElementById("mypage-status");
const main = document.getElementById("app-content");
const isLoginPage = location.pathname.endsWith("/login.html") ||
  location.pathname.endsWith("/index.html") || location.pathname === "/";
let authorizedUid = null;
let generation = 0;
let busy = false;
let auth;
let sdk;
let firstCheckCompleted = false;
let resolveReady;
let redirectingToLogin = false;

const ready = new Promise((resolve) => { resolveReady = resolve; });

function completeReady(value) {
  if (firstCheckCompleted) return;
  firstCheckCompleted = true;
  resolveReady(Boolean(value));
}

function dispatch(name) {
  window.dispatchEvent(new Event(name));
}

function redirectToLogin() {
  if (isLoginPage || redirectingToLogin) return;
  redirectingToLogin = true;
  location.replace("/login.html");
}

function updateLoginElements(user) {
  const signedOut = document.getElementById("auth-signed-out");
  const signedIn = document.getElementById("auth-signed-in");
  const verificationActions = document.getElementById("verification-actions");
  const retry = document.getElementById("auth-retry");
  const account = document.getElementById("auth-account");
  if (signedOut) signedOut.hidden = Boolean(user);
  if (signedIn) signedIn.hidden = !user;
  if (verificationActions) verificationActions.hidden = !user || user.emailVerified;
  if (retry) retry.hidden = !user || !user.emailVerified || Boolean(authorizedUid);
  if (account) account.textContent = user?.email || "";
}

function lock(message) {
  authorizedUid = null;
  if (main) main.hidden = true;
  if (status && message) status.textContent = message;
  dispatch("app-locked");
}

function safeFailureMessage(error) {
  if (error?.name === "AbortError") return "サーバーの応答に時間がかかっています。もう一度お試しください。";
  return "ログインを確認できませんでした。再試行してください。";
}

async function getSessionResponse(user, forceRefresh = false) {
  const token = await user.getIdToken(forceRefresh);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch("/api/session", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function authorizeUser(user, forceRefresh = false) {
  let response;
  try {
    response = await getSessionResponse(user, forceRefresh);
  } catch (error) {
    if (error?.name !== "AbortError" && error?.name !== "TypeError") throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    response = await getSessionResponse(user, true);
  }
  if (response.status === 401) {
    // A sign-in may race a server key refresh. Force one new ID token and retry.
    response = await getSessionResponse(user, true);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "ログインを確認できませんでした。");
    error.status = response.status;
    throw error;
  }
  if (result.uid !== user.uid) throw new Error("Session mismatch");
  return result;
}

async function checkSession(user, forceRefresh = false) {
  const previouslyAuthorizedUid = authorizedUid;
  const currentGeneration = ++generation;
  lock(user ? "ログインを確認しています…" : "Googleまたはメールでログインしてください。");
  updateLoginElements(user);
  dispatch("auth-state-changed");

  if (!user) {
    completeReady(false);
    if (main) redirectToLogin();
    return false;
  }
  if (!user.emailVerified) {
    if (status) status.textContent = "メールの確認が必要です。確認メールのリンクを開いてから「メール確認後に続ける」を押してください。";
    completeReady(false);
    if (main) redirectToLogin();
    dispatch("auth-state-changed");
    return false;
  }

  try {
    const session = await authorizeUser(user, forceRefresh);
    if (currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return false;
    if (previouslyAuthorizedUid && previouslyAuthorizedUid !== user.uid) {
      lock("アカウントを切り替えました。画面を更新しています…");
      location.reload();
      completeReady(false);
      return false;
    }
    authorizedUid = session.uid;
    if (main) main.hidden = false;
    if (status) status.textContent = "ログインしました。";
    completeReady(true);
    dispatch("auth-state-changed");
    dispatch("app-authorized");
    if (isLoginPage) location.replace("/app.html");
    return true;
  } catch (error) {
    if (currentGeneration !== generation || auth.currentUser?.uid !== user.uid) return false;
    lock(error.status ? (error.message || "ログインを確認できませんでした。") : safeFailureMessage(error));
    updateLoginElements(user);
    if ((error.status === 401 || error.status === 403) && main) redirectToLogin();
    completeReady(false);
    dispatch("auth-state-changed");
    return false;
  }
}

document.getElementById("auth-retry")?.addEventListener("click", () => {
  if (!busy) void checkSession(auth?.currentUser || null, true);
});

function setBusy(value) {
  busy = value;
  dispatch("auth-state-changed");
}

try {
  const [{ initializeApp }, firebaseSdk, configResponse] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js"),
    fetch("/api/firebase-config", { cache: "no-store" })
  ]);
  if (!configResponse.ok) throw new Error("Firebase config unavailable");
  sdk = firebaseSdk;
  const app = initializeApp(await configResponse.json());
  auth = sdk.getAuth(app);
  auth.languageCode = "ja";
  const provider = new sdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  window.AppAuth = {
    ready,
    get uid() { return authorizedUid; },
    get email() { return auth.currentUser?.email || ""; },
    get displayName() { return auth.currentUser?.displayName || ""; },
    get signedIn() { return Boolean(auth.currentUser); },
    get currentUser() { return auth.currentUser || null; },
    get busy() { return busy; },
    get firebaseAuth() { return auth; },
    get firebaseSdk() { return sdk; },
    async refreshSession() {
      const user = auth.currentUser;
      if (user) await sdk.reload(user);
      return checkSession(auth.currentUser, true);
    },
    async logout() {
      if (busy) return;
      setBusy(true);
      lock("ログアウトしています…");
      try {
        await sdk.signOut(auth);
        if (main) redirectToLogin();
        else location.reload();
      } catch (error) {
        if (status) status.textContent = safeFailureMessage(error);
        if (auth.currentUser) await checkSession(auth.currentUser);
      } finally { setBusy(false); }
    },
    async fetch(url, options = {}) {
      const user = auth.currentUser;
      if (!authorizedUid || user?.uid !== authorizedUid) throw new Error("ログインしてください。");
      const { forceRefresh = false, ...requestOptions } = options;
      const send = async (refresh) => {
        const token = await user.getIdToken(refresh);
        if (auth.currentUser?.uid !== user.uid || authorizedUid !== user.uid) throw new Error("ログインが変更されました。");
        const headers = new Headers(options.headers);
        headers.set("Authorization", `Bearer ${token}`);
        return fetch(url, { ...requestOptions, headers });
      };
      let response = await send(forceRefresh);
      if (response.status === 401 && !forceRefresh) response = await send(true);
      if (response.status === 401 || response.status === 403) {
        lock("ログインまたは利用権限を確認できません。ログイン画面から再試行してください。");
        if (main) location.replace("/login.html");
        throw new Error("ログインまたは利用権限を確認できません。");
      }
      return response;
    }
  };

  updateLoginElements(auth.currentUser);
  dispatch("auth-state-changed");
  sdk.onAuthStateChanged(auth, (user) => { void checkSession(user); }, () => {
    lock("ログイン状態を読み込めませんでした。ページを再読み込みしてください。");
    completeReady(false);
    dispatch("auth-state-changed");
  });
} catch {
  window.authCoreFailed = true;
  lock("ログイン機能を読み込めませんでした。通信を確認してページを再読み込みしてください。");
  completeReady(false);
  dispatch("auth-state-changed");
  if (main) redirectToLogin();
}
