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
    this._ready    = false;

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
    this._img = img;

    // take over the canvas from the cartoon
    this._fallback?.stop();
    this._fallback = null;
    this._ready = true;
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
}

window.PhotoAvatar = PhotoAvatar;
