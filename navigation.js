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
    { href: "app.html", label: "シミュレーション" }
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
})();
