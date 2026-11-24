const status = document.getElementById("users-status");
const list = document.getElementById("users-list");
const search = document.getElementById("users-search");
const detail = document.createElement("section"); detail.className = "admin-user-detail"; detail.hidden = true; detail.innerHTML = "<button type=\"button\">閉じる</button><h2></h2><p></p><dl></dl>"; document.getElementById("admin-content")?.append(detail);
function formatDate(value) { return value ? new Date(value).toLocaleString("ja-JP") : "未ログイン"; }
function render(users) {
  list.replaceChildren();
  for (const user of users) {
    const row = document.createElement("article"); row.className = "admin-user-row"; row.tabIndex = 0; row.addEventListener("click", () => loadDetail(user.uid));
    const identity = document.createElement("div"); const email = document.createElement("strong"); const name = document.createElement("small");
    email.textContent = user.email || "メール未設定"; name.textContent = user.displayName || user.uid; identity.append(email, name);
    const area = document.createElement("div"); const prefecture = document.createElement("span"); const verified = document.createElement("small");
    prefecture.textContent = user.residencePrefecture || "都道府県未設定"; verified.textContent = user.emailVerified ? "メール確認済み" : "メール未確認"; area.append(prefecture, verified);
    const activity = document.createElement("div"); const state = document.createElement("span"); const dates = document.createElement("small");
    state.textContent = user.disabled ? "無効" : "有効"; dates.textContent = `登録 ${formatDate(user.createdAt)} / 最終ログイン ${formatDate(user.lastSignInAt)}`; activity.append(state, dates);
    row.append(identity, area, activity); list.append(row);
  }
}
async function loadDetail(uid) { try { const response = await window.AppAuth.fetch(`/api/admin/users/${encodeURIComponent(uid)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "詳細を読み込めませんでした。"); const user = data.user; detail.hidden = false; detail.querySelector("h2").textContent = user.email || user.uid; detail.querySelector("p").textContent = `${user.residencePrefecture || "都道府県未設定"} / ${user.emailVerified ? "メール確認済み" : "メール未確認"} / ${user.disabled ? "無効" : "有効"}`; detail.querySelector("dl").textContent = `UID: ${user.uid} / 登録: ${formatDate(user.createdAt)} / 最終ログイン: ${formatDate(user.lastSignInAt)} / 履歴: ${user.historyCount}件 / 問い合わせ: ${user.inquiryCount}件（未回答 ${user.unansweredInquiryCount}件）`; } catch (error) { status.textContent = error.message || "詳細の読み込みに失敗しました。"; } }
async function loadUsers() {
  status.textContent = "読み込み中です。";
  try { const query = search.value.trim() ? `?search=${encodeURIComponent(search.value.trim())}` : ""; const response = await window.AppAuth.fetch(`/api/admin/users${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "ユーザー情報を読み込めませんでした。"); render(data.users || []); status.textContent = `${data.users?.length || 0}件のユーザーを表示しています。`; }
  catch (error) { status.textContent = error.message || "読み込みに失敗しました。"; }
}
document.getElementById("users-reload")?.addEventListener("click", loadUsers); document.getElementById("users-search-button")?.addEventListener("click", loadUsers); detail.querySelector("button")?.addEventListener("click", () => { detail.hidden = true; }); window.addEventListener("app-authorized", loadUsers); if (window.AppAuth?.uid) loadUsers();
