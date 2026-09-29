(() => {
  let readSettings;
  let histories = [];
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
    target.textContent = value;
    target.dataset.error = String(error);
  }

  async function request(path, options = {}) {
    const headers = await window.AppAuth.headers();
    const response = await fetch(path, {
      ...options,
      cache: "no-store",
      headers: { ...headers, ...(options.body ? { "Content-Type": "application/json" } : {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "クラウド保存を利用できませんでした。");
    return data;
  }

  async function withBusy(button, status, task) {
    if (!await window.AppAuth.requireUser()) return;
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

  function displayDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "保存日時不明" : date.toLocaleString("ja-JP");
  }

  function renderHistory() {
    const list = controls.historyList;
    if (!window.AppAuth.user) {
      list.innerHTML = '<p class="small">履歴を見るにはログインしてください。</p>';
      return;
    }
    if (!histories.length) {
      list.innerHTML = '<p class="small">クラウドに保存された履歴はありません。</p>';
      return;
    }
    list.replaceChildren(...histories.map((entry) => {
      const card = document.createElement("article");
      card.className = "history-card";
      const title = document.createElement("h4");
      title.textContent = `${entry.category || "設定"}のシミュレーション`;
      const date = document.createElement("p");
      date.className = "small";
      date.textContent = displayDate(entry.savedAt);
      const description = document.createElement("p");
      description.textContent = entry.requestText || "選択式の理想イメージで作成";
      const actions = document.createElement("div");
      actions.className = "account-data-actions";
      const load = document.createElement("button");
      load.type = "button";
      load.textContent = "この設定を読込";
      load.addEventListener("click", () => {
        applySettings(entry);
        setStatus(controls.historyStatus, "履歴の設定を入力欄へ反映しました。");
        document.querySelector(".input-panel")?.scrollIntoView({ behavior: "smooth" });
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "1件削除";
      remove.addEventListener("click", () => deleteHistory(entry.id, remove));
      actions.append(load, remove);
      card.append(title, date, description, actions);
      return card;
    }));
  }

  async function loadHistory({ quiet = false } = {}) {
    if (!window.AppAuth.user) {
      histories = [];
      renderHistory();
      return;
    }
    try {
      const data = await request("/api/account/history");
      histories = Array.isArray(data.entries) ? data.entries : [];
      renderHistory();
      if (!quiet) setStatus(controls.historyStatus, `クラウド履歴を${histories.length}件読み込みました。`);
    } catch (error) {
      histories = [];
      renderHistory();
      setStatus(controls.historyStatus, error.message, true);
    }
  }

  async function saveHistory(result) {
    await withBusy(document.getElementById("save-button"), controls.historyStatus, async () => {
      if (!result) return;
      const payload = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 18)}`,
        requestText: result.requestText || "",
        profile: result.profile,
        category: result.category || "設定"
      };
      const data = await request("/api/account/history", { method: "PUT", body: JSON.stringify(payload) });
      histories = data.entries;
      renderHistory();
      setStatus(controls.historyStatus, "設定をクラウド履歴に保存しました。画像は保存していません。");
    });
  }

  async function deleteHistory(id, button) {
    await withBusy(button, controls.historyStatus, async () => {
      const data = await request(`/api/account/history/${encodeURIComponent(id)}`, { method: "DELETE" });
      histories = data.entries;
      renderHistory();
      setStatus(controls.historyStatus, "履歴を1件削除しました。");
    });
  }

  async function clearHistory() {
    if (!histories.length) {
      setStatus(controls.historyStatus, "削除する履歴はありません。");
      return;
    }
    if (!confirm("クラウドに保存した履歴をすべて削除しますか？この操作は元に戻せません。")) return;
    await withBusy(document.getElementById("clear-history-button"), controls.historyStatus, async () => {
      const data = await request("/api/account/history", { method: "DELETE" });
      histories = data.entries;
      renderHistory();
      setStatus(controls.historyStatus, "クラウド履歴をすべて削除しました。");
    });
  }

  function init(options) {
    readSettings = options.readSettings;
    controls.settingsStatus = document.getElementById("settings-status");
    controls.historyStatus = document.getElementById("history-status");
    controls.historyList = document.getElementById("history-list");
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
    document.getElementById("history-reload").addEventListener("click", (event) => withBusy(event.currentTarget, controls.historyStatus, () => loadHistory()));
    window.addEventListener("app-auth-change", () => loadHistory({ quiet: true }));
    window.AppAuth.ready.then(() => loadHistory({ quiet: true }));
    renderHistory();
  }

  window.AccountData = { init, saveHistory, clearHistory };
})();
