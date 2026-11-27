const { authorizeSensitive } = require("./auth-server");
const { requireAdmin } = require("./clinic-admin");
const { PartnerError } = require("./clinic-partner-service");
function readBody(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || ""))
    throw new PartnerError("JSON形式で送信してください。", 415);
  return new Promise((resolve, reject) => {
    let length = 0,
      chunks = [],
      failed = false;
    request.on("data", (chunk) => {
      length += chunk.length;
      if (length > 65536) {
        failed = true;
        chunks = [];
        reject(new PartnerError("入力が大きすぎます。", 413));
      }
      if (!failed) chunks.push(chunk);
    });
    request.on("end", () => {
      if (failed) return;
      try {
        const b = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!b || typeof b !== "object" || Array.isArray(b)) throw Error();
        resolve(b);
      } catch {
        reject(new PartnerError("入力形式を確認してください。"));
      }
    });
    request.on("error", reject);
    request.on("aborted", () =>
      reject(new PartnerError("通信が中断されました。")),
    );
  });
}
function createPartnerHandler({
  service,
  authenticate = authorizeSensitive,
  adminAuthenticate = (request) => requireAdmin(request, authenticate),
}) {
  return async (request) => {
    try {
      const url = new URL(request.url, "http://localhost"),
        p = url.pathname;
      let data;
      if (p.startsWith("/api/admin/clinic-partners")) {
        const admin = await adminAuthenticate(request);
        if (p === "/api/admin/clinic-partners/clinics" && request.method === "GET")
          return {status: 200, data: {clinics: await service.registeredClinics(url.searchParams.get("keyword") || "")}};
        if (
          p === "/api/admin/clinic-partners" &&
          request.method === "GET" &&
          !url.search
        )
          return {
            status: 200,
            data: { applications: await service.applications() },
          };
        const match =
          /^\/api\/admin\/clinic-partners\/([a-zA-Z0-9_-]{1,128})$/.exec(p);
        if (match && request.method === "PATCH" && !url.search)
          return {
            status: 200,
            data: await service.review(
              admin,
              match[1],
              await readBody(request),
            ),
          };
        return { status: 404, data: { error: "Not found" } };
      }
      const identity = await authenticate(request),
        method = request.method;
      if (method === "GET" && p === "/api/partner/session")
        data = await service.session(identity.uid);
      else if (method === "POST" && p === "/api/partner/apply")
        data = await service.apply(identity, await readBody(request));
      else if (method === "PUT" && p === "/api/partner/settings")
        data = await service.settings(identity.uid, await readBody(request));
      else if (method === "GET" && p === "/api/partner/schedule")
        data = await service.month(identity.uid, url.searchParams.get("month"));
      else if (method === "PUT" && p === "/api/partner/slots")
        data = await service.close(identity.uid, await readBody(request));
      else if (
        method === "GET" &&
        /^\/api\/partner\/patients\/[a-zA-Z0-9_-]{1,128}$/.test(p)
      )
        data = await service.patient(
          identity.uid,
          p.split("/").at(-1),
          url.searchParams.get("cursor"),
        );
      else if (
        method === "POST" &&
        /^\/api\/partner\/patients\/[a-zA-Z0-9_-]{1,128}\/records$/.test(p)
      )
        data = await service.record(
          identity.uid,
          p.split("/").at(-2),
          await readBody(request),
        );
      else if (
        method === "PATCH" &&
        /^\/api\/partner\/bookings\/[a-zA-Z0-9_-]{1,128}$/.test(p)
      )
        data = await service.changeStatus(
          identity,
          p.split("/").at(-1),
          (await readBody(request)).status,
          true,
        );
      else if (method === "GET" && p === "/api/reservations/availability")
        data = await service.availability(
          identity,
          url.searchParams.get("clinic"),
          url.searchParams.get("date"),
          url.searchParams.get("service"),
        );
      else if (method === "GET" && p === "/api/reservations/profile")
        data = { profile: await service.patientProfile(identity.uid) };
      else if (method === "PUT" && p === "/api/reservations/profile")
        data = await service.savePatientProfile(
          identity.uid,
          await readBody(request),
        );
      else if (method === "GET" && p === "/api/reservations")
        data = await service.mine(identity.uid, url.searchParams.get("cursor"));
      else if (method === "POST" && p === "/api/reservations")
        data = await service.book(
          identity,
          await readBody(request),
          request.headers["idempotency-key"],
        );
      else if (
        method === "PATCH" &&
        /^\/api\/reservations\/[a-zA-Z0-9_-]{1,128}\/consent$/.test(p)
      )
        data = await service.consent(
          identity.uid,
          p.split("/").at(-2),
          (await readBody(request)).shareHistory,
        );
      else if (
        method === "PATCH" &&
        /^\/api\/reservations\/[a-zA-Z0-9_-]{1,128}$/.test(p)
      )
        data = await service.changeStatus(
          identity,
          p.split("/").at(-1),
          "cancelled",
          false,
        );
      else return { status: 404, data: { error: "Not found" } };
      return { status: method === "POST" ? 201 : 200, data };
    } catch (error) {
      if (error instanceof PartnerError || [401, 403].includes(error.status))
        return { status: error.status, data: { error: error.message } };
      return {
        status: 503,
        data: {
          error:
            "予約サービスに接続できません。時間をおいて再試行してください。",
        },
      };
    }
  };
}
module.exports = { createPartnerHandler, readBody };
