const BACKEND    = window.BACKEND    || "http://localhost:8000";
const WS_BACKEND = window.WS_BACKEND || "ws://localhost:8000";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("user-input");
const sendBtn    = document.getElementById("send-btn");
const clearBtn   = document.getElementById("clear-btn");
const transcript = document.getElementById("transcript");
const statusDot  = document.getElementById("status-dot");

const player = new AudioPlayer();
// The 3D avatar (TalkingHead) lip-syncs to the voice in real time. chat.js talks
// to the bridge (avatar_bridge.js); the ES-module controller (avatar3d.module.mjs)
// taps the audio AnalyserNode via HeadAudio to drive the avatar's visemes.
const avatar = window.companionAvatar || null;

// Initialize persona picker; on change, update avatar colors and reset history
PersonaPicker.init();
PersonaPicker.onChange((_key, personaData) => {
  if (avatar) avatar.setColors(personaData.avatar);
  transcript.innerHTML = "";
  player.stop();
  avatar?.setState("idle");
  document.getElementById("persona-suggestion")?.classList.add("hidden");
  fetch(`${BACKEND}/history`, { method: "DELETE" }).catch(() => {});
  setStatus("idle");
});

// ── Accent-driven persona suggestion chip ──────────────────────────────────
let _suggestionTimer = null;
window.showPersonaSuggestion = function showPersonaSuggestion(suggestion) {
  const box = document.getElementById("persona-suggestion");
  if (!box || !suggestion) return;
  const name = PersonaPicker.name(suggestion.persona);

  box.innerHTML = "";
  const label = document.createElement("span");
  label.textContent = `${suggestion.reason} — try ${name}?`;

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "suggestion-apply";
  apply.textContent = "Switch";
  apply.addEventListener("click", () => {
    PersonaPicker.select(suggestion.persona);
    hide();
  });

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "suggestion-dismiss";
  dismiss.textContent = "✕";
  dismiss.title = "Dismiss";
  dismiss.addEventListener("click", hide);

  box.append(label, apply, dismiss);
  box.classList.remove("hidden");

  clearTimeout(_suggestionTimer);
  _suggestionTimer = setTimeout(hide, 10000);

  function hide() {
    clearTimeout(_suggestionTimer);
    box.classList.add("hidden");
  }
};

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

// Accent detected from the user's voice; sent with each message so the reply
// is spoken in that accent. Updated by mic.js after each transcription.
window._accent = window._accent || null;
window.setAccent = function setAccent(accent) {
  window._accent = accent;
  const badge = document.getElementById("accent-badge");
  if (badge) badge.textContent = accent ? `🗣 ${accent}` : "";
  avatar?.setIdentity?.(window._accent, window._gender);
};

// Gender detected from the user's voice; sent with each message so the reply
// uses the matching male/female voice. Sticky identity, like accent.
const GENDER_GLYPH = { male: "♂", female: "♀" };
window._gender = window._gender || null;
window.setGender = function setGender(gender) {
  window._gender = gender;
  const badge = document.getElementById("gender-badge");
  if (badge) badge.textContent = gender ? `${GENDER_GLYPH[gender] ?? ""} ${gender}` : "";
  avatar?.setIdentity?.(window._accent, window._gender);
};

// Emotion detected from the voice; shapes the reply's tone. Momentary, so it's
// consumed after one message (a later typed message has no emotion = neutral).
const EMOJI = { happy: "😊", sad: "😔", angry: "😠", neutral: "😐" };
window._emotion = window._emotion || null;
window.setEmotion = function setEmotion(emotion) {
  window._emotion = emotion && emotion !== "neutral" ? emotion : null;
  const badge = document.getElementById("emotion-badge");
  if (badge) badge.textContent = emotion ? `${EMOJI[emotion] ?? ""} ${emotion}` : "";
};

// ── Barge-in ────────────────────────────────────────────────────────────────
// The user can interrupt the assistant mid-reply: stop the audio, abort the
// in-flight turn, and let the new utterance take over. mic.js calls this on
// speech onset (VAD) or when push-to-talk starts.
let currentWs = null;
let currentReplyBubble = null;
window._replyActive = false;

