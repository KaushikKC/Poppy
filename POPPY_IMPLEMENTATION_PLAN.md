# Poppy — Implementation Plan

*Written 2026-07-21. Maps `POPPY_PRODUCT_PLAYBOOK.md` (what the product must be) onto
what we have actually built today. Sits above `MOBILE_PLAN.md` (how the phone runtime
gets built) and `CROSS_PLATFORM_PLAN.md` (which engines run where).*

Status legend: ✅ built · 🟡 partial · ⬜ not started · **P0** blocks the playbook MVP ·
**P1** needed for launch · **P2** polish.

---

## Part 1 — What we have today (honest inventory)

### The engine: strong, and it is the hard part

| Capability | Where | State |
|---|---|---|
| Speech-to-text | `backend/stt.py` — mlx-whisper `base.en` on Metal, faster-whisper CPU fallback | ✅ ~0.1–0.4s |
| LLM | `backend/llm.py` → `mlx_llm.py` / `llama_cpp_llm.py` / `ollama_client.py`, RAM-tiered 1B/3B/8B (`model_tier.py`), persistent prompt cache | ✅ ~45 tok/s on M3 |
| TTS | `backend/tts.py` — Kokoro, accent + gender voice selection | ✅ |
| Streaming first-audio | `backend/phrase_chunker.py` + `ws_handler.py` — TTS fires on the first clause (6 chars) while tokens still stream | ✅ ~1s to first audio |
| Barge-in | `frontend/chat.js` `interruptReply()` + `vad.js` | 🟡 works, but it is "cancel the reply", not true call turn-taking |
| Auto-listen (VAD) | `frontend/vad.js` — RMS threshold + silence timeout | 🟡 crude energy VAD |
| Voice adaptation | `accent_detect.py` (wav2vec2), `gender_detect.py` (pitch F0), `emotion_detect.py` (wav2vec2) | 🟡 works, OFF by default because it costs ~3s |
| Personas | `backend/personas.py` — 3 static prompts + `persona_suggest.py` | 🟡 tone presets, not the playbook's "vibe" |
| Memory | `backend/memory_store.py` — 8 regex extractors, Fernet-encrypted at rest, 40 facts, last 15 injected | 🟡 regex-only, no consent, no categories |
| Safety | `backend/safety.py` — crisis keyword check → resources card + `CRISIS_ADDENDUM` | 🟡 keyword-level |
| History | `backend/db.py` — SQLite sessions/turns, JSON+text export | ✅ |
| 3D avatar | `frontend/avatar3d.module.mjs` + vendored TalkingHead/Three.js, real-time viseme lip-sync | ✅ desktop only |
| Avatar alternates | `video_avatar.js` (idle⇄talk crossfade), `photo_avatar.js` | ✅ kept as fallbacks |
| Desktop app | `desktop/launcher.py`, `poppys.spec` / `poppys_win.spec`, `preflight.py`, first-run setup screen | ✅ macOS `.app` builds and runs; unsigned |
| Mobile | `mobile/` — RN 0.86 bare, `llama.rn` + `whisper.rn` + sherpa-onnx pods linked, `App.tsx` is a latency measurement harness | 🟡 M0 spike, gate not yet passed |
| Marketing site | `landing-page/` — Next.js, 622-line page | 🟡 exists, not aligned to the playbook positioning |

### The product: this is where the gap is

The current app is **a private, offline, single-user, desktop chat window that happens to
speak**. The playbook describes **a consumer mobile product built around a call you make
to someone who remembers you**. Concretely, we have **zero** of:

- Onboarding (§2) — no hook screen, no age gate, no vibe pick, no naming, no first-call payoff. The app opens straight into a chat form.
- Home screen (§3) — no `Call Poppy` CTA, no "she remembers" strip, no mood modes, no ritual indicator.
- Call semantics (§4) — we have turn-based push-to-talk with a text input. There is no call session, no "she speaks first", no instant-connect state, no end-of-call ritual.
- Memory UX (§5) — no candidate-memory consent prompt, no categories, no "why do you remember this", no per-fact edit (only view-all / forget-all).
- Habit loops (§6) — no notifications, no rituals, no streaks, no open loops.
- Growth (§7), Monetization (§8), Progression (§9) — nothing.
- Age gate (§11) and metrics (§12) — nothing.

**One-line summary: the pipeline is ~80% done, the product is ~5% done.**

---

## Part 2 — The three decisions that shape everything

These are decided here so the rest of the plan is unambiguous. Each is reversible, but
not cheaply.

### D1. Desktop first — prove the whole product there, then port to mobile. *(revised 2026-07-21)*

