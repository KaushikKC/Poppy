# Desktop Packaging Plan — Ship v1 on Mac **and** Windows (fast + good)

*Written 2026-07-16. Goal: a non-developer downloads one installer, double-clicks, and
talks to Poppys privately — on macOS **or** Windows — with the same low-latency feel.*

Status legend: ✅ done · 🚧 in progress · ⬜ planned · **P0** ship-blocker · **P1** needed for release · **P2** polish.
This plan covers **both OSes for v1**. It sits on top of `PRODUCTION_PLAN.md` (Mac Phase A–I) and
`CROSS_PLATFORM_PLAN.md` (the eventual Electron/RN universal core — explicitly **not** v1).

---

## The central insight: we are ~90% cross-platform already

The app is a **FastAPI server + web frontend rendered in a `pywebview` native window**, packaged
with **PyInstaller**. That entire shell is portable. Only two pieces are Apple-only, and **both
already sit behind a dispatcher** so swapping them needs no changes elsewhere:

| Layer | Module | macOS (today) | Windows (v1) | Portable already? |
|---|---|---|---|---|
| LLM | `backend/llm.py` → `mlx_llm.py` / `ollama_client.py` | MLX (Metal) | **NEW: `llama_cpp_llm.py` (GGUF)** | dispatcher yes, backend no |
| STT | `backend/stt.py` | `mlx_whisper` (Metal) | **`faster-whisper` (CPU/CUDA)** — already the built-in fallback | ✅ works today |
| TTS | `backend/tts.py` (Kokoro) | torch + `espeakng-loader` | same, torch CPU | ✅ `espeakng-loader` ships a Windows DLL |
| Classifiers | accent/gender/emotion (wav2vec2) | torch/transformers | same | ✅ |
| Shell | `desktop/launcher.py` (`pywebview`) | Cocoa WebView | **Edge WebView2** (built into Win10/11) | ✅ pywebview supports both |
| Package | PyInstaller `poppys.spec` | `.app` → DMG | **NEW: `poppys_win.spec` → `.exe` installer** | tool is cross-platform |

**So the only genuinely new engineering for Windows v1 is one file — a GGUF LLM backend — plus a
Windows build/installer/signing pipeline.** Everything else is configuration and QA. This is why we
do *not* need Electron for v1: `pywebview` already renders our web UI on Windows via WebView2.

**One hard constraint, stated up front:** a Windows build must run on machines that have **no
CUDA**, integrated GPUs, and as little as 8 GB RAM. The default Windows LLM path is therefore
**CPU-first GGUF**, with GPU offload as an *optional accelerator*, never a requirement.

---

## Part 1 — The GGUF LLM backend (the one new component) — **P0**

Add `backend/llama_cpp_llm.py`, selected by `LLM_BACKEND=llamacpp`, exposing the exact same
`stream_reply(history, user_text, system_prompt) -> AsyncIterator[str]` + `warmup()` interface the
dispatcher already expects. Nothing else in the app changes.

**Engine:** `llama-cpp-python` (the maintained llama.cpp binding). In-process, no server — mirrors
the MLX design and the `node-llama-cpp`/GGUF direction already committed in `CROSS_PLATFORM_PLAN`.

**Model:** the GGUF twin of today's default — `Llama-3.2-3B-Instruct` Q4_K_M (~2 GB, matches the
Mac quality bar). Downloaded on first run exactly like the MLX weights.

Tasks:
- ✅ **L1 (P0)** `llama_cpp_llm.py` — resident model, threaded streaming via
  `create_chat_completion(stream=True)`, honors `LLAMACPP_MAX_TOKENS`/`n_ctx`, mirrors `mlx_llm`'s
  queue pattern. *(Code complete; not yet run on real Windows — see W9.)*
- ✅ **L2 (P0)** `LLM_BACKEND=llamacpp` wired into `llm.py` (third branch) + `preflight.py`
  (`ensure_llamacpp_llm`) + `download_models.py` (single-file GGUF check/download).
