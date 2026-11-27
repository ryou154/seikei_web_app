const test = require("node:test");
const assert = require("node:assert/strict");
const { partnerDatabase } = require("../clinic-partner-sandbox");
const { createPartnerService } = require("../clinic-partner-service");
const { database } = require("./helpers/clinic-partner-memory");

test("sandbox registration stays isolated from live and other sandbox members", async () => {
  const db = database();
  db.values.set("clinicPartnerMembers/test-user", {status: "approved", clinicId: "live-clinic"});
  const scoped = partnerDatabase(db, "test-a");
  const service = createPartnerService(scoped);
  await service.apply({uid: "test-user", email: "test@example.invalid"}, {
    clinicName: "動作確認用クリニック", name: "テスト担当者", phone: "000-0000-0000", officialUrl: "https://example.invalid/",
  });
  assert.equal((await service.session("test-user")).application.status, "pending");
  assert.equal(db.values.get("clinicPartnerMembers/test-user").clinicId, "live-clinic");
  assert.equal((await createPartnerService(partnerDatabase(db, "test-b")).session("test-user")).application, null);
  assert.equal((await scoped.getAll(scoped.collection("clinicPartnerMembers").doc("test-user")))[0].data().status, "pending");
  assert.throws(() => partnerDatabase(db, "../live"));
  assert.equal(partnerDatabase(db, ""), db);
});
