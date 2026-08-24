/**
 * Sign in with Google, without ever touching a password.
 *
 * The rule this file exists to enforce: the user types their password into Google, on
 * Google's own page, and this app is handed back a signed token describing who they
 * are. We never see, transport or store the password. A password box of our own would
 * be a phishing pattern whatever the intent, and an immediate App Store rejection.
 *
 * ## How it works here
 *
 * Google Identity Services, the current library. `google.accounts.id` is initialised
 * with a client id, the user picks an account, and we are given a **JWT credential**
 * whose payload carries `sub` (a stable id for this person), `email` and `name`.
 *
 * The client id comes from `GET /settings`, which reads it from the environment. No id
 * in the repo, and the clean build and the adult build can carry different ones.
 *
 * ## The verification gap, stated plainly
 *
 * We decode that JWT here to display a name; we do **not** verify its signature, and a
 * decode is not a check. A device can be told to lie about the answer, so verification
 * belongs on the server that will eventually hand out credits — it fetches Google's
 * public keys, verifies the signature, the `aud` and the `iss`, and only then trusts
 * `sub`. Until that server exists this is an identity the app shows, not one it trusts,
 * and `accounts.py` says the same thing from the other side.
 *
 * ## On the phone
 *
 * A WebView at a file:// origin is not an origin Google will accept, so iOS cannot run
 * this flow in the page. The native side owns it there (`ASWebAuthenticationSession`,
 * or the Google Sign-In SDK) and hands back the same three fields through
 * `window.PoppyNativeAuth`. One caller, two implementations.
 */
(function () {
  const GSI_SRC = "https://accounts.google.com/gsi/client";
  let clientIdPromise = null;

  function backend() {
    return window.BACKEND || "http://localhost:8000";
  }

  /** The configured client id, or "" when this build has none. Asked once. */
  function clientId() {
    if (!clientIdPromise) {
      clientIdPromise = fetch(`${backend()}/settings`)
        .then((r) => r.json())
        .then((s) => s.google_client_id || "")
        .catch(() => "");
    }
    return clientIdPromise;
  }

  /** Load the Google library once. Rejects offline, which is a normal state here. */
  function loadGsi() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("gsi failed to load")));
        return;
      }
      const el = document.createElement("script");
      el.src = GSI_SRC;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error("gsi failed to load"));
      document.head.appendChild(el);
    });
  }

  /**
   * The claims inside a JWT, without verifying it.
   *
   * Named for what it is. Base64url, and the payload can contain non-ASCII (a name
   * with an accent in it), so it goes through decodeURIComponent rather than atob
   * alone — otherwise the one user whose name is "José" gets a broken sign-in.
   */
  function readClaims(jwt) {
    const part = jwt.split(".")[1];
    if (!part) throw new Error("not a jwt");
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(json);
  }

  /** Is a real flow available in this build? */
  async function available(provider) {
    if (window.PoppyNativeAuth?.signIn) return true;
    if (provider === "apple") return false; // native only; no web flow wired yet
    return Boolean(await clientId());
  }

  /**
   * Run the sign-in. Resolves with {subject, email, name}, or null when there is
   * nothing wired to sign in with — never with a made-up identity.
   */
  async function signIn(provider) {
    if (window.PoppyNativeAuth?.signIn) {
      return window.PoppyNativeAuth.signIn(provider);
    }
    if (provider !== "google") return null;

    const id = await clientId();
    if (!id) {
      console.info("[auth] no GOOGLE_CLIENT_ID in this build; falling back to name and email");
      return null;
    }
    try {
      await loadGsi();
    } catch {
      // Offline, or the script was blocked. The caller falls back to the form, which
      // is the right outcome for an app that otherwise runs with no network at all.
      return null;
    }

    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      window.google.accounts.id.initialize({
        client_id: id,
        callback: (res) => {
          try {
            const c = readClaims(res.credential);
            done({ subject: c.sub, email: c.email || "", name: c.name || "" });
          } catch {
            done(null);
          }
        },
        // The account chooser, not One Tap: this is a deliberate tap on a button, and
        // a prompt that appears on its own would be a surprise on a first launch.
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      // A hidden host for Google's own button, which we click programmatically so the
      // page keeps its own styling. Google requires its button to exist and be
      // rendered; it does not require it to be the thing the user sees.
      let host = document.getElementById("gsi-host");
      if (!host) {
        host = document.createElement("div");
        host.id = "gsi-host";
        host.style.cssText = "position:fixed;opacity:0;pointer-events:none;left:-9999px;top:0";
        document.body.appendChild(host);
      }
      host.innerHTML = "";
      window.google.accounts.id.renderButton(host, { type: "standard", size: "large" });
      const real = host.querySelector('div[role="button"], iframe');
      if (real && real.click) real.click();
      else window.google.accounts.id.prompt();

      // If the user closes the chooser we are never called back, and a promise that
      // never settles leaves the button spinning for the rest of the session.
      setTimeout(() => done(null), 120000);
    });
  }

  window.PoppyAuth = { signIn, available };
})();
