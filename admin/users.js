const status = document.getElementById("users-status");
const list = document.getElementById("users-list");
const search = document.getElementById("users-search");
function formatDate(value) { return value ? new Date(value).toLocaleString("ja-JP") : "未ログイン"; }
function render(users) {
  list.replaceChildren();
  for (const user of users) {
    const row = document.createElement("article"); row.className = "admin-user-row";
    const identity = document.createElement("div"); const email = document.createElement("strong"); const name = document.createElement("small");
    email.textContent = user.email || "メール未設定"; name.textContent = user.displayName || user.uid; identity.append(email, name);
    const area = document.createElement("div"); const prefecture = document.createElement("span"); const verified = document.createElement("small");
    prefecture.textContent = user.residencePrefecture || "都道府県未設定"; verified.textContent = user.emailVerified ? "メール確認済み" : "メール未確認"; area.append(prefecture, verified);
    const activity = document.createElement("div"); const state = document.createElement("span"); const dates = document.createElement("small");
    state.textContent = user.disabled ? "無効" : "有効"; dates.textContent = `登録 ${formatDate(user.createdAt)} / 最終ログイン ${formatDate(user.lastSignInAt)}`; activity.append(state, dates);
    row.append(identity, area, activity); list.append(row);
  }
}
async function loadUsers() {
  status.textContent = "読み込み中です。";
  try { const query = search.value.trim() ? `?search=${encodeURIComponent(search.value.trim())}` : ""; const response = await window.AppAuth.fetch(`/api/admin/users${query}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "ユーザー情報を読み込めませんでした。"); render(data.users || []); status.textContent = `${data.users?.length || 0}件のユーザーを表示しています。`; }
  catch (error) { status.textContent = error.message || "読み込みに失敗しました。"; }
}
document.getElementById("users-reload")?.addEventListener("click", loadUsers); document.getElementById("users-search-button")?.addEventListener("click", loadUsers); window.addEventListener("app-authorized", loadUsers); if (window.AppAuth?.uid) loadUsers();
