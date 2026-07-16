# Cross-Platform Plan — One Companion on Mac, Windows, Linux, iOS, Android

*Researched 2026-07-15. Answers: "what is the ultimate universal solution?", "should we
use LangChain?", "what about Hermes Agent?", "what about Bonsai 27B?"*

Status legend: ✅ done · 🚧 in progress · ⬜ planned · **P0** critical · **P1** important · **P2** later.

---

## The ultimate answer: converge on the llama.cpp + GGUF + ONNX ecosystem

There is exactly one inference ecosystem that runs the *same model files* on every
platform we care about, is production-proven, and is free/open-source:

| Layer | Universal engine | Runs on |
|---|---|---|
| LLM | **llama.cpp** (GGUF models) | Mac (Metal), Windows (CUDA/Vulkan/CPU), Linux, iOS (Metal), Android |
| STT | **whisper.cpp** (same team's approach) | all of the above |
| TTS | **sherpa-onnx** — runs **Kokoro-82M** (our exact voice!) via ONNX | Mac, Windows, Linux, iOS, Android |

Bindings that wrap these per shell:
- **Desktop (Electron):** `node-llama-cpp` (official Electron support; `@electron/llm` builds on it) — one JS codebase → Mac/Windows/Linux installers.
- **Mobile (React Native):** `llama.rn` (llama.cpp binding, used in production by PocketPal AI etc.) + `whisper.rn` + `react-native-sherpa-onnx` (Kokoro TTS on-device, iOS + Android).

**The strategic consequence:** if the orchestration core (phrase chunker, personas,
memory, safety, accent→voice mapping — all currently Python) is ported **once to
TypeScript**, that same core runs inside Electron on 3 desktop OSes AND inside React
Native on both phones. One model format (GGUF), one voice (Kokoro), one core, five
platforms. This is the "universal fix."

**Key insight: on phones there is no server.** No Ollama, no FastAPI, no WebSocket.
The model runs as a library *inside the app process*. The universal architecture is
therefore "embedded library + shared TS core," not "backend + frontend."

---

## Strategy: two stages — ship Mac now, go universal second

Do **not** block the launch on universality. A 3-platform rewrite before any user has
touched the product is the classic mistake.

### Stage 1 — Ship the Mac desktop v1 (now, ~2–4 weeks)
Exactly per `PRODUCTION_PLAN.md` Phase A: MLX in-process LLM (no Ollama), PyInstaller
`.app`, mic permission, sign + notarize, first-run download UX. The Python backend is
*kept* for this — it works today. This gets a real product into real hands and
validates demand before the bigger investment.

### Stage 2 — The universal core (start after v1 ships; ~2–3 months)
1. **Port the core to TypeScript** (`core/` package, no UI): phrase_chunker, personas,
   memory (encrypted store), safety, prompt assembly, conversation history. This is
   ~2k lines of logic, all portable. Unit-test it against the Python outputs.
2. **React Native app** (iOS + Android) — `llama.rn` + `whisper.rn` +
   `react-native-sherpa-onnx` (Kokoro) + the TS core. Reuse the existing web
   frontend's UI patterns (chat, status pill, EQ animation) in RN.
3. **Electron app** (Windows + Linux, later replaces the Mac Python app too) —
   `node-llama-cpp` + sherpa-onnx node bindings + the *same* TS core and near-same UI.
4. Result: Python backend retires; one codebase, five platforms.

### Week-1 proof of concept before committing to Stage 2 (P0)
One RN screen on a real iPhone + one mid-range Android: record → whisper.rn →
Llama-3.2-3B-4bit via llama.rn → sherpa-onnx Kokoro → audio out. **Measure
mic-stop → first-audio.** If a recent iPhone gets under ~1.5s, Stage 2 is a go.
(This supersedes SPEED_AND_MOBILE_PLAN §2.6 with a concrete TTS answer: sherpa-onnx
Kokoro means the *same branded voice* on mobile — previously an open question.)

---

## Model matrix (per device tier)

| Device | Model | Why |
|---|---|---|
| Mac 16 GB+ (v1) | Llama-3.2-3B-Instruct-4bit (MLX) — today's default | shipped, tuned; 285ms TTFT, 46 tok/s, 2 GB |
| Mac 32 GB+ / desktop (v1.x) | **Ternary Bonsai-27B (MLX 2-bit, 8 GB)** — verified loads on mainline MLX | "deep mode" toggle; 1.6s TTFT, 10.6 tok/s, 8 GB peak — too heavy as the 16 GB default |
| Windows/Linux 16 GB | Llama-3.2-3B / Qwen 4-bit GGUF; Bonsai-27B GGUF where fast enough | GGUF universality |
| Phone 8 GB+ (flagship) | Llama-3.2-3B-4bit GGUF (~2 GB) | proven on llama.rn today |
| Phone 6–8 GB | Llama-3.2-1B-4bit GGUF | fits, still conversational |
| Phone, future | **1-bit Bonsai-27B (3.9 GB)** once kernels land in mainline llama.cpp/llama.rn | 27B-class quality on a phone |
| Below 6 GB phones | not supported v1 (say so honestly) | tight even for 1B + whisper + TTS |

All first-run downloads with progress UI; never bundle weights in the store binary.

---

## Research verdicts (2026-07-15)

### Bonsai 27B (PrismML) — ⭐ genuinely relevant; adopt desktop-first, track for mobile
- Verified real: released 2026-07-14 by PrismML (Caltech founders; Khosla/Google/Samsung
  backing). Apache 2.0. Base: Qwen3.6-27B. Two variants: **ternary** ({−1,0,+1},
  1.71 bits/w, 5.9 GB) and **1-bit** ({−1,+1}, 1.125 bits/w, **3.9 GB**). 4-bit vision
  tower, 262K context, speculative decoding.
- Self-reported quality retention vs FP16 across 15 benchmarks: ternary **94.6%**,
  1-bit **89.5%**. Speed: **87 tok/s on M5 Max**, **11 tok/s on iPhone 17 Pro** (1-bit),
  ~100 tok/s on H100 bs=1.
- Distribution: HF repos `prism-ml/Bonsai-27B-gguf`, `Ternary-Bonsai-27B-gguf`,
  `Bonsai-27B-mlx-1bit`, `Ternary-Bonsai-27B-mlx-2bit`; runs via **PrismML's fork of
  llama.cpp** (Q1_0_g128 kernels) — **not yet in mainline llama.cpp / llama.rn**.
- **Assessment for us:**
  - *Voice-speed check:* speech is ~3–4 tok/s equivalent; 11 tok/s on an iPhone 17 Pro
    stays ahead of the voice — viable, but only newest-flagship, and prefill/TTFT,
    battery, and thermals are unmeasured. A companion chats for 30+ min; sustained
    load matters.
  - *Desktop is the immediate win:* the **MLX ternary 2-bit (5.9 GB)** drops into our
    existing `LLM_BACKEND=mlx` path on the M3/16GB. A 27B-class brain vs the current 3B
    could transform reply quality — IF it loads on mainline MLX (see benchmark below).
  - *Mobile:* wait for mainline llama.cpp/llama.rn kernel support; ship 1B/3B first,
    swap Bonsai in later. Don't build on a 1-day-old fork.

- **Benchmark run 2026-07-16 (M3/16GB) — both variants now tested:**
  - **3B baseline** (`Llama-3.2-3B-Instruct-4bit`, our current default): median
    **TTFT 285ms, 46.6 tok/s, 2.0 GB peak**, load 1.4s. Rock solid — this is the bar.
  - **1-bit Bonsai** (`Bonsai-27B-mlx-1bit`): **does NOT run on our stack.** Downloaded
    (4.8 GB on disk, not the advertised 3.9), then `mlx_lm.load` crashed:
    `ValueError: [quantize] The requested number of bits 1 is not supported. The
    supported bits are 2, 3, 4, 5, 6 and 8.` Mainline MLX has no 1-bit kernel — the
    1-bit format **requires PrismML's fork**, confirming the caveat empirically. Weights
    deleted after (kept disk clean).
  - **Ternary 2-bit** (`Ternary-Bonsai-27B-mlx-2bit`): **✅ WORKS on mainline MLX.**
    Re-tested once disk allowed (7.9 GB cached). Mainline `mlx_lm` loads the Qwen3.6
    architecture fine — no fork needed. Median **TTFT 1635ms, 10.6 tok/s, 7.99 GB peak**,
    load 4.5s. Speed clears the ~8 tok/s speech bar comfortably. Caveats: TTFT is ~5.7×
    the 3B's (a noticeable pause before the voice starts), the 8 GB peak is tight on a
    16 GB Mac alongside Whisper + Kokoro/Chatterbox + avatar video, and the last prompt
    of the run dropped to 2.5 tok/s (late-run memory pressure — a headroom yellow flag).
  - *Takeaway:* the earlier "ship 3B" call rested only on the **1-bit** failing — but the
    **2-bit is a live option**, not a dead end. Still **ship the 3B in Mac v1**: on a
    16 GB Mac the 27B-2bit's latency + memory cost isn't worth it for a real-time voice
    loop. Position 27B-2bit as a **"deep mode" toggle for 32 GB+ / desktop tier**, never
    the 16 GB default — which lines up with the desktop-first Bonsai stance elsewhere in
    this plan. Quality A/B (does 27B-2bit actually feel smarter as a companion?) is the
    remaining open question before promoting it.
  - *Caution:* PrismML's headline numbers are self-reported; treat as unverified.

### Hermes Agent (Nous Research) — ❌ not a fit (but *not* for the reason first recorded)
**Correction (2026-07-15):** an earlier draft of this doc said Hermes requires cloud
inference. **That was wrong.** Hermes is MIT-licensed and runs against **Ollama,
llama.cpp, LM Studio, vLLM, or any OpenAI-compatible endpoint** — the Nous Portal is
one option among many. It could point at a local model. So "it breaks the privacy
promise" is not a valid objection.

The real disqualifier is **architectural, and it's harder**:
- **It requires a ≥64,000-token context window and rejects smaller models at startup**
  — its system prompt + tool schemas need that room. We run at **4,096** context, and
  `MAX_HISTORY_TURNS=6` exists *specifically* to keep prefill small. Our measured
  1.47s first-audio is a direct product of a tiny prompt. A 64k-context model on a
  16 GB M3 is a different weight class (KV cache alone), and every tool schema in the
  prompt is prefill time we'd pay on **every turn**. Adopting Hermes means giving up
  the latency that *is* the product.
- **It's the opposite product.** Hermes is a CLI agent for multi-step tool-calling,
  skills, and channel gateways (Telegram/Discord/Slack). Poppys is a warm voice
  companion for "calm daily check-ins rather than productivity pressure"
  (PRODUCT_OVERVIEW §1). Multi-step agent loops and sub-1.5s conversational turns are
  in direct tension.

Verdict unchanged (skip), reasoning corrected. Worth revisiting **only** if Poppys ever
grows a real tool-using/agentic mode, where its skill-learning loop would be prior art.

### LangChain — ❌ no for the core pipeline
The "don't build everything ourselves" instinct is right, but LangChain is leverage in
the wrong layer:
- LangChain orchestrates *LLM API calls* (chains, RAG, agents) in Python/JS server
  environments. It contains **no** STT, no streaming TTS, no voice pipeline, and does
  **not run on-device on mobile**.
- Everything it would orchestrate for us — prompt assembly, history windowing, memory,
  streaming — is already built and latency-tuned (TTFT work would be *hurt* by its
  abstraction layers).
- Where we should NOT build ourselves, the leverage is the hard native stuff:
  **llama.cpp / whisper.cpp / sherpa-onnx / llama.rn** (inference engines), not the
  easy Python glue we already wrote.
- Only future niche: RAG over long-term memory — and even there, a small embedding
  model + sqlite-vec is lighter than LangChain.

---

## Task list

### Phase 0 — Mac v1 (P0, unchanged) ⬜
See PRODUCTION_PLAN Phase A/B. Plus one addition:
- ✅ **P0-a** Benchmark Bonsai-27B vs Llama-3.2-3B on the M3 (`scripts/benchmark_llm.py`).
  Run 2026-07-16: 3B = **285ms TTFT, 46.6 tok/s, 2.0 GB** (the bar to beat). **1-bit Bonsai
  won't load on mainline MLX** (needs PrismML's fork). **Ternary-2bit ✅ loads on mainline
  MLX** — 1635ms TTFT, 10.6 tok/s, 7.99 GB peak. **Decision: ship the 3B in v1;** 27B-2bit
  is a viable "deep mode" for the 32 GB+/desktop tier, not the 16 GB default. Remaining:
  quality A/B of 27B-2bit vs 3B. (Full write-up in the Bonsai section above.)

