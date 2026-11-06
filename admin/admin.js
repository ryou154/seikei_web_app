const content = document.getElementById("admin-content");
const status = document.getElementById("admin-status");
function showStatus(message, error = false) { status.textContent = message; status.dataset.error = String(error); }
async function initializeAdmin() {
  if (!window.AppAuth?.uid) return;
  try {
    const response = await window.AppAuth.fetch("/api/admin/session");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.admin !== true) throw new Error(data.error || "管理者権限がありません。");
    content.hidden = false;
    showStatus(`${data.email || "管理者"} でログインしています。`);
    await loadSettings();
  } catch (error) { showStatus(error.message || "管理画面を開けませんでした。", true); }
}
async function loadSettings() {
  const response = await window.AppAuth.fetch("/api/admin/settings");
  const data = await response.json();
  document.getElementById("blocked-words").value = (data.blockedWords || []).join("\n");
}
document.getElementById("save-blocked-words").addEventListener("click", async () => {
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
document.getElementById("admin-logout").addEventListener("click", () => window.AppAuth?.logout());
window.addEventListener("app-authorized", initializeAdmin);
if (window.AppAuth?.uid) initializeAdmin();