function endReply(ws) {
  if (ws && ws !== currentWs) return; // a newer turn already took over
  window._replyActive = false;
  currentWs = null;
  currentReplyBubble = null;
}

window.interruptReply = function interruptReply() {
  if (!window._replyActive) return false;
  window._replyActive = false;
  try { player.stop(); } catch {}
  try { currentWs && currentWs.close(); } catch {}
  if (currentReplyBubble && currentReplyBubble.classList.contains("streaming")) {
    currentReplyBubble.classList.remove("streaming");
    currentReplyBubble.classList.add("interrupted");
    if (!currentReplyBubble.textContent) currentReplyBubble.textContent = "…";
  }
  currentWs = null;
  currentReplyBubble = null;
  setInputLocked(false);
  setStatus("idle");
  avatar?.setState("idle");
  return true;
};

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
  // The mic button is intentionally left interactive while a reply streams:
  // clicking it (push-to-talk) barges in and interrupts the assistant. VAD mode
  // owns micBtn.disabled separately, and the mic click handler ignores clicks
  // while auto-listen is on, so leaving it enabled here is safe.
}

window.sendMessage = async function sendMessage(text) {
  addBubble("user", text);
  const replyBubble = addBubble("assistant");
  replyBubble.classList.add("streaming");

  setInputLocked(true);
  setStatus("thinking");

  const ws = new WebSocket(`${WS_BACKEND}/ws/chat`);
  ws.binaryType = "arraybuffer";
  currentWs = ws;
  currentReplyBubble = replyBubble;
  window._replyActive = true;

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
    ws.send(JSON.stringify({
      type: "chat",
      text,
      persona: PersonaPicker.current(),
      accent: window._accent || undefined,
      gender: window._gender || undefined,
      emotion: window._emotion || undefined,
    }));
    window._emotion = null; // emotion is momentary — consume it for this turn
  };

  ws.onmessage = async (event) => {
    // Ignore frames from a superseded turn: after a barge-in the old socket may
    // still deliver buffered audio/tokens, which must not leak into the new turn.
    if (ws !== currentWs) return;

    if (event.data instanceof ArrayBuffer) {
      await player.enqueueWav(event.data.slice(0));
      return;
    }

    const msg = JSON.parse(event.data);

    if (msg.type === "config") {
      player.setSampleRate(msg.sampleRate);
      if (avatar && player.getAnalyser()) avatar.setAnalyser(player.getAnalyser());

    } else if (msg.type === "safety") {
      const notice = document.createElement("div");
      notice.className = "safety-notice";
      notice.textContent = msg.resources;
      transcript.appendChild(notice);
      transcript.scrollTop = transcript.scrollHeight;

    } else if (msg.type === "token") {
      if (statusDot.title === "thinking") setStatus("thinking");
      accumulated += msg.text;
      replyBubble.textContent = accumulated;
      transcript.scrollTop = transcript.scrollHeight;

    } else if (msg.type === "done") {
      replyBubble.classList.remove("streaming");
      ws.close();
      endReply(ws);
      setInputLocked(false);
      input.focus();
      // "done" means the LLM finished generating text — the audio is still
      // playing out for many seconds after this. Keep the avatar speaking until
      // the audio truly ends (onPlaybackEnd handles that). Only reset now if no
      // audio is playing: a text-only reply, or a tiny reply whose audio already
      // finished before this message arrived.
      if (avatar && !player.isPlaying()) {
        setStatus("idle");
        avatar.setState("idle");
      }

    } else if (msg.type === "error") {
      replyBubble.textContent = `Error: ${msg.message}`;
      replyBubble.classList.remove("streaming");
      ws.close();
      endReply(ws);
      setInputLocked(false);
      setStatus("idle");
      input.focus();
    }
  };

  ws.onerror = () => {
    if (ws !== currentWs) return; // interrupted or superseded turn — ignore
    replyBubble.textContent = "Connection error — is the backend running?";
    replyBubble.classList.remove("streaming");
    endReply(ws);
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
