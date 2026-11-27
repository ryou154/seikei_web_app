const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Firestore } = require("@google-cloud/firestore");
const { BigQuery } = require("@google-cloud/bigquery");
const { authorize } = require("./auth-server");
const { createStore, createAccountHandler } = require("./account-store");
const { createImageService } = require("./image-store");
const { createAccountDeleteHandler } = require("./account-delete");
const { createClinicStore, createClinicHandler } = require("./clinic-store");
const { createClinicAdminStore, createClinicAdminHandler, requireAdmin } = require("./clinic-admin");
const { createAdminUsersHandler } = require("./admin-users");
const { INQUIRY_CATEGORIES, createInquiryStore, clean, normalizeCategory } = require("./inquiry-store");
const { BillingUsageError, createBillingUsageService } = require("./billing-usage");
const { getPlanPolicy, canUseChat } = require("./plan-policy");
const firebaseConfig = require("./firebase-config");
const firestore = new Firestore({ projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId, databaseId: "(default)" });
const accountDatabase = createStore(firestore);
const clinicDatabase = createClinicStore(firestore);
const clinicAdminDatabase = createClinicAdminStore(firestore);
const inquiryDatabase = createInquiryStore(firestore);
const imageService = createImageService({ historyStore: accountDatabase });
const handleAccount = createAccountHandler({ getStore: () => accountDatabase, deleteImages: imageService.deleteHistories });
const handleAccountDelete = createAccountDeleteHandler({ getStore: () => accountDatabase });
const handleClinics = createClinicHandler({ getStore: () => clinicDatabase });
const handleClinicAdmin = createClinicAdminHandler({ getStore: () => clinicAdminDatabase });
const handleAdminUsers = createAdminUsersHandler({ authenticate: (request) => requireAdmin(request, authorize), firestore, inquiries: inquiryDatabase });
const billingUsage = createBillingUsageService({
  createClient: (config) => new BigQuery({ projectId: config.billingProjectId })
});

