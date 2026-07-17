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
| A1 | `.app` bundle via **PyInstaller** | P0 | 🚧 | `desktop/poppys.spec` + `build_app.sh` written (switched from py2app — better torch hooks). Build itself pending: needs ~15 GB free disk (had 7.6). |
| A2 | `Info.plist`: **`NSMicrophoneUsageDescription`** | P0 | ✅ | In `poppys.spec` `info_plist`. |
| A3 | App icon (`.icns`) + name/version/`NSHighResolutionCapable` | P1 | ✅ | `desktop/icons/poppys.icns` (note: logo is 846×998, slightly squashed — replace with square art before public release). |
| A4 | Bundle Python runtime + heavy deps (torch, mlx, transformers) | P0 | 🚧 | Decided: PyInstaller one-dir, `collect_all` on ML libs; expect iteration on first build. |
| A5 | **Ollama** dependency strategy | P0 | ✅ | Resolved by removing the dependency: packaged default is **LLM_BACKEND=mlx** (in-process Metal). Ollama stays as a power-user opt-in; preflight only checks it in that mode. Verified end-to-end 2026-07-15: first token 0.79s, **first audio 1.47s**, turn 2 TTFT 0.65s. |
| A6 | `espeak-ng` bundling | P1 | ✅ | Already solved via pip: misaki loads the dylib from `espeakng-loader` — no system install. Preflight now checks the import, not brew. |
| A7 | **Code signing** (Apple Developer ID) | P0 | ⬜ | Needs a paid Apple Developer account, else Gatekeeper blocks it. |
| A8 | **Notarization** (Apple) | P0 | ⬜ | Required to open on other Macs without warnings. |
| A9 | DMG / `.pkg` installer | P1 | ⬜ | Drag-to-Applications or guided installer. |
| A10 | Auto-update (Sparkle or check-for-update) | P2 | ⬜ | |
| A11 | Intel (x86_64) support or explicit gate | P2 | ⬜ | MLX is ARM-only; CPU fallback exists. Decide: ARM-only, or universal. |

## Phase B — First-run & setup UX  (P0/P1)
`preflight` exists, but the UX is bare (static "fix then reopen").

| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| B1 | Live setup screen with **re-check** button | P1 | 🚧 | Setup failures now render in-window with fixes; re-check still needs quit/reopen. |
| B2 | **Progress UI** for model pull + speech-model download | P0 | ✅ | Launcher opens instantly with a live progress screen; downloads run in a subprocess with output streamed into the window, then it navigates to the app. |
| B3 | Guided / bundled **Ollama install** | P0 | ✅ | Obsolete — no Ollama in the packaged app (see A5). |
| B4 | Mic-permission priming + "denied" recovery screen | P1 | ⬜ | Explain, deep-link to System Settings. |
| B5 | Settings screen (model, voice, persona defaults) | P2 | ⬜ | |

## Phase C — Robustness & error handling  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| C1 | Ollama crash/restart mid-session → reconnect | P1 | ⬜ | Health-poll + relaunch. |
| C2 | Frontend WebSocket auto-reconnect | P1 | ⬜ | Currently a dropped socket ends the turn. |
| C3 | Surface backend errors in the UI | P1 | ⬜ | Some exceptions are swallowed today. |
| C4 | Model/OOM handling on low RAM | P1 | ⬜ | Detect, fall back to a smaller model. |
| C5 | Barge-in fix: `_replyActive` flips off at `done` while audio still plays | P2 | ✅ | Fixed 2026-07-17: `interruptReply` now also fires while `player.isPlaying()`, so barging in during voice playout cuts it off. (Not yet driven live in a browser.) |

## Phase D — Hardware adaptation  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| D1 | Detect RAM → pick model size (8 GB→1B/3B, 16 GB→3B, 32 GB→8B) | P1 | ✅ | `backend/model_tier.py`: reads RAM (psutil), picks 1B/3B/8B per backend (MLX + GGUF), env + saved-file override. Wired into `config.py`, shown on the first-run screen (`preflight`). |
| D2 | Detect Apple Silicon vs Intel → STT backend | P1 | ✅ (logic) | `WHISPER_BACKEND` + CPU fallback already handle this; just wire into setup. |
| D3 | Thermal/pressure awareness (optional) | P2 | ⬜ | |

## Phase E — Observability & diagnostics  (P1)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| E1 | Rotating file logging (app + backend) | P1 | ✅ | `~/Library/Logs/Poppys/poppys.log` (2 MB × 5); uvicorn routed there; frozen app also captures stray prints. |
| E2 | In-app diagnostics/health panel | P1 | ⬜ | Reuse `preflight` + live model status. |
| E3 | Server-side timing metrics (TTFT / STT / TTS RTF) | P2 | ⬜ | Extend the existing latency badge. |
| E4 | Local, privacy-preserving crash capture | P2 | ⬜ | No network — write to a local report. |

## Phase F — Performance polish  (P2)
| # | Task | Pri | Status | Notes |
|---|------|-----|--------|-------|
| F1 | STT ~3-4s: decouple sticky accent/gender from the critical path | P1 | ✅ | Done in `main.py`: `/stt` returns the transcript immediately (~0.4s); `_schedule_detection` runs the classifiers in a background thread to shape the *next* turn. |
| F2 | Consider Kokoro on CPU to cut GPU contention with the LLM | P2 | ⬜ | Kokoro RTF ~0.18; test if it smooths first-2s gaps. |
| F3 | Streaming/partial STT | P2 | ⬜ | Start the LLM before the full transcript. |
| F4 | Speculative decoding (1B draft model, MLX) | P2 | ✅ (won't ship) | Evaluated 2026-07-17 and **left OFF by default**. Baseline 3B benchmarks at **45 tok/s, 288 ms TTFT** — ~12× the ~3-4 tok/s speaking pace, so a faster stream gives no felt gain, while a draft costs ~0.7 GB RAM (hurts 8 GB machines) and slightly raises TTFT. Kept as an env opt-in (`MLX_DRAFT_MODEL`); `mlx_llm._load` degrades gracefully if uncached. |

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
