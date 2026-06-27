// PhotoAvatar — a photoreal 2D talking head driven by a single portrait photo.
//
// Drop-in replacement for Avatar: same setState / setColors / setIdentity /
// setAnalyser API. Until a photo is configured (or if it fails to load) it
// transparently delegates to the cartoon Avatar, so the app never regresses.

const AVATAR_CONFIG_URL = "avatar/config.json";

class PhotoAvatar {
  constructor(canvasId) {
    this._canvasId = canvasId;
    this._canvas   = document.getElementById(canvasId);
    this._ctx      = this._canvas.getContext("2d");

    this._state   = "idle";
    this._accent  = null;
    this._gender  = null;
    this._colors  = { glow: "124,110,240", outline: "#7c6ef0" };

    this._analyser = null;
    this._timeBuf  = null;
    this._freqBuf  = null;
    this._ready    = false;

    // animation state
    this._open  = 0;   // jaw openness 0..1
    this._wide  = 0;   // mouth shape -1 (round) .. +1 (wide)
    this._eye   = 1;   // 1 = open, 0 = shut
    this._blinkIn = this._rndBlink();
    this._t     = 0;

    // cartoon fallback runs the canvas until (and unless) a photo loads
    this._fallback = window.Avatar ? new window.Avatar(canvasId) : null;

    this._load();
  }

  // public API — delegates to the fallback while it owns the canvas
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
      jawDrop:  cfg.jawDrop ?? 0.05,
      skin:     cfg.skin || null,
      mouthScale: cfg.mouthScale ?? 1,
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
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
    ctx.drawImage(this._base, 0, 0);
  }
}

window.PhotoAvatar = PhotoAvatar;
