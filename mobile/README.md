# Poppys mobile — engine spike (M0)

This is the **throwaway de-risking spike** from `MOBILE_PLAN.md` §1 (M0) and
`CROSS_PLATFORM_PLAN.md` Phase 1. It is **not** the real app. Its only job:

> Prove the three on-device engines run end-to-end on a real phone, and
> **measure `mic-stop → first-audio`**, on a real mid-range Android **and** an iPhone.
>
> **Go/no-go:** first-audio under ~1.5s on a recent iPhone ⇒ React Native is the stack.

Everything real (shared TS core, personas, memory, safety, avatar, first-run
download, store builds) comes *after* this gate passes.

## The pipeline it exercises

`mic → whisper.rn (STT) → llama.rn (LLM, streamed) → sherpa-onnx Kokoro (TTS) → playback`

Same models and the same latency trick as desktop: the LLM streams, and the moment
the first sentence/clause is formed the voice starts speaking it while generation
continues (the desktop "first-chunk" behaviour). The dark panel at the bottom shows
the timings; the big number is the metric that decides the stack.

## Stack

- **React Native 0.86** (bare), TypeScript strict.
- On-device engines (same C/C++ libs as desktop, via RN bindings):
  - `llama.rn` — llama.cpp / GGUF LLM
  - `whisper.rn` — whisper.cpp STT
  - `react-native-sherpa-onnx` — Kokoro TTS (the exact desktop voice)
  - `react-native-audio-api` — mic capture + PCM playback

## Ready-to-run status (2026-08-16)

Prepared so the run is: plug in an iPhone, drag one folder, press play.

- ✅ **Models downloaded** to `~/Documents/Poppys-spike-models/models/` (1.2 GB) in
  exactly the layout `src/models.ts` expects. Drag that `models` folder into the
  device (see below) — no renaming, no unpacking.
- ✅ **Bundle id** set to `social.poppys.spike` (was still the React Native template
  default `org.reactjs.native.example.*`, which will not sign).
- ✅ **Signing team** set to `VJWKHQRK66`, the same team as the Mac app.
- ✅ **Increased-memory-limit entitlement** added
  (`PoppysSpike/PoppysSpike.entitlements`). Without it iOS caps the process well
  below physical RAM and kills the app outright when the LLM, Whisper and Kokoro are
  all resident, so "does it fit" would come back as a crash rather than a number.
- ✅ Mic permission string and file sharing already in `Info.plist`; privacy manifest
  present.
- ✅ TypeScript compiles clean; pods installed (llama-rn, whisper-rn, SherpaOnnx,
  RNAudioAPI).

**Use Node 22, not the system Node.** RN 0.86 needs ≥20.19.4 and this machine
defaults to 20.18.2, which fails at metro with an engine error:

```bash
nvm use 22        # v22.0.0 is already installed
```

### The run, start to finish

```bash
nvm use 22
cd mobile && npm start          # leave metro running
```

Then in Xcode: open `ios/PoppysSpike.xcworkspace`, pick the connected iPhone, press
Run. First launch will fail to find models, which is expected.

Copy the models across: Finder → the connected iPhone → **Files** tab → drag
`~/Documents/Poppys-spike-models/models` onto **PoppysSpike**. Relaunch the app; the
first screen should list all three as found.

Then **Load engines** → **Tap to talk** → say one sentence → **Stop & reply**.

### What to write down

The gate is in `MOBILE_PLAN.md` §0.1. Three numbers, none of which a simulator can
answer:

1. **mic-stop → first audio**, the big number on the panel. Take it on turn 1 and
   again on turn 3 (turn 2+ should be faster from the warm KV cache).
2. **Thermals over ~10 minutes** of continuous back-and-forth: does the phone get
   hot, does the reply speed fall off.
3. **Peak memory** with all three models loaded (Xcode → Debug navigator, or
   Instruments). This is the one the entitlement above exists to let you measure.

## Prerequisites

