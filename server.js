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
  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64
                }
              }
            ]
          }
        ]
      })
    }
  );

  const data = await geminiResponse.json();

  if (!geminiResponse.ok) {
    sendJson(response, geminiResponse.status, {
      error: data.error?.message || "Gemini API request failed"
    });
    return;
  }

  const imagePart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData);

  if (!imagePart) {
    sendJson(response, 502, {
      error: "Geminiから画像が返りませんでした。"
    });
    return;
  }

  sendJson(response, 200, {
    image: `data:${imagePart.inlineData.mimeType || "image/png"};base64,${imagePart.inlineData.data}`
  });
}

function buildGeminiPrompt(body) {
  const labels = body.labels || {};
  const strength = body.profile?.strength ?? 50;
  const requestText = body.requestText || "選択された理想イメージを反映";

  return [
    "Edit the uploaded face photo into a realistic cosmetic-surgery after simulation.",
    "Keep the same person, same pose, same hairstyle, same clothes, same background, and natural human facial anatomy.",
    "Do not turn the person into an illustration, doll, anime character, mask, or different person.",
    "Make the result look like a plausible post-procedure beauty simulation, not a diagnosis.",
    `Desired style: ${labels.style || "natural beauty"}.`,
    `Eyes: ${labels.eye || "natural eyes"}.`,
    `Nose: ${labels.nose || "natural nose"}.`,
    `Face shape: ${labels.face || "natural face line"}.`,
    `User request in Japanese: ${requestText}.`,
    `Change strength is ${strength} percent out of 100. Use visible but realistic changes.`,
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
