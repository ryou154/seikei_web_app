import "../auth-core.js";
import { $, el, button, api } from "../clinic-partner-shared.js";
let version = 0;
const message = (t) => ($("approval-status").textContent = t);
async function load() {
  const token = ++version;
  try {
    const result = await api("/api/admin/clinic-partners");
    if (token !== version) return;
    $("approval-list").replaceChildren(
      ...(result.applications.length
        ? result.applications.map((application) => {
            const card = el("section", null, "card user-history-card");
            card.append(
              el("h2", application.clinicName),
              el("p", `${application.name} ／ ${application.email}`),
              el("p", application.phone),
              el("p", application.officialUrl),
              el("p", "担当者UID：" + application.uid, "muted"),
            );
            const form = el("form"),
              label = el("label", "登録済みクリニックを検索"),
              input = el("input"),
              search = button("院を検索", async () => {
                try {
                  const result = await api(
                    "/api/admin/clinic-partners/clinics?" +
                      new URLSearchParams({
                        keyword: input.value,
                        limit: "20",
                      }),
                  );
                  select.replaceChildren(el("option", "選択してください"));
                  result.clinics.forEach((c) => {
                    const option = el(
                      "option",
                      `${c.name} ／ ${c.prefecture} ${c.city} ／ ${c.officialUrl}`,
                    );
                    option.value = c.id;
                    select.append(option);
                  });
                } catch (e) {
                  message(e.message);
                }
              }),
              select = el("select"),
              check = el("input"),
              confirmation = el(
                "label",
                "申請者の所属・本人と、公式連絡先・対象院を照合しました。",
              );
            input.placeholder = "例：エースクリニック";
            input.maxLength = 80;
            label.append(input);
            select.setAttribute("aria-label", "紐付けるクリニック");
            check.type = "checkbox";
            check.required = true;
            confirmation.prepend(check);
            const approve = el(
              "button",
              "このクリニックの担当者として承認",
              "button primary",
            );
            approve.type = "submit";
            form.append(label, search, select, confirmation, approve);
            form.addEventListener("submit", async (event) => {
              event.preventDefault();
              if (!select.value) {
                message("紐付ける院を選択してください。");
                return;
              }
              approve.disabled = true;
              try {
                await api("/api/admin/clinic-partners/" + application.uid, {
                  method: "PATCH",
                  body: {
                    status: "approved",
                    clinicId: select.value,
                    confirmed: check.checked,
                  },
                });
                await load();
                message(
                  "所属を承認しました。予約受付は担当者が設定・開始します。",
                );
              } catch (e) {
                message(e.message);
              } finally {
                approve.disabled = false;
              }
            });
            card.append(
              form,
              button("申請を却下", async () => {
                if (!confirm("この利用申請を却下しますか？")) return;
                try {
                  await api("/api/admin/clinic-partners/" + application.uid, {
                    method: "PATCH",
                    body: { status: "rejected", confirmed: true },
                  });
                  await load();
                } catch (e) {
                  message(e.message);
                }
              }),
            );
            return card;
          })
        : [el("p", "承認待ちの申請はありません。", "empty")]),
    );
  } catch (e) {
    message(e.message);
    $("approval-list").replaceChildren();
  }
}
$("reload-applications").addEventListener("click", () => void load());
$("revoke-partner-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const uid = event.currentTarget.elements.uid.value.trim();
  if (!confirm("この担当者のクリニック管理権限を解除しますか？")) return;
  try {
    await api("/api/admin/clinic-partners/" + encodeURIComponent(uid), {
      method: "PATCH",
      body: { status: "revoked", confirmed: true },
    });
    message("担当者の管理権限を解除しました。");
  } catch (e) {
    message(e.message);
  }
});
window.addEventListener("app-authorized", () => void load());
window.addEventListener("app-locked", () => {
  version++;
  $("approval-list").replaceChildren();
});
if (window.AppAuth?.uid) void load();