- ✅ **L3 (P0)** `config.py`: `LLAMACPP_MODEL_REPO`/`_FILE` (RAM-tiered via `model_tier`), `n_ctx=4096`,
  `n_gpu_layers` auto (offload-all when GPU-capable, CPU fallback on init failure), `n_threads` = physical cores.
- ⬜ **L4 (P1)** **KV / prompt cache** across turns (llama.cpp `cache_prompt` / saved state) — the
  Windows equivalent of the MLX persistent-prompt-cache trick. This is what keeps turn-2+ TTFT
  near-zero; do not skip it, it *is* the fast feel.
- ⬜ **L5 (P2)** Optional speculative decoding (1B draft GGUF) — **likely skip.** On the Mac/MLX side
  it was evaluated 2026-07-17 and **left off**: the 3B already streams ~12× the speaking pace (45 tok/s),
  so a faster stream isn't felt, while a draft costs RAM + slightly raises TTFT (see `PRODUCTION_PLAN` F4).
  Same logic almost certainly applies to GGUF; measure before adding it rather than assuming a win.
- ✅ **L6 (P1)** `backend/requirements-win.txt` — `llama-cpp-python` (CPU wheel default), `faster-whisper`,
  torch (CPU), transformers, kokoro, `pywebview` unpinned from darwin, no `mlx-*`.

> Backend parity check: run `scripts/benchmark_llm.py`-style timing on the GGUF path vs the MLX path
> on the same prompts, so we know the Windows 3B feels the same as the Mac 3B before shipping.

---

## Part 2 — macOS v1 finish line — **P0**

The Mac backend work is done; the gap is *packaging + trust*. This mirrors `PRODUCTION_PLAN` Phase A —
tracked there, summarized here so both OSes ship together.

- 🚧 **M1 (P0)** Build `dist/Poppys.app` (`./desktop/build_app.sh`). Spec is written; needs ~15 GB
  scratch. Expect 1–2 iterations on missing `collect_all` data files (watch `~/Library/Logs/Poppys/`).
- ⬜ **M2 (P0)** **Sign** with Developer ID (Apple Developer acct, $99/yr) — `codesign --deep
  --options runtime --entitlements` (mic + JIT for torch/llama).
- ⬜ **M3 (P0)** **Notarize** (`notarytool submit --wait` → `stapler staple`). Without this,
  Gatekeeper blocks it on every other Mac — a hard blocker for a *trust*-based product.
- ⬜ **M4 (P1)** **DMG** (`create-dmg`): drag-to-Applications with a background image.
- ⬜ **M5 (P1)** Smoke test the *signed* app on a clean Mac (not the dev machine) in **airplane mode**
  after first-run download — proves the offline promise end-to-end.
- ⬜ **M6 (P2)** Square app icon (current art is 846×998, slightly squashed — see `PRODUCTION_PLAN` A3).

---

## Part 3 — Windows v1 — **P0**

Reuse the **same** `launcher.py` / `preflight.py` / FastAPI / frontend. Only the LLM+STT backend combo
and the packaging/signing differ.

### 3a. Make the shell OS-aware — **P0**
- ✅ **W1 (P0)** Platform paths in `launcher.py` (`_log_dir()`): logs to `%LOCALAPPDATA%\Poppys\Logs`
  on Windows, `~/Library/Logs/Poppys` on macOS. *(Kept it dependency-free rather than adding platformdirs.)*
- ✅ **W2 (P0)** OS-aware default backend in `launcher.py`: `LLM_BACKEND` defaults to `mlx` on macOS,
  `llamacpp` elsewhere. `WHISPER_BACKEND=faster` already the non-Apple fallback in `stt.py`. *(Still TODO:
  force `KOKORO_DEVICE=cpu` on Windows.)*
- ⬜ **W3 (P0)** **WebView2 runtime check** in preflight: it's preinstalled on Win11 and most Win10,
  but bundle the tiny Evergreen bootstrapper and offer a one-click install if absent (else pywebview
  shows a blank window).
