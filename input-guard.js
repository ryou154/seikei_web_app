(function () {
  const allowedPhrases = [
    "目", "目元", "二重", "ぱっちり", "切れ長", "たれ目", "目尻", "涙袋",
    "鼻", "鼻筋", "小鼻", "鼻先", "口", "唇", "口角", "人中",
    "輪郭", "小顔", "顎", "あご", "頬", "ほお", "額", "おでこ",
    "眉", "肌", "毛穴", "赤み", "自然", "ナチュラル", "かわいい", "クール", "韓国"
  ];

  function sanitizeAestheticRequest(value) {
    const text = String(value || "").replace(/[\u0000-\u001f<>]/g, " ").trim();
    if (!text) return "";
    const matches = allowedPhrases.filter((phrase) => text.includes(phrase));
    return [...new Set(matches)].join("、");
  }

  function validateAestheticRequest(value) {
    const original = String(value || "").replace(/[\u0000-\u001f<>]/g, " ").trim();
    if (!original) return { ok: true, sanitized: "" };
    const sanitized = sanitizeAestheticRequest(original);
    if (!sanitized) {
      return { ok: false, message: "整形・美容に関係する希望を入力してください。関係のない言葉はシミュレーションに使用できません。" };
    }
    return { ok: true, sanitized };
  }

  function validateFaceInput(analysis) {
    if (!analysis?.ok) return { ok: false, message: analysis?.message || "顔を確認できませんでした。正面の顔写真を使用してください。" };
    const metrics = analysis.metrics || {};
    if (!Number.isFinite(Number(metrics.eyeOpenRatio)) || Number(metrics.eyeOpenRatio) < 0.12) {
      return { ok: false, message: "目が開いている正面の顔写真を使用してください。目を閉じた写真や極端な表情はシミュレーションできません。" };
    }
    if (Number(metrics.faceWidthInFrame) < 8 || Number(metrics.faceHeightInFrame) < 12) {
      return { ok: false, message: "顔が小さすぎます。顔全体が十分に写った写真を使用してください。" };
    }
    return { ok: true };
  }

  window.InputGuard = { sanitizeAestheticRequest, validateAestheticRequest, validateFaceInput };
})();
