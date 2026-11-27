// Scope every partner collection, transaction and patient record to one test root.
function partnerDatabase(db, sandboxId) {
  if (!sandboxId) return db;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sandboxId)) throw Error("Invalid partner sandbox ID");
  const root = db.collection("clinicPartnerSandboxes").doc(sandboxId);
  return {
    collection: name => root.collection(name),
    runTransaction: callback => db.runTransaction(callback),
    getAll: (...refs) => db.getAll(...refs),
  };
}
module.exports = { partnerDatabase };
