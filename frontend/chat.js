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

// A turn's identity, and it outlives its socket. `currentWs` is cleared at
// "done" — while the voice may still have seconds left to play — so anything
// that has to survive until the audio actually stops cannot use the socket to
// tell whether it is still the live turn. Each turn takes the next number and
// checks it is still the current one before acting.
let turnSeq = 0;

function endReply(ws) {
  if (ws && ws !== currentWs) return; // a newer turn already took over
  window._replyActive = false;
  currentWs = null;
  currentReplyBubble = null;
}

window.interruptReply = function interruptReply() {
  // Interruptible not just while the LLM streams, but through the whole voice
  // playout: after "done" the reply is no longer _replyActive, yet the audio
  // often keeps speaking for several seconds. Barging in then must still cut it.
  if (!window._replyActive && !player.isPlaying()) return false;
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

/**
 * The bubble while she is recording.
 *
 * Built from elements rather than a ::after string so it can carry a mic and moving
 * level bars — the vocabulary of something being recorded right now. A line of text
 * saying "recording" asks you to believe it; bars that move show it.
 *
 * `.streaming` is dropped here on purpose. It drives the typing indicator, whose
 * selector is more specific than this one, so leaving it on meant the dots won and
 * the recording state was never seen at all.
 */
function renderRecording(bubble) {
  const who = document.getElementById("call-name")?.textContent?.trim()
    || window.Pronouns?.Subj() || "She";
  bubble.classList.remove("streaming");
  bubble.classList.add("recording");
  bubble.textContent = "";

  const mic = document.createElement("span");
  mic.className = "rec-mic";
  mic.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "rec-text";
  label.textContent = `${who} is recording`;

  const bars = document.createElement("span");
  bars.className = "rec-bars";
  bars.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 5; i += 1) bars.appendChild(document.createElement("i"));

  bubble.append(mic, label, bars);
  bubble.setAttribute("aria-label", `${who} is recording a voice message`);
  transcript.scrollTop = transcript.scrollHeight;
}

/**
 * Turn a bubble into a voice note: a play mark, a duration, and a bar that fills as
 * she speaks.
 *
 * There is no text, deliberately. The length is known before the first sound because
 * the whole reply is already rendered, so this is a real progress bar rather than an
 * indeterminate spinner — the difference between "this will take four seconds" and
 * "something may be happening".
 */
function renderVoiceNote(bubble, durationMs, transcriptText = "") {
  const secs = Math.max(1, Math.round(durationMs / 1000));
  bubble.classList.remove("recording", "streaming");
  bubble.classList.add("voice-note");
  bubble.textContent = "";

  const mark = document.createElement("span");
  mark.className = "vn-mark";
  mark.setAttribute("aria-hidden", "true");

  const bar = document.createElement("span");
  bar.className = "vn-bar";
  const fill = document.createElement("i");
  bar.appendChild(fill);

  const time = document.createElement("span");
  time.className = "vn-time";
  time.textContent = `0:${String(secs).padStart(2, "0")}`;

  // Waveform bars behind the progress fill, so a voice note looks like one at a
  // glance rather than like a loading bar that happens to be in a bubble. Seeded
  // from the duration so a given note always looks the same, never reshuffling.
  const wave = document.createElement("span");
  wave.className = "vn-wave";
  const bars = Math.min(34, Math.max(12, Math.round(durationMs / 220)));
  for (let i = 0; i < bars; i += 1) {
    const b = document.createElement("i");
    const n = Math.abs(Math.sin((i + 1) * (durationMs % 97) * 0.37));
    b.style.height = `${28 + n * 72}%`;
    wave.appendChild(b);
  }

  const row = document.createElement("span");
  row.className = "vn-row";
  row.append(mark, wave, bar, time);
  bubble.append(row);
  bubble.setAttribute("aria-label", `Voice message, ${secs} seconds`);

  // The words, behind a tap, from the moment the note appears rather than once it
  // has finished playing. Waiting for the end was the same as not having it: a
  // forty-second reply is forty seconds before you can read a line of it, which is
  // exactly the situation where someone wants to read instead of listen.
  if (transcriptText) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "vn-transcript";
    toggle.textContent = "Transcript";
    toggle.setAttribute("aria-expanded", "false");
    const text = document.createElement("span");
    text.className = "vn-text hidden";
    text.textContent = transcriptText;
    toggle.addEventListener("click", () => {
      const shown = !text.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", String(shown));
      toggle.textContent = shown ? "Hide transcript" : "Transcript";
      transcript.scrollTop = transcript.scrollHeight;
    });
    bubble.append(toggle, text);
  }

  // Playback is native, so the bar is driven from the duration we were given rather
  // than from a player the page can query.
  const startedAt = Date.now();
  const tick = () => {
    const done = Math.min(1, (Date.now() - startedAt) / durationMs);
    fill.style.width = `${(done * 100).toFixed(1)}%`;
    wave.style.setProperty("--played", `${(done * 100).toFixed(1)}%`);
    if (done < 1 && bubble.isConnected) requestAnimationFrame(tick);
    else bubble.classList.add("played");
  };
  requestAnimationFrame(tick);
}

