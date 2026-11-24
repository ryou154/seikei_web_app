const status = document.getElementById("users-status");
const list = document.getElementById("users-list");
const search = document.getElementById("users-search");
let openDetail = null;
const filterBar = document.createElement("div"); filterBar.className = "admin-user-filters"; filterBar.innerHTML = "<label>状態 <select id=\"users-status-filter\"><option value=\"all\">すべて</option><option value=\"active\">有効</option><option value=\"disabled\">無効</option></select></label><label>並び順 <select id=\"users-sort\"><option value=\"created\">登録が新しい順</option><option value=\"lastSignIn\">最終ログイン順</option><option value=\"email\">メールアドレス順</option></select></label>"; document.querySelector(".admin-user-tools > div")?.after(filterBar);
function formatDate(value) { return value ? new Date(value).toLocaleString("ja-JP") : "未ログイン"; }
function formatProviders(providerIds) { const labels = { password: "メール／パスワード", "google.com": "Google", "apple.com": "Apple" }; return (providerIds || []).map((id) => labels[id] || id).join("、") || "不明"; }
function makeDetail() { const detail = document.createElement("section"); detail.className = "admin-user-detail"; detail.innerHTML = "<button type=\"button\">閉じる</button><h2></h2><p></p><dl></dl><h3>問い合わせ</h3><ul class=\"user-inquiries\"></ul><h3>シミュレーション履歴</h3><ul class=\"user-history\"></ul>"; detail.querySelector("button").addEventListener("click", (event) => { event.stopPropagation(); detail.remove(); if (openDetail === detail) openDetail = null; }); return detail; }
function render(users) {
  if (openDetail) openDetail.remove(); openDetail = null; list.replaceChildren();
  for (const user of users) {
    const row = document.createElement("article"); row.className = "admin-user-row"; row.tabIndex = 0; row.addEventListener("click", () => { if (row.nextElementSibling?.classList.contains("admin-user-detail")) { row.nextElementSibling.remove(); openDetail = null; } else loadDetail(user.uid, row); });
    const identity = document.createElement("div"); const email = document.createElement("strong"); const name = document.createElement("small");
    email.textContent = user.email || "メール未設定"; name.textContent = user.displayName || user.uid; identity.append(email, name);
    const area = document.createElement("div"); const prefecture = document.createElement("span"); const verified = document.createElement("small");
    prefecture.textContent = user.residencePrefecture || "都道府県未設定"; verified.textContent = user.emailVerified ? "メール確認済み" : "メール未確認"; area.append(prefecture, verified);
    const activity = document.createElement("div"); const state = document.createElement("span"); const dates = document.createElement("small");
    state.textContent = user.disabled ? "無効" : "有効"; dates.textContent = `登録 ${formatDate(user.createdAt)} / 最終ログイン ${formatDate(user.lastSignInAt)}`; activity.append(state, dates);
    row.append(identity, area, activity); list.append(row);
  }
}
async function loadDetail(uid, row) { const detail = makeDetail(); if (openDetail) openDetail.remove(); openDetail = detail; row.after(detail); try { const response = await window.AppAuth.fetch(`/api/admin/users/${encodeURIComponent(uid)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "詳細を読み込めませんでした。"); const user = data.user; detail.querySelector("h2").textContent = user.email || user.uid; detail.querySelector("p").textContent = `${user.residencePrefecture || "都道府県未設定"} / ${user.emailVerified ? "メール確認済み" : "メール未確認"} / ${user.disabled ? "無効" : "有効"}`; detail.querySelector("dl").textContent = `UID: ${user.uid} / ログイン方法: ${formatProviders(user.providerIds)} / 登録: ${formatDate(user.createdAt)} / 最終ログイン: ${formatDate(user.lastSignInAt)} / 履歴: ${user.historyCount}件 / 問い合わせ: ${user.inquiryCount}件（未回答 ${user.unansweredInquiryCount}件）`; detail.querySelector(".user-inquiries").replaceChildren(...(user.inquiries || []).map((item) => { const li = document.createElement("li"); li.textContent = `${item.subject || "無題"} / ${item.status === "answered" ? "回答済み" : "未回答"} / ${formatDate(item.createdAt)}`; return li; })); detail.querySelector(".user-history").replaceChildren(...(user.history || []).map((item) => { const li = document.createElement("li"); li.textContent = `${item.category || "未分類"} / ${item.generationStatus} / ${formatDate(item.savedAt)}`; return li; })); } catch (error) { status.textContent = error.message || "詳細の読み込みに失敗しました。"; } }
async function loadUsers() {
  status.textContent = "読み込み中です。";
  try { const params = new URLSearchParams(); if (search.value.trim()) params.set("search", search.value.trim()); params.set("status", document.getElementById("users-status-filter")?.value || "all"); params.set("sort", document.getElementById("users-sort")?.value || "created"); const response = await window.AppAuth.fetch(`/api/admin/users?${params.toString()}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "ユーザー情報を読み込めませんでした。"); render(data.users || []); status.textContent = `${data.users?.length || 0}件のユーザーを表示しています。`; }
  catch (error) { status.textContent = error.message || "読み込みに失敗しました。"; }
}
document.getElementById("users-reload")?.addEventListener("click", loadUsers); document.getElementById("users-search-button")?.addEventListener("click", loadUsers); document.getElementById("users-status-filter")?.addEventListener("change", loadUsers); document.getElementById("users-sort")?.addEventListener("change", loadUsers); window.addEventListener("app-authorized", loadUsers); if (window.AppAuth?.uid) loadUsers();
