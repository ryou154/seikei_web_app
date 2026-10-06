(() => {
  const container = document.getElementById("common-navigation");
  if (!container) return;

  const nav = document.createElement("nav");
  nav.className = "common-navigation";
  nav.setAttribute("aria-label", "メインナビゲーション");

  const logoLink = document.createElement("a");
  logoLink.className = "common-navigation__logo";
  logoLink.href = "/home.html";
  logoLink.setAttribute("aria-label", "ホームへ");
  const logo = document.createElement("img");
  logo.src = "ロゴ.png";
  logo.alt = "MEYLON ロゴ";
  logoLink.append(logo);
  nav.append(logoLink);

  const list = document.createElement("ul");
  list.className = "common-navigation__links";
  const links = [
    { href: "/home.html", label: "ホーム" },
    { href: "/login.html", label: "ログイン" },
    { href: "/app.html#input-title", label: "シミュレーション" },
    { href: "/app.html#history-title", label: "履歴" },
    { href: "/app.html#clinic-title", label: "クリニック" },
    { href: "/mypage.html", label: "マイページ" }
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
    email.textContent = auth?.signedIn ? (auth.displayName || auth.email) : "";
    logout.disabled = !auth?.signedIn || auth.busy;
    logout.textContent = auth?.busy ? "処理中…" : "ログアウト";
  }
  window.addEventListener("auth-state-changed", updateAccount);
  window.addEventListener("profile-updated", updateAccount);
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

  // The shared menu stays outside the animated content container.
  const pageContent = document.getElementById("page-transition-content");
  let activeSlide;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  // Hashes identify menu destinations; every navigation opens at the top.
  window.history.scrollRestoration = "manual";

  function stopSlide() {
    activeSlide?.cancel();
    activeSlide = undefined;
  }

  function showPage(animate = true) {
    stopSlide();
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    const heading = document.querySelector(".app-header h1") || pageContent;
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
    updateCurrentPage();
    if (animate && !reducedMotion?.matches && pageContent?.animate) {
      activeSlide = pageContent.animate([
        { transform: "translateX(100vw)" },
        { transform: "translateX(0)" }
      ], { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }
  }

  // Prevent native anchor scrolling before it jumps to a lower section.
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || event.defaultPrevented || event.button !== 0 ||
        event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const destination = new URL(link.href, location.href);
    if (destination.origin !== location.origin || destination.pathname !== location.pathname) return;
    event.preventDefault();
    if (destination.href !== location.href) window.history.pushState(null, "", destination.href);
    showPage();
  });
  window.addEventListener("hashchange", () => showPage());
  window.addEventListener("popstate", () => showPage());
  window.addEventListener("pageshow", () => {
    showPage();
    // Follow the browser's initial fragment/restored-position handling.
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
  });
  window.addEventListener("app-authorized", () => showPage());
  window.addEventListener("auth-state-changed", stopSlide);
  reducedMotion?.addEventListener("change", stopSlide);
  showPage(false);
})();

