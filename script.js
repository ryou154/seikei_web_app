const faceImageInput = document.getElementById("face-image");
const imagePreview = document.getElementById("image-preview");
const startCameraButton = document.getElementById("start-camera-button");
const captureButton = document.getElementById("capture-button");
const stopCameraButton = document.getElementById("stop-camera-button");
const cameraScreen = document.getElementById("camera-screen");
const cameraPreview = document.getElementById("camera-preview");
const captureCanvas = document.getElementById("capture-canvas");
const cameraMessage = document.getElementById("camera-message");
const cameraFlipFixInput = document.getElementById("camera-flip-fix");
const requestTextInput = document.getElementById("request-text");
const styleSelect = document.getElementById("style-select");
const styleCustomInput = document.getElementById("style-custom");
const eyeSelect = document.getElementById("eye-select");
const eyeCustomInput = document.getElementById("eye-custom");
const noseSelect = document.getElementById("nose-select");
const noseCustomInput = document.getElementById("nose-custom");
const faceSelect = document.getElementById("face-select");
const faceCustomInput = document.getElementById("face-custom");
const mouthSelect = document.getElementById("mouth-select");
const mouthCustomInput = document.getElementById("mouth-custom");
const foreheadSelect = document.getElementById("forehead-select");
const foreheadCustomInput = document.getElementById("forehead-custom");
const changeStrengthInput = document.getElementById("change-strength");
const changeStrengthValue = document.getElementById("change-strength-value");
const imageEngineInput = document.getElementById("image-engine");
const regionInput = document.getElementById("region-input");
const budgetInput = document.getElementById("budget-select");
const downtimeInput = document.getElementById("downtime-select");
const clinicPriorityInput = document.getElementById("clinic-priority");
const priorityInput = document.getElementById("priority");
const simulateButton = document.getElementById("simulate-button");
const saveButton = document.getElementById("save-button");
const clearHistoryButton = document.getElementById("clear-history-button");
const emptyResult = document.getElementById("empty-result");
const resultContent = document.getElementById("result-content");
const beforeImage = document.getElementById("before-image");
const afterImage = document.getElementById("after-image");
const scanPanel = document.getElementById("scan-panel");
const scanSteps = document.getElementById("scan-steps");
const analysisText = document.getElementById("analysis-text");
const hospitalList = document.getElementById("hospital-list");
const historyList = document.getElementById("history-list");

let selectedImageData = "";
let latestResult = null;
let cameraStream = null;

changeStrengthInput.addEventListener("input", updateStrengthValue);
updateStrengthValue();
syncCameraPreviewFlip();
cameraFlipFixInput?.addEventListener("change", syncCameraPreviewFlip);

function syncCameraPreviewFlip() {
  cameraPreview.classList.toggle("is-flipped", Boolean(cameraFlipFixInput?.checked));
}
function updateStrengthValue() {
  changeStrengthValue.textContent = `${changeStrengthInput.value}%`;
}

const hospitals = window.CLINIC_DATA || [];
const optionLabels = {
  style: {
    none: "雰囲気は変更しない",
    kawaii: "かわいい系",
    cool: "クール系",
    korean: "韓国アイドル風",
    doll: "ドール系",
    natural: "ナチュラル美人"
  },
  eye: {
    none: "目元は変更しない",
    wide: "ぱっちり二重",
    cat: "切れ長・猫目",
    soft: "やさしいたれ目",
    natural: "自然な目元"
  },
  nose: {
    none: "鼻は変更しない",
    high: "鼻筋を高く",
    small: "小鼻を小さく",
    sharp: "鼻先をシャープに",
    natural: "自然な鼻"
  },
  face: {
    none: "輪郭は変更しない",
    vline: "Vライン小顔",
    oval: "卵型フェイス",
    sharp: "シャープな輪郭",
    natural: "自然な輪郭"
  },
  mouth: {
    none: "口元は変更しない",
    full: "ふっくらした唇",
    small: "小さめの口元",
    smile: "口角を上げる",
    natural: "自然な口元"
  },
  forehead: {
    none: "おでこは変更しない",
    round: "丸みのあるおでこ",
    smooth: "なめらかなおでこ",
    balanced: "顔全体と自然に調整",
    natural: "自然なおでこ"
  }
};

const priorityLabels = {
  natural: "自然さを重視",
  balance: "顔全体のバランスを重視",
  visible: "変化を分かりやすく",
  parts: "希望パーツを強く反映"
};

