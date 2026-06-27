class Avatar {
  constructor(canvasId) {
    this._canvas  = document.getElementById(canvasId);
    this._ctx     = this._canvas.getContext("2d");
    this._state   = "idle";
    this._mouth   = 0;
    this._eyeOpen = 1;
    this._blinkIn = this._rndBlink();
    this._t       = 0;
    this._analyser    = null;
    this._analyserBuf = null;
    this._accent = null;   // identity: drives the flag badge
    this._gender = null;   // identity: drives hair / brows / lips
    this._colors = {
      face:     "#18112e",
      gradient: "#2d2248",
      eyes:     "#9b8ff5",
      outline:  "#7c6ef0",
      glow:     "124,110,240",
    };
    this._loop();
  }

  setState(s)  { this._state = s; }
  setColors(c) { Object.assign(this._colors, c); }
  stop()       { this._stopped = true; }   // PhotoAvatar takes over the canvas

  // Adapt the face to the detected speaker identity. accent → flag badge;
  // gender → hair, eyebrows, and lips. Either may be null (unknown yet).
  setIdentity(accent, gender) {
    this._accent = accent || null;
    this._gender = gender || null;
  }

  setAnalyser(node) {
    this._analyser    = node;
    this._analyserBuf = new Uint8Array(node.frequencyBinCount);
  }

  _rndBlink() { return 2500 + Math.random() * 4000; }

  _amp() {
    if (!this._analyser) return 0;
    this._analyser.getByteTimeDomainData(this._analyserBuf);
    let s = 0;
    for (const v of this._analyserBuf) { const x = (v - 128) / 128; s += x * x; }
    return Math.sqrt(s / this._analyserBuf.length);
  }

  _loop() {
    if (this._stopped) return;
    this._t += 16;

    this._blinkIn -= 16;
    if (this._blinkIn <= 0) {
      this._eyeOpen = 0;
      setTimeout(() => { this._eyeOpen = 1; }, 120);
      this._blinkIn = this._rndBlink();
    }

    const target = this._state === "speaking" ? Math.min(1, this._amp() * 6) : 0;
    this._mouth += (target - this._mouth) * 0.22;

    this._draw();
    requestAnimationFrame(() => this._loop());
  }

  _draw() {
    const cv = this._canvas, ctx = this._ctx;
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.42;

    ctx.clearRect(0, 0, W, H);

    const { face, gradient, eyes, outline, glow } = this._colors;

    // speaking glow
    if (this._state === "speaking" && this._mouth > 0.05) {
      const g = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.35);
      g.addColorStop(0, `rgba(${glow},${0.12 * this._mouth})`);
      g.addColorStop(1, `rgba(${glow},0)`);
      ctx.beginPath(); ctx.arc(cx, cy, R * 1.35, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
    }

    // long hair sits behind the face (female only)
    if (this._gender === "female") this._drawHairBack(ctx, cx, cy, R);

    // face
    const fg = ctx.createRadialGradient(cx, cy - R * 0.15, R * 0.08, cx, cy, R);
    fg.addColorStop(0, gradient);
    fg.addColorStop(1, "#13102000");
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = face; ctx.fill();
    ctx.fillStyle = fg; ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();

    // hair on top of the crown (short for male, fringe for female)
    if (this._gender) this._drawHairTop(ctx, cx, cy, R);

    // eyebrows (thicker for male)
    if (this._gender) this._drawBrows(ctx, cx, cy, R, outline);

    // eyes
    const eyeY = cy - R * 0.2;
    const eyeX = R * 0.33;
    const eRx   = R * 0.115;
    const eRy   = R * 0.155 * Math.max(this._eyeOpen, 0.04);

    for (const ex of [cx - eyeX, cx + eyeX]) {
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, eRx, eRy, 0, 0, Math.PI * 2);
      ctx.fillStyle = eyes; ctx.fill();

      if (this._eyeOpen > 0.15) {
        ctx.beginPath();
        ctx.arc(ex, eyeY, eRx * 0.52, 0, Math.PI * 2);
        ctx.fillStyle = "#06040e"; ctx.fill();

        ctx.beginPath();
        ctx.arc(ex + eRx * 0.22, eyeY - eRy * 0.28, eRx * 0.19, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.72)"; ctx.fill();
      }
    }

    // nose hint
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.045, cy + R * 0.05);
    ctx.quadraticCurveTo(cx, cy + R * 0.17, cx + R * 0.045, cy + R * 0.05);
    ctx.strokeStyle = `rgba(${glow},0.28)`;
    ctx.lineWidth = 1.4; ctx.lineCap = "round"; ctx.stroke();

    // mouth / lips
    const mY  = cy + R * 0.32;
    const mW  = R * 0.38;
    const mH  = R * 0.22 * this._mouth;
    // female lips are fuller and tinted; male lips are a thin neutral line
    const lipColor = this._gender === "female" ? "#d4708f" : outline;

    if (this._mouth < 0.04) {
      ctx.beginPath();
      ctx.moveTo(cx - mW * 0.58, mY);
      ctx.quadraticCurveTo(cx, mY + R * 0.07, cx + mW * 0.58, mY);
      ctx.strokeStyle = lipColor;
      ctx.lineWidth = this._gender === "female" ? 3.5 : 2;
      ctx.lineCap = "round"; ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(cx, mY, mW, mH, 0, 0, Math.PI * 2);
      ctx.fillStyle = "#06040e"; ctx.fill();
      ctx.strokeStyle = lipColor;
      ctx.lineWidth = this._gender === "female" ? 2.5 : 1.5;
      ctx.stroke();

      if (this._mouth > 0.22) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, mY, mW, mH, 0, 0, Math.PI * 2);
        ctx.clip();
        ctx.beginPath();
        ctx.ellipse(cx, mY - mH * 0.55, mW * 0.78, mH * 0.55, 0, 0, Math.PI);
        ctx.fillStyle = "rgba(205,195,255,0.82)"; ctx.fill();
        ctx.restore();
      }
    }

    // accent flag badge (top-right)
    if (this._accent) this._drawFlag(ctx, W, R);
  }

  _hairColor() { return "#241c33"; }

  _drawHairBack(ctx, cx, cy, R) {
    // a rounded mane a bit larger than the face, peeking out at the sides
    ctx.beginPath();
    ctx.ellipse(cx, cy - R * 0.05, R * 1.12, R * 1.18, 0, 0, Math.PI * 2);
    ctx.fillStyle = this._hairColor();
    ctx.fill();
  }

  _drawHairTop(ctx, cx, cy, R) {
    ctx.save();
    ctx.fillStyle = this._hairColor();
    if (this._gender === "male") {
      // short crown cap
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI * 1.18, Math.PI * 1.82);
      ctx.lineTo(cx + R * 0.42, cy - R * 0.52);
      ctx.quadraticCurveTo(cx, cy - R * 0.82, cx - R * 0.42, cy - R * 0.52);
      ctx.closePath();
      ctx.fill();
    } else {
      // soft fringe across the forehead
      ctx.beginPath();
      ctx.arc(cx, cy, R, Math.PI * 1.05, Math.PI * 1.95);
      ctx.quadraticCurveTo(cx, cy - R * 0.35, cx - R * 0.62, cy - R * 0.62);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _drawBrows(ctx, cx, cy, R, outline) {
    const browY = cy - R * 0.42;
    const eyeX  = R * 0.33;
    const halfW = R * 0.13;
    ctx.strokeStyle = outline;
    ctx.lineWidth = this._gender === "male" ? 4 : 2.2;
    ctx.lineCap = "round";
    for (const ex of [cx - eyeX, cx + eyeX]) {
      ctx.beginPath();
      ctx.moveTo(ex - halfW, browY + (this._gender === "male" ? 0 : R * 0.02));
      ctx.quadraticCurveTo(ex, browY - R * 0.04, ex + halfW, browY);
      ctx.stroke();
    }
  }

  _drawFlag(ctx, W, R) {
    const flags = { american: "🇺🇸", british: "🇬🇧", indian: "🇮🇳" };
    const flag = flags[this._accent];
    if (!flag) return;
    ctx.save();
    ctx.font = `${Math.round(R * 0.34)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(flag, W - R * 0.12, R * 0.12);
    ctx.restore();
  }
}

window.Avatar = Avatar;
