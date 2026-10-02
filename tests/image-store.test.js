const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createImageService, parseImage, objectPath } = require("../image-store");

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function request(method, url, body) {
  const value = new EventEmitter();
  value.method = method;
  value.url = url;
  value.headers = body === undefined ? {} : { "content-type": "application/json" };
  process.nextTick(() => {
    if (body !== undefined) value.emit("data", Buffer.from(JSON.stringify(body)));
    value.emit("end");
  });
  return value;
}

function setup() {
  const objects = new Map();
  const entries = new Map([
    ["owner", [{ id: "history-000000000000", result: { images: { before: false, after: false } } }]],
    ["other", [{ id: "history-111111111111", result: { images: { before: false, after: false } } }]]
  ]);
  const bucket = {
    file(path) {
      return {
        async save(body, options) { objects.set(path, { body, contentType: options.metadata.contentType }); },
        async download() {
          const item = objects.get(path);
          if (!item) throw Object.assign(new Error("missing"), { code: 404 });
          return [item.body];
        },
        async getMetadata() {
          const item = objects.get(path);
          if (!item) throw Object.assign(new Error("missing"), { code: 404 });
          return [{ contentType: item.contentType }];
        },
        async delete() { objects.delete(path); }
      };
    }
  };
  const historyStore = {
    async history(uid) { return entries.get(uid) || []; },
    async updateHistory(uid, id, patch) {
      const list = entries.get(uid) || [];
      const index = list.findIndex((entry) => entry.id === id);
      if (index < 0) return null;
      list[index] = { ...list[index], ...patch };
      return list[index];
    }
  };
  let uid = "owner";
  const service = createImageService({
    authenticate: async () => ({ uid }), historyStore, getBucket: () => bucket
  });
  return { service, objects, entries, setUid(value) { uid = value; } };
}

test("validates image content and creates owner-scoped object paths", () => {
  assert.equal(parseImage(PNG).contentType, "image/png");
  assert.throws(() => parseImage("data:image/png;base64,AAAA"), /内容/);
  assert.throws(() => parseImage("data:image/svg+xml;base64,PHN2Zz4="), /JPEG/);
  assert.equal(objectPath("owner", "history-000000000000", "before"), "users/owner/simulations/history-000000000000/before");
});

test("saves, reads and deletes images only through the authenticated owner", async () => {
  const app = setup();
  const base = "/api/account/history/history-000000000000/images";
  let result = await app.service.handle(request("PUT", base, { before: PNG, after: PNG }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.images, { before: true, after: true });
  assert.equal(app.objects.size, 2);
  assert.deepEqual(app.entries.get("owner")[0].result.images, { before: true, after: true });

  result = await app.service.handle(request("GET", `${base}/after`));
  assert.equal(result.status, 200);
  assert.equal(result.headers["Content-Type"], "image/png");
  assert.ok(Buffer.isBuffer(result.body));

  app.setUid("other");
  result = await app.service.handle(request("GET", `${base}/after`));
  assert.equal(result.status, 404);

  app.setUid("owner");
  result = await app.service.handle(request("DELETE", base));
  assert.equal(result.status, 200);
  assert.equal(app.objects.size, 0);
  assert.deepEqual(app.entries.get("owner")[0].result.images, { before: false, after: false });
});

test("rejects unsupported methods, missing histories and invalid media types", async () => {
  const app = setup();
  assert.equal((await app.service.handle(request("POST", "/api/account/history/history-000000000000/images"))).status, 405);
  assert.equal((await app.service.handle(request("GET", "/api/account/history/history-999999999999/images/before"))).status, 404);
  const bad = request("PUT", "/api/account/history/history-000000000000/images", { before: PNG });
  bad.headers["content-type"] = "text/plain";
  assert.equal((await app.service.handle(bad)).status, 415);
});
