# Mobile Plan — Poppys on iOS and Android

*Written 2026-07-18. Goal: the same private, on-device voice companion (talk to it, it
talks back with a face) running natively on a phone, fully offline, nothing leaving the
device. Sits on top of `CROSS_PLATFORM_PLAN.md` (which already picked the on-device
engines) and reuses the model choices + latency tricks proven on desktop.*

Status legend: ✅ done · 🚧 in progress · ⬜ planned · **P0** ship-blocker · **P1** needed
for release · **P2** polish.

---

## 0.1 Revision 2026-08-16 — read this before the rest

The body of this plan was written on 2026-07-18 and is still right about the *stack*. It
is out of date about the *scope*, because most of the product was built after it.

### What changed since it was written

**The retention engine did not exist yet.** Every one of these files was created after
this plan was committed, and all of it is product logic that a mobile build has to carry:

| Module | Lines | Created |
|---|---|---|
| `loops.py` + `loop_author.py` | 873 | 2026-07-27 |
| `streak.py` | 422 | 2026-08-05 |
| `ritual_pact.py` | 268 | 2026-08-04 |
| `quests.py` | 235 | 2026-08-05 |
| `garden.py` | 235 | 2026-08-05 |
| `bloom.py` | 188 | 2026-08-05 |
| `boundaries.py` | 176 | 2026-08-09 |
| `disclosure.py` | 157 | 2026-08-04 |
| **Total unaccounted for** | **~2,550** | |

§3 (Orchestration) lists O1–O6 and none of them cover this. Treat the retention engine as
a **separate phase**, not a footnote. The good news: it is deterministic logic with 13
existing test suites, so the port is mechanical and verifiable rather than exploratory.

**The desktop UI grew.** 5,756 lines of frontend (1,430 CSS, 1,071 `flow.js`, 512
`garden.js`). Eight files draw on `<canvas>`. A native rewrite replaces all of it; see the
route decision below.

**Distribution facts have moved on.** The Mac app ships signed + notarized (v1.3.2), the
privacy policy is written and hosted, and the Apple Developer account is active. The
`APPLE_SUBMISSION_CHECKLIST.md` entry A1 is stale — that one is done.

### Scope decision: **iOS only for v1**

This plan covers iOS and Android together. For the first launch, drop Android. §5 already
identifies fragmentation ("RAM varies 3–12 GB") as the hard part, and carrying it doubles
the device-QA matrix for the release that has the least to gain from it. The TS core stays
platform-agnostic, so Android remains a later build, not a rewrite.

### The one thing that gates everything: **M0 is still unrun**

The spike at `mobile/` is 530 lines with all pods linked, and it has **never been run on a
real iPhone**. Until it is, every estimate below is conditional. What it has to answer:

1. First-audio latency (mic stop → first sound) with a 1B GGUF on a real device.
2. Thermals and battery across a sustained 10-minute conversation.
3. Peak memory against the iOS per-app limit, with LLM + Whisper + Kokoro all resident.

If those numbers are bad, the fix is an MLX-Swift fast path (§5 I3) and the timeline moves.
**Do not build anything else until this number is on the table.** One week.

### Route decision: how the UI gets onto the phone

The stack (RN + `llama.rn` + `whisper.rn` + `sherpa-onnx`) is locked and not reopened here.
What is genuinely open is whether the *interface* is rebuilt native or reused.

**Route A — reuse the web UI in a WebView.** Native modules do inference; the existing
HTML/CSS/JS renders the screens. Reuses ~5,750 lines already designed, tested and iterated,
including the canvas garden and orb. Fastest to a submittable build. Risks: sustained
canvas animation in a WebView is a real battery cost on a phone, and it must not look like
a wrapped website (Guideline 4.2). The substantial on-device AI is what answers 4.2, and
that argument is strong here.

**Route B — rebuild the UI in React Native.** Better feel and battery, native gestures,
Skia for the garden and orb. Costs roughly 4–6 additional weeks and re-solves design
problems that are already solved.

**Recommendation: Route A for v1**, with the battery measurement folded into M0 so the
decision is made on data. If M0 shows the WebView orb is what cooks the phone, fall back to
a native call screen only, and keep the web UI for the screens that are not animating
(home, garden, memory, settings). Route B in full is a v2 decision.

