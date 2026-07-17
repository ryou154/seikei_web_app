(function () {
  const PACKAGE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/+esm";
  const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

  let landmarkerPromise = null;

  function getLandmarker() {
    if (!landmarkerPromise) {
      landmarkerPromise = import(PACKAGE_URL).then(async ({ FaceLandmarker, FilesetResolver }) => {
        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        return FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: "CPU"
          },
          runningMode: "IMAGE",
          numFaces: 1,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.55,
          minTrackingConfidence: 0.5
        });
      }).catch((error) => {
        landmarkerPromise = null;
        throw error;
      });
    }

    return landmarkerPromise;
  }

  function loadImage(imageData) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener("load", () => resolve(image), { once: true });
      image.addEventListener("error", () => reject(new Error("顔画像を読み込めませんでした。")), { once: true });
      image.src = imageData;
    });
  }

  function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function averagePoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function round(value, digits = 1) {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  }

  function describeFaceAspect(value) {
    if (value < 1.22) return "横幅を感じやすい比率";
    if (value > 1.43) return "縦の長さを感じやすい比率";
    return "縦横のバランスが近い比率";
  }

  function describePose(tilt, offset) {
    if (Math.abs(tilt) <= 4 && offset <= 3) return "正面に近い配置";
    if (Math.abs(tilt) > 7) return "顔に傾きがある配置";
    return "中心にわずかなずれがある配置";
  }

  function calculateBalanceScore(metrics) {
    const penalty = (value, target, tolerance, weight) => (
      Math.min(1, Math.abs(value - target) / tolerance) * weight
    );
    const totalPenalty = [
      penalty(metrics.faceAspect, 1.32, 0.35, 25),
      penalty(metrics.eyeWidthRatio, 20, 10, 20),
      penalty(metrics.noseWidthRatio, 25, 15, 15),
      penalty(metrics.mouthWidthRatio, 36, 20, 15),
      penalty(metrics.centerOffsetRatio, 0, 10, 25)
    ].reduce((total, value) => total + value, 0);
    return Math.round(Math.max(0, Math.min(100, 100 - totalPenalty)));
  }

  function describeBalanceScore(score) {
    if (score >= 85) return "基準比率に近いバランス";
    if (score >= 70) return "おおむね安定したバランス";
    return "撮影角度を含めて確認が必要";
   }

  function calculateMetrics(landmarks, width, height) {
    const point = (index) => ({
      x: landmarks[index].x * width,
      y: landmarks[index].y * height
    });
    const faceTop = point(10);
    const chin = point(152);
    const faceLeft = point(234);
    const faceRight = point(454);
    const leftEyeOuter = point(33);
    const leftEyeInner = point(133);
    const rightEyeInner = point(362);
    const rightEyeOuter = point(263);
    const noseLeft = point(98);
    const noseRight = point(327);
    const noseTip = point(1);
    const mouthLeft = point(61);
    const mouthRight = point(291);
    const faceWidth = Math.max(1, distance(faceLeft, faceRight));
    const faceHeight = distance(faceTop, chin);
    const leftEyeWidth = distance(leftEyeOuter, leftEyeInner);
    const rightEyeWidth = distance(rightEyeInner, rightEyeOuter);
    const leftEyeCenter = averagePoint(leftEyeOuter, leftEyeInner);
    const rightEyeCenter = averagePoint(rightEyeInner, rightEyeOuter);
    const eyeCenter = averagePoint(leftEyeCenter, rightEyeCenter);
    const eyeTilt = Math.atan2(rightEyeCenter.y - leftEyeCenter.y, rightEyeCenter.x - leftEyeCenter.x) * 180 / Math.PI;
    const centerOffset = Math.abs(noseTip.x - eyeCenter.x) / faceWidth * 100;

    const metrics = {
      landmarkCount: landmarks.length,
      faceAspect: round(faceHeight / faceWidth, 2),
      eyeWidthRatio: round(((leftEyeWidth + rightEyeWidth) / 2) / faceWidth * 100),
      noseWidthRatio: round(distance(noseLeft, noseRight) / faceWidth * 100),
      mouthWidthRatio: round(distance(mouthLeft, mouthRight) / faceWidth * 100),
      eyeTiltDegrees: round(eyeTilt),
      centerOffsetRatio: round(centerOffset),
      faceAspectLabel: describeFaceAspect(faceHeight / faceWidth),
      poseLabel: describePose(eyeTilt, centerOffset)
    };
    const balanceScore = calculateBalanceScore(metrics);
    return {
      ...metrics,
      balanceScore,
      balanceScoreLabel: describeBalanceScore(balanceScore)
    };
  }

  async function analyze(imageData) {
    const [landmarker, image] = await Promise.all([getLandmarker(), loadImage(imageData)]);
    const result = landmarker.detect(image);
    const landmarks = result.faceLandmarks?.[0];

    if (!landmarks) {
      throw new Error("顔を1つ検出できる正面写真を使用してください。");
    }

    return {
      ok: true,
      metrics: calculateMetrics(landmarks, image.naturalWidth, image.naturalHeight)
    };
  }

  window.FaceBalanceAnalyzer = {
    analyze,
    scoreMetrics: calculateBalanceScore
  };
})();