faceImageInput.addEventListener("change", () => {
  const file = faceImageInput.files[0];

  if (!file) {
    selectedImageData = "";
    imagePreview.innerHTML = "<span>画像を選択するとプレビューが表示されます</span>";
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    setSelectedImage(reader.result);
  });
  reader.readAsDataURL(file);
});
startCameraButton.addEventListener("click", async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    cameraMessage.textContent = "このブラウザではカメラを使用できません。";
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 960 },
        height: { ideal: 720 }
      },
      audio: false
    });
    cameraPreview.srcObject = cameraStream;
    syncCameraPreviewFlip();
    cameraScreen.classList.remove("hidden");
    document.body.classList.add("camera-open");
    captureButton.disabled = false;
    stopCameraButton.disabled = false;
    startCameraButton.disabled = true;
    cameraMessage.textContent = "専用画面で写真を撮影してください。";
  } catch (error) {
    cameraMessage.textContent = "カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。";
  }
});

captureButton.addEventListener("click", () => {
  if (!cameraStream) {
    return;
  }

  const videoWidth = cameraPreview.videoWidth;
  const videoHeight = cameraPreview.videoHeight;

  if (!videoWidth || !videoHeight) {
    cameraMessage.textContent = "カメラ映像の準備中です。少し待ってからもう一度撮影してください。";
    return;
  }

  const maxCaptureSize = 720;
  const captureScale = Math.min(1, maxCaptureSize / Math.max(videoWidth, videoHeight));
  const captureWidth = Math.max(1, Math.round(videoWidth * captureScale));
  const captureHeight = Math.max(1, Math.round(videoHeight * captureScale));

  captureCanvas.width = captureWidth;
  captureCanvas.height = captureHeight;
  const context = captureCanvas.getContext("2d");

  if (cameraFlipFixInput?.checked) {
    context.translate(captureWidth, 0);
    context.scale(-1, 1);
  }

  context.drawImage(cameraPreview, 0, 0, captureWidth, captureHeight);
  context.setTransform(1, 0, 0, 1, 0, 0);
  setSelectedImage(captureCanvas.toDataURL("image/jpeg", 0.82));
  const capturedMessage = cameraFlipFixInput?.checked
    ? "左右反転を補正して、撮影した写真を顔画像として登録しました。"
    : "撮影した写真を顔画像として登録しました。";
  stopCamera(capturedMessage);
});

stopCameraButton.addEventListener("click", () => stopCamera());

simulateButton.addEventListener("click", async () => {
  const requestText = requestTextInput.value.trim();

  if (!selectedImageData) {
    alert("顔画像を選択してください。");
    return;
  }

  latestResult = createSimulationResult(requestText);
  await renderResult(latestResult);
});

saveButton.addEventListener("click", () => {
  if (!latestResult) {
    return;
  }

  const histories = getHistories();
  histories.unshift({
    ...latestResult,
    savedAt: new Date().toLocaleString("ja-JP")
  });
  localStorage.setItem("seikeiHistories", JSON.stringify(histories.slice(0, 5)));
  renderHistories();
});

clearHistoryButton.addEventListener("click", () => {
  localStorage.removeItem("seikeiHistories");
  renderHistories();
});

window.addEventListener("beforeunload", () => stopCamera());

function setSelectedImage(imageData) {
  selectedImageData = imageData;
  imagePreview.innerHTML = `<img src="${selectedImageData}" alt="選択した顔画像">`;
}

function stopCamera(message = "カメラを停止しました。") {
  if (!cameraStream) {
    cameraScreen?.classList.add("hidden");
    document.body.classList.remove("camera-open");
    return;
  }

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraScreen?.classList.add("hidden");
  document.body.classList.remove("camera-open");
  captureButton.disabled = true;
  stopCameraButton.disabled = true;
  startCameraButton.disabled = false;
  cameraMessage.textContent = message;
}

