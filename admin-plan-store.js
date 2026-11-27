const DEFAULT_PLAN_CATALOG = Object.freeze({
  free: { name: "無料プラン", monthlyPrice: 0, annualPrice: 0, simulations: 10, reset: "月次", directions: 1, historyLimit: 0, chat: 0, ads: true, trial: false },
  trial: { name: "無料トライアル", monthlyPrice: 0, annualPrice: 0, simulations: 10, reset: "1か月", directions: 7, historyLimit: 3, chat: 5, ads: false, trial: true },
  monthly: { name: "有料プラン（月額）", monthlyPrice: 1500, annualPrice: 0, simulations: 30, reset: "月次", directions: 7, historyLimit: 10, chat: 5, ads: false, trial: false },
  annual: { name: "有料プラン（年額）", monthlyPrice: 0, annualPrice: 15000, simulations: 365, reset: "年次", directions: 7, historyLimit: 50, chat: "無制限", ads: false, trial: false },
  topup: { name: "シミュレーション追加（15回）", monthlyPrice: 580, annualPrice: 0, simulations: 15, reset: "買い切り", directions: 0, historyLimit: 0, chat: 0, ads: false, trial: false }
});
const LIMITS = { monthlyPrice: 1000000, annualPrice: 1000000, simulations: 100000, historyLimit: 1000, chat: 100000 };
function copyCatalog(value = DEFAULT_PLAN_CATALOG) { return JSON.parse(JSON.stringify(value)); }
function normalizePlanCatalog(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw Object.assign(new Error("プラン設定が不正です。"), { status: 400 });
  const catalog = {};
  for (const key of Object.keys(DEFAULT_PLAN_CATALOG)) {
    const source = input[key]; if (!source || typeof source !== "object") throw Object.assign(new Error("すべてのプランを入力してください。"), { status: 400 });
    const item = { ...DEFAULT_PLAN_CATALOG[key], name: String(source.name || "").trim().slice(0, 80), reset: String(source.reset || "").trim().slice(0, 30), chat: source.chat === "無制限" ? "無制限" : Number(source.chat) };
    if (!item.name || !item.reset || (typeof item.chat !== "number" && item.chat !== "無制限")) throw Object.assign(new Error("プラン名・リセット周期・チャット回数を確認してください。"), { status: 400 });
    for (const field of ["monthlyPrice", "annualPrice", "simulations", "directions", "historyLimit"]) { const value = Number(source[field]); if (!Number.isInteger(value) || value < 0 || value > LIMITS[field]) throw Object.assign(new Error(`${field} の値が不正です。`), { status: 400 }); item[field] = value; }
    item.ads = source.ads === true; item.trial = source.trial === true; catalog[key] = item;
  }
  return catalog;
}
function createPlanAdminHandler({ firestore, authenticate }) {
  const settingsRef = () => firestore.collection("adminSettings").doc("plans");
  return async (request) => {
    const identity = await authenticate(request); const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/admin/plans" && request.method === "GET") { const snapshot = await settingsRef().get(); const data = snapshot.data() || {}; return { status: 200, data: { plans: data.plans || copyCatalog(), updatedAt: data.updatedAt || null, updatedBy: data.updatedBy || null } }; }
    if (url.pathname === "/api/admin/plans" && request.method === "PUT") { let body = ""; for await (const chunk of request) body += chunk; let input; try { input = JSON.parse(body); } catch { return { status: 400, data: { error: "JSON形式で送信してください。" } }; } const plans = normalizePlanCatalog(input.plans); const updatedAt = new Date().toISOString(); await settingsRef().set({ plans, updatedAt, updatedBy: identity.email || identity.uid }); return { status: 200, data: { plans, updatedAt, updatedBy: identity.email || identity.uid } }; }
    if (url.pathname === "/api/admin/sales" && request.method === "GET") { const snapshot = await firestore.collection("subscriptions").get(); const counts = { free: 0, trial: 0, monthly: 0, annual: 0 }; let monthlyRevenue = 0; let annualRevenue = 0; for (const doc of snapshot.docs) { const item = doc.data() || {}; if (!Object.hasOwn(counts, item.planType)) continue; counts[item.planType] += 1; if (item.status === "active") { monthlyRevenue += Number(item.planType === "monthly" ? item.amount || 1500 : 0); annualRevenue += Number(item.planType === "annual" ? item.amount || 15000 : 0); } } return { status: 200, data: { counts, monthlyRevenue, annualRevenue, topups: 0, note: "決済連携後はsubscriptionsコレクションの実績が表示されます。" } }; }
    return { status: 404, data: { error: "Not found" } };
  };
}
module.exports = { DEFAULT_PLAN_CATALOG, normalizePlanCatalog, createPlanAdminHandler };
