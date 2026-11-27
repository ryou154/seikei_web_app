const { randomUUID, createHash } = require("node:crypto");
class PartnerError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new PartnerError(message, status);
};
const text = (v, max, label, required = true) => {
  if (typeof v !== "string" || v.length > max || (required && !v.trim()))
    fail(`${label}を確認してください。`);
  return v.trim();
};
const id = (v) => {
  if (typeof v !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(v))
    fail("識別子を確認してください。");
  return v;
};
const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function date(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v + "T12:00:00+09:00")) ||
    new Date(v + "T12:00:00+09:00").toISOString().slice(0, 10) !== v
  )
    fail("日付を確認してください。");
  return v;
}
const shift = (v, n) => {
  const d = new Date(date(v) + "T12:00:00+09:00");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function minute(v) {
  if (typeof v !== "string" || !/^\d{2}:[03]0$/.test(v))
    fail("時刻は30分単位で指定してください。");
  const [h, m] = v.split(":").map(Number);
  if (h > 23) fail("時刻を確認してください。");
  return h * 60 + m;
}
const time = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
function https(v) {
  try {
    const u = new URL(text(v, 500, "公式サイトURL"));
    if (u.protocol !== "https:" || u.username || u.password) throw Error();
    return u.href;
  } catch {
    fail("公式サイトのhttps URLを入力してください。");
  }
}
function normalizeSettings(body) {
  if (!body || typeof body !== "object") fail("受付設定を確認してください。");
  const start = minute(body.start),
    end = minute(body.end);
  if (start < 360 || end > 1320 || end <= start)
    fail("診療時間を確認してください。");
  if (
    typeof body.enabled !== "boolean" ||
    !Array.isArray(body.closedWeekdays) ||
    body.closedWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    fail("受付設定を確認してください。");
  if (!Array.isArray(body.closedDates) || body.closedDates.length > 180)
    fail("休診日が多すぎます。");
  if (
    !Array.isArray(body.services) ||
    body.services.length > 30 ||
    (body.enabled && !body.services.length)
  )
    fail("予約メニューを登録してください。");
  const services = body.services.map((s) => {
    if (!s || typeof s !== "object") fail("予約メニューを確認してください。");
    if (![30, 60, 90, 120].includes(s.duration))
      fail("予約時間は30・60・90・120分から選択してください。");
    return {
      id: id(s.id),
      name: text(s.name, 100, "予約メニュー名"),
      duration: s.duration,
    };
  });
  if (new Set(services.map((s) => s.id)).size !== services.length)
    fail("予約メニューの識別子が重複しています。");
  return {
    enabled: body.enabled,
    start: body.start,
    end: body.end,
    closedWeekdays: [...new Set(body.closedWeekdays)],
    closedDates: [...new Set(body.closedDates.map(date))],
    services,
  };
}
function normalizeHistory(entries) {
  if (!Array.isArray(entries) || entries.length > 50)
    fail("施術歴は50件以内で登録してください。");
  return entries.map((e) => {
    if (!e || typeof e !== "object") fail("施術歴を確認してください。");
    if (date(e.date) > today())
      fail("施術歴には過去・当日の実施日を入力してください。");
    return {
      id: e.id ? id(e.id) : randomUUID(),
      date: date(e.date),
      procedure: text(e.procedure, 150, "施術名"),
      clinicName: text(e.clinicName, 150, "クリニック名"),
      note: text(e.note || "", 1000, "補足", false),
    };
  });
}
function slotTimes(settings, d) {
  if (
    settings.closedWeekdays.includes(
      new Date(date(d) + "T12:00:00+09:00").getUTCDay(),
    ) ||
    settings.closedDates.includes(d)
  )
    return [];
  const list = [];
  for (let n = minute(settings.start); n < minute(settings.end); n += 30)
    list.push(time(n));
  return list;
}
function fits(settings, day, d, t, duration, ignore) {
  const available = slotTimes(settings, d),
    start = minute(t),
    keys = Array.from({ length: duration / 30 }, (_, i) =>
      time(start + i * 30),
    );
  return keys.every(
    (k) =>
      available.includes(k) &&
      !day.closed?.includes(k) &&
      !Object.values(day.bookings || {}).some(
        (b) =>
          b.id !== ignore &&
          b.status !== "cancelled" &&
          minute(b.time) < minute(k) + 30 &&
          minute(b.time) + b.duration > minute(k),
      ),
  );
}
const statuses = [
  "requested",
  "confirmed",
  "arrived",
  "completed",
  "cancelled",
];
const defaultSettings = () => ({
  enabled: false,
  start: "10:00",
  end: "18:00",
  closedWeekdays: [0],
  closedDates: [],
  services: [],
});
function createPartnerService(db) {
  const ref = (collection, key) => db.collection(collection).doc(id(key));
  const memberRef = (uid) => ref("clinicPartnerMembers", uid);
  const clinicRef = (cid) => ref("clinicPartnerClinics", cid);
  const dayRef = (cid, d) => clinicRef(cid).collection("days").doc(date(d));
  const patientRef = (cid, uid) =>
    clinicRef(cid).collection("patients").doc(id(uid));
  const medicalRef = (uid) => ref("patientTreatmentProfiles", uid);
  async function member(uid) {
    const value = (await memberRef(uid).get()).data();
    if (value?.status !== "approved" || !value.clinicId)
      fail("クリニック担当者の承認が必要です。", 403);
    return value;
  }
  async function context(uid) {
    const m = await member(uid),
      c = (await clinicRef(m.clinicId).get()).data();
    if (!c || c.status !== "active")
      fail("このクリニックは利用停止中です。", 403);
    return { m, c };
  }
  async function audited(uid, cid, patientId) {
    await clinicRef(cid).collection("accessAudit").doc(randomUUID()).set({
      actorUid: uid,
      patientUid: patientId,
      action: "patient.read",
      at: new Date().toISOString(),
    });
  }
  async function page(collection, field, cursor) {
    let query = collection.orderBy(field, "desc");
    if (cursor) {
      const document = await collection.doc(id(cursor)).get();
      if (!document.exists) fail("表示位置を確認してください。");
      query = query.startAfter(document);
    }
    const result = await query.limit(51).get(),
      docs = result.docs.slice(0, 50);
    return {
      docs,
      nextCursor: result.docs.length > 50 ? docs.at(-1).id : null,
    };
  }
  const service = {
    async session(uid) {
      const m = (await memberRef(uid).get()).data();
      return m
        ? {
            application: m,
            clinic:
              m.status === "approved"
                ? (await clinicRef(m.clinicId).get()).data()
                : null,
          }
        : { application: null, clinic: null };
    },
    async apply(identity, body) {
      const application = {
        uid: identity.uid,
        email: identity.email,
        clinicName: text(body.clinicName, 150, "クリニック名"),
        name: text(body.name, 100, "担当者名"),
        phone: text(body.phone, 30, "電話番号"),
        officialUrl: https(body.officialUrl),
        status: "pending",
        appliedAt: new Date().toISOString(),
      };
      await db.runTransaction(async (tx) => {
        const r = memberRef(identity.uid),
          old = (await tx.get(r)).data();
        if (old?.status === "approved") fail("すでに承認されています。", 409);
        tx.set(r, application);
      });
      return { application };
    },
    async registeredClinics(keyword = "") {
      const query = text(keyword, 80, "検索語", false).toLowerCase();
      const result = await db.collection("clinics").where("publicationStatus", "==", "published").limit(500).get();
      return result.docs.filter(d => String(d.data().name || "").toLowerCase().includes(query)).slice(0, 20).map(d => {
        const c = d.data();
        return {id: d.id, name: c.name, prefecture: c.prefecture || "", city: c.city || "", officialUrl: c.officialUrl || ""};
      });
    },
    async applications() {
      const s = await db
        .collection("clinicPartnerMembers")
        .where("status", "==", "pending")
        .limit(100)
        .get();
      return s.docs.map((d) => d.data());
    },
    async review(admin, uid, body) {
      if (
        body.confirmed !== true ||
        !["approved", "rejected", "revoked"].includes(body.status)
      )
        fail("所属・本人確認を行ってから承認してください。");
      const cid = body.status === "approved" ? id(body.clinicId) : null;
      return db.runTransaction(async (tx) => {
        const mr = memberRef(uid),
          m = (await tx.get(mr)).data();
        if (
          !m ||
          (body.status === "revoked"
            ? m.status !== "approved"
            : m.status !== "pending")
        )
          fail("対象の申請・担当者が見つかりません。", 409);
        let existing, publicClinic;
        if (cid) {
          publicClinic = (await tx.get(ref("clinics", cid))).data();
          existing = (await tx.get(clinicRef(cid))).data();
          if (!publicClinic || publicClinic.publicationStatus !== "published")
            fail("公開済みクリニックのIDを確認してください。");
        }
        const at = new Date().toISOString(),
          next = {
            ...m,
            status: body.status,
            clinicId: body.status === "revoked" ? m.clinicId : cid,
            reviewedBy: admin.uid,
            reviewedAt: at,
          };
        tx.set(mr, next);
        if (cid && !existing)
          tx.set(clinicRef(cid), {
            id: cid,
            name: publicClinic.name,
            address: publicClinic.address || "",
            officialUrl: publicClinic.officialUrl || m.officialUrl,
            phone: publicClinic.phone || m.phone,
            status: "active",
            settings: defaultSettings(),
            createdAt: at,
          });
        tx.set(db.collection("clinicPartnerApprovalAudit").doc(randomUUID()), {
          actorUid: admin.uid,
          memberUid: uid,
          clinicId: cid,
          status: body.status,
          at,
        });
        return { application: next };
      });
    },
    async settings(uid, body) {
      const { m } = await context(uid),
        settings = normalizeSettings(body);
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(memberRef(uid))).data();
        if (fresh?.status !== "approved" || fresh.clinicId !== m.clinicId)
          fail("権限が変更されました。", 403);
        tx.update(clinicRef(m.clinicId), {
          settings,
          updatedAt: new Date().toISOString(),
        });
      });
      return { settings };
    },
    async month(uid, month) {
      if (!/^\d{4}-\d{2}$/.test(month || ""))
        fail("表示月を確認してください。");
      const first = date(month + "-01"),
        next = new Date(first + "T12:00:00+09:00");
      next.setUTCMonth(next.getUTCMonth() + 1);
      const last = shift(next.toISOString().slice(0, 10), -1);
      const { m, c } = await context(uid),
        refs = [];
      for (let d = first; d <= last; d = shift(d, 1))
        refs.push(dayRef(m.clinicId, d));
      const snapshots = await db.getAll(...refs);
      return {
        clinic: c,
        bookings: snapshots.flatMap((s) =>
          Object.values(s.data()?.bookings || {}),
        ),
        closed: snapshots.flatMap((s) =>
          (s.data()?.closed || []).map((t) => ({ date: s.id, time: t })),
        ),
      };
    },
    async availability(identity, cid, d, serviceId) {
      date(d);
      if (d < today() || d > shift(today(), 90))
        fail("予約日は90日以内で選択してください。");
      const c = (await clinicRef(cid).get()).data();
      if (c?.status !== "active" || c.settings?.enabled !== true)
        fail("現在オンライン予約を受け付けていません。", 404);
      const selected = c.settings.services.find((s) => s.id === serviceId),
        day = (await dayRef(cid, d).get()).data() || {};
      return {
        clinic: {
          id: cid,
          name: c.name,
          address: c.address,
          phone: c.phone,
          officialUrl: c.officialUrl,
        },
        services: c.settings.services,
        slots: selected
          ? slotTimes(c.settings, d).filter(
              (t) =>
                new Date(`${d}T${t}:00+09:00`).getTime() > Date.now() &&
                fits(c.settings, day, d, t, selected.duration),
            )
          : [],
      };
    },
    async patientProfile(uid) {
      const p = (await medicalRef(uid).get()).data();
      return p || { name: "", phone: "", history: [] };
    },
    async savePatientProfile(uid, body) {
      const profile = {
        name: text(body.name, 100, "氏名"),
        phone: text(body.phone, 30, "電話番号"),
        history: normalizeHistory(body.history || []),
        updatedAt: new Date().toISOString(),
      };
      await medicalRef(uid).set(profile);
      return { profile };
    },
    async book(identity, body, key) {
      const cid = id(body.clinicId),
        d = date(body.date),
        t = text(body.time, 5, "時刻"),
        serviceId = id(body.serviceId);
      minute(t);
      if (
        typeof body.shareHistory !== "boolean" ||
        typeof key !== "string" ||
        !/^[a-zA-Z0-9_-]{16,80}$/.test(key)
      )
        fail("予約情報を確認してください。");
      if (
        d < today() ||
        d > shift(today(), 90) ||
        new Date(`${d}T${t}:00+09:00`).getTime() <= Date.now()
      )
        fail("未来の日時を選択してください。");
      const bookingId = createHash("sha256")
          .update(identity.uid + ":" + cid + ":" + key)
          .digest("hex"),
        bookingRef = ref("clinicBookings", bookingId);
      return db.runTransaction(async (tx) => {
        const c = (await tx.get(clinicRef(cid))).data(),
          p = (await tx.get(medicalRef(identity.uid))).data(),
          existing = (await tx.get(bookingRef)).data(),
          day = (await tx.get(dayRef(cid, d))).data() || {
            bookings: {},
            closed: [],
          },
          grant = (await tx.get(patientRef(cid, identity.uid))).data() || {};
        if (existing) {
          if (
            existing.userId !== identity.uid ||
            existing.date !== d ||
            existing.time !== t ||
            existing.serviceId !== serviceId
          )
            fail("同じ予約キーを別の内容には使用できません。", 409);
          return { booking: existing };
        }
        if (c?.status !== "active" || !c.settings?.enabled)
          fail("オンライン予約は停止中です。", 409);
        const selected = c.settings.services.find((s) => s.id === serviceId);
        if (!selected) fail("予約メニューを選び直してください。");
        if (!p?.name || !p.phone)
          fail("予約前に利用者情報を登録してください。");
        if (!fits(c.settings, day, d, t, selected.duration))
          fail("この枠は予約済み、または受付停止中です。", 409);
        const active = (grant.activeBookings || []).filter(
          (b) => b.date >= today(),
        );
        if (active.length >= 3)
          fail("このクリニックへの未完了の予約は3件までです。", 409);
        const at = new Date().toISOString(),
          booking = {
            id: bookingId,
            clinicId: cid,
            clinicName: c.name,
            userId: identity.uid,
            name: p.name,
            serviceId,
            serviceName: selected.name,
            duration: selected.duration,
            date: d,
            time: t,
            status: "requested",
            createdAt: at,
          };
        tx.set(bookingRef, booking);
        tx.set(
          medicalRef(identity.uid).collection("bookings").doc(bookingId),
          booking,
        );
        tx.set(dayRef(cid, d), {
          ...day,
          bookings: { ...day.bookings, [bookingId]: booking },
        });
        tx.set(
          patientRef(cid, identity.uid),
          {
            userId: identity.uid,
            name: p.name,
            phone: p.phone,
            email: identity.email,
            shareHistory: body.shareHistory,
            activeBookings: [...active, { id: bookingId, date: d }],
            updatedAt: at,
          },
          { merge: true },
        );
        return { booking };
      });
    },
    async mine(uid, cursor) {
      const result = await page(
        medicalRef(uid).collection("bookings"),
        "createdAt",
        cursor,
      );
      return {
        bookings: result.docs.map((d) => d.data()),
        nextCursor: result.nextCursor,
      };
    },
    async changeStatus(identity, bookingId, status, staff) {
      if (!statuses.includes(status)) fail("予約状態を確認してください。");
      const m = staff ? (await context(identity.uid)).m : null;
      return db.runTransaction(async (tx) => {
        const r = ref("clinicBookings", bookingId),
          b = (await tx.get(r)).data();
        if (!b) fail("予約が見つかりません。", 404);
        if (staff) {
          const fresh = (await tx.get(memberRef(identity.uid))).data();
          if (
            fresh?.status !== "approved" ||
            fresh.clinicId !== b.clinicId ||
            m.clinicId !== b.clinicId
          )
            fail("この予約を変更する権限がありません。", 403);
        } else if (
          b.userId !== identity.uid ||
          status !== "cancelled" ||
          !["requested", "confirmed"].includes(b.status) ||
          new Date(`${b.date}T${b.time}:00+09:00`).getTime() <= Date.now()
        )
          fail("この予約はキャンセルできません。", 403);
        if (["completed", "cancelled"].includes(b.status))
          fail("完了・キャンセル済みの予約は変更できません。", 409);
        const day = (await tx.get(dayRef(b.clinicId, b.date))).data(),
          grant = (await tx.get(patientRef(b.clinicId, b.userId))).data(),
          next = { ...b, status, updatedAt: new Date().toISOString() };
        tx.set(r, next);
        tx.set(medicalRef(b.userId).collection("bookings").doc(b.id), next);
        if (["cancelled", "completed"].includes(status) && grant)
          tx.update(patientRef(b.clinicId, b.userId), {
            activeBookings: (grant.activeBookings || []).filter(
              (v) => v.id !== b.id,
            ),
          });
        tx.set(dayRef(b.clinicId, b.date), {
          ...day,
          bookings: { ...day?.bookings, [b.id]: next },
        });
        return { booking: next };
      });
    },
    async close(uid, body) {
      const { m, c } = await context(uid),
        d = date(body.date),
        t = text(body.time, 5, "時間");
      if (
        typeof body.closed !== "boolean" ||
        !slotTimes(c.settings, d).includes(t)
      )
        fail("受付枠を確認してください。");
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(memberRef(uid))).data(),
          current = (await tx.get(clinicRef(m.clinicId))).data(),
          r = dayRef(m.clinicId, d),
          day = (await tx.get(r)).data() || { bookings: {}, closed: [] };
        if (fresh?.status !== "approved" || fresh.clinicId !== m.clinicId)
          fail("権限が変更されました。", 403);
        if (!slotTimes(current.settings, d).includes(t))
          fail("受付設定が変更されました。", 409);
        if (
          body.closed &&
          Object.values(day.bookings).some(
            (b) =>
              b.status !== "cancelled" &&
              minute(b.time) <= minute(t) &&
              minute(b.time) + b.duration > minute(t),
          )
        )
          fail("予約のある枠は停止できません。", 409);
        tx.set(r, {
          ...day,
          closed: [
            ...day.closed.filter((v) => v !== t),
            ...(body.closed ? [t] : []),
          ],
        });
      });
      return { saved: true };
    },
    async patient(uid, patientId, cursor) {
      const { m } = await context(uid),
        grant = (await patientRef(m.clinicId, patientId).get()).data();
      if (!grant) fail("この利用者の情報を閲覧する権限がありません。", 404);
      const result = await page(
        patientRef(m.clinicId, patientId).collection("records"),
        "date",
        cursor,
      );
      const own = result.docs.map((d) => ({
        ...d.data(),
        id: d.id,
        source: "自院の施術記録",
      }));
      const profile =
        !cursor && grant.shareHistory
          ? (await medicalRef(patientId).get()).data()
          : null;
      await audited(uid, m.clinicId, patientId);
      return {
        patient: {
          ...grant,
          nextCursor: result.nextCursor,
          history: [
            ...own,
            ...(profile?.history || []).map((h) => ({
              ...h,
              source: "本人申告・他院（未確認）",
            })),
          ].sort((a, b) => b.date.localeCompare(a.date)),
        },
      };
    },
    async record(uid, patientId, body) {
      const { m, c } = await context(uid),
        grant = (await patientRef(m.clinicId, patientId).get()).data();
      if (!grant) fail("予約者の施術歴のみ登録できます。", 404);
      const [record] = normalizeHistory([{ ...body, clinicName: c.name }]);
      if (record.date > today()) fail("施術実施日には未来日を指定できません。");
      await db.runTransaction(async (tx) => {
        const fresh = (await tx.get(memberRef(uid))).data();
        if (fresh?.status !== "approved" || fresh.clinicId !== m.clinicId)
          fail("権限が変更されました。", 403);
        tx.set(
          patientRef(m.clinicId, patientId)
            .collection("records")
            .doc(randomUUID()),
          { ...record, recordedBy: uid, recordedAt: new Date().toISOString() },
        );
      });
      return { saved: true };
    },
    async consent(uid, cid, share) {
      if (typeof share !== "boolean") fail("共有設定を確認してください。");
      const r = patientRef(cid, uid);
      await db.runTransaction(async (tx) => {
        if (!(await tx.get(r)).exists)
          fail("このクリニックへの予約がありません。", 404);
        tx.update(r, {
          shareHistory: share,
          updatedAt: new Date().toISOString(),
        });
      });
      return { saved: true };
    },
  };
  return service;
}
module.exports = {
  PartnerError,
  createPartnerService,
  normalizeSettings,
  normalizeHistory,
  slotTimes,
  fits,
  today,
  shift,
  date,
};
