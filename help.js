const form = document.getElementById("contact-form");
const status = document.getElementById("contact-status");
const history = document.getElementById("contact-history");
const categoryLabels = {
  operation: "使い方",
  simulation: "シミュレーション",
  account: "アカウント",
  billing: "料金・プラン",
  clinic: "クリニック情報",
  bug: "不具合",
  other: "その他"
};

function renderHistory(items) {
  history.replaceChildren();
  if (!items.length) {
    history.textContent = "送信済みの問い合わせはありません。";
    return;
  }

  for (const item of items) {
    const article = document.createElement("article");
    article.className = "contact-history-item";
    article.innerHTML = `
      <div class="contact-history-head"><span class="contact-history-category"></span><span class="contact-history-status"></span></div>
      <h3></h3>
      <time></time>
      <p class="contact-history-message"></p>
      <div class="contact-history-response" hidden><strong>運営からの回答</strong><p></p></div>`;
    article.querySelector(".contact-history-category").textContent = categoryLabels[item.category] || "その他";
    const statusBadge = article.querySelector(".contact-history-status");
    statusBadge.textContent = item.status === "answered" ? "回答済み" : "確認中";
    statusBadge.classList.toggle("is-answered", item.status === "answered");
    article.querySelector("h3").textContent = item.subject;
    const time = article.querySelector("time");
    time.dateTime = item.createdAt;
    time.textContent = new Date(item.createdAt).toLocaleString("ja-JP");
    article.querySelector(".contact-history-message").textContent = item.message;
    const responseBox = article.querySelector(".contact-history-response");
    if (item.response) {
      responseBox.hidden = false;
      responseBox.querySelector("p").textContent = item.response;
    }
    history.append(article);
  }
}

async function loadHistory() {
  if (!window.AppAuth?.uid) return;
  try {
    const response = await window.AppAuth.fetch("/api/contact");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "履歴を読み込めませんでした。");
    renderHistory(data.inquiries || []);
  } catch (error) {
    history.textContent = error.message || "履歴を読み込めませんでした。";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  status.textContent = "送信しています…";
  try {
    const response = await window.AppAuth.fetch("/api/contact", {
      method: "POST",
      body: JSON.stringify({
        category: document.getElementById("contact-category").value,
        subject: document.getElementById("contact-subject").value,
        message: document.getElementById("contact-message").value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "送信できませんでした。");
    form.reset();
    status.textContent = "お問い合わせを送信しました。回答はこの画面で確認できます。";
    await loadHistory();
  } catch (error) {
    status.textContent = error.message || "送信できませんでした。";
  } finally {
    button.disabled = false;
  }
});

window.addEventListener("app-authorized", loadHistory);
if (window.AppAuth?.uid) void loadHistory();
