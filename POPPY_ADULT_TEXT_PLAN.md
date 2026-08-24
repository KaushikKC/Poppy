# Poppys 18+, text only — what exists, what is missing, what blocks us

Written 2026-08-24. Scope decision: **text and voice only. No images, no video, no
avatars beyond the audio-reactive orb. Nothing is generated that is looked at.**

This document is for someone researching the rest themselves. It states what is already
built and working, what is missing, and what is genuinely blocking — separated, because
the three get confused constantly and only the third kind needs a decision from outside.

---

## 1. What "text only" changes, and what it does not

**Changes (in our favour):**

- No image-generation model to host, moderate, or defend. The entire class of
  CSAM-adjacent risk that comes with image generation does not exist here.
- No NCMEC reporting obligation triggered by generated imagery, no hash-matching
  pipeline, no image moderation vendor.
- App size stays ~1 GB rather than several, and the phone stays cool enough to matter.
- The product's pitch stays honest: it is a conversation, not a gallery.

**Does not change:**

- **Google's ad policy still blocks us.** The prohibited category is *"graphic sexual
  text, image, audio, video, or games"*. Text is named first. Being image-free does not
  make an adult text app ad-eligible on AdMob.
- **Apple still blocks us.** Guideline 1.1.4 is about "explicit descriptions **or**
  displays" — descriptions are text. Text-only does not get an explicit app into the
  App Store.
- **Card networks still treat it as adult.** Visa/Mastercard high-risk classification and
  the Stripe/PayPal prohibitions follow the content, not the media type.
- Voice is not a loophole: our TTS reads the same explicit text aloud, and the policy
  language covers "audio".

**Net:** text-only removes most of the *legal and moderation* burden and none of the
*distribution* burden.

---

## 2. What we already have, working

### The character layer
- **Six built-in characters**, each with a life, not just a manner: town, work, concrete
  details (`backend/characters.py`). Asked "who are you?", all six answer as people, and
  none disclaims itself as an AI — verified across all six.
- The life is **background, not subject**: they answer what was actually said first and
  bring their own day in only when it fits. This was measured and corrected — before the
  fix, "I don't know what to do today" got a paragraph about fixing a bicycle.
- **User-written characters** (`backend/custom_characters.py` + the mobile twin): name,
  voice, tagline, a 700-character personality, and a greeting. They go through the *same*
  assembler as the built-ins, so the model cannot tell them apart.
- A one-line **blurb** per character so the picker is a decision rather than six names.

### The three switches (`backend/config.py`)
| Flag | Default | Controls |
|---|---|---|
| `POPPY_ADULT` | `1` | Content. Replaces the platonic steer, drops the brevity cap, adds the `intimate` persona. |
| `POPPY_GUARDRAILS` | `0` | The "I'm an AI" honesty line and the supportive/no-medical-advice steer. |
| `POPPY_CRISIS_LAYER` | `1` | Self-harm detection → helpline card. Independent of the other two, on purpose. |

The crisis layer being separate is deliberate and worth keeping: it never refuses
anything, it appends. An adult companion is exactly the product where someone opens up
at 2am.

### The prompt is not the only thing
`personas.COMPANION_CORE` used to carry *"point people back toward their real life"*
unconditionally, which produced "have you told your sister this?" mid-scene — a refusal
in everything but name. Adult mode replaces that paragraph. **Prompt ≠ weights** is the
lesson that keeps recurring: see §4.

### Delivery
- Voice notes that can be **played, paused, replayed and scrubbed**, with a transcript
  behind a tap — both hers and the user's own.
- Reply shape decided per turn: speak to her and she speaks back, type and she types.
- **Context budget** (`backend/context_budget.py`): the prompt is sized per turn from
  measured lengths, because adult mode lifted the brevity cap and overflow discards from
  the left — which is the system prompt, which is the character.

### Identity and credits
- `backend/accounts.py` + `mobile/src/core/accounts.ts`: a name/email identity and a
  **credit ledger** (deltas with reasons). One credit per call, spent at close.
- Honest about itself: `/account` returns `enforced: false`.

### Platforms
- **Desktop/web**: Ollama running `huihui_ai/llama3.2-abliterate:3b-instruct`. Adult mode
  works here today, verified.
