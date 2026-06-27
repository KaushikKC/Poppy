// PhotoAvatar — a photoreal 2D talking head driven by a single portrait photo.
//
// Approach (no GPU, no ML at runtime — runs anywhere the cartoon did):
//   * One still portrait is drawn to the canvas ("cover" fit).
//   * The mouth is animated as a 2D puppet: the lower face is shifted down a
//     few pixels (a jaw-drop) and a dark mouth interior + teeth strip is
//     composited in the gap. Viseme width (round "O/U" vs wide "E/I") comes
//     from the audio spectrum.
//   * Eyes blink via a skin-toned eyelid that sweeps over each eye box.
//   * Subtle idle breathing keeps the face alive between turns.
//
// It is a drop-in replacement for Avatar: same setState / setColors /
// setIdentity / setAnalyser API. Until a photo is configured (or if the
// image fails to load) it transparently delegates to the cartoon Avatar, so
// the app never regresses — drop a face in and it upgrades itself.
//
// Add a face:  frontend/avatar/face.jpg  +  frontend/avatar/config.json
// Calibrate:   open the app with ?avatartune=1 to align the mouth/eye boxes.

const AVATAR_CONFIG_URL = "avatar/config.json";

class PhotoAvatar {
  constructor(canvasId) {
    this._canvasId = canvasId;
    this._canvas   = document.getElementById(canvasId);
    this._ctx      = this._canvas.getContext("2d");

    // shared state (mirrored onto the fallback until the photo takes over)
    this._state   = "idle";
    this._accent  = null;
    this._gender  = null;
    this._colors  = { glow: "124,110,240", outline: "#7c6ef0" };

    this._analyser = null;
    this._timeBuf  = null;
    this._freqBuf  = null;

    // animation state
    this._open  = 0;   // jaw openness 0..1
    this._wide  = 0;   // mouth shape -1 (round) .. +1 (wide)
    this._eye   = 1;   // 1 = open, 0 = shut
    this._blinkIn = this._rndBlink();
    this._t     = 0;
    this._ready = false;

    // cartoon fallback runs the canvas until (and unless) a photo loads
    this._fallback = window.Avatar ? new window.Avatar(canvasId) : null;

    this._tune = new URLSearchParams(location.search).has("avatartune");

    this._load();
  }

  // ---- public API (delegates to the fallback while it owns the canvas) -----
  setState(s)  { this._state  = s; this._fallback?.setState(s); }
  setColors(c) { Object.assign(this._colors, c); this._fallback?.setColors(c); }
  setIdentity(accent, gender) {
    this._accent = accent || null;
    this._gender = gender || null;
    this._fallback?.setIdentity?.(accent, gender);
  }
  setAnalyser(node) {
    this._analyser = node;
    this._timeBuf  = new Uint8Array(node.fftSize);
    this._freqBuf  = new Uint8Array(node.frequencyBinCount);
    this._fallback?.setAnalyser(node);
  }

  // ---- asset loading ------------------------------------------------------
  async _load() {
    let cfg;
    try {
      const res = await fetch(AVATAR_CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`config ${res.status}`);
      cfg = await res.json();
    } catch {
      return; // no photo configured → cartoon fallback keeps running
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    const ok = await new Promise((resolve) => {
      img.onload  = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = cfg.image || "avatar/face.jpg";
    });
    if (!ok) return; // bad/missing image → stay on cartoon

    this._cfg = this._normalizeConfig(cfg);
    this._buildBase(img);

    // take over the canvas from the cartoon
    this._fallback?.stop();
    this._fallback = null;
    this._ready = true;
    this._loop();
  }

  _normalizeConfig(cfg) {
    const box = (b, d) => ({
      cx: b?.cx ?? d.cx, cy: b?.cy ?? d.cy,
      w:  b?.w  ?? d.w,  h:  b?.h  ?? d.h,
    });
    return {
      image:    cfg.image || "avatar/face.jpg",
      mouth:    box(cfg.mouth,    { cx: 0.5,  cy: 0.72, w: 0.26, h: 0.12 }),
      leftEye:  box(cfg.leftEye,  { cx: 0.38, cy: 0.46, w: 0.16, h: 0.10 }),
      rightEye: box(cfg.rightEye, { cx: 0.62, cy: 0.46, w: 0.16, h: 0.10 }),
      jawDrop:  cfg.jawDrop ?? 0.05,   // max lower-face shift, fraction of H
      skin:     cfg.skin || null,      // eyelid tint; auto-sampled if null
      mouthScale: cfg.mouthScale ?? 1, // audio→openness sensitivity
    };
  }

  // Pre-render the portrait "cover"-fit onto an offscreen canvas so each frame
  // can cheaply copy sub-rects (jaw region, skin patches) from it.
  _buildBase(img) {
    const W = this._canvas.width, H = this._canvas.height;
    const base = document.createElement("canvas");
    base.width = W; base.height = H;
    const bctx = base.getContext("2d");

    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    bctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh);

    this._base = base;
    this._bctx = bctx;

    // auto-sample a skin tone from just above the mouth if none supplied
    if (!this._cfg.skin) {
      const m = this._cfg.mouth;
      const px = bctx.getImageData(m.cx * W, (m.cy - m.h) * H, 1, 1).data;
      this._cfg.skin = `rgb(${px[0]},${px[1]},${px[2]})`;
    }
  }

