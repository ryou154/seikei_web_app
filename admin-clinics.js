(() => {
  const PAGE_SIZE = 30;
  const byId = (id) => document.getElementById(id);
  let currentClinicId = "";
  let currentCandidates = [];
  let nextCursor = "";
  let cursor = "";
  const cursorHistory = [];
  let busy = false;

  function lines(value) {
    return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }

  function commaList(value) {
    return String(value || "").split(/[、,]/).map((item) => item.trim()).filter(Boolean);
  }

  function rowParts(value, count) {
    const parts = value.split(/[｜|]/).map((item) => item.trim());
    while (parts.length < count) parts.push("");
    return parts.slice(0, count);
  }

  function setStatus(target, message, error = false) {
    target.textContent = message;
    target.dataset.error = error ? "true" : "false";
  }

  async function api(path, options = {}) {
    const response = await window.AppAuth.fetch(path, {
      cache: "no-store",
      ...options,
      headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "処理に失敗しました。");
    return data;
  }

  function candidateLabel(clinic) {
    return clinic.name || clinic.discoveryPrefectures?.join("・") || "未確認候補";
  }

  function renderCandidates() {
    const list = byId("candidate-list");
    list.replaceChildren();
    if (!currentCandidates.length) {
      const empty = document.createElement("p");
      empty.className = "editor-empty";
      empty.textContent = "候補がありません。";
      list.append(empty);
    }
    for (const clinic of currentCandidates) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "candidate-item";
      button.dataset.id = clinic.id;
      if (clinic.id === currentClinicId) button.setAttribute("aria-current", "true");
      const title = document.createElement("strong");
      title.textContent = candidateLabel(clinic);
      const meta = document.createElement("span");
      meta.textContent = `${clinic.verificationStatus} / ${clinic.id}`;
      button.append(title, meta);
      button.addEventListener("click", () => void selectClinic(clinic.id));
      list.append(button);
    }
    byId("candidate-previous").disabled = busy || !cursorHistory.length;
    byId("candidate-next").disabled = busy || !nextCursor;
  }

  async function loadCandidates({ reset = false } = {}) {
    if (busy) return;
    busy = true;
    if (reset) {
      cursor = "";
      nextCursor = "";
      cursorHistory.length = 0;
      currentClinicId = "";
    }
    renderCandidates();
    setStatus(byId("candidate-status"), "候補を読み込んでいます…");
    try {
      const params = new URLSearchParams({ status: byId("admin-status-filter").value, limit: String(PAGE_SIZE) });
      if (cursor) params.set("cursor", cursor);
      const data = await api(`/api/admin/clinics?${params}`);
      currentCandidates = data.clinics || [];
      nextCursor = data.nextCursor || "";
      setStatus(byId("candidate-status"), `${currentCandidates.length}件を表示しています。`);
    } catch (error) {
      currentCandidates = [];
      nextCursor = "";
      setStatus(byId("candidate-status"), error.message, true);
    } finally {
      busy = false;
      renderCandidates();
    }
  }

  function formatPricing(items) {
    return (items || []).map((item) => [
      item.treatment, item.displayPrice, (item.conditions || []).join(","),
      (item.additionalCosts || []).join(","), item.sourceUrl
    ].join("｜")).join("\n");
  }

  function formatDoctors(items) {
    return (items || []).map((item) => [
      item.name, item.title, (item.specialties || []).join(","),
      (item.qualifications || []).join(","), item.sourceUrl
    ].join("｜")).join("\n");
  }

  function formatInformation(items) {
    return (items || []).map((item) => [item.title, item.description, item.treatment, item.sourceUrl].join("｜")).join("\n");
  }

  function fillEditor(clinic) {
    currentClinicId = clinic.id;
    byId("editor-empty").hidden = true;
    byId("clinic-editor").hidden = false;
    byId("clinic-place-id").textContent = clinic.placeId || clinic.id;
    byId("clinic-name").value = clinic.name || "";
    byId("clinic-prefecture").value = clinic.prefecture || clinic.discoveryPrefectures?.[0] || "";
    byId("clinic-city").value = clinic.city || "";
    byId("clinic-area").value = clinic.area || "";
    byId("clinic-address").value = clinic.address || "";
    byId("clinic-phone").value = clinic.phone || "";
    byId("clinic-official-url").value = clinic.officialUrl || "";
    byId("clinic-business-status").value = clinic.businessStatus || "";
    byId("clinic-opening-hours").value = clinic.openingHours || "";
    byId("clinic-treatments").value = (clinic.treatments || []).join("\n");
    byId("clinic-tags").value = (clinic.tags || []).join("\n");
    byId("clinic-pricing").value = formatPricing(clinic.pricing);
    byId("clinic-doctors").value = formatDoctors(clinic.doctors);
    byId("clinic-case-summary").value = clinic.caseInformation?.summary || "";
    byId("clinic-case-period").value = clinic.caseInformation?.period || "";
    byId("clinic-case-scope").value = clinic.caseInformation?.scope || "";
    byId("clinic-case-source").value = clinic.caseInformation?.sourceUrl || "";
    byId("clinic-risks").value = formatInformation(clinic.downtimeAndRisks);
    byId("clinic-aftercare").value = formatInformation(clinic.warrantyAndAftercare);
    byId("clinic-sources").value = (clinic.sources || []).map((item) => item.url).filter(Boolean).join("\n");
    byId("clinic-verification-status").value = clinic.verificationStatus || "unverified";
    byId("clinic-publication-status").value = clinic.publicationStatus || "draft";
    byId("editor-badge").textContent = clinic.publicationStatus === "published" ? "公開済み" : "下書き";
    setStatus(byId("editor-status"), "");
    renderCandidates();
  }

  async function selectClinic(id) {
    if (busy) return;
    busy = true;
    setStatus(byId("editor-status"), "候補を読み込んでいます…");
    byId("place-preview-name").textContent = "取得中…";
    byId("place-preview-map").hidden = true;
    byId("place-attribution").hidden = true;
    try {
      const detail = await api(`/api/admin/clinics/${encodeURIComponent(id)}`);
      fillEditor(detail.clinic);
      try {
        const preview = await api(`/api/admin/clinics/${encodeURIComponent(id)}/place-preview`);
        byId("place-preview-name").textContent = preview.place.name || "名称なし";
        byId("place-preview-map").href = preview.place.googleMapsUrl || "#";
        byId("place-preview-map").hidden = !preview.place.googleMapsUrl;
        byId("place-attribution").hidden = false;
      } catch (error) {
        byId("place-preview-name").textContent = error.message;
      }
    } catch (error) {
      setStatus(byId("editor-status"), error.message, true);
    } finally {
      busy = false;
      renderCandidates();
    }
  }

  function parsePricing() {
    return lines(byId("clinic-pricing").value).map((row) => {
      const [treatment, displayPrice, conditions, additionalCosts, sourceUrl] = rowParts(row, 5);
      return { treatment, displayPrice, conditions: commaList(conditions), additionalCosts: commaList(additionalCosts), sourceUrl };
    });
  }

  function parseDoctors() {
    return lines(byId("clinic-doctors").value).map((row) => {
      const [name, title, specialties, qualifications, sourceUrl] = rowParts(row, 5);
      return { name, title, specialties: commaList(specialties), qualifications: commaList(qualifications), sourceUrl };
    });
  }

  function parseInformation(id) {
    return lines(byId(id).value).map((row) => {
      const [title, description, treatment, sourceUrl] = rowParts(row, 4);
      return { title, description, treatment, sourceUrl };
    });
  }

  function editorPayload(publicationStatus) {
    const caseSummary = byId("clinic-case-summary").value.trim();
    const caseSource = byId("clinic-case-source").value.trim();
    return {
      name: byId("clinic-name").value,
      prefecture: byId("clinic-prefecture").value,
      city: byId("clinic-city").value,
      area: byId("clinic-area").value,
      address: byId("clinic-address").value,
      phone: byId("clinic-phone").value,
      officialUrl: byId("clinic-official-url").value,
      businessStatus: byId("clinic-business-status").value,
      openingHours: byId("clinic-opening-hours").value,
      treatments: lines(byId("clinic-treatments").value),
      tags: lines(byId("clinic-tags").value),
      pricing: parsePricing(),
      doctors: parseDoctors(),
      caseInformation: caseSummary || caseSource ? {
        summary: caseSummary,
        period: byId("clinic-case-period").value,
        scope: byId("clinic-case-scope").value,
        sourceUrl: caseSource
      } : null,
      downtimeAndRisks: parseInformation("clinic-risks"),
      warrantyAndAftercare: parseInformation("clinic-aftercare"),
      sources: lines(byId("clinic-sources").value).map((sourceUrl) => ({ url: sourceUrl, type: "official" })),
      verificationStatus: publicationStatus === "published" ? "verified" : byId("clinic-verification-status").value,
      publicationStatus
    };
  }

  async function save(publicationStatus) {
    if (!currentClinicId || busy) return;
    if (publicationStatus === "published" && !confirm("公式情報と情報源を確認し、このクリニックを公開しますか？")) return;
    busy = true;
    setStatus(byId("editor-status"), publicationStatus === "published" ? "公開しています…" : "保存しています…");
    try {
      const data = await api(`/api/admin/clinics/${encodeURIComponent(currentClinicId)}`, {
        method: "PUT",
        body: JSON.stringify(editorPayload(publicationStatus))
      });
      fillEditor(data.clinic);
      setStatus(byId("editor-status"), publicationStatus === "published" ? "公開しました。" : "下書きを保存しました。");
      busy = false;
      await loadCandidates();
    } catch (error) {
      setStatus(byId("editor-status"), error.message, true);
    } finally {
      busy = false;
      renderCandidates();
    }
  }

  function initialize() {
    const content = byId("app-content");
    if (!window.AppAuth?.uid || !content.hidden) return;
    content.hidden = false;
    byId("admin-reload").addEventListener("click", () => void loadCandidates({ reset: true }));
    byId("admin-status-filter").addEventListener("change", () => void loadCandidates({ reset: true }));
    byId("candidate-next").addEventListener("click", () => {
      if (!nextCursor) return;
      cursorHistory.push(cursor);
      cursor = nextCursor;
      void loadCandidates();
    });
    byId("candidate-previous").addEventListener("click", () => {
      if (!cursorHistory.length) return;
      cursor = cursorHistory.pop();
      void loadCandidates();
    });
    byId("save-draft").addEventListener("click", () => void save("draft"));
    byId("publish-clinic").addEventListener("click", () => void save("published"));
    void loadCandidates({ reset: true });
  }

  window.addEventListener("app-authorized", initialize);
  if (window.AppAuth?.uid) initialize();
})();