function createSimulationResult(requestText) {
  const profile = {
    style: styleSelect.value,
    eye: eyeSelect.value,
    nose: noseSelect.value,
    face: faceSelect.value,
    mouth: mouthSelect.value,
    forehead: foreheadSelect.value,
    custom: {
      style: styleCustomInput.value.trim(),
      eye: eyeCustomInput.value.trim(),
      nose: noseCustomInput.value.trim(),
      face: faceCustomInput.value.trim(),
      mouth: mouthCustomInput.value.trim(),
      forehead: foreheadCustomInput.value.trim()
    },
    strength: Number(changeStrengthInput.value),
    imageEngine: imageEngineInput.value,
    region: regionInput.value.trim(),
    budget: budgetInput.value,
    downtime: downtimeInput.value,
    clinicPriority: clinicPriorityInput.value,
    priority: priorityInput.value
  };
  const designLabels = createDesignLabels(profile);
  const keywords = buildKeywords(requestText, profile, designLabels);
  const analysis = createAnalysisText(requestText, profile, designLabels);
  const regionalHospitals = filterHospitalsByRegion(hospitals, profile.region);
  const matchedHospitals = regionalHospitals
    .map((hospital) => ({
      ...hospital,
      score: getHospitalScore(hospital, keywords, profile),
      matchReasons: getHospitalMatchReasons(hospital, keywords, profile),
      tags: [...hospital.tags, "公式情報"]
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    requestText,
    profile,
    designLabels,
    category: designLabels.style,
    analysis,
    hospitals: matchedHospitals
  };
}

function createDesignLabels(profile) {
  return {
    style: getDesignLabel(profile, "style"),
    eye: getDesignLabel(profile, "eye"),
    nose: getDesignLabel(profile, "nose"),
    face: getDesignLabel(profile, "face"),
    mouth: getDesignLabel(profile, "mouth"),
    forehead: getDesignLabel(profile, "forehead")
  };
}

function getDesignLabel(profile, key) {
  return profile.custom?.[key] || optionLabels[key]?.[profile[key]] || "変更しない";
}

function filterHospitalsByRegion(items, region) {
  const normalizedRegion = normalizeText(region);
  if (!normalizedRegion) return items;

  return items.filter((hospital) => hospital.regions.some((item) => {
    const normalizedItem = normalizeText(item);
    return normalizedItem.includes(normalizedRegion) || normalizedRegion.includes(normalizedItem);
  }));
}

function matchesRequestedKeyword(label, keywords) {
  const normalizedLabel = normalizeText(label);
  const normalizedKeywords = normalizeText(keywords);
  if (normalizedKeywords.includes(normalizedLabel) || normalizedLabel.includes(normalizedKeywords)) return true;

  const featureWords = ["二重", "目元", "クマ", "鼻", "口", "唇", "輪郭", "小顔", "若返り", "脂肪吸引", "豊胸", "ハイフ", "リフト"];
  return featureWords.some((word) => normalizedLabel.includes(word) && normalizedKeywords.includes(word));
}
function getHospitalScore(hospital, keywords, profile) {
  const normalizedKeywords = normalizeText(keywords);
  const normalizedClinicText = normalizeText([
    ...(hospital.strengths || []),
    ...(hospital.tags || []),
    ...(hospital.doctor?.specialties || []),
    ...(hospital.doctor?.qualifications || []),
    hospital.description
  ].join(" "));
  const clinicPriorityKeywords = {
    cost: ["料金", "費用"],
    downtime: ["ダウンタイム", "短期"]
  };
  let score = 0;

  score += hospital.strengths.filter((strength) => matchesRequestedKeyword(strength, keywords)).length * 3;
  score += (hospital.doctor?.specialties || [])
    .filter((specialty) => matchesRequestedKeyword(specialty, keywords))
    .length * 4;
  const clinicKeywords = clinicPriorityKeywords[profile.clinicPriority] || [];
  score += clinicKeywords.filter((keyword) => normalizedClinicText.includes(normalizeText(keyword))).length * 2;
  if (hospital.priceUrl && profile.clinicPriority === "cost") score += 2;
  return score;
}
function getHospitalMatchReasons(hospital, keywords, profile) {
  const normalizedKeywords = normalizeText(keywords);
  const matchedStrengths = [...new Set((hospital.strengths || []).filter((strength) =>
    matchesRequestedKeyword(strength, keywords)
  ))].slice(0, 3);
  const reasons = [];
  const matchedDoctorSpecialties = (hospital.doctor?.specialties || []).filter((specialty) =>
    matchesRequestedKeyword(specialty, keywords)
  );

  if (matchedStrengths.length) reasons.push(`希望部位：${matchedStrengths.join("・")}`);
  if (matchedDoctorSpecialties.length) {
    reasons.push(`担当医の得意分野：${matchedDoctorSpecialties.slice(0, 2).join("・")}`);
  }
  reasons.push(`地域：${hospital.area}`);
  if (profile.clinicPriority === "cost") reasons.push("公式料金表を確認可能");
  if (profile.clinicPriority === "downtime") reasons.push("ダウンタイムは施術ごとに公式ページで要確認");
  if (!matchedStrengths.length) reasons.push("公式掲載メニューから候補化");
  return reasons;
}
function createClinicSummary(profile) {
  const budgetLabels = { any: "予算指定なし", under20: "予算：20万円未満", "20to40": "予算：20〜40万円", over40: "予算：40万円以上" };
  const downtimeLabels = { any: "ダウンタイム指定なし", short: "ダウンタイム：短め", standard: "ダウンタイム：標準", flexible: "ダウンタイム：期間は問わない" };
  const area = profile.region ? "地域：" + profile.region : "地域：全国から相性を優先";
  return area + " / " + budgetLabels[profile.budget] + " / " + downtimeLabels[profile.downtime];
}
function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}
function buildKeywords(requestText, profile, designLabels = createDesignLabels(profile)) {
  return [
    requestText,
    designLabels.style,
    designLabels.eye,
    designLabels.nose,
    designLabels.face,
    designLabels.mouth,
    designLabels.forehead
  ].join(" ");
}

function createAnalysisText(requestText, profile, designLabels = createDesignLabels(profile)) {
  const priorityText = {
    natural: "自然さを少し残しながら、指定されたパーツの変化が分かるように調整しています。",
    balance: "顔全体のバランスを見ながら、パーツ単体ではなく全体の印象が整うようにしています。",
    visible: "Beforeとの差が分かりやすいように、変化量をやや強めに反映しています。",
    parts: "指定されたパーツの希望を優先して、目・鼻・輪郭・口・おでこの変化が伝わるようにしています。"
  };
  const clinicPriorityText = {
    match: "希望内容との相性",
    cost: "費用を抑えやすい相談",
    downtime: "ダウンタイムを短くしやすい相談"
  };
  const requestPart = requestText ? `入力内容「${requestText}」も全体コメントとして反映しました。` : "選択した理想イメージを中心に作成しました。";
  const clinicFocus = clinicPriorityText[profile.clinicPriority] || clinicPriorityText.match;
  const regionPart = profile.region ? `おすすめクリニックは「${profile.region}」周辺と「${clinicFocus}」を優先して選んでいます。` : `おすすめクリニックは「${clinicFocus}」を優先して選んでいます。`;
  const parts = [
    `雰囲気：${designLabels.style}`,
    `目元：${designLabels.eye}`,
    `鼻：${designLabels.nose}`,
    `輪郭：${designLabels.face}`,
    `口：${designLabels.mouth}`,
    `おでこ：${designLabels.forehead}`
  ].join("、");

  return `${requestPart} ${parts}をもとにしたAfter予測です。${regionPart}${priorityText[profile.priority]} ※この結果は学習用の参考表示であり、医療診断ではありません。`;
}

async function renderResult(result) {
  emptyResult.classList.add("hidden");
  resultContent.classList.remove("hidden");
  saveButton.disabled = false;

  beforeImage.innerHTML = `<img src="${selectedImageData}" alt="シミュレーション前の画像">`;
  afterImage.innerHTML = `<div class="loading-state">After画像を生成しています...</div>`;
  analysisText.textContent = result.analysis;
  await runScanAnimation(result.profile);

  try {
    const generatedImage = result.profile.imageEngine === "gemini"
      ? await createGeminiAfterImage(result)
      : createAfterImage(result.profile);
    afterImage.innerHTML = `<img src="${generatedImage}" alt="シミュレーション後の予測イメージ">`;
  } catch (error) {
    console.error(error);
    const localImage = createAfterImage(result.profile);
    afterImage.innerHTML = `
      <div class="gemini-error">
        <strong>Gemini生成に失敗しました。</strong>
        <span>${error.message}</span>
        <small>下には確認用としてローカル簡易生成の画像を表示しています。</small>
      </div>
      <img src="${localImage}" alt="ローカル簡易生成の予測イメージ">
    `;
  }

  hospitalList.innerHTML = result.hospitals.length
    ? result.hospitals.map((hospital) => `
      <article class="hospital-card">
        <h4>${hospital.name}</h4>
        <p class="hospital-match"><strong>一致理由</strong> ${hospital.matchReasons.join(" / ")}</p>
        <div class="tags">
          ${hospital.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
        </div>
        <p class="hospital-detail"><strong>所在地</strong>${hospital.address}</p>
        <p class="hospital-detail"><strong>診療時間</strong>${hospital.hours}</p>
        <div class="doctor-info">
          <p class="doctor-heading">医師候補（指名可否を要確認）</p>
          <p><strong>${hospital.doctor.name}</strong> <span>${hospital.doctor.title}</span></p>
          <p><b>得意分野</b>${hospital.doctor.specialties.length ? hospital.doctor.specialties.join("・") : "公式プロフィール参照"}</p>
          <p><b>資格</b>${hospital.doctor.qualifications.length ? hospital.doctor.qualifications.join("・") : "公式プロフィールで個別確認"}</p>
          <a href="${hospital.doctor.sourceUrl}" target="_blank" rel="noopener noreferrer">医師の公式情報</a>
        </div>
        <div class="case-info">
          <p class="doctor-heading">公式症例・施術件数</p>
          <p>${hospital.cases.summary}</p>
          <p class="case-meta">${hospital.cases.scope} / ${hospital.cases.period}</p>
          <a href="${hospital.cases.sourceUrl}" target="_blank" rel="noopener noreferrer">公式症例を確認</a>
        </div>
        <p class="small">${hospital.description}</p>
        <div class="hospital-links">
          <a href="${hospital.sourceUrl}" target="_blank" rel="noopener noreferrer">公式院ページ</a>
          <a href="${hospital.priceUrl}" target="_blank" rel="noopener noreferrer">公式料金表</a>
        </div>
        <p class="verified-date">公式情報の確認日：${hospital.verifiedAt}</p>
      </article>
    `).join("")
    : `<div class="clinic-empty">入力した地域に登録済みのクリニックがありません。現在は東京・大阪・神奈川・愛知・福岡・北海道・宮城の公式情報に対応しています。</div>`;
  document.getElementById("clinic-summary").textContent = createClinicSummary(result.profile);
}

function runScanAnimation(profile) {
  if (!scanPanel || !scanSteps) {
    return Promise.resolve();
  }

  const designLabels = createDesignLabels(profile);
  const partLabels = [
    { key: "eye", label: designLabels.eye, suffix: "を解析" },
    { key: "nose", label: designLabels.nose, suffix: "を反映" },
    { key: "face", label: designLabels.face, suffix: "を調整" },
    { key: "mouth", label: designLabels.mouth, suffix: "を反映" },
    { key: "forehead", label: designLabels.forehead, suffix: "を確認" }
  ];
  const labels = ["顔位置を確認中"];

  partLabels.forEach((part) => {
    if (profile[part.key] !== "none" || profile.custom?.[part.key]) {
      labels.push(part.label + part.suffix);
    }
  });

  labels.push("生成方針：" + (priorityLabels[profile.priority] || "自然さを重視"));
  labels.push("変化強度 " + profile.strength + "% でAfter設計");
  scanSteps.innerHTML = labels.map((label, index) => '<span class="' + (index === 0 ? 'active' : '') + '">' + label + '</span>').join("");
  scanPanel.classList.add("is-scanning");

  return new Promise((resolve) => {
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      const items = scanSteps.querySelectorAll("span");
      items.forEach((item, itemIndex) => {
        item.classList.toggle("active", itemIndex === Math.min(index, items.length - 1));
        item.classList.toggle("done", itemIndex < index);
      });

      if (index >= items.length) {
        clearInterval(timer);
        scanPanel.classList.remove("is-scanning");
        resolve();
      }
    }, 360);
  });
}
async function createGeminiAfterImage(result) {
  if (location.protocol === "file:") {
    throw new Error("Gemini生成はローカルサーバー起動時のみ使えます。");
  }

  const response = await fetch("/api/gemini-edit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      image: await resizeImageForGemini(selectedImageData),
      requestText: result.requestText,
      profile: result.profile,
      labels: result.designLabels
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Gemini生成に失敗しました。");
  }

  return data.image;
}