/**
 * The composer shows a mic or a send button, never both.
 *
 * Not decoration: it is the same rule the reply follows. An empty field means the
 * next thing said will be spoken, and a field with something in it means it will be
 * typed — so the button is already telling you which kind of reply is coming back.
 */
(function composerMode() {
  const form = document.getElementById("chat-form");
  const field = document.getElementById("user-input");
  if (!form || !field) return;
  const sync = () => form.classList.toggle("has-text", field.value.trim().length > 0);
  field.addEventListener("input", sync);
  form.addEventListener("submit", () => setTimeout(sync, 0));
  sync();
})();

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

// Poppy speaks a line she initiates herself (opening line, sign-off) via the
// "say" socket message — no user bubble, no LLM turn. The line is short and
// already known, so it's revealed at once and the avatar lip-syncs to the audio.
window.speakLine = function speakLine(text) {
  if (!text) return;
  const myTurn = ++turnSeq;   // supersedes any earlier turn's playback callback
  const bubble = addBubble("assistant");
  bubble.classList.add("streaming");
  setStatus("thinking");

  const ws = new WebSocket(`${WS_BACKEND}/ws/chat`);
  ws.binaryType = "arraybuffer";
  currentWs = ws;
  currentReplyBubble = bubble;
  window._replyActive = true;

  player.onPlaybackStart(() => {
    setStatus("speaking");
    avatar?.setState("speaking");
  });

  let lineMs = 0;
  let lineClipId = null;
  let lineText = "";

  function finish() {
    // Once it has played out it becomes a note that can be played again and read,
    // exactly like a reply. Before this, her opener was the one recording in the app
    // you got a single pass at.
    if (lineMs && window.VoiceNote && replyWav && !bubble.querySelector(".vn-wave")) {
      window.VoiceNote.render(bubble, {
        durationMs: lineMs,
        transcript: lineText,
        handle: replyWav
          ? window.VoiceNote.blobHandle(replyWav)
          : window.VoiceNote.nativeHandle(lineClipId, lineMs),
      });
      bubble.classList.add("played");
    }
    setStatus("idle");
    avatar?.setState("idle");
  }

  ws.onopen = () => ws.send(JSON.stringify({
    type: "say",
    text,
    accent: window._accent || undefined,
    gender: window._gender || undefined,
  }));

  ws.onmessage = async (event) => {
    if (ws !== currentWs) return;
    if (event.data instanceof ArrayBuffer) {
      const bytes = event.data.slice(0);
      // Kept as well as played. A reply used to be audible exactly once: the bytes
      // went into the player and nothing held on to them, so when it finished there
      // was nothing left to play again. One recording per reply (ws_handler renders
      // the whole thing in one call), so this is one blob, not a growing buffer.
      replyWav = new Blob([bytes], { type: "audio/wav" });
      await player.enqueueWav(bytes);
      return;
    }
    const msg = JSON.parse(event.data);
    if (msg.type === "config") {
      player.setSampleRate(msg.sampleRate);
      if (avatar && player.getAnalyser()) avatar.setAnalyser(player.getAnalyser());
    } else if (msg.type === "token") {
      bubble.textContent = msg.text;
      transcript.scrollTop = transcript.scrollHeight;
    } else if (msg.type === "voice") {
      // Her opening line, spoken. This frame was never handled here, so a line long
      // enough to be worth saying out loud arrived as an empty bubble: no player, no
      // words, nothing. It gets the same note the rest of her replies get.
      lineMs = msg.durationMs;
      lineClipId = msg.clipId || null;
      lineText = msg.text || "";
      // Her opener, same reasoning as the reply above.
      if (lineClipId && window.VoiceNote) {
        window.VoiceNote.render(bubble, {
          durationMs: msg.durationMs,
          transcript: lineText,
          handle: window.VoiceNote.nativeHandle(lineClipId, msg.durationMs),
          playing: true,
        });
      } else {
        renderVoiceNote(bubble, msg.durationMs, lineText);
      }
    } else if (msg.type === "avatar_clip") {
      window.poppyPlayClip?.(`${BACKEND}${msg.url}`);
    } else if (msg.type === "done") {
      bubble.classList.remove("streaming");
      ws.close();
      endReply(ws);
      if (player.isPlaying()) {
        // Reset the avatar to idle once the voice has fully played out. Stops if
        // a newer turn has started, so a barge-in's reply is not dropped to idle
        // by the poll belonging to the line it interrupted.
        const poll = setInterval(() => {
          if (myTurn !== turnSeq) { clearInterval(poll); return; }
          if (!player.isPlaying()) { clearInterval(poll); finish(); }
        }, 200);
      } else {
        finish();
      }
    } else if (msg.type === "error") {
      bubble.textContent = `Error: ${msg.message}`;
      bubble.classList.remove("streaming");
      ws.close();
      endReply(ws);
      finish();
    }
  };

  ws.onerror = () => { if (ws === currentWs) { endReply(ws); finish(); } };
};

