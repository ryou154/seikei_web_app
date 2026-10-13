((root, factory) => {
  const model = factory();
  if (typeof module === "object" && module.exports) module.exports = model;
  else root.MypageModel = model;
})(globalThis, () => {
  function validateDisplayName(value) {
    if (typeof value !== "string") return null;
    const name = value.trim();
    return name.length >= 1 && name.length <= 50 ? name : null;
  }

  function imageCount(entries) {
    return entries.reduce((total, entry) => total
      + Number(Boolean(entry.result?.images?.before))
      + Number(Boolean(entry.result?.images?.after)), 0);
  }

  function passwordMismatch(next, confirmation) {
    return next !== confirmation;
  }

  function usesPassword(providerData) {
    return (providerData || []).some((provider) => provider.providerId === "password");
  }

  return { validateDisplayName, imageCount, passwordMismatch, usesPassword };
});
