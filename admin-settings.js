function normalizeWords(value) {
  return [...new Set(String(value || "").split(/\r?\n/).map((word) => word.trim()).filter(Boolean))].slice(0, 200);
}

function createAdminSettingsStore(db) {
  const ref = () => db.collection("admin").doc("settings");
  return {
    async get() { return (await ref().get()).data() || { blockedWords: [], blockedWordHistory: [], updatedAt: null }; },
    async saveBlockedWords(value, actor = "") {
      const blockedWords = normalizeWords(value);
      const current = await this.get();
      const before = new Set(current.blockedWords || []);
      const after = new Set(blockedWords);
      const changes = [
        ...blockedWords.filter((word) => !before.has(word)).map((word) => ({ action: "追加", word })),
        ...(current.blockedWords || []).filter((word) => !after.has(word)).map((word) => ({ action: "削除", word }))
      ];
      const now = new Date().toISOString();
      const blockedWordHistory = [...(current.blockedWordHistory || []), ...changes.map((change) => ({ ...change, actor, changedAt: now }))].slice(-100);
      await ref().set({ blockedWords, blockedWordHistory, updatedAt: now }, { merge: true });
      return { blockedWords, blockedWordHistory };
    }
  };
}

module.exports = { createAdminSettingsStore, normalizeWords };
