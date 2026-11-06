function normalizeWords(value) {
  return [...new Set(String(value || "").split(/\r?\n/).map((word) => word.trim()).filter(Boolean))].slice(0, 200);
}

function createAdminSettingsStore(db) {
  const ref = () => db.collection("admin").doc("settings");
  return {
    async get() { return (await ref().get()).data() || { blockedWords: [], updatedAt: null }; },
    async saveBlockedWords(value) {
      const blockedWords = normalizeWords(value);
      await ref().set({ blockedWords, updatedAt: new Date().toISOString() }, { merge: true });
      return blockedWords;
    }
  };
}

module.exports = { createAdminSettingsStore, normalizeWords };
