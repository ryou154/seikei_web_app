const faceImageInput = document.getElementById("face-image");
const imagePreview = document.getElementById("image-preview");
const startCameraButton = document.getElementById("start-camera-button");
const captureButton = document.getElementById("capture-button");
const stopCameraButton = document.getElementById("stop-camera-button");
const cameraPreview = document.getElementById("camera-preview");
const captureCanvas = document.getElementById("capture-canvas");
const cameraMessage = document.getElementById("camera-message");
const requestTextInput = document.getElementById("request-text");
const styleSelect = document.getElementById("style-select");
const eyeSelect = document.getElementById("eye-select");
const noseSelect = document.getElementById("nose-select");
const faceSelect = document.getElementById("face-select");
const changeStrengthInput = document.getElementById("change-strength");
const changeStrengthValue = document.getElementById("change-strength-value");
const imageEngineInput = document.getElementById("image-engine");
const regionInput = document.getElementById("region-input");
const priorityInput = document.getElementById("priority");
const simulateButton = document.getElementById("simulate-button");
const saveButton = document.getElementById("save-button");
const clearHistoryButton = document.getElementById("clear-history-button");
const emptyResult = document.getElementById("empty-result");
const resultContent = document.getElementById("result-content");
const beforeImage = document.getElementById("before-image");
const afterImage = document.getElementById("after-image");
const analysisText = document.getElementById("analysis-text");
const hospitalList = document.getElementById("hospital-list");
const historyList = document.getElementById("history-list");

let selectedImageData = "";
let latestResult = null;
let cameraStream = null;

changeStrengthInput.addEventListener("input", updateStrengthValue);
updateStrengthValue();

function updateStrengthValue() {
  changeStrengthValue.textContent = `${changeStrengthInput.value}%`;
}

const hospitals = [
  {
    name: "東京フェイスデザインクリニック",
    area: "東京・新宿",
    regions: ["東京", "新宿", "関東"],
    strengths: ["二重", "目元", "かわいい", "韓国", "ドール"],
    tags: ["二重デザイン", "目元カウンセリング", "韓国風"],
    description: "目元の印象を大きく変えるデザイン提案が得意なクリニックです。"
  },
  {
    name: "渋谷ナチュラル美容クリニック",
    area: "東京・渋谷",
    regions: ["東京", "渋谷", "関東"],
    strengths: ["自然", "バランス", "鼻", "輪郭"],
    tags: ["自然な変化", "全体バランス", "初回相談"],
    description: "自然さを残しながら顔全体の印象を整える提案に向いています。"
  },
  {
    name: "ミライ輪郭美容外科",
    area: "神奈川・横浜",
    regions: ["神奈川", "横浜", "関東"],
    strengths: ["輪郭", "エラ", "小顔", "Vライン", "シャープ"],
    tags: ["輪郭形成", "小顔相談", "Vライン"],
    description: "フェイスラインやVライン小顔のシミュレーションに向いています。"
  },
  {
    name: "大阪ビューティーバランス院",
    area: "大阪・梅田",
    regions: ["大阪", "梅田", "関西"],
    strengths: ["鼻", "鼻筋", "バランス", "クール"],
    tags: ["鼻筋デザイン", "顔全体のバランス", "関西エリア"],
    description: "鼻筋や鼻先を含めた顔全体のバランス調整を提案します。"
  },
  {
    name: "名古屋フェイスラインクリニック",
    area: "愛知・名古屋",
    regions: ["愛知", "名古屋", "東海"],
    strengths: ["輪郭", "小顔", "自然", "卵型"],
    tags: ["輪郭相談", "卵型フェイス", "自然な小顔"],
    description: "輪郭を整えつつ、やりすぎない小顔イメージを提案します。"
  },
  {
    name: "福岡アイドルフェイス美容外科",
    area: "福岡・天神",
    regions: ["福岡", "天神", "九州"],
    strengths: ["韓国", "かわいい", "二重", "鼻"],
    tags: ["韓国アイドル風", "ぱっちり二重", "鼻先相談"],
    description: "華やかで写真映えする雰囲気のシミュレーションに向いています。"
  }
];
const optionLabels = {
  style: {
    kawaii: "かわいい系",
    cool: "クール系",
    korean: "韓国アイドル風",
    doll: "ドール系",
    natural: "ナチュラル美人"
  },
  eye: {
    wide: "ぱっちり二重",
    cat: "切れ長・猫目",
    soft: "やさしいたれ目",
    natural: "自然な目元"
  },
  nose: {
    high: "鼻筋を高く",
    small: "小鼻を小さく",
    sharp: "鼻先をシャープに",
    natural: "自然な鼻"
  },
  face: {
    vline: "Vライン小顔",
    oval: "卵型フェイス",
    sharp: "シャープな輪郭",
    natural: "自然な輪郭"
  }
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
    cameraPreview.classList.remove("hidden");
    captureButton.disabled = false;
    stopCameraButton.disabled = false;
    startCameraButton.disabled = true;
    cameraMessage.textContent = "顔が中央に入るようにして「写真を撮る」を押してください。";
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

  captureCanvas.width = videoWidth;
  captureCanvas.height = videoHeight;
  const context = captureCanvas.getContext("2d");
  context.drawImage(cameraPreview, 0, 0, videoWidth, videoHeight);
  setSelectedImage(captureCanvas.toDataURL("image/png"));
  cameraMessage.textContent = "撮影した写真を顔画像として登録しました。";
});

