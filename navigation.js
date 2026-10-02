(() => {
  const container = document.getElementById("common-navigation");
  if (!container) return;

  const nav = document.createElement("nav");
  nav.className = "common-navigation";
  nav.setAttribute("aria-label", "メインナビゲーション");

  const list = document.createElement("ul");
  list.className = "common-navigation__links";
  const links = [
    { href: "login.html", label: "ログイン" },
    { href: "app.html#input-title", label: "シミュレーション" },
    { href: "app.html#history-title", label: "履歴" },
    { href: "app.html#clinic-title", label: "クリニック" },
    { href: "app.html#auth-title", label: "アカウント" }
  ];

  const navigationLinks = [];
  for (const { href, label } of links) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    navigationLinks.push(link);
    item.append(link);
    list.append(item);
  }

  nav.append(list);
  const account = document.createElement("div");
  account.className = "common-navigation__account";
  const email = document.createElement("span");
  email.className = "common-navigation__email";
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "sub-button";
  logout.textContent = "ログアウト";
  logout.addEventListener("click", () => window.AppAuth?.logout());
  account.append(email, logout);
  nav.append(account);
  container.replaceChildren(nav);

  function updateAccount() {
    const auth = window.AppAuth;
    account.hidden = !auth?.signedIn;
    email.textContent = auth?.signedIn ? `ログイン中：${auth.email}` : "";
    logout.disabled = !auth?.signedIn || auth.busy;
    logout.textContent = auth?.busy ? "処理中…" : "ログアウト";
  }
  window.addEventListener("auth-state-changed", updateAccount);
  updateAccount();

  function updateCurrentPage() {
    const pageLinks = navigationLinks.filter((link) =>
      new URL(link.href, location.href).pathname === location.pathname
    );
    // The app opens at simulation when no known section is specified.
    const current = pageLinks.find((link) =>
      new URL(link.href, location.href).hash === location.hash
    ) || pageLinks[0];
    for (const link of navigationLinks) {
      if (link === current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
  }

  // Authentication reveals the app asynchronously, after native fragment scrolling.
  function focusDestination() {
    const destination = links.find(({ href }) =>
      new URL(href, location.href).pathname === location.pathname &&
      new URL(href, location.href).hash === location.hash
    );
    if (!destination || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target || target.closest("[hidden]")) return;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start" });
  }

  window.addEventListener("hashchange", focusDestination);
  window.addEventListener("hashchange", updateCurrentPage);
  window.addEventListener("app-authorized", focusDestination);
  // Clicking the current fragment again should also return to its heading.
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link && link.href === location.href) focusDestination();
  });
  updateCurrentPage();
  focusDestination();
})();
