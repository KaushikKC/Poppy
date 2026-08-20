// UI micro-interactions — purely cosmetic, no chat logic.
//
// Mirrors the app's existing state signals onto the new chrome:
//   • #status-dot class (chat.js: idle/thinking/speaking) → status pill + label
//     + a data-state attribute on #app that drives the control-dock glow.
//   • #mic-btn class (mic.js: recording/transcribing) overrides the label with
//     "Listening…" / "Transcribing…" while the user is talking.
//   • When the assistant speaks, the mini equalizer in the status pill follows
//     the REAL voice via the AudioPlayer's AnalyserNode (window._player,
//     exposed by chat.js); until that exists, a CSS animation fakes it.
(function () {
  const app    = document.getElementById("app");
  const dot    = document.getElementById("status-dot");
  const micBtn = document.getElementById("mic-btn");
  const pill   = document.getElementById("status-pill");
  const label  = document.getElementById("status-label");
  const eq     = document.getElementById("status-eq");
  const turnLabel = document.getElementById("turn-label");
  if (!app || !dot || !pill || !label) return;

  const LABELS = {
    idle: "Ready",
    thinking: "Thinking…",
    // Hers, not the user's: she is rendering a voice message. The mic button's own
    // "recording" class means the opposite — that the user is talking — and the two
    // are told apart below by which element carries the class.
    recording: "Recording…",
    speaking: "Speaking",
    listening: "Listening…",
    transcribing: "Transcribing…",
  };

  function currentState() {
    // The user's own voice activity wins over the assistant's state.
    if (micBtn?.classList.contains("recording"))    return "listening";
    if (micBtn?.classList.contains("transcribing")) return "transcribing";
    if (dot.classList.contains("recording")) return "recording";
    if (dot.classList.contains("thinking")) return "thinking";
    if (dot.classList.contains("speaking")) return "speaking";
    return "idle";
  }

  function sync() {
    const state = currentState();
    // "transcribing" shares the thinking (amber) look
    // Both borrow the thinking look: amber, working, not yet speaking.
    const visual = (state === "transcribing" || state === "recording") ? "thinking" : state;
    pill.className = visual;
    label.textContent = LABELS[state];
    app.dataset.state = visual;

    // Turn-taking pill — never ambiguous whose turn it is.
    if (turnLabel) {
      const nm = document.getElementById("call-name")?.textContent?.trim()
        || window.Pronouns?.Subj() || "She";
      const TURN = {
        idle: "Your turn",
        thinking: "Thinking…",
        speaking: `${nm} is speaking`,
        listening: "Listening to you",
        transcribing: "Got that…",
        recording: `${nm} is recording`,
      };
      turnLabel.textContent = TURN[state] || "Your turn";
    }
  }

  const opts = { attributes: true, attributeFilter: ["class"] };
  new MutationObserver(sync).observe(dot, opts);
  if (micBtn) new MutationObserver(sync).observe(micBtn, opts);
  sync();

  // ── Equalizer driven by the actual voice ─────────────────────────────────
  const bars = eq ? Array.from(eq.querySelectorAll("i")) : [];
  let freq = null;
  let cleared = false;   // the bars are already at rest; nothing to write

  function tick() {
    const analyser = window._player?.getAnalyser?.();
    if (analyser && bars.length && pill.classList.contains("speaking")) {
      cleared = false;
      if (!freq || freq.length !== analyser.frequencyBinCount) {
        freq = new Uint8Array(analyser.frequencyBinCount);
      }
      analyser.getByteFrequencyData(freq);
      eq.classList.add("live");
      // sample the voice band (skip the top half — mostly empty for speech)
      const usable = Math.floor(freq.length / 2);
      const bucket = Math.max(1, Math.floor(usable / bars.length));
      let total = 0;
      bars.forEach((bar, i) => {
        let sum = 0;
        for (let j = i * bucket; j < (i + 1) * bucket; j++) sum += freq[j];
        const level = sum / bucket / 255;
        total += level;
        bar.style.transform = `scaleY(${Math.max(0.15, Math.min(1, level * 1.6)).toFixed(2)})`;
      });
      // overall amplitude → the avatar's voice-reactive aura
      const amp = Math.min(1, (total / bars.length) * 2.4);
      app.style.setProperty("--amp", amp.toFixed(3));
    } else if (!cleared) {
      // Clear once, not on every frame for as long as she is not speaking. Writing a
      // custom property on #app invalidates style for everything under it, and doing
      // that thirty times a second while nothing is happening is pure cost — paid, on
      // a phone, exactly while it is transcribing or thinking.
      cleared = true;
      if (eq?.classList.contains("live")) {
        eq.classList.remove("live");
        bars.forEach((bar) => (bar.style.transform = ""));
      }
      app.style.setProperty("--amp", "0");
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