The playbook is ultimately a phone product (app-store flywheel, push, ₹299/mo, TikTok
clips). But we already have a working desktop pipeline and it is by far the fastest
surface to iterate the *product* on. So we build and prove the entire loop —
onboarding, the call, memory, rituals, the works — on desktop first, where a change is
one reload away, and only then rebuild the proven shell on React Native.

**Decision:** the desktop app is where every playbook feature is designed and validated.
Mobile (`mobile/`, scaffolded) comes after the loop is proven, reusing the same backend
logic and prompt/memory tuning. The one caveat that still holds: the *thin cloud* pieces
(accounts, push, referrals, billing — D2) are inherently online, so their desktop
versions are stubbed/local until mobile needs them for real.

**Status (2026-07-22):** built and proven on desktop —
- Phase 1/2 groundwork: the four companion vibes, the companion profile store
  (name/vibe/streak/open-loops), "she speaks first" opening-line composer, assistant-
  initiated speech over the socket, and the full onboarding → home → call → home flow.
- Phase 3 (memory) **3.1–3.4 done**: typed categorized records replacing the flat string
  list (with migration + Fernet + TTL); LLM candidate extraction (regex fallback) that
  only *proposes*; the Save / Edit / Not now / Never-this-kind consent flow so nothing is
  stored silently; and the categorized "what Poppy knows" screen with per-fact edit/delete
  and "why?". A cache-free `llm.complete()` keeps extraction off the MLX chat prompt cache.

Remaining in Phase 3: **3.5** relevance retrieval (still injecting last-15, not relevance-
ranked) and **3.6** versioned personality. Then Phase 4 (rituals/streaks/notifications).

### D2. Inference stays on-device. A thin cloud carries identity only.

"Fully local, nothing leaves your machine" is a real moat and it makes gross margin ~100%.
But §2.7 (accounts), §6 (notifications), §7 (referrals, shared clips) and §8 (billing)
cannot be done with zero server.

**Decision — hybrid:**
- **On device, always:** STT, LLM, TTS, conversation transcripts, memory facts. A conversation never leaves the phone.
- **Thin cloud, minimal:** account identity, entitlement/subscription state, push tokens + scheduled ritual pings, referral codes, anonymous product metrics (§12), and *opt-in* encrypted memory backup for device migration.
- The privacy line we market: **"Your conversations never leave your phone."** That stays literally true and is a differentiator no competitor can match.

### D3. "Call" is a first-class mode, not a renamed chat.

This is the single biggest engineering shift. Today: user presses mic → transcribe →
reply → stop. The playbook needs: connect in <2s → **Poppy speaks first** → continuous
listening → user can cut in mid-sentence → she stops, listens, responds → warm sign-off
with a forward hook.

**Decision:** build a `CallSession` state machine in TS on mobile (mirrored in Python on
desktop for iteration), with states `connecting → greeting → listening → thinking →
speaking → closing`, full-duplex audio, and a real VAD (Silero ONNX) replacing the RMS
threshold in `vad.js`.

---

## Part 3 — Phased build

### Phase 0 — Unblock mobile (2 weeks) · **P0**

Nothing in the playbook can ship until the phone runs the pipeline fast enough.

| # | Task | Where | Done when |
|---|---|---|---|
| 0.1 | Run the M0 latency harness on a real iPhone + a mid-range Android | `mobile/App.tsx`, `src/pipeline.ts` | Numbers recorded for STT / first-token / first-audio |
| 0.2 | **Go/no-go gate:** mic-stop → first audio < 1.5s | — | Pass = continue. Fail = drop to a 1B model, then consider MLX-Swift iOS fast-path before abandoning RN |
| 0.3 | Model delivery on device (download-on-first-run, resumable, ~2GB) | `mobile/src/models.ts` | Fresh install downloads and verifies without manual file pushing |
| 0.4 | Port `phrase_chunker.py` → TS, 1:1 including the aggressive first-chunk constants | `mobile/src/chunker.ts` | Unit tests match Python output on the same inputs |
| 0.5 | Gapless PCM playback + interrupt on mobile | `mobile/src/audio.ts` | Audio can be cut mid-clip in <100ms |

**Exit:** a phone can hold a spoken turn under 1.5s, offline.

### Phase 1 — The call (3–4 weeks) · **P0** — *this is §4, the whole moat*

