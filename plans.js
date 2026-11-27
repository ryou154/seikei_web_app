const content = document.getElementById("plans-content");
const status = document.getElementById("plans-status");
function selectPlan(plan) { if (plan === "無料プラン") { localStorage.removeItem("seikei-selected-plan"); localStorage.removeItem("meylon-trial-started-at"); } else { localStorage.setItem("seikei-selected-plan", plan); if (!localStorage.getItem("meylon-trial-started-at")) localStorage.setItem("meylon-trial-started-at", String(Date.now())); } status.textContent = `${plan}へ切り替えました。`; }
document.querySelectorAll("[data-plan]").forEach((button) => button.addEventListener("click", () => selectPlan(button.dataset.plan)));
window.addEventListener("app-authorized", () => { content.hidden = false; });
if (window.AppAuth?.uid) content.hidden = false;
const addButton = document.createElement("button"); addButton.type = "button"; addButton.textContent = "15回追加（580円・テスト）"; content.querySelector("section")?.append(addButton); addButton.addEventListener("click", () => { const plan = window.PlanPolicy.currentPlanType(); if (plan === "free") { status.textContent = "追加シミュレーションは有料プランで利用できます。"; return; } const total = window.PlanPolicy.addBonusSimulations(15, plan); status.textContent = `シミュレーションを15回追加しました。追加残数：${total}回`; });
