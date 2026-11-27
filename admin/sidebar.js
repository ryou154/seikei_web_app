const page = document.body;
const toggle = document.getElementById("admin-sidebar-toggle");
const overlay = document.getElementById("admin-sidebar-overlay");
function setSidebarOpen(open) { page.classList.toggle("sidebar-open", open); toggle?.setAttribute("aria-expanded", String(open)); if (overlay) overlay.hidden = !open; }
if (toggle) toggle.onclick = (event) => { event.preventDefault(); setSidebarOpen(!page.classList.contains("sidebar-open")); };
overlay?.addEventListener("click", () => setSidebarOpen(false));
document.querySelectorAll(".admin-sidebar-link").forEach((link) => link.addEventListener("click", () => setSidebarOpen(false)));