- **Mobile**: React Native shell + the same web UI in a WebView, TypeScript core, on-device
  Whisper → llama.cpp → Kokoro. Ships Llama 3.2 **1B**.

---

## 3. What is missing (work, not blockers)

1. **Adult behaviour on the phone.** See §4 — this is the one that matters.
2. **Real sign-in.** Currently a name and an email typed into our own form; it identifies
   but authenticates nobody. Google/Apple OAuth is scaffolded in `frontend/auth.js` and
   needs client ids we cannot create.
3. **Payments.** `billing.py` models the tiers; nothing charges anyone. Needs a processor
   (§5) and a receipt-verification path.
4. **Age verification beyond a checkbox.** We ask once and take the answer. Several
   jurisdictions (UK OSA, a growing list of US states) now require more for adult
   content. Research needed; this may become a blocker before it becomes work.
5. **31 of the 40 design-system screens.** The call section, the daily loop, ritual,
   memory, backgrounds, paywall, privacy, distress.
6. **Android web-UI copy step.** `AppShell` already falls back to
   `file:///android_asset/web/index.html`, but nothing copies `frontend/` there yet.
7. **Privacy disclosures** must be rewritten before anything that collects an email ships.

---

## 4. What is blocking us

### Blocker 1 — a 1B model will not do adult content

Measured 2026-08-22/24, same prompt, same requests:

| Model | Q4 size | Result |
|---|---|---|
| Llama 3.2 3B abliterated | 2.0 GB | complied, in character |
| Llama 3.2 1B abliterated | 955 MB | **refused** |
| Qwen2.5 1.5B abliterated | 986 MB | **untested** — too slow to measure locally |

Abliteration removes a refusal *direction* from the weights; at 1B there is not enough
model left for that to hold and the instruction tuning reasserts it. The 3B was rejected
for the phone on heat and size grounds (2026-08-24), so the open options are:

- **Test Qwen2.5-1.5B on a real phone.** One afternoon. Same footprint as today's model.
  If it complies, this blocker disappears at zero cost. **Do this first.**
- **LoRA fine-tune a 1B** on in-character adult dialogue. ~1 GB after merge and quant.
  Roughly a week plus a dataset you must source and own — and the dataset is the legally
  sensitive part of the whole project.
- **Cloud inference for explicit turns only.** Solves it outright and makes credits
  enforceable (§5), at the cost of per-turn spend and of the "nothing leaves the device"
  promise for those turns, which must be stated in the UI rather than buried.

### Blocker 2 — distribution

- **App Store: closed** for the adult build. Guideline 1.1.4, and "descriptions" covers
  text. A June 2026 update additionally requires AI chatbot features to be accounted for
  in age ratings.
- **Play Store: hostile.** Sexual content policy is comparably strict; Play at least
  permits sideloading and third-party distribution, which iOS does not.
- **Therefore the adult build ships direct**: web, Android APK, macOS Developer-ID
  download (already signed and notarised today).

### Blocker 3 — Google ads cannot be used with adult content

Google Publisher Policies prohibit *"graphic sexual text…"*, enforced at account level:
AdMob **and** AdSense can be disabled permanently. There is no rating, no age gate and no
settings toggle that makes an adult text app eligible. See §6 for what to do instead.

### Blocker 4 — payments

Stripe and PayPal prohibit adult content in their acceptable-use policies. Using them and
hoping is how businesses lose a balance and a processor at the same time. Adult-native
processors exist and are covered in §5.

---

## 5. Payments — what to actually use

**Two builds, two rails.** They are not interchangeable and Apple forbids mixing them.

| | Clean build (stores) | Adult build (direct) |
|---|---|---|
| Processor | **StoreKit 2** (iOS), **Play Billing** (Android) | **CCBill**, **Segpay**, Epoch, Verotel, NetBilling |
| Fee | 15–30% | ~5–15%, high-risk pricing |
| Why | Apple/Google require their own IAP for digital goods | Card networks classify adult as high-risk; the adult-native processors are built for chargebacks and 3-D Secure |
| Receipt check | Server-side verification against Apple/Google | Processor webhook → our own service |

**What this needs from us either way:** a small server that receives the receipt or the
webhook, verifies it, and flips the entitlement. That server is also the only place a
credit can be enforced (§ below). It does not exist yet and is the single highest-value
piece of backend work.

