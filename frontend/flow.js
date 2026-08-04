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
  let _surfacedLoopId = null;   // the loop she opened on, to resolve at close (§1.3 R3)

  function setView(v) {
    onboarding.classList.toggle("hidden", v !== "onboarding");
    home.classList.toggle("hidden", v !== "home");
    app.classList.toggle("hidden", v !== "call");
    onboarding.setAttribute("aria-hidden", v !== "onboarding");
    home.setAttribute("aria-hidden", v !== "home");
    document.body.dataset.view = v;
    if (v === "call") {
      // #stage just resized to the left column — nudge TalkingHead to refit the canvas.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    }
  }

  // Point the 3D avatar at a character's gender (loads the male/female model).
  function setAvatarGender(gender) {
    const g = gender === "male" ? "male" : "female";
    window._gender = g;
    window.companionAvatar?.setIdentity?.(null, g);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    try {
      profile = await (await fetch(`${BACKEND}/companion`)).json();
    } catch {
      profile = { onboarded: false };
    }
    if (profile.onboarded) {
      // Show home FIRST, so a later error (loadHome, etc.) can't leave the call
      // view (#app) showing by default.
      setView("home");
      setAvatarGender(profile.gender);
      try { await loadHome(); } catch (e) { console.error("[flow] loadHome failed", e); }
    } else {
      startOnboarding();
    }
  }

  // ── Onboarding (§2) ───────────────────────────────────────────────────────────
  const ob = {
    step: "hook",
    order: ["hook", "age", "character", "seed", "call"],
    character: "poppy",
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
    await renderCharacterCards();
  }

  // ── Character picker: a swipeable Tinder-style card stack ──────────────────
  let _cast = [];
  let _charIdx = 0;

  async function renderCharacterCards() {
    const stack = document.getElementById("ob-char-stack");
    if (!stack) return;
    try {
      _cast = await (await fetch(`${BACKEND}/characters`)).json();
    } catch {
      _cast = [];
    }
    _charIdx = 0;
    renderCharStack();
    renderCharDots();
    document.getElementById("char-pass")?.addEventListener("click", () => swipeChar("left"));
    document.getElementById("char-pick")?.addEventListener("click", () => swipeChar("right"));
  }

  function buildCharCard(c) {
    const card = document.createElement("div");
    card.className = "char-card";
    card.dataset.key = c.key;
    const portrait = c.photo
      ? `<img class="char-photo" src="${c.photo}" alt="">`
      : `<span class="char-mono">${c.name[0]}</span>`;
    card.innerHTML =
      `<div class="char-portrait" style="background:linear-gradient(155deg, ${c.color.gradient}, ${c.color.face})">` +
        portrait +
        `<div class="char-scrim"></div>` +
        // name + what they are, overlaid on the portrait so they're always visible
        `<div class="char-info">` +
          `<div class="char-name">${c.name}<span class="char-gsym">${c.gender === "male" ? "♂" : "♀"}</span></div>` +
          `<div class="char-tag">${c.tagline}</div>` +
        `</div>` +
        // Warm, relevant labels — you're meeting companions, not judging people.
        `<span class="char-tag-pick">CHOOSE</span><span class="char-tag-pass">NEXT</span>` +
      `</div>`;
    // If a portrait image is set but missing/broken, fall back to the colour monogram.
    if (c.photo) {
      const img = card.querySelector(".char-photo");
      img.onerror = () => {
        const s = document.createElement("span");
        s.className = "char-mono";
        s.textContent = c.name[0];
        img.replaceWith(s);
      };
    }
    return card;
  }

  function renderCharStack() {
    const stack = document.getElementById("ob-char-stack");
    if (!stack || !_cast.length) return;
    stack.innerHTML = "";
    if (_cast.length > 1) {
      const behind = buildCharCard(_cast[(_charIdx + 1) % _cast.length]);
      behind.classList.add("behind");
      stack.appendChild(behind);
    }
    const front = buildCharCard(_cast[_charIdx]);
    stack.appendChild(front);
    attachCharDrag(front);
    highlightCharDot();
  }

  function selectCharacter(c) {
    ob.character = c.key;
    ob.name = c.name;
    setAvatarGender(c.gender); // the avatar behind switches to match
    if (c.color) window.companionAvatar?.setColors?.(c.color); // tint the orb
    const ready = document.getElementById("ob-ready");
    if (ready) ready.textContent = `${c.name} is ready when you are.`;
    nextStep();
  }

  function swipeChar(dir) {
    const front = document.querySelector("#ob-char-stack .char-card:not(.behind)");
    if (!front) return;
    front.style.transition = "transform 0.35s ease, opacity 0.35s ease";
    front.classList.add(dir === "right" ? "swipe-right" : "swipe-left");
    const chosen = _cast[_charIdx];
    setTimeout(() => {
      if (dir === "right") selectCharacter(chosen);
      else { _charIdx = (_charIdx + 1) % _cast.length; renderCharStack(); }
    }, 320);
  }

  function attachCharDrag(card) {
    let sx = 0, dx = 0, dragging = false;
    card.addEventListener("pointerdown", (e) => {
      dragging = true; sx = e.clientX; dx = 0;
      card.style.transition = "none";
      try { card.setPointerCapture(e.pointerId); } catch {}
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dx = e.clientX - sx;
      card.style.transform = `translateX(${dx}px) rotate(${dx * 0.05}deg)`;
      card.style.setProperty("--pick-op", Math.max(0, Math.min(1, dx / 110)));
      card.style.setProperty("--pass-op", Math.max(0, Math.min(1, -dx / 110)));
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      card.style.transition = "transform 0.3s ease";
      if (dx > 95) swipeChar("right");
      else if (dx < -95) swipeChar("left");
      else {
        card.style.transform = "";
        card.style.setProperty("--pick-op", 0);
        card.style.setProperty("--pass-op", 0);
      }
      dx = 0;
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  function renderCharDots() {
    const dots = document.getElementById("char-dots");
    if (!dots) return;
    dots.innerHTML = _cast.map(() => "<i></i>").join("");
    highlightCharDot();
  }
  function highlightCharDot() {
    const dots = document.getElementById("char-dots");
    if (!dots) return;
    [...dots.children].forEach((d, i) => d.classList.toggle("on", i === _charIdx));
  }

  // "Next" buttons within onboarding advance the stepper.
  onboarding.addEventListener("click", (e) => {
    if (e.target.closest("[data-next]")) nextStep();
  });

  // The first call — completes onboarding, then dials straight in (§2.6).
  document.getElementById("ob-call")?.addEventListener("click", async () => {
    ob.seed = (document.getElementById("ob-seed")?.value || "").trim();
    try {
      profile = await (await fetch(`${BACKEND}/companion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: ob.character }),
      })).json();
      setAvatarGender(profile.gender);
    } catch {}
    startCall({ seed: ob.seed });
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
    if (h.gender) setAvatarGender(h.gender);
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
    checkRitualDue();

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

    // Tint the orb to the current character, and offer a way to switch companion.
    tintOrbForCurrent(h.character || (profile && profile.character));
    ensureSwitchButton();
  }

  // ── Change companion from home (memory/voice/orb all swap with it) ───────────
  function tintOrbForCurrent(key) {
    if (!key || !window.companionAvatar) return;
    const hit = (_cast || []).find((x) => x.key === key);
    if (hit && hit.color) { window.companionAvatar.setColors(hit.color); return; }
    fetch(`${BACKEND}/characters`).then((r) => r.json()).then((cast) => {
      _cast = cast;
      const c = cast.find((x) => x.key === key);
      if (c && c.color) window.companionAvatar.setColors(c.color);
    }).catch(() => {});
  }

  function ensureSwitchButton() {
    if (document.getElementById("home-switch")) return;
    const host = document.getElementById("home-modes")?.parentNode || home;
    const b = document.createElement("button");
    b.id = "home-switch";
    b.type = "button";
    b.textContent = "Change companion";
    Object.assign(b.style, {
      display: "block", margin: "14px auto 0", padding: "10px 16px",
      borderRadius: "10px", border: "1px solid rgba(255,255,255,0.28)",
      background: "rgba(255,255,255,0.06)", color: "inherit",
      fontWeight: "700", cursor: "pointer",
    });
    b.addEventListener("click", openCharacterSwitch);
    host.appendChild(b);
  }

  async function openCharacterSwitch() {
    let cast = _cast;
    if (!cast || !cast.length) {
      try { cast = _cast = await (await fetch(`${BACKEND}/characters`)).json(); }
      catch { return; }
    }
    const current = profile && profile.character;
    const ov = document.createElement("div");
    ov.id = "char-switch";
    Object.assign(ov.style, {
      position: "fixed", inset: "0", zIndex: "70", padding: "24px",
      background: "rgba(5,10,7,0.80)", backdropFilter: "blur(12px)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", gap: "16px",
    });
    const title = document.createElement("div");
    title.textContent = "Who do you want to talk to?";
    Object.assign(title.style, { color: "#eaf3ec", fontWeight: "800", fontSize: "1.15rem" });
    const grid = document.createElement("div");
    Object.assign(grid.style, {
      display: "grid", gridTemplateColumns: "repeat(3, minmax(96px, 120px))",
      gap: "12px", maxWidth: "420px",
    });
    cast.forEach((c) => {
      const card = document.createElement("button");
      card.type = "button";
      Object.assign(card.style, {
        border: "2px solid " + (c.key === current ? (c.color?.outline || "#7c6ef0") : "rgba(255,255,255,0.14)"),
        borderRadius: "14px", overflow: "hidden", cursor: "pointer",
        background: (c.color && c.color.gradient) || "#12100f", color: "#eaf3ec", padding: "0",
      });
      const img = c.photo
        ? `<img src="${c.photo}" style="width:100%;height:96px;object-fit:cover;display:block" onerror="this.remove()">`
        : "";
      card.innerHTML = img +
        `<div style="padding:7px 4px;font-weight:700;font-size:.86rem">${c.name}${c.key === current ? " •" : ""}</div>`;
      card.addEventListener("click", () => chooseCharacter(c, ov));
      grid.appendChild(card);
    });
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    Object.assign(cancel.style, {
      padding: "9px 18px", borderRadius: "9px", border: "1px solid rgba(255,255,255,0.25)",
      background: "transparent", color: "#eaf3ec", fontWeight: "700", cursor: "pointer",
    });
    cancel.addEventListener("click", () => ov.remove());
    ov.append(title, grid, cancel);
    document.body.appendChild(ov);
  }

  async function chooseCharacter(c, ov) {
    try {
      profile = await (await fetch(`${BACKEND}/companion/character`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: c.key }),
      })).json();
    } catch {}
    setAvatarGender(c.gender);
    if (c.color) window.companionAvatar?.setColors?.(c.color);
    if (ov) ov.remove();
    await loadHome();
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

  // ── Daily ritual (§6): the user picks a morning/night time. The reminder is
  // surfaced two ways: a reliable in-app banner polled from the backend (works
  // everywhere, including the packaged webview), and a Web Notification where the
  // environment supports it. Push when the app is CLOSED is thin-cloud/mobile (D2).
  let _ritualTimer = null;

  const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  function fmt12(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
  }

  function renderRitual(h) {
    const box = document.getElementById("home-ritual");
    if (!box) return;
    box.innerHTML = "";
    if (h.ritual_kind && h.ritual_time) {
      const label = document.createElement("span");
      label.className = "ritual-current";
      label.textContent = `${cap(h.ritual_kind)} check-in at ${fmt12(h.ritual_time)}`;
      const change = document.createElement("button");
      change.type = "button";
      change.className = "ritual-link";
      change.textContent = "Change";
      change.addEventListener("click", () => openRitualPicker(h));
      box.append(label, change);
      scheduleWebNotification(h.ritual_time);
    } else {
      const set = document.createElement("button");
      set.type = "button";
      set.className = "ritual-link";
      set.textContent = "+ Set a daily time with Poppy";
      set.addEventListener("click", () => openRitualPicker(h));
      box.appendChild(set);
    }
  }

  function openRitualPicker(h) {
    const box = document.getElementById("home-ritual");
    box.innerHTML = "";
    let chosenKind = h.ritual_kind || "morning";

    const kinds = document.createElement("div");
    kinds.className = "ritual-kinds";
    const time = document.createElement("input");
    time.type = "time";
    time.className = "ritual-time";
    time.value = h.ritual_time || "08:00";

    [["morning", "Morning"], ["night", "Night"]].forEach(([v, t]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ritual-kind-btn" + (v === chosenKind ? " active" : "");
      b.textContent = t;
      b.addEventListener("click", () => {
        chosenKind = v;
        kinds.querySelectorAll(".ritual-kind-btn").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (!h.ritual_time) time.value = v === "night" ? "21:30" : "08:00";
      });
      kinds.appendChild(b);
    });

    const save = document.createElement("button");
    save.type = "button";
    save.className = "ritual-save";
    save.textContent = "Save reminder";
    save.addEventListener("click", async () => {
      if (window.Notification && Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch {}
      }
      await fetch(`${BACKEND}/ritual`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: chosenKind, time: time.value }),
      }).catch(() => {});
      await loadHome();
      checkRitualDue();
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

    const editor = document.createElement("div");
    editor.className = "ritual-editor";
    editor.append(kinds, time, save);
    box.append(editor, clear);
  }

  // The reliable path: ask the backend if a reminder is due and show an in-app
  // banner. Polled every minute while on Home, so it appears right at the set time.
  async function checkRitualDue() {
    const box = document.getElementById("home-reminder");
    if (!box || document.body.dataset.view !== "home") return;
    let due = {};
    try { due = await (await fetch(`${BACKEND}/ritual/due`)).json(); } catch {}
    if (!due.due) { box.classList.add("hidden"); return; }
    box.innerHTML = "";
    const msg = document.createElement("span");
    msg.className = "reminder-text";
    msg.textContent = due.text || "Time for your check-in with Poppy.";
    const call = document.createElement("button");
    call.type = "button";
    call.className = "reminder-call";
    call.textContent = "Call now";
    call.addEventListener("click", () => { box.classList.add("hidden"); startCall({}); });
    const later = document.createElement("button");
    later.type = "button";
    later.className = "reminder-later";
    later.textContent = "Later";
    later.addEventListener("click", async () => {
      await fetch(`${BACKEND}/ritual/dismiss`, { method: "POST" }).catch(() => {});
      box.classList.add("hidden");
    });
    box.append(msg, call, later);
    box.classList.remove("hidden");
  }
  setInterval(checkRitualDue, 30000);
  // Timers are throttled/suspended while the window is backgrounded, so also
  // re-check the moment the app regains focus or becomes visible again.
  window.addEventListener("focus", checkRitualDue);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkRitualDue(); });

  // Bonus path where supported: a real OS notification at the set time.
  function scheduleWebNotification(hhmm) {
    if (_ritualTimer) clearTimeout(_ritualTimer);
    const [h, m] = hhmm.split(":").map(Number);
    const now = new Date();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    _ritualTimer = setTimeout(async () => {
      try {
        const { text } = await (await fetch(`${BACKEND}/nudge`)).json();
        if (window.Notification && Notification.permission === "granted") {
          new Notification((profile && profile.companion_name) || "Poppy", { body: text });
        }
      } catch {}
      checkRitualDue();
      scheduleWebNotification(hhmm);
    }, next - now);
  }

  // ── Call lifecycle (§4) ─────────────────────────────────────────────────────────
  async function startCall({ seed = "", vibe = null, mode = null } = {}) {
    let r = {};
    try {
      r = await (await fetch(`${BACKEND}/call/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, mode }),
      })).json();
    } catch {}

    // Abundance-moment upgrade prompt (§8). The backend only returns this when it's
    // a non-vulnerable call over the fair free limit — it's impossible here otherwise.
    if (r.paywall) {
      showPaywall(r.paywall, { seed, vibe, mode });
      return;
    }

    if (vibe && window.PersonaPicker) window.PersonaPicker.select(vibe);
    if (profile && profile.gender) setAvatarGender(profile.gender);
    const nm = document.getElementById("call-name");
    if (nm) nm.textContent = (profile && profile.companion_name) || "Poppy";
    const transcript = document.getElementById("transcript");
    if (transcript) transcript.innerHTML = "";
    window._lastUserText = "";
    setView("call");

    const opening = r.opening || "";
    if (r.profile) profile = r.profile;
    _callbackOffered = !!r.callback_offered;
    _surfacedLoopId = r.surfaced_loop_id || null;
    _callStart = Date.now();

    // "Calling…" veil until she picks up (hidden when she starts speaking).
    const veil = document.getElementById("connect-veil");
    const cn = document.getElementById("connect-name");
    if (cn) cn.textContent = (profile && profile.companion_name) || "Poppy";
    veil?.classList.remove("hidden");
    if (_veilFallback) clearTimeout(_veilFallback);
    _veilFallback = setTimeout(() => veil?.classList.add("hidden"), 7000);

    // She speaks first (§4). A short beat so the view has settled and engines are
    // warm, then her voice opens the call.
    setTimeout(() => window.speakLine?.(opening), 350);
  }
  let _veilFallback = null;

  // Hide the connect veil the moment she actually starts speaking.
  (function watchConnect() {
    const dot = document.getElementById("status-dot");
    if (!dot) return;
    new MutationObserver(() => {
      if (dot.classList.contains("speaking")) {
        document.getElementById("connect-veil")?.classList.add("hidden");
      }
    }).observe(dot, { attributes: true, attributeFilter: ["class"] });
  })();

  // ── Upgrade prompt (§8) — abundance framing, never shown at a vulnerable moment ──
  const paywall = document.getElementById("paywall");

  function showPaywall(ent, retry) {
    const plus = (ent.tiers && ent.tiers.plus) || ent.tier || {};
    paywall.innerHTML = "";
    const card = document.createElement("div");
    card.className = "paywall-card";

    const eyebrow = document.createElement("p");
    eyebrow.className = "paywall-eyebrow";
    eyebrow.textContent = "You two talk a lot";
    const head = document.createElement("h2");
    head.className = "paywall-head";
    head.textContent = "Go unlimited with Poppy Plus?";
    const price = document.createElement("p");
    price.className = "paywall-price";
    price.textContent = plus.price || "";

    const ul = document.createElement("ul");
    ul.className = "paywall-features";
    (plus.features || []).forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f;
      ul.appendChild(li);
    });

    const go = document.createElement("button");
    go.type = "button";
    go.className = "paywall-go";
    go.textContent = "Go unlimited";
    go.addEventListener("click", async () => {
      try {
        await fetch(`${BACKEND}/entitlement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: "plus" }),
        });
      } catch {}
      paywall.classList.add("hidden");
      startCall(retry); // now unlimited — dial straight in
    });

    const later = document.createElement("button");
    later.type = "button";
    later.className = "paywall-later";
    later.textContent = "Maybe later";
    later.addEventListener("click", () => {
      paywall.classList.add("hidden");
      setView("home");
    });

    card.append(eyebrow, head, price, ul, go, later);
    paywall.appendChild(card);
    paywall.classList.remove("hidden");
  }

  document.getElementById("end-call-btn")?.addEventListener("click", endCall);

  // ACT 3 (RETENTION_ENGINE §7): warm sign-off, then the new open loop rendered as
  // a keepsake card. The hook is written by the backend from the conversation and
  // spoken in her voice — the old build used the user's own last sentence here,
  // which meant she opened the next call by quoting them back at themselves.
  async function endCall() {
    try { window.interruptReply?.(); } catch {}

    // Show the card immediately so hanging up never feels abrupt; the hook lands
    // on it a moment later, once the backend has authored it.
    const outro = document.getElementById("outro");
    const rem = document.getElementById("outro-remember");
    const remText = document.getElementById("outro-remember-text");
    document.getElementById("outro-line").textContent = "Talk soon, okay?";
    rem.classList.add("hidden");
    outro?.classList.remove("hidden");

    const durationS = _callStart ? (Date.now() - _callStart) / 1000 : 0;
    let planted = "";
    try {
      const r = await (await fetch(`${BACKEND}/call/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_s: durationS,
          callback_offered: _callbackOffered,
          surfaced_loop_id: _surfacedLoopId || undefined,
        }),
      })).json();
      planted = (r && r.open_loop) || "";
    } catch {}

    if (planted) {
      const signoff = "I'll be thinking about you. Tell me how it goes, okay?";
      document.getElementById("outro-line").textContent = signoff;
      remText.textContent = planted;
      rem.classList.remove("hidden");
      window.speakLine?.(signoff);
    }

    _callStart = 0;
    _surfacedLoopId = null;
    window._lastUserText = "";
  }

  document.getElementById("outro-done")?.addEventListener("click", async () => {
    document.getElementById("outro")?.classList.add("hidden");
    try { window.interruptReply?.(); } catch {}
    await loadHome();
    setView("home");
  });
  document.getElementById("outro-again")?.addEventListener("click", () => {
    document.getElementById("outro")?.classList.add("hidden");
    try { window.interruptReply?.(); } catch {}
    startCall({ vibe: (profile && profile.vibe) || null });
  });

  boot();
})();
