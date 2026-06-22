const BACKEND = window.BACKEND || "http://localhost:8000";

const form        = document.getElementById("chat-form");
const input       = document.getElementById("user-input");
const sendBtn     = document.getElementById("send-btn");
const clearBtn    = document.getElementById("clear-btn");
const transcript  = document.getElementById("transcript");
const statusDot   = document.getElementById("status-dot");

function setStatus(state) {
  statusDot.className = `dot ${state}`;
  statusDot.title = state;
}

function addBubble(role, text = "") {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  transcript.appendChild(div);
  transcript.scrollTop = transcript.scrollHeight;
  return div;
}

window.sendMessage = async function sendMessage(text) {
  addBubble("user", text);
  const replyBubble = addBubble("assistant");
  replyBubble.classList.add("streaming");

  sendBtn.disabled = true;
  input.disabled   = true;
  setStatus("thinking");

  try {
    const res = await fetch(`${BACKEND}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    setStatus("speaking");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      replyBubble.textContent = accumulated;
      transcript.scrollTop = transcript.scrollHeight;
    }

    replyBubble.classList.remove("streaming");
  } catch (err) {
    replyBubble.textContent = `Error: ${err.message}`;
    replyBubble.classList.remove("streaming");
  } finally {
    setStatus("idle");
    sendBtn.disabled = false;
    input.disabled   = false;
    input.focus();
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  sendMessage(text);
});

clearBtn.addEventListener("click", async () => {
  transcript.innerHTML = "";
  await fetch(`${BACKEND}/history`, { method: "DELETE" }).catch(() => {});
});
