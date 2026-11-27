import "./auth-core.js";
import { $, api } from "./clinic-partner-shared.js";
const page = document.body.dataset.partnerPage,
  draftKey = "meylon-clinic-application-draft";
const error = (t) => ($("partner-auth-error").textContent = t);
const auth = () => window.AppAuth;
const messages = {
  "auth/email-already-in-use":
    "このメールアドレスは登録済みです。ログインしてからクリニックの利用を申請できます。",
  "auth/invalid-email": "メールアドレスを確認してください。",
  "auth/weak-password": "別の強いパスワードを設定してください。",
  "auth/invalid-credential":
    "メールアドレスまたはパスワードを確認してください。",
  "auth/too-many-requests":
    "試行回数が多いため、時間をおいて再試行してください。",
  "auth/network-request-failed": "通信を確認して再試行してください。",
};
const showError = (e) =>
  error(
    e.code
      ? messages[e.code] ||
          "認証処理を完了できませんでした。時間をおいて再試行してください。"
      : e.message || "処理を完了できませんでした。",
  );
function clearPasswords() {
  for (const input of document.querySelectorAll(
    "input[autocomplete=new-password],input[autocomplete=current-password]",
  ))
    input.value = "";
}
function renderAccount() {
  const user = auth()?.currentUser;
  if (!user) return;
  $("current-account").hidden = false;
  $("current-account-email").textContent = user.email + " でログイン中";
  $("verification-panel").hidden = user.emailVerified;
  if (page === "register") {
    const form = $("partner-register-form");
    form.elements.email.value = user.email;
    form.elements.email.readOnly = true;
    $("registration-passwords").hidden = true;
    form.elements.password.required = false;
    form.elements.passwordConfirm.required = false;
    $("register-submit").textContent =
      "このアカウントでクリニック利用を申請する";
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (draft?.uid === user.uid)
        for (const [k, v] of Object.entries(draft.application))
          if (form.elements.namedItem(k)) form.elements.namedItem(k).value = v;
    } catch {}
  }
}
document.querySelectorAll("[data-password]").forEach((b) =>
  b.addEventListener("click", () => {
    const input = $(b.dataset.password),
      visible = input.type === "password";
    input.type = visible ? "text" : "password";
    b.textContent = visible ? "非表示" : "表示";
    b.setAttribute("aria-pressed", String(visible));
  }),
);
async function sendVerification() {
  if (!auth()?.currentUser) return;
  await auth().firebaseSdk.sendEmailVerification(auth().currentUser, {
    url: location.origin + "/clinic-partner-login.html",
  });
  $("auth-status").textContent =
    "確認メールを送信しました。メールのリンクを開いてから、この画面に戻ってください。";
}
async function applySaved() {
  const user = auth()?.currentUser;
  if (!user || !(await auth().refreshSession())) {
    renderAccount();
    return false;
  }
  const form = $("partner-register-form");
  if (!form) return true;
  if (!form.reportValidity()) return false;
  await api("/api/partner/apply", {
    method: "POST",
    body: {
      clinicName: form.elements.clinicName.value,
      officialUrl: form.elements.officialUrl.value,
      phone: form.elements.phone.value,
      name: form.elements.name.value,
    },
  });
  sessionStorage.removeItem(draftKey);
  $("auth-controls").hidden = true;
  $("verification-panel").hidden = true;
  $("registration-success").hidden = false;
  $("registration-success").focus();
  return true;
}
$("partner-login-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  error("");
  const form = event.currentTarget,
    submit = form.querySelector("button[type=submit]");
  if (!form.reportValidity()) return;
  submit.disabled = true;
  try {
    await auth().firebaseSdk.signInWithEmailAndPassword(
      auth().firebaseAuth,
      form.elements.email.value.trim(),
      form.elements.password.value,
    );
    clearPasswords();
    if (await auth().refreshSession()) location.assign("clinic-partner.html");
    else renderAccount();
  } catch (e) {
    showError(e);
  } finally {
    submit.disabled = false;
  }
});
$("partner-register-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  error("");
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const submit = $("register-submit");
  submit.disabled = true;
  try {
    if (!auth().currentUser) {
      if (form.elements.password.value !== form.elements.passwordConfirm.value)
        throw Error("確認用パスワードが一致していません。");
      await auth().firebaseSdk.createUserWithEmailAndPassword(
        auth().firebaseAuth,
        form.elements.email.value.trim(),
        form.elements.password.value,
      );
      clearPasswords();
    }
    const user = auth().currentUser;
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({
        uid: user.uid,
        application: {
          clinicName: form.elements.clinicName.value,
          officialUrl: form.elements.officialUrl.value,
          phone: form.elements.phone.value,
          name: form.elements.name.value,
        },
      }),
    );
    renderAccount();
    if (!user.emailVerified) {
      await sendVerification();
      return;
    }
    await applySaved();
  } catch (e) {
    showError(e);
    renderAccount();
  } finally {
    submit.disabled = false;
  }
});
$("send-verification").addEventListener("click", async () => {
  try {
    await sendVerification();
  } catch (e) {
    showError(e);
  }
});
$("refresh-verification").addEventListener("click", async () => {
  try {
    if (await auth().refreshSession()) {
      renderAccount();
      if (page === "register") await applySaved();
      else location.assign("clinic-partner.html");
    } else renderAccount();
  } catch (e) {
    showError(e);
  }
});
$("switch-account").addEventListener("click", async () => {
  sessionStorage.removeItem(draftKey);
  await auth()?.logout();
});
$("forgot-password")?.addEventListener("click", async () => {
  error("");
  const input = $("partner-login-form").elements.email;
  if (!input.reportValidity()) return;
  try {
    await auth().firebaseSdk.sendPasswordResetEmail(
      auth().firebaseAuth,
      input.value.trim(),
      { url: location.origin + "/clinic-partner-login.html" },
    );
    $("auth-status").textContent =
      "該当アカウントがある場合、パスワード再設定メールが届きます。";
  } catch (e) {
    showError(e);
  }
});
if (window.AppAuth) {
  await window.AppAuth.ready;
  $("auth-controls").disabled = false;
  renderAccount();
} else
  $("auth-status").textContent =
    "認証機能に接続できません。ページを再読み込みしてください。";