const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const root = __dirname;
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const server = http.createServer(async (request, response) => {
  try {
    if (imageService.matches(request.url)) {
      sendResult(response, await imageService.handle(request));
      return;
    }
    if (request.url === "/api/account" || request.url.startsWith("/api/account?")) {
      const result = await handleAccountDelete(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.url.startsWith("/api/account/")) {
      const result = await handleAccount(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.url === "/api/admin/clinics" || request.url.startsWith("/api/admin/clinics?")) {
      const result = await handleClinicAdmin(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.url.startsWith("/api/admin/clinics/")) {
      const result = await handleClinicAdmin(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.method === "GET" && request.url === "/api/admin/session") {
      const identity = await requireAdmin(request, authorize);
      sendJson(response, 200, { admin: true, uid: identity.uid, email: identity.email });
      return;
    }
    if (request.method === "GET" && request.url === "/api/admin/api-usage") {
      await requireAdmin(request, authorize);
      try {
        sendJson(response, 200, await billingUsage.getMonthUsage());
      } catch (error) {
        if (error instanceof BillingUsageError) {
          sendJson(response, error.status, { error: error.message, code: error.code });
          return;
        }
        throw error;
      }
      return;
    }
    if (/^\/api\/admin\/users(?:\?|\/|$)/.test(request.url)) {
      const result = await handleAdminUsers(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.method === "GET" && request.url === "/api/contact") {
      const identity = await authorize(request);
      const inquiries = (await inquiryDatabase.listByUser(identity.uid)).map((item) => ({
        id: item.id,
        category: item.category,
        subject: item.subject,
        message: item.message,
        status: item.status,
        createdAt: item.createdAt,
        answeredAt: item.answeredAt,
        response: item.status === "answered" ? item.response : ""
      }));
      sendJson(response, 200, { inquiries, categories: INQUIRY_CATEGORIES });
      return;
    }
    if (request.method === "POST" && request.url === "/api/contact") {
      const identity = await authorize(request);
      const body = await readJsonBody(request);
      if (!clean(body.subject, 120) || !clean(body.message, 4000)) return sendJson(response, 400, { error: "件名と内容を入力してください。" });
      if (!Object.hasOwn(INQUIRY_CATEGORIES, body.category)) return sendJson(response, 400, { error: "カテゴリーを選択してください。" });
      sendJson(response, 201, { inquiry: await inquiryDatabase.create({ email: identity.email, uid: identity.uid, category: body.category, subject: body.subject, message: body.message }) });
      return;
    }
    if ((request.url === "/api/admin/inquiries" || request.url.startsWith("/api/admin/inquiries?")) && request.method === "GET") {
      await requireAdmin(request, authorize);
      const params = new URL(request.url, `http://localhost:${port}`).searchParams;
      const status = params.get("status") || "unanswered";
      const requestedCategory = params.get("category") || "all";
      const category = requestedCategory === "all" ? "all" : normalizeCategory(requestedCategory);
      sendJson(response, 200, { inquiries: await inquiryDatabase.list(status, category), categories: INQUIRY_CATEGORIES });
      return;
    }
    const inquiryMatch = /^\/api\/admin\/inquiries\/([A-Za-z0-9_-]+)$/.exec(request.url);
    if (inquiryMatch && request.method === "PUT") {
      const adminIdentity = await requireAdmin(request, authorize);
      const body = await readJsonBody(request);
      if (!["unanswered", "answered"].includes(body.status)) return sendJson(response, 400, { error: "回答状態が不正です。" });
      if (body.status === "answered" && !clean(body.response, 4000)) return sendJson(response, 400, { error: "回答内容を入力してください。" });
      const inquiry = await inquiryDatabase.update(inquiryMatch[1], {
        status: body.status,
        response: body.response,
        answeredBy: adminIdentity.email
      });
      sendJson(response, inquiry ? 200 : 404, inquiry ? { inquiry } : { error: "問い合わせが見つかりません。" });
      return;
    }
    if (request.url === "/api/clinics" || request.url.startsWith("/api/clinics?") || request.url.startsWith("/api/clinics/")) {
      const result = await handleClinics(request);
      sendJson(response, result.status, result.data);
      return;
    }
    if (request.method === "GET" && request.url === "/api/firebase-config") {
      sendJson(response, 200, firebaseConfig);
      return;
    }
    if (request.method === "GET" && request.url === "/api/session") {
      sendJson(response, 200, await authorize(request));
      return;
    }
    if (request.method === "POST" && request.url === "/api/gemini-edit") {
      await authorize(request);
      await handleGeminiEdit(request, response);
      return;
    }
    if (request.method === "POST" && request.url === "/api/gemini-chat") {
      await authorize(request);
      await handleGeminiChat(request, response);
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, error.status || 500, { error: error.status ? error.message : "処理に失敗しました。時間をおいて再試行してください。" });
  }
});

server.listen(port, () => {
  console.log(`seikei_web_app is running at http://localhost:${server.address().port}`);
});

async function handleGeminiEdit(request, response) {
  if (!apiKey) {
    sendJson(response, 500, {
      error: "GEMINI_API_KEY が設定されていません。"
    });
    return;
  }

  const body = await readJsonBody(request);
  const image = parseDataUrl(body.image);
  const scanReferences = Array.isArray(body.scanReferences)
    ? body.scanReferences.slice(0, 61).map((reference) => ({
      direction: clean(reference?.direction, 20),
      image: parseDataUrl(reference?.image)
    })).filter((reference) => reference.image)
    : [];
  const prompt = buildGeminiPrompt(body);
  const retryPrompt = buildGeminiPrompt(body, { compact: true });
  const aspectRatio = normalizeAspectRatio(body.aspectRatio);
  const attempts = [
    { model: "gemini-3.1-flash-image", prompt },
    { model: "gemini-3.1-flash-image", prompt: retryPrompt },
    { model: "gemini-2.5-flash-image", prompt: retryPrompt }
  ];
  const errors = [];

  for (const attempt of attempts) {
    const result = await requestGeminiImage({
      model: attempt.model,
      prompt: attempt.prompt,
      image,
      referenceImages: scanReferences,
      aspectRatio
    });

    if (result.ok) {
      sendJson(response, 200, {
        image: `data:${result.image.mime_type || "image/png"};base64,${result.image.data}`,
        model: attempt.model
      });
      return;
    }

    errors.push(result.error);

    if (!shouldRetryGeminiError(result.status, result.error)) {
      break;
    }
  }

  sendJson(response, errors.at(-1)?.status || 502, {
    error: errors.at(-1)?.message || "Gemini画像生成に失敗しました。",
    detail: errors.map((error) => error.message).filter(Boolean).join(" / ")
  });
}

async function handleGeminiChat(request, response) {
  const planType = request.headers["x-meylon-plan"] || "free";
  if (!canUseChat(planType, 0)) return sendJson(response, 403, { error: "チャット相談は有料プランまたは無料トライアルで利用できます。" });
  if (!apiKey) return sendJson(response, 500, { error: "GEMINI_API_KEY が設定されていません。" });
  const body = await readJsonBody(request);
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!messages.length || messages.some((item) => typeof item?.text !== "string" || item.text.trim().length > 2000)) {
    return sendJson(response, 400, { error: "相談内容を確認してください。" });
  }
  const prompt = [
    "あなたは美容医療・美容整形に関する情報整理を支援するチャットボットです。",
    "診断、治療の断定、効果の保証、緊急時の判断は行わず、医師への相談を促してください。",
    "ユーザーの希望を整理し、確認すべき施術候補、一般的な注意点、医師に聞く質問を日本語で簡潔に案内してください。",
    "ユーザーが施術を希望しても、このチャットだけでシミュレーションを実行せず、必要なら候補を提示して確認を求めてください。",
    `会話:\n${messages.map((item) => `${item.role === "user" ? "ユーザー" : "アシスタント"}: ${item.text.trim()}`).join("\n")}`
  ].join("\n");
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);
  try {
    const result = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      signal: controller.signal
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok) return sendJson(response, result.status, { error: data?.error?.message || "チャット相談の生成に失敗しました。" });
    const message = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    return sendJson(response, 200, { message: message || "回答を生成できませんでした。もう一度お試しください。" });
  } catch (error) {
    return sendJson(response, error.name === "AbortError" ? 504 : 502, { error: "チャット相談がタイムアウトしました。少し時間を置いて再試行してください。" });
  } finally { clearTimeout(timeoutId); }
}

async function requestGeminiImage({ model, prompt, image, referenceImages = [], aspectRatio }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 160000);

  try {
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          input: [
            { type: "text", text: prompt },
            { type: "image", mime_type: image.mimeType, data: image.base64 },
            ...referenceImages.map(({ image: reference }) => ({
              type: "image",
              mime_type: reference.mimeType,
              data: reference.base64
            }))
          ],
          response_format: {
            type: "image",
            mime_type: "image/jpeg",
            aspect_ratio: aspectRatio,
            image_size: "1K"
          }
        }),
        signal: controller.signal
      }
    );

    const data = await geminiResponse.json().catch(() => ({}));

    if (!geminiResponse.ok) {
      return {
        ok: false,
        status: geminiResponse.status,
        error: {
          status: geminiResponse.status,
          message: data.error?.message || "Gemini API request failed"
        }
      };
    }

    const outputImage = extractGeminiImage(data);

    if (!outputImage?.data) {
      return {
        ok: false,
        status: 502,
        error: {
          status: 502,
          message: summarizeGeminiResponse(data)
        }
      };
    }

    return { ok: true, image: outputImage };
  } catch (error) {
    if (error.name === "AbortError") {
      return {
        ok: false,
        status: 504,
        error: {
          status: 504,
          message: "Gemini画像生成が約5分以内に完了しませんでした。画像を小さくするか、少し時間を置いて再実行してください。"
        }
      };
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function shouldRetryGeminiError(status, error) {
  const message = String(error?.message || "").toLowerCase();
  return status >= 500 || status === 429 || message.includes("internal error") || message.includes("no output_image");
}
function extractGeminiImage(data) {
  if (data?.output_image?.data) return data.output_image;

  const images = [];
  collectGeminiImages(data, images);
  return images[0] || null;
}

function collectGeminiImages(value, images) {
  if (!value || images.length > 0) return;

  if (Array.isArray(value)) {
    for (const item of value) collectGeminiImages(item, images);
    return;
  }

  if (typeof value !== "object") return;

  const mimeType = value.mime_type || value.mimeType;
  if (typeof value.data === "string" && /^image\//.test(mimeType || "")) {
    images.push({ data: value.data, mime_type: mimeType });
    return;
  }

  for (const child of Object.values(value)) {
    collectGeminiImages(child, images);
  }
}
function summarizeGeminiResponse(data) {
  const texts = [];
  collectGeminiText(data, texts);
  return texts.slice(0, 3).join(" / ") || data?.error?.message || data?.message || "No output_image in Gemini response";
}

function collectGeminiText(value, texts) {
  if (!value || texts.length >= 3) return;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && trimmed.length < 500) texts.push(trimmed);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectGeminiText(item, texts);
    return;
  }

  if (typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/text|message|reason|finish|blocked|safety|detail/i.test(key)) {
        collectGeminiText(child, texts);
      }
    }
  }
}

