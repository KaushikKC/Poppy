# Apple App Store — privacy & submission checklist (Poppy)

*Researched 2026-08-01. What Apple requires to approve Poppy on the Mac App Store and
the iOS App Store, and where we stand. Status: ✅ have · ⚠️ verify · ❌ to do.*

## TL;DR — we're in a strong position, but there are must-dos
Poppy is **100% on-device** (STT, LLM, TTS, memory all local; no accounts; no third-party
AI; no off-device telemetry — our analytics events are content-free and never leave the
device). That means:
- Our **App Privacy "nutrition label" can likely be "Data Not Collected"** — the best
  possible label, and a genuine trust/marketing edge. (Apple's definition of "collect" =
  transmitted off the device; on-device storage is not collection.)
- We're **clean on the new 2026 AI rule (Guideline 5.1.2(i))** that requires disclosing +
  getting consent before sharing personal data with third-party AI. We share nothing.

But Apple still requires a privacy policy, an accurate label, a privacy manifest, AI
disclosure, an age rating, and, for the Mac App Store specifically, sandboxing.

---

## A. Universal — required for BOTH Mac and iOS App Store

| # | Requirement | Status | Notes |
|---|---|---|---|
| A1 | **Privacy Policy URL** (mandatory for *every* app, even zero-data) | ❌ to do | Must be publicly hosted; link in App Store Connect + in-app. Even for on-device, it must state: mic use, what's stored locally + encrypted, that nothing is collected/transmitted, and how to delete it. |
| A2 | **App Privacy nutrition label** in App Store Connect | ⚠️ verify | We can almost certainly select **"Data Not Collected."** Confirm no SDK/telemetry transmits anything. Must be accurate — Apple cross-checks. |
| A3 | **Privacy Manifest** (`PrivacyInfo.xcprivacy`) declaring required-reason APIs | ⚠️ verify | iOS scaffold already has one (`mobile/ios/PoppysSpike/PrivacyInfo.xcprivacy`). Verify it declares every *required-reason API* we hit: **UserDefaults, file-timestamp, disk-space, system-boot-time**. Each needs an approved reason code. Third-party SDKs must ship their own (RN pods already do). |
| A4 | **AI transparency** — user must know they're talking to a bot | ✅ have / ⚠️ extend | In-app Poppy states she's an AI. Also state it in the **App Store description** and, ideally, a first-run notice. 2026 guidelines emphasize this. |
| A5 | **Age rating questionnaire** — AI/chatbot content affects the rating | ❌ to do | Companion/chatbot apps commonly land **17+**. Answer honestly re: unrestricted AI-generated content. Consider content filtering to lower the rating. |
| A6 | **Content safety / moderation** for AI-generated output (Guideline 1.2) | ✅ partial | We have a crisis/distress **safety layer** (detects distress → surfaces resources). Keep it; Review looks for filtering + safe handling of vulnerable users. |
| A7 | **Not a medical/therapy app** (Guideline 1.4.1) | ✅ have / ⚠️ keep | We already disclaim "I'm an AI, not a therapist." **Never market as therapy, treatment, or diagnosis** in copy or metadata, or it triggers medical-app scrutiny. |
| A8 | **Account deletion** (Guideline 5.1.1(v)) | ✅ N/A | Only required if the app has account creation. We have **no accounts** → not applicable (note this in review notes). We DO offer local data delete, which is a plus. |
| A9 | **Built with a current SDK / Xcode** | ⚠️ verify | New submissions after April 2026 must be built with the required recent SDK. Build on the latest Xcode. |
| A10 | **Microphone permission string** (`NSMicrophoneUsageDescription`) | ✅ have | Present in `desktop/poppys.spec`; ensure the iOS `Info.plist` has a clear purpose string too ("Poppy uses the mic to hear you during a call; audio is processed on-device"). |

---

## B. Mac — two paths, pick by speed

**The fast path is the one we already have.** For Mac there are two distribution routes:

1. **Developer ID + Notarization (NOT the App Store)** — ✅ we already do this.
   - Distributed from our own website/DMG. **No sandbox required.**
   - Our app runs a local Python server + subprocess (Ollama/models) + mic — all of which
     are *hard to sandbox*. Developer ID sidesteps that.
   - **This is the fastest Mac launch.** Recommend shipping Mac this way first.
