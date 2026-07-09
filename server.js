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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 160000);
  let geminiResponse;

  try {
    geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-image",
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
            aspect_ratio: "1:1",
            image_size: "1K"
          }
        }),
        signal: controller.signal
      }
    );
  } catch (error) {
    if (error.name === "AbortError") {
      sendJson(response, 504, {
        error: "Gemini画像生成が約5分以内に完了しませんでした。画像を小さくするか、少し時間を置いて再実行してください。"
      });
      return;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
  const data = await geminiResponse.json();

  if (!geminiResponse.ok) {
    sendJson(response, geminiResponse.status, {
      error: data.error?.message || "Gemini API request failed"
    });
    return;
  }

  const outputImage = extractGeminiImage(data);

  if (!outputImage?.data) {
    sendJson(response, 502, {
      error: "Geminiから画像が返りませんでした。",
      detail: summarizeGeminiResponse(data)
    });
    return;
  }

  sendJson(response, 200, {
    image: `data:${outputImage.mime_type || "image/png"};base64,${outputImage.data}`
  });
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

function buildGeminiPrompt(body) {
  const labels = body.labels || {};
  const strength = body.profile?.strength ?? 50;
  const requestText = body.requestText || "選択された理想イメージを反映";
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
    "Keep the same person, pose, hairstyle, clothes, lighting, and background.",
    "Preserve natural human anatomy and realistic skin texture.",
    `Style: ${labels.style || "natural"}. Eyes: ${labels.eye || "natural"}. Nose: ${labels.nose || "natural"}. Face: ${labels.face || "natural"}.`,
    `User request: ${requestText}. Strength: ${strength}%.`,
    strengthGuide,
    "For stronger settings, the Before and After must be easy to tell apart at a glance by changing the visual impression, not by making a non-human or different-person result.",
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