function resizeImageForGemini(imageData) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.addEventListener("load", () => {
      const isMobile = window.matchMedia("(max-width: 700px)").matches || /iPhone|iPad|Android/i.test(navigator.userAgent);
      const isStrongChange = Number(changeStrengthInput.value) >= 60;
      const maxSize = isMobile ? 320 : isStrongChange ? 512 : 640;
      const jpegQuality = isMobile ? 0.56 : 0.68;
      const sourceWidth = image.naturalWidth;
      const sourceHeight = image.naturalHeight;
      const sourceMin = Math.min(sourceWidth, sourceHeight);
      const zoomRatio = isStrongChange ? 0.68 : 0.78;
      const cropSize = Math.max(1, Math.round(sourceMin * zoomRatio));
      const centerX = sourceWidth * 0.5;
      const centerY = sourceHeight > sourceWidth ? sourceHeight * 0.42 : sourceHeight * 0.46;
      const sourceX = clamp(centerX - cropSize / 2, 0, sourceWidth - cropSize);
      const sourceY = clamp(centerY - cropSize / 2, 0, sourceHeight - cropSize);
      const outputSize = Math.min(maxSize, cropSize);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = outputSize;
      canvas.height = outputSize;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, cropSize, cropSize, 0, 0, outputSize, outputSize);
      resolve(canvas.toDataURL("image/jpeg", jpegQuality));
    });

    image.addEventListener("error", () => reject(new Error("画像の軽量化に失敗しました。iPhoneの場合は、写真設定を『互換性優先』にするか、カメラで撮影して試してください。")));
    image.src = imageData;
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function createAfterImage(profile) {
  const sourceImage = imagePreview.querySelector("img");
  const width = 720;
  const height = 720;
  const baseCanvas = createCroppedCanvas(sourceImage, width, height);
  const warpedCanvas = warpFaceImage(baseCanvas, profile);
  const finalCanvas = applyBeautyFinish(warpedCanvas, profile);

  return finalCanvas.toDataURL("image/png");
}

