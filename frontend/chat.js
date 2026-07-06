const BACKEND    = window.BACKEND    || "http://localhost:8000";
const WS_BACKEND = window.WS_BACKEND || "ws://localhost:8000";

const form       = document.getElementById("chat-form");
const input      = document.getElementById("user-input");
const sendBtn    = document.getElementById("send-btn");
const clearBtn   = document.getElementById("clear-btn");
const transcript = document.getElementById("transcript");
const statusDot  = document.getElementById("status-dot");

const player = new AudioPlayer();
window._player = player; // ui.js taps the analyser to animate the voice EQ
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

// Identity chips are icon + label (<i class="chip-label">); we fill the label
// and toggle .on so CSS can show/hide the whole chip. No emojis — the icons
// live in index.html as inline SVGs.
function setChip(id, text) {
  const badge = document.getElementById(id);
  if (!badge) return;
  const label = badge.querySelector(".chip-label");
  if (label) label.textContent = text || "";
  badge.classList.toggle("on", !!text);
}

let _latencyTimer = null;
function showLatency(ms) {
  const badge = document.getElementById("latency-badge");
  if (!badge) return;
  const label = badge.querySelector(".chip-label");
  if (label) label.textContent = `${(ms / 1000).toFixed(2)}s`;
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
  setChip("accent-badge", accent);
  avatar?.setIdentity?.(window._accent, window._gender);
};

// Gender detected from the user's voice; sent with each message so the reply
// uses the matching male/female voice. Sticky identity, like accent.
window._gender = window._gender || null;
window.setGender = function setGender(gender) {
  window._gender = gender;
  setChip("gender-badge", gender);
  avatar?.setIdentity?.(window._accent, window._gender);
};

// Emotion detected from the voice; shapes the reply's tone. Momentary, so it's
// consumed after one message (a later typed message has no emotion = neutral).
window._emotion = window._emotion || null;
window.setEmotion = function setEmotion(emotion) {
  window._emotion = emotion && emotion !== "neutral" ? emotion : null;
  setChip("emotion-badge", emotion);
};

// ── Voice adaptation toggle ───────────────────────────────────────────────────
// When ON, /stt runs the accent/voice/mood classifiers and the reply adapts to how
// you sound — but that adds a few seconds per turn. OFF (default) skips them for
// fast replies with the default voice. mic.js reads window.detectionEnabled().
let _detectionOn = false;
window.detectionEnabled = () => _detectionOn;

(function initAdaptToggle() {
  const btn = document.getElementById("adapt-btn");
  if (!btn) return;

  function apply() {
    btn.classList.toggle("on", _detectionOn);
    btn.setAttribute("aria-pressed", _detectionOn ? "true" : "false");
    if (!_detectionOn) {
      // Clear any stale identity chips + values when adaptation is turned off.
      window.setAccent?.(null);
      window.setGender?.(null);
      window.setEmotion?.(null);
    }
  }

  btn.addEventListener("click", () => { _detectionOn = !_detectionOn; apply(); });

  // Initialize from the server default so the UI matches the backend.
  fetch(`${BACKEND}/settings`)
    .then((r) => r.json())
    .then((s) => { _detectionOn = !!s.detection; apply(); })
    .catch(() => apply());
})();

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
  try { window._killReveal?.(); } catch {}  // freeze the paced text where it is
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

  // ── Paced text reveal ───────────────────────────────────────────────────────
  // Ollama types the whole reply far faster than Kokoro can speak it, so we don't
  // dump tokens on screen. We reveal them at a STEADY rate matched to Kokoro's
  // speaking pace (~13 chars/sec, measured), which keeps the text continuous and
  // naturally in sync with the voice from start to finish. (An earlier attempt to
  // pace to the queued-audio length stalled, because the audio queues up far
  // ahead of what's actually being spoken.)
  const REVEAL_CPS   = 13;     // ~Kokoro speaking rate; steady = smooth + in sync
  let target = "";             // full text received so far
  let shownF = 0;              // chars revealed (fractional accumulator)
  let llmDone = false;         // the LLM finished generating (all audio is sent)
  let revealDead = false;      // barge-in / superseded — stop this turn's reveal
  let lastTick = 0;
  let revealTimer = null;

  function renderShown() {
    replyBubble.textContent = target.slice(0, Math.floor(shownF));
    transcript.scrollTop = transcript.scrollHeight;
  }

  function flushAll() {
    shownF = target.length;
    renderShown();
  }

  function killReveal() {
    revealDead = true;
    if (revealTimer) { clearInterval(revealTimer); revealTimer = null; }
  }

  function startReveal() {
    if (revealTimer || revealDead) return;
    lastTick = performance.now();
    revealTimer = setInterval(() => {
      if (revealDead) { clearInterval(revealTimer); revealTimer = null; return; }
      const now = performance.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      shownF = Math.min(shownF + REVEAL_CPS * dt, target.length);
      renderShown();

      // Finished: LLM done, all text shown, and the voice has fully played out.
      if (llmDone && shownF >= target.length && !player.isPlaying()) {
        clearInterval(revealTimer); revealTimer = null;
        setStatus("idle");
        avatar?.setState("idle");
      }
    }, 40);
  }

  // Let a barge-in stop this turn's reveal (frozen at whatever was shown).
  window._killReveal = killReveal;

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
      target += msg.text;
      startReveal();

    } else if (msg.type === "done") {
      // "done" = the LLM finished generating (all audio is now sent); the voice
      // may still play for many seconds. Mark it and let the audio-synced reveal
      // loop finish the text and reset the avatar when the voice truly ends.
      llmDone = true;
      replyBubble.classList.remove("streaming");
      ws.close();
      endReply(ws);
      setInputLocked(false);
      input.focus();
      if (!player.isPlaying()) {
        // Text-only reply, or the audio already finished — nothing to sync to.
        flushAll();
        killReveal();
        setStatus("idle");
        avatar?.setState("idle");
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
