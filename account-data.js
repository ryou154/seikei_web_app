(() => {
  let readSettings;
  const controls = {};
  const profileFields = {
    gender: "gender-select", style: "style-select", eye: "eye-select",
    nose: "nose-select", face: "face-select", mouth: "mouth-select",
    forehead: "forehead-select", strength: "change-strength",
    imageEngine: "image-engine", region: "region-input", budget: "budget-select",
    downtime: "downtime-select", clinicPriority: "clinic-priority", priority: "priority"
  };
  const customFields = {
    style: "style-custom", eye: "eye-custom", nose: "nose-custom",
    face: "face-custom", mouth: "mouth-custom", forehead: "forehead-custom"
  };

  function setStatus(target, value, error = false) {
    if (!target) return;
    target.textContent = value;
    target.dataset.error = String(error);
  }

  async function request(path, options = {}) {
    const response = await window.AppAuth.fetch(path, {
      ...options,
      cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "クラウド保存を利用できませんでした。");
    return data;
  }

  async function withBusy(button, status, task) {
    if (!window.AppAuth?.uid) {
      setStatus(status, "ログインしてください。", true);
      return;
    }
    button.disabled = true;
    setStatus(status, "処理中...");
    try {
      await task();
    } catch (error) {
      setStatus(status, error.message || "処理に失敗しました。", true);
    } finally {
      button.disabled = false;
    }
  }

  function applySettings(settings) {
    if (!settings?.profile) return false;
    document.getElementById("request-text").value = settings.requestText || "";
    for (const [key, id] of Object.entries(profileFields)) {
      const element = document.getElementById(id);
      const value = settings.profile[key];
      if (element && value !== undefined && [...element.options || []].some((option) => option.value === String(value))) {
        element.value = String(value);
      } else if (element && element.type === "range") {
        element.value = String(value);
      } else if (element && key === "region") {
        element.value = String(value || "");
      }
    }
    for (const [key, id] of Object.entries(customFields)) {
      document.getElementById(id).value = settings.profile.custom?.[key] || "";
    }
    const strength = document.getElementById("change-strength");
    strength.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function prepareImageForStorage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => {
        const maxSize = 1200;
        const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.76));
      });
      image.addEventListener("error", () => reject(new Error("保存用画像の軽量化に失敗しました。")));
      image.src = dataUrl;
    });
  }

  async function saveHistory(result) {
    await withBusy(document.getElementById("save-button"), controls.saveStatus, async () => {
      if (!result) return;
      const payload = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`,
        requestText: result.requestText || "",
        profile: result.profile,
        category: result.category || "設定",
        result: {
          beforeScore: result.beforeScore ?? null,
          afterScore: result.afterScore ?? null,
          analysis: result.analysisText || result.analysis || "",
          clinicNames: result.clinicNames || [],
          generationModel: result.generationModel || "",
          generationStatus: result.generationStatus || "unknown"
        }
      };
      await request("/api/account/history", { method: "PUT", body: JSON.stringify(payload) });
      if (!controls.imageConsent.checked) {
        setStatus(controls.saveStatus, "分析結果をクラウド履歴に保存しました。画像は保存していません。");
        return;
      }
      if (!result.beforeImage || !result.afterImage) {
        throw new Error("分析結果は保存しましたが、保存対象の画像を確認できませんでした。");
      }
      try {
        setStatus(controls.saveStatus, "分析結果を保存しました。画像を軽量化して保存しています...");
        const [before, after] = await Promise.all([
          prepareImageForStorage(result.beforeImage), prepareImageForStorage(result.afterImage)
        ]);
        await request(`/api/account/history/${encodeURIComponent(payload.id)}/images`, {
          method: "PUT", body: JSON.stringify({ before, after })
        });
        setStatus(controls.saveStatus, "分析結果と画像を本人専用のクラウド領域に保存しました。");
      } catch (error) {
        throw new Error(`分析結果は保存しましたが、画像保存に失敗しました。${error.message}`);
      }
    });
  }

  function init(options) {
    readSettings = options.readSettings;
    controls.settingsStatus = document.getElementById("settings-status");
    controls.saveStatus = document.getElementById("save-status");
    controls.imageConsent = document.getElementById("save-images-consent");
    document.getElementById("settings-save").addEventListener("click", (event) => withBusy(event.currentTarget, controls.settingsStatus, async () => {
      await request("/api/account/settings", { method: "PUT", body: JSON.stringify(readSettings()) });
      setStatus(controls.settingsStatus, "現在の入力設定をクラウドに保存しました。");
    }));
    document.getElementById("settings-load").addEventListener("click", (event) => withBusy(event.currentTarget, controls.settingsStatus, async () => {
      const data = await request("/api/account/settings");
      setStatus(controls.settingsStatus, data.settings && applySettings(data.settings)
        ? "保存設定を入力欄へ反映しました。" : "保存された設定はありません。");
    }));
    document.getElementById("settings-delete").addEventListener("click", (event) => {
      if (!confirm("保存した設定を削除しますか？")) return;
      withBusy(event.currentTarget, controls.settingsStatus, async () => {
        await request("/api/account/settings", { method: "DELETE" });
        setStatus(controls.settingsStatus, "保存設定を削除しました。");
      });
    });
  }

  window.AccountData = { init, saveHistory };
})();
