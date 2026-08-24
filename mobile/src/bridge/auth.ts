/**
 * Sign in with Google, natively.
 *
 * The page cannot do this itself: a WebView loaded from `file://` has no origin Google
 * will accept, so `frontend/auth.js` checks for `window.PoppyNativeAuth` first and this
 * is what answers. The user picks an account in Google's own sheet; we are handed an
 * ID token and a profile. **No password crosses this boundary, ever.**
 *
 * ## Configuration
 *
 * The id has to be passed to `configure()` explicitly. This library does **not** read
 * `GIDClientID` from Info.plist — it looks for a Firebase `GoogleService-Info.plist`
 * and, failing that, for an `iosClientId` option, and throws
 * "failed to determine clientID" when it has neither. Google's own SDK reads the plist
 * key; the wrapper does not, which is an easy and expensive thing to assume.
 *
 * So the id lives here as well as in Info.plist, where it is still needed for the URL
 * scheme. Two copies is a drift risk, so `tests/test_google_config.js` fails when they
 * stop matching. It is an OAuth *client id*, not a secret: public by design, no client
 * secret exists for an iOS client, and Google verifies the app by its bundle id.
 *
 * ## What this does not do
 *
 * It does not verify the token. A device cannot check a signature against anything the
 * device does not also control, so verification belongs on the server that hands out
 * entitlements: it fetches Google's public keys and checks the signature, the `aud` and
 * the `iss` before trusting `sub`. Until that server exists this is an identity the app
 * displays, not one it trusts — the same thing `accounts.ts` reports with
 * `enforced: false`.
 */

import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import appleAuth from '@invertase/react-native-apple-authentication';

export type Claims = { subject: string; email: string; name: string };

/** Must equal GIDClientID in ios/PoppysSpike/Info.plist. Guarded by a test. */
const IOS_CLIENT_ID =
  '512938090680-r7kj5c5mmuothkh324u0m8vs49kelplt.apps.googleusercontent.com';

let configured = false;

function configure(): void {
  if (configured) return;
  configured = true;
  GoogleSignin.configure({ iosClientId: IOS_CLIENT_ID });
}

/**
 * Run the flow. Resolves with the claims, or **null** for every non-success — a
 * cancel, a missing client id, no Play Services, a network failure.
 *
 * Null rather than a throw because the caller's job is the same in all of those cases:
 * offer the email form instead. An identity is never invented to paper over a failure;
 * the page says sign-in is unavailable and moves on.
 */
export async function signInWithGoogle(): Promise<Claims | null> {
  try {
    configure();
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    const res = await GoogleSignin.signIn();
    // v13+ returns {type, data}; older builds returned the user object directly.
    const user = (res as { data?: unknown }).data ?? res;
    const info = user as { user?: { id?: string; email?: string; name?: string } };
    const sub = info.user?.id;
    if (!sub) return null;
    return {
      // Google's stable id for this person, not the email: an email can change hands
      // and a subject cannot, so the subject is what an account is keyed on.
      subject: sub,
      email: info.user?.email ?? '',
      name: info.user?.name ?? '',
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === statusCodes.SIGN_IN_CANCELLED) {
      // Closing the sheet is an answer, not an error. Logging it as one trains
      // everybody to ignore this log.
      return null;
    }
    console.log(`[auth] google sign-in did not complete: ${code ?? String(err)}`);
    return null;
  }
}

/** Forget the Google session on this device. The app's own account is separate. */
export async function signOutGoogle(): Promise<void> {
  try {
    configure();
    await GoogleSignin.signOut();
  } catch {
    // Already signed out, or never configured. Either way there is nothing to undo.
  }
}

/**
 * Sign in with Apple.
 *
 * Not an alternative to Google — a requirement. An iOS app offering a third-party
 * login has to offer this too (App Store Guideline 4.8), so shipping Google alone
 * fails review.
 *
 * ## The thing that catches everyone
 *
 * Apple returns the email and the full name **only on the very first authorisation**
 * for a given Apple ID and app. Every sign-in after that carries the subject and
 * nulls. Apple's position is that you were told once and should have kept it. So the
 * first response is the only chance to record a name, which is why `accounts.py` and
 * `accounts.ts` treat a blank field as "unchanged" rather than "cleared".
 *
 * The email may also be a private relay address (`…@privaterelay.appleid.com`) if the
 * user chose to hide theirs. That is a real, deliverable address and must not be
 * treated as invalid.
 *
 * Configuration is the capability itself: enabled on the App ID and added in Xcode.
 * There is no client id to paste for the native flow.
 */
export async function signInWithApple(): Promise<Claims | null> {
  try {
    // iOS 13+. Older devices simply do not have it, and the button should not have
    // been offered — but a check here is cheaper than a crash on someone's old phone.
    if (!appleAuth.isSupported) return null;

    const res = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      // Asked for every time. Apple only *answers* the first time, and asking again
      // costs nothing.
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });

    if (!res.user) return null;

    // Apple hands the name back in parts, and both can be null on a repeat sign-in.
    const parts = [res.fullName?.givenName, res.fullName?.familyName].filter(Boolean);

    return {
      subject: res.user,
      email: res.email ?? '',
      name: parts.join(' '),
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === appleAuth.Error.CANCELED) {
      // Dismissing the sheet is an answer, not a failure.
      return null;
    }
    console.log(`[auth] apple sign-in did not complete: ${code ?? String(err)}`);
    return null;
  }
}
