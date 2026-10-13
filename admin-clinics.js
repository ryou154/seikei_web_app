(() => {
  const PAGE_SIZE = 30;
  const PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  const byId = (id) => document.getElementById(id);
  let currentClinicId = "";
  let currentCandidates = [];
  let nextCursor = "";
  let cursor = "";
  const cursorHistory = [];
  let busy = false;
  let initialized = false;

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
      empty.textContent = "候補がありません。上の『候補を収集』から地域を指定してください。";
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
    byId("admin-reload").disabled = busy;
    byId("discover-clinics").disabled = busy;
  }

  function populatePrefectures() {
    const select = byId("discovery-prefecture");
    select.replaceChildren();
    for (const prefecture of PREFECTURES) {
      const option = document.createElement("option");
      option.value = prefecture;
      option.textContent = prefecture;
      select.append(option);
    }
    select.value = "大阪府";
  }

  async function discoverClinics() {
    if (busy) return;
    const prefecture = byId("discovery-prefecture").value;
    const maxPages = Number(byId("discovery-pages").value);
    const maximumRequests = maxPages * 2;
    if (!confirm(`${prefecture}の候補収集を実行します。Google Places APIを最大${maximumRequests}回呼び出します。よろしいですか？`)) return;
    busy = true;
    renderCandidates();
    setStatus(byId("discovery-status"), `${prefecture}の候補を収集中です…`);
    try {
      const data = await api("/api/admin/clinics/discover", {
        method: "POST",
        body: JSON.stringify({ prefecture, maxPages, confirmed: true })
      });
      setStatus(
        byId("discovery-status"),
        `${data.requests}回のAPI呼び出しで${data.uniqueCandidates}件を確認し、新規${data.inserted}件・既存更新${data.updated}件を下書きへ反映しました。`
      );
      byId("admin-status-filter").value = "draft";
      busy = false;
      await loadCandidates({ reset: true });
    } catch (error) {
      setStatus(byId("discovery-status"), error.message, true);
    } finally {
      busy = false;
      renderCandidates();
    }
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

  function fillEmptyField(id, value) {
    const input = byId(id);
    if (input && !input.value.trim() && value) input.value = value;
  }

  function applyPlacePreview(place) {
    fillEmptyField("clinic-name", place.name);
    fillEmptyField("clinic-prefecture", place.prefecture);
    fillEmptyField("clinic-city", place.city);
    fillEmptyField("clinic-area", place.area);
    fillEmptyField("clinic-address", place.address);
    fillEmptyField("clinic-phone", place.phone);
    fillEmptyField("clinic-official-url", place.officialUrl);
    fillEmptyField("clinic-opening-hours", place.openingHours);
    if (!byId("clinic-business-status").value && place.businessStatus) {
      byId("clinic-business-status").value = place.businessStatus;
    }
    if (!byId("clinic-sources").value.trim() && place.officialUrl) {
      byId("clinic-sources").value = place.officialUrl;
    }
  }

  async function selectClinic(id) {
    if (busy) return;
    busy = true;
    setStatus(byId("editor-status"), "候補を読み込んでいます…");
    byId("place-preview-name").textContent = "取得中…";
    byId("place-preview-map").hidden = true;
    byId("place-preview-official").hidden = true;
    byId("place-attribution").hidden = true;
    try {
      const detail = await api(`/api/admin/clinics/${encodeURIComponent(id)}`);
      fillEditor(detail.clinic);
      try {
        const preview = await api(`/api/admin/clinics/${encodeURIComponent(id)}/place-preview`);
        byId("place-preview-name").textContent = preview.place.name || "名称なし";
        byId("place-preview-map").href = preview.place.googleMapsUrl || "#";
        byId("place-preview-map").hidden = !preview.place.googleMapsUrl;
        byId("place-preview-official").href = preview.place.officialUrl || "#";
        byId("place-preview-official").hidden = !preview.place.officialUrl;
        byId("place-attribution").hidden = false;
        applyPlacePreview(preview.place);
        setStatus(byId("editor-status"), "Googleの基本情報を空欄へ入力しました。公式サイトを開いて内容を確認してください。");
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
    if (initialized || !window.AppAuth?.uid) return;
    initialized = true;
    content.hidden = false;
    populatePrefectures();
    byId("admin-reload").addEventListener("click", () => void loadCandidates({ reset: true }));
    byId("discover-clinics").addEventListener("click", () => void discoverClinics());
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