/**
 * Send a turn.
 *
 * `spoken` is how it arrived, and it decides how the answer comes back: speak to her
 * and she speaks back, type and she types back. It is not a setting anybody chooses —
 * the app already knows which control was used, and mirroring that is what a person
 * would do. Defaults to typed, because every caller that does not say otherwise is a
 * keyboard.
 */
window.sendMessage = async function sendMessage(text, spoken = false, opts = {}) {
  // The user's speaking again — postpone any pending memory extraction so it never
  // fires mid-conversation and steals the model from this reply. Postpone, not cancel:
  // what they said is kept in _memQueue and extracted at the next real pause. Cancelling
  // outright meant nothing was ever remembered from a fast back-and-forth — say "my
  // brother's name is Ram" and ask about it in the next breath, and there was no memory
  // to consult, because the only chance to save it had been thrown away.
  clearTimeout(window._memProposeTimer);
  const myTurn = ++turnSeq;   // supersedes any earlier turn's playback callback
  window._lastUserText = text; // last turn, used to pair a memory candidate with its source
  // Sent as a recording, so it appears as one. `opts.audio` is present only when the
  // message actually came from the microphone; typing is unchanged and still arrives
  // as text, because answering in kind starts with showing in kind.
  const userBubble = addBubble("user", opts.audio ? "" : text);
  if (opts.audio && window.VoiceNote) {
    const { blob, clipId, durationMs = 0 } = opts.audio;
    // A blob on desktop, an id on iOS where the samples never leave the native side.
    // The bubble does not care which it was handed.
    const handle = blob
      ? window.VoiceNote.blobHandle(blob)
      : clipId
        ? window.VoiceNote.nativeHandle(clipId, durationMs)
        : null;
    window.VoiceNote.render(userBubble, { durationMs, transcript: text, handle });
  }
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
  // Set once she starts recording. The paced reveal below writes textContent on a
  // 40ms interval and again on `done`, and in a spoken turn `target` is empty — so
  // without this it wiped the voice note it had just been handed, every time. The
  // bubble kept its class and lost its contents, which is exactly what was seen.
  let voiceReply = false;
  // Her recording for this turn, once it arrives. Used to make the bubble replayable
  // after the live playback (which owns the analyser, and so the orb) has finished.
  let replyWav = null;
  let replyMs = 0;
  // The native side's copy, on iOS, where no bytes cross the bridge.
  let replyClipId = null;
  let replyText = "";

  function renderShown() {
    if (voiceReply) return;
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

  // The only thing that returned this turn to idle was the reveal loop, and a
  // spoken reply never starts one: a voice note carries no text, so no `token`
  // frame ever arrives and startReveal() is never called. The status sat on
  // "speaking" for the rest of the session once the audio had finished.
  //
  // Two guards. The queue can drain mid-turn when synthesis falls behind the
  // voice, so this only ends the turn once the model has finished producing;
  // and _onEnd is a single slot on the player, so a stale closure from a
  // superseded turn has to bow out rather than end the live one.
  player.onPlaybackEnd(() => {
    if (myTurn !== turnSeq) return;
    if (!llmDone) return;
    flushAll();
    killReveal();
    // Now that the live pass is done the bubble stops being a picture of a voice note
    // and becomes one: play, pause, scrub, play again. Deliberately not before —
    // during the live pass the audio belongs to the analyser that drives the orb, and
    // two things playing the same reply at once is worse than not being able to
    // replay it.
    // Not over a player that is already there. On the phone the bubble became a real
    // player the moment the audio started, and re-rendering it here would throw away
    // wherever the user had paused it.
    if (voiceReply && window.VoiceNote && replyWav && !replyBubble.querySelector(".vn-wave")) {
      window.VoiceNote.render(replyBubble, {
        durationMs: replyMs,
        transcript: replyText,
        handle: replyWav
          ? window.VoiceNote.blobHandle(replyWav)
          : window.VoiceNote.nativeHandle(replyClipId, replyMs),
      });
      replyBubble.classList.add("played");
    }
    setStatus("idle");
    avatar?.setState("idle");
  });

  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: "chat",
      text,
      spoken,
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
      const bytes = event.data.slice(0);
      // Kept as well as played. A reply used to be audible exactly once: the bytes
      // went into the player and nothing held on to them, so when it finished there
      // was nothing left to play again. One recording per reply (ws_handler renders
      // the whole thing in one call), so this is one blob, not a growing buffer.
      replyWav = new Blob([bytes], { type: "audio/wav" });
      await player.enqueueWav(bytes);
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

    } else if (msg.type === "recording") {
      // Only now: during generation nobody knew whether this reply would be spoken
      // at all, so the bubble sat as a typing indicator rather than claiming a
      // recording that might never happen. Nothing readable arrives in a spoken
      // turn, which is what makes it a voice note rather than a subtitle you finish
      // before she starts.
      voiceReply = true;
      renderRecording(replyBubble);
      setStatus("recording");

    } else if (msg.type === "voice") {
      replyMs = msg.durationMs;
      replyClipId = msg.clipId || null;
      // What she actually said. Kept, not shown: it goes behind the transcript tap
      // once the note becomes a player, so a reply is readable when sound is not an
      // option and quotable when it is.
      replyText = msg.text || "";
      // Interactive from the first second when the phone is playing it natively.
      //
      // This used to draw a picture of a voice note and only become a real player once
      // the reply had finished — so the one pass you are actually listening to was the
      // one you could not pause. That was right on desktop, where the page plays the
      // audio into the analyser that drives the orb and a second player would fight it.
      // On the phone the audio is native and there is nothing to fight.
      if (replyClipId && window.VoiceNote) {
        window.VoiceNote.render(replyBubble, {
          durationMs: msg.durationMs,
          transcript: replyText,
          handle: window.VoiceNote.nativeHandle(replyClipId, msg.durationMs),
          playing: true,
        });
      } else {
        renderVoiceNote(replyBubble, msg.durationMs, replyText);
      }

    } else if (msg.type === "token") {
      if (statusDot.title === "thinking") setStatus("thinking");
      target += msg.text;
      startReveal();

    } else if (msg.type === "avatar_clip") {
      // Video-avatar mode: play the character's talking-head clip (audio baked in).
      window.poppyPlayClip?.(`${BACKEND}${msg.url}`);

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
      // After the turn, ask what's worth remembering and offer to save it (§5).
      // Debounced: only run once the user has actually PAUSED (2.5s with no new
      // message), so the extraction pass never competes with an active
      // back-and-forth for the on-device model. sendMessage() cancels it the
      // moment the user speaks again.
      clearTimeout(window._memProposeTimer);
      // Everything said since the last extraction, not just the newest line. A fact
      // mentioned three messages ago is worth exactly as much as one mentioned now.
      window._memQueue = (window._memQueue || []);
      if (window._lastUserText) window._memQueue.push(window._lastUserText);
      // Bounded: this is a prompt for a small on-device model, not a transcript.
      if (window._memQueue.length > 6) window._memQueue = window._memQueue.slice(-6);
      window._memProposeTimer = setTimeout(() => {
        const batch = (window._memQueue || []).join(" ");
        window._memQueue = [];
        if (batch) window.proposeMemory?.(batch);
      }, 2500);
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

  ws.onclose = () => {
    // Last resort. The input is unlocked on "done", on "error" and on a socket
    // error, but a socket that simply closes mid-turn hit none of them, and the
    // typing field stayed locked with no way back except reloading the page.
    if (ws !== currentWs) return; // superseded or deliberately interrupted
    if (llmDone) return;          // the turn finished normally
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
  sendMessage(text, false);
});

clearBtn.addEventListener("click", async () => {
  transcript.innerHTML = "";
  player.stop();
  avatar?.setState("idle");
  await fetch(`${BACKEND}/history`, { method: "DELETE" }).catch(() => {});
  setStatus("idle");
});
