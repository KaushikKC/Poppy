# Speed & Mobile — Implementation Plan

*A forward-looking engineering plan for two goals: (1) make the local desktop app
much faster, and (2) bring Poppys to mobile with an on-device model. This is the
roadmap; some of Phase 1 is already being implemented (see "Status").*

Status legend: ✅ done · 🚧 in progress · ⬜ planned · Priority: **P0** biggest win · **P1** worth doing · **P2** later.

---

## Part 1 — Make it much faster (local desktop)

The only latency number that matters to a user is **mic-stop → first audio out.**
Everything below is ordered by how much it moves that number. The phrase-by-phrase
streaming, hot Ollama, Metal STT, and warmed models are already done; these are the
*next* tier.

### 1.1 Take voice detection off the critical path — **P0** 🚧
**Problem:** `/stt` runs the accent + gender + emotion classifiers (wav2vec2) on every
clip. Even though they run *concurrently* with transcription, `asyncio.gather` waits
for the **slowest** branch — the classifiers — so STT returns in ~3–4s instead of the
~0.4s transcription actually takes. This is the single biggest latency source.

**Fix (being implemented now):** make detection **optional and off by default**.
- New `DETECTION_DEFAULT = False` in `config.py`; `/stt` takes a `detect` flag.
- When off: transcribe only → `/stt` returns in ~0.4s. **~3s saved per turn.**
- When on: the classifiers run and the reply voice/tone adapts (the current behavior),
  which the user opts into via a header toggle.
- The reply pipeline already tolerates absent accent/gender/emotion (falls back to a
  default voice + neutral tone in `ws_handler.py`), so nothing downstream breaks.

**Later refinement (P1):** even when detection is *on*, don't block the transcript on it.
Return the transcript immediately, run the classifiers in a background thread, and apply
the detected identity to the **next** turn (the trackers are already sticky/stateful).
That gives adaptation *and* full speed. (This is PRODUCTION_PLAN item **F1**.)

### 1.2 Faster / swappable STT model — **P1** 🚧
Transcription isn't the bottleneck once 1.1 lands (~0.4s), but there's headroom:
- Make `WHISPER_BACKEND`, `WHISPER_MLX_REPO`, `WHISPER_MODEL` **env-overridable** so the
  model can be swapped without editing code (being implemented now).
- We force English (`language="en"`), so **English-only** models are a free win — same or
  better accuracy, a bit faster. CPU fallback moved to the already-cached `small.en`.
- **For more speed:** switch the MLX weights to `whisper-base.en` (74M, ~2× faster than
  small) — accept a small accuracy drop — or to `whisper-large-v3-turbo` (fast decoder,
  *higher* accuracy, ~1.6 GB RAM). Either requires `python3 backend/download_models.py`
  once online, because `run.sh` gate-checks that models are cached.
- **Best-in-class for on-device low latency (P2 spike):** **Moonshine** — an ASR built
  specifically for short, real-time on-device use; markedly faster than Whisper on short
  clips. Would be a new backend alongside MLX/faster-whisper.

### 1.3 Faster LLM path — **P1** ⬜
- **Try MLX-LM instead of Ollama.** Apple's own framework is often 20–40% faster on
  Apple Silicon for the same model, and pairs naturally with MLX-Whisper.
- **Speculative decoding:** a tiny 0.5B draft model proposes tokens for the 3B to verify
  — meaningful tokens/sec gain for conversational replies.
- **Persistent prompt/KV cache:** keep the system prompt prefill cached so time-to-first-
  token is near-zero every turn (we already trimmed history + memory to shrink prefill).
- Keep replies short (already capped at 2–4 sentences) — full-turn time scales with length.

### 1.4 Trim the audio start-up delay — **P1** ⬜
- The initial playout buffer was enlarged to smooth first-chunk gaps; once STT + TTFT are
  faster and steadier, **walk that buffer back down** — it directly pads latency.
- Make the **first** TTS phrase tiny (break on the first comma/clause) so the very first
  audio chunk plays almost immediately. (`TTS_FIRST_CHUNK_*` already exist to tune this.)
- Optional: run Kokoro on CPU to remove GPU contention with the LLM (PRODUCTION_PLAN F2).

