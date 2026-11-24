const { getAuth } = require("firebase-admin/auth");

function createAdminUsersHandler({ authenticate, firestore, auth, inquiries } = {}) {
  return async (request) => {
    const identity = await authenticate(request);
    const url = new URL(request.url, "http://localhost");
    if (request.method !== "GET" || !/^\/api\/admin\/users(?:\/[-A-Za-z0-9_]{1,128})?$/.test(url.pathname)) {
      return { status: 404, data: { error: "Not found" } };
    }
    const detailMatch = /^\/api\/admin\/users\/([-A-Za-z0-9_]{1,128})$/.exec(url.pathname);
    if (detailMatch) {
      const user = await (auth || getAuth()).getUser(detailMatch[1]);
      const privateRef = firestore.collection("users").doc(user.uid).collection("private");
      const [profileSnapshot, settingsSnapshot, historySnapshot, inquiryItems] = await Promise.all([
        privateRef.doc("profile").get(), privateRef.doc("settings").get(), privateRef.doc("history").get(), inquiries ? inquiries.listByUser(user.uid) : []
      ]);
      const history = historySnapshot.data()?.entries || [];
      const inquiryList = inquiryItems || [];
      return { status: 200, data: { user: { uid: user.uid, email: user.email || "", displayName: user.displayName || "", emailVerified: user.emailVerified === true, disabled: user.disabled === true, createdAt: user.metadata.creationTime || null, lastSignInAt: user.metadata.lastSignInTime || null, providerIds: (user.providerData || []).map((provider) => provider.providerId), residencePrefecture: profileSnapshot.data()?.profile?.residencePrefecture || "", hasSettings: settingsSnapshot.exists, historyCount: history.length, lastSimulationAt: history[0]?.savedAt || null, inquiryCount: inquiryList.length, unansweredInquiryCount: inquiryList.filter((item) => item.status !== "answered").length } } };
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 1000);
    const pageToken = url.searchParams.get("pageToken") || undefined;
    const search = (url.searchParams.get("search") || "").trim().toLocaleLowerCase("ja-JP");
    const result = await (auth || getAuth()).listUsers(limit, pageToken);
    const users = await Promise.all(result.users
      .filter((user) => !search || [user.uid, user.email, user.displayName].some((value) => String(value || "").toLocaleLowerCase("ja-JP").includes(search)))
      .map(async (user) => {
        const snapshot = await firestore.collection("users").doc(user.uid).collection("private").doc("profile").get();
        const profile = snapshot.data()?.profile || {};
        return {
          uid: user.uid,
          email: user.email || "",
          displayName: user.displayName || "",
          emailVerified: user.emailVerified === true,
          disabled: user.disabled === true,
          createdAt: user.metadata.creationTime || null,
          lastSignInAt: user.metadata.lastSignInTime || null,
          residencePrefecture: profile.residencePrefecture || ""
        };
      }));
    return { status: 200, data: { users, nextPageToken: result.pageToken || null, requestedBy: identity.email } };
  };
}

module.exports = { createAdminUsersHandler };
