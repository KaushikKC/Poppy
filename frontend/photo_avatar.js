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
    // photo loading is added in a later commit; until then the cartoon runs
    return;
  }
}

window.PhotoAvatar = PhotoAvatar;
