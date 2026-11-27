export const $ = (id) => document.getElementById(id);
export const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text != null) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
export const button = (text, fn, cls = "button secondary") => {
  const b = el("button", text, cls);
  b.type = "button";
  b.addEventListener("click", fn);
  return b;
};
export const statuses = {
  requested: "予約受付",
  confirmed: "予約確定",
  arrived: "来院済み",
  completed: "対応完了",
  cancelled: "キャンセル",
};
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const shift = (date, n) => {
  const d = new Date(date + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export function monthDays(month) {
  const [y, m] = month.split("-").map(Number),
    count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: count },
    (_, i) => month + "-" + String(i + 1).padStart(2, "0"),
  );
}
export function moveMonth(month, n) {
  const [y, m] = month.split("-").map(Number),
    d = new Date(Date.UTC(y, m - 1 + n, 1));
  return (
    d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0")
  );
}
export async function api(url, { body, ...options } = {}) {
  const auth = window.AppAuth,
    uid = auth?.uid;
  if (!uid) throw Error("メール確認済みのアカウントでログインしてください。");
  const response = await auth.fetch(url, {
    cache: "no-store",
    preserveSessionOnForbidden: true,
    ...options,
    ...(body !== undefined
      ? {
          body: JSON.stringify(body),
          headers: { "Content-Type": "application/json", ...options.headers },
        }
      : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (window.AppAuth?.uid !== uid) throw Error("ログイン状態が変わりました。");
  if (!response.ok) {
    const error = Error(data.error || "処理に失敗しました。");
    error.status = response.status;
    throw error;
  }
  return data;
}
export function historyCard(h) {
  const item = el("article", null, "history-card");
  item.append(
    el("time", h.date),
    el("span", h.source || "本人申告", "history-source"),
    el("h4", h.procedure),
    el("p", h.clinicName),
    el("p", h.note),
  );
  return item;
}
