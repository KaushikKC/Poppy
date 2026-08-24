# Adult content on mobile, and how this makes money

Written 2026-08-24. Two questions were asked together, and they turn out to be the same
question, which is why this is one document: **the thing that makes adult mode work is
also the thing that makes money collectable, and the thing that blocks ads is the adult
content itself.**

---

## Part 1 — Why the phone refuses, measured

Same character prompt, same explicit requests, same day. Not opinion:

| Model | Size (Q4) | Result |
|---|---|---|
| Llama 3.2 **3B** abliterated (desktop, via Ollama) | 2.0 GB | **Complied**, stayed in character |
| Llama 3.2 **1B** abliterated (what the phone can hold) | 955 MB | **Refused** — "I can't create explicit content", "I can't do that" |
| Qwen2.5 **1.5B** abliterated | 986 MB | **Untested** — too slow to measure on this machine; a candidate, not an answer |

Abliteration removes a refusal *direction* from the weights. At 1B there is not enough
model left over for that to hold: the instruction tuning reasserts it. This is why the
browser is fine and the phone is not — the prompt is identical, the weights are not.

### The four ways out

**1. Ship the 3B on the phone.** Known to work. Costs 2.0 GB, more heat, slower replies
on a device already holding Whisper, Kokoro, a WebView and React Native. *Rejected
2026-08-24 by the product owner* — heat and size matter more. Do not re-propose it as a
default; it stays available as a per-device opt-in if that changes.

**2. A different 1–2B base.** Qwen2.5-1.5B abliterated is 986 MB, roughly the same
footprint as the Llama 1B, and is genuinely untested. **Cheapest next experiment: put it
on a real phone and run the same two prompts.** If it complies at that size, the problem
is solved for free. If it refuses, options 1, 3 and 4 are what remain.

**3. Fine-tune the 1B (LoRA).** Abliteration is a blunt post-hoc edit; a small LoRA
trained on in-character adult dialogue teaches the behaviour instead of deleting the
refusal. Merged and quantised, it stays a ~1 GB GGUF. Realistically a week of work plus
a dataset you have to source and own, and the dataset is the legally sensitive part.
This is the only option that gets adult behaviour *at 1B* with confidence.

**4. Cloud inference for adult mode only.** Local model stays the 1B for everything
ordinary; explicit turns go to a server running a 7–12B uncensored model. Costs money per
turn and breaks the "nothing leaves the device" promise for those turns — which must be
said plainly in the UI, not buried.

**Recommendation:** try 2 (one afternoon), then 3 or 4 depending on the result. Option 4
has a second benefit that Part 3 depends on.

---

## Part 2 — Ads and adult content cannot coexist. This is the whole plan's hinge.

**Google AdMob prohibits exactly what this app generates.** From Google Publisher
Policies: prohibited content includes *"graphic sexual text, image, audio, video, or
games"*. Not images only — **text**. An AI companion writing explicit replies is squarely
inside that, and enforcement is account-level: Google may disable ad serving and the
AdMob/AdSense account, permanently.

Also relevant:
- **AdSense is for web, AdMob is the mobile SDK.** For an app it is AdMob.
- **Apple guideline 1.1.4** prohibits *"overtly sexual or pornographic material"*. The
  adult build cannot be on the App Store at all — already recorded in
  `APPLE_SUBMISSION_CHECKLIST.md:75`. A June 2026 guideline update additionally requires
  developers to account for how AI chatbot features affect age ratings.
- Industry reality: AI companion apps monetise by **subscription, not ads**, precisely
  because the stores reject them and the cheap acquisition channels are closed.

### So the fork is unavoidable

You cannot have one app that is both explicit and ad-supported by Google. You can have
**two builds from one codebase**, which is what `POPPY_ADULT` already exists for:

| | **Poppys** (clean) | **Poppys** (adult) |
|---|---|---|
| Build flag | `POPPY_ADULT=0`, `POPPY_GUARDRAILS=1` | `POPPY_ADULT=1` |
| Distribution | App Store + Play | Direct download, web, Android sideload |
| Ads | **AdMob** — allowed | AdMob forbidden; adult networks only (ExoClick, TrafficJunky, JuicyAds, TrafficStars) |
| Payments | StoreKit / Play Billing | CCBill, Segpay, Epoch, Verotel (Stripe/PayPal prohibit adult) |
| Model | 1B is fine — it never needed to be uncensored | needs Part 1 solved |

The clean build is the one that can be advertised, ranked, and installed by strangers.
The adult build is the one people pay for. That is not a compromise, it is how every
product in this category actually operates.

---

## Part 3 — The money, and one number that decides it

Proposed: free after sign-up, one paid plan at $20 that removes ads.

**Check the arithmetic before building the ad path.** Rough Tier-1 rates: banners
$1–3 eCPM, interstitials $3–8, rewarded $5–15. A heavy user seeing ~5 interstitials a day
is ~150 impressions a month — roughly **$0.45–1.20 per user per month**, before fill-rate
and before India-weighted traffic, which is lower. If the $20 is annual, a paying user is
worth **18–40 months of that same user watching ads**. If it is monthly, 20–40x.

Two consequences:

1. **Ads are not the business; they are a floor under free users.** Build the
   subscription first. Ads are worth adding only once free-user volume is large enough
   that a floor is worth having.
2. **Where an ad may appear needs the same guardrail the paywall already has.**
   `billing.can_show_paywall()` makes a mid-vent paywall impossible by design. An ad
   interrupting someone venting is worse than a paywall doing it — it is the single
   fastest way to destroy the trust this product is built on. **Any ad surface must go
   through the same abundance-moment check**, and must never appear inside a call, mid
   conversation, or on a distress turn.

### Where credits fit

`accounts.py` already keeps a per-user credit ledger, and `status()` reports
`enforced: false` — because a ledger on the user's own device, metering a model on the
user's own hardware, cannot be enforced. **Option 4 in Part 1 fixes this too:** if the
paid tier buys cloud inference, the server meters what it serves, and credits become
real. Local turns stay free and unlimited, which is also the honest pitch — you are
charging for the bigger model, not for permission to speak.

---

## What to do next, in order

1. **Test Qwen2.5-1.5B abliterated on a real phone** with the two probe prompts. One
   afternoon; decides all of Part 1.
2. **Decide the fork.** Clean build for the stores, adult build direct. Both already
   build from `POPPY_ADULT`; what is missing is two bundle ids, two icons, and a release
   script that sets the flag and regenerates the mobile prompt twins.
3. **Subscription before ads.** StoreKit + Play Billing on the clean build; CCBill or
   Segpay on the adult build. `billing.py` already models the tiers.
4. **Privacy disclosures must change before either ships.** Collecting an email breaks
   "Private · You control everything" on the splash and the "no data collected" answer in
   the store listings. `PRIVACY_POLICY.md`, the App Store nutrition label and the Play
   data-safety form all need updating.
5. **Only then, ads** — clean build only, behind `can_show_paywall()`-style timing.

## Sources

- [Google Publisher Policies (AdMob)](https://support.google.com/admob/answer/1348688?hl=en)
- [Google Publisher Restrictions (AdMob)](https://support.google.com/admob/answer/10437795?hl=en)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [AI companion app store policy & distribution, 2026](https://track360.io/blog/ai-companion-app-store-policy-distribution-operator-guide-2026)
- [AI companion monetization: subscription vs token, 2026](https://track360.io/blog/ai-companion-app-monetization-models-subscription-vs-token-2026)
- [Adult payment processing 2026](https://www.scrile.com/blog/adult-payment-processing)
- [Best adult ad networks 2026](https://affmaven.com/adult-ad-networks/)
