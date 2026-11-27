const content = document.getElementById("plans-content");
const status = document.getElementById("plans-status");
function selectPlan(plan) { if (plan === "無料プラン") { localStorage.removeItem("seikei-selected-plan"); localStorage.removeItem("meylon-trial-started-at"); } else { localStorage.setItem("seikei-selected-plan", plan); if (!localStorage.getItem("meylon-trial-started-at")) localStorage.setItem("meylon-trial-started-at", String(Date.now())); } status.textContent = `${plan}へ切り替えました。`; }
document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => selectPlan(button.dataset.plan)));
window.addEventListener("app-authorized", () => { content.hidden = false; });
if (window.AppAuth?.uid) content.hidden = false;
