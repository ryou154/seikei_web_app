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

const PlanPolicy = { PLAN_POLICIES, getPlanPolicy, isPaidPlan, canUseChat, canGenerateDirection };
if (typeof window !== "undefined") window.PlanPolicy = PlanPolicy;
if (typeof module !== "undefined") module.exports = PlanPolicy;
