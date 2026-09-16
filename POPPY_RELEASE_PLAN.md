# Shipping Poppys: free-with-ads, $20 removes them, public on the App Store

Rewritten 2026-09-15, replacing the 2026-09-14 draft.

**Supersedes `POPPY_MONETIZATION_PLAN.md` Part 2.** That document assumed an adult build
and concluded AdMob was off the table. There is no adult content in what ships, so AdMob
is simply allowed and the two-build fork is not needed. Part 1 (model size) and Part 3
(revenue arithmetic, ad timing) still stand.

---

## The product model, stated once

| | **Free** | **Poppy Plus — $20** |
|---|---|---|
| Functionality | **Everything** | **Everything** |
| Ads | Yes | **No** |

That is the entire difference. No feature gates, no call limits, no degraded voice. The
free tier is the whole product, and the $20 buys quiet.

This is a good position to be in: it is trivially explainable, it never makes a lonely
person hit a wall mid-conversation, and it means the paid tier needs no server to
enforce (see §2).

### It contradicts the code as written

`backend/billing.py` currently gates free users:

- `FREE_DAILY_CALLS = 5` (line 52)
- `paywall_due()` returns True on call 6 and `backend/main.py:437` blocks the call

**Remove the gate.** Concretely:
- Delete `FREE_DAILY_CALLS`, `calls_today()`, `paywall_due()`.
- `backend/main.py:437-438` drops the paywall branch; every call proceeds.
- `entitlement()` returns `{"plan", "tier", "tiers", "ads": bool}` — no counters.
- `TIERS` copy changes. Plus is no longer "unlimited, longer calls"; it is "no ads".
  The current blurb promises things Free now also has, which would be a false claim in
  a store listing.
- **Keep `can_show_paywall()`.** Rename it `can_interrupt()`. It is now the ad-timing
  gate, and it is the most valuable thing in the file — see §3.

---

## 1. What still blocks a public App Store release

Two items, neither related to ads. Both are flat rejections.

### 1a. In-app account deletion — Guideline 5.1.1(v)

`package.json` carries `@react-native-google-signin/google-signin` and
`@invertase/react-native-apple-authentication`. Any app offering account *creation* must
offer account *deletion from inside the app*. Not an email link, not a web form only.

`APPLE_SUBMISSION_CHECKLIST.md` A8 marks this "✅ N/A — no accounts". That was true when
written and is now wrong. This is the single most common rejection for apps that add
sign-in after launch.

Needs: a Delete Account control in settings, a confirmation, actual deletion of the
server-side account record, and local data wiped. Play wants the same plus a
**publicly reachable** deletion URL declared in Data safety.

### 1b. The privacy label is no longer "Data Not Collected"

Two separate reasons now:
- **Sign-in**: an email leaves the device → `Contact Info → Email Address`,
  `Identifiers → User ID`, linked to identity.
- **AdMob** (§3): `Identifiers → Device ID`, used for `Third-Party Advertising`, and
  **Used for Tracking = Yes**. That last flag is what triggers the ATT requirement.

Update in three places: App Store Connect App Privacy, Play Data safety,
and `PRIVACY_POLICY.md` + the hosted `/privacy` page.

Also: the splash line "Private · You control everything" is no longer literally true of
the account and ads layers. Every *conversation* is still fully on-device, which is the
real claim and still a strong one. Reword to say that precisely.

### 1c. Age rating

A romantic-framed AI companion lands **17+** on Apple, **Mature 17+** on Play. Apple's
2026 guidance also asks specifically how AI chatbot features affect the rating. Answer
honestly; a rating challenged later is worse than a high rating taken up front.

---

## 2. The $20: In-App Purchase, and why it needs no server

### Apple requires IAP for this

Guideline 3.1.1: unlocking functionality inside the app is a digital purchase and must
go through **StoreKit**. You cannot take the $20 via Stripe, Razorpay or a web checkout
that the app links to (with one narrow exception, footnote below). Apple takes 30%, or
**15% if you enroll in the Small Business Program** (under $1M/year — that is you, so
enroll; it is a form, not an engineering task).

### One-time purchase, not a subscription

Recommended: a **non-consumable** IAP, "Remove ads forever", **$19.99 / ₹1,700**.

Why not a subscription:
- Apple scrutinises subscriptions under 3.1.2 for delivering *ongoing* value. "No ads"
  as a recurring charge invites that question; as a one-time unlock it invites none.
- A non-consumable needs no renewal handling, no grace periods, no billing-retry states,
  no cancellation flow.
- It matches how you described it: they pay $20, they keep it.

The tradeoff is real and you should take it knowingly: one-time revenue does not
compound. If you later want recurring revenue, it comes from a *feature* tier on top
(cloud inference for a bigger model is the obvious one), not from re-charging for quiet.