### Phase 1 — Mobile PoC gate (P0, 1 week, after v1 ships) ⬜
- ⬜ RN skeleton: `llama.rn` + `whisper.rn` + `react-native-sherpa-onnx` (Kokoro).
- ⬜ End-to-end loop on iPhone + one Android; measure mic-stop → first-audio.
- ⬜ Go/no-go: <1.5s on recent iPhone = proceed.

### Phase 2 — Shared TypeScript core (P1, ~3–4 weeks) ⬜
- ⬜ `core/` TS package: chunker, personas, safety, memory, prompt assembly, history.
- ⬜ Golden-file tests: same inputs → same outputs as the Python modules.

### Phase 3 — Mobile beta (P1, ~4–6 weeks) ⬜
- ⬜ Full RN app (chat UI, personas, memory, first-run model download w/ progress).
- ⬜ Avatar: start with the animated-EQ/status treatment, not the 3D head (perf).
- ⬜ TestFlight + Play internal track.

### Phase 4 — Windows/Linux desktop (P1) ⬜
- ⬜ Electron + `node-llama-cpp` + sherpa-onnx-node + the same TS core.
- ⬜ Later: replace the Mac Python app with this too (one codebase everywhere).

### Ongoing ⬜
- ⬜ Watch mainline llama.cpp for Bonsai Q1_0_g128 kernel support → then mobile Bonsai.
- ⬜ Re-benchmark model matrix quarterly (this space moved 3× while we built v1).

---

## Sources
- Bonsai 27B: https://prismml.com/news/bonsai-27b · https://docs.prismml.com/models/bonsai-27b ·
  https://huggingface.co/prism-ml/Bonsai-27B-gguf · https://huggingface.co/prism-ml/Bonsai-27B-mlx-1bit ·
  https://www.marktechpost.com/2026/07/14/prismml-releases-bonsai-27b-1-bit-and-ternary-builds-of-qwen3-6-27b-that-run-on-laptops-and-phones/
- Hermes Agent: https://hermes-agent.nousresearch.com/
- llama.rn (production apps: PocketPal AI, InferrLM): https://github.com/mybigday/llama.rn
- sherpa-onnx Kokoro on iOS/Android: https://github.com/k2-fsa/sherpa-onnx ·
  https://github.com/XDcobra/react-native-sherpa-onnx
- node-llama-cpp in Electron: https://node-llama-cpp.withcat.ai/guide/electron ·
  https://github.com/electron/llm
