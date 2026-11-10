const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/;
const PROJECT_ID = /^[a-z][a-z0-9-]{4,61}[a-z0-9]$/;
const LOCATION = /^[A-Za-z0-9-]{2,30}$/;

class BillingUsageError extends Error {
  constructor(message, status = 500, code = "billing_usage_error") {
    super(message);
    this.name = "BillingUsageError";
    this.status = status;
    this.code = code;
  }
}

function loadBillingConfig(env = process.env) {
  const config = {
    billingProjectId: String(env.BILLING_EXPORT_PROJECT_ID || "").trim(),
    dataset: String(env.BILLING_EXPORT_DATASET || "").trim(),
    table: String(env.BILLING_EXPORT_TABLE || "").trim(),
    appProjectId: String(env.FIREBASE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || "").trim(),
    location: String(env.BILLING_QUERY_LOCATION || "US").trim()
  };
  if (!config.billingProjectId || !config.dataset || !config.table || !config.appProjectId) return null;
  if (!PROJECT_ID.test(config.billingProjectId) || !PROJECT_ID.test(config.appProjectId) ||
      !IDENTIFIER.test(config.dataset) || !IDENTIFIER.test(config.table) || !LOCATION.test(config.location)) {
    throw new BillingUsageError("課金データの設定値が不正です。", 500, "invalid_billing_config");
  }
  return config;
}

function monthRange(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const year = Number(parts.year);
  const month = Number(parts.month) - 1;
  const japanOffset = 9 * 60 * 60 * 1000;
  return {
    month: `${year}-${String(month + 1).padStart(2, "0")}`,
    start: new Date(Date.UTC(year, month, 1) - japanOffset).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1) - japanOffset).toISOString()
  };
}

function categoryFor(service, sku) {
  const value = `${service || ""} ${sku || ""}`.toLowerCase();
  if (/places/.test(value)) return "places";
  if (/gemini|generative ai|generative language|vertex ai/.test(value)) return "gemini";
  if (/cloud run/.test(value)) return "cloudRun";
  return "other";
}

function summarizeRows(rows = []) {
  const costs = { gemini: 0, places: 0, cloudRun: 0, other: 0, total: 0 };
  const currencies = new Set();
  for (const row of rows) {
    const cost = Number(row.cost || 0);
    if (!Number.isFinite(cost)) continue;
    const currency = String(row.currency || "").trim();
    if (currency) currencies.add(currency);
    costs[categoryFor(row.service, row.sku)] += cost;
    costs.total += cost;
  }
  if (currencies.size > 1) {
    throw new BillingUsageError("複数通貨の課金データは集計できません。", 500, "multiple_currencies");
  }
  for (const key of Object.keys(costs)) costs[key] = Math.round(costs[key] * 100) / 100;
  return { currency: [...currencies][0] || "JPY", costs };
}

function createBillingUsageService({ createClient, env = process.env, now = () => new Date() } = {}) {
  let client;
  return {
    async getMonthUsage() {
      const config = loadBillingConfig(env);
      if (!config) {
        return {
          configured: false,
          message: "Cloud BillingのBigQuery出力が未設定です。"
        };
      }
      client ||= createClient(config);
      const range = monthRange(now());
      const table = `\`${config.billingProjectId}.${config.dataset}.${config.table}\``;
      const query = `
        SELECT
          service.description AS service,
          sku.description AS sku,
          currency,
          SUM(
            cost + IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) AS credit), 0)
          ) AS cost
        FROM ${table}
        WHERE project.id = @appProjectId
          AND usage_start_time >= TIMESTAMP(@monthStart)
          AND usage_start_time < TIMESTAMP(@monthEnd)
        GROUP BY service, sku, currency
      `;
      try {
        const [rows] = await client.query({
          query,
          location: config.location,
          params: {
            appProjectId: config.appProjectId,
            monthStart: range.start,
            monthEnd: range.end
          },
          maximumBytesBilled: "1000000000"
        });
        return {
          configured: true,
          month: range.month,
          updatedAt: new Date().toISOString(),
          ...summarizeRows(rows)
        };
      } catch (error) {
        console.error("Billing usage query failed", { code: error?.code || "unknown" });
        throw new BillingUsageError("課金データを読み込めませんでした。BigQueryの設定と権限を確認してください。", 503, "billing_query_failed");
      }
    }
  };
}

module.exports = {
  BillingUsageError,
  categoryFor,
  createBillingUsageService,
  loadBillingConfig,
  monthRange,
  summarizeRows
};
