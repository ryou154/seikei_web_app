(() => {
  const PAGE_SIZE = 10;
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
  let currentDetectedData = null;
  let currentCandidates = [];
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
      empty.textContent = "選択した都道府県に公開済みのクリニックがありません。";
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
      meta.textContent = `${clinic.verificationStatus}${clinic.extractionStatus ? ` / 抽出: ${clinic.extractionStatus}` : ""}`;
      button.append(title, meta);
      button.addEventListener("click", () => void selectClinic(clinic.id));
      list.append(button);
    }
    byId("update-nationwide-clinics").disabled = busy;
    byId("extract-selected-clinic").disabled = busy || !currentClinicId;
    byId("apply-detected-data").disabled = busy || !currentDetectedData;
  }

  function populatePrefectures() {
    const select = byId("published-prefecture");
    select.replaceChildren();
    for (const prefecture of PREFECTURES) {
      const option = document.createElement("option");
      option.value = prefecture;
      option.textContent = prefecture;
      option.selected = prefecture === "大阪府";
      select.append(option);
    }
  }

  function selectedPrefectures() {
    const prefecture = byId("published-prefecture").value;
    return prefecture ? [prefecture] : [];
  }

  function prefectureGroups(size = 10) {
    const groups = [];
    for (let index = 0; index < PREFECTURES.length; index += size) {
      groups.push(PREFECTURES.slice(index, index + size));
    }
    return groups;
  }

  async function updateNationwideClinics() {
    if (busy) return;
    busy = true;
    renderCandidates();
    const status = byId("nationwide-update-status");
    const startedAt = new Date().toISOString();
    const totals = { succeeded: 0, failed: 0, changed: 0, autoApplied: 0, skipped: 0, protected: 0 };
    try {
      const groups = prefectureGroups();
      let processed = 0;
      const maximumClinics = 10000;
      let reachedSafetyLimit = false;
      for (const [groupIndex, prefectures] of groups.entries()) {
        while (true) {
          if (processed >= maximumClinics) {
            reachedSafetyLimit = true;
            break;
          }
          setStatus(
            status,
            `公式HTMLから取得しています… ${processed}院完了（地域グループ${groupIndex + 1}/${groups.length}）`
          );
          const data = await api("/api/admin/clinics/extract-html", {
            method: "POST",
            body: JSON.stringify({
              prefectures,
              limit: 1,
              autoApply: true,
              before: startedAt,
              confirmed: true
            })
          });
          if (!data.requested) break;
          processed += Number(data.requested || 0);
          for (const key of ["succeeded", "failed", "changed", "autoApplied", "skipped", "protected"]) {
            totals[key] += Number(data[key] || 0);
          }
        }
        if (reachedSafetyLimit) break;
      }

      setStatus(
        status,
        `確認完了：${processed}院・保存${totals.succeeded}院・失敗${totals.failed}院・変更${totals.changed}院・自動反映${totals.autoApplied}院・確認済み情報を保護${totals.protected}院・院名や公式URLの不足${totals.skipped}院。${reachedSafetyLimit ? ` 上限の${maximumClinics}院まで処理しました。` : ""}`,
        totals.failed > 0
      );
      busy = false;
      await loadCandidates({ reset: true });
    } catch (error) {
      setStatus(status, `更新を中断しました：${error.message}`, true);
    } finally {
      busy = false;
      renderCandidates();
    }
  }

  async function loadCandidates({ reset = false } = {}) {
    if (busy) return;
    busy = true;
    if (reset) {
      currentClinicId = "";
      currentDetectedData = null;
    }
    const prefectures = selectedPrefectures();
    if (!prefectures.length) {
      currentCandidates = [];
      busy = false;
      setStatus(byId("candidate-status"), "表示する都道府県を1件以上選択してください。");
      renderCandidates();
      return;
    }
    renderCandidates();
    setStatus(byId("candidate-status"), "保存済みの公開クリニックを読み込んでいます…");
    try {
      const params = new URLSearchParams({ status: "published", limit: String(PAGE_SIZE) });
      for (const prefecture of prefectures) params.append("prefecture", prefecture);
      const data = await api(`/api/admin/clinics?${params}`);
      currentCandidates = data.clinics || [];
      setStatus(byId("candidate-status"), `${prefectures[0]}の公開済みクリニックを${currentCandidates.length}件表示しています。`);
    } catch (error) {
      currentCandidates = [];
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
    currentDetectedData = clinic.detectedHtmlData || clinic.detectedData || null;
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
    byId("apply-detected-data").disabled = !currentDetectedData;
    setStatus(
      byId("editor-status"),
      clinic.extractionStatus === "failed"
        ? `公式情報の抽出に失敗しました: ${clinic.extractionError || "原因は記録されていません。再実行すると詳細を記録します。"}`
        : clinic.htmlExtractionStatus ? `公式HTML取得：${clinic.htmlExtractionStatus}（確認候補を確認できます）` : "",
      clinic.extractionStatus === "failed"
    );
    if (clinic.htmlExtractionStatus) {
      const count = clinic.detectedHtmlData?.pricing?.length || 0;
      setStatus(byId("editor-status"), clinic.htmlExtractionStatus === "failed"
        ? `公式HTMLの取得に失敗しました：${clinic.htmlExtractionError || "公式サイトを確認してください。"}`
        : `公式HTML取得：${clinic.htmlExtractionStatus}・料金候補${count}件。取得できない項目と手動確認済み情報は保持しています。`, clinic.htmlExtractionStatus === "failed");
    }
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

  function applyDetectedData() {
    if (!currentDetectedData) return;
    if (currentDetectedData.html && !confirm("この院の取扱施術・料金条件・税込区分を公式サイトで確認しましたか？確認した候補だけを入力して保存してください。")) return;
    const services = currentDetectedData.information?.treatmentDetails || [];
    fillEmptyField("clinic-treatments", [...new Set([...(currentDetectedData.treatments || []), ...services].map(item => item.name).filter(Boolean))].join("\n"));
    fillEmptyField("clinic-opening-hours", currentDetectedData.information?.openingHours || currentDetectedData.openingHours);
    fillEmptyField("clinic-pricing", formatPricing(currentDetectedData.pricing));
    fillEmptyField("clinic-doctors", formatDoctors(currentDetectedData.doctors));
    const caseInformation = currentDetectedData.caseInformation?.[0];
    if (caseInformation) {
      fillEmptyField("clinic-case-summary", caseInformation.summary);
      fillEmptyField("clinic-case-period", caseInformation.period);
      fillEmptyField("clinic-case-scope", caseInformation.scope);
      fillEmptyField("clinic-case-source", caseInformation.sourceUrl);
    }
    fillEmptyField("clinic-risks", formatInformation(currentDetectedData.downtimeAndRisks));
    fillEmptyField("clinic-aftercare", formatInformation(currentDetectedData.warrantyAndAftercare));
    if (!byId("clinic-sources").value.trim()) {
      const sourceUrls = new Set([currentDetectedData.officialUrl]);
      for (const group of [
        currentDetectedData.treatments, currentDetectedData.pricing, currentDetectedData.doctors,
        currentDetectedData.caseInformation, currentDetectedData.downtimeAndRisks,
        currentDetectedData.warrantyAndAftercare
      ]) {
        for (const item of group || []) if (item.sourceUrl) sourceUrls.add(item.sourceUrl);
      }
      byId("clinic-sources").value = [...sourceUrls].filter(Boolean).join("\n");
    }
    setStatus(byId("editor-status"), "抽出候補を空欄へ入力しました。根拠URLと公式サイトの記載を確認してから保存してください。");
  }

  async function selectClinic(id) {
    if (busy) return;
    busy = true;
    setStatus(byId("editor-status"), "登録情報を読み込んでいます…");
    byId("place-preview-map").hidden = true;
    byId("place-preview-official").hidden = true;
    byId("place-attribution").hidden = true;
    try {
      const detail = await api(`/api/admin/clinics/${encodeURIComponent(id)}`);
      fillEditor(detail.clinic);
      byId("place-preview-name").textContent = detail.clinic.name || "名称未登録";
      if (/^https:\/\//.test(detail.clinic.officialUrl || "")) {
        byId("place-preview-official").href = detail.clinic.officialUrl;
        byId("place-preview-official").hidden = false;
      }
    } catch (error) {
      setStatus(byId("editor-status"), error.message, true);
    } finally {
      busy = false;
      renderCandidates();
    }
  }

  async function extractSelectedClinic() {
    if (!currentClinicId || busy) return;
    if (!confirm("公式サイトから情報を取得し、根拠を確認できた項目を更新しますか？手動確認済みの情報は保護し、グループ共通料金は確認候補として保存します。")) return;
    busy = true;
    renderCandidates();
    setStatus(byId("editor-status"), "公式サイト解析を開始しています…");
    try {
      const data = await api(`/api/admin/clinics/${encodeURIComponent(currentClinicId)}/extract-html`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true, autoApply: true })
      });
      if (data.clinic) fillEditor(data.clinic);
      const result = data.results?.[0];
      setStatus(byId("editor-status"), result?.ok
        ? `公式HTMLから料金${result.prices}件・施術${result.treatments}件・医師${result.doctors}件を取得しました。${data.autoApplied ? "登録情報へ反映しました。" : "確認候補を確認してください。"}`
        : `取得に失敗しました: ${result?.error || "結果を確認できませんでした。"}`, !result?.ok);
    } catch (error) {
      setStatus(byId("editor-status"), `公式情報の抽出に失敗しました: ${error.message}`, true);
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
    byId("published-prefecture").addEventListener("change", () => void loadCandidates({ reset: true }));
    byId("update-nationwide-clinics").addEventListener("click", () => void updateNationwideClinics());
    byId("extract-selected-clinic").addEventListener("click", () => void extractSelectedClinic());
    byId("save-draft").addEventListener("click", () => void save("draft"));
    byId("publish-clinic").addEventListener("click", () => void save("published"));
    byId("apply-detected-data").addEventListener("click", applyDetectedData);
    void loadCandidates({ reset: true });
  }

  window.addEventListener("app-authorized", initialize);
  if (window.AppAuth?.uid) initialize();
})();
