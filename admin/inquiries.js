const list = document.getElementById("inquiry-list"); const message = document.getElementById("inquiry-status-message"); const statusSelect = document.getElementById("inquiry-status"); const sortSelect = document.getElementById("inquiry-sort");
let initialized = false;
function render(items) { list.replaceChildren(); if (!items.length) { list.textContent = "問い合わせはありません。"; return; } const sorted = [...items].sort((a,b) => (sortSelect.value === "newest" ? -1 : 1) * String(a.createdAt).localeCompare(String(b.createdAt))); for (const item of sorted) { const card = document.createElement("article"); card.className = "inquiry-card"; card.innerHTML = `<div class="inquiry-card-head"><strong></strong><span></span></div><p class="inquiry-email"></p><p class="inquiry-message"></p><button class="sub-button inquiry-toggle" type="button"></button>`; card.querySelector("strong").textContent = item.subject; card.querySelector("span").textContent = new Date(item.createdAt).toLocaleString("ja-JP"); card.querySelector(".inquiry-email").textContent = item.email; card.querySelector(".inquiry-message").textContent = item.message; const button = card.querySelector("button"); button.textContent = item.status === "answered" ? "未回答に戻す" : "回答済みにする"; button.addEventListener("click", async () => { await window.AppAuth.fetch(`/api/admin/inquiries/${encodeURIComponent(item.id)}`, { method: "PUT", body: JSON.stringify({ status: item.status === "answered" ? "unanswered" : "answered" }) }); await load(); }); list.append(card); } }
async function load() { try { const response = await window.AppAuth.fetch(`/api/admin/inquiries?status=${encodeURIComponent(statusSelect.value)}`); const data = await response.json(); if (!response.ok) throw new Error(data.error || "読み込めませんでした。"); render(data.inquiries || []); message.textContent = ""; } catch (error) { message.textContent = error.message; } }
async function initialize() {
  if (initialized || !window.AppAuth?.uid) return;
  initialized = true;
  try {
    const response = await window.AppAuth.fetch("/api/admin/session");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.admin !== true) throw new Error(data.error || "管理者権限がありません。");
    document.body.style.visibility = "visible";
    await load();
  } catch {
    initialized = false;
    location.replace("/login.html");
  }
}
statusSelect.addEventListener("change", () => { if (initialized) void load(); });
sortSelect.addEventListener("change", () => { if (initialized) void load(); });
window.addEventListener("app-authorized", initialize);
if (window.AppAuth?.uid) void initialize();