### Timeline (solo, iOS only, Route A)

| Phase | Work | Estimate |
|---|---|---|
| 0 | **M0 spike on a real iPhone** — latency, thermals, memory | 1 week **(gate)** |
| 1 | Voice loop in TS: STT → LLM stream → phrase chunker → TTS, barge-in, VAD | 3–4 weeks |
| 2 | App shell, WebView bridge, first-run, mic permission | 2 weeks |
| 3 | Port core backend to TS: companion, memory, safety, personas, prompt build | 3 weeks |
| 4 | Port the retention engine (~2,550 lines) + its 13 suites | 4–5 weeks |
| 5 | Model download, storage, device tiering | 1–2 weeks |
| 6 | Performance, thermal and battery tuning | 2–3 weeks |
| 7 | Privacy manifest, age rating, review notes, TestFlight, submission | 2 weeks |
| | **Total** | **18–22 weeks (~4.5–5.5 months)** |

Route B adds 4–6 weeks. Android adds 4–6 weeks after that. Apple review is 1–3 days
typically but budget a fortnight for a first submission of an AI companion app, which
attracts more scrutiny than average (§D of the submission checklist).

These are working-week estimates for one person. They assume the M0 numbers come back
acceptable; if they do not, phase 1 grows an MLX-Swift path and the total moves toward
6–7 months.

---

## 0. The honest framing: this is a rebuild of the shell, not a repackage

The desktop app is a **Python FastAPI server + web UI in a native window**. None of that
runs on a phone:
- Python doesn't ship cleanly to iOS/Android.
- A localhost web server + WebView is the wrong architecture for a battery-constrained,
  sandboxed mobile OS.
- The 3D WebGL avatar (TalkingHead/Three.js) is heavy for sustained mobile use.

**What transfers** is the valuable part — the *design*, the *model choices*, and the
*orchestration logic*. What's new is the runtime that hosts them.

| Layer | Desktop today | Mobile | Transfers? |
|---|---|---|---|
| LLM | MLX (Mac) / llama.cpp (Win) | **llama.cpp on-device (GGUF)** | model + prompt tuning yes; runtime new |
| STT | Whisper (MLX / faster-whisper) | **whisper.cpp on-device** (or Apple Speech) | model choice yes; runtime new |
| TTS | Kokoro (torch) | **Kokoro via sherpa-onnx** (ONNX) | same voice; runtime new |
| Voice classifiers | wav2vec2 (torch) | ONNX / drop for v1 | logic yes; likely deferred |
| Orchestration | Python (`ws_handler`, `phrase_chunker`, `safety`, `memory_store`) | **reimplemented in TS or native** | logic + tuning yes; code rewritten |
| Avatar | 3D TalkingHead (Three.js) | lighter option (see §6) | direction yes; tech likely changes |
| Shell | FastAPI + pywebview | **native app (React Native or Swift/Kotlin)** | no |
| Packaging | PyInstaller `.app`/`.exe` | App Store / Play Store | no |

**One-line summary:** keep Llama 3.2 + Kokoro + Whisper and every latency trick; rebuild the
pipeline and UI in a mobile-native stack that runs those models on-device.

---

## 1. Stack decision — **P0** (do this first, it colours everything)

**DECIDED 2026-07-18: React Native (bare) with on-device native modules.** The
key reason that settled it: the performance-critical work (LLM/STT/TTS inference) is
native C/C++ either way — RN calls the *same* llama.cpp / whisper.cpp / sherpa-onnx
libraries through `llama.rn` / `whisper.rn` / `react-native-sherpa-onnx`, so "go
native for speed" buys ~nothing here while costing two codebases. Native stays as a
*scalpel*: an MLX-Swift LLM fast-path can be added later as an iOS native module
inside the RN app, without a rewrite. Spike scaffolded at **`mobile/`** (RN 0.86, TS
strict; all four native pods linked on iOS).

Why RN over the alternatives, for *this* app:
- Mature on-device ML bindings already exist and are the same engines we shipped on
  desktop: **`llama.rn`** (llama.cpp), **`whisper.rn`** (whisper.cpp), **`sherpa-onnx`**
  (Kokoro TTS + optional STT) — all run GGUF/ONNX on iOS **and** Android.
