const test = require("node:test");
const assert = require("node:assert/strict");
const { createInquiryStore, normalizeCategory, normalizeInquiry } = require("../inquiry-store");

function createFakeDb(seed = []) {
  const records = new Map(seed.map((item) => [item.id, { ...item }]));
  let nextId = 1;
  const docs = (items) => items.map((item) => ({ data: () => ({ ...item }) }));

  return {
    records,
    collection(name) {
      assert.equal(name, "inquiries");
      return {
        doc(id = `inquiry-${nextId++}`) {
          return {
            id,
            async set(value, options) {
              records.set(id, options?.merge ? { ...records.get(id), ...value } : { ...value });
            },
            async get() {
              return { exists: records.has(id), data: () => ({ ...records.get(id) }) };
            }
          };
        },
        async get() {
          return { docs: docs([...records.values()]) };
        },
        where(field, operator, value) {
          assert.equal(operator, "==");
          return { async get() { return { docs: docs([...records.values()].filter((item) => item[field] === value)) }; } };
        }
      };
    }
  };
}

test("normalizes unknown and legacy categories", () => {
  assert.equal(normalizeCategory("bug"), "bug");
  assert.equal(normalizeCategory("unknown"), "other");
  assert.equal(normalizeInquiry({ subject: "legacy" }).category, "other");
});

test("creates a categorized unanswered inquiry", async () => {
  const db = createFakeDb();
  const store = createInquiryStore(db);
  const inquiry = await store.create({
    email: "user@example.com",
    uid: "user-1",
    category: "simulation",
    subject: "  結果について  ",
    message: "  確認したいです  "
  });

  assert.equal(inquiry.category, "simulation");
  assert.equal(inquiry.subject, "結果について");
  assert.equal(inquiry.status, "unanswered");
  assert.equal(inquiry.response, "");
});

test("lists only the signed-in user's inquiries newest first", async () => {
  const db = createFakeDb([
    { id: "a", uid: "user-1", subject: "old", status: "unanswered", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", uid: "user-2", subject: "other user", status: "unanswered", createdAt: "2026-03-01T00:00:00.000Z" },
    { id: "c", uid: "user-1", subject: "new", status: "answered", createdAt: "2026-02-01T00:00:00.000Z" }
  ]);
  const items = await createInquiryStore(db).listByUser("user-1");
  assert.deepEqual(items.map((item) => item.id), ["c", "a"]);
});

test("filters admin inquiries by status and category", async () => {
  const db = createFakeDb([
    { id: "a", uid: "user-1", category: "bug", status: "unanswered", createdAt: "2026-01-01T00:00:00.000Z" },
    { id: "b", uid: "user-2", category: "account", status: "unanswered", createdAt: "2026-01-02T00:00:00.000Z" },
    { id: "c", uid: "user-1", category: "bug", status: "answered", createdAt: "2026-01-03T00:00:00.000Z" }
  ]);
  const items = await createInquiryStore(db).list("unanswered", "bug");
  assert.deepEqual(items.map((item) => item.id), ["a"]);
});

test("saves an answer and can return it to unanswered", async () => {
  const db = createFakeDb([
    { id: "a", uid: "user-1", category: "bug", status: "unanswered", response: "", createdAt: "2026-01-01T00:00:00.000Z" }
  ]);
  const store = createInquiryStore(db);

  const answered = await store.update("a", { status: "answered", response: "対応しました。", answeredBy: "admin@example.com" });
  assert.equal(answered.status, "answered");
  assert.equal(answered.response, "対応しました。");
  assert.equal(answered.answeredBy, "admin@example.com");
  assert.ok(answered.answeredAt);

  const reopened = await store.update("a", { status: "unanswered", response: answered.response, answeredBy: "admin@example.com" });
  assert.equal(reopened.status, "unanswered");
  assert.equal(reopened.answeredAt, null);
  assert.equal(reopened.answeredBy, null);
});
