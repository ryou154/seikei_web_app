const { initializeApp, getApps } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { authorize } = require("./auth-server");
const firebaseConfig = require("./firebase-config");

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BODY_BYTES = 14 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class ImageInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9-]{16,64}$/.test(value)) {
    throw new ImageInputError("履歴IDが不正です。");
  }
  return value;
}

function objectPath(uid, historyId, kind) {
  if (typeof uid !== "string" || !uid || uid.includes("/")) throw new ImageInputError("利用者IDが不正です。");
  return `users/${uid}/simulations/${validId(historyId)}/${kind}`;
}

function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
    throw new ImageInputError("JSON形式で送信してください。", 415);
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    let chunks = [];
    let failed = false;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES && !failed) {
        failed = true;
        chunks = [];
        reject(new ImageInputError("画像データが大きすぎます。", 413));
      }
      if (!failed) chunks.push(chunk);
    });
    request.on("end", () => {
      if (failed) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(new ImageInputError("JSONデータが不正です。")); }
    });
    request.on("error", reject);
    request.on("aborted", () => reject(new ImageInputError("通信が中断されました。")));
  });
}

function hasExpectedSignature(buffer, type) {
  if (type === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (type === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
  if (type === "image/webp") return buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
  return false;
}

function parseImage(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl || "");
  if (!match || !IMAGE_TYPES.has(match[1])) throw new ImageInputError("JPEG、PNG、WebP画像を指定してください。");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ImageInputError("画像は1枚5MB以内にしてください。", 413);
  if (!hasExpectedSignature(buffer, match[1])) throw new ImageInputError("画像ファイルの内容を確認できませんでした。");
  return { buffer, contentType: match[1] };
}

function createImageService({ authenticate = authorize, historyStore, getBucket } = {}) {
  if (!historyStore) throw new Error("historyStore is required");
  let bucket;
  getBucket ||= () => {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET || `${firebaseConfig.projectId}.firebasestorage.app`;
    const app = getApps()[0] || initializeApp({ projectId: firebaseConfig.projectId, storageBucket: bucketName });
    return bucket ||= getStorage(app).bucket(bucketName);
  };

  function matches(url) {
    return /^\/api\/account\/history\/[a-zA-Z0-9-]{16,64}\/images(?:\/(?:before|after))?$/.test(new URL(url, "http://localhost").pathname);
  }

  async function findEntry(uid, historyId) {
    return (await historyStore.history(uid)).find((entry) => entry.id === historyId) || null;
  }

  async function deleteOne(uid, historyId) {
    const target = getBucket();
    await Promise.all(["before", "after"].map((kind) =>
      target.file(objectPath(uid, historyId, kind)).delete({ ignoreNotFound: true })
    ));
  }

  async function deleteHistories(uid, entries) {
    const withImages = entries.filter((entry) => entry?.result?.images?.before || entry?.result?.images?.after);
    for (const entry of withImages) await deleteOne(uid, entry.id);
  }

  async function handle(request) {
    try {
      const access = await authenticate(request);
      const pathname = new URL(request.url, "http://localhost").pathname;
      const match = /^\/api\/account\/history\/([a-zA-Z0-9-]{16,64})\/images(?:\/(before|after))?$/.exec(pathname);
      if (!match) return { status: 404, data: { error: "Not found" } };
      const historyId = validId(match[1]);
      const kind = match[2];
      const entry = await findEntry(access.uid, historyId);
      if (!entry) return { status: 404, data: { error: "履歴が見つかりません。" } };

      if (request.method === "PUT" && !kind) {
        const input = await readJson(request);
        const images = {};
        if (input.before) images.before = parseImage(input.before);
        if (input.after) images.after = parseImage(input.after);
        if (!images.before && !images.after) throw new ImageInputError("保存する画像がありません。");
        const uploaded = [];
        try {
          for (const [imageKind, image] of Object.entries(images)) {
            await getBucket().file(objectPath(access.uid, historyId, imageKind)).save(image.buffer, {
              resumable: false,
              metadata: { contentType: image.contentType, cacheControl: "private, no-store" }
            });
            uploaded.push(imageKind);
          }
          const flags = { before: Boolean(images.before), after: Boolean(images.after) };
          const updated = await historyStore.updateHistory(access.uid, historyId, {
            result: { ...entry.result, images: flags }
          });
          if (!updated) throw new Error("History disappeared during image upload");
          return { status: 200, data: { images: flags } };
        } catch (error) {
          await Promise.allSettled(uploaded.map((imageKind) =>
            getBucket().file(objectPath(access.uid, historyId, imageKind)).delete({ ignoreNotFound: true })
          ));
          throw error;
        }
      }

      if (request.method === "GET" && kind) {
        if (!entry.result?.images?.[kind]) return { status: 404, data: { error: "画像は保存されていません。" } };
        const file = getBucket().file(objectPath(access.uid, historyId, kind));
        const [[body], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
        return {
          status: 200,
          body,
          headers: {
            "Content-Type": metadata.contentType || "application/octet-stream",
            "Content-Length": String(body.length),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff"
          }
        };
      }

      if (request.method === "DELETE" && !kind) {
        await deleteOne(access.uid, historyId);
        const updated = await historyStore.updateHistory(access.uid, historyId, {
          result: { ...entry.result, images: { before: false, after: false } }
        });
        return { status: 200, data: { images: updated?.result?.images || { before: false, after: false } } };
      }

      return { status: 405, data: { error: "Method not allowed" } };
    } catch (error) {
      if (error instanceof ImageInputError || error?.status) return { status: error.status, data: { error: error.message } };
      if (Number(error?.code) === 404) return { status: 404, data: { error: "画像が見つかりません。" } };
      return { status: 503, data: { error: "画像保存に接続できませんでした。Storageの設定・権限を確認してください。" } };
    }
  }

  return { matches, handle, deleteHistories };
}

module.exports = { createImageService, parseImage, objectPath, MAX_IMAGE_BYTES };
