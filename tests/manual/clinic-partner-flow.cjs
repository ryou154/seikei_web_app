// Isolated browser test fixture. No Firebase credentials or production database access.
const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const { database } = require("../helpers/clinic-partner-memory");
const {
  createPartnerService,
  today,
  shift,
} = require("../../clinic-partner-service");
const { createPartnerHandler } = require("../../clinic-partner-api");
async function main() {
  const db = database(),
    service = createPartnerService(db),
    root = path.resolve(__dirname, "../..");
  db.values.set("clinics/test-clinic", {
    name: "検証用クリニック（テスト専用）",
    address: "架空の住所",
    officialUrl: "https://example.com",
    publicationStatus: "published",
  });
  await service.apply(
    { uid: "test-staff", email: "staff@example.com" },
    {
      clinicName: "検証用クリニック",
      name: "テスト担当者",
      phone: "0300000000",
      officialUrl: "https://example.com",
    },
  );
  await service.review({ uid: "test-admin" }, "test-staff", {
    status: "approved",
    clinicId: "test-clinic",
    confirmed: true,
  });
  await service.settings("test-staff", {
    enabled: true,
    start: "10:00",
    end: "19:00",
    closedWeekdays: [],
    closedDates: [],
    services: [{ id: "consult", name: "カウンセリング", duration: 60 }],
  });
  await service.savePatientProfile("test-patient", {
    name: "テスト利用者（架空）",
    phone: "09000000000",
    history: [
      {
        id: "test-record",
        date: shift(today(), -30),
        procedure: "テスト施術",
        clinicName: "テスト他院",
        note: "画面動作確認用の架空の記録",
      },
    ],
  });
  const handler = createPartnerHandler({
    service,
    authenticate: async (request) => {
      const value = request.headers.authorization;
      if (!["Bearer test-staff", "Bearer test-patient"].includes(value))
        throw Object.assign(Error("テスト用認証が必要です"), { status: 401 });
      const uid = value.slice(7);
      return { uid, email: uid + "@example.com" };
    },
    adminAuthenticate: async () => {
      throw Object.assign(Error("Fixture admin disabled"), { status: 403 });
    },
  });
  const files = new Set([
    "/clinic-partner.html",
    "/clinic-partner.js",
    "/clinic-reservation.html",
    "/clinic-reservation.js",
    "/clinic-partner-shared.js",
    "/clinic-portal-demo.css",
    "/clinic-booking-demo.css",
    "/clinic-partner-auth-demo.css",
  ]);
  http
    .createServer(async (req, res) => {
      try {
        const url = new URL(req.url, "http://localhost");
        if (url.pathname.startsWith("/api/")) {
          const result = await handler(req);
          res.writeHead(result.status, {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify(result.data));
          return;
        }
        if (url.pathname === "/auth-core.js") {
          res.writeHead(200, { "Content-Type": "text/javascript" });
          res.end(
            `const uid=document.body.dataset.clinicAuth==='private'?'test-staff':'test-patient';document.getElementById('app-content').hidden=false;document.getElementById('auth-status').textContent='隔離テスト環境（実データ未接続）';window.AppAuth={uid,email:uid+'@example.com',ready:Promise.resolve(true),logout:async()=>{},fetch:(url,options={})=>{const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+uid);return fetch(url,{...options,headers});}};`,
          );
          return;
        }
        if (!files.has(url.pathname)) {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const file = path.join(root, url.pathname);
        res.writeHead(200, {
          "Content-Type": file.endsWith(".html")
            ? "text/html; charset=utf-8"
            : file.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/javascript; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(fs.readFileSync(file));
      } catch (e) {
        res.writeHead(500);
        res.end("Fixture error");
      }
    })
    .listen(3015, "127.0.0.1", () =>
      console.log(
        "Isolated fixture: http://127.0.0.1:3015/clinic-reservation.html?clinic=test-clinic",
      ),
    );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
