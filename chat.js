const content = document.getElementById("chat-content");
const messages = document.getElementById("chat-messages");
const input = document.getElementById("chat-input");
const status = document.getElementById("chat-status");
const conversation = [];
function addMessage(role, text) { const item = document.createElement("p"); item.className = `chat-message chat-message-${role}`; item.textContent = text; messages.append(item); }
async function sendChat(event) {
  event.preventDefault();
  const text = input.value.trim(); if (!text) return;
  conversation.push({ role: "user", text }); addMessage("user", text); input.value = ""; status.textContent = "回答を生成しています…";
  try { const response = await window.AppAuth.fetch("/api/gemini-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: conversation }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "相談に失敗しました。"); conversation.push({ role: "assistant", text: data.message }); addMessage("assistant", data.message); status.textContent = ""; }
  catch (error) { status.textContent = error.message || "相談に失敗しました。"; }
}
document.getElementById("chat-form").addEventListener("submit", sendChat);
window.addEventListener("app-authorized", () => { content.hidden = false; });
if (window.AppAuth?.uid) content.hidden = false;
