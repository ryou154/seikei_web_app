import "./plan-policy.js";
const content = document.getElementById("chat-content");
const messages = document.getElementById("chat-messages");
const input = document.getElementById("chat-input");
const imageInput = document.getElementById("chat-image");
const status = document.getElementById("chat-status");
const conversation = [];
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
  const selectedPlan = localStorage.getItem("seikei-selected-plan"); const planType = selectedPlan === "月額プラン" ? "monthly" : selectedPlan === "年額プラン" ? "annual" : (window.PlanPolicy.currentPlanType() === "trial" ? "trial" : "free");
  try { const response = await window.AppAuth.fetch("/api/gemini-chat", { method: "POST", headers: { "Content-Type": "application/json", "X-Meylon-Plan": planType }, body: JSON.stringify({ messages: conversation, image }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "相談に失敗しました。"); conversation.push({ role: "assistant", text: data.message }); addMessage("assistant", data.message); status.textContent = ""; }
  catch (error) { status.textContent = error.message || "相談に失敗しました。"; }
}
document.getElementById("chat-form").addEventListener("submit", sendChat);
window.addEventListener("app-authorized", () => { content.hidden = false; });
if (window.AppAuth?.uid) content.hidden = false;
