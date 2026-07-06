# Production Readiness Plan — Private Companion

**Direction A: a polished, distributable, fully-offline local desktop app** that a
non-developer can install and use reliably on their own Mac. (Multi-user/cloud is a
separate track — see the Appendix.)

Status legend: ✅ done · 🚧 in progress · ⬜ not started · Priority: **P0** ship-blocker ·
**P1** needed for a real release · **P2** polish / nice-to-have.

> Scope note: `TODO.md` tracks the MVP build (complete). This document tracks the gap
> from "working on my machine" to "installable product on other people's machines."

---

## Definition of "production" (for this app)
1. A signed, notarized `.app` a user can double-click — no terminal, no Python setup.
2. First launch guides the user through everything it needs (Ollama, models, mic) with progress.
3. Works fully offline after setup; nothing leaves the device.
4. Degrades gracefully on failures (Ollama down, mic denied, low RAM) instead of breaking.
5. Adapts to the machine (RAM → model size, Apple Silicon vs Intel).
6. Diagnosable when something goes wrong (logs, a health panel).
7. Updatable.

---

## 0. Current state (done)
- ✅ Full local pipeline: STT → LLM (Ollama) → TTS (Kokoro) → 3D avatar, streaming.
- ✅ Speed pass: 3B model, hot Ollama (`keep_alive=-1`), trimmed prompt, **Metal STT** (mlx-whisper, ~4× faster), parallel `/stt`, warmed classifiers.
- ✅ Text pacing synced to the voice; avatar (male faces forward); barge-in.
- ✅ **Offline vendoring** — Three.js / TalkingHead / HeadAudio / Draco vendored under `frontend/vendor/`; no runtime CDN. *(uncommitted)*
- ✅ **Desktop shell foundation** — `desktop/launcher.py` (native window) + `desktop/preflight.py` (dep checks/auto-fix) + `run_app.sh`. *(uncommitted, window untested)*

---

## Phase A — Packaging & distribution  (P0)
The core gap: today it needs Python + a terminal. It must become a double-click app.

| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| A1 | `.app` bundle via **py2app** | P0 | ⬜ | Wrap `desktop/launcher.py`. |
| A2 | `Info.plist`: **`NSMicrophoneUsageDescription`** | P0 | ⬜ | Without this the mic is silently denied — the app is voice-first, so this is blocking. |
| A3 | App icon (`.icns`) + name/version/`NSHighResolutionCapable` | P1 | ⬜ | |
| A4 | Bundle Python runtime + heavy deps (torch, mlx, transformers) | P0 | ⬜ | The hard part. Fallback: a **venv-based installer** (script/pkg that creates the env) instead of one frozen binary. Decide early. |
| A5 | **Ollama** dependency strategy | P0 | ⬜ | Can't easily embed. Options: (a) first-run guides install; (b) bundle the `ollama` binary + serve it ourselves. Recommend (b) for one-click. |
| A6 | `espeak-ng` bundling | P1 | ⬜ | Kokoro needs it. Bundle the dylib or install via a first-run step. |
| A7 | **Code signing** (Apple Developer ID) | P0 | ⬜ | Needs a paid Apple Developer account, else Gatekeeper blocks it. |
| A8 | **Notarization** (Apple) | P0 | ⬜ | Required to open on other Macs without warnings. |
| A9 | DMG / `.pkg` installer | P1 | ⬜ | Drag-to-Applications or guided installer. |
| A10 | Auto-update (Sparkle or check-for-update) | P2 | ⬜ | |
| A11 | Intel (x86_64) support or explicit gate | P2 | ⬜ | MLX is ARM-only; CPU fallback exists. Decide: ARM-only, or universal. |

## Phase B — First-run & setup UX  (P0/P1)
`preflight` exists, but the UX is bare (static "fix then reopen").

| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| B1 | Live setup screen with **re-check** button | P1 | ⬜ | Currently must quit/reopen; wire a `js_api` re-run. |
| B2 | **Progress UI** for model pull + speech-model download | P0 | ⬜ | 2 GB+ downloads; a blank window looks hung. Stream progress. |
| B3 | Guided / bundled **Ollama install** | P0 | ⬜ | Pairs with A5. |
| B4 | Mic-permission priming + "denied" recovery screen | P1 | ⬜ | Explain, deep-link to System Settings. |
| B5 | Settings screen (model, voice, persona defaults) | P2 | ⬜ | |

## Phase C — Robustness & error handling  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| C1 | Ollama crash/restart mid-session → reconnect | P1 | ⬜ | Health-poll + relaunch. |
| C2 | Frontend WebSocket auto-reconnect | P1 | ⬜ | Currently a dropped socket ends the turn. |
| C3 | Surface backend errors in the UI | P1 | ⬜ | Some exceptions are swallowed today. |
| C4 | Model/OOM handling on low RAM | P1 | ⬜ | Detect, fall back to a smaller model. |
| C5 | Barge-in fix: `_replyActive` flips off at `done` while audio still plays | P2 | ⬜ | Speaking during playout may not cut off cleanly. |

