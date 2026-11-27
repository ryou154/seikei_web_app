const PLAN_POLICIES = Object.freeze({
  free: { simulationLimit: 10, chatLimit: 0, historyLimit: 10, directions: ["front"], ads: true },
  trial: { simulationLimit: 10, chatLimit: 5, historyLimit: 3, directions: ["front", "front-left", "front-right", "left", "right", "up", "down"], ads: false },
  monthly: { simulationLimit: 30, chatLimit: 5, historyLimit: 10, directions: ["front", "front-left", "front-right", "left", "right", "up", "down"], ads: false },
  annual: { simulationLimit: 365, chatLimit: Infinity, historyLimit: 50, directions: ["front", "front-left", "front-right", "left", "right", "up", "down"], ads: false }
});

function getPlanPolicy(planType = "free") { return PLAN_POLICIES[planType] || PLAN_POLICIES.free; }
function isPaidPlan(planType) { return planType === "monthly" || planType === "annual"; }
function canUseChat(planType, used = 0) { const limit = getPlanPolicy(planType).chatLimit; return limit === Infinity || used < limit; }
function canGenerateDirection(planType, direction) { return getPlanPolicy(planType).directions.includes(direction); }
function currentPlanType() { const selected = localStorage.getItem("seikei-selected-plan"); const trialStarted = Number(localStorage.getItem("meylon-trial-started-at")); if ((selected === "月額プラン" || selected === "年額プラン") && Number.isFinite(trialStarted) && trialStarted > 0 && Date.now() < trialStarted + 30 * 24 * 60 * 60 * 1000) return "trial"; return selected === "月額プラン" ? "monthly" : selected === "年額プラン" ? "annual" : "free"; }
function usageKey(planType = currentPlanType()) { const now = new Date(); const period = planType === "annual" ? String(now.getFullYear()) : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; return `meylon-plan-usage:${planType}:${period}`; }
function getUsage(planType = currentPlanType()) { const raw = JSON.parse(localStorage.getItem(usageKey(planType)) || "{}"); return { simulations: Number(raw.simulations) || 0, chats: Number(raw.chats) || 0 }; }
function consumeSimulation(planType = currentPlanType()) { const usage = getUsage(planType); const policy = getPlanPolicy(planType); if (usage.simulations >= policy.simulationLimit) return false; usage.simulations += 1; localStorage.setItem(usageKey(planType), JSON.stringify(usage)); return true; }
function consumeChat(planType = currentPlanType()) { const usage = getUsage(planType); if (!canUseChat(planType, usage.chats)) return false; usage.chats += 1; localStorage.setItem(usageKey(planType), JSON.stringify(usage)); return true; }

const PlanPolicy = { PLAN_POLICIES, getPlanPolicy, isPaidPlan, canUseChat, canGenerateDirection, currentPlanType, getUsage, consumeSimulation, consumeChat };
if (typeof window !== "undefined") window.PlanPolicy = PlanPolicy;
if (typeof module !== "undefined") module.exports = PlanPolicy;
