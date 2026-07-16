const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

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
    if (request.method === "POST" && request.url === "/api/gemini-edit") {
      await handleGeminiEdit(request, response);
      return;
    }

    if (request.method === "GET") {
      serveStatic(request, response);
      return;
    }

    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    sendJson(response, 500, { error: error.message || "Server error" });
  }
});

server.listen(port, () => {
  console.log(`seikei_web_app is running at http://localhost:${port}`);
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

async function requestGeminiImage({ model, prompt, image, aspectRatio }) {
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
            {
              type: "image",
              mime_type: image.mimeType,
              data: image.base64
            }
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
  const compact = Boolean(options.compact);
  const priorityGuide = {
    natural: "Generation priority: keep a natural, realistic result while making the requested changes visible.",
    balance: "Generation priority: optimize the whole-face balance so the eyes, nose, mouth, forehead, and contour harmonize together.",
    visible: "Generation priority: make the Before and After difference easy to recognize at a glance while preserving identity.",
    parts: "Generation priority: strongly reflect the specified parts and custom requests. Requested eyes, nose, mouth, forehead, and contour changes should be visibly represented."
  };
  const strengthGuide = strength >= 75
    ? "Apply a strong visual beauty design transformation. Make the Before and After clearly different by enhancing eyelid appearance, brighter eye impression, clearer nose bridge appearance, sharper face outline appearance, smaller-face impression, V-line style contour appearance, and balanced polished portrait aesthetics. Keep the same identity and a realistic human face."
    : strength >= 60
      ? "Apply a medium-strong visual beauty design transformation. The eyes, nose bridge appearance, face outline appearance, smaller-face impression, and portrait balance should be clearly improved while keeping the same identity and realism."
      : strength >= 35
        ? "Apply a moderate beauty design retouch. Improve eye impression, nose bridge appearance, face outline appearance, and overall balance in a natural but noticeable way."
        : "Apply a light natural beauty retouch. Keep changes gentle, but still make the requested style visible.";

  return [
    "Create one realistic aesthetic after-simulation image from the uploaded face photo.",
    "This is a non-medical aesthetic visualization for a school demo, not a diagnosis or treatment recommendation.",
    "Keep the same person and realistic identity. Preserve the original camera distance, crop, framing, head size, pose, hairstyle, clothes, lighting, and visible background. Keep the full head, hair, chin, neck, and the same amount of shoulders visible. Never zoom in, crop closer, enlarge the face, or cut off any part that was visible in the input.",
    "Preserve natural human anatomy and realistic skin texture.",
    `Style: ${labels.style || "natural"}. Eyes: ${labels.eye || "natural"}. Nose: ${labels.nose || "natural"}. Face: ${labels.face || "natural"}. Mouth: ${labels.mouth || "no change"}. Forehead: ${labels.forehead || "no change"}.`,
    `User request: ${requestText}. Strength: ${strength}%.`,
    priorityGuide[generationPriority] || priorityGuide.natural,
    strengthGuide,
    compact ? "Use a simple, stable edit. Keep identity, pose, lighting, background, and realistic anatomy. Apply the requested facial design changes clearly but avoid overprocessing." : "For stronger settings, the Before and After must be easy to tell apart at a glance. Prioritize visible requested changes to eyes, nose bridge, nose tip, jawline, cheeks, mouth, lips, forehead, and face contour while preserving identity and realistic human anatomy. If a field says no change, keep that part close to the original.",
    "Do not create a medical result, surgical procedure, anime, doll, mask, distorted anatomy, or a different person.",
    "Return only the edited image."
  ].join(" ");
}
function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://localhost:${port}`);
  const urlPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = urlPath === "/"
    ? "index.html"
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
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
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
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
}
