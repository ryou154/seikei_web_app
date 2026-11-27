const content = document.getElementById("plans-content");
const status = document.getElementById("plans-status");
const backLink = document.createElement("a"); backLink.href = "mypage.html"; backLink.textContent = "マイページへ戻る"; backLink.className = "sub-button"; content.querySelector("section")?.prepend(backLink);
const state = document.createElement("p"); state.id = "plans-state"; content.querySelector("section")?.prepend(state);
function refreshState() { const type = window.PlanPolicy.currentPlanType(); const labels = { free: "無料プラン", trial: "無料トライアル", monthly: "月額プラン", annual: "年額プラン" }; const ends = Number(localStorage.getItem("meylon-plan-ends-at")); const cancelled = localStorage.getItem("meylon-plan-cancelled") === "true"; state.textContent = `現在のプラン：${labels[type]}${ends ? ` / 利用期限：${new Date(ends).toLocaleDateString("ja-JP")}` : ""}${cancelled ? " / 次回更新停止済み" : ""}`; }
function selectPlan(plan) { if (plan === "無料プラン") { localStorage.removeItem("seikei-selected-plan"); localStorage.removeItem("meylon-trial-started-at"); localStorage.removeItem("meylon-plan-ends-at"); localStorage.removeItem("meylon-plan-cancelled"); } else { localStorage.setItem("seikei-selected-plan", plan); if (!localStorage.getItem("meylon-trial-started-at")) localStorage.setItem("meylon-trial-started-at", String(Date.now())); const days = plan === "年額プラン" ? 365 : 30; localStorage.setItem("meylon-plan-ends-at", String(Date.now() + days * 24 * 60 * 60 * 1000)); localStorage.removeItem("meylon-plan-cancelled"); } status.textContent = `${plan}へ切り替えました。`; refreshState(); }
document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => selectPlan(button.dataset.plan)));
window.addEventListener("app-authorized", () => { content.hidden = false; });
if (window.AppAuth?.uid) content.hidden = false;
refreshState();
