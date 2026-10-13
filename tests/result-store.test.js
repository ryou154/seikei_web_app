const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { normalizeResult } = require("../account-store");
const { createImageService } = require("../image-store");

test("normalizes result metadata and ignores client-supplied image flags", () => {
  const value = normalizeResult({
    beforeScore: 82, afterScore: 88, analysis: " 分析 ", clinicNames: ["院A"],
    generationModel: "gemini-image", generationStatus: "gemini",
    adjustments: [{ part: " 目元 ", change: " 二重幅を強調 " }],
    adjustmentStrength: { value: 60, label: " 標準 " },
    relatedProcedures: [{ part: "目元", examples: ["二重整形など"] }],
    images: { before: true, after: true }
  });
  assert.deepEqual(value, {
    beforeScore: 82, afterScore: 88, analysis: "分析", clinicNames: ["院A"],
    generationModel: "gemini-image", generationStatus: "gemini",
    adjustments: [{ part: "目元", change: "二重幅を強調" }],
    adjustmentStrength: { value: 60, label: "標準" },
    relatedProcedures: [{ part: "目元", examples: ["二重整形など"] }],
    images: { before: false, after: false }
  });
  assert.throws(() => normalizeResult({ beforeScore: 101 }), /スコア/);
  assert.throws(() => normalizeResult({ clinicNames: Array(6).fill("院") }), /5件/);
  assert.throws(() => normalizeResult({ generationStatus: "forged" }), /生成状態/);
  assert.throws(() => normalizeResult({ adjustments: Array(7).fill({ part: "目", change: "変更" }) }), /調整内容/);
  assert.throws(() => normalizeResult({ adjustmentStrength: { value: 101, label: "強" } }), /調整の強さ/);
});

test("image routes authenticate before reading history or Storage", async () => {
  const denied = createImageService({
    authenticate: async () => { throw Object.assign(new Error("ログインしてください。"), { status: 401 }); },
    historyStore: { history: async () => assert.fail("must authenticate first") },
    getBucket: () => assert.fail("must authenticate first")
  });
  const request = new EventEmitter();
  request.method = "GET";
  request.url = "/api/account/history/history-000000000000/images/before";
  request.headers = {};
  const result = await denied.handle(request);
  assert.equal(result.status, 401);
});

test("image route matcher accepts only the dedicated history image endpoints", () => {
  const service = createImageService({
    authenticate: async () => ({ uid: "owner" }),
    historyStore: { history: async () => [] },
    getBucket: () => ({})
  });
  assert.equal(service.matches("/api/account/history/history-000000000000/images/after"), true);
  assert.equal(service.matches("/image-store.js"), false);
  assert.equal(service.matches("/api/account/history/history-000000000000"), false);
});