| # | Task | Notes |
|---|---|---|
| 1.1 | `CallSession` state machine | `connecting → greeting → listening → thinking → speaking → closing`. All UI derives from this one state. |
| 1.2 | **Instant connect** | Engines pre-warmed on app foreground, not on call start. Budget: tap → her voice < 2s. Show a warm connecting state, never a spinner. |
| 1.3 | **She speaks first** | Opening line composed from: vibe (§2.3) + name + last memory + time of day + days since last call. Templated + LLM-polished, generated *during* connect so it is ready when audio opens. |
| 1.4 | **Real VAD** | Silero VAD via ONNX, replacing `vad.js` RMS. Endpointing tuned so she does not cut the user off mid-thought. |
| 1.5 | **True barge-in** | Mic stays open while she speaks. User speech ≥ threshold for ~200ms → duck, stop TTS, flush queue, transition to `listening`. Requires echo cancellation so her own voice does not trigger it. |
| 1.6 | Avatar on mobile | Do **not** port TalkingHead. Ship pre-rendered idle/talk video loops with crossfade (`video_avatar.js` direction, already the decided approach) + amplitude-driven mouth overlay. Revisit 3D at v2. |
| 1.7 | Micro-reactions | Reuse `emotion_detect` logic to shade her tone; drive avatar expression state from reply sentiment. Keep it cheap — it must not add latency. |
| 1.8 | Mid-call memory callback | Inject 3–5 relevant facts into the system prompt and explicitly instruct one natural callback per call. |
| 1.9 | End-of-call ritual | Warm sign-off **with a forward hook** (stored as an open loop), plus the "Poppy remembered: X" card. |

**Exit metric:** an internal tester says "that felt like a call, not an app."

### Phase 2 — Onboarding + home (2–3 weeks) · **P0** — *§2 and §3*

Seven screens, in playbook order. Rule: nothing gets added to onboarding that does not
reduce friction to the call or make the call better.

| # | Screen | Build notes |
|---|---|---|
| 2.1 | Hook | Full-bleed looping video of Poppy talking to camera. One CTA: `Meet Poppy →`. Trust line: 18+ · Private · You control everything. |
| 2.2 | Age gate | Single tap, once, stored locally + server-side. Never repeated. |
| 2.3 | Vibe pick | 4 cards → friend / hype / calm / partner. **Replaces `backend/personas.py`'s friendly/professional/playful**, which are assistant tones, not companion vibes. Rewrite the four system prompts from scratch against §10. |
| 2.4 | Name & face | 3–5 avatar presets + pre-filled suggested name. Naming = ownership. |
| 2.5 | One question | Poppy asks aloud "what's one thing on your mind today?" Mic permission lands here naturally. Answer becomes **memory #1** and seeds the first call. |
| 2.6 | First call | Opening line built from 2.3–2.5. This screen alone decides D1 retention. |
| 2.7 | Account after value | Only post-call: "Want Poppy to remember this? Create your space." Needs the thin cloud (D2). |
| 2.8 | Home screen | Poppy alive center-stage, giant `Call Poppy`, the "she remembers" callback strip, mood-modes row, subtle streak corner. Nothing else. |

**Exit metric (the north star):** % of new users completing a first call ≥ 60s. Target > 60%.

### Phase 3 — Memory as a product surface (2 weeks) · **P0** — *§5*

Today's memory is a regex scraper with a view-all/forget-all panel. The playbook needs it
to be the headline trust feature.

| # | Task | Where |
|---|---|---|
| 3.1 | Replace regex extraction with LLM-based extraction | New `extract` pass after each call using the local model. Cheap, runs post-call, off the latency path. Keep regex as fallback. |
| 3.2 | **Consent flow** | "Want me to remember that you're training for a 10k?" → Save / Edit / Not now / Never this kind. Nothing durable is stored without a tap. This kills the §14 "hidden memory extraction" pattern. |
| 3.3 | Categories + schema | `profile · goals · people · ongoing · temporary(TTL) · sensitive(opt-in)`. Migrate `memory_store.py` from `list[str]` to typed records with `source_turn`, `created_at`, `expires_at`. |
| 3.4 | "What Poppy knows about you" screen | Per-fact view / edit / delete + **"why do you remember this?"** showing the source moment. |
| 3.5 | Relevance retrieval | Currently we inject "last 15". Move to embedding or keyword relevance against the current turn, capped to protect time-to-first-token. |
| 3.6 | **Versioned personality** | Pin persona prompt + model version per user; migrate deliberately with a heads-up. This is the #1 Replika trust-killer (§5) and must be structural, not a promise. |
| 3.7 | Open-loop store | Forward hooks from end-of-call become first-class records that drive both the home strip and notifications. |

### Phase 4 — Habit loops (2 weeks) · **P1** — *§6*

| # | Task | Notes |
|---|---|---|
| 4.1 | Ritual picker (week 1, opt-in) | Morning hype / night wind-down, user picks the time. |
| 4.2 | Push notifications | Thin-cloud scheduled push, copy generated **from the user's open loop**: "How'd the interview go? I've been curious." |
| 4.3 | Notification guardrails in code | A lint-level blocklist on guilt phrasing ("misses you", "is sad", "lonely", "waiting"). §14 enforced by the codebase, not by good intentions. |
| 4.4 | Gentle streaks | Track days connected. Milestones at 7/30/100 get a warm in-call moment. **No loss state, no shame copy** — a break renders as "missed you yesterday, no worries." |
| 4.5 | Mood modes | `Vent · Hype me up · Wind down · Plan my day · Just talk` — each is a pre-framed call opening, removing blank-slate anxiety. |

