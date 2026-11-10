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
  logo.src = "ロゴ最新版.png";
  logo.alt = "MEYLON ロゴ";
  logoLink.append(logo);
  nav.append(logoLink);

  const list = document.createElement("ul");
  list.className = "common-navigation__links";
  const links = [
    { href: "/login.html", label: "ログイン" },
    { href: "/home.html", label: "ホーム" },
    { href: "/app.html#input-title", label: "シミュレーション" },
    { href: "/history.html", label: "履歴" },
    { href: "/app.html#clinic-title", label: "クリニック" },
    { href: "/admin-clinics.html", label: "管理" }
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
  const accountTrigger = document.createElement("button");
  accountTrigger.type = "button";
  accountTrigger.className = "common-navigation__account-trigger";
  accountTrigger.setAttribute("aria-haspopup", "true");
  accountTrigger.setAttribute("aria-expanded", "false");
  const avatar = document.createElement("span");
  avatar.className = "common-navigation__avatar";
  avatar.setAttribute("aria-hidden", "true");
  const email = document.createElement("span");
  email.className = "common-navigation__email";
  accountTrigger.append(avatar, email);
  const menu = document.createElement("div");
  menu.className = "common-navigation__account-menu";
  const mypage = document.createElement("a");
  mypage.href = "/mypage.html";
  mypage.textContent = "マイページ";
  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "common-navigation__logout";
  logout.textContent = "ログアウト";
  logout.addEventListener("click", () => window.AppAuth?.logout());
  menu.append(mypage, logout);
  account.append(accountTrigger, menu);
  nav.append(account);
  container.replaceChildren(nav);

  function updateAccount() {
    const auth = window.AppAuth;
    account.hidden = !auth?.signedIn;
    const accountName = auth?.signedIn ? (auth.displayName || auth.email || "ユーザー") : "";
    email.textContent = accountName.length > 18 ? `${accountName.slice(0, 18)}…` : accountName;
    avatar.textContent = "";
    let savedIcon = "";
    try { savedIcon = auth?.uid ? localStorage.getItem(`meylon-profile-icon:${auth.uid}`) || "" : ""; } catch {}
    if (savedIcon) {
      const image = document.createElement("img");
      image.src = savedIcon;
      image.alt = "";
      avatar.append(image);
    } else {
      avatar.textContent = accountName.trim().charAt(0).toUpperCase() || "U";
    }
    logout.disabled = !auth?.signedIn || auth.busy;
    logout.textContent = auth?.busy ? "処理中…" : "ログアウト";
  }
  window.addEventListener("auth-state-changed", updateAccount);
  window.addEventListener("profile-updated", updateAccount);
  window.addEventListener("storage", (event) => {
    if (!event.key || event.key.startsWith("meylon-profile-icon:")) updateAccount();
  });
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
  const isHelpPage = location.pathname.endsWith("/help.html");
  const isAdminPage = location.pathname.includes("/admin") || location.pathname.endsWith("/admin-clinics.html");
  let hasPaidPlan = false;
  try {
    hasPaidPlan = ["スタンダード", "プレミアム"].includes(localStorage.getItem("seikei-selected-plan"));
  } catch {}
  const isHomePage = location.pathname.endsWith("/home.html");
  if (!isHelpPage && !isAdminPage && !isHomePage) {
    const prompts = document.createElement("div");
    prompts.className = "navigation-prompts";
    if (!hasPaidPlan) {
      const plan = document.createElement("a");
      plan.className = "navigation-prompt navigation-plan-prompt";
      plan.href = "/home.html?open=plans#plans-title";
      plan.innerHTML = "有料プランは<br>いかがですか？ <b aria-hidden=\"true\">→</b>";
      prompts.append(plan);
    }
    const help = document.createElement("a");
    help.className = "navigation-prompt navigation-help-prompt";
    help.href = "/help.html";
    help.setAttribute("aria-label", "ヘルプを開く");
    help.innerHTML = "？<span>ヘルプ</span>";
    prompts.append(help);
    document.body.append(prompts);
  }
  showPage(false);
})();

