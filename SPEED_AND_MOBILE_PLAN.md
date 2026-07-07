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

### 1.1 Take voice detection off the critical path — **P0** ✅
**Problem:** `/stt` ran the accent + gender + emotion classifiers (wav2vec2) on every
clip. Even running *concurrently* with transcription, `asyncio.gather` waited for the
**slowest** branch — the classifiers — so STT returned in ~1.3–4s instead of the ~0.1–0.4s
transcription actually takes. This was the single biggest latency source.

**Done — two parts:**
1. **Optional & off by default** — `DETECTION_DEFAULT` in `config.py`; `/stt` takes a
   `detect` flag; a header ✨ toggle opts in. Off = transcribe only.
2. **Never blocks, even when on** — transcription is the *only* thing on the response
   critical path. When adaptation is on, `/stt` returns the identity accumulated from
   prior turns (the accent/gender trackers are sticky; added an `EmotionTracker`) and
   classifies *this* clip in a **background thread** (`_schedule_detection` in `main.py`),
   so it shapes the **next** turn. (Covers PRODUCTION_PLAN **F1**.)

**Measured:** `detect=true` went **1.33s → ~0.15s**; the first turn returns the default
voice, and detection correctly applies from the second turn on. `detect=false` ~0.09s.

### 1.2 Faster / swappable STT model — **P1** ✅
- `WHISPER_BACKEND`, `WHISPER_MLX_REPO`, `WHISPER_MODEL` are **env-overridable** — swap
  models without editing code.
- **Default switched to `base.en`** (English-only Whisper base). Benchmarked on an M3
  over conversational clips: **base.en ~0.10s/clip vs small ~0.30s (~3×), equivalent
  accuracy**; `small.en` ~0.30s (no speed gain over small); `turbo` ~1.17s (heavy encoder,
  *slower* on short clips). CPU fallback also `base.en`.
- Documented `small.en` as the one-env-var fallback for more accuracy on noisy/accented
  speech. Both base.en weights (MLX + faster-whisper) are cached; `run.sh` gate passes.
- **Future (P2 spike):** **Moonshine** — an ASR built for short real-time on-device use;
  could beat Whisper further. Would be a new backend alongside MLX/faster-whisper.

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
- ✅ **1.1** detection optional + non-blocking background detection (1.33s→~0.15s with adaptation on).
- ✅ **1.2** STT default switched to `base.en` (~3× faster than small, same accuracy); env-swappable.
- ⬜ Next: **1.3** MLX-LM / speculative decoding, **1.4** audio-buffer trim.
- ⬜ Mobile: pick a runtime (recommend RN + llama.rn/whisper.rn) and build the 2.6 PoC.
