/* =========================================================
   POPPYS — LIVE CALL
   Drives the call as a turn-taking state machine:
   speaking → listening → thinking → speaking …
   Every visual (aura, wave, caption colour, nudges) reads the same state,
   so the user always knows whose turn it is without being told twice.
   ========================================================= */

const body = document.body;
const $ = (id) => document.getElementById(id);

const els = {
  veil: $("connect-veil"),
  connectSub: $("connect-sub"),
  timer: $("call-timer"),
  moodReadout: $("mood-readout"),
  turnLabel: $("turn-label"),
  captionText: $("caption-text"),
  captionWho: document.querySelector(".caption-who"),
  wave: $("wave"),
  thread: $("thread-list"),
  memorySlot: $("memory-slot"),
  outro: $("outro"),
  outroLength: $("outro-length"),
  micBtn: $("mic-btn"),
  captionsBtn: $("captions-btn"),
  endBtn: $("end-btn"),
  againBtn: $("again-btn"),
  sheetBtn: $("sheet-btn"),
  sheetGrip: $("sheet-grip"),
  memoryBtn: $("memory-btn"),
  interruptBtn: $("interrupt-btn"),
  video: $("poppy-video"),
};

let pending = [];
function schedule(fn, ms) {
  const id = setTimeout(fn, ms);
  pending.push(id);
  return id;
}
function clearPending() {
  pending.forEach(clearTimeout);
  pending = [];
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------------------------------------------------------
   The call script. She speaks first, personally, always.
   --------------------------------------------------------- */
const SCRIPT = [
  { who: "poppy", text: "Hey — I'm really glad you called.", hold: 900 },
  { who: "poppy", text: "You said work's been heavy this week. Want to get it off your chest, or should I take your mind off it?", hold: 700 },
  { who: "you", text: "Honestly… it's been a lot. The review is tomorrow.", hold: 600 },
  { who: "thinking", text: "", hold: 900 },
  { who: "poppy", text: "Tomorrow. Okay. Then we're not fixing everything tonight — just the part that's loudest.", hold: 800 },
  { who: "poppy", text: "What's the loudest part right now?", hold: 600, memory: "You're presenting to the whole team tomorrow at 11." },
  { who: "you", text: "That I'll blank in front of everyone.", hold: 700 },
  { who: "poppy", text: "Wait — didn't you say your sister's visiting this weekend? Good. You'll have somewhere soft to land after.", hold: 900 },
  { who: "poppy", text: "Say the first line out loud to me. Just the first one. I'll tell you how it lands.", hold: 1200 },
];

const MOODS = {
  calm: { label: "Calm", note: "Slower pace, softer replies." },
  vent: { label: "Vent", note: "She listens, she doesn't fix." },
  hype: { label: "Hype", note: "Faster, warmer, louder." },
  wind: { label: "Wind down", note: "Quiet voice, longer pauses." },
  plan: { label: "Plan", note: "One concrete next step." },
};

/* ---------------------------------------------------------
   Amplitude — the single number everything breathes from
   --------------------------------------------------------- */
let amp = 0;
let targetAmp = 0;
let ampPhase = 0;

const BAR_COUNT = 22;
for (let i = 0; i < BAR_COUNT; i++) {
  const bar = document.createElement("i");
  const d = Math.abs(i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  bar.style.setProperty("--seed", String(i));
  bar.dataset.center = String(1 - d * 0.75);
  els.wave.appendChild(bar);
}
const bars = [...els.wave.children];

function tick(t) {
  ampPhase = t / 1000;
  // organic, speech-like envelope rather than a flat sine
  const wobble =
    0.55 +
    0.28 * Math.sin(ampPhase * 7.3) +
    0.17 * Math.sin(ampPhase * 17.1 + 1.3) +
    0.1 * Math.sin(ampPhase * 3.1 + 0.7);

  const want = targetAmp * Math.max(0.12, Math.min(1, wobble));
  amp += (want - amp) * 0.18;
  body.style.setProperty("--amp", amp.toFixed(3));

  bars.forEach((bar, i) => {
    const h =
      (0.35 + 0.65 * Math.abs(Math.sin(ampPhase * (5 + i * 0.55) + i))) *
      Number(bar.dataset.center);
    bar.style.setProperty("--h", h.toFixed(3));
  });

  requestAnimationFrame(tick);
}
if (!reduceMotion) requestAnimationFrame(tick);

/* ---------------------------------------------------------
   Turn state
   --------------------------------------------------------- */
function setTurn(turn) {
  body.dataset.turn = turn;
  if (turn === "speaking") {
    els.turnLabel.textContent = "Poppy is speaking";
    targetAmp = 1;
  } else if (turn === "listening") {
    els.turnLabel.textContent = body.dataset.muted === "true" ? "You're muted — tap to talk" : "Listening to you";
    targetAmp = body.dataset.muted === "true" ? 0.05 : 0.62;
  } else {
    els.turnLabel.textContent = "Poppy is thinking";
    targetAmp = 0.14;
  }
}

/* ---------------------------------------------------------
   Captions — revealed in phrases, the way people hear speech
   --------------------------------------------------------- */
let typeTimer = null;

function say(who, text) {
  clearInterval(typeTimer);
  els.captionWho.textContent = who === "you" ? "You" : "Poppy";
  els.captionText.textContent = "";

  const words = text.split(" ");
  let i = 0;
  const step = reduceMotion ? words.length : 1;
  const speed = who === "you" ? 52 : 62;

  typeTimer = setInterval(() => {
    i += step;
    els.captionText.textContent = words.slice(0, i).join(" ");
    if (i >= words.length) clearInterval(typeTimer);
  }, speed);

  return words.length * speed + 900;
}

function pushTurn(who, text) {
  const li = document.createElement("li");
  li.className = `turn turn--${who}`;
  li.innerHTML = `<span class="turn-name">${who === "you" ? "You" : "Poppy"}</span>${text}`;
  els.thread.appendChild(li);
  li.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
}

/* ---------------------------------------------------------
   Memory candidate — consent asked in the moment, not buried
   --------------------------------------------------------- */
function offerMemory(line) {
  els.memorySlot.innerHTML = `
    <div class="memory-card">
      <p class="kicker">Want me to remember this?</p>
      <p class="memory-line">${line}</p>
      <div class="memory-actions">
        <button class="chip chip--solid" data-memory="keep" type="button">Keep it</button>
        <button class="chip" data-memory="edit" type="button">Edit</button>
        <button class="chip chip--quiet" data-memory="no" type="button">Not now</button>
      </div>
    </div>`;

  els.memorySlot.querySelectorAll("[data-memory]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kept = btn.dataset.memory === "keep";
      els.memorySlot.innerHTML = kept
        ? `<div class="memory-saved">Poppy will remember that.</div>`
        : `<div class="memory-saved">Forgotten. It never left this call.</div>`;
      setTimeout(() => { els.memorySlot.innerHTML = ""; }, 4000);
    });
  });
}

