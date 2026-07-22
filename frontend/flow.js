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
  let _callStart = 0;          // ms timestamp of the current call's connect
  let _callbackOffered = false; // did this call's opener follow up on an open loop

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

    renderPersonalityNotice();
    renderRitual(h);

    const modes = document.getElementById("home-modes");
    if (modes && !modes.dataset.built) {
      MODES.forEach((m) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "home-mode";
        b.textContent = m.label;
        b.addEventListener("click", () => startCall({ vibe: m.vibe, mode: m.key }));
        modes.appendChild(b);
      });
      modes.dataset.built = "1";
    }
  }

  // §3.6 — if Poppy's personality changed under the user (model/prompt update),
  // tell them plainly rather than letting her shift silently.
  async function renderPersonalityNotice() {
    const box = document.getElementById("home-update");
    if (!box) return;
    let status = {};
    try {
      status = await (await fetch(`${BACKEND}/companion/personality`)).json();
    } catch {}
    if (!status.pending) {
      box.classList.add("hidden");
      return;
    }
    box.innerHTML = "";
    const msg = document.createElement("span");
    msg.textContent = "Poppy's had a small update since you two met. She's still her.";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = "Got it";
    ok.addEventListener("click", async () => {
      await fetch(`${BACKEND}/companion/personality/accept`, { method: "POST" }).catch(() => {});
      box.classList.add("hidden");
    });
    box.append(msg, ok);
    box.classList.remove("hidden");
  }

  document.getElementById("home-call")?.addEventListener("click", () => {
    startCall({ vibe: (profile && profile.vibe) || null });
  });

  // ── Daily ritual (§6): the user picks a morning/night time; while the app is
  // open we surface an earned, guardrailed nudge at that time. Real push when the
  // app is closed is the thin-cloud/mobile piece (D2), stubbed on desktop. ──
  let _ritualTimer = null;

  function renderRitual(h) {
    const box = document.getElementById("home-ritual");
    if (!box) return;
    box.innerHTML = "";
    if (h.ritual_kind && h.ritual_time) {
      const label = document.createElement("span");
      label.textContent = `Your ${h.ritual_kind} check-in, ${h.ritual_time}`;
      const change = document.createElement("button");
      change.type = "button";
      change.className = "ritual-link";
      change.textContent = "change";
      change.addEventListener("click", () => openRitualPicker(h));
      box.append(label, change);
      scheduleRitualReminder(h.ritual_time);
    } else {
      const set = document.createElement("button");
      set.type = "button";
      set.className = "ritual-link";
      set.textContent = "Set a daily time with Poppy";
      set.addEventListener("click", () => openRitualPicker(h));
      box.appendChild(set);
    }
  }

  function openRitualPicker(h) {
    const box = document.getElementById("home-ritual");
    box.innerHTML = "";
    const kind = document.createElement("select");
    kind.className = "ritual-kind";
    [["morning", "Morning"], ["night", "Night"]].forEach(([v, t]) => {
      const o = document.createElement("option");
      o.value = v; o.textContent = t;
      if (v === h.ritual_kind) o.selected = true;
      kind.appendChild(o);
    });
    const time = document.createElement("input");
    time.type = "time";
    time.className = "ritual-time";
    time.value = h.ritual_time || (kind.value === "night" ? "21:30" : "08:00");

    const save = document.createElement("button");
    save.type = "button";
    save.className = "ritual-save";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      if (window.Notification && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
      await fetch(`${BACKEND}/ritual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind.value, time: time.value }),
      }).catch(() => {});
      await loadHome();
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "ritual-link";
    clear.textContent = "Turn off";
    clear.addEventListener("click", async () => {
      await fetch(`${BACKEND}/ritual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: null }),
      }).catch(() => {});
      if (_ritualTimer) { clearTimeout(_ritualTimer); _ritualTimer = null; }
      await loadHome();
    });

    box.append(kind, time, save, clear);
  }

  function scheduleRitualReminder(hhmm) {
    if (_ritualTimer) clearTimeout(_ritualTimer);
    const [h, m] = hhmm.split(":").map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1); // already passed today
    _ritualTimer = setTimeout(async () => {
      try {
        const { text } = await (await fetch(`${BACKEND}/nudge`)).json();
        if (window.Notification && Notification.permission === "granted") {
          new Notification((profile && profile.companion_name) || "Poppy", { body: text });
        }
      } catch {}
      scheduleRitualReminder(hhmm); // re-arm for tomorrow
    }, next - now);
  }

  // ── Call lifecycle (§4) ─────────────────────────────────────────────────────────
  async function startCall({ seed = "", vibe = null, mode = null } = {}) {
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
        body: JSON.stringify({ seed, mode }),
      })).json();
      opening = r.opening || "";
      if (r.profile) profile = r.profile;
      _callbackOffered = !!r.callback_offered;
    } catch {}
    _callStart = Date.now();

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
    const durationS = _callStart ? (Date.now() - _callStart) / 1000 : 0;
    try {
      await fetch(`${BACKEND}/call/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          open_loop: loop || undefined,
          duration_s: durationS,
          callback_offered: _callbackOffered,
        }),
      });
    } catch {}
    _callStart = 0;
    window._lastUserText = "";
    await loadHome();
    setTimeout(() => setView("home"), loop ? 600 : 0);
  }

  boot();
})();
