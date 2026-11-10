const content = document.getElementById("admin-content");
const status = document.getElementById("admin-status");
const page = document.body;
const sidebarToggle = document.getElementById("admin-sidebar-toggle");
const sidebarOverlay = document.getElementById("admin-sidebar-overlay");
function showStatus(message, error = false) { if (!status) return; status.textContent = message; status.dataset.error = String(error); }
async function initializeAdmin() {
  if (!window.AppAuth?.uid) return;
  try {
    const response = await window.AppAuth.fetch("/api/admin/session");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.admin !== true) throw new Error(data.error || "管理者権限がありません。");
    if (content) content.hidden = false;
    showStatus(`${data.email || "管理者"} でログインしています。`);
    await loadSettings();
  } catch (error) { showStatus(error.message || "管理画面を開けませんでした。", true); }
}
async function loadSettings() {
  const response = await window.AppAuth.fetch("/api/admin/settings");
  const data = await response.json();
  renderBlockedWords(data);
}
function renderBlockedWords(data) {
  const textarea = document.getElementById("blocked-words");
  if (textarea) textarea.value = (data.blockedWords || []).join("\n");
  const list = document.getElementById("blocked-word-list");
  if (list) { list.replaceChildren(); for (const word of data.blockedWords || []) { const item = document.createElement("li"); item.textContent = word; const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "削除"; remove.className = "sub-button"; remove.addEventListener("click", () => saveBlockedWords((data.blockedWords || []).filter((entry) => entry !== word))); item.append(remove); list.append(item); } }
  const history = document.getElementById("blocked-word-history");
  if (history) { history.replaceChildren(); for (const item of [...(data.blockedWordHistory || [])].reverse()) { const row = document.createElement("tr"); for (const value of [item.changedAt ? new Date(item.changedAt).toLocaleString("ja-JP") : "", item.action || "", item.word || "", item.actor || ""]) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); } history.append(row); } }
}
async function saveBlockedWords(blockedWords) { const status = document.getElementById("blocked-words-status"); try { const response = await window.AppAuth.fetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ blockedWords }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "保存できませんでした。"); renderBlockedWords(data); if (status) status.textContent = "保存しました。"; } catch (error) { if (status) status.textContent = error.message || "保存できませんでした。"; } }
document.getElementById("save-blocked-words")?.addEventListener("click", async () => {
  const status = document.getElementById("blocked-words-status");
  try {
    const blockedWords = document.getElementById("blocked-words").value.split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
    const response = await window.AppAuth.fetch("/api/admin/settings", { method: "PUT", body: JSON.stringify({ blockedWords }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存できませんでした。");
    document.getElementById("blocked-words").value = (data.blockedWords || []).join("\n");
    status.textContent = "禁止ワードを保存しました。";
  } catch (error) { status.textContent = error.message || "保存できませんでした。"; }
});
document.getElementById("add-blocked-word")?.addEventListener("click", async () => { const input = document.getElementById("blocked-word-input"); const word = input.value.trim(); if (!word) return; const response = await window.AppAuth.fetch("/api/admin/settings"); const data = await response.json(); await saveBlockedWords([...(data.blockedWords || []), word]); input.value = ""; });
document.getElementById("admin-logout")?.addEventListener("click", () => window.AppAuth?.logout());
function setSidebarOpen(open) { page.classList.toggle("sidebar-open", open); sidebarToggle?.setAttribute("aria-expanded", String(open)); if (sidebarOverlay) sidebarOverlay.hidden = !open; }
sidebarToggle?.addEventListener("click", () => setSidebarOpen(!page.classList.contains("sidebar-open")));
sidebarOverlay?.addEventListener("click", () => setSidebarOpen(false));
document.querySelectorAll(".admin-sidebar-link").forEach((link) => link.addEventListener("click", () => { document.querySelectorAll(".admin-sidebar-link").forEach((item) => item.classList.remove("is-active")); link.classList.add("is-active"); setSidebarOpen(false); }));
window.addEventListener("app-authorized", initializeAdmin);
if (window.AppAuth?.uid) initializeAdmin();