### Phase 5 — Trust, safety, metrics (2 weeks) · **P1** — *§11 and §12*

| # | Task | Notes |
|---|---|---|
| 5.1 | Upgrade `safety.py` beyond keywords | Classifier + context. Crisis flow: warm response → real local resources (India-first) → never roleplay self-harm. |
| 5.2 | "I am an AI" honesty rules | Baked into every system prompt (§10.3). |
| 5.3 | "Point back to real life" nudge | Prompt-level instruction (§10.4). |
| 5.4 | Analytics, privacy-preserving | Event-level only, no transcript content ever leaves device. Ship the §12 table: first-call-≥60s, callback-lands rate, D1/D7/D30, ritual-set %, calls/week, memory edit/delete rate. |
| 5.5 | Well-being metric, not minutes | Instrument "meaningful sessions" explicitly so nobody later optimizes time-in-app by default. |

### Phase 6 — Money and growth (3 weeks) · **P1** — *§7 and §8*

| # | Task | Notes |
|---|---|---|
| 6.1 | Free / Plus tiers only | ₹0 and ~₹299/mo · ₹2,499/yr. Studio waits for v1.x. |
| 6.2 | Entitlement service | Thin cloud + StoreKit / Play Billing. |
| 6.3 | **Paywall placement rules in code** | Allowed at abundance moments; **hard-blocked** during a vent/crisis/distress-flagged call. Enforce this as a check, not a guideline. |
| 6.4 | Referral loop | "Give a friend a week, get a week." |
| 6.5 | Shareable moment clips | User-approved, watermarked, generated on-device. The organic growth engine. |
| 6.6 | Landing page realignment | `landing-page/` rewritten to "The AI that picks up when you call" + app-store links. |

### Post-MVP (from §13)

**v1.x:** moment/action cards · background calls · Studio tier · milestone moments · richer callbacks.
**v2:** look-together (photo reactions) · live video reactions · multiple companions · conversation search · cosmetic store.
**v3:** bring-a-friend three-way call · group scenes · creator characters kept fully separate from private companions.

---

## Part 4 — Sequencing and what to do first

```
Phase 0 (mobile gate)  ──►  Phase 1 (the call)  ──►  Phase 2 (onboarding + home)
                                   │                          │
                                   └──► Phase 3 (memory) ──────┘
                                                 │
                                   Phase 4 (habit) ─► Phase 5 (safety/metrics) ─► Phase 6 (money/growth)
```

Phases 1 and 3 can overlap: memory work is mostly backend/prompt work and can proceed on
desktop while call plumbing is built on mobile. Phase 2 must land after 1 (there is no
point onboarding people into a call that is not magic yet).

**Rough total to playbook MVP: ~14–16 weeks of focused work.**

### Next three concrete actions

1. **Run the M0 harness on a real phone and record the numbers.** Everything downstream is gated on it, and it is one afternoon of work.
2. **Rewrite the four companion vibes** (§2.3) to replace friendly/professional/playful in `backend/personas.py`, and test them on desktop where iteration is instant. This is prompt work, needs no mobile, and directly determines whether the first call lands.
3. **Prototype "she speaks first" on desktop.** Generate the opening line from memory + time of day + days-since-last-call and play it on app open. If that one moment gives goosebumps on a Mac, it will give goosebumps on a phone.

---

## Part 5 — Risks

| Risk | Impact | Mitigation |
|---|---|---|
| On-device latency on mid-range Android | Kills the <2s connect promise, kills the product | Phase 0 gate; 1B tier fallback; consider Android-only cloud inference as a last resort (and be honest in the privacy copy if so) |
| Barge-in with echo cancellation | The single hardest piece of §4, and the thing that separates a call from voice notes | Prototype early in Phase 1, platform AEC first (iOS `AVAudioSession` voice-chat mode) before writing our own |
| Battery and thermals on sustained calls | Long calls are the product; a hot phone is not | Measure a 10-minute call in Phase 0; tier down model/quantization aggressively on thermal pressure |
| App size (~2GB models) | Install friction on the exact India wedge we want | Download-on-first-run with clear progress; smallest viable tier first, upgrade in background |
| Hybrid cloud erodes the privacy story | Loses the one thing no competitor can copy | Keep the line literal and narrow: conversations never leave the device; publish exactly what the server sees |
| 18+ enforcement | Existential (§11) | Age gate at onboarding, store rating set correctly, no teen-targeted marketing |