function normalizeAspectRatio(value) {
  return ["1:1", "4:3", "3:4"].includes(value) ? value : "1:1";
}
function buildGeminiPrompt(body, options = {}) {
  const labels = body.labels || {};
  const strength = body.profile?.strength ?? 50;
  const generationPriority = body.profile?.priority || "natural";
  const requestText = body.requestText || "選択された理想イメージを反映";
  const viewDirectionGuides = {
    front: "View direction: straight-on front view.",
    left45: "View direction: turn the same person's head about 45 degrees to the left, showing a natural left three-quarter view.",
    right45: "View direction: turn the same person's head about 45 degrees to the right, showing a natural right three-quarter view.",
    left90: "View direction: turn the same person's head fully to the left, showing a natural true left side profile at about 90 degrees.",
    right90: "View direction: turn the same person's head fully to the right, showing a natural true right side profile at about 90 degrees.",
    up: "View direction: keep the same person and turn the face slightly upward, showing a natural upward-looking view.",
    down: "View direction: keep the same person and turn the face slightly downward, showing a natural downward-looking view."
  };
  const viewDirectionGuide = viewDirectionGuides[body.viewDirection] || viewDirectionGuides.front;
  const detailInstructions = {
    "shorten-face": "make the face look slightly shorter vertically while keeping natural facial proportions",
    "slim-cheeks": "make the cheeks look subtly slimmer",
    "soften-jaw": "make a prominent jaw angle look softer",
    "shorten-chin": "make the chin look slightly shorter",
    "sharpen-jawline": "make the jawline look more defined",
    "open-eyes": "make the eyes look more open and bright without changing identity",
    "raise-eye-corners": "give the outer eye corners a subtly lifted appearance",
    "soften-eye-corners": "give the outer eye corners a softer appearance",
    "balance-eyes": "make the eyes appear more balanced while preserving natural asymmetry",
    "emphasize-under-eye": "add subtle, natural-looking under-eye fullness",
    "straighten-nose": "make the nose bridge appear straighter",
    "slim-nose-wings": "make the nostril wings appear subtly narrower",
    "refine-nose-tip": "make the nose tip appear slightly more refined",
    "lift-mouth-corners": "give the mouth corners a subtly lifted appearance",
    "fuller-lips": "add natural-looking lip fullness and dimension",
    "soften-mouth": "make the mouth appear more understated",
    "round-forehead": "give the forehead a subtly rounder appearance",
    "smooth-forehead": "make forehead contours appear smoother",
    "balance-face-length": "make the face height-to-width balance look more naturally proportioned",
    "center-face": "make the facial centerline look more balanced while preserving natural asymmetry",
    "balance-cheekbones": "make prominent cheekbones look subtly more balanced",
    "soften-face-outline": "make sharp corners of the face outline look softer",
    "balance-brows": "make the eyebrows look more balanced while keeping a natural shape",
    "lower-brow-distance": "make the distance between the eyebrows and eyes look slightly closer",
    "brighten-eyes": "make the eye area look brighter without changing identity",
    "reduce-eye-fatigue": "soften the tired appearance around the eyes",
    "smooth-skin": "make the skin texture look smoother while keeping realistic pores",
    "natural-skin-texture": "preserve natural skin texture while lightly improving the overall finish",
    "reduce-shine": "reduce excessive facial shine while keeping realistic highlights",
    "soften-shadows": "soften harsh shadows on the face",
    "hair-removal-after": "make the visible skin look smooth and clean like the appearance after facial hair removal",
    "reduce-facial-hair-shadow": "reduce the visible shadow from facial hair or fine hair while preserving natural skin",
    "even-skin-tone": "make uneven skin tone look more even and natural",
    "reduce-redness": "reduce visible redness while keeping realistic skin color",
    "bright-clear-skin": "make the skin look brighter, clear, and clean without an artificial filter"
  };
  const selectedDetailInstructions = Array.isArray(body.profile?.details)
    ? [...new Set(body.profile.details)]
      .filter((key) => Object.hasOwn(detailInstructions, key))
      .slice(0, 40)
      .map((key) => detailInstructions[key])
    : [];
  const detailGuide = selectedDetailInstructions.length
    ? `Additional specific visual requests: ${selectedDetailInstructions.join("; ")}. Apply each as a modest appearance-only image change; do not imply a medical result.`
    : "No additional fine-detail requests were selected.";
  const compact = Boolean(options.compact);
  const genderGuide = buildGenderGuide(body.profile?.gender);
  const faceGeometryGuide = buildFaceGeometryGuide(body.faceAnalysis);
  const priorityGuide = {
    natural: "Generation priority: keep a natural, realistic result while making the requested changes visible.",
    balance: "Generation priority: optimize the whole-face balance so the eyes, nose, mouth, forehead, and contour harmonize together.",
    visible: "Generation priority: make the Before and After difference easy to recognize at a glance while preserving identity.",
    parts: "Generation priority: strongly reflect the specified parts and custom requests. Requested eyes, nose, mouth, forehead, and contour changes should be visibly represented."
  };
  const strengthGuide = strength >= 75
    ? "Apply the requested visual design changes strongly and clearly while keeping the same identity and a realistic human face. Do not alter any facial part marked as no change."
    : strength >= 60
      ? "Apply the requested visual design changes at a medium-strong intensity while keeping the same identity and realism. Do not alter any facial part marked as no change."
      : strength >= 35
        ? "Apply the requested visual design changes at a moderate intensity so they are natural but noticeable. Do not alter any facial part marked as no change."
        : "Apply the requested visual design changes lightly and naturally. Keep them gentle but visible, and do not alter any facial part marked as no change.";

  return [
    "Create one realistic aesthetic after-simulation image from the uploaded face photo.",
    "This is a non-medical aesthetic visualization for a school demo, not a diagnosis or treatment recommendation.",
    genderGuide,
    "Keep the same person and realistic identity. Preserve the original camera distance, crop, framing, head size, hairstyle, clothes, lighting, and visible background. Keep the full head, hair, chin, neck, and the same amount of shoulders visible. For a directional view, change only the head direction requested below while keeping the framing consistent. Never zoom in, crop closer, enlarge the face, or cut off any part that was visible in the input.",
    "The first uploaded image is the canonical generated front After image. Preserve its identity, hairstyle, skin tone, facial proportions, and every requested aesthetic change exactly; do not redesign the face for another view. Any following reference images are the user's silent multi-angle scan and must be used only to estimate the same person's head direction, visible contour, nose projection, lips, jawline, and proportions. Never copy their Before appearance over the canonical After image and never change the person.",
    viewDirectionGuide,
    "Preserve natural human anatomy and realistic skin texture.",
    "Make the result look like a realistic photograph: preserve visible depth in the nose bridge and tip, eyelids, brow ridge, cheekbones, lips, chin, and jawline. Use natural directional light, soft occlusion, and gentle cast shadows so the face reads as volumetric rather than a flat 2D overlay. Do not use an illustration, cartoon, plastic, or mannequin look.",
    `Style: ${labels.style || "natural"}. Eyes: ${labels.eye || "natural"}. Nose: ${labels.nose || "natural"}. Face: ${labels.face || "natural"}. Mouth: ${labels.mouth || "no change"}. Forehead: ${labels.forehead || "no change"}.`,
    detailGuide,
    `User request: ${requestText}. Additional free-form fine-detail request: ${body.profile?.detailFreeText || "none"}. Strength: ${strength}%.`,
    faceGeometryGuide,
    priorityGuide[generationPriority] || priorityGuide.natural,
    strengthGuide,
    compact ? "Use a simple, stable edit. Keep identity, pose, lighting, background, and realistic anatomy. Apply every selected fine-detail request clearly but naturally." : "For stronger settings, the Before and After must be easy to tell apart at a glance. Apply every selected fine-detail request and the free-form request visibly but naturally, prioritizing the requested areas while preserving identity and realistic human anatomy. If a field says no change, keep that part close to the original.",
    "Do not create a medical result, surgical procedure, anime, doll, mask, distorted anatomy, or a different person.",
    "Return only the edited image."
  ].join(" ");
}
function buildGenderGuide(value) {
  if (value === "male") {
    return "User-selected gender: male. Preserve the subject as the same male person and maintain his male gender presentation. Do not transform him into a female person. Apply the requested facial design within a realistic male face.";
  }

  if (value === "female") {
    return "User-selected gender: female. Preserve the subject as the same female person and maintain her female gender presentation. Do not transform her into a male person. Apply the requested facial design within a realistic female face.";
  }

  return "Gender was not selected. Preserve the original gender presentation visible in the input image without changing it.";
}

