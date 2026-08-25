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
  let _callMode = "talk";       // the mood this call entered with (§3.1 flower identity)
  let _callModeIsNew = false;   // first time using this mood (§4.3 quest)
  // Which moods have ever been used, so "try a mood you haven't used" is real.
  let _moodsUsed = new Set();
  try { _moodsUsed = new Set(JSON.parse(localStorage.getItem("poppy_moods") || "[]")); } catch {}

  function setView(v) {
    onboarding.classList.toggle("hidden", v !== "onboarding");
    home.classList.toggle("hidden", v !== "home");
    app.classList.toggle("hidden", v !== "chat");
    onboarding.setAttribute("aria-hidden", v !== "onboarding");
    home.setAttribute("aria-hidden", v !== "home");
    document.body.dataset.view = v;
    // Onboarding is a sequence, not a place, so it has no navigation. Everywhere
    // else does.
    const bar = document.getElementById("tabbar");
    if (bar) {
      bar.classList.toggle("hidden", v === "onboarding");
      markTab(v === "home" ? "you" : "thread");
    }
    if (v === "chat") {
      // The orb's container just became a 42px slot in the header; nudge it to refit.
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    }
  }

  // Point the 3D avatar at a character's gender (loads the male/female model),
  // and swap the app's pronouns with it. Every place the companion can change
  // already routes through here, so this is the one hook the chrome needs: half
  // the cast is male and the whole app used to say "she" regardless.
  // The companion's name, everywhere the chrome says it: the thread header and the
  // tab that leads back to the thread.
  function nameCompanion(name) {
    const who = name || "Poppy";
    const nm = document.getElementById("call-name");
    if (nm) nm.textContent = who;
    const tab = document.getElementById("tab-thread-label");
    if (tab) tab.textContent = who;
  }

  function setAvatarGender(gender) {
    const g = gender === "male" ? "male" : "female";
    window._gender = g;
    window.companionAvatar?.setIdentity?.(null, g);
    window.Pronouns?.set(g);
  }

  // ── Boot ────────────────────────────────────────────────────────────────────
  async function boot() {
    try {
      profile = await (await fetch(`${BACKEND}/companion`)).json();
    } catch {
      profile = { onboarded: false };
    }
    if (profile.onboarded) {
      // Straight into the thread. It is the product (design system: core.jsx Home is
      // the conversation, not a hub), and it is also the honest default: the last
      // thing that happened is the last thing you were doing. The hub still exists
      // behind the You tab, and loadHome() still runs so its counters are current
      // the moment it is opened.
      setView("chat");
      setAvatarGender(profile.gender);
      // The header used to be named on the way into a call, which was the only way
      // in. Opening straight onto the thread meant it kept the default name while
      // the tab beside it said who you were actually talking to.
      nameCompanion(profile.companion_name);
      try { await loadHome(); } catch (e) { console.error("[flow] loadHome failed", e); }
    } else {
      startOnboarding();
    }
  }

  // ── Onboarding (§2) ───────────────────────────────────────────────────────────
  const ob = {
    step: "hook",
    order: ["hook", "signin", "age", "character", "seed", "mic", "call"],
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
          // The one concrete thing about them, so the choice is made knowing who
          // they are rather than discovered afterwards by asking.
          (c.blurb ? `<div class="char-blurb">${c.blurb}</div>` : "") +
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
    // Every line that names her in the rest of onboarding. Half the cast is not
    // Poppy, and the question screen is asked in their voice.
    ["ob-asker", "ob-mic-name"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = c.name;
    });
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
        // The seed goes in here, not just into the call: it becomes a real memory
        // and the first open loop, so onboarding never ends on an empty home (§2).
        body: JSON.stringify({ character: ob.character, seed: ob.seed }),
      })).json();
      setAvatarGender(profile.gender);
    } catch {}
    startCall({ seed: ob.seed });
  });

  // The mic screen asks for the permission the browser is about to demand, with the
  // reason attached. Allowing here triggers the real prompt while the explanation is
  // still on screen; declining is a real answer, not a dead end — the composer types.
  document.getElementById("ob-mic-allow")?.addEventListener("click", async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Denied or unavailable. Nothing to do here: the composer still works, and
      // nagging about it on the next screen would be the opposite of asking once.
    }
    nextStep();
  });
  document.getElementById("ob-mic-skip")?.addEventListener("click", () => nextStep());

  // "I'm not" is an answer we have to take. No scolding, no dead end that looks like
  // a bug: it says what it is and stops.
  document.getElementById("ob-under")?.addEventListener("click", () => {
    const box = document.querySelector('[data-step="age"] .glass');
    if (!box) return;
    box.innerHTML =
      '<p class="t-title">Come back when you are 18.</p>' +
      '<p class="t-sm soft">That is the whole rule, and we would rather say it plainly ' +
      'than find a way around it.</p>';
    document.querySelectorAll('[data-step="age"] .btn').forEach((b) => b.remove());
  });

  // ── Sign in ─────────────────────────────────────────────────────────────────
  // Providers only. A name-and-email form used to live here and it was a fiction: it
  // identified nobody, proved nothing, and a "signed in" state that cannot be checked
  // is worse than no account at all once credits hang off it. "Not now" is still a
  // real answer — everything works on this device without an account.

  /** Tell the backend who signed in. The provider verified them, not us. */
  async function postSignIn(provider, subject, email, name) {
    try {
      await fetch(`${BACKEND}/account/signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, subject, email, name }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a provider's flow from a button, and say so when it does not complete.
   *
   * Shared by the onboarding screen and the account sheet, because the two behaved
   * differently once and the one that was tested less was the one that was broken.
   */
  async function providerSignIn(provider, btn, err, label) {
    btn.disabled = true;
    btn.textContent = "Opening…";
    let claims = null;
    try {
      claims = await window.PoppyAuth?.signIn(provider);
    } catch (e) {
      console.warn("[auth] sign-in threw", e);
    }
    btn.disabled = false;
    btn.textContent = label;
    if (!claims) {
      if (err) {
        err.textContent = provider === "apple"
          ? "Apple sign-in did not complete."
          : "Google sign-in did not complete.";
        err.classList.remove("hidden");
      }
      return false;
    }
    return postSignIn(provider, claims.subject, claims.email, claims.name);
  }

  // Apple only exists where the native flow does; on the web it would open nothing.
  if (window.PoppyNativeAuth?.signIn) {
    document.getElementById("si-apple")?.classList.remove("hidden");
  }

  document.getElementById("si-apple")?.addEventListener("click", async (e) => {
    const ok = await providerSignIn(
      "apple", e.currentTarget, document.getElementById("si-error"), "Continue with Apple",
    );
    if (ok) nextStep();
  });

  document.getElementById("si-google")?.addEventListener("click", async (e) => {
    const ok = await providerSignIn(
      "google", e.currentTarget, document.getElementById("si-error"), "Continue with Google",
    );
    if (ok) nextStep();
  });

  document.getElementById("si-skip")?.addEventListener("click", () => nextStep());

  function finishOnboarding() {
    setView("chat");
    loadHome();
  }

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

    // RETENTION_ENGINE §4.7: at most TWO progress indicators on screen at once,
    // and her open loop is always one of them. Six of them turns a companion into
    // a task manager, which kills the emotional register the whole product rests
    // on. So the strip above always shows, and this slot shows exactly one thing:
    // the streak once it's a real run, otherwise how well she knows them — which
    // is never "New" after onboarding, so day 0 is never a zero state (§2).
    // The profile card: who you are talking to and how long it has been going.
    const since = document.getElementById("home-since");
    if (since) {
      const calls = h.total_calls || 0;
      const label = (h.closeness && h.closeness.label) || "";
      since.textContent = [
        calls ? `${calls} ${calls === 1 ? "call" : "calls"}` : "",
        label,
      ].filter(Boolean).join(" · ");
    }
    const av = document.getElementById("home-avatar");
    if (av) av.textContent = (h.companion_name || "P").trim()[0] || "P";
    // "she knows N things", which is the number the closeness stage is built on and
    // the one thing on this screen that is hers rather than the app's.
    const knows = document.getElementById("home-knows");
    if (knows) {
      try {
        const mem = await (await fetch(`${BACKEND}/memory`)).json();
        const n = (mem.memories || mem.items || []).length;
        knows.textContent = n ? `${n} ${n === 1 ? "thing" : "things"}` : "not much yet";
      } catch { knows.textContent = "—"; }
    }
    // The account row: who is signed in, and what is left. Shown even when nobody is,
    // because "Sign in" is the thing that needs to be findable.
    try {
      const acc = await (await fetch(`${BACKEND}/account`)).json();
      const t = document.getElementById("home-account-title");
      const sub = document.getElementById("home-account-sub");
      if (t && sub) {
        if (acc.signed_in) {
          t.textContent = acc.name || acc.email || "Your account";
          // "signed in with local" is an implementation detail leaking into copy.
          // The email is the identity here, so the email is what it says.
          sub.textContent = acc.provider === "local"
            ? `${acc.credits} credits · ${acc.email || "on this device"}`
            : `${acc.credits} credits · ${acc.provider}`;
        } else {
          t.textContent = "Sign in";
          sub.textContent = "Keep your companion if you change phone";
        }
      }
    } catch {}

    const look = document.getElementById("home-look-sub");
    if (look) {
      const mode = window.Theme?.get() ?? "auto";
      look.textContent = mode === "auto"
        ? "Following your device"
        : mode === "dark" ? "Dark" : "Light";
    }

    const streak = document.getElementById("home-streak");
    const s = h.streak || {};
    if (s.current > 1) {
      // Opportunity and protection, never threat and shame (§4.1). No countdown,
      // no red, no exclamation mark: the same loss-aversion fires either way, and
      // only one of them produces the "already broke it, why bother" cascade.
      streak.textContent = `${s.current} days`;
      // The at-risk case is said in words rather than in red: the same loss
      // aversion fires either way, and only one of them produces "already broke
      // it, why bother".
      streak.title = s.state === "at_risk" && !s.met_today ? "one call keeps it going" : "";
    } else if (s.current === 1) {
      streak.textContent = "1 day";
    } else {
      // A tile with a label and nothing in it is worse than a tile saying so.
      streak.textContent = "not yet";
    }

    _streakWeek = (h.streak && h.streak.week) || null;
    try { _longYear = await (await fetch(`${BACKEND}/long-year`)).json(); } catch {}
    renderUpdateNotice();
    renderVersion();
    renderFreezeNotice(h.freeze_notice);
    renderRepair(h.streak);
    loadToday();
    loadGarden();
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

  // A newer version exists. Deliberately flat: no badge, no colour, no modal.
  // It never downloads or installs anything, it shows a line and a link, and
  // what happens next is the user's decision.
  // Which build this is, in small grey text at the bottom of the home screen.
  // Not decoration: three mishearing reports were diagnosed across three
  // releases without ever being certain which version was installed, and a
  // screenshot of the home screen is what users actually send. The log records
  // it too, but a screenshot arrives first and more often.
  async function renderVersion() {
    const el = document.getElementById("home-version");
    if (!el) return;
    // The update endpoint reports the running version whether or not the
    // version check is switched on, so this shows up offline too.
    let u = {};
    try { u = await (await fetch(`${BACKEND}/update`)).json(); } catch {}
    if (!u.version) { el.textContent = ""; return; }
    el.textContent = `Version ${u.version}`;
    // On iOS this also shows what the voice engine loaded: a speaker count of 1 means
    // every character sounds identical, which is otherwise invisible.
    try {
      const d = await (await fetch(`${BACKEND}/debug/tts`)).json();
      if (d && typeof d.speakers === "number" && d.speakers >= 0) {
        el.textContent += `  ·  voice ${d.speakers} spk`;
      }
    } catch {}
  }

  async function renderUpdateNotice() {
    const box = document.getElementById("home-update-avail");
    if (!box) return;
    let u = {};
    try { u = await (await fetch(`${BACKEND}/update`)).json(); } catch {}
    if (!u.notice || !u.url) { box.classList.add("hidden"); return; }

    box.innerHTML = "";
    const msg = document.createElement("span");
    msg.textContent = u.notice;
    const link = document.createElement("a");
    link.href = u.url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "update-link";
    link.textContent = "See what's new";
    // Turning it off has to be as easy as being told, or it isn't really a choice.
    const off = document.createElement("button");
    off.type = "button";
    off.className = "update-off";
    off.textContent = "Stop checking";
    off.addEventListener("click", async () => {
      try {
        await fetch(`${BACKEND}/update/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ on: false }),
        });
      } catch {}
      box.classList.add("hidden");
    });
    box.append(msg, link, off);
    box.classList.remove("hidden");
  }

  // §4.1: the user learns a freeze was spent after the fact, in her voice. It is
  // warmth, not a warning, and it appears once because the backend clears it on
  // read. A heads-up beforehand would just be a countdown with better manners.
  function renderFreezeNotice(text) {
    const box = document.getElementById("home-freeze");
    if (!box) return;
    box.textContent = text || "";
    box.classList.toggle("hidden", !text);
  }

  // §4.1: 48h grace, free once a month, no ceremony. There is deliberately no
  // price anywhere on this: charging to undo an emotional-sounding failure is
  // the one thing the doc marks red about repair.
  function renderRepair(s) {
    const box = document.getElementById("home-repair");
    if (!box) return;
    if (!s || !s.repairable) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }
    box.innerHTML = "";
    const msg = document.createElement("span");
    msg.className = "repair-text";
    msg.textContent = `Your ${s.broken_from} day run stopped. Want it back?`;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "repair-btn";
    btn.textContent = "Pick it back up";
    btn.addEventListener("click", async () => {
      try { await fetch(`${BACKEND}/streak/repair`, { method: "POST" }); } catch {}
      box.classList.add("hidden");
      await loadHome();
    });
    box.append(msg, btn);
    box.classList.remove("hidden");
  }

  // ── Today: quests, the goal ring, the week (§4.2, §4.3, §4.7) ────────────────
  // Deliberately behind a tap. Home shows her open loop plus at most one number
  // (§4.7); six progress indicators on one screen turns a companion into a task
  // manager and the emotional register, which is the whole moat, dies with it.
  async function loadToday() {
    const btn = document.getElementById("home-today");
    if (!btn) return;
    let t = {};
    try { t = await (await fetch(`${BACKEND}/quests`)).json(); } catch {}
    if (t.off || !t.quests) { btn.classList.add("hidden"); return; }

    // The count lives inside the panel, not on the button. Home already carries
    // her open loop and one number in the corner; a third would break §4.7's cap
    // and turn the screen into a dashboard. A dot says "something is waiting"
    // without being a score.
    const dot = document.getElementById("home-today-dot");
    if (dot) dot.classList.toggle("hidden", t.completed >= t.total);
    btn.classList.remove("hidden");
    _today = t;
  }

  let _today = null;

  function renderToday() {
    const t = _today;
    if (!t) return;
    const list = document.getElementById("today-list");
    list.innerHTML = "";
    t.quests.forEach((q) => {
      const li = document.createElement("li");
      li.className = "today-item" + (q.done ? " done" : "");
      // Slot 1 is always her open loop (§4.3) — the fusion of the two layers.
      li.innerHTML =
        `<span class="today-tick">${q.done ? "●" : "○"}</span>` +
        `<span class="today-text">${q.text}</span>`;
      list.appendChild(li);
    });

    // A partially filled ring is the cheapest open loop in the product (§4.2).
    const ring = document.getElementById("today-ring");
    const pct = Math.round((t.ring || 0) * 100);
    ring.style.setProperty("--pct", pct);
    ring.textContent = t.goal_met ? "✓" : `${t.completed}/${t.total}`;

    // §4.1: the Long Year, visible from day one as a distant known-unknown.
    // Never a countdown, and never a bar: there is nothing to lose by not getting
    // there, which is the whole difference between an aspiration and a threat.
    const ly = document.getElementById("today-longyear");
    if (ly) {
      const l = _longYear || {};
      if (l.reached) {
        ly.textContent = "The Long Year · earned";
      } else if (l.near && l.days_left != null) {
        ly.textContent = `The Long Year · ${l.days_left} days away`;
      } else {
        ly.textContent = "The Long Year · a flower that only grows at 365 days";
      }
      ly.classList.remove("hidden");
    }

    const week = document.getElementById("today-week");
    week.innerHTML = "";
    (_streakWeek || []).forEach((d) => {
      const dot = document.createElement("span");
      // A frozen day is shown as its own thing, never as a day they turned up.
      dot.className = "week-dot" +
        (d.met ? " met" : "") + (d.frozen ? " frozen" : "") + (d.today ? " today" : "");
      week.appendChild(dot);
    });
  }

  let _streakWeek = null;
  let _longYear = null;

  document.getElementById("home-today")?.addEventListener("click", () => {
    renderToday();
    document.getElementById("today")?.classList.remove("hidden");
  });
  document.getElementById("today-close")?.addEventListener("click", () => {
    document.getElementById("today")?.classList.add("hidden");
  });
  // §4.9: turning the layer off is one tap, takes effect immediately, and
  // nothing ever asks them to turn it back on.
  document.getElementById("today-off")?.addEventListener("click", async () => {
    try {
      await fetch(`${BACKEND}/daily-layer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ off: true }),
      });
    } catch {}
    document.getElementById("today")?.classList.add("hidden");
    document.getElementById("home-today")?.classList.add("hidden");
    await loadHome();
  });

  // ── Writing a character ─────────────────────────────────────────────────────
  // The cast we ship is six people we chose. This is for everyone who wants someone
  // else — a name, a voice, and a paragraph saying who they are. That paragraph goes
  // into the prompt in the same slot our own characters' personalities occupy, so a
  // character someone wrote is assembled exactly like ours and the model cannot tell
  // the difference.
  let _voices = null;
  let _editing = null;   // the character being edited, or null when writing a new one

  async function openCharacterEditor(existing) {
    _editing = existing || null;
    if (!_voices) {
      try { _voices = (await (await fetch(`${BACKEND}/characters/voices`)).json()).voices; }
      catch { _voices = []; }
    }

    document.getElementById("ce-title").textContent =
      _editing ? `Edit ${_editing.name}` : "Write a character";
    document.getElementById("ce-name").value = _editing?.name || "";
    document.getElementById("ce-tagline").value = _editing?.tagline || "";
    document.getElementById("ce-personality").value = _editing?.personality || "";
    document.getElementById("ce-greeting").value = _editing?.greeting || "";
    document.getElementById("ce-personality-count").textContent =
      String((_editing?.personality || "").length);
    document.getElementById("ce-error").classList.add("hidden");
    document.getElementById("ce-delete").classList.toggle("hidden", !_editing);

    const box = document.getElementById("ce-voices");
    box.innerHTML = "";
    const chosen = _editing?.voice || (_voices[0] && _voices[0].key);
    _voices.forEach((v) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ce-voice" + (v.key === chosen ? " on" : "");
      b.dataset.key = v.key;
      b.textContent = v.label;
      b.addEventListener("click", () => {
        box.querySelectorAll(".ce-voice").forEach((x) => x.classList.remove("on"));
        b.classList.add("on");
      });
      box.appendChild(b);
    });

    document.getElementById("char-editor").classList.remove("hidden");
  }

  function closeCharacterEditor() {
    document.getElementById("char-editor").classList.add("hidden");
    _editing = null;
  }

  document.getElementById("ce-cancel")?.addEventListener("click", closeCharacterEditor);
  document.getElementById("ce-personality")?.addEventListener("input", (e) => {
    document.getElementById("ce-personality-count").textContent = String(e.target.value.length);
  });

  document.getElementById("ce-save")?.addEventListener("click", async () => {
    const err = document.getElementById("ce-error");
    const body = {
      name: document.getElementById("ce-name").value.trim(),
      tagline: document.getElementById("ce-tagline").value.trim(),
      personality: document.getElementById("ce-personality").value.trim(),
      greeting: document.getElementById("ce-greeting").value.trim(),
      voice: document.querySelector("#ce-voices .ce-voice.on")?.dataset.key,
    };
    if (_editing) body.key = _editing.key;
    // Checked here as well as on the server so the message lands next to the empty
    // field rather than as a failed request nobody sees.
    if (!body.name) {
      err.textContent = "They need a name.";
      err.classList.remove("hidden");
      return;
    }
    let saved = null;
    try {
      const res = await fetch(`${BACKEND}/characters/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      saved = (await res.json()).character;
    } catch {}
    if (!saved) {
      err.textContent = "That could not be saved.";
      err.classList.remove("hidden");
      return;
    }
    _cast = null;                       // the picker has to fetch the new list
    closeCharacterEditor();
    document.getElementById("char-switch")?.remove();
    // Straight into talking to them: writing a character and then hunting for it in
    // a list is a step nobody wants.
    await chooseCharacter(saved, null);
  });

  document.getElementById("ce-delete")?.addEventListener("click", async () => {
    if (!_editing) return;
    try {
      await fetch(`${BACKEND}/characters/custom/${encodeURIComponent(_editing.key)}`, {
        method: "DELETE",
      });
    } catch {}
    _cast = null;
    closeCharacterEditor();
    document.getElementById("char-switch")?.remove();
    try { profile = await (await fetch(`${BACKEND}/companion`)).json(); } catch {}
    await loadHome();
  });

  // ── Who she is ──────────────────────────────────────────────────────────────
  // The modes on home are a stance for this call. These are the layer underneath,
  // and they persist — someone who wants a quiet companion should get one in every
  // mode rather than re-picking it every time. The wording the model actually reads
  // lives in the backend; the page only ever sees labels.
  let _axes = null;

  async function openTraits() {
    let data = { traits: {}, axes: {} };
    try { data = await (await fetch(`${BACKEND}/companion/traits`)).json(); } catch {}
    _axes = data.axes || {};
    const chosen = data.traits || {};

    const box = document.getElementById("traits-axes");
    box.innerHTML = "";
    Object.entries(_axes).forEach(([axis, spec]) => {
      const row = document.createElement("div");
      row.className = "traits-row";

      const label = document.createElement("p");
      label.className = "traits-label";
      label.textContent = spec.label;

      const group = document.createElement("div");
      group.className = "traits-group";
      group.dataset.axis = axis;
      // The API hands these back as an array on desktop and an object on mobile,
      // because one is Python and the other is the generated TypeScript. Normalised
      // here rather than forcing either side to pretend to be the other.
      const options = Array.isArray(spec.options)
        ? spec.options
        : Object.entries(spec.options).map(([key, o]) => ({ key, label: o.label }));
      options.forEach((o) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "traits-opt" + (chosen[axis] === o.key ? " on" : "");
        b.dataset.key = o.key;
        b.textContent = o.label;
        b.addEventListener("click", () => {
          group.querySelectorAll(".traits-opt").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
        });
        group.appendChild(b);
      });

      row.append(label, group);
      box.appendChild(row);
    });

    const note = document.getElementById("traits-note");
    note.value = chosen.note || "";
    document.getElementById("traits-count").textContent = String(note.value.length);
    document.getElementById("traits")?.classList.remove("hidden");
  }

  // ── The tab bar ─────────────────────────────────────────────────────────────
  // The thread is home (design system: core.jsx Home), so the app opens on it and
  // the rest of the app is a destination rather than a row on a hub screen. "You"
  // is where the hub went: the streak, the ritual, who she is, and how it looks.
  function markTab(id) {
    document.querySelectorAll("#tabbar .tab").forEach((b) => {
      b.dataset.on = String(b.dataset.tab === id);
    });
  }

  document.getElementById("tabbar")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    const tab = btn.dataset.tab;
    if (tab === "thread") {
      setView("chat");
    } else if (tab === "you") {
      setView("home");
      loadHome();
    } else if (tab === "garden") {
      // Not the home button: that one is hidden while the garden is empty (§8 keeps
      // empty progress surfaces off home), so routing the tab through it meant the
      // tab silently did nothing on every new account. A tab the user taps has to
      // answer, even if the answer is "nothing has grown here yet".
      openGarden();
    } else if (tab === "memory") {
      // The panel lives inside #app. Opening it from the You screen rendered it
      // into a hidden container, so the tap looked ignored.
      setView("chat");
      document.getElementById("memory-btn")?.click();
    }
  });

  // ── Appearance ──────────────────────────────────────────────────────────────
  // The only setting here that changes nothing about her, which is why it is one
  // screen away from the ones that do.
  function paintTheme() {
    const chosen = window.Theme?.get() ?? "auto";
    document.querySelectorAll("#look-theme [data-theme-choice]").forEach((b) => {
      b.dataset.on = String(b.dataset.themeChoice === chosen);
    });
  }

  document.getElementById("home-look")?.addEventListener("click", () => {
    paintTheme();
    document.getElementById("look")?.classList.remove("hidden");
  });
  document.getElementById("look-close")?.addEventListener("click", () => {
    document.getElementById("look")?.classList.add("hidden");
  });
  document.getElementById("look-theme")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-theme-choice]");
    if (!btn) return;
    // Applied immediately rather than on Done: the whole point of the setting is
    // visible the instant it is chosen, and a preview you have to confirm is a
    // preview nobody trusts.
    window.Theme?.set(btn.dataset.themeChoice);
    paintTheme();
  });

  document.getElementById("home-traits")?.addEventListener("click", openTraits);
  document.getElementById("traits-close")?.addEventListener("click", () => {
    document.getElementById("traits")?.classList.add("hidden");
  });
  document.getElementById("traits-note")?.addEventListener("input", (e) => {
    document.getElementById("traits-count").textContent = String(e.target.value.length);
  });

  document.getElementById("traits-save")?.addEventListener("click", async () => {
    const body = { note: document.getElementById("traits-note").value };
    document.querySelectorAll("#traits-axes .traits-group").forEach((g) => {
      const on = g.querySelector(".traits-opt.on");
      if (on) body[g.dataset.axis] = on.dataset.key;
    });
    try {
      await fetch(`${BACKEND}/companion/traits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {}
    document.getElementById("traits")?.classList.add("hidden");
  });

  // ── The garden (§3.1) ───────────────────────────────────────────────────────
  // The record of what they've grown, and the thing that makes leaving painful
  // after two months. Note there is no count rendered anywhere in here: §3 keeps
  // every number on the daily-layer surface, because the moment the relationship
  // gets a score attached the user starts optimising instead of talking.
  async function loadGarden() {
    const btn = document.getElementById("home-garden");
    if (!btn) return;
    let g = {};
    try { g = await (await fetch(`${BACKEND}/garden`)).json(); } catch {}
    // §8: never show a progress surface while it's empty. First sight is never zero.
    if (g.empty || !g.flowers) { btn.classList.add("hidden"); return; }
    _garden = g;
    btn.classList.remove("hidden");
  }

  let _garden = null;

  async function openGarden() {
    const view = document.getElementById("garden");
    if (!view) return;

    // Fetch it if home never did. loadGarden() only keeps the state when something
    // has grown, because §8 hides the *entry point* on home while the garden is
    // empty — but a tab the user deliberately taps is not that, and it has to show
    // them their garden either way.
    let g = _garden;
    if (!g) {
      try { g = await (await fetch(`${BACKEND}/garden`)).json(); } catch {}
    }

    view.classList.remove("hidden");
    const note = document.getElementById("garden-note");
    const bare = !g || !Array.isArray(g.flowers) || !g.flowers.length;
    if (note) {
      note.textContent = bare
        ? "Nothing has grown here yet. Every call plants one."
        // Names the season, never a total. A season is a temporal landmark; a total
        // is a scoreboard. Said once, quietly: the garden is theirs to arrange and
        // nothing else on screen would tell them that.
        : `${g.season} in your garden · drag to move, tap to name`;
    }

    // Draw it even when it is bare. The empty state used to stop the canvas, which
    // left a flat blue screen with a line of text on it — not an empty garden, just
    // an absence. The ground and the season are real on day one; only the flowers
    // are missing, and seeing where they will grow is the whole point of looking.
    if (!g || !Array.isArray(g.flowers)) return;
    // Rendered after the view is visible so the canvas has a real size to measure.
    requestAnimationFrame(() => {
      window.PoppyGarden?.render(document.getElementById("garden-canvas"), g, {
        onSelect: showNameField,
      });
    });
  }

  document.getElementById("home-garden")?.addEventListener("click", () => openGarden());

  // Tapping a flower offers to name it. The garden records that something
  // happened; the name is the user saying what it meant, which is theirs to write.
  let _naming = null;

  function showNameField(flower) {
    const form = document.getElementById("garden-name");
    const input = document.getElementById("garden-name-input");
    if (!form || !input) return;
    if (!flower) {
      _naming = null;
      form.classList.add("hidden");
      return;
    }
    _naming = flower;
    input.value = flower.label || "";
    form.classList.remove("hidden");
    input.focus();
    input.select();
  }

  document.getElementById("garden-name")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!_naming) return;
    const input = document.getElementById("garden-name-input");
    const text = (input.value || "").trim();
    try {
      await fetch(`${BACKEND}/garden/label`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: _naming.id, label: text }),
      });
    } catch {}
    // Empty clears the name, so nothing is permanent by accident.
    window.PoppyGarden?.setLabel(_naming.id, text);
    showNameField(null);
  });

  document.getElementById("garden-close")?.addEventListener("click", () => {
    showNameField(null);
    window.PoppyGarden?.stop(document.getElementById("garden-canvas"));
    document.getElementById("garden")?.classList.add("hidden");
  });

  // ── Change companion from home (memory/voice/orb all swap with it) ───────────
  // The canvas orb is only half of it. The design system draws her presence in
  // CSS too — header avatars, the connect veil, the "her world" chat ground —
  // and all of those read three custom properties. Setting them here is what
  // makes swapping companion change the whole app rather than one canvas.
  function applyCharacterSkin(c) {
    if (!c) return;
    const root = document.documentElement.style;
    if (c.color) {
      root.setProperty("--orb-a", c.color.eyes || c.color.outline || "#7A70B4");
      root.setProperty("--orb-b", c.color.outline || c.color.gradient || "#5F5696");
      root.setProperty("--orb-c", c.color.face || "#352C56");
    }
    if (c.photo) root.setProperty("--her-photo", `url('${c.photo}')`);
  }

  function tintOrbForCurrent(key) {
    if (!key) return;
    const hit = (_cast || []).find((x) => x.key === key);
    if (hit) {
      applyCharacterSkin(hit);
      if (hit.color) window.companionAvatar?.setColors(hit.color);
      return;
    }
    fetch(`${BACKEND}/characters`).then((r) => r.json()).then((cast) => {
      _cast = cast;
      const c = cast.find((x) => x.key === key);
      if (!c) return;
      applyCharacterSkin(c);
      if (c.color) window.companionAvatar?.setColors(c.color);
    }).catch(() => {});
  }

  function ensureSwitchButton() {
    if (document.getElementById("home-switch")) return;
    const host = document.getElementById("home-modes")?.parentNode || home;
    const b = document.createElement("button");
    b.id = "home-switch";
    b.type = "button";
    // Styled in the stylesheet like everything else. It was inline-styled for a
    // dark background (a white border over a translucent white fill), which on
    // this cream home screen read as a washed-out slab next to the mood pills.
    // Not drawn any more: it is a row at the top of the list now. Kept as a
    // function so nothing that calls it has to know that.
    b.className = "home-switch hidden";
    b.textContent = "Change companion";
    b.addEventListener("click", openCharacterSwitch);
    host.appendChild(b);
  }

  // The row in the list. The old link under the version number was findable only
  // by someone already looking for it, and choosing who you talk to is the most
  // important thing on this screen rather than the least.
  // Signing in from settings goes through the same door as onboarding.
  // From settings, the same two fields, in the sheet the rest of the app uses.
  document.getElementById("home-account")?.addEventListener("click", async () => {
    let acc = {};
    try { acc = await (await fetch(`${BACKEND}/account`)).json(); } catch {}
    openAccountSheet(acc);
  });

  function openAccountSheet(acc) {
    const signedIn = !!(acc && acc.signed_in);
    const native = !!window.PoppyNativeAuth?.signIn;
    const ov = document.createElement("div");
    ov.id = "account-sheet";
    // Providers only. The name-and-email form that used to be here identified nobody
    // and proved nothing, and a "signed in" state that cannot be checked is worse than
    // no account at all once credits hang off it.
    ov.innerHTML =
      '<div class="traits-card">' +
        '<p class="traits-kicker">Your account</p>' +
        '<p class="traits-sub">' +
          (signedIn
            ? "Signed in. Your companion, what she remembers and your credits belong to this account."
            : "So your companion and your credits follow you to any device. No password, ever: Apple and Google ask for it on their own pages.") +
        "</p>" +
        (signedIn
          ? '<div class="glass pad4 stack gap1 acct-who">' +
              `<span class="t-sm semi">${acc.name || "Signed in"}</span>` +
              `<span class="t-xs muted">${acc.email || ""}</span>` +
              `<span class="t-xs muted tnum">${acc.credits} credits · ${acc.provider}</span>` +
            "</div>"
          // Apple first where it exists: its guidelines require the option to be at
          // least as prominent as any other.
          : (native ? '<button type="button" class="btn btn--ink btn--block" id="acct-apple">Continue with Apple</button>' : "") +
            '<button type="button" class="btn btn--glass btn--block" id="acct-google">Continue with Google</button>') +
        '<p class="ce-error hidden" id="acct-error"></p>' +
        '<div class="traits-actions">' +
          '<button type="button" class="outro-ghost" id="acct-cancel">Close</button>' +
        "</div>" +
        (signedIn ? '<button type="button" class="ce-delete" id="acct-out">Sign out</button>' : "") +
      "</div>";
    document.body.appendChild(ov);

    const err = ov.querySelector("#acct-error");
    ov.querySelector("#acct-cancel").addEventListener("click", () => ov.remove());

    const wire = (id, provider, label) =>
      ov.querySelector(id)?.addEventListener("click", async (e) => {
        if (await providerSignIn(provider, e.currentTarget, err, label)) {
          ov.remove();
          await loadHome();
        }
      });
    wire("#acct-apple", "apple", "Continue with Apple");
    wire("#acct-google", "google", "Continue with Google");

    ov.querySelector("#acct-out")?.addEventListener("click", async () => {
      // Signing out keeps the ledger. It is not deleting an account, and treating it
      // as one would be the worst possible reading of a mis-tap.
      try { await fetch(`${BACKEND}/account/signout`, { method: "POST" }); } catch {}
      ov.remove();
      await loadHome();
    });
  }

  document.getElementById("call-btn")?.addEventListener("click", () => {
    document.getElementById("home-call")?.click();
  });

  document.getElementById("home-switch-row")?.addEventListener("click", () => openCharacterSwitch());

  async function openCharacterSwitch() {
    let cast = _cast;
    if (!cast || !cast.length) {
      try { cast = _cast = await (await fetch(`${BACKEND}/characters`)).json(); }
      catch { return; }
    }
    const current = profile && profile.character;

    // Rebuilt as a screen rather than a grid of tiles.
    //
    // Six small squares with a name burned into a scrim is the wrong shape for this
    // decision: the portrait ends up too small to read a face in, the one-liner gets
    // two cramped lines over a photograph, and the person you are already talking to
    // is distinguished only by a thin ring. Choosing who to talk to deserves the room
    // a settings screen gets.
    //
    // So: a navbar, a row per companion with a real portrait, their name, and the
    // line about them at full width. The same .listrow vocabulary as the You screen,
    // which is also what makes it consistent rather than a one-off modal.
    const ov = document.createElement("div");
    ov.id = "char-switch";
    ov.innerHTML =
      '<div class="cs-sheet">' +
        '<div class="navbar cs-nav">' +
          '<button type="button" class="iconbtn cs-back" aria-label="Back">‹</button>' +
          '<span class="t-h2">Companions</span>' +
          '<span class="cs-nav-pad"></span>' +
        '</div>' +
        '<div class="cs-body"><div class="list cs-list"></div></div>' +
      "</div>";
    const list = ov.querySelector(".cs-list");

    cast.forEach((c) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "listrow cs-row" + (c.key === current ? " cs-row--on" : "");

      const face = document.createElement("span");
      face.className = "cs-face";
      // The colour is the fallback, not decoration: a portrait that fails to load
      // leaves a monogram on their own gradient rather than a grey hole.
      face.style.background = `linear-gradient(158deg, ${
        (c.color && c.color.gradient) || "#7A70B4"}, ${(c.color && c.color.face) || "#352C56"})`;
      if (c.photo) {
        const img = document.createElement("img");
        img.src = c.photo;
        img.alt = "";
        img.addEventListener("error", () => img.remove());
        face.appendChild(img);
      } else {
        face.textContent = c.name[0];
      }

      const body = document.createElement("span");
      body.className = "listrow__body";
      const title = document.createElement("span");
      title.className = "listrow__title";
      title.textContent = c.name;
      const sub = document.createElement("span");
      sub.className = "listrow__sub";
      sub.textContent = c.blurb || c.tagline || "";
      body.append(title, sub);

      const right = document.createElement("span");
      right.className = "cs-right";
      if (c.key === current) {
        right.textContent = "Talking";
        right.classList.add("cs-current");
      }
      row.append(face, body, right);
      row.addEventListener("click", () => chooseCharacter(c, ov));

      // A character the user wrote can be rewritten. Ours cannot, so ours carry no
      // pencil rather than one that explains itself with an error.
      if (c.custom) {
        const edit = document.createElement("span");
        edit.className = "cs-edit";
        edit.textContent = "Edit";
        edit.addEventListener("click", async (e) => {
          e.stopPropagation();          // edit it, do not switch to it
          let full = c;
          try {
            const all = await (await fetch(`${BACKEND}/characters/custom`)).json();
            full = (all.characters || []).find((x) => x.key === c.key) || c;
          } catch {}
          ov.remove();
          openCharacterEditor(full);
        });
        right.textContent = "";
        right.appendChild(edit);
      }
      list.appendChild(row);
    });

    // Last, so it reads as "…or someone else" rather than competing with the cast
    // for the first glance.
    const add = document.createElement("button");
    add.type = "button";
    add.className = "listrow cs-row cs-add";
    add.innerHTML =
      '<span class="cs-face cs-face--add">+</span>' +
      '<span class="listrow__body">' +
        '<span class="listrow__title">Write your own</span>' +
        '<span class="listrow__sub">A name, a voice, and who they are</span>' +
      '</span>';
    add.addEventListener("click", () => { ov.remove(); openCharacterEditor(null); });
    list.appendChild(add);

    ov.querySelector(".cs-back").addEventListener("click", () => ov.remove());
    document.body.appendChild(ov);
  }

  async function chooseCharacter(c, ov) {
    // Anything mid-flight belongs to the companion being left behind.
    window.interruptReply?.();
    try {
      profile = await (await fetch(`${BACKEND}/companion/character`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character: c.key }),
      })).json();
    } catch {}

    setAvatarGender(c.gender);
    if (c.color) window.companionAvatar?.setColors?.(c.color);
    applyCharacterSkin(c);
    // The header and the first tab both name the companion. Switching used to change
    // neither, so the thread kept the old name over the new person's replies.
    nameCompanion((profile && profile.companion_name) || c.name);

    // And the thread itself. The backend already forgets the conversation on a switch
    // — memory is per character and the transcript belongs to talking to someone else
    // — but the page kept every bubble on screen, so it looked as though the old
    // conversation had carried over. Only starting a call cleared it, which is why
    // Call appeared to be the only thing that worked.
    const thread = document.getElementById("transcript");
    if (thread) thread.innerHTML = "";
    window._lastUserText = "";

    if (ov) ov.remove();
    await loadHome();

    // Straight into the thread with them, and a quiet line saying who answered. An
    // empty screen after choosing somebody reads as the choice not having taken.
    setView("chat");
    if (thread) {
      const note = document.createElement("div");
      note.className = "thread-note";
      note.textContent = `You're talking to ${(profile && profile.companion_name) || c.name} now.`;
      thread.appendChild(note);
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
    // Their name, not "Poppy" — this notice used to tell a user talking to Ravi
    // that Poppy had changed, and then call him "she".
    const who = (profile && profile.companion_name) || "Poppy";
    msg.textContent = window.Pronouns
      ? window.Pronouns.fill(`${who}'s had a small update since you two met. {Subj}'s still {obj}.`)
      : `${who}'s had a small update since you two met.`;
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
      // Whoever the companion actually is. Half the cast is not Poppy.
      set.textContent = `+ Set a daily time with ${h.companion_name || "her"}`;
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
    call.addEventListener("click", () => {
      box.classList.add("hidden");
      startCall({ source: "notification" });
    });
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
  // `source` separates a call the user started themselves from one a reminder
  // pulled them into. The ratio between the two is the habit-health metric in
  // RETENTION_ENGINE §10 — a rising call count driven by pings is a warning.
  async function startCall({ seed = "", vibe = null, mode = null, source = "user" } = {}) {
    let r = {};
    try {
      r = await (await fetch(`${BACKEND}/call/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed, mode, source }),
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
    nameCompanion(profile && profile.companion_name);
    const transcript = document.getElementById("transcript");
    if (transcript) transcript.innerHTML = "";
    window._lastUserText = "";
    setView("chat");

    const opening = r.opening || "";
    if (r.profile) profile = r.profile;
    _callbackOffered = !!r.callback_offered;
    _surfacedLoopId = r.surfaced_loop_id || null;
    _callStart = Date.now();
    // The mood decides which flower this call grows (§3.1), and a mood used for
    // the first time completes one of the deliberate quests (§4.3).
    _callMode = mode || "talk";
    _callModeIsNew = !_moodsUsed.has(_callMode);
    _moodsUsed.add(_callMode);
    try { localStorage.setItem("poppy_moods", JSON.stringify([..._moodsUsed])); } catch {}
    window._callSavedMemory = false;
    window._callEditedMemory = false;

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
    let pact = null;
    try {
      const r = await (await fetch(`${BACKEND}/call/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duration_s: durationS,
          callback_offered: _callbackOffered,
          surfaced_loop_id: _surfacedLoopId || undefined,
          // What actually happened in this call. The garden, the quests and the
          // points all read these; without them a saved memory is invisible.
          mode: _callMode,
          mood_new: _callModeIsNew,
          saved_memory: !!window._callSavedMemory,
          edited_memory: !!window._callEditedMemory,
        }),
      })).json();
      planted = (r && r.open_loop) || "";
      pact = (r && r.ritual) || null;
    } catch {}

    // §5: if they set their ritual out loud this call, the card is the receipt.
    // She already said it back in the conversation, so this doesn't repeat it
    // aloud, it just makes the plan visible.
    if (pact && pact.confirm) {
      const note = document.getElementById("outro-ritual");
      if (note) {
        note.textContent = pact.confirm;
        note.classList.remove("hidden");
      }
    }

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
