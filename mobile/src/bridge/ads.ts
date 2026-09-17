/**
 * AdMob: the native half of the ad surface.
 *
 * ## Why this is native and not a script in the page
 *
 * The UI is a WebView on a `file://` origin. AdSense is the web product and its policy
 * forbids serving into an app or a WebView outright, and a `file://` page has no origin
 * to serve against even if it did not. AdMob is the mobile product, it renders real
 * native views, so the banner is composed *around* the WebView by AppShell and the page
 * only says when a moment is safe.
 *
 * ## Where an ad may appear, which is the part that matters
 *
 * Only on the home screen, between conversations. Never during a call, never mid
 * conversation, never on a vent or wind-down, never on a distress turn. That is not a
 * taste preference: an ad landing on someone who opened the app to say something hard
 * is the fastest way to lose the trust this product runs on. `billing.shouldShowAds()`
 * owns that judgement and every path here goes through it.
 *
 * ## Test units by default, on purpose
 *
 * `UNIT_ID` resolves to Google's test banner unless a real id is configured. Requesting
 * live ads from a build you are developing, or tapping your own, is how an AdMob account
 * gets banned — and the ban is account-level, not app-level. Swap in the real unit only
 * when the app is on a real device going to real testers.
 */

import { Platform } from 'react-native';
import mobileAds, {
  AdsConsent,
  AdsConsentStatus,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';

/**
 * The real banner units. Two apps, so two ids: an AdMob "app" is per platform even
 * though the store listing is one product. These are the `/` ids (ad units); the `~`
 * ids (apps) live in app.json and Info.plist, and swapping the two is the classic
 * setup mistake.
 */
const LIVE_UNIT = {
  ios: 'ca-app-pub-3940256099942544/2934735716',
  android: 'ca-app-pub-3940256099942544/6300978111',
};

/**
 * Test ads in *every* build until the store launch. Flip to false only for the build
 * that goes to the App Store / Play production, and in the same change as linking the
 * store listings in AdMob.
 *
 * `__DEV__` alone was not enough. A release APK sent to a friend, or a TestFlight
 * build, is a release build and would request live ads. Those barely fill before AdMob
 * has approved an app with a store listing, so the test would look broken, and a
 * tester who was asked to "check the ads" and taps them is invalid traffic against the
 * account. Test units always fill and are safe to tap.
 */
const FORCE_TEST_ADS = true;

export const UNIT_ID = __DEV__ || FORCE_TEST_ADS
  ? TestIds.BANNER
  : Platform.OS === 'ios' ? LIVE_UNIT.ios : LIVE_UNIT.android;

/** True whenever a live ad cannot be requested: debug builds, and all pre-launch builds. */
export const USING_TEST_ADS = UNIT_ID === TestIds.BANNER;

let started = false;

/**
 * Ask for consent, then start the SDK. Order matters: the consent form must be resolved
 * *before* the first ad request, or the request goes out non-personalised at best and
 * unlawfully at worst.
 *
 * Failures are swallowed by design. No ad is worth a blank screen, and every caller here
 * is decorating a UI that has to work regardless.
 */
export async function startAds(): Promise<void> {
  if (started) return;
  started = true;

  try {
    // GDPR / UK GDPR. Google's own UMP SDK, which is what AdMob requires rather than a
    // consent banner of our own.
    const info = await AdsConsent.requestInfoUpdate();
    if (
      info.isConsentFormAvailable &&
      info.status === AdsConsentStatus.REQUIRED
    ) {
      await AdsConsent.showForm();
    }
  } catch {
    // Outside the EEA/UK there is usually no form at all, which arrives here as a
    // throw on some SDK versions. Not an error worth surfacing.
  }

  try {
    // ── On ATT, and why there is deliberately no prompt here ──────────────────
    //
    // This SDK does not expose App Tracking Transparency; it needs a separate library
    // (react-native-tracking-transparency) and an explicit prompt. We are not adding
    // one, for now, and that is a choice rather than an omission.
    //
    // Without ATT the IDFA is simply unavailable on iOS and ads serve non-personalised.
    // That costs eCPM. What it buys is worth more right now: no tracking prompt on
    // first launch, and an App Privacy label that does not have to declare
    // "Used for Tracking", which would otherwise be the first time this app ever
    // claimed to track anyone. For a product whose whole pitch is that conversations
    // never leave the phone, that is a bad trade to make for a few cents a month.
    //
    // Revisit when ad revenue is large enough for the difference to matter, and expect
    // to update the privacy label in the same change.
    await mobileAds()
      .setRequestConfiguration({
        // The app is rated for adults, but a companion app should not be serving
        // gambling or explicit inventory next to a conversation someone is having
        // about their day. This is the one lever AdMob gives for that.
        maxAdContentRating: MaxAdContentRating.PG,
        tagForChildDirectedTreatment: false,
        tagForUnderAgeOfConsent: false,
      })
      .then(() => mobileAds().initialize());
  } catch {
    // An SDK that will not start simply means no ads. The app is unaffected.
  }
}
