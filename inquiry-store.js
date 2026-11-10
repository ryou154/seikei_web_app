function clean(value, max) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function createInquiryStore(db) {
  const collection = () => db.collection("inquiries");
  return {
    async create({ email, uid, subject, message }) { const ref = collection().doc(); const inquiry = { id: ref.id, email, uid, subject: clean(subject, 120), message: clean(message, 4000), status: "unanswered", createdAt: new Date().toISOString(), answeredAt: null }; await ref.set(inquiry); return inquiry; },
    async list(status = "all") { const snapshot = await collection().get(); return snapshot.docs.map((doc) => doc.data()).filter((item) => status === "all" || item.status === status).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))); },
    async updateStatus(id, status) { const ref = collection().doc(id); const snapshot = await ref.get(); if (!snapshot.exists) return null; const next = { status, answeredAt: status === "answered" ? new Date().toISOString() : null }; await ref.set(next, { merge: true }); return { ...snapshot.data(), ...next }; }
  };
}
module.exports = { createInquiryStore, clean };
