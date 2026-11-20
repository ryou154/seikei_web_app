const list = document.getElementById("inquiry-list");
const message = document.getElementById("inquiry-status-message");
const statusSelect = document.getElementById("inquiry-status");
const categorySelect = document.getElementById("inquiry-category");
const sortSelect = document.getElementById("inquiry-sort");
let initialized = false;
let categoryLabels = {};

function setMessage(value, isError = false) {
  message.textContent = value;
  message.classList.toggle("is-error", isError);
}

function render(items) {
  list.replaceChildren();
  if (!items.length) {
    list.textContent = "該当する問い合わせはありません。";
    return;
  }

  const direction = sortSelect.value === "newest" ? -1 : 1;
  const sorted = [...items].sort((a, b) => direction * String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const item of sorted) {
    const card = document.createElement("article");
    card.className = "inquiry-card";
    card.innerHTML = `
      <div class="inquiry-card-head">
        <div><span class="inquiry-category"></span><strong></strong></div>
        <span class="inquiry-date"></span>
      </div>
      <p class="inquiry-email"></p>
      <p class="inquiry-message"></p>
      <label class="inquiry-response-label">管理者からの回答
        <textarea class="inquiry-response" rows="5" maxlength="4000"></textarea>
      </label>
      <div class="inquiry-actions">
        <button class="inquiry-save" type="button">回答して完了</button>
        <button class="sub-button inquiry-reopen" type="button">未回答に戻す</button>
      </div>`;

    card.querySelector("strong").textContent = item.subject;
    card.querySelector(".inquiry-category").textContent = categoryLabels[item.category] || "その他";
    card.querySelector(".inquiry-date").textContent = new Date(item.createdAt).toLocaleString("ja-JP");
    card.querySelector(".inquiry-email").textContent = item.email;
    card.querySelector(".inquiry-message").textContent = item.message;
    const responseField = card.querySelector(".inquiry-response");
    responseField.value = item.response || "";
    const saveButton = card.querySelector(".inquiry-save");
    const reopenButton = card.querySelector(".inquiry-reopen");
    saveButton.textContent = item.status === "answered" ? "回答を更新" : "回答して完了";
    reopenButton.hidden = item.status !== "answered";

    async function update(payload) {
      saveButton.disabled = true;
      reopenButton.disabled = true;
      try {
        const apiResponse = await window.AppAuth.fetch(`/api/admin/inquiries/${encodeURIComponent(item.id)}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        const data = await apiResponse.json().catch(() => ({}));
        if (!apiResponse.ok) throw new Error(data.error || "更新できませんでした。");
        setMessage("問い合わせを更新しました。");
        await load();
      } catch (error) {
        setMessage(error.message || "更新できませんでした。", true);
      } finally {
        saveButton.disabled = false;
        reopenButton.disabled = false;
      }
    }

    saveButton.addEventListener("click", () => update({ status: "answered", response: responseField.value }));
    reopenButton.addEventListener("click", () => update({ status: "unanswered", response: responseField.value }));
    list.append(card);
  }
}

async function load() {
  try {
    const query = new URLSearchParams({ status: statusSelect.value, category: categorySelect.value });
    const response = await window.AppAuth.fetch(`/api/admin/inquiries?${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "読み込めませんでした。");
    categoryLabels = data.categories || {};
    render(data.inquiries || []);
    if (!message.classList.contains("is-error")) setMessage("");
  } catch (error) {
    setMessage(error.message || "読み込めませんでした。", true);
  }
}

async function initialize() {
  if (initialized || !window.AppAuth?.uid) return;
  initialized = true;
  try {
    const response = await window.AppAuth.fetch("/api/admin/session");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.admin !== true) throw new Error(data.error || "管理者権限がありません。");
    document.body.style.visibility = "visible";
    await load();
  } catch {
    initialized = false;
    location.replace("/login.html");
  }
}

statusSelect.addEventListener("change", () => { if (initialized) void load(); });
categorySelect.addEventListener("change", () => { if (initialized) void load(); });
sortSelect.addEventListener("change", () => { if (initialized) void load(); });
window.addEventListener("app-authorized", initialize);
if (window.AppAuth?.uid) void initialize();
