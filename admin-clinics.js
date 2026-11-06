(() => {
  const PAGE_SIZE = 10;
  const NATIONWIDE_CONCURRENCY = 5;
  const EXTRACTION_POLL_MS = 5000;
  const EXTRACTION_RETRY_MS = 60000;
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
  let activeExtractionClinicId = "";
  const pollingClinicIds = new Set();

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
    if (!response.ok) throw new Error(data.error || `処理に失敗しました（HTTP ${response.status}）。`);
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
    byId("extract-selected-clinic").disabled = busy || !currentClinicId || activeExtractionClinicId === currentClinicId;
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

  function isBillingError(error) {
    return /\b402\b|payment required|insufficient (?:credit|balance)|no (?:credit|balance)/i.test(error?.message || "");
  }

  function isRetryableServiceError(error) {
    return /429|resource.exhausted|quota|rate.?limit|http 50[234]/i.test(error?.message || "");
  }

  async function publishedClinicIds(status) {
    const ids = [];
    const groups = prefectureGroups(5);
    for (const [index, prefectures] of groups.entries()) {
      setStatus(status, `2/3 公開済みクリニックを確認しています… 地域グループ${index + 1}/${groups.length}`);
      const pages = await Promise.all(prefectures.map(async (prefecture) => {
        const params = new URLSearchParams({ status: "published", limit: String(PAGE_SIZE), prefecture });
        return api(`/api/admin/clinics?${params}`);
      }));
      for (const page of pages) {
        for (const clinic of page.clinics || []) if (clinic.id) ids.push(clinic.id);
      }
    }
    return [...new Set(ids)];
  }

  async function startClinicExtraction(id) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await api(`/api/admin/clinics/${encodeURIComponent(id)}/extract-official`, {
          method: "POST",
          body: JSON.stringify({ confirmed: true })
        });
      } catch (error) {
        lastError = error;
        if (!isRetryableServiceError(error) || attempt === 3) throw error;
        await wait(EXTRACTION_RETRY_MS * attempt);
      }
    }
    throw lastError;
  }

  async function updateOneClinic(id) {
    await startClinicExtraction(id);
    while (true) {
      await wait(EXTRACTION_POLL_MS);
      const data = await api(`/api/admin/clinics/${encodeURIComponent(id)}/extract-official`);
      if (data.status === "running") continue;
      if (data.status === "completed") return data;
      throw new Error(data.clinic?.extractionError || "公式情報の抽出に失敗しました。");
    }
  }

  async function updateNationwideClinics() {
    if (busy) return;
    const confirmed = confirm(
      "全国47都道府県を対象に、各都道府県最大10院の登録・更新と、公開済みクリニックの公式情報更新を実行します。Google Places APIとGemini APIを使用し、完了まで長時間かかる場合があります。実行しますか？"
    );
    if (!confirmed) return;

    busy = true;
    renderCandidates();
    const status = byId("nationwide-update-status");
    const totals = { published: 0, succeeded: 0, failed: 0, changed: 0, autoApplied: 0 };
    try {
      const discoveryGroups = prefectureGroups(5);
      for (const [index, prefectures] of discoveryGroups.entries()) {
        setStatus(
          status,
          `1/2 Googleから登録・更新しています… 地域グループ${index + 1}/${discoveryGroups.length}（新規公開${totals.published}院）`
        );
        try {
          const places = await api("/api/admin/clinics/auto-publish", {
            method: "POST",
            body: JSON.stringify({
              prefectures,
              limitPerPrefecture: 10,
              maxPages: 1,
              confirmed: true
            })
          });
          totals.published += Number(places.published || 0);
        } catch (error) {
          throw new Error(`Google収集 地域グループ${index + 1}/${discoveryGroups.length}で失敗: ${error.message}`);
        }
      }

      const clinicIds = await publishedClinicIds(status);
      let cursor = 0;
      let processed = 0;
      let running = 0;
      let serviceFailures = 0;
      let abortReason = "";
      const failureSamples = [];
      const updateProgress = () => setStatus(
        status,
        `3/3 公式情報を並列更新しています… ${processed}/${clinicIds.length}院完了（実行中${running}院・成功${totals.succeeded}院・失敗${totals.failed}院）`
      );
      const worker = async (workerIndex) => {
        await wait(workerIndex * 3000);
        while (!abortReason) {
          const index = cursor;
          cursor += 1;
          if (index >= clinicIds.length) return;
          running += 1;
          updateProgress();
          try {
            const data = await updateOneClinic(clinicIds[index]);
            totals.succeeded += 1;
            if (data.changed) totals.changed += 1;
            if (data.autoApplied) totals.autoApplied += 1;
            serviceFailures = 0;
          } catch (error) {
            totals.failed += 1;
            if (failureSamples.length < 3) failureSamples.push(error.message);
            if (isBillingError(error)) {
              abortReason = `Gemini APIの支払いエラー（HTTP 402）のため自動停止しました: ${error.message}`;
            } else if (isRetryableServiceError(error)) {
              serviceFailures += 1;
              if (serviceFailures >= NATIONWIDE_CONCURRENCY) {
                abortReason = `Gemini APIの利用制限が続いたため自動停止しました: ${error.message}`;
              }
            }
          } finally {
            running -= 1;
            processed += 1;
            updateProgress();
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(NATIONWIDE_CONCURRENCY, clinicIds.length) }, (_, index) => worker(index)));

      setStatus(
        status,
        abortReason || `更新完了：新規公開${totals.published}院、公式情報 成功${totals.succeeded}院・失敗${totals.failed}院・変更${totals.changed}院・自動反映${totals.autoApplied}院。${failureSamples.length ? ` 主な失敗: ${failureSamples.join(" / ")}` : ""}`,
        Boolean(abortReason) || totals.failed > 0
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
    currentDetectedData = clinic.detectedData || null;
    if (clinic.officialExtractionJob?.status === "running") activeExtractionClinicId = clinic.id;
    else if (activeExtractionClinicId === clinic.id) activeExtractionClinicId = "";
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
        : clinic.officialExtractionJob?.status === "running" ? "公式情報の抽出をバックグラウンドで実行しています…" : "",
      clinic.extractionStatus === "failed"
    );
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
    fillEmptyField("clinic-treatments", (currentDetectedData.treatments || []).map((item) => item.name).filter(Boolean).join("\n"));
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
      if (activeExtractionClinicId === id) void pollClinicExtraction(id);
    }
  }

  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  async function pollClinicExtraction(id) {
    if (pollingClinicIds.has(id)) return;
    pollingClinicIds.add(id);
    try {
      while (activeExtractionClinicId === id) {
        await wait(3000);
        const data = await api(`/api/admin/clinics/${encodeURIComponent(id)}/extract-official`);
        if (data.status === "running") {
          if (currentClinicId === id) {
            const completed = data.progress?.completed ?? 0;
            const total = data.progress?.total ?? 3;
            setStatus(byId("editor-status"), `公式情報を抽出しています… ${completed}/${total}項目完了。画面を閉じても処理は継続します。`);
          }
          continue;
        }
        activeExtractionClinicId = "";
        if (data.clinic && currentClinicId === id) fillEditor(data.clinic);
        if (currentClinicId === id) {
          if (data.status === "completed") {
            setStatus(byId("editor-status"), data.autoApplied
              ? "公式情報を抽出し、根拠を確認できた項目を自動反映しました。"
              : "公式情報を抽出しました。抽出候補を確認してください。");
          } else if (data.status === "failed") {
            setStatus(byId("editor-status"), `公式情報の抽出に失敗しました: ${data.clinic?.extractionError || "原因を確認できませんでした。"}`, true);
          }
        }
        await loadCandidates();
      }
    } catch (error) {
      activeExtractionClinicId = "";
      if (currentClinicId === id) setStatus(byId("editor-status"), `公式情報の抽出に失敗しました: ${error.message}`, true);
    } finally {
      pollingClinicIds.delete(id);
      renderCandidates();
    }
  }

  async function extractSelectedClinic() {
    if (!currentClinicId || busy) return;
    if (!confirm("このクリニックの公式サイトをGeminiで再解析し、根拠を確認できた情報を自動反映しますか？")) return;
    busy = true;
    renderCandidates();
    setStatus(byId("editor-status"), "公式サイト解析を開始しています…");
    try {
      const data = await api(`/api/admin/clinics/${encodeURIComponent(currentClinicId)}/extract-official`, {
        method: "POST",
        body: JSON.stringify({ confirmed: true })
      });
      const id = currentClinicId;
      activeExtractionClinicId = id;
      if (data.clinic) fillEditor(data.clinic);
      setStatus(byId("editor-status"), "公式情報の抽出を開始しました。画面を閉じても処理は継続します。");
      void pollClinicExtraction(id);
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