function buildFaceGeometryGuide(value) {
  if (!value || typeof value !== "object") {
    return "No facial landmark measurements are available; infer the original proportions from the image.";
  }

  const number = (key, min, max) => {
    const parsed = Number(value[key]);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
  };
  const faceAspect = number("faceAspect", 0.5, 2.5);
  const eyeWidth = number("eyeWidthRatio", 1, 60);
  const noseWidth = number("noseWidthRatio", 1, 60);
  const mouthWidth = number("mouthWidthRatio", 1, 80);
  const tilt = number("eyeTiltDegrees", -45, 45);
  const offset = number("centerOffsetRatio", 0, 50);

  if ([faceAspect, eyeWidth, noseWidth, mouthWidth, tilt, offset].some((item) => item === null)) {
    return "Facial landmark measurements were incomplete; infer the original proportions from the image.";
  }

  return `MediaPipe measured the original 2D facial geometry: face height-to-width ratio ${faceAspect}, average eye-width ratio ${eyeWidth}%, nose-width ratio ${noseWidth}%, mouth-width ratio ${mouthWidth}%, eye-line tilt ${tilt} degrees, and centerline offset ${offset}%. Use these only as reference proportions for applying the requested relative changes. Do not treat them as bone measurements or a medical diagnosis.`;
}

