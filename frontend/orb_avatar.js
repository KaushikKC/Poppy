// Orb avatar (v1) — a lightweight, fully-local, audio-reactive voice presence that
// replaces the 3D/realistic avatar. A soft, per-character-colored orb that breathes
// when idle, shimmers while thinking, and pulses with the voice while speaking.
//
// Canvas 2D, ~60fps on mobile. Satisfies the existing window.companionAvatar interface
// (setState / setAnalyser / setColors / setIdentity), so it's a drop-in swap: chat.js
// already calls these, and the analyser it passes is the live TTS audio.
(function () {
  const bridge = window.companionAvatar || (window.companionAvatar = {});
  const container =
    document.getElementById("avatar3d") ||
    document.getElementById("stage") ||
    document.body;

  const canvas = document.createElement("canvas");
  canvas.id = "orb-canvas";
  Object.assign(canvas.style, {
    position: "absolute", inset: "0", width: "100%", height: "100%",
    display: "block", pointerEvents: "none",
  });
  container.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);
  // The container changes size without the window doing so: entering a call gives
  // the transcript its own share of the screen, and the orb's area shrinks to what
  // is left. A window resize listener never hears about that, so the canvas kept
  // its old size and the orb stayed centred on a box that no longer existed.
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(resize).observe(container);
  }

  // Per-character palette (overridden by setColors). Sensible default = Poppy purple.
  let palette = { core: "#ffffff", inner: "#7c6ef0", outer: "#2d2248", glow: "124,110,240" };

  // Pick up anything chat.js buffered before this loaded.
  let state = bridge._state || "idle";
  let analyser = bridge._analyser || null;
  let freq = null;
  let level = 0;   // smoothed 0..1 voice amplitude

  function audioLevel() {
    if (!analyser) return 0;
    if (!freq || freq.length !== analyser.frequencyBinCount) {
      freq = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(freq);
    const n = Math.min(freq.length, 64);
    let s = 0;
    for (let i = 0; i < n; i++) s += freq[i];
    return s / n / 255;
  }

  let t = 0;
  function frame() {
    t += 0.016;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const base = Math.min(W, H) * 0.22;

    // Target amplitude by state, then smooth toward it.
    let target = 0;
    if (state === "speaking") target = audioLevel();
    else if (state === "thinking") target = 0.12 + 0.05 * Math.sin(t * 3);
    else if (state === "listening") target = 0.06;
    level += (target - level) * 0.15;

    const breathe = 1 + 0.04 * Math.sin(t * 1.4);   // gentle idle breathing
    const pulse = 1 + level * 0.5;                   // voice pulse
    const r = base * breathe * pulse;

    ctx.save();
    ctx.shadowColor = `rgba(${palette.glow},${0.45 + level * 0.4})`;
    ctx.shadowBlur = 36 + level * 80;

    const g = ctx.createRadialGradient(cx, cy - r * 0.18, r * 0.1, cx, cy, r);
    g.addColorStop(0, palette.core);
    g.addColorStop(0.38, palette.inner);
    g.addColorStop(1, palette.outer);
    ctx.fillStyle = g;

    // Organic blob edge: low-frequency wobble + voice-driven ripple.
    ctx.beginPath();
    const segs = 56;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wob =
        1 +
        0.05 * Math.sin(a * 3 + t * 1.7) +
        0.035 * Math.sin(a * 5 - t * 1.1) +
        level * 0.14 * Math.sin(a * 4 + t * 4.5);
      const rr = r * wob;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Soft inner ring that brightens with the voice.
    if (level > 0.02) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${0.12 + level * 0.25})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ── companionAvatar interface (chat.js drives these) ─────────────────────────
  bridge.setState = (s) => { state = s || "idle"; };
  bridge.setAnalyser = (node) => { analyser = node; };
  bridge.setIdentity = () => {};   // no gendered face; the voice carries identity
  bridge.setColors = (c) => {
    if (!c) return;
    palette = {
      core: c.core || "#ffffff",
      inner: c.eyes || c.outline || palette.inner,
      outer: c.gradient || c.face || palette.outer,
      glow: c.glow || palette.glow,
    };
  };
})();