- One TypeScript orchestration core for both platforms (the CROSS_PLATFORM_PLAN direction).
- The pipeline logic (streaming tokens → phrase chunker → TTS → gapless playback, VAD,
  barge-in, persona/memory/safety) ports almost 1:1 from the current JS frontend + Python
  backend into TS.

Alternatives considered:
- **Fully native (Swift + Kotlin):** best performance/battery, and on iOS you could use
  **MLX-Swift** (MLX runs on iPhone Metal) instead of llama.cpp. But it's two codebases and
  the most work. Revisit only if RN performance/thermals prove inadequate.
- **Flutter:** fewer/greener on-device LLM bindings; more glue to write. Not recommended.

> **Spike before committing (1–2 weeks):** build a throwaway RN app that loads a 1B GGUF via
> `llama.rn`, transcribes one clip via `whisper.rn`, and speaks one Kokoro line via
> `sherpa-onnx`, end to end on a real mid-range Android **and** an iPhone. Prove the engines
> + measure first-audio latency before building anything real. This de-risks the whole plan.

Tasks:
- 🚧 **M0 (P0)** Framework spike **scaffolded** at `mobile/` — RN 0.86 app that loads a
  GGUF via `llama.rn`, transcribes via `whisper.rn`, speaks Kokoro via
  `react-native-sherpa-onnx`, end-to-end, and shows the timing panel (big number =
  mic-stop→first-audio). **Remaining: run on a real iPhone + a mid-range Android with
  the model files pushed, and read the number.** iOS pods installed; see
  `mobile/README.md`. RN-vs-native already decided (above) on architecture grounds;
  the spike now validates *latency/thermals*, not the stack choice.
- 🚧 **M1 (P0)** Repo/app scaffold: RN app + TS strict **done**; CI for both platforms
  and on-device dev builds still to wire up.

---

## 2. On-device model runtimes — **P0**

The core promise (nothing leaves the device) means **all three models run locally**, exactly
like desktop — just via mobile-native engines.

- ⬜ **R1 (P0)** **LLM — `llama.rn` (llama.cpp/GGUF).** Reuse the desktop GGUF backend design
  (`backend/llama_cpp_llm.py`) conceptually: load once, keep resident while foregrounded,
  stream tokens, small `n_ctx` (4096), tuned tiny system prompt, `MAX_HISTORY_TURNS`≈6.
  Carry the **KV/prompt cache** trick for near-zero turn-2 TTFT.
- ⬜ **R2 (P0)** **STT — `whisper.rn` (whisper.cpp).** `base.en`/`tiny.en` int8. Consider
  **Apple Speech framework** on iOS as a zero-download, fast alternative (still on-device),
  with whisper.cpp as the cross-platform default.
- ⬜ **R3 (P0)** **TTS — Kokoro via `sherpa-onnx`.** Same voice as desktop (this is why
  CROSS_PLATFORM picked sherpa-onnx). Keep the **aggressive first-chunk** synthesis so the
  voice starts on the first clause while text still streams.
- ⬜ **R4 (P1)** **Voice adaptation (accent/gender/emotion):** defer for mobile v1 (it's OFF
  by default on desktop too). Later: wav2vec2 → ONNX via sherpa-onnx/onnxruntime-mobile, run
  off the critical path exactly as desktop does (`_schedule_detection`).
- ⬜ **R5 (P1)** **Model tiering by device RAM** (mirror `backend/model_tier.py`): 1B on
  low-RAM phones, 3B on flagships. Detect RAM/chip at first run; let the user override.

---

## 3. Orchestration core (TypeScript) — **P0**

Reimplement the pipeline that currently lives in `ws_handler.py` + the frontend JS, as a
platform-agnostic TS module driving the native model modules.

- ⬜ **O1 (P0)** Turn loop: mic → STT → LLM stream → phrase chunker → TTS → gapless audio,
  all overlapped (the desktop concurrency model). Port `phrase_chunker.py` + the
  `TTS_FIRST_CHUNK_*` tuning verbatim.