- ⬜ **W4 (P1)** Mic permission: Windows gates the mic per-app under Settings › Privacy; add a
  "denied" recovery screen with a deep link (`ms-settings:privacy-microphone`).

### 3b. Package — **P0**
- ✅ **W5 (P0)** `desktop/poppys_win.spec` written: one-dir; `collect_all` on `llama_cpp`,
  `faster_whisper`, `ctranslate2`, `kokoro`, `espeakng_loader`, `torch`, `transformers`, `webview`;
  `console=False`. *(TODO before build: generate `desktop/icons/poppys.ico` from the logo.)*
- ✅ **W6 (P0)** `desktop/build_app_win.ps1` written: disk guard + `requirements-win.txt` install +
  PyInstaller invoke (mirrors `build_app.sh`). *(Not yet run — needs a Windows machine.)*
- ⬜ **W7 (P0)** **Installer**: **Inno Setup** (simplest) or NSIS → a signed `PoppysSetup.exe` that
  installs to `%LOCALAPPDATA%\Programs\Poppys`, adds Start-menu + desktop shortcuts, and a clean
  uninstaller. (No admin rights needed — per-user install avoids UAC friction.)
- ⬜ **W8 (P0)** **Authenticode code-signing** of both the `.exe` and the installer. Without it,
  **SmartScreen** shows the full-screen "Windows protected your PC" warning — a conversion killer for
  a privacy app. Use an **OV** cert (~$200–400/yr; reputation builds over time) or **EV** (instant
  SmartScreen trust, pricier). Sign with `signtool` + timestamp server.
- ⬜ **W9 (P1)** Test the *signed* installer on a **clean Windows 11 VM with no dev tools**, no CUDA,
  8 GB RAM — the true target machine. Then repeat in airplane mode post-download.

---

## Part 4 — Make it FAST (both platforms) — **P0/P1**

Latency *is* the product (the Hermes rejection in `CROSS_PLATFORM_PLAN` was entirely about
protecting sub-1.5s turns). The Mac path already hits **1.47s first-audio**; Windows must get close.

**Startup speed**
- ⬜ **S1 (P0)** Instant window + streamed progress: already done in `launcher.py`. Keep it — never a
  blank hang on first launch (the multi-GB download runs behind a live log).
- ⬜ **S2 (P1)** **Parallel warmup** on a background thread the moment the server is healthy: LLM
  load + STT compile + Kokoro cold-start fire together (they already have `warmup()` hooks), so the
  *first real turn* isn't a cold start. Verify all three run concurrently, not serially.
- ⬜ **S3 (P1)** **Model stays resident** in-process (MLX + llama.cpp both keep weights loaded between
  turns — the `keep_alive=-1` equivalent). Confirm neither backend reloads per turn.

**Per-turn latency**
- ⬜ **S4 (P0)** Carry the tuned prompt path to GGUF: tiny system prompt, `MAX_HISTORY_TURNS=6`,
  `n_ctx=4096`. Prefill is cheap only because the prompt is small — do not regress this.
- ⬜ **S5 (P0)** **KV/prompt cache** on Windows (= task **L4**) so turn 2+ TTFT is near-zero, matching
  the MLX persistent-cache behavior.
- ⬜ **S6 (P1)** Keep the **aggressive first-chunk TTS** (`TTS_FIRST_CHUNK_*` in `config.py`): the
  voice starts on the first comma/clause (~4–6 chars) while text still streams. This is why first-
  *audio* beats first-*sentence* — platform-independent, already built.
- ✅ **S7 (P1)** **F1 from `PRODUCTION_PLAN`** — done in `main.py` (`/stt` returns the transcript
  immediately; `_schedule_detection` runs the classifiers in the background for the next turn).
  Platform-independent, so this carries to Windows/CPU-STT for free.

**GPU where it exists, never required**
- ⬜ **S8 (P1)** **Auto GPU offload** for GGUF: detect a usable GPU and set `n_gpu_layers` accordingly;
  ship the **Vulkan** `llama-cpp-python` wheel as the universal GPU path (works on NVIDIA/AMD/Intel),
  fall back to the CPU wheel if Vulkan init fails. Optional CUDA wheel for NVIDIA as a fast path.
  **The app must run fully on CPU** — GPU is a bonus, so an 8 GB integrated-GPU laptop still works.