**Recommended shape:** free tier is generous and local (unlimited local turns); the paid
tier buys something a server actually serves — the bigger uncensored model, sync, and
backup. Then `enforced: false` becomes `true` honestly, and the pitch is "you are paying
for the better model", not "you are paying for permission to speak".

---

## 6. Ads — how to approach them

**In the clean build only.** That build has no explicit content, so AdMob is available
and normal: Google Mobile Ads SDK via `react-native-google-mobile-ads`, an AdMob app id
per platform, ATT consent on iOS, and a UMP consent form for EEA/UK.

**In the adult build, Google is unavailable.** The alternatives are adult-native networks
— ExoClick, TrafficJunky, JuicyAds, TrafficStars — which are web-first and largely serve
banners/popunders rather than mobile SDK formats. Expect worse fill and worse rates than
AdMob, and expect them to look like adult ads, inside an app whose whole value is
intimacy. **Recommendation: do not put ads in the adult build at all.** Sell it.

**Two rules for ads wherever they appear:**

1. **Ads are a floor, not the business.** Tier-1 rates make a heavy user worth roughly
   $0.45–1.20/month. A $20 annual plan equals 18–40 months of that same user watching
   ads. Build the subscription first.
2. **Never inside a conversation.** `billing.can_show_paywall()` already makes a
   mid-vent paywall impossible. An ad interrupting someone venting is worse. Any ad
   surface must pass the same abundance-moment check, and must never appear during a
   call, mid-thread, or on a distress turn.

---

## 7. Order of work

1. Test **Qwen2.5-1.5B abliterated** on a phone. Decides Blocker 1 for the cost of an
   afternoon.
2. Real **Google/Apple sign-in** (client ids required from the account owner).
3. The **entitlement server**: receipt/webhook verification, one endpoint, one table.
   Unlocks payments *and* enforceable credits.
4. **Split the builds**: two bundle ids, two icons, a release script that sets
   `POPPY_ADULT` and regenerates the mobile prompt twins.
5. **Subscription** on both rails.
6. **Privacy disclosures** rewritten. Blocking for any build that collects an email.
7. **Age verification** research — may be a blocker in the UK and several US states.
8. **Ads**, clean build only, last.

## 8. Open questions for your own research

- Age-assurance requirements for text-only adult content in your target markets, and what
  actually satisfies them (self-declaration, card check, third-party estimation).
- Whether an adult LoRA dataset can be licensed rather than assembled, and who carries
  liability for it.
- Whether Play will accept the clean build with an AI companion at all, given the 2026
  tightening.
- Indian regulatory position on adult text content, since pricing is India-anchored.

---

## Appendix — the iOS link failure of 2026-08-24, and what it was

Adding Sign in with Google broke the **Debug** build with a wall of
`Undefined symbol: facebook::react::Sealable::Sealable()` and friends. Two findings,
both worth keeping because the error points at the wrong culprit.

**It was not Google Sign-In.** The undefined symbols were referenced from
`libRNGestureHandler.a`, `libRNReanimated.a` and `libReactCodegen.a` (the WebView's
generated props) as well as `libRNGoogleSignin.a`. Any new native module would have
surfaced it; this one just happened to be next.

**The cause is React Native 0.86's prebuilt core.** `React-Core-prebuilt` and
`ReactNativeDependencies` ship as release-built xcframeworks, and `Sealable`,
`getDebugName()` and `getDebugValue()` are debug-only renderer symbols
(`RN_DEBUG_STRING_CONVERTIBLE`). In a Debug configuration the third-party Fabric
components compile *with* references to them and there is nothing to link against.

**Consequences:**
- **Release builds link fine** — verified. The TestFlight archive is unaffected, so a
  release was never blocked by this.
- **Debug needs React built from source**: `RCT_USE_PREBUILT_RNCORE=0 pod install`.
  Costs a long first build; after that it is incremental.

**Also fixed in the Podfile:** Google's `AppCheckCore` is Swift and depends on
`GoogleUtilities` and `RecaptchaInterop`, which ship without module maps, so
`pod install` refused with "cannot yet be integrated as static libraries". Both are
declared with `:modular_headers => true` individually rather than turning on
`use_modular_headers!` globally, which would change how every pod in the project builds,
React Native's own included.