### Why the local-entitlement problem goes away

`backend/accounts.py` reports `enforced: false` on the credit ledger, because a ledger on
the user's own device metering a model on the user's own hardware cannot be enforced.

**"Remove ads" does not have that problem.** StoreKit 2's
`Transaction.currentEntitlements` is signed by Apple and verified on-device; Play
Billing's `queryPurchasesAsync` is the equivalent. The entitlement is cryptographically
real without any server of yours. And the failure mode if someone did defeat it is that
they see no ads, which costs you about a dollar a month.

So: no thin cloud needed for this. Ship it local.

### Mechanics

- **SDK**: `react-native-iap` (or Expo's `expo-in-app-purchases` if you move that way).
- **App Store Connect** → Features → In-App Purchases → Non-Consumable, product id
  `social.poppys.app.removeads`, price tier $19.99, localised name/description,
  review screenshot. **A new IAP must be submitted with a build the first time.**
- **Play Console** → Monetise → In-app products, same product id, same price.
- **Restore Purchases is mandatory** (Guideline 3.1.1). A visible button in settings
  that calls the restore API. Apps get rejected for omitting it on a non-consumable.
  Test it: delete the app, reinstall, restore.
- Store the resolved entitlement in the profile (`companion.update(plan=...)`) as a
  cache, but re-verify against StoreKit/Play on every cold start.
- **Sandbox-test both** before submitting. Apple sandbox accounts in App Store Connect →
  Users and Access → Sandbox Testers; Play via a closed-testing licence tester.

> Footnote: since the April 2025 US injunction, US-storefront apps may link out to
> external purchase without commission. It is real money (100% vs 85%) but adds
> checkout friction, is US-only, and the rules have moved repeatedly. Verify current
> status before betting on it. Ship StoreKit first either way.

---

## 3. Ads

### Integration

**SDK**: `react-native-google-mobile-ads`.

1. **AdMob** → two apps (iOS and Android are separate AdMob apps with separate App IDs).
   Link each to its store listing once published.
2. **Ad units**: start with one rewarded and one native/banner. See placement below for
   why interstitials are not on that list.
3. **Install**:
   ```
   npm i react-native-google-mobile-ads
   cd mobile/ios && pod install
   ```
   - `mobile/app.json` → `react-native-google-mobile-ads: { android_app_id, ios_app_id }`
   - iOS `Info.plist` → `GADApplicationIdentifier` + `SKAdNetworkItems`
   - Android manifest picks the App ID up from app.json automatically
4. **Consent, before the first ad request**:
   - **UMP** (Google's consent SDK) for GDPR in the EEA and UK. Required, and without it
     you serve nothing personalised.
   - **ATT** on iOS. Required before touching the IDFA. Expect a low opt-in rate and
     mostly non-personalised inventory; budget revenue accordingly.
5. **Test unit IDs only** until live. Clicking your own live ads gets the AdMob account
   banned, and the ban is account-level.
6. **Declare**: Play `App content → Ads → Yes`; Apple privacy label per §1b.
7. **Gate on entitlement**: one `shouldShowAds()` helper reading the StoreKit/Play
   entitlement, checked at every ad call site. Paid users must never see a request fire,
   not even a failed one.

### Placement — the part that matters

`billing.can_show_paywall()` already returns False for a crisis turn, a distress turn,
and `vent`/`wind` mood modes. **Every ad surface goes through that same function.** An ad
interrupting someone venting is worse than a paywall doing it, and it is the fastest way
to destroy the trust this product runs on.

- **Never**: during a call, mid-conversation, on a distress or crisis turn, on the
  morning/night ritual.
- **Good**: a native unit on the home screen between sessions; an end-of-session card;
  rewarded video the user actively chooses.
- **Avoid**: app-open and between-screen interstitials. Highest eCPM, and exactly the
  thing that makes a companion app feel like a slot machine.

### Revenue, priced honestly

Banners $1–3 eCPM, interstitials $3–8, rewarded $5–15 (Tier 1; India-weighted traffic is
lower). A heavy user ≈ 150 impressions/month ≈ **$0.45–1.20/user/month** before fill
rate. One $20 purchase ≈ 18–40 months of one ad-viewing user.

Ads are a floor under free users, not the business. Build the IAP first — it is less
work and worth more per user.

---

## 4. The App Store path, end to end

You are at internal TestFlight. Public launch is four gates.

### Gate 1 — TestFlight external beta

Differs from internal only in that an External group triggers **Beta App Review**
(~24–48h, first build of each version number). 10,000 testers, public link.

1. **TestFlight → Test Information** (once, not per build): beta description, feedback
   email `poppysdotsocial@gmail.com`, privacy policy URL.
2. **Sign-In Required: Yes** + a working demo account. You have a sign-in gate now; a
   reviewer who cannot get past it rejects the build.
3. `Info.plist` → `ITSAppUsesNonExemptEncryption = false`, or every upload stops to ask.
4. Bump `CURRENT_PROJECT_VERSION` (9 → 10), Archive from `PoppysSpike.xcworkspace`,
   Distribute → App Store Connect.
5. Testers and Groups → new **External** group → enable **Public Link**.
6. Attach the build, submit for Beta Review with notes: on-device inference, no server,
   mic local only, distress safety layer, demo account, how to reach a call.
7. Approved → `https://testflight.apple.com/join/XXXXXXXX`. Put it on the landing site.

Builds expire after 90 days. New builds of an approved version usually skip re-review.

### Gate 2 — the App Store listing

Independent of the beta; do it while Beta Review runs.

- Screenshots: 6.9" and 6.5" iPhone are the required sizes. iPad only if you claim iPad.
- Description, subtitle, keywords, support URL, marketing URL.
- **State in the description that this is an AI** (Guideline A4 in the checklist).
- **Do not use therapy, treatment, anxiety, or depression as outcome claims.** That
  triggers medical-app scrutiny under 1.4.1.
- Privacy policy URL, App Privacy answers per §1b, age rating per §1c.
- The IAP (§2) is attached to the first submission that contains it.

### Gate 3 — App Review

Full review, not the beta one. Days, not hours. Review notes should say: fully on-device
inference, no account required to use the app (if true after sign-in changes), mic
processed locally, safety layer for distress, not a medical app, demo account here.

The known rejection risks for this category, in order: **4.3 spam** (the store is
saturated with AI chatbots — lead with on-device privacy as the differentiator),
**1.2 UGC safety**, **5.1.1(v) account deletion** (§1a), **3.1.1 missing restore
purchases** (§2), **2.1 completeness**.

Expect one rejection. It is normal; the resolution centre reply loop is fast.

### Gate 4 — release

Choose manual release, not automatic. You want to publish on a day you can watch crash
reports. Phased release (7-day ramp) is on by default and worth keeping.

---

## 5. Play, in parallel

Same code, and the long pole is scheduling rather than engineering.

- **AAB, not APK**: `cd mobile/android && ./gradlew bundleRelease`. Play has required
  bundles for new apps since 2021. Your APK stays the sideload artifact.
- **Play App Signing**: `poppys-release.keystore` becomes the upload key; Google holds
  the signing key. Enroll, and back the keystore up off this machine.
- `versionCode 1` is fine for the first upload, must increment forever after.
- `targetSdkVersion 36` ✅ meets the current requirement. `arm64-v8a` only is accepted,
  but a reviewer on an x86 emulator cannot run it — say so in review notes, or add
  `x86_64` to `reactNativeArchitectures`.
- **The 12/14 rule**: a *personal* Play account created after Nov 2023 must run a closed
  test with **12 testers opted in for 14 continuous days** before it can apply for
  production. Organisation accounts are exempt. Check Play Console → your app →
  **Production → Apply for access**. If it applies, start that closed test today,
  because the clock runs in the background while everything else proceeds.
- Track ladder: Internal (instant) → Closed (the 14 days) → Open (public beta) →
  Production.

---

## Order of work

**Staged deliberately: beta first, money second.** Decided 2026-09-16. Ads and the
purchase that removes them are one feature in two halves, and a build that sells
something it cannot deliver is worse than a build that sells nothing. So a public
TestFlight goes out on what already works, and `BILLING_LIVE` stays false until both
halves land together.

### Stage 1 — public TestFlight, no ads, no payments (now)
Code is ready: `BILLING_LIVE = False` in `backend/billing.py` and
`mobile/src/core/billing.ts`, free tier uncapped, upgrade row absent, build 10.
Remaining work is all in App Store Connect. Sign-in is skippable ("Not now" is a real
answer, `frontend/flow.js:325`), so **Sign-In Required: No** and no demo account is
needed — the usual beta-review snag does not apply here.

### Stage 2 — during the 24-48h Beta Review wait
- In-app account deletion (§1a). Not a beta blocker; a hard App Review blocker.
- Android internal → closed testing, so the 12/14-day clock starts running.

### Stage 3 — ads and the $20, together
Link the ad SDK and the store bridge in one change, then flip `BILLING_LIVE` in both
twins. `window.PoppyNativeBilling` is referenced by `frontend/flow.js` and does not
exist yet; until it does, the upgrade button would grant Plus for free, which is
precisely why the switch is off.

### Stage 4 — App Store proper
Privacy labels updated to final truth (§1b), listing, App Review, manual phased release.
Android production once the 14 days and its review both clear.