function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://localhost:${port}`);
  const urlPath = decodeURIComponent(requestUrl.pathname);
  // Only explicitly public assets may be served. Never expose .env, source,
  // dependencies, Git metadata or server-side access policy.
  const logoFile = decodeURIComponent("/%E3%83%AD%E3%82%B4.png");
  const latestLogoFile = decodeURIComponent("/%E3%83%AD%E3%82%B4%E6%9C%80%E6%96%B0%E7%89%88.png");
  const publicFiles = new Set([
    "/", "/index.html", "/login.html", "/home.html", "/home.js", "/home.css", "/app.html", "/mypage.html", "/mypage.js", "/mypage-model.js", "/mypage.css", "/style.css", "/script.js", "/auth-client.js", "/auth-core.js", "/login-page.js",
    "/clinics.html", "/clinic-search.js", "/clinic-search.css", "/account-data.js", "/face-analysis.js", "/input-guard.js", "/simulation-adjustments.js", "/history.html", "/history-page.js", "/history-page.css", "/register.html", "/reset-password.html", "/help.html", "/help.js", "/help.css", "/admin-clinics.html", "/admin-clinics.js", "/admin-clinics.css", "/data/clinics.js", "/data/clinic-details.js", "/chat.css",
    "/navigation.js", "/navigation.css", "/profile-edit.html", "/profile-edit.js", "/chat.html", "/chat.js", "/plans.html", "/plans.js", "/plan-policy.js", "/assets/scan-audio/start.mp3", "/assets/scan-audio/front.mp3", "/assets/scan-audio/left (2).mp3", "/assets/scan-audio/right (2).mp3", "/assets/scan-audio/up (2).mp3", "/assets/scan-audio/down.mp3", "/assets/scan-audio/retry.mp3", "/assets/scan-audio/move-closer.mp3", "/assets/scan-audio/move-away.mp3", "/assets/scan-audio/adjust-left.mp3", "/assets/scan-audio/adjust-right.mp3", "/assets/scan-audio/adjust-up.mp3", "/assets/scan-audio/adjust-down.mp3", "/admin/", "/admin/index.html", "/admin/clinics.html", "/admin/users.html", "/admin/users.js", "/admin/api-usage.html", "/admin/api-usage.js", "/admin/inquiries.html", "/admin/inquiries.js", "/admin/admin.js", "/admin/admin.css", "/admin/sidebar.js", logoFile, latestLogoFile
  ]);
  if (!publicFiles.has(urlPath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const relativePath = urlPath === "/"
    ? "index.html"
    : urlPath === "/admin/"
      ? "admin/index.html"
      : urlPath === "/admin/clinics.html"
        ? "admin-clinics.html"
        : urlPath === "/admin/api-usage.html" || urlPath === "/admin/users.html"
          ? urlPath.replace(/^[/\\]+/, "")
      : urlPath.replace(/^[/\\]+/, "");
  const safePath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(root, safePath);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache"
    });
    response.end(content);
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let data = "";

    request.on("data", (chunk) => {
      data += chunk;
      if (data.length > 12 * 1024 * 1024) {
        reject(new Error("画像サイズが大きすぎます。"));
      }
    });
    request.on("end", () => resolve(JSON.parse(data || "{}")));
    request.on("error", reject);
  });
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || "");

  if (!match) {
    throw new Error("画像データが正しくありません。");
  }

  return {
    mimeType: match[1],
    base64: match[2]
  };
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

function sendResult(response, result) {
  if (result.body) {
    response.writeHead(result.status, result.headers || {});
    response.end(result.body);
    return;
  }
  sendJson(response, result.status, result.data);
}