function createCroppedCanvas(sourceImage, width, height) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const sourceRatio = sourceImage.naturalWidth / sourceImage.naturalHeight;
  const canvasRatio = width / height;
  let drawWidth = width;
  let drawHeight = height;
  let drawX = 0;
  let drawY = 0;

  canvas.width = width;
  canvas.height = height;

  if (sourceRatio > canvasRatio) {
    drawHeight = height;
    drawWidth = height * sourceRatio;
    drawX = (width - drawWidth) / 2;
  } else {
    drawWidth = width;
    drawHeight = width / sourceRatio;
    drawY = (height - drawHeight) / 2;
  }

  context.fillStyle = "#fff7f9";
  context.fillRect(0, 0, width, height);
  context.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

  return canvas;
}

function warpFaceImage(sourceCanvas, profile) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceContext = sourceCanvas.getContext("2d");
  const sourceData = sourceContext.getImageData(0, 0, width, height);
  const outputCanvas = document.createElement("canvas");
  const outputContext = outputCanvas.getContext("2d");
  const outputData = outputContext.createImageData(width, height);
  const strength = profile.strength / 100;
  const faceCenterX = width * 0.5;
  const eyeY = height * 0.38;
  const noseY = height * 0.5;
  const jawY = height * 0.65;
  const chinY = height * 0.78;

  outputCanvas.width = width;
  outputCanvas.height = height;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sampleX = x;
      let sampleY = y;
      const side = x < faceCenterX ? -1 : 1;
      const jawPower = getEllipsePower(x, y, faceCenterX, jawY, width * 0.39, height * 0.31);
      const cheekPower = getEllipsePower(x, y, faceCenterX, height * 0.55, width * 0.36, height * 0.24);
      const nosePower = getEllipsePower(x, y, faceCenterX, noseY, width * 0.18, height * 0.24);
      const chinPower = getEllipsePower(x, y, faceCenterX, chinY, width * 0.24, height * 0.15);
      const leftEyePower = getEllipsePower(x, y, width * 0.38, eyeY, width * 0.13, height * 0.08);
      const rightEyePower = getEllipsePower(x, y, width * 0.62, eyeY, width * 0.13, height * 0.08);
      const eyePower = leftEyePower + rightEyePower;

      const jawAmount = getFaceAmount(profile.face) * strength;
      const eyeAmount = getEyeAmount(profile.eye) * strength;
      const noseAmount = getNoseAmount(profile.nose) * strength;
      const styleAmount = getStyleAmount(profile.style) * strength;

      sampleX = faceCenterX + (sampleX - faceCenterX) / (1 - (jawPower + cheekPower * 0.7) * jawAmount);
      sampleY = chinY + (sampleY - chinY) / (1 + chinPower * jawAmount * 0.22);

      if (profile.eye === "cat" && eyePower > 0) {
        sampleX -= side * eyePower * 18 * strength;
        sampleY += side * eyePower * 8 * strength;
      } else if (profile.eye === "soft" && eyePower > 0) {
        sampleY -= eyePower * 12 * strength;
      } else {
        sampleY = eyeY + (sampleY - eyeY) / (1 + eyePower * eyeAmount);
      }

      sampleX = faceCenterX + (sampleX - faceCenterX) / (1 - nosePower * noseAmount);

      if (profile.style === "doll" || profile.style === "kawaii") {
        sampleY = eyeY + (sampleY - eyeY) / (1 + eyePower * styleAmount);
        sampleX = faceCenterX + (sampleX - faceCenterX) / (1 - jawPower * styleAmount * 0.4);
      }

      if (profile.style === "cool") {
        sampleX = faceCenterX + (sampleX - faceCenterX) / (1 - cheekPower * styleAmount * 0.5);
      }

      copyPixel(sourceData, outputData, sampleX, sampleY, x, y, width, height);
    }
  }

  outputContext.putImageData(outputData, 0, 0);
  return outputCanvas;
}