- **Node ≥ 20.19.4** (RN 0.86 prefers Node 22; this machine has 20.18.2 — bump Node
  before `metro`/CI if you hit engine errors). `nvm install 22 && nvm use 22`.
- Xcode 16+, CocoaPods (for iOS). Android SDK + a device/emulator (for Android).
- A **real device** for the measurement — simulators/emulators don't reflect
  on-device ML latency or thermals. Don't judge the gate on a simulator.

## Get the models onto the device

Nothing is bundled. The app looks for these under its **Documents/models** folder:

```
models/llm/model.gguf              any small instruct GGUF (start: Llama-3.2-1B-Instruct-Q4_K_M)
models/whisper/ggml-base.en.bin    whisper.cpp ggml model (or ggml-tiny.en.bin)
models/kokoro/                     sherpa-onnx Kokoro dir: model.onnx, voices.bin,
                                   tokens.txt, espeak-ng-data/ (+ lexicon files)
```

Where to get them:
- **GGUF LLM** — Hugging Face, e.g. `bartowski/Llama-3.2-1B-Instruct-GGUF` → the
  `Q4_K_M` file. Rename to `model.gguf`.
- **Whisper** — `ggml-base.en.bin` from the whisper.cpp model repo
  (`ggerganov/whisper.cpp` on HF). `tiny.en` is faster, `base.en` more accurate.
- **Kokoro for sherpa-onnx** — the `kokoro-en-v0_19` (or newer) release from the
  sherpa-onnx model releases; unzip the whole folder into `models/kokoro/`.

Push them onto the device:

**Android** (launch the app once first so its data dir exists). Easiest is
Android Studio → Device Explorer → `data/data/com.poppysspike/files/models`.
Via CLI:
```bash
adb shell run-as com.poppysspike mkdir -p files/models/llm files/models/whisper files/models/kokoro
adb push model.gguf /data/local/tmp/
adb shell run-as com.poppysspike cp /data/local/tmp/model.gguf files/models/llm/model.gguf
# repeat for the whisper bin and every file inside the kokoro dir
```

**iOS** — file sharing is already enabled (`UIFileSharingEnabled` +
`LSSupportsOpeningDocumentsInPlace` are in Info.plist), so with the device connected,
open Finder → the device → Files → **PoppysSpike**, and drag the `models/` folder in.
(Or Xcode → Devices & Simulators → the app container → replace files.)

The app's first screen tells you which of the three it can and can't find.

## Run

```bash
# from mobile/
npm start                      # metro (needs Node ≥20.19.4)

# iOS (real device recommended)
cd ios && pod install && cd ..
npm run ios                    # or open ios/PoppysSpike.xcworkspace in Xcode

# Android (real device recommended)
npm run android
```

Then: **Load engines** → **Tap to talk**, say a sentence, **Stop & reply**. Read the
`mic-stop → first audio` number. Repeat a few times (turn-2 should be faster thanks
to the warm KV cache).

## Known things to verify on device (the spike's actual findings)

1. **Recording sample rate — handled, but verify.** `src/audio.ts` streams raw PCM
   via `onAudioReady`, then linear-resamples to **16 kHz mono** and feeds
   `whisper.transcribeData` (no WAV round-trip). If transcripts are still off, check
   the actual hardware rate the OS reports and consider a higher-quality resample
   than the spike's linear one.
2. **First-audio latency & thermals** over a 10-min conversation, not one turn.
3. **RAM headroom** on a mid-range Android with all three models resident
   (`MOBILE_PLAN.md` §5 A2 — Android fragmentation is the hard part).
4. **Kokoro model dir layout** the native module expects (auto-detection may want a
   specific filename set).

## Files

- `App.tsx` — the spike screen (load → record → measure).
- `src/models.ts` — where model files are expected + presence check.
- `src/audio.ts` — mic recorder + PCM player.
- `src/pipeline.ts` — load engines + one measured turn (STT → LLM → TTS, overlapped).
