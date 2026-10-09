(() => {
  const PREFECTURES = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
  ];
  const imageUrls = new Set();
  let initializedUid = null;
  let histories = [];
  let residencePrefecture = "";

  const element = (id) => document.getElementById(id);

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

  function setStatus(message, error = false) {
    const status = element("prefecture-status");
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function displayDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "保存日時不明" : date.toLocaleDateString("ja-JP");
  }

  function createHistoryCard(entry) {
    const card = document.createElement("article");
    card.className = "home-card history-preview-card";

    const media = document.createElement("div");
    media.className = "history-preview-media";
    const imageFlags = entry.result?.images || {};
    if (imageFlags.after) {
      const loading = document.createElement("span");
      loading.textContent = "After画像を読込中";
      media.append(loading);
      window.AppAuth.fetch(`/api/account/history/${encodeURIComponent(entry.id)}/images/after`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error();
          return response.blob();
        })
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          imageUrls.add(url);
          const image = document.createElement("img");
          image.src = url;
          image.alt = "保存したAfter画像";
          media.replaceChildren(image);
        })
        .catch(() => { loading.textContent = "画像を表示できません"; });
    } else {
      media.textContent = "画像保存なし";
    }

    const content = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = `${entry.category || "設定"}のシミュレーション`;
    const date = document.createElement("p");
    date.className = "home-muted";
    date.textContent = displayDate(entry.savedAt);
    const requestText = document.createElement("p");
    requestText.textContent = entry.requestText || "選択式の理想イメージで作成";
    const score = document.createElement("p");
    score.className = "history-score";
    score.textContent = `顔バランススコア: ${entry.result?.beforeScore ?? "-"} → ${entry.result?.afterScore ?? "-"}`;
    const link = document.createElement("a");
    link.className = "home-history-link";
    link.href = "/history.html";
    link.textContent = "履歴を開く";
    content.append(heading, date, requestText, score, link);
    card.append(media, content);
    return card;
  }

  function renderHistory() {
    const list = element("recent-history");
    if (!histories.length) {
      list.innerHTML = '<div class="home-empty"><p>まだ保存履歴がありません。</p><a href="app.html#input-title">最初のシミュレーションを始める</a></div>';
    } else {
      list.replaceChildren(...histories.slice(0, 3).map(createHistoryCard));
    }
    element("history-count").textContent = `${histories.length} / 10件`;
    const imageCount = histories.reduce((count, entry) => count + ["before", "after"].filter((kind) => entry.result?.images?.[kind]).length, 0);
    element("image-count").textContent = `${imageCount}件`;
  }

  function prefectureKeyword(value) {
    return value.replace(/[都府県]$/, "");
  }

  function renderClinics() {
    const list = element("local-clinics");
    const note = element("clinic-region-note");
    if (!residencePrefecture) {
      note.textContent = "都道府県を設定すると、その地域の掲載クリニックを表示します。";
      list.innerHTML = '<div class="home-empty"><p>お住まいの都道府県が未設定です。</p></div>';
      return;
    }
    const keyword = prefectureKeyword(residencePrefecture);
    const matches = (window.CLINIC_DATA || []).filter((clinic) =>
      clinic.address?.startsWith(residencePrefecture) || clinic.regions?.includes(keyword)
    ).slice(0, 3);
    note.textContent = `${residencePrefecture}の公式情報を確認済みの掲載クリニックです。`;
    if (!matches.length) {
      list.innerHTML = `<div class="home-empty"><p>${residencePrefecture}は現在掲載準備中です。</p><a href="app.html#clinic-title">別の地域から探す</a></div>`;
      return;
    }
    list.replaceChildren(...matches.map((clinic) => {
      const card = document.createElement("article");
      card.className = "home-card clinic-preview-card";
      const heading = document.createElement("h3");
      heading.textContent = clinic.name;
      const area = document.createElement("p");
      area.className = "clinic-area";
      area.textContent = clinic.area;
      const tags = document.createElement("p");
      tags.className = "home-muted";
      tags.textContent = (clinic.tags || []).slice(0, 3).join(" / ");
      const link = document.createElement("a");
      link.href = clinic.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "公式サイトを確認";
      card.append(heading, area, tags, link);
      return card;
    }));
  }

  async function initialize() {
    const uid = window.AppAuth?.uid;
    if (!uid || uid === initializedUid) return;
    initializedUid = uid;
    element("home-email").textContent = window.AppAuth.email;
    const accountName = window.AppAuth.email.split("@")[0];
    element("home-greeting").textContent = accountName ? `${accountName}さん、こんにちは` : "ホーム";
    try {
      const [profileData, historyData] = await Promise.all([
        request("/api/account/profile"),
        request("/api/account/history")
      ]);
      residencePrefecture = profileData.profile?.residencePrefecture || "";
      histories = Array.isArray(historyData.entries) ? historyData.entries : [];
      element("prefecture-select").value = residencePrefecture;
      renderHistory();
      renderClinics();
    } catch (error) {
      element("recent-history").innerHTML = '<p class="home-empty">履歴を読み込めませんでした。再読み込みしてください。</p>';
      setStatus(error.message || "プロフィールを読み込めませんでした。", true);
    }
  }

  function reset() {
    initializedUid = null;
    histories = [];
    residencePrefecture = "";
    for (const url of imageUrls) URL.revokeObjectURL(url);
    imageUrls.clear();
  }

  for (const prefecture of PREFECTURES) {
    const option = document.createElement("option");
    option.value = prefecture;
    option.textContent = prefecture;
    element("prefecture-select").append(option);
  }

  element("prefecture-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    const value = element("prefecture-select").value;
    if (!value) return setStatus("都道府県を選択してください。", true);
    button.disabled = true;
    setStatus("保存しています…");
    try {
      const data = await request("/api/account/profile", {
        method: "PUT",
        body: JSON.stringify({ residencePrefecture: value })
      });
      residencePrefecture = data.profile.residencePrefecture;
      renderClinics();
      setStatus(`${residencePrefecture}を保存しました。`);
    } catch (error) {
      setStatus(error.message || "都道府県を保存できませんでした。", true);
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener("app-authorized", initialize);
  window.addEventListener("app-locked", reset);
  window.addEventListener("beforeunload", reset);
  if (window.AppAuth?.uid) initialize();
})();
