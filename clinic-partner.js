import "./auth-core.js";
import {
  $,
  el,
  button,
  api,
  statuses,
  today,
  shift,
  monthDays,
  moveMonth,
  historyCard,
} from "./clinic-partner-shared.js";
let owner = null,
  clinic = null,
  data = { bookings: [], closed: [] },
  selected = today(),
  generation = 0,
  requestVersion = 0,
  patientVersion = 0,
  services = [],
  timer;
const message = (t) => ($("partner-status").textContent = t);
const current = (uid) => owner === uid && window.AppAuth?.uid === uid;
function lock() {
  generation++;
  owner = null;
  clinic = null;
  data = { bookings: [], closed: [] };
  clearInterval(timer);
  $("real-patient-dialog").close();
  $("real-patient-content").replaceChildren();
  $("real-calendar").replaceChildren();
  $("real-day-bookings").replaceChildren();
  $("partner-approved").hidden = true;
}
async function start() {
  const uid = window.AppAuth?.uid;
  if (!uid) return;
  const version = ++generation;
  owner = uid;
  try {
    const result = await api("/api/partner/session");
    if (version !== generation || !current(uid)) return;
    clinic = result.clinic;
    const approved =
      result.application?.status === "approved" && clinic?.status === "active";
    $("partner-pending").hidden = approved;
    $("partner-approved").hidden = !approved;
    if (!approved) {
      $("partner-pending-text").textContent =
        result.application?.status === "pending"
          ? "所属の確認・管理者承認を待っています。承認前は予約者情報を閲覧できません。"
          : result.application?.status === "rejected"
            ? "申請は承認されませんでした。内容を確認して再申請してください。"
            : "クリニックの利用申請を行ってください。";
      return;
    }
    $("real-clinic-name").textContent = clinic.name;
    $("real-clinic-address").textContent = clinic.address;
    $("real-booking-link").href =
      "clinic-reservation.html?clinic=" + encodeURIComponent(clinic.id);
    fillSettings();
    await load();
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
  } catch (error) {
    if (current(uid)) $("auth-status").textContent = error.message;
  }
}
async function load() {
  if (!owner || !clinic) return;
  const uid = owner,
    version = ++requestVersion,
    month = $("real-month").value;
  try {
    const result = await api(
      "/api/partner/schedule?month=" + encodeURIComponent(month),
    );
    if (
      version !== requestVersion ||
      !current(uid) ||
      $("real-month").value !== month
    )
      return;
    data = result;
    clinic = result.clinic;
    render();
    message("最新情報に更新しました。表示中は30秒ごとに更新します。");
  } catch (error) {
    if (current(uid)) {
      message(error.message);
      if (error.status === 403) lock();
    }
  }
}
function render() {
  const filter = $("real-state").value,
    only = $("real-only-booked").checked,
    days = monthDays($("real-month").value),
    bookings = data.bookings.filter((b) =>
      filter ? b.status === filter : b.status !== "cancelled",
    );
  if (!selected.startsWith($("real-month").value)) selected = days[0];
  const cells = [],
    visible = only
      ? days.filter((d) => bookings.some((b) => b.date === d))
      : days;
  $("real-calendar").classList.toggle("filtered", only);
  if (!only) {
    for (const d of ["日", "月", "火", "水", "木", "金", "土"])
      cells.push(el("span", d, "month-weekday"));
    const offset = new Date(days[0] + "T12:00:00+09:00").getUTCDay();
    for (let i = 0; i < offset; i++) cells.push(el("div", null, "month-blank"));
  }
  for (const d of visible) {
    const count = bookings.filter((b) => b.date === d).length,
      b = button(
        "",
        () => {
          selected = d;
          render();
        },
        "month-day" + (d === selected ? " selected" : ""),
      );
    b.setAttribute("aria-label", `${d} 予約${count}件`);
    b.setAttribute("aria-pressed", String(d === selected));
    b.append(
      el("b", Number(d.slice(-2))),
      el(
        "span",
        count ? count + "件" : "—",
        "month-count" + (count ? " has-bookings" : ""),
      ),
    );
    cells.push(b);
  }
  if (!visible.length)
    cells.push(el("p", "この月に条件に一致する予約日はありません。", "empty"));
  $("real-calendar").replaceChildren(...cells);
  $("real-month-summary").textContent =
    `${$("real-month").value} · ${bookings.length}件の予約`;
  $("real-selected-date").textContent = selected + " の予約";
  const appointments = bookings
    .filter((b) => b.date === selected)
    .sort((a, b) => a.time.localeCompare(b.time));
  $("real-day-bookings").replaceChildren(
    ...(appointments.length
      ? appointments.map((b) => {
          const row = el("article", null, "patient-row"),
            info = el("div");
          info.append(
            el("h3", b.time + " " + b.name),
            el("p", b.serviceName + " · " + statuses[b.status]),
          );
          row.append(
            info,
            button("予約者・施術歴", () => openPatient(b)),
          );
          return row;
        })
      : [el("p", "この日の予約はありません。", "empty")]),
  );
  const settings = clinic.settings,
    closed =
      settings.closedWeekdays.includes(
        new Date(selected + "T12:00:00+09:00").getUTCDay(),
      ) || settings.closedDates.includes(selected),
    slots = [];
  if (!closed) {
    const num = (t) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    for (let n = num(settings.start); n < num(settings.end); n += 30) {
      const t =
          String(Math.floor(n / 60)).padStart(2, "0") +
          ":" +
          String(n % 60).padStart(2, "0"),
        busy = data.bookings.some(
          (b) =>
            b.date === selected &&
            b.status !== "cancelled" &&
            num(b.time) <= n &&
            num(b.time) + b.duration > n,
        ),
        stopped = data.closed.some((s) => s.date === selected && s.time === t),
        b = button(
          t + (busy ? " 予約あり" : stopped ? " 停止中" : " 受付中"),
          async () => {
            try {
              await api("/api/partner/slots", {
                method: "PUT",
                body: { date: selected, time: t, closed: !stopped },
              });
              await load();
            } catch (e) {
              message(e.message);
            }
          },
          "slot-option",
        );
      b.disabled = busy;
      slots.push(b);
    }
  }
  $("real-slot-controls").replaceChildren(
    ...(slots.length ? slots : [el("p", "休診日です。", "muted")]),
  );
}
function fillSettings() {
  const f = $("real-settings-form"),
    s = clinic.settings;
  f.elements.start.value = s.start;
  f.elements.end.value = s.end;
  f.elements.enabled.checked = s.enabled;
  f.elements.closedDates.value = s.closedDates.join("\n");
  $("real-closed-weekdays").replaceChildren(
    ...["日", "月", "火", "水", "木", "金", "土"].map((d, i) => {
      const label = el("label", d),
        input = el("input");
      input.type = "checkbox";
      input.value = i;
      input.checked = s.closedWeekdays.includes(i);
      label.prepend(input);
      return label;
    }),
  );
  services = s.services.map((s) => ({ ...s }));
  renderServices();
}
function renderServices() {
  const container = $("real-services");
  container.replaceChildren(
    ...services.map((s, i) => {
      const row = el("div", null, "service-editor-row"),
        name = el("input"),
        duration = el("select");
      name.value = s.name;
      name.required = true;
      name.maxLength = 100;
      name.setAttribute("aria-label", "メニュー名 " + (i + 1));
      name.addEventListener("input", () => (s.name = name.value));
      for (const n of [30, 60, 90, 120]) {
        const o = el("option", n + "分");
        o.value = n;
        duration.append(o);
      }
      duration.value = s.duration;
      duration.setAttribute("aria-label", "予約時間 " + (i + 1));
      duration.addEventListener(
        "change",
        () => (s.duration = Number(duration.value)),
      );
      row.append(
        name,
        duration,
        button(
          "削除",
          () => {
            services = services.filter((v) => v !== s);
            renderServices();
          },
          "text-button delete",
        ),
      );
      return row;
    }),
  );
}
$("real-add-service").addEventListener("click", () => {
  services.push({ id: crypto.randomUUID(), name: "", duration: 30 });
  renderServices();
});
$("real-settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = event.currentTarget;
  if (!f.reportValidity()) return;
  const submit = f.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await api("/api/partner/settings", {
      method: "PUT",
      body: {
        start: f.elements.start.value,
        end: f.elements.end.value,
        enabled: f.elements.enabled.checked,
        closedWeekdays: [
          ...$("real-closed-weekdays").querySelectorAll("input:checked"),
        ].map((i) => Number(i.value)),
        closedDates: f.elements.closedDates.value
          .split(/\r?\n/)
          .map((v) => v.trim())
          .filter(Boolean),
        services,
      },
    });
    await load();
    message("予約受付設定を保存しました。");
  } catch (e) {
    message(e.message);
  } finally {
    submit.disabled = false;
  }
});
async function openPatient(booking) {
  const version = ++patientVersion,
    uid = owner,
    dialog = $("real-patient-dialog"),
    content = $("real-patient-content");
  content.replaceChildren(el("p", "利用者情報を取得しています…"));
  if (!dialog.open) dialog.showModal();
  try {
    const result = await api(
      "/api/partner/patients/" + encodeURIComponent(booking.userId),
    );
    if (version !== patientVersion || !current(uid) || !dialog.open) return;
    const p = result.patient,
      dl = el("dl", null, "patient-details");
    for (const [name, value] of [
      ["氏名", p.name],
      ["電話番号", p.phone],
      ["メール", p.email],
      ["予約日時", booking.date + " " + booking.time],
      ["予約メニュー", booking.serviceName],
    ])
      dl.append(el("dt", name), el("dd", value));
    content.replaceChildren(dl);
    if (!["completed", "cancelled"].includes(booking.status)) {
      const form = el("form", null, "status-editor"),
        select = el("select");
      select.setAttribute("aria-label", "予約状態");
      Object.entries(statuses).forEach(([v, l]) => {
        const o = el("option", l);
        o.value = v;
        select.append(o);
      });
      select.value = booking.status;
      const save = el("button", "状態を保存", "button primary");
      save.type = "submit";
      form.append(select, save);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        save.disabled = true;
        try {
          const result = await api("/api/partner/bookings/" + booking.id, {
            method: "PATCH",
            body: { status: select.value },
          });
          dialog.close();
          await load();
          message(
            "予約状態を" + statuses[result.booking.status] + "に変更しました。",
          );
        } catch (error) {
          showError(error.message);
        } finally {
          save.disabled = false;
        }
      });
      content.append(form);
    }
    content.append(
      el("h3", "過去の施術歴"),
      el(
        "p",
        p.shareHistory
          ? "本人申告の他院施術歴：共有同意あり"
          : "本人申告の他院施術歴：共有同意なし（自院記録のみ）",
        "muted",
      ),
    );
    let visibleHistory = [...p.history],
      nextCursor = p.nextCursor;
    const historyTarget = el("div");
    content.append(historyTarget);
    const moreHistory = button("自院の記録をさらに表示", async () => {
      moreHistory.disabled = true;
      try {
        const result = await api(
          "/api/partner/patients/" +
            booking.userId +
            "?cursor=" +
            encodeURIComponent(nextCursor),
        );
        if (version !== patientVersion || !current(uid) || !dialog.open) return;
        if (!result.patient.shareHistory) {
          visibleHistory = visibleHistory.filter((item) => item.source === "自院の施術記録");
        }
        visibleHistory.push(...result.patient.history);
        nextCursor = result.patient.nextCursor;
        renderHistoryPage();
      } catch (e) {
        showError(e.message);
      } finally {
        moreHistory.disabled = false;
      }
    });
    function renderHistoryPage() {
      historyTarget.replaceChildren(
        ...visibleHistory
          .sort((a, b) => b.date.localeCompare(a.date))
          .map(historyCard),
      );
      moreHistory.hidden = !nextCursor;
    }
    renderHistoryPage();
    content.append(moreHistory);
    if (!p.history.length)
      content.append(el("p", "確認できる施術歴はありません。", "empty"));
    const details = el("details"),
      summary = el("summary", "自院で実施した施術を記録"),
      form = el("form");
    details.append(summary, form);
    for (const [name, title, type] of [
      ["date", "実施日", "date"],
      ["procedure", "施術名", "text"],
      ["note", "補足", "textarea"],
    ]) {
      const label = el("label", title),
        input = el(type === "textarea" ? "textarea" : "input");
      if (type !== "textarea") input.type = type;
      input.name = name;
      input.required = name !== "note";
      input.maxLength = name === "note" ? 1000 : 150;
      if (name === "date") {
        input.max = today();
        input.value = today();
      }
      label.append(input);
      form.append(label);
    }
    const save = el("button", "施術記録を保存", "button primary");
    save.type = "submit";
    form.append(
      el(
        "p",
        "予約・カウンセリングの完了だけでは施術歴は追加されません。実施した施術だけを記録してください。",
        "muted",
      ),
      save,
    );
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      save.disabled = true;
      try {
        await api("/api/partner/patients/" + booking.userId + "/records", {
          method: "POST",
          body: Object.fromEntries(new FormData(form)),
        });
        await openPatient(booking);
      } catch (e) {
        showError(e.message);
      } finally {
        save.disabled = false;
      }
    });
    content.append(details);
  } catch (error) {
    if (version === patientVersion && current(uid) && dialog.open)
      content.replaceChildren(el("p", error.message, "error"));
  }
}
function showError(text) {
  let node = $("real-patient-error");
  if (!node) {
    node = el("p", null, "error");
    node.id = "real-patient-error";
    node.setAttribute("role", "alert");
    $("real-patient-content").append(node);
  }
  node.textContent = text;
}
$("real-patient-close").addEventListener("click", () =>
  $("real-patient-dialog").close(),
);
$("real-patient-dialog").addEventListener("close", () => {
  patientVersion++;
  $("real-patient-content").replaceChildren();
});
$("real-month").value = today().slice(0, 7);
$("real-month").addEventListener("change", () => {
  if ($("real-month").value) void load();
});
$("real-prev-month").addEventListener("click", () => {
  $("real-month").value = moveMonth($("real-month").value, -1);
  void load();
});
$("real-next-month").addEventListener("click", () => {
  $("real-month").value = moveMonth($("real-month").value, 1);
  void load();
});
$("real-refresh").addEventListener("click", () => void load());
for (const id of ["real-state", "real-only-booked"])
  $(id).addEventListener("change", render);
document.querySelectorAll("[data-panel]").forEach((b) =>
  b.addEventListener("click", () => {
    for (const p of ["schedule", "settings"]) {
      $("real-" + p).hidden = p !== b.dataset.panel;
      $("real-tab-" + p).setAttribute(
        "aria-selected",
        String(p === b.dataset.panel),
      );
    }
  }),
);
$("refresh-approval").addEventListener("click", () => void start());
$("partner-logout").addEventListener("click", () => window.AppAuth?.logout());
window.addEventListener("app-locked", lock);
window.addEventListener("app-authorized", () => void start());
window.addEventListener("focus", () => void load());
if (window.AppAuth?.uid) void start();
