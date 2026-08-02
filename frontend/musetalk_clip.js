// Talking-head clip player (AVATAR_BACKEND=video, Phase 2).
//
// In video mode the backend renders each reply as an mp4 of the character's real
// portrait speaking (audio baked in) and sends {type:"avatar_clip", url}. chat.js
// calls window.poppyPlayClip(url); this module plays that clip over the avatar stage
// and drives the shared avatar state so the rest of the UI behaves normally.
//
// Self-contained and inert until called: in the default "3d" avatar mode the backend
// never sends avatar_clip, so this never runs.
(function () {
  let videoEl = null;

  function ensureVideo() {
    if (videoEl) return videoEl;
    const stage = document.getElementById("avatar3d") || document.getElementById("stage");
    videoEl = document.createElement("video");
    videoEl.id = "avatar-clip";
    videoEl.playsInline = true;
    videoEl.setAttribute("playsinline", "");
    // The clip carries the voice — this is the one avatar surface that is NOT muted.
    videoEl.muted = false;
    Object.assign(videoEl.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      objectFit: "cover",
      opacity: "0",
      transition: "opacity 220ms ease",
      pointerEvents: "none",
      zIndex: "5",
    });
    (stage || document.body).appendChild(videoEl);
    videoEl.addEventListener("ended", hide);
    videoEl.addEventListener("error", hide);
    return videoEl;
  }

  function hide() {
    if (videoEl) videoEl.style.opacity = "0";
    window.companionAvatar?.setState?.("idle");
  }

  window.poppyPlayClip = function poppyPlayClip(url) {
    if (!url) return;
    const v = ensureVideo();
    window.companionAvatar?.setState?.("speaking");
    v.src = url;
    v.style.opacity = "1";
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch((e) => {
        console.warn("[musetalk_clip] playback failed", e);
        hide();
      });
    }
  };
})();
