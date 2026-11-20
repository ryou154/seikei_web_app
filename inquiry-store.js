const INQUIRY_CATEGORIES = Object.freeze({
  operation: "使い方",
  simulation: "シミュレーション",
  account: "アカウント",
  billing: "料金・プラン",
  clinic: "クリニック情報",
  bug: "不具合",
  other: "その他"
});

function clean(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeCategory(value) {
  return Object.hasOwn(INQUIRY_CATEGORIES, value) ? value : "other";
}

function normalizeInquiry(item) {
  return {
    ...item,
    category: normalizeCategory(item.category),
    response: clean(item.response, 4000),
    answeredBy: clean(item.answeredBy, 320) || null
  };
}

function createInquiryStore(db) {
  const collection = () => db.collection("inquiries");

  return {
    async create({ email, uid, category, subject, message }) {
      const ref = collection().doc();
      const inquiry = {
        id: ref.id,
        email,
        uid,
        category: normalizeCategory(category),
        subject: clean(subject, 120),
        message: clean(message, 4000),
        response: "",
        status: "unanswered",
        createdAt: new Date().toISOString(),
        answeredAt: null,
        answeredBy: null
      };
      await ref.set(inquiry);
      return inquiry;
    },

    async list(status = "all", category = "all") {
      const snapshot = await collection().get();
      return snapshot.docs
        .map((doc) => normalizeInquiry(doc.data()))
        .filter((item) => status === "all" || item.status === status)
        .filter((item) => category === "all" || item.category === category)
        .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    },

    async listByUser(uid) {
      const snapshot = await collection().where("uid", "==", uid).get();
      return snapshot.docs
        .map((doc) => normalizeInquiry(doc.data()))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },

    async update(id, { status, response, answeredBy }) {
      const ref = collection().doc(id);
      const snapshot = await ref.get();
      if (!snapshot.exists) return null;

      const next = {
        status,
        response: clean(response, 4000),
        answeredAt: status === "answered" ? new Date().toISOString() : null,
        answeredBy: status === "answered" ? clean(answeredBy, 320) || null : null
      };
      await ref.set(next, { merge: true });
      return normalizeInquiry({ ...snapshot.data(), ...next });
    }
  };
}

module.exports = {
  INQUIRY_CATEGORIES,
  createInquiryStore,
  clean,
  normalizeCategory,
  normalizeInquiry
};