stopCameraButton.addEventListener("click", stopCamera);

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

window.addEventListener("beforeunload", stopCamera);

function setSelectedImage(imageData) {
  selectedImageData = imageData;
  imagePreview.innerHTML = `<img src="${selectedImageData}" alt="選択した顔画像">`;
}

function stopCamera() {
  if (!cameraStream) {
    return;
  }

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraPreview.srcObject = null;
  cameraPreview.classList.add("hidden");
  captureButton.disabled = true;
  stopCameraButton.disabled = true;
  startCameraButton.disabled = false;
  cameraMessage.textContent = "カメラを停止しました。";
}

function createSimulationResult(requestText) {
  const profile = {
    style: styleSelect.value,
    eye: eyeSelect.value,
    nose: noseSelect.value,
    face: faceSelect.value,
    strength: Number(changeStrengthInput.value),
    imageEngine: imageEngineInput.value,
    region: regionInput.value.trim(),
    priority: priorityInput.value
  };
  const keywords = buildKeywords(requestText, profile);
  const analysis = createAnalysisText(requestText, profile);
  const matchedHospitals = hospitals
    .map((hospital) => ({
      ...hospital,
      score: getHospitalScore(hospital, keywords, profile.region)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return {
    requestText,
    profile,
    category: optionLabels.style[profile.style],
    analysis,
    hospitals: matchedHospitals
  };
}


function getHospitalScore(hospital, keywords, region) {
  const normalizedRegion = normalizeText(region);
  const normalizedKeywords = normalizeText(keywords);
  let score = 0;

  if (normalizedRegion) {
    const regionMatched = hospital.regions.some((item) => {
      const normalizedItem = normalizeText(item);
      return normalizedItem.includes(normalizedRegion) || normalizedRegion.includes(normalizedItem);
    });

    if (regionMatched) {
      score += 10;
    }
  }

  score += hospital.strengths.filter((strength) => normalizedKeywords.includes(normalizeText(strength))).length * 2;
  return score;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}
function buildKeywords(requestText, profile) {
  return [
    requestText,
    optionLabels.style[profile.style],
    optionLabels.eye[profile.eye],
    optionLabels.nose[profile.nose],
    optionLabels.face[profile.face]
  ].join(" ");
}

function createAnalysisText(requestText, profile) {
  const priorityText = {
    natural: "自然さを少し残しながら、目・鼻・輪郭の変化が分かるように調整しています。",
    balance: "顔全体のバランスを見ながら、パーツ単体ではなく全体の印象が変わるようにしています。",
    cost: "大きな変化を見せつつ、段階的な施術イメージとして考えやすい方向にしています。",
    downtime: "変化は大きめですが、画面上ではダウンタイム後の完成イメージとして表示しています。"
  };
  const requestPart = requestText ? `入力内容「${requestText}」も反映しました。` : "選択した理想イメージを中心に作成しました。";
  const regionPart = profile.region ? `おすすめクリニックは「${profile.region}」周辺を優先して選んでいます。` : "おすすめクリニックは希望内容との相性を優先して選んでいます。";

  return `${requestPart} ${optionLabels.style[profile.style]}、${optionLabels.eye[profile.eye]}、${optionLabels.nose[profile.nose]}、${optionLabels.face[profile.face]}を組み合わせたAfter予測です。${regionPart}${priorityText[profile.priority]} ※この結果は学習用の参考表示であり、医療診断ではありません。`;
}

async function renderResult(result) {
  emptyResult.classList.add("hidden");
  resultContent.classList.remove("hidden");
  saveButton.disabled = false;

  beforeImage.innerHTML = `<img src="${selectedImageData}" alt="シミュレーション前の画像">`;
  afterImage.innerHTML = `<div class="loading-state">After画像を生成しています...</div>`;
  analysisText.textContent = result.analysis;

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

  hospitalList.innerHTML = result.hospitals.map((hospital) => `
    <article class="hospital-card">
      <h4>${hospital.name}</h4>
      <div class="tags">
        ${hospital.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
      </div>
      <p class="small">${hospital.area} / ${hospital.description}</p>
    </article>
  `).join("");
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
      labels: {
        style: optionLabels.style[result.profile.style],
        eye: optionLabels.eye[result.profile.eye],
        nose: optionLabels.nose[result.profile.nose],
        face: optionLabels.face[result.profile.face]
      }
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
      const maxSize = 768;
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    });

    image.addEventListener("error", () => reject(new Error("画像の軽量化に失敗しました。")));
    image.src = imageData;
  });
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
    vline: 0.13,
    oval: 0.09,
    sharp: 0.11,
    natural: 0.06
  };
  return amounts[faceType];
}

function getEyeAmount(eyeType) {
  const amounts = {
    wide: 0.13,
    cat: 0.09,
    soft: 0.08,
    natural: 0.05
  };
  return amounts[eyeType];
}

function getNoseAmount(noseType) {
  const amounts = {
    high: 0.08,
    small: 0.1,
    sharp: 0.11,
    natural: 0.04
  };
  return amounts[noseType];
}

function getStyleAmount(styleType) {
  const amounts = {
    kawaii: 0.08,
    cool: 0.07,
    korean: 0.08,
    doll: 0.1,
    natural: 0.05
  };
  return amounts[styleType];
}

function getStyleFilter(styleType) {
  const filters = {
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
