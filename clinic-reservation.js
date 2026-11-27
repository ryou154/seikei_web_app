import "./auth-core.js";
import {
  $,
  el,
  button,
  api,
  statuses,
  today,
  shift,
} from "./clinic-partner-shared.js";
const cid = new URLSearchParams(location.search).get("clinic") || "";
let mine = [];
let owner = null,
  generation = 0,
  mineVersion = 0,
  availabilityVersion = 0,
  history = [],
  time = "",
  bookingKey = crypto.randomUUID(),
  timer;
const message = (t) => ($("reservation-status").textContent = t);
const active = (uid) => uid === owner && window.AppAuth?.uid === uid;
function lock() {
  generation++;
  owner = null;
  history = [];
  mine = [];
  time = "";
  clearInterval(timer);
  $("reservation-profile-form").reset();
  $("reservation-history-editor").replaceChildren();
  $("reservation-mine").replaceChildren();
  $("reservation-slots").replaceChildren();
  $("reservation-submit").disabled = true;
  $("reservation-summary").textContent = "";
}
function renderHistory() {
  const target = $("reservation-history-editor");
  target.replaceChildren(
    ...history.map((h, i) => {
      const group = el("fieldset", null, "history-editor-row");
      group.append(el("legend", "施術歴 " + (i + 1)));
      for (const [key, title, type, max] of [
        ["date", "施術日", "date", 10],
        ["procedure", "施術名", "text", 150],
        ["clinicName", "施術を受けた院", "text", 150],
        ["note", "補足", "textarea", 1000],
      ]) {
        const label = el("label", title),
          input = el(type === "textarea" ? "textarea" : "input");
        if (type !== "textarea") input.type = type;
        input.value = h[key] || "";
        input.maxLength = max;
        if (type === "date") input.max = today();
        input.required = key !== "note";
        input.addEventListener("input", () => (h[key] = input.value));
        label.append(input);
        group.append(label);
      }
      group.append(
        button(
          "この施術歴を削除",
          () => {
            history = history.filter((item) => item !== h);
            renderHistory();
          },
          "text-button delete",
        ),
      );
      return group;
    }),
  );
}
async function start() {
  const uid = window.AppAuth?.uid;
  if (!uid) return;
  owner = uid;
  const version = ++generation;
  try {
    const [profile] = await Promise.all([
      api("/api/reservations/profile"),
      loadMine(),
    ]);
    if (!active(uid) || version !== generation) return;
    const f = $("reservation-profile-form");
    f.elements.name.value = profile.profile.name;
    f.elements.phone.value = profile.profile.phone;
    history = profile.profile.history;
    renderHistory();
    if (cid) await availability(true);
    else message("クリニック検索から、予約する院を選択してください。");
    clearInterval(timer);
    timer = setInterval(() => {
      if (!document.hidden) {
        void loadMine();
        if (cid) void availability(false);
      }
    }, 30000);
  } catch (e) {
    if (active(uid)) message(e.message);
  }
}
async function availability(first = false) {
  if (!cid || !owner) return;
  const uid = owner,
    version = ++availabilityVersion,
    service = $("reservation-service").value,
    date = $("reservation-date").value;
  try {
    const result = await api(
      "/api/reservations/availability?" +
        new URLSearchParams({ clinic: cid, date, service }),
    );
    if (!active(uid) || version !== availabilityVersion) return;
    $("reservation-clinic-name").textContent = result.clinic.name;
    $("reservation-clinic-address").textContent = result.clinic.address;
    if (first) {
      $("reservation-service").replaceChildren(
        ...result.services.map((s) => {
          const option = el("option", s.name + `（${s.duration}分）`);
          option.value = s.id;
          return option;
        }),
      );
      return availability(false);
    }
    if (time && !result.slots.includes(time)) time = "";
    $("reservation-slots").replaceChildren(
      ...(result.slots.length
        ? result.slots.map((t) => {
            const b = button(
              t,
              () => {
                time = t;
                bookingKey = crypto.randomUUID();
                void availability(false);
              },
              "slot-option",
            );
            b.setAttribute("aria-pressed", String(t === time));
            return b;
          })
        : [
            el(
              "p",
              "この日の空き枠はありません。別の日付をお選びください。",
              "muted",
            ),
          ]),
    );
    $("reservation-summary").textContent = time
      ? date +
        " " +
        time +
        " ／ " +
        $("reservation-service").selectedOptions[0]?.textContent
      : "希望日時を選択してください。";
    $("reservation-submit").disabled = !time;
  } catch (error) {
    if (active(uid) && version === availabilityVersion) {
      time = "";
      $("reservation-submit").disabled = true;
      $("reservation-slots").replaceChildren();
      message(error.message);
    }
  }
}
async function loadMine(cursor = "") {
  if (!owner) return;
  const uid = owner,
    version = ++mineVersion;
  try {
    const result = await api(
      "/api/reservations" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!active(uid) || version !== mineVersion) return;
    mine = cursor ? [...mine, ...result.bookings] : result.bookings;
    $("reservation-mine").replaceChildren(
      ...(mine.length
        ? mine.map((b) => {
            const card = el("article", null, "user-reservation");
            card.append(
              el("h3", b.date + " " + b.time),
              el("p", b.clinicName),
              el("p", b.serviceName),
              el("span", statuses[b.status], "booking-status"),
            );
            if (
              ["requested", "confirmed"].includes(b.status) &&
              new Date(`${b.date}T${b.time}:00+09:00`).getTime() > Date.now()
            )
              card.append(
                button(
                  "予約をキャンセル",
                  async () => {
                    if (
                      !window.confirm(
                        b.date + " " + b.time + "の予約をキャンセルしますか？",
                      )
                    )
                      return;
                    try {
                      await api("/api/reservations/" + b.id, {
                        method: "PATCH",
                        body: {},
                      });
                      await loadMine();
                      await availability();
                      message("予約をキャンセルしました。");
                    } catch (e) {
                      message(e.message);
                    }
                  },
                  "text-button delete",
                ),
              );
            card.append(
              button(
                "この院への他院施術歴の共有を解除",
                async () => {
                  try {
                    await api("/api/reservations/" + b.clinicId + "/consent", {
                      method: "PATCH",
                      body: { shareHistory: false },
                    });
                    message(
                      "このクリニックへの他院施術歴の共有を解除しました。",
                    );
                  } catch (e) {
                    message(e.message);
                  }
                },
                "text-button",
              ),
            );
            return card;
          })
        : [el("p", "予約はまだありません。", "muted")]),
    );
    if (result.nextCursor)
      $("reservation-mine").append(
        button(
          "以前の予約をさらに表示",
          () => void loadMine(result.nextCursor),
        ),
      );
  } catch (e) {
    if (active(uid)) message(e.message);
  }
}
$("reservation-add-history").addEventListener("click", () => {
  if (history.length >= 50) {
    message("施術歴は50件まで登録できます。");
    return;
  }
  history.push({
    id: crypto.randomUUID(),
    date: "",
    procedure: "",
    clinicName: "",
    note: "",
  });
  renderHistory();
});
$("reservation-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = event.currentTarget;
  if (!f.reportValidity()) return;
  const submit = f.querySelector("button[type=submit]");
  submit.disabled = true;
  try {
    await api("/api/reservations/profile", {
      method: "PUT",
      body: {
        name: f.elements.name.value,
        phone: f.elements.phone.value,
        history,
      },
    });
    message("利用者情報を保存しました。");
  } catch (e) {
    message(e.message);
  } finally {
    submit.disabled = false;
  }
});
$("reservation-book-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!time) return;
  const profileForm = $("reservation-profile-form");
  if (!profileForm.reportValidity()) return;
  const b = $("reservation-submit");
  b.disabled = true;
  const body = {
    clinicId: cid,
    date: $("reservation-date").value,
    time,
    serviceId: $("reservation-service").value,
    shareHistory: $("reservation-share").checked,
  };
  try {
    await api("/api/reservations/profile", {
      method: "PUT",
      body: {
        name: profileForm.elements.name.value,
        phone: profileForm.elements.phone.value,
        history,
      },
    });
    const result = await api("/api/reservations", {
      method: "POST",
      headers: { "Idempotency-Key": bookingKey },
      body,
    });
    time = "";
    bookingKey = crypto.randomUUID();
    await loadMine();
    await availability();
    message("予約を受け付けました。予約番号：" + result.booking.id);
  } catch (e) {
    message(e.message);
    await availability();
  } finally {
    b.disabled = !time;
  }
});
$("reservation-date").min = today();
$("reservation-date").max = shift(today(), 90);
$("reservation-date").value = today();
for (const id of ["reservation-date", "reservation-service"])
  $(id).addEventListener("change", () => {
    time = "";
    bookingKey = crypto.randomUUID();
    void availability();
  });
$("reservation-refresh").addEventListener("click", () => void loadMine());
window.addEventListener("app-locked", lock);
window.addEventListener("app-authorized", () => void start());
if (window.AppAuth?.uid) void start();
