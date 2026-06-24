const BACKEND    = window.BACKEND    || "http://localhost:8000";
const WS_BACKEND = window.WS_BACKEND || "ws://localhost:8000";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("user-input");
const sendBtn    = document.getElementById("send-btn");
const clearBtn   = document.getElementById("clear-btn");
const transcript = document.getElementById("transcript");
const statusDot  = document.getElementById("status-dot");

const player = new AudioPlayer();
const avatar = document.getElementById("avatar-canvas") ? new Avatar("avatar-canvas") : null;

// Initialize persona picker; on change, update avatar colors and reset history
PersonaPicker.init();
PersonaPicker.onChange((_key, personaData) => {
  if (avatar) avatar.setColors(personaData.avatar);
  transcript.innerHTML = "";
  player.stop();
  avatar?.setState("idle");
  fetch(`${BACKEND}/history`, { method: "DELETE" }).catch(() => {});
  setStatus("idle");
});

let _latencyTimer = null;
function showLatency(ms) {
  const badge = document.getElementById("latency-badge");
  if (!badge) return;
  badge.textContent = `${(ms / 1000).toFixed(2)}s`;
  badge.classList.add("visible");
  clearTimeout(_latencyTimer);
  _latencyTimer = setTimeout(() => badge.classList.remove("visible"), 3000);
}

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

function setInputLocked(locked) {
  sendBtn.disabled = locked;
  input.disabled   = locked;
  const micBtn = document.getElementById("mic-btn");
  if (micBtn) micBtn.disabled = locked;
}

window.sendMessage = async function sendMessage(text) {
  addBubble("user", text);
  const replyBubble = addBubble("assistant");
  replyBubble.classList.add("streaming");

  setInputLocked(true);
  setStatus("thinking");

  const ws = new WebSocket(`${WS_BACKEND}/ws/chat`);
  ws.binaryType = "arraybuffer";

  let accumulated = "";

  player.onPlaybackStart(() => {
    if (window._turnStart) {
      const ms = Date.now() - window._turnStart;
      window._turnStart = 0;
      showLatency(ms);
      console.info(`Latency (mic-stop → first audio): ${ms} ms`);
    }
    setStatus("speaking");
    avatar?.setState("speaking");
  });
  player.onPlaybackEnd(() => {
    if (!replyBubble.classList.contains("streaming")) {
      setStatus("idle");
      avatar?.setState("idle");
    }
  });

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "chat", text, persona: PersonaPicker.current() }));
  };

  ws.onmessage = async (event) => {
    if (event.data instanceof ArrayBuffer) {
      await player.enqueueWav(event.data.slice(0));
      return;
    }

    const msg = JSON.parse(event.data);

    if (msg.type === "config") {
      player.setSampleRate(msg.sampleRate);
      if (avatar && player.getAnalyser()) avatar.setAnalyser(player.getAnalyser());

    } else if (msg.type === "token") {
      if (statusDot.title === "thinking") setStatus("thinking");
      accumulated += msg.text;
      replyBubble.textContent = accumulated;
      transcript.scrollTop = transcript.scrollHeight;

    } else if (msg.type === "done") {
      replyBubble.classList.remove("streaming");
      ws.close();
      setInputLocked(false);
      input.focus();
      // fallback: if no audio was generated, reset avatar immediately
      if (avatar) setTimeout(() => avatar.setState("idle"), 100);

    } else if (msg.type === "error") {
      replyBubble.textContent = `Error: ${msg.message}`;
      replyBubble.classList.remove("streaming");
      ws.close();
      setInputLocked(false);
      setStatus("idle");
      input.focus();
    }
  };

  ws.onerror = () => {
    replyBubble.textContent = "Connection error — is the backend running?";
    replyBubble.classList.remove("streaming");
    setInputLocked(false);
    setStatus("idle");
  };
};

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  window._turnStart = Date.now();
  sendMessage(text);
});

clearBtn.addEventListener("click", async () => {
  transcript.innerHTML = "";
  player.stop();
  avatar?.setState("idle");
  await fetch(`${BACKEND}/history`, { method: "DELETE" }).catch(() => {});
  setStatus("idle");
});