- ⬜ **S9 (P2)** faster-whisper on CUDA where available (`WHISPER_DEVICE=cuda`) — a big STT speedup on
  NVIDIA Windows machines; CPU int8 stays the default.

**Target budgets (measure, don't assume):**
first-audio **≤ 1.5s Mac / ≤ 2.5s mid Windows (CPU)**; turn-2 TTFT **≤ 0.7s** both; sustained speed
**≥ 8 tok/s** (ahead of ~3–4 tok/s speech). Extend `validate.py` to assert these per platform.

---

## Part 5 — Make it GOOD (robustness + adaptation) — **P1**

A companion runs for 30+ minutes; it must not break mid-conversation or choke a weak machine.

- ✅ **Q1 (P1)** **RAM → model tier** (`PRODUCTION_PLAN` D1) — `backend/model_tier.py`: psutil RAM →
  1B/3B/8B for both MLX and GGUF, env + saved-file override, shown on first-run. *(Bonsai-27B "deep
  mode" for 32 GB+ still a future add — the tier tops out at 8B for now.)*
- ⬜ **Q2 (P1)** **Low-RAM / OOM guard** (`PRODUCTION_PLAN` C4): catch model-load OOM, drop to the
  smaller tier, tell the user plainly instead of crashing.
- ⬜ **Q3 (P1)** **WebSocket auto-reconnect** (C2) + **surface backend errors in the UI** (C3): today a
  dropped socket silently ends the turn.
- ⬜ **Q4 (P1)** **In-app diagnostics panel** (E2): reuse `preflight` + live model status + the timing
  badge, so a user (or we, remotely) can see what's wrong without reading log files.
- ⬜ **Q5 (P1)** **Live re-check button** on the setup screen (B1): fix a problem and retry without
  quitting/reopening.
- ⬜ **Q6 (P2)** **Auto-update**: Sparkle (Mac) / a check-for-update ping (Win). Privacy note: an
  update *check* is the one deliberate network call — make it explicit and minimal.

---

## Part 6 — Cost & prerequisites (start these NOW — they have lead time)

| Item | Cost | Lead time | Blocks |
|---|---|---|---|
| Apple Developer account | $99/yr | hours–2 days | M2/M3 (Mac sign+notarize) |
| Windows code-signing cert (OV) | ~$200–400/yr | **days** (identity vetting) | W8 (Win sign) |
| Windows 11 test VM (no dev tools, 8 GB) | free (UTM/Parallels/VirtualBox) | hours | W9 QA |
| Clean Mac for QA | existing | — | M5 QA |

**Do the cert paperwork first** — vetting delay is the critical-path risk, not the code.

---

## Critical path to a two-platform v1

1. **L1–L3** GGUF backend working in dev on Windows (the one new component).
2. **W1–W3** shell OS-awareness + WebView2; run the full pipeline unpackaged on Windows.
3. **Cert paperwork** (Apple + Windows) in parallel with the above — lead time.
4. **M1** Mac build + **W5–W7** Windows build → both produce a runnable artifact.
5. **S2–S6, L4** speed pass on both; measure against the budgets.
6. **M2–M4 / W8** sign + notarize + installers.
7. **M5 / W9** clean-machine + airplane-mode QA on both.
8. **Q1–Q5** robustness + RAM tiering + diagnostics.
9. Ship **v1 (Mac DMG + Windows Setup.exe)** → then P2 (auto-update, deep mode, GPU tuning).

**One-line summary:** the shell, UI, and pipeline are already cross-platform; Windows v1 = **one new
GGUF backend + a signed installer**, the Mac is a build-and-sign away, and "fast" is protected by
carrying the existing latency tricks (small prompt, KV cache, aggressive first-chunk TTS, resident
model) onto the GGUF path.
