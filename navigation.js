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

  for (const { href, label } of links) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    item.append(link);
    list.append(item);
  }

  nav.append(list);
  container.replaceChildren(nav);

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
  window.addEventListener("app-authorized", focusDestination);
  // Clicking the current fragment again should also return to its heading.
  nav.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (link && link.href === location.href) focusDestination();
  });
  focusDestination();
})();
