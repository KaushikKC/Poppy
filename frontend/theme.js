/**
 * Light, dark, or whatever the device is doing.
 *
 * Both skins already existed in tokens.css and neither could be chosen: the day
 * palette is the `:root` default, dark arrives through `prefers-color-scheme`, and
 * nothing in the app ever set `data-theme`. So the app followed the phone and that
 * was the whole of it.
 *
 * Three states, matching the design system's Appearance screen:
 *
 *   auto   no attribute      the media query decides, which is the default
 *   light  data-theme=light  pins the day skin, and the media query stands down
 *                            because its rule is :root:not([data-theme="light"])
 *   dark   data-theme=dark   pins the dark skin in either system setting
 *
 * Loaded from <head> and applied synchronously, before the body is parsed. A theme
 * applied after first paint is a white flash on every launch for anyone who chose
 * dark, which is exactly the moment the choice was supposed to matter.
 *
 * The wind-down skin (body[data-mood="night"]) is deliberately untouched by this. It
 * dims past whichever theme is picked, because it belongs to the ritual rather than to
 * the appearance setting.
 */
(function () {
  const KEY = "poppys.theme";
  const MODES = ["auto", "light", "dark"];

  function stored() {
    try {
      const v = localStorage.getItem(KEY);
      return MODES.includes(v) ? v : "auto";
    } catch {
      // Private mode, or storage disabled. Auto is the honest fallback: it is what
      // the app did before there was a setting at all.
      return "auto";
    }
  }

  function apply(mode) {
    const root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }

  // Before anything renders.
  apply(stored());

  window.Theme = {
    get() {
      return stored();
    },
    set(mode) {
      const next = MODES.includes(mode) ? mode : "auto";
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* the choice still applies for this session */
      }
      window.dispatchEvent(new CustomEvent("themechange", { detail: next }));
      return next;
    },
    /** What is actually on screen right now, auto resolved against the device. */
    resolved() {
      const mode = stored();
      if (mode !== "auto") return mode;
      return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
  };
})();
