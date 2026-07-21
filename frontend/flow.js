// View orchestrator — the product loop from POPPY_PRODUCT_PLAYBOOK: onboarding
// (§2) → home (§3) → call (§4) → home. The existing chat + avatar surface (#app)
// is the "in-call" view; this file decides which view is showing and drives the
// call lifecycle against the backend (/companion, /call/open, /call/close, /home).
(function () {
  const BACKEND = window.BACKEND || "http://localhost:8000";

  const onboarding = document.getElementById("onboarding");
  const home = document.getElementById("home");
  const app = document.getElementById("app");

  // Mood modes (§3/§6) — each is a pre-framed call so the user never faces a
  // blank slate. A mode just pre-selects the fitting vibe; "Just talk" keeps
  // whatever vibe is current.
  const MODES = [
    { key: "vent", label: "Vent", vibe: "friend" },
    { key: "hype", label: "Hype me up", vibe: "hype" },
    { key: "wind", label: "Wind down", vibe: "calm" },
    { key: "plan", label: "Plan my day", vibe: "partner" },
    { key: "talk", label: "Just talk", vibe: null },
  ];

  let profile = null;

  function setView(v) {
    onboarding.classList.toggle("hidden", v !== "onboarding");
    home.classList.toggle("hidden", v !== "home");
    app.classList.toggle("hidden", v !== "call");
    onboarding.setAttribute("aria-hidden", v !== "onboarding");
    home.setAttribute("aria-hidden", v !== "home");
    document.body.dataset.view = v;
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    try {
      profile = await (await fetch(`${BACKEND}/companion`)).json();
    } catch {
      profile = { onboarded: false };
    }
    if (profile.onboarded) {
      await loadHome();
      setView("home");
    } else {
      startOnboarding();
    }
  }

  // ── Onboarding (§2) ───────────────────────────────────────────────────────────
  const ob = {
    step: "hook",
    order: ["hook", "age", "vibe", "name", "seed", "call"],
    vibe: "friend",
    avatar: "avaturn",
    name: "Poppy",
    seed: "",
  };

  function showStep(step) {
    ob.step = step;
    onboarding.querySelectorAll(".ob-screen").forEach((s) => {
      s.classList.toggle("hidden", s.dataset.step !== step);
    });
  }

  function nextStep() {
    const i = ob.order.indexOf(ob.step);
    if (i < ob.order.length - 1) showStep(ob.order[i + 1]);
  }

  async function startOnboarding() {
    setView("onboarding");
    showStep("hook");
    await renderVibeCards();
    renderLooks();
  }

  async function renderVibeCards() {
    const box = document.getElementById("ob-vibes");
    if (!box) return;
    let vibes = [];
    try {
      vibes = await (await fetch(`${BACKEND}/personas`)).json();
    } catch {
      vibes = [];
    }
    box.innerHTML = "";
    vibes.forEach((v) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "ob-vibe";
      card.style.setProperty("--vibe-color", v.avatar.outline);
      card.innerHTML = `<strong>${v.name}</strong><span>${v.description}</span>`;
      card.addEventListener("click", () => {
        ob.vibe = v.key;
        box.querySelectorAll(".ob-vibe").forEach((c) => c.classList.remove("chosen"));
        card.classList.add("chosen");
        setTimeout(nextStep, 220); // let the selection register, then advance
      });
      box.appendChild(card);
    });
  }

  // A few looks to choose from (§4). The choice is stored on the profile; the
  // live 3D model swap is a later enhancement, so today this sets the accent look.
  const LOOKS = [
    { id: "avaturn", label: "Look 1" },
    { id: "brunette", label: "Look 2" },
    { id: "avatarsdk", label: "Look 3" },
  ];

  function renderLooks() {
    const box = document.getElementById("ob-looks");
    if (!box) return;
    box.innerHTML = "";
    LOOKS.forEach((l, i) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "ob-look" + (i === 0 ? " chosen" : "");
      chip.textContent = l.label;
      chip.addEventListener("click", () => {
        ob.avatar = l.id;
        box.querySelectorAll(".ob-look").forEach((c) => c.classList.remove("chosen"));
        chip.classList.add("chosen");
      });
      box.appendChild(chip);
    });
  }

  // "Next" buttons within onboarding advance the stepper.
  onboarding.addEventListener("click", (e) => {
    if (e.target.closest("[data-next]")) nextStep();
  });

  // The first call — completes onboarding, then dials straight in (§2.6).
  document.getElementById("ob-call")?.addEventListener("click", async () => {
    ob.name = (document.getElementById("ob-name")?.value || "Poppy").trim() || "Poppy";
    ob.seed = (document.getElementById("ob-seed")?.value || "").trim();
    try {
      profile = await (await fetch(`${BACKEND}/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companion_name: ob.name, vibe: ob.vibe, avatar: ob.avatar }),
      })).json();
    } catch {}
    startCall({ seed: ob.seed, vibe: ob.vibe });
  });

  // Capture the seed as they type so it survives the "That's it" tap.
  document.getElementById("ob-seed")?.addEventListener("input", (e) => {
    ob.seed = e.target.value.trim();
  });

  // ── Home (§3) ─────────────────────────────────────────────────────────────────
  async function loadHome() {
    let h = {};
    try {
      h = await (await fetch(`${BACKEND}/home`)).json();
    } catch {}
    document.getElementById("home-name").textContent = h.companion_name || "Poppy";
    const remembers = document.getElementById("home-remembers");
    remembers.textContent = h.remembers || "";
    remembers.classList.toggle("hidden", !h.remembers);

    const streak = document.getElementById("home-streak");
    if (h.current_streak > 1) {
      streak.textContent = `${h.current_streak} day streak`;
      streak.classList.remove("hidden");
    } else {
      streak.classList.add("hidden");
    }

    const modes = document.getElementById("home-modes");
    if (modes && !modes.dataset.built) {
      MODES.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "home-mode";
        b.textContent = m.label;
        b.addEventListener("click", () => startCall({ vibe: m.vibe }));
        modes.appendChild(b);
      });
      modes.dataset.built = "1";
    }
  }

  document.getElementById("home-call")?.addEventListener("click", () => {
    startCall({ vibe: (profile && profile.vibe) || null });
  });

  // ── Call lifecycle (§4) ─────────────────────────────────────────────────────────
  async function startCall({ seed = "", vibe = null } = {}) {
    if (vibe && window.PersonaPicker) window.PersonaPicker.select(vibe);
    const transcript = document.getElementById("transcript");
    if (transcript) transcript.innerHTML = "";
    window._lastUserText = "";
    setView("call");

    let opening = "";
    try {
      const r = await (await fetch(`${BACKEND}/call/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed }),
      })).json();
      opening = r.opening || "";
      if (r.profile) profile = r.profile;
    } catch {}

    // She speaks first (§4). A short beat so the view has settled and engines are
    // warm, then her voice opens the call.
    setTimeout(() => window.speakLine?.(opening), 350);
  }

  document.getElementById("end-call-btn")?.addEventListener("click", endCall);

  async function endCall() {
    try { window.interruptReply?.(); } catch {}
    const loop = (window._lastUserText || "").trim();
    // A warm sign-off with a forward hook — the open loop that pulls them back (§4).
    if (loop) window.speakLine?.("I'll be thinking about you. Tell me how it goes, okay?");
    try {
      await fetch(`${BACKEND}/call/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ open_loop: loop || undefined }),
      });
    } catch {}
    window._lastUserText = "";
    await loadHome();
    setTimeout(() => setView("home"), loop ? 600 : 0);
  }

  boot();
})();