/* ---------------------------------------------------------
   Run the call
   --------------------------------------------------------- */
let started = 0;
let timerId = null;
let stepIndex = 0;
let running = false;

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function runStep() {
  if (!running) return;
  const step = SCRIPT[stepIndex % SCRIPT.length];

  if (step.who === "thinking") {
    setTurn("thinking");
    schedule(next, step.hold + 500);
    return;
  }

  setTurn(step.who === "you" ? "listening" : "speaking");
  const dur = say(step.who, step.text);
  pushTurn(step.who, step.text);
  if (step.memory) schedule(() => offerMemory(step.memory), dur * 0.6);

  schedule(next, dur + step.hold);

  function next() {
    stepIndex += 1;
    if (stepIndex >= SCRIPT.length) {
      // loop back into a live listening state rather than ending the demo
      stepIndex = 2;
    }
    runStep();
  }
}

function startCall() {
  body.dataset.phase = "live";
  body.dataset.turn = "speaking";
  body.dataset.captions = "on";
  body.dataset.muted = "false";
  body.dataset.sheet = "closed";
  started = Date.now();
  stepIndex = 0;
  running = true;
  clearPending();

  els.thread.innerHTML = "";
  els.memorySlot.innerHTML = "";
  els.outro.hidden = true;

  clearInterval(timerId);
  timerId = setInterval(() => {
    els.timer.textContent = formatTime(Date.now() - started);
  }, 1000);
  els.timer.textContent = "00:00";

  els.video?.play?.().catch(() => {});
  runStep();
}

/* connect ritual: short, warm, never a dead screen */
const CONNECT_LINES = ["She picks up in a second.", "Almost there…"];
let connectLine = 0;
const connectCycle = setInterval(() => {
  connectLine += 1;
  if (els.connectSub && CONNECT_LINES[connectLine]) {
    els.connectSub.textContent = CONNECT_LINES[connectLine];
  }
}, 800);

