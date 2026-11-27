import "./plan-policy.js";
const content = document.getElementById("chat-content");
const messages = document.getElementById("chat-messages");
const input = document.getElementById("chat-input");
const imageInput = document.getElementById("chat-image");
const status = document.getElementById("chat-status");
const conversation = [];
content.hidden = false;
const accessNote = document.createElement("p"); accessNote.id = "chat-access-note"; content.querySelector("section")?.insertBefore(accessNote, messages);
function updateAccess() { const planType = window.PlanPolicy?.currentPlanType?.() || "free"; const plan = window.PlanPolicy?.getPlanPolicy?.(planType); const allowed = Boolean(plan?.chatLimit); accessNote.textContent = allowed ? `現在のプラン：${planType === "trial" ? "無料トライアル" : planType === "annual" ? "年額プラン" : "月額プラン"}` : "無料プランではチャット相談を利用できません。プラン変更から有料プランを選択してください。"; input.disabled = !allowed; imageInput.disabled = !allowed; document.querySelector("#chat-form button")?.toggleAttribute("disabled", !allowed); }
function addMessage(role, text) { const item = document.createElement("p"); item.className = `chat-message chat-message-${role}`; item.textContent = text; messages.append(item); }
function readImage() { const file = imageInput.files?.[0]; return file ? new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : Promise.resolve(null); }
async function sendChat(event) {
  event.preventDefault();
  const text = input.value.trim(); if (!text) return;
  const planType = window.PlanPolicy?.currentPlanType?.() || "free";
  const plan = window.PlanPolicy?.getPlanPolicy?.(planType);
  const usage = window.PlanPolicy?.getUsage?.(planType);
  if (!plan || !window.PlanPolicy.consumeChat(planType)) { status.textContent = plan?.chatLimit === 0 ? "チャット相談は有料プランまたは無料トライアルで利用できます。" : `今月のチャット相談回数（${plan.chatLimit}回）を使い切りました。`; return; }
  const image = await readImage();
  conversation.push({ role: "user", text }); addMessage("user", image ? `${text}\n（顔画像を添付）` : text); input.value = ""; imageInput.value = ""; status.textContent = "回答を生成しています…";
  try { const response = await window.AppAuth.fetch("/api/gemini-chat", { method: "POST", headers: { "Content-Type": "application/json", "X-Meylon-Plan": planType }, body: JSON.stringify({ messages: conversation, image }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "相談に失敗しました。"); conversation.push({ role: "assistant", text: data.message }); addMessage("assistant", data.message); status.textContent = ""; }
  catch (error) { status.textContent = error.message || "相談に失敗しました。"; }
}
document.getElementById("chat-form").addEventListener("submit", sendChat);
window.addEventListener("app-authorized", updateAccess); window.addEventListener("storage", updateAccess); updateAccess();