- ⬜ **O2 (P0)** **Barge-in**: interrupt while the voice is still playing (the fix we just
  made in `chat.js` — carry the "interruptible through playout" behaviour).
- ⬜ **O3 (P0)** VAD (auto-listen) using a native VAD (Silero via onnx, or platform APIs).
- ⬜ **O4 (P1)** Personas, persona-suggestion, and the **safety layer** (`safety.py`
  crisis signposting) — pure logic, ports directly.
- ⬜ **O5 (P1)** **Encrypted memory** (`memory_store.py`): store durable facts encrypted at
  rest in the app sandbox (iOS Keychain / Android Keystore for the key). Conversation history
  in on-device SQLite.
- ⬜ **O6 (P1)** Paced text reveal synced to the voice (the ~13 cps reveal from `chat.js`).

---

## 4. UI / UX — **P1** (mobile-native, portrait-first)

Rebuild the UI native, but keep the brand (sky backdrop, cream glass, poppy accent,
Instrument Serif) and the **avatar-hero, centered face + caption** direction we just landed on
desktop.

- ⬜ **U1 (P1)** Home/conversation screen: avatar centered (head-and-shoulders), current
  exchange as a caption low on screen, mic button primary, one clean vertical axis.
- ⬜ **U2 (P1)** First-run screen: detect → auto-download models with progress, matching the
  branded desktop setup screen. Reassure on privacy.
- ⬜ **U3 (P1)** Mic-permission priming + a "denied" recovery screen (deep-link to Settings).
- ⬜ **U4 (P2)** Settings: model tier, voice, persona defaults, memory view/clear.
- ⬜ **U5 (P2)** Haptics + audio-reactive motion so it feels alive without heavy 3D.

---

## 5. Platform specifics

### iOS — P0/P1
- ⬜ **I1 (P0)** `NSMicrophoneUsageDescription`; background-audio mode if replies continue when
  screen locks.
- ⬜ **I2 (P1)** On-device AI is App-Store-fine; keep the binary small and **download models on
  first run** (respect cellular limits; background download; allow Wi-Fi-only).
- ⬜ **I3 (P2)** Optional **MLX-Swift** LLM path for newer iPhones (faster than llama.cpp on
  Apple silicon) — same tiering idea as desktop MLX-vs-GGUF.

### Android — P0/P1
- ⬜ **A1 (P0)** `RECORD_AUDIO` permission + runtime request + denied-recovery.
- ⬜ **A2 (P0)** **Fragmentation is the hard part**: RAM varies 3–12 GB. Gate the 3B model to
  devices with enough free RAM; default low-RAM devices to 1B; refuse/​warn below a floor.
- ⬜ **A3 (P1)** GPU/NNAPI acceleration for llama.cpp where available (Vulkan), CPU fallback
  always — never require a GPU (same rule as the Windows plan).
- ⬜ **A4 (P1)** Foreground service for long replies while backgrounded (if desired).

---

## 6. The avatar on mobile — **P1** (a real decision, needs a spike)

3D lip-sync (TalkingHead) is the desktop centrepiece but is the biggest battery/thermal risk
on a phone under sustained use. Options, lightest → heaviest:

1. **Audio-reactive orb/blob** (ChatGPT-voice style): cheapest, very battery-friendly, on-brand
   for a voice companion. Good v1 default.
2. **Pre-rendered video loops** (idle/talk crossfade) — the direction noted in memory; light,
   warm, but not true lip-sync.
3. **2D Live2D / rigged sprite** with viseme-driven mouth — popular for mobile companions,
   moderate cost, real lip-sync feel.
4. **3D TalkingHead in a WebView / react-native-webgl** — full fidelity, highest battery/thermal
   cost; likely a later "high-end device" mode, not v1.

- ⬜ **V1 (P1)** Spike options 1–3 on a real device; measure battery/thermals during a 10-min
  conversation. Ship the lightest that still feels alive; keep 3D as an opt-in later.

---

## 7. Performance, battery, thermals — **P1** (the mobile-specific bar)

On-device LLM + STT + TTS is heavy; a phone will throttle. Budget and guard for it.
- ⬜ **P1a** Keep the model **resident while foregrounded**, unload on background/low-memory.
- ⬜ **P1b** Thermal-state awareness (iOS `ProcessInfo.thermalState` / Android thermal API):
  shrink model or cap tokens when hot.