function applyBeautyFinish(sourceCanvas, profile) {
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;

  context.filter = getStyleFilter(profile.style);
  context.drawImage(sourceCanvas, 0, 0);
  context.filter = "none";

  context.globalAlpha = 0.08 + profile.strength * 0.02;
  context.filter = "blur(5px)";
  context.drawImage(sourceCanvas, 0, 0);
  context.filter = "none";
  context.globalAlpha = 1;

  drawMakeup(context, profile, width, height);
  drawBadge(context, optionLabels.style[profile.style], width - 145, height - 42);

  return canvas;
}

function getFaceAmount(faceType) {
  const amounts = {
    none: 0,
    vline: 0.13,
    oval: 0.09,
    sharp: 0.11,
    natural: 0.06
  };
  return amounts[faceType] ?? 0;
}

function getEyeAmount(eyeType) {
  const amounts = {
    none: 0,
    wide: 0.13,
    cat: 0.09,
    soft: 0.08,
    natural: 0.05
  };
  return amounts[eyeType] ?? 0;
}

function getNoseAmount(noseType) {
  const amounts = {
    none: 0,
    high: 0.08,
    small: 0.1,
    sharp: 0.11,
    natural: 0.04
  };
  return amounts[noseType] ?? 0;
}

function getStyleAmount(styleType) {
  const amounts = {
    none: 0,
    kawaii: 0.08,
    cool: 0.07,
    korean: 0.08,
    doll: 0.1,
    natural: 0.05
  };
  return amounts[styleType] ?? 0;
}

