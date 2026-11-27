const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  createPartnerService,
  normalizeSettings,
  normalizeHistory,
  today,
  shift,
} = require("../clinic-partner-service");
const { createPartnerHandler } = require("../clinic-partner-api");
const { database } = require("./helpers/clinic-partner-memory");

const identity = { uid: "patient-1", email: "patient@example.com" };
const staff = { uid: "staff-a", email: "staff@example.com" };
const date = () => shift(today(), 1);
const settings = () => ({
  enabled: true,
  start: "10:00",
  end: "19:00",
  closedWeekdays: [],
  closedDates: [],
  services: [{ id: "consult", name: "カウンセリング", duration: 60 }],
});
const booking = (extra = {}) => ({
  clinicId: "clinic-a",
  date: date(),
  time: "11:00",
  serviceId: "consult",
  shareHistory: false,
  ...extra,
});
async function fixture() {
  const db = database();
  db.values.set("clinics/clinic-a", {
    name: "クリニックA",
    publicationStatus: "published",
    officialUrl: "https://example.com/a",
  });
  db.values.set("clinics/clinic-b", {
    name: "クリニックB",
    publicationStatus: "published",
    officialUrl: "https://example.com/b",
  });
  const service = createPartnerService(db);
  await service.apply(staff, {
    clinicName: "クリニックA",
    officialUrl: "https://example.com/a",
    phone: "03-0000-0000",
    name: "担当者",
  });
  await service.review({ uid: "admin" }, staff.uid, {
    status: "approved",
    clinicId: "clinic-a",
    confirmed: true,
  });
  await service.settings(staff.uid, settings());
  await service.savePatientProfile(identity.uid, {
    name: "利用者1",
    phone: "090-0000-0000",
    history: [
      {
        id: "self-1",
        date: shift(today(), -30),
        procedure: "本人申告の施術",
        clinicName: "他院",
        note: "本人入力",
      },
    ],
  });
  return { db, service };
}
test("signup cannot self-approve or choose clinic access; approval starts with bookings disabled", async () => {
  const db = database(),
    service = createPartnerService(db);
  db.values.set("clinics/clinic-a", {
    name: "A",
    publicationStatus: "published",
  });
  await service.apply(staff, {
    clinicName: "A",
    name: "担当",
    phone: "0300000000",
    officialUrl: "https://example.com",
    status: "approved",
    clinicId: "clinic-a",
  });
  assert.equal(
    (await service.session(staff.uid)).application.status,
    "pending",
  );
  await assert.rejects(service.month(staff.uid, today().slice(0, 7)), {
    status: 403,
  });
  await assert.rejects(
    service.review({ uid: "admin" }, staff.uid, {
      status: "approved",
      clinicId: "clinic-a",
      confirmed: false,
    }),
    { status: 400 },
  );
  await service.review({ uid: "admin" }, staff.uid, {
    status: "approved",
    clinicId: "clinic-a",
    confirmed: true,
  });
  assert.equal(
    (await service.session(staff.uid)).clinic.settings.enabled,
    false,
  );
  await assert.rejects(
    service.availability(identity, "clinic-a", date(), "consult"),
    { status: 404 },
  );
});
test("concurrent bookings are serialized, idempotent, and cannot double-book overlapping duration", async () => {
  const { service, db } = await fixture();
  await service.savePatientProfile("patient-2", {
    name: "利用者2",
    phone: "09000000000",
    history: [],
  });
  const results = await Promise.allSettled([
    service.book(identity, booking(), "request-key-000001"),
    service.book(
      { uid: "patient-2", email: "other@example.com" },
      booking({ time: "11:30" }),
      "request-key-000002",
    ),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    ["fulfilled", "rejected"],
  );
  assert.equal(results[1].reason.status, 409);
  const first = results[0].value.booking;
  const repeat = await service.book(identity, booking(), "request-key-000001");
  assert.equal(repeat.booking.id, first.id);
  assert.equal((await service.mine(identity.uid)).bookings.length, 1);
  assert.equal(
    db.values.get("clinicPartnerClinics/clinic-a/patients/patient-1")
      .activeBookings.length,
    1,
  );
  const available = await service.availability(
    identity,
    "clinic-a",
    date(),
    "consult",
  );
  assert.ok(!available.slots.includes("11:30"));
  assert.ok(available.slots.includes("12:00"));
});
test("own-clinic membership and booked-patient grants isolate medical information", async () => {
  const { service, db } = await fixture();
  await service.apply(
    { uid: "staff-b", email: "b@example.com" },
    {
      clinicName: "B",
      name: "担当B",
      phone: "0300000000",
      officialUrl: "https://example.com/b",
    },
  );
  await service.review({ uid: "admin" }, "staff-b", {
    status: "approved",
    clinicId: "clinic-b",
    confirmed: true,
  });
  await service.book(identity, booking(), "request-key-000001");
  await assert.rejects(service.patient("staff-b", identity.uid), {
    status: 404,
  });
  await assert.rejects(service.patient(staff.uid, "unrelated-person"), {
    status: 404,
  });
  const patient = await service.patient(staff.uid, identity.uid);
  assert.equal(patient.patient.name, "利用者1");
  assert.equal(patient.patient.history.length, 0);
  assert.ok([...db.values.keys()].some((k) => k.includes("/accessAudit/")));
  assert.equal(
    (await service.month("staff-b", date().slice(0, 7))).bookings.length,
    0,
  );
});
test("sharing can be revoked; clinical records stay separate from reservations and self reports", async () => {
  const { service } = await fixture();
  const b = (
    await service.book(
      identity,
      booking({ shareHistory: true }),
      "request-key-000001",
    )
  ).booking;
  assert.equal(
    (await service.patient(staff.uid, identity.uid)).patient.history.length,
    1,
  );
  await service.record(staff.uid, identity.uid, {
    date: today(),
    procedure: "実施した施術",
    note: "自院記録",
  });
  let p = (await service.patient(staff.uid, identity.uid)).patient;
  assert.equal(p.history.length, 2);
  assert.ok(p.history.some((h) => h.source === "自院の施術記録"));
  await service.consent(identity.uid, "clinic-a", false);
  p = (await service.patient(staff.uid, identity.uid)).patient;
  assert.equal(p.history.length, 1);
  assert.equal(p.history[0].procedure, "実施した施術");
  await service.changeStatus(staff, b.id, "completed", true);
  assert.equal(
    (await service.patient(staff.uid, identity.uid)).patient.history.length,
    1,
  );
});
test("cancellations and reception blocks are authorized and release slots without erasing history", async () => {
  const { service } = await fixture();
  const b = (await service.book(identity, booking(), "request-key-000001"))
    .booking;
  await assert.rejects(
    service.changeStatus({ uid: "stranger" }, b.id, "cancelled", false),
    { status: 403 },
  );
  await assert.rejects(
    service.close(staff.uid, { date: date(), time: "11:30", closed: true }),
    { status: 409 },
  );
  await service.changeStatus(identity, b.id, "cancelled", false);
  assert.ok(
    (
      await service.availability(identity, "clinic-a", date(), "consult")
    ).slots.includes("11:00"),
  );
  await assert.rejects(service.changeStatus(staff, b.id, "confirmed", true), {
    status: 409,
  });
  await service.close(staff.uid, { date: date(), time: "11:30", closed: true });
  assert.ok(
    !(
      await service.availability(identity, "clinic-a", date(), "consult")
    ).slots.includes("11:00"),
  );
});
test("revoking membership removes medical access immediately and cannot be bypassed by applying again", async () => {
  const { service } = await fixture();
  await service.book(identity, booking(), "request-key-000001");
  await service.review({ uid: "admin" }, staff.uid, {
    status: "revoked",
    confirmed: true,
  });
  await assert.rejects(service.patient(staff.uid, identity.uid), {
    status: 403,
  });
  await assert.rejects(service.settings(staff.uid, settings()), {
    status: 403,
  });
  await service.apply(staff, {
    clinicName: "A",
    officialUrl: "https://example.com",
    phone: "0300000000",
    name: "担当",
  });
  assert.equal(
    (await service.session(staff.uid)).application.status,
    "pending",
  );
  await assert.rejects(service.month(staff.uid, date().slice(0, 7)), {
    status: 403,
  });
});
test("settings, history and closed days validate server-side", async () => {
  assert.throws(() => normalizeSettings({ ...settings(), end: "09:00" }));
  assert.throws(() =>
    normalizeSettings({
      ...settings(),
      services: [{ id: "a", name: "X", duration: 1 }],
    }),
  );
  assert.throws(() =>
    normalizeHistory([
      { date: shift(today(), 1), procedure: "未来", clinicName: "A" },
    ]),
  );
  assert.throws(() => normalizeHistory([null]));
  const { service } = await fixture();
  await service.settings(staff.uid, { ...settings(), closedDates: [date()] });
  await assert.rejects(
    service.book(identity, booking(), "request-key-000001"),
    { status: 409 },
  );
});
function request(method, url, body, headers = {}) {
  const r = new EventEmitter();
  Object.assign(r, {
    method,
    url,
    headers: { "content-type": "application/json", ...headers },
  });
  setImmediate(() => {
    if (body !== undefined) r.emit("data", Buffer.from(JSON.stringify(body)));
    r.emit("end");
  });
  return r;
}
test("HTTP API uses token identity, rejects anonymous/admin impersonation, and never accepts a supplied patient UID", async () => {
  const { service } = await fixture();
  const handler = createPartnerHandler({
    service,
    authenticate: async () => identity,
    adminAuthenticate: async () => {
      throw Object.assign(Error("権限がありません"), { status: 403 });
    },
  });
  assert.equal(
    (await handler(request("GET", "/api/admin/clinic-partners"))).status,
    403,
  );
  const result = await handler(
    request(
      "POST",
      "/api/reservations",
      booking({ userId: "victim", name: "偽名" }),
      { "idempotency-key": "request-key-000001" },
    ),
  );
  assert.equal(result.status, 201);
  assert.equal(result.data.booking.userId, identity.uid);
  assert.equal(result.data.booking.name, "利用者1");
  const denied = createPartnerHandler({
    service,
    authenticate: async () => {
      throw Object.assign(Error("ログインしてください"), { status: 401 });
    },
  });
  assert.equal((await denied(request("GET", "/api/reservations"))).status, 401);
  assert.equal(
    (await handler(request("POST", "/api/partner/settings", {}))).status,
    404,
  );
});

test("a user can hold at most three upcoming reservations per clinic and cancellation frees the allowance", async () => {
  const { service } = await fixture();
  const ids = [];
  for (let n = 0; n < 3; n++)
    ids.push(
      (
        await service.book(
          identity,
          booking({ date: shift(date(), n) }),
          "request-key-limit-" + n,
        )
      ).booking.id,
    );
  await assert.rejects(
    service.book(
      identity,
      booking({ date: shift(date(), 3) }),
      "request-key-limit-3",
    ),
    { status: 409 },
  );
  await service.changeStatus(identity, ids[0], "cancelled", false);
  await service.book(
    identity,
    booking({ date: shift(date(), 3) }),
    "request-key-limit-4",
  );
  assert.equal(
    (await service.mine(identity.uid)).bookings.filter(
      (b) => b.status !== "cancelled",
    ).length,
    3,
  );
});

test("sensitive authentication keeps revocation checks on the signing-key refresh path", async () => {
  const fs = require("node:fs"),
    vm = require("node:vm"),
    calls = [];
  const source = fs.readFileSync(require.resolve("../auth-server"), "utf8");
  const first = {
    verifyIdToken: async (_token, check) => {
      calls.push(check);
      throw Error("no matching kid");
    },
  };
  const refreshed = {
    verifyIdToken: async (_token, check) => {
      calls.push(check);
      return {
        uid: "verified",
        email: "verified@example.com",
        email_verified: true,
      };
    },
  };
  const scope = {
    module: { exports: {} },
    require: (name) =>
      name === "firebase-admin/app"
        ? {
            initializeApp: (_config, name) => ({
              name,
              delete: async () => {},
            }),
          }
        : name === "firebase-admin/auth"
          ? { getAuth: (app) => (app.name ? refreshed : first) }
          : { projectId: "test-project" },
    process: { env: {} },
    console: { warn() {} },
    Buffer,
    Date,
  };
  vm.runInNewContext(source, scope);
  const identity = await scope.module.exports.authorizeSensitive({
    headers: { authorization: "Bearer synthetic-token" },
  });
  assert.equal(identity.uid, "verified");
  assert.deepEqual(calls, [true, true]);
});

test("booking and clinical-history pagination does not omit older records or cross user boundaries", async () => {
  const { service, db } = await fixture();
  await service.book(
    identity,
    booking({ shareHistory: true }),
    "request-page-00001",
  );
  for (let i = 0; i < 120; i++)
    db.values.set("patientTreatmentProfiles/patient-1/bookings/page-" + i, {
      id: "page-" + i,
      userId: identity.uid,
      date: date(),
      time: "11:00",
      createdAt: new Date(Date.now() - 1000 * (i + 1)).toISOString(),
    });
  let cursor,
    ids = [];
  do {
    const page = await service.mine(identity.uid, cursor);
    ids.push(...page.bookings.map((b) => b.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 121);
  assert.equal(new Set(ids).size, 121);
  await assert.rejects(service.mine("other-user", ids[0]), { status: 400 });
  for (let i = 0; i < 121; i++)
    db.values.set(
      "clinicPartnerClinics/clinic-a/patients/patient-1/records/record-" + i,
      {
        date: shift(today(), -i),
        procedure: "施術 " + i,
        clinicName: "A",
        note: "",
      },
    );
  cursor = null;
  ids = [];
  do {
    const page = await service.patient(staff.uid, identity.uid, cursor);
    ids.push(
      ...page.patient.history
        .filter((h) => h.source === "自院の施術記録")
        .map((h) => h.id),
    );
    cursor = page.patient.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 121);
  assert.equal(new Set(ids).size, 121);
});