## Phase D — Hardware adaptation  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| D1 | Detect RAM → pick model size (8 GB→1B/3B, 16 GB→3B, 32 GB→8B) | P1 | ⬜ | Currently hard-coded to 3B. |
| D2 | Detect Apple Silicon vs Intel → STT backend | P1 | ✅ (logic) | `WHISPER_BACKEND` + CPU fallback already handle this; just wire into setup. |
| D3 | Thermal/pressure awareness (optional) | P2 | ⬜ | |

## Phase E — Observability & diagnostics  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| E1 | Rotating file logging (app + backend) | P1 | ⬜ | Today logs go to a terminal that won't exist in the `.app`. |
| E2 | In-app diagnostics/health panel | P1 | ⬜ | Reuse `preflight` + live model status. |
| E3 | Server-side timing metrics (TTFT / STT / TTS RTF) | P2 | ⬜ | Extend the existing latency badge. |
| E4 | Local, privacy-preserving crash capture | P2 | ⬜ | No network — write to a local report. |

## Phase F — Performance polish  (P2)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| F1 | STT ~3-4s: decouple sticky accent/gender from the critical path | P1 | ⬜ | Return transcript immediately; update identity in background for next turn. |
| F2 | Consider Kokoro on CPU to cut GPU contention with the LLM | P2 | ⬜ | Kokoro RTF ~0.18; test if it smooths first-2s gaps. |
| F3 | Streaming/partial STT | P2 | ⬜ | Start the LLM before the full transcript. |

## Phase G — Testing & QA  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| G1 | Backend unit tests (chunker, accent/gender/emotion, memory, safety) | P1 | ⬜ | |
| G2 | Integration tests for `/stt` and `/ws/chat` | P1 | ⬜ | |
| G3 | Run `validate.py` gates (latency ≤1.5s, 10-turn stability, <11 GB) in CI | P1 | 🚧 | Script exists; automate + extend. |
| G4 | **Offline airplane-mode** end-to-end test | P0 | ⬜ | The core promise; now testable after vendoring. |
| G5 | Test on multiple Macs (M1/M2/M3/M4, 8/16/32 GB) | P1 | ⬜ | |

## Phase H — Security & privacy hardening  (P2)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| H1 | Server bound to `127.0.0.1` only | P1 | ✅ | Confirm in packaged build. |
| H2 | Encrypted memory key management review | P2 | ✅ (Fernet) | Document threat model; key at `companion.key` (chmod 600). |
| H3 | Verify zero external network at runtime (assert in CI) | P1 | ⬜ | Pairs with G4. |
| H4 | Dependency pinning + audit | P2 | 🚧 | Backend pinned; add periodic audit. |
| H5 | Input/safety layer review | P2 | ✅ | `safety.py` crisis signposting exists. |

## Phase I — Docs & release  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| I1 | README: desktop-app install/run (replace video-avatar section) | P1 | ⬜ | README still describes the old video avatar. |
| I2 | Build/release runbook (sign → notarize → DMG) | P1 | ⬜ | |
| I3 | User guide (first run, permissions, troubleshooting) | P2 | ⬜ | |
| I4 | Versioning + changelog | P2 | ⬜ | |

---

## Suggested order (critical path to a shippable v1)
1. **G4** offline airplane-mode test — prove the offline core before packaging.
2. **A4/A5** decide runtime + Ollama bundling strategy (venv-installer vs frozen; embed ollama).
3. **A1–A3, A6** build the `.app` + mic Info.plist + icon + espeak.
4. **B2/B3** first-run progress + Ollama setup (so first launch isn't a blank hang).
5. **A7/A8** sign + notarize.
6. **C1–C3, E1/E2** robustness + logging/diagnostics (so failures are recoverable/visible).
7. **D1** RAM→model adaptation.
8. **A9** DMG; **I1/I2** docs + runbook → **v1**.
9. Then P2 polish (F, E3/E4, A10, H2/H4).

---

## Appendix — Multi-user / cloud (Direction B/C, out of scope for now)
Only if the product pivots to hosted SaaS. Key items, none started:
- **Blocker:** `ws_handler.conversation_history` is a module-level global shared across all
  connections — multi-user would cross-contaminate. Make it per-session.
- Externalize state (Postgres + Redis); run N stateless API replicas behind a load balancer.
- Real model serving: vLLM/TGI (LLM) + batched GPU services for Whisper/Kokoro (the TTS `_lock`
  must become a queue/pool).
- Auth, rate limiting, per-user data isolation, observability, WebSocket backplane.
- **Trade-off:** breaks the "nothing leaves your device" promise — a different product.
