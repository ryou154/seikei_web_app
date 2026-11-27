const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require.resolve("../auth-core.js"), "utf8");
async function navigate(pathname, mode) {
  const destinations = [];
  const context = vm.createContext({
    document: {body: {dataset: {clinicAuth: mode}}, getElementById: () => null},
    location: {pathname, replace: url => destinations.push(url)},
    window: {dispatchEvent() {}}, Event: class {},
  });
  vm.runInContext(source.slice(0, source.indexOf("\ntry {")), context);
  await vm.runInContext('auth = {currentUser: {uid: "verified-user", emailVerified: true}}; authorizeUser = async () => ({uid: "verified-user"}); checkSession(auth.currentUser);', context);
  return destinations;
}
test("clinic sign-in and restored sessions go to the clinic portal, including legacy markup", async () => {
  assert.deepEqual(await navigate("/clinic-partner-login.html", "public"), ["/clinic-partner.html"]);
  assert.deepEqual(await navigate("/clinic-partner-login.html"), ["/clinic-partner.html"]);
});
test("clinic registration stays open and regular users retain their home destination", async () => {
  assert.deepEqual(await navigate("/clinic-partner-register.html", "public"), []);
  assert.deepEqual(await navigate("/login.html"), ["/home.html"]);
  assert.deepEqual(await navigate("/clinic-partner.html", "private"), []);
});
