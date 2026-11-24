const content = document.getElementById("admin-content");
const status = document.getElementById("admin-status");
const page = document.body;
function showStatus(message, error = false) { if (!status) return; status.textContent = message; status.dataset.error = String(error); }
async function initializeAdmin() {
  if (!window.AppAuth?.uid) return;
  try {
    const response = await window.AppAuth.fetch("/api/admin/session");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.admin !== true) throw new Error(data.error || "管理者権限がありません。");
    page.style.visibility = "visible";
    if (content) content.hidden = false;
    showStatus(`${data.email || "管理者"} でログインしています。`);
  } catch (error) { showStatus(error.message || "管理画面を開けませんでした。", true); }
}
document.getElementById("admin-logout")?.addEventListener("click", () => window.AppAuth?.logout());
window.addEventListener("app-authorized", initializeAdmin);
if (window.AppAuth?.uid) initializeAdmin();