2. **Mac App Store** — ❌ significant work.
   - **App Sandbox is mandatory** (`com.apple.security.app-sandbox`), entitlements burned
     into the signature. Our localhost server, subprocess spawning, and file/model access
     make sandboxing genuinely tricky.
   - Needs: sandbox + entitlements (audio-input, network client, user-selected file),
     privacy manifest, nutrition label, full App Review.

**Recommendation:** launch Mac via **Developer ID/notarized** now (already built), and only
pursue the Mac App Store later if the store channel is worth the sandbox engineering.

---

## C. iOS App Store — specifics

| # | Requirement | Status | Notes |
|---|---|---|---|
| C1 | Fully **on-device inference** (no spawning Ollama; iOS forbids arbitrary subprocesses) | ⚠️ architecture | iOS build must use in-process **llama.cpp/GGUF + on-device STT/TTS (sherpa-onnx / Whisper)** — matches our cross-platform plan. No local HTTP server spawning external binaries. |
| C2 | **App size** with bundled models | ⚠️ plan | On-device LLM/STT/TTS weights are large. Consider on-demand resources or a first-run model download; mind App Store size limits + review of large downloads. |
| C3 | **Mic permission** purpose string in `Info.plist` | ⚠️ verify | Clear, honest string. |
| C4 | Sandbox (automatic on iOS) + no private APIs | ✅ automatic / ⚠️ verify | RN + our native code must avoid private APIs. |
| C5 | Privacy manifest + nutrition label + policy | see A1–A3 | Same as universal. |

---

## D. The things that actually get AI-companion apps rejected (watch these)

- **1.2 / UGC & safety:** open-ended AI generation → need safe handling, especially for a
  companion used by vulnerable people. Our safety layer helps; keep it visible in review notes.
- **Romantic/"relationship" framing:** triggers 17+ and extra scrutiny. **No sexual/adult
  content** (or hard-gate it). Keep Poppy as a warm companion, not an adult product.
- **4.3 spam/saturation:** the App Store is flooded with AI chatbots. Our **on-device
  privacy** is a real, reviewable differentiator — lead with it.
- **1.4.1 medical:** do not claim to treat anxiety/depression/loneliness as outcomes.
- **2.1 completeness / demo:** provide review notes explaining it's fully offline, no login,
  how to test, and that mic is on-device only.

---

## E. Action list (priority order)

1. **Write + host a Privacy Policy** (A1) — blocker for both stores. On-device framing:
   mic used locally, memory stored encrypted on-device with consent, nothing collected or
   transmitted, how to delete. I can draft this.
2. **Confirm the App Privacy label = "Data Not Collected"** (A2) — audit that no code path
   transmits anything (our local content-free events are fine).
3. **Verify `PrivacyInfo.xcprivacy`** declares our required-reason APIs (A3).
4. **Complete the age-rating questionnaire honestly** (A5); decide on content controls.
5. **Add AI disclosure to the App Store description + first-run** (A4).
6. **Mac: ship Developer ID/notarized now** (B1); defer Mac App Store sandbox (B2).
7. **iOS: confirm the all-on-device build** (no subprocess server) and model-size plan (C1–C2).
8. **Prepare App Review notes:** offline, no account, on-device mic, safety layer, not medical.

---

## Sources
- [Apple: App Privacy Details (nutrition label)](https://developer.apple.com/app-store/app-privacy-details/) · [User Privacy and Data Use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) · [2026 AI data-sharing rule 5.1.2(i)](https://dev.to/arshtechpro/apples-guideline-512i-the-ai-data-sharing-rule-that-will-impact-every-ios-developer-1b0p)
- [Privacy Manifest / required-reason APIs (2026)](https://www.appypie.com/blog/apple-privacy-manifest)
- [Privacy Policy URL required for every app (2026)](https://ultrafastutilities.com/apple-app-store-privacy-policy-requirements)
- [Mac App Store sandbox requirement (2026)](https://casperscloak.com/blog/macos-privacy-guide-2026) · [App Store submission changes, April 2026](https://medium.com/@thakurneeshu280/apple-app-store-submission-changes-april-2026-5fa8bc265bbe)