setTimeout(() => {
  clearInterval(connectCycle);
  startCall();
}, 1750);

/* ---------------------------------------------------------
   Controls
   --------------------------------------------------------- */
els.micBtn.addEventListener("click", () => {
  const muted = body.dataset.muted !== "true";
  body.dataset.muted = String(muted);
  els.micBtn.setAttribute("aria-pressed", String(muted));
  els.micBtn.querySelector(".dock-label").textContent = muted ? "Muted" : "Mute";
  setTurn(body.dataset.turn || "speaking");
});

els.captionsBtn.addEventListener("click", () => {
  const on = body.dataset.captions !== "on";
  body.dataset.captions = on ? "on" : "off";
  els.captionsBtn.setAttribute("aria-pressed", String(on));
});

document.querySelectorAll(".mood").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mood").forEach((b) => b.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    const mood = btn.dataset.mood;
    body.dataset.mood = mood;
    els.moodReadout.textContent = MOODS[mood].label;
    // she acknowledges the shift out loud — the mood change is a real event
    running = false;
    clearPending();
    setTurn("speaking");
    const line = {
      calm: "Okay. Slower, then.",
      vent: "Go on. I'm not going to fix anything — I'm just here.",
      hype: "Right. Sit up. You're more ready than you think.",
      wind: "Let's bring it down. Breathe with me for a second.",
      plan: "Alright. One thing you can actually do before 11 tomorrow.",
    }[mood];
    const dur = say("poppy", line);
    pushTurn("poppy", line);
    schedule(() => {
      running = true;
      runStep();
    }, dur);
  });
});

document.querySelectorAll(".nudge").forEach((btn) => {
  btn.addEventListener("click", () => {
    const text = btn.textContent.trim();
    running = false;
    clearPending();
    setTurn("listening");
    const dur = say("you", text);
    pushTurn("you", text);
    schedule(() => {
      running = true;
      stepIndex = 4;
      runStep();
    }, dur);
  });
});

/* interruption — she stops mid-sentence and hands the turn back.
   This is the one thing that makes it feel like a call, not a voice note. */
els.interruptBtn.addEventListener("click", () => {
  if (body.dataset.turn !== "speaking") return;
  running = false;
  clearPending();
  clearInterval(typeTimer);

  // she trails off where she was cut
  const cut = els.captionText.textContent.replace(/[.,!?]$/, "");
  els.captionText.textContent = cut + "—";

  setTurn("listening");
  els.captionWho.textContent = "You";
  schedule(() => {
    els.captionText.textContent = "";
  }, 260);

  schedule(() => {
    running = true;
    stepIndex = 6;
    runStep();
  }, 4200);
});

/* mobile sheet */
function toggleSheet() {
  body.dataset.sheet = body.dataset.sheet === "open" ? "closed" : "open";
}
els.sheetBtn.addEventListener("click", toggleSheet);
els.sheetGrip.addEventListener("click", toggleSheet);
els.memoryBtn.addEventListener("click", () => {
  if (window.matchMedia("(max-width: 860px)").matches) body.dataset.sheet = "open";
  offerMemory("You're presenting to the whole team tomorrow at 11.");
});

/* end + restart */
function endCall() {
  running = false;
  clearPending();
  clearInterval(typeTimer);
  clearInterval(timerId);
  targetAmp = 0;
  els.outroLength.textContent = formatTime(Date.now() - started);
  els.outro.hidden = false;
  body.dataset.phase = "ended";
}

els.endBtn.addEventListener("click", endCall);
els.againBtn.addEventListener("click", () => {
  body.dataset.phase = "connecting";
  els.connectSub.textContent = CONNECT_LINES[0];
  setTimeout(startCall, 1400);
});

document.querySelectorAll(".outro-memory-actions .chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const wrap = btn.closest(".outro-memory");
    wrap.innerHTML = `<p class="kicker">Memory</p><p class="outro-memory-line">${
      btn.textContent === "Forget it" ? "Gone. Poppy won't bring it up." : "Saved. She'll ask you about it tomorrow."
    }</p>`;
  });
});

/* keyboard — a call you can run without looking */
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  const k = e.key.toLowerCase();
  if (k === "m") els.micBtn.click();
  if (k === "c") els.captionsBtn.click();
  if (k === "escape" && body.dataset.sheet === "open") body.dataset.sheet = "closed";
});
