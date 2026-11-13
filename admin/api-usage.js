const usageStatus = document.getElementById("api-usage-status");
const costNodes = {
  gemini: document.getElementById("gemini-cost"),
  places: document.getElementById("places-cost"),
  cloudRun: document.getElementById("cloud-run-cost"),
  total: document.getElementById("total-cost")
};
let loading = false;

function showUnavailable(message) {
  for (const node of Object.values(costNodes)) node.textContent = "未接続";
  usageStatus.textContent = message;
  usageStatus.dataset.error = "true";
}

function formatCost(value, currency) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: currency || "JPY",
    maximumFractionDigits: currency === "JPY" ? 0 : 2
  }).format(Number(value || 0));
}

async function loadApiUsage() {
  if (loading || !window.AppAuth?.uid) return;
  loading = true;
  try {
    const response = await window.AppAuth.fetch("/api/admin/api-usage");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "API使用料を読み込めませんでした。");
    if (!data.configured) {
      showUnavailable(data.message || "Cloud Billingの設定が必要です。");
      return;
    }
    for (const [key, node] of Object.entries(costNodes)) {
      node.textContent = formatCost(data.costs?.[key], data.currency);
    }
    const updated = data.updatedAt ? new Date(data.updatedAt).toLocaleString("ja-JP") : "";
    usageStatus.textContent = `${data.month || "今月"}分・最終取得 ${updated}`;
    usageStatus.dataset.error = "false";
  } catch (error) {
    showUnavailable(error.message || "API使用料を読み込めませんでした。");
  } finally {
    loading = false;
  }
}

window.addEventListener("app-authorized", loadApiUsage);
if (window.AppAuth?.uid) loadApiUsage();
