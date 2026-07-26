# Poppy — Realistic Voice + Better VAD Plan

*Written 2026-07-26. Goal: replace the robotic Kokoro voice with a realistic Indian
girl voice, chosen by an A/B listening test, and upgrade the crude mic VAD. Desktop
first, fully open-source and self-hosted (no paid APIs, $0 in API cost). Then the
avatar. Sits under `POPPY_IMPLEMENTATION_PLAN.md`.*

Status: ✅ done · 🚧 in progress · ⬜ planned · **P0** blocks the goal.

---

## The problem (reviewer feedback)
1. **Robotic voice** — Kokoro is an 82M on-device model; it's fast but sounds synthetic.
2. **Avatar bait-and-switch** — you pick a realistic human, then talk to a 3D cartoon.

## Decisions
- **Open-source + local, no paid APIs.** Kokoro (Apache), Indic Parler-TTS (Apache),
  Chatterbox (MIT), Qwen3-TTS (Qwen). Avoid F5-TTS / XTTS for shipping — non-commercial.
- **Desktop first**, mobile later (unchanged).
- **Chatbot first, call second** (voice quality matters more than real-time at first).

---

## Phase 1 — Pluggable TTS + A/B listening test  **P0**
Make TTS swappable and let the user *hear* the options side by side.

| # | Task | Where |
|---|---|---|
| 1.1 | `TTS_BACKEND` flag (`kokoro`\|`parler`\|`qwen3`\|`chatterbox`) | `config.py` |
| 1.2 | Turn `tts.py` into a dispatcher (like `llm.py`); move Kokoro out | `tts.py`, `tts_kokoro.py` |
| 1.3 | Backend modules, common `synthesize_to_wav_bytes()` + `warmup()` + `SAMPLE_RATE` | `tts_parler.py`, `tts_chatterbox.py`, `tts_qwen3.py` |
| 1.4 | Report the active backend's sample rate to the client | `ws_handler.py` uses `tts.SAMPLE_RATE` |
| 1.5 | A/B harness: same 3 lines (English / supportive / Hinglish) through each installed backend → labeled WAVs to compare | `scripts/tts_ab.py` |

**Exit:** user plays `parler.wav` / `chatterbox.wav` / `kokoro.wav`, picks the realistic one.

### Voice candidates
- **Indic Parler-TTS** (AI4Bharat) — native Indian accent, English+Hindi, *no reference clip needed* (named Indian speakers). Best first bet.
- **Chatterbox** (MIT) — clones a voice from a ~10s reference clip; needs an Indian-girl sample.
- **Qwen3-TTS CustomVoice** — English + cloning; added only if the first two don't win.

## Phase 2 — Wire the winner  **P0**
- Make the chosen backend default; map each character to a voice in it; measure
  per-utterance latency on the Mac → decide call-ready vs chatbot-first.

## Phase 3 — VAD upgrade (Silero v5)
- Replace the RMS energy detector in `vad.js` with Silero VAD v5 in-browser
  (ONNX via `@ricky0123/vad-web`, vendored offline). Better turn-taking, fewer
  false barge-ins.

## Phase 4 — Avatar realism (after voice is settled)
- **The face you pick is the face that talks.** Generate a realistic portrait per
  character, then lip-sync *that same face* to her voice: first pre-rendered
  idle/talk video loops (MuseTalk / LivePortrait, generated once, bundled — light
  at runtime), real-time later. Drops the 3D puppet. Open-source, free.

---

## Constraints / risks
- **Disk** — only ~5 GB free; each TTS model is 1–4 GB. Test 1–2 backends first
  (Parler + Chatterbox), free space before installing.
- **Latency** — these are heavier than Kokoro; measure on the Mac. Likely fine for
  chatbot, maybe too slow for the live call → that's why chatbot-first.
- **Deps** — `parler-tts` / `chatterbox-tts` / `qwen3-tts` may need careful pip
  (torch/transformers versions); lazy imports so an uninstalled backend never breaks.
- **Reference clip** — Chatterbox/Qwen cloning needs a ~10s Indian-girl audio sample;
  Parler needs none.

## Build order
1. Code the dispatcher + backends + A/B harness (no downloads) — ✅ done.
2. Free disk, install Parler (+ Chatterbox), run the A/B, pick the voice — ✅ done.
3. Wire the winner, measure latency.
4. Silero VAD.
5. Avatar.

---

## Findings — the A/B, measured on the dev Mac (M-series, no dedicated GPU) · 2026-07-26

Same three lines (English / supportive / Hinglish) through each engine:

| Engine | Voice | Realism | **Speed / line** | Real-time? |
|---|---|---|---|---|
| **Kokoro** (current) | female | robotic | **0.7 s** | ✅ |
| **Chatterbox** (natural default) | male | excellent | **16–58 s** | ❌ |
| **Chatterbox** (cloned from a Kokoro ref) | female | sounded robotic | 12–16 s | ❌ |
| **Indic Parler-TTS** | **female, native Indian** | excellent | **100–150 s** | ❌❌ |
| MeloTTS (EN-INDIA) | female, Indian | decent, fast | not completed | — |

Clips saved to `/tmp/poppy_tts_ab/` (kokoro_*, chatterbox_*, chatterbox_NATURAL_*, parler_*).

### What we learned
1. **Realistic TTS is real and great** — Parler is a genuinely realistic *native Indian female* voice; Chatterbox's natural voice is clearly human. The quality bar is achievable.
2. **But it is NOT locally-fast on this Mac.** The realistic models are 6–10× bigger than Kokoro and fall back to CPU on Metal → 16 s (Chatterbox) to **150 s** (Parler) per sentence. Unusable for a real-time call, and too slow even for a chatbot.
3. **A cloning mistake to avoid:** cloning Chatterbox from a Kokoro-generated reference reproduced Kokoro's *robotic* quality (that's why the first female A/B "sounded the same"). Clone from a real human clip, or use a native voice (Parler).
4. **Install gotchas (macOS / Py 3.12):** parler-tts needs `--no-build-isolation` (old-setuptools build breaks on 3.12); `ai4bharat/indic-parler-tts` is **gated** (HF login + accept license); MeloTTS needs `brew install mecab` + `unidic`; big model downloads blow the disk fast (HF cache hit 29 GB).
5. **Fundamental trade-off (proven, not guessed):** on this hardware you can have *fast* OR *realistic*, not both. Fast → small model → robotic (Kokoro). Realistic → big model → too slow.

### Decision / recommendation
- **Realistic + fast + Indian requires a GPU or a cloud TTS.** The cost-conscious, India-first choice is **Sarvam AI** (real-time, Indian voices, free tier, far cheaper than ElevenLabs). Data/memory can still stay on-device; only text→audio goes to the cloud.
- The pluggable `tts.py` dispatcher makes swapping in Sarvam (or any engine) a drop-in.
- **6 characters → 6 voices** is trivial once the engine is chosen (each character maps to a speaker/voice).
- Local realistic TTS on this Mac is a dead end — stop chasing it; keep Kokoro as the fast fallback.