function getStyleFilter(styleType) {
  const filters = {
    none: "brightness(1.04) contrast(1.01) saturate(1.01)",
    kawaii: "brightness(1.08) contrast(1.02) saturate(1.05)",
    cool: "brightness(1.04) contrast(1.06) saturate(0.98)",
    korean: "brightness(1.09) contrast(1.02) saturate(1.02)",
    doll: "brightness(1.1) contrast(1.03) saturate(1.06)",
    natural: "brightness(1.06) contrast(1.02) saturate(1.03)"
  };
  return filters[styleType];
}

function drawMakeup(context, profile, width, height) {
  const strength = profile.strength / 100;
  const eyeY = height * 0.38;

  context.save();
  context.globalCompositeOperation = "source-over";

  drawEyeMakeup(context, width * 0.38, eyeY, profile, strength);
  drawEyeMakeup(context, width * 0.62, eyeY, profile, strength);
  drawNoseHighlight(context, profile, width, height, strength);
  drawLipTint(context, profile, width, height, strength);
  drawContourShadow(context, profile, width, height, strength);

  context.restore();
}

function drawEyeMakeup(context, x, y, profile, strength) {
  const eyeWidth = profile.eye === "cat" ? 58 : 50;
  const eyeHeight = profile.eye === "wide" || profile.style === "doll" ? 15 : 11;

  context.globalAlpha = 0.035 + strength * 0.035;
  context.fillStyle = profile.style === "cool" ? "#2b2630" : "#8a3c55";
  context.beginPath();
  context.ellipse(x, y, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.12 + strength * 0.08;
  context.strokeStyle = profile.style === "cool" ? "#19171d" : "#4a2430";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(x - eyeWidth * 0.58, y + 2);
  context.quadraticCurveTo(x, y - eyeHeight * 0.7, x + eyeWidth * 0.58, y + 1);
  context.stroke();
}

function drawNoseHighlight(context, profile, width, height, strength) {
  const centerX = width * 0.5;
  const startY = height * 0.39;
  const endY = height * 0.62;

  context.globalAlpha = 0.08 + strength * 0.08;
  context.strokeStyle = "rgba(255,255,255,0.95)";
  context.lineWidth = profile.nose === "high" ? 8 : 5;
  context.beginPath();
  context.moveTo(centerX, startY);
  context.quadraticCurveTo(centerX + 10, height * 0.5, centerX, endY);
  context.stroke();

  context.globalAlpha = 0.035 + strength * 0.04;
  context.strokeStyle = "rgba(90,55,45,0.55)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(centerX - 36, height * 0.43);
  context.lineTo(centerX - 20, height * 0.6);
  context.moveTo(centerX + 36, height * 0.43);
  context.lineTo(centerX + 20, height * 0.6);
  context.stroke();
}

function drawLipTint(context, profile, width, height, strength) {
  const color = profile.style === "cool" ? "#9f3a46" : "#d94c67";

  context.globalAlpha = 0.04 + strength * 0.05;
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(width * 0.5, height * 0.68, width * 0.075, height * 0.018, 0, 0, Math.PI * 2);
  context.fill();
}

function drawContourShadow(context, profile, width, height, strength) {
  context.globalAlpha = 0.035 + strength * 0.035;
  context.strokeStyle = "rgba(75,45,50,0.55)";
  context.lineWidth = 7;
  context.beginPath();
  context.moveTo(width * 0.29, height * 0.55);
  context.quadraticCurveTo(width * 0.34, height * 0.72, width * 0.46, height * 0.8);
  context.moveTo(width * 0.71, height * 0.55);
  context.quadraticCurveTo(width * 0.66, height * 0.72, width * 0.54, height * 0.8);
  context.stroke();
}

function getEllipsePower(x, y, centerX, centerY, radiusX, radiusY) {
  const dx = (x - centerX) / radiusX;
  const dy = (y - centerY) / radiusY;
  const distance = dx * dx + dy * dy;

  if (distance >= 1) {
    return 0;
  }

  return (1 - distance) * (1 - distance);
}

function copyPixel(sourceData, outputData, sourceX, sourceY, targetX, targetY, width, height) {
  const safeX = Math.max(0, Math.min(width - 1, Math.round(sourceX)));
  const safeY = Math.max(0, Math.min(height - 1, Math.round(sourceY)));
  const sourceIndex = (safeY * width + safeX) * 4;
  const targetIndex = (targetY * width + targetX) * 4;

  outputData.data[targetIndex] = sourceData.data[sourceIndex];
  outputData.data[targetIndex + 1] = sourceData.data[sourceIndex + 1];
  outputData.data[targetIndex + 2] = sourceData.data[sourceIndex + 2];
  outputData.data[targetIndex + 3] = sourceData.data[sourceIndex + 3];
}

function drawBadge(context, text, x, y) {
  context.save();
  context.font = "bold 19px sans-serif";
  context.textAlign = "center";
  context.fillStyle = "rgba(255, 255, 255, 0.86)";
  roundRectPath(context, x - 82, y - 22, 164, 44, 22);
  context.fill();
  context.fillStyle = "#b93f56";
  context.fillText(text, x, y + 7);
  context.restore();
}

function roundRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function getHistories() {
  return JSON.parse(localStorage.getItem("seikeiHistories") || "[]");
}

function renderHistories() {
  const histories = getHistories();

  if (histories.length === 0) {
    historyList.innerHTML = `<p class="small">まだ保存された履歴はありません。</p>`;
    return;
  }

  historyList.innerHTML = histories.map((history) => `
    <article class="history-card">
      <h4>${history.category}のシミュレーション</h4>
      <p class="small">${history.savedAt}</p>
      <p>${history.requestText || "選択式の理想イメージで作成"}</p>
    </article>
  `).join("");
}

renderHistories();