- ⬜ **P1c** Cap generated tokens (replies are 2–4 sentences) to bound worst-case latency/heat.
- ⬜ **P1d** Target budgets (measure, don't assume): first-audio ≤ ~2.5s flagship / ≤ ~4s
  mid-range; turn-2 TTFT low via KV cache; sustained speed ≥ speech pace (~3–4 tok/s).

---

## 8. Model storage & first-run — **P0**
- ⬜ **S1 (P0)** Ship a **small app binary**; download the GGUF + Kokoro + Whisper on first run
  (like desktop), into the app sandbox; verify + resume; Wi-Fi-only option.
- ⬜ **S2 (P1)** Integrity check + graceful re-download; clear-cache/reset in Settings.

---

## 9. Privacy & offline — **the differentiator, make it loud**
Most mobile "AI companions" are cloud. Poppys being **100% on-device** is a rare, strong
selling point on phones. Prove and market it:
- ⬜ **Z1 (P1)** No analytics/networking at runtime after model download; the only deliberate
  network call is an explicit update check.
- ⬜ **Z2 (P1)** Airplane-mode end-to-end test on both platforms (the core promise).
- ⬜ **Z3 (P2)** Say it in-app and in the store listing: "runs entirely on your phone."

---

## 10. Distribution — **P0/P1**
- ⬜ **D1 (P0)** Apple Developer + Google Play developer accounts (you already have Apple access
  via a shared account for signing; a Play account is ~$25 one-time).
- ⬜ **D2 (P1)** App Store review notes (explain on-device AI, mic use, model download).
- ⬜ **D3 (P1)** Play Store listing + data-safety form (easy: "no data collected/shared").
- ⬜ **D4 (P2)** TestFlight / Play internal testing before public release.

---

## 11. Prerequisites & cost (lead time matters)
| Item | Cost | Blocks |
|---|---|---|
| Apple Developer account | $99/yr (have access) | iOS build/sign/submit |
| Google Play developer | $25 one-time | Android submit |
| A real mid-range Android (test) | ~$150–250 | A2/perf QA — **don't QA only on flagships** |
| A recent iPhone (test) | existing/borrow | iOS QA |

---

## 12. Critical path (suggested order)
1. **M0** framework spike (RN + `llama.rn` + `whisper.rn` + `sherpa-onnx`, end-to-end on a real
   phone) — *prove it before anything else.*
2. **M1 / R1–R3 / O1–O2** the core voice loop: talk → think → speak, with barge-in. This is the
   product; get it feeling fast first.
3. **U1–U3** the conversation UI + first-run download + mic permission.
4. **V1** pick the avatar approach (start light).
5. **R5 / A2 / P1a–d** device tiering + thermal/battery guards (esp. Android).
6. **O4–O6** personas, safety, memory, paced text.
7. **Z2** airplane-mode QA on both; **D1–D4** store submission → **mobile v1**.
8. Then P2 polish (3D avatar mode, MLX-Swift fast path, voice adaptation, settings).

---

## 13. Open decisions to lock early
- ~~**RN vs fully native**~~ — **LOCKED 2026-07-18: React Native** (§1). Native kept
  only as an optional per-hotpath module (MLX-Swift iOS fast-path) later.
- **Avatar tech for v1** — orb vs video vs Live2D (V1 spike).
- **STT on iOS** — Apple Speech (no download, fast) vs whisper.cpp (cross-platform parity).
- **iOS LLM** — llama.cpp everywhere vs MLX-Swift fast path on newer iPhones.
- **Android RAM floor** — the minimum device we support (drives the smallest model tier).

## 14. Reality check on effort
This is a **multi-month build**, not a port: a new app shell, a reimplemented pipeline, new
model runtimes, an avatar rethink, and two store submissions — on top of per-device
performance tuning (Android fragmentation especially). The upside: the hard product questions
(which models, the latency tricks, the prompt tuning, the UX direction) are already answered
by the desktop app, so mobile is *engineering a known design onto a new runtime*, not
rediscovering the product.
