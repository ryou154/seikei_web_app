const page = document.body;
const toggle = document.getElementById("admin-sidebar-toggle");
const overlay = document.getElementById("admin-sidebar-overlay");
function setSidebarOpen(open) {
  page.classList.toggle("sidebar-open", open);
  toggle?.setAttribute("aria-expanded", String(open));
  toggle?.setAttribute("aria-label", open ? "管理メニューを閉じる" : "管理メニューを開く");
  if (overlay) overlay.hidden = !open;
}
toggle?.addEventListener("click", () => setSidebarOpen(!page.classList.contains("sidebar-open")));
overlay?.addEventListener("click", () => setSidebarOpen(false));
document.querySelectorAll(".admin-sidebar-link").forEach((link) => link.addEventListener("click", () => setSidebarOpen(false)));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && page.classList.contains("sidebar-open")) setSidebarOpen(false);
});