  // ---- audio → viseme -----------------------------------------------------
  _rndBlink() { return 2200 + Math.random() * 4200; }

  _sampleAudio() {
    if (!this._analyser || this._state !== "speaking") return { open: 0, wide: 0 };

    this._analyser.getByteTimeDomainData(this._timeBuf);
    let s = 0;
    for (const v of this._timeBuf) { const x = (v - 128) / 128; s += x * x; }
    const rms = Math.sqrt(s / this._timeBuf.length);

    // spectral balance: high-frequency energy → wide vowels/sibilants,
    // low-frequency energy → rounded/open vowels.
    this._analyser.getByteFrequencyData(this._freqBuf);
    const n = this._freqBuf.length, mid = Math.floor(n * 0.45);
    let lo = 0, hi = 0;
    for (let i = 0; i < n; i++) (i < mid ? (lo += this._freqBuf[i]) : (hi += this._freqBuf[i]));
    const total = lo + hi + 1;
    const wide = ((hi - lo) / total) * 1.6; // ~ -1..+1

    return { open: Math.min(1, rms * 6 * this._cfg.mouthScale), wide };
  }

  // ---- render loop --------------------------------------------------------
  _loop() {
    if (!this._ready) return;
    this._t += 16;

    // blink
    this._blinkIn -= 16;
    if (this._blinkIn <= 0 && this._eye === 1) {
      this._eye = 0;
      setTimeout(() => { this._eye = 1; }, 110);
      this._blinkIn = this._rndBlink();
    }

    const { open, wide } = this._sampleAudio();
    this._open += (open - this._open) * 0.28;
    this._wide += (wide - this._wide) * 0.18;

    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const ctx = this._ctx, base = this._base;
    const W = this._canvas.width, H = this._canvas.height;
    const cfg = this._cfg;

    ctx.clearRect(0, 0, W, H);
    ctx.save();

    // subtle idle breathing — a gentle vertical bob keeps the face alive
    const breathe = Math.sin(this._t / 1400) * 1.4;
    ctx.translate(0, breathe);

    // base portrait
    ctx.drawImage(base, 0, 0);

    this._drawMouth(ctx, W, H, cfg);
    this._drawEye(ctx, W, H, cfg.leftEye, cfg);
    this._drawEye(ctx, W, H, cfg.rightEye, cfg);

    ctx.restore();

    // speaking glow ring (persona-tinted), drawn over the full frame
    if (this._state === "speaking" && this._open > 0.06) {
      const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.5;
      const g = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(${this._colors.glow},${0.5 * this._open})`);
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }

    if (this._tune) this._drawTune(ctx, W, H, cfg);
  }

  // Jaw-drop + mouth-interior composite.
  _drawMouth(ctx, W, H, cfg) {
    const m = cfg.mouth;
    const mx = m.cx * W, my = m.cy * H;
    const mw = m.w * W,  mh = m.h * H;
    const open = this._open;
    if (open < 0.02) return; // closed → the photo's own lips show

    const drop = open * cfg.jawDrop * H;

    // 1. shift the lower face (everything below the upper-lip line) downward
    const cutY = Math.round(my - mh * 0.15);
    ctx.drawImage(
      this._base,
      0, cutY, W, H - cutY,
      0, cutY + drop, W, H - cutY
    );

    // 2. carve a mouth opening in the revealed gap
    const round = Math.max(0, -this._wide);     // O/U pucker
    const wideN = Math.max(0, this._wide);      // E/I spread
    const rx = mw * (0.46 + wideN * 0.18 - round * 0.14);
    const ry = mh * (0.18 + open * 0.62);
    const oy = my + drop * 0.45;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(mx, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();

    // dark interior
    const grad = ctx.createLinearGradient(0, oy - ry, 0, oy + ry);
    grad.addColorStop(0, "#2a1418");
    grad.addColorStop(1, "#120608");
    ctx.fillStyle = grad;
    ctx.fillRect(mx - rx, oy - ry, rx * 2, ry * 2);

    // upper teeth strip appears once the mouth is clearly open
    if (open > 0.18) {
      const teethH = ry * 0.4;
      const tg = ctx.createLinearGradient(0, oy - ry, 0, oy - ry + teethH);
      tg.addColorStop(0, "rgba(245,242,235,0.95)");
      tg.addColorStop(1, "rgba(210,205,198,0.2)");
      ctx.fillStyle = tg;
      ctx.fillRect(mx - rx, oy - ry, rx * 2, teethH);
    }
    // tongue hint at the bottom for wide-open vowels
    if (open > 0.45) {
      ctx.beginPath();
      ctx.ellipse(mx, oy + ry * 0.55, rx * 0.7, ry * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(150,60,70,0.55)";
      ctx.fill();
    }
    ctx.restore();

    // soft inner-lip shadow rim so the cut edge reads as a lip, not a seam
    ctx.beginPath();
    ctx.ellipse(mx, oy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(60,20,28,0.45)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Eyelid sweep. Copies a skin patch from just above the eye and slides it
  // down over the eye, then draws a thin lash line at its edge.
  _drawEye(ctx, W, H, e, cfg) {
    const closed = 1 - this._eye;
    if (closed < 0.02) return;

    const ex = e.cx * W, ey = e.cy * H;
    const ew = e.w * W,  eh = e.h * H;
    const lidH = eh * closed * 1.15;

    // skin patch sampled from above the brow, drawn over the eye
    const srcY = Math.max(0, ey - eh * 1.6);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(ex, ey - eh / 2 + lidH / 2, ew / 2, lidH / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      this._base,
      ex - ew / 2, srcY, ew, lidH,
      ex - ew / 2, ey - eh / 2, ew, lidH
    );
    // fall back to a flat skin tint if the patch is too thin to read
    ctx.fillStyle = cfg.skin;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(ex - ew / 2, ey - eh / 2, ew, lidH);
    ctx.restore();

    // lash line
    if (closed > 0.5) {
      ctx.beginPath();
      ctx.moveTo(ex - ew * 0.42, ey - eh / 2 + lidH);
      ctx.quadraticCurveTo(ex, ey - eh / 2 + lidH + eh * 0.08, ex + ew * 0.42, ey - eh / 2 + lidH);
      ctx.strokeStyle = "rgba(40,28,30,0.5)";
      ctx.lineWidth = 1.5;
      ctx.lineCap = "round";
      ctx.stroke();
    }
  }

  // Calibration overlay (?avatartune=1): draw the boxes so they can be aligned.
  _drawTune(ctx, W, H, cfg) {
    const boxes = [["mouth", cfg.mouth, "#ff5d8f"], ["L", cfg.leftEye, "#5dff9b"], ["R", cfg.rightEye, "#5db8ff"]];
    ctx.save();
    ctx.lineWidth = 1; ctx.font = "10px monospace";
    for (const [label, b, col] of boxes) {
      ctx.strokeStyle = col; ctx.fillStyle = col;
      ctx.strokeRect((b.cx - b.w / 2) * W, (b.cy - b.h / 2) * H, b.w * W, b.h * H);
      ctx.fillText(label, (b.cx - b.w / 2) * W + 2, (b.cy - b.h / 2) * H - 2);
    }
    ctx.restore();
  }
}

window.PhotoAvatar = PhotoAvatar;