### 1.5 Target budget
| Stage | Now | Target after 1.1–1.4 |
|---|---|---|
| STT (mic-stop → transcript) | ~3–4s (with detection) | ~0.3s |
| LLM first token | ~0.3s | ~0.2s |
| TTS first phrase | ~0.15s | ~0.1s |
| **Perceived (mic-stop → first audio)** | **~1s+** | **~0.5s** |

---

## Part 2 — Mobile (iOS + Android, on-device model)

### 2.1 The core architectural shift
The desktop app is **client-server**: Ollama runs as a background server, a FastAPI
backend orchestrates STT→LLM→TTS, and a browser talks to it over WebSockets.

**Phones do not run Ollama or a background server.** On mobile the model runs as a
**library embedded inside the app process.** That means:
- The models themselves are fine on modern phones — a 3B 4-bit LLM is ~2 GB RAM.
- But the **orchestration logic** (phrase chunking, memory, personas, safety, accent→voice
  mapping) must be **re-implemented in the app's language** (Swift / Kotlin / JS). That
  port is the real cost of going mobile — not the AI.

### 2.2 Hardware reality
- A local LLM needs a recent flagship: **8 GB RAM** iPhone (15 Pro / 16) or 8 GB+ Android.
  Tight on 6 GB, not viable on budget phones.
- Plan to ship a **1B–3B** model on phones (smaller than desktop's 3B where needed).
- First launch downloads the model (~1–2 GB) with a progress screen — don't bundle it into
  the binary (app stores dislike huge apps).

### 2.3 iOS stack
| Layer | Recommended | Alternative |
|---|---|---|
| LLM | **MLX-Swift** (same MLX as desktop; `mlx-swift-examples` has a working chat app) | llama.cpp (Metal); or Apple's **Foundation Models** on-device LLM on iOS 26+ (free, no bundling) |
| STT | **whisper.cpp** (Metal) | Apple Speech framework (on-device) |
| TTS | Apple **AVSpeechSynthesizer** (free, instant) to start | port Kokoro/Piper later for the branded voice |
| Shell | native **SwiftUI** app | — |

### 2.4 Android stack
| Layer | Recommended | Alternative |
|---|---|---|
| LLM | **MLC-LLM** (Vulkan GPU, built for mobile) | Google **MediaPipe LLM Inference** (Gemma on-device); llama.cpp via JNI |
| STT | **whisper.cpp** (NDK) | Android on-device SpeechRecognizer |
| TTS | Android **TextToSpeech** (built-in) | port Kokoro/Piper |
| Shell | native **Kotlin/Compose** app | — |

### 2.5 Recommended path for a small team — don't build two native apps
Pick **one** cross-platform runtime:
1. **React Native + `llama.rn` + `whisper.rn` + native TTS** — one JS codebase, both stores,
   and you can reuse a lot of the existing frontend logic. **Fastest path to shipping.** ⭐
2. **MLC-LLM** — one model-compile flow targets iOS, Android, *and* WebGPU; best raw GPU
   control if you want maximum performance.
3. **PWA / WebGPU (WebLLM)** — run the LLM in the browser via WebGPU; iOS 26 Safari now
   supports WebGPU. Could reuse the **existing HTML/JS frontend almost wholesale** as an
   installable web app — least rewrite, but mobile WebGPU is still maturing. Worth a spike.

### 2.6 Suggested first milestone (week-1 proof of concept)
- One platform (recommend iOS with MLX-Swift, or the RN route for both).
- Prove the loop end-to-end: record → whisper.cpp → 1–3B LLM → system TTS → text on screen.
- Skip avatar, accent detection, memory at first — just prove on-device speed feels real.
- Measure mic-stop → first audio on a real device before investing in the full port.

### 2.7 Launch & distribution
- **iOS:** App Store; TestFlight for beta.
- **Android:** Google Play (internal testing track first).
- First-run model download with progress; set expectations that it needs a recent flagship.
- Same privacy story as desktop — nothing leaves the device — which is the whole pitch.

---

## Status snapshot
- ✅ Already shipped: phrase-streaming, hot Ollama, Metal STT, warmed models.
- 🚧 In progress (this pass): **1.1** detection optional/off-by-default, **1.2** swappable STT.
- ⬜ Next: 1.1 background-detection refinement, 1.3 MLX-LM/spec-decoding, 1.4 audio trim.
- ⬜ Mobile: pick a runtime (recommend RN + llama.rn/whisper.rn) and build the 2.6 PoC.
