"""Who this is, and what they have left to spend.

The app has never had an identity. Everything is a file in a data directory, which is
exactly why it could promise that nothing leaves the device. Adding an account changes
that promise, so this module is deliberately small and says out loud what it does and
does not do.

## What this stores

A provider, a subject id, an email and a display name — whatever Google or Apple hands
back after the user signs in on the provider's own page. Nothing else, and never a
password: the app must never see one. OAuth exists precisely so that the password is
typed into Google, not into us, and any flow that asks for a Gmail password here would
be both a phishing pattern and an instant App Store rejection.

## What a credit is worth, and the honest limit of this file

Credits are stored in a ledger — deltas with reasons, not a single mutable number — so
"why do I have 40 left" always has an answer. But this ledger lives in the user's own
SQLite file on their own machine, and the model runs on their own hardware. A determined
user can hand themselves a million credits with one SQL statement, and no code here can
stop them.

That is not a flaw to be patched, it is the shape of a local-first product, and it means
one thing for pricing: **a credit can only be enforced against something a server
controls.** Cloud inference, sync, backups. Metering on-device inference is an honour
system with extra steps. Until this ledger moves behind an API that also serves the
thing being metered, treat these numbers as a UI affordance and a fair-use nudge, which
is exactly what billing.FREE_DAILY_CALLS already is.

The shape is chosen so that move is a change of storage, not a change of callers.
"""

import json
import time

import db

# What a new account starts with. A number, not a philosophy: it exists so the balance
# has something in it before there is anything to buy, and it is meant to be replaced
# when pricing is decided.
SIGNUP_GRANT = 100

# Providers the app will accept. Both open the provider's own sign-in page; neither
# gives us a password. Apple is not optional on iOS: an app offering a third-party
# login has to offer Sign in with Apple too (App Store Guideline 4.8), so shipping
# Google alone would fail review.
# "local" is a name and an email typed into our own form. It identifies, it does not
# authenticate: nobody proved they own that address, so it cannot gate anything that
# costs money. It exists so credits have somebody to belong to while the product is
# still being tested, and it is meant to be replaced by the two above before a payment
# ever clears.
PROVIDERS = ("google", "apple", "local")


def _init() -> None:
    with db._connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS account (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                provider TEXT NOT NULL,
                subject TEXT NOT NULL,
                email TEXT,
                name TEXT,
                created_at REAL NOT NULL
            );
            -- A ledger rather than a balance column. A single number cannot answer
            -- "where did my credits go", and the first support question about billing
            -- is always exactly that.
            CREATE TABLE IF NOT EXISTS credits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delta INTEGER NOT NULL,
                reason TEXT NOT NULL,
                at REAL NOT NULL
            );
            """
        )


def sign_in(provider: str, subject: str, email: str = "", name: str = "") -> dict:
    """Record who signed in. The token was verified before it got here.

    `subject` is the provider's stable id for this person (Google's `sub`, Apple's
    `sub`), not the email: an email can change hands and a subject cannot. For the
    "local" provider there is no such id, so the caller passes the normalised email —
    which is exactly the weakness that makes it unfit to gate anything paid.

    Verification is deliberately not done in this file. On a device there is nothing
    to verify against that the device does not also control, so the check belongs on
    the server that will eventually issue the credits. Until then this is an identity
    the app displays, not an identity it trusts.
    """
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    if not subject:
        raise ValueError("a sign-in needs a subject id")
    _init()
    existing = account()
    first = existing is None

    # Apple hands over the email and the real name **only on the very first
    # authorisation**. Every sign-in after that returns the subject and nulls, by
    # design — Apple treats the name as something you were told once. So a blank field
    # here means "unchanged", never "cleared": overwriting would silently erase the
    # only copy of a name we will never be given again.
    if existing and existing.get("subject") == subject:
        email = email or existing.get("email") or ""
        name = name or existing.get("name") or ""

    with db._connect() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO account (id, provider, subject, email, name, created_at)"
            " VALUES (1, ?, ?, ?, ?, ?)",
            (provider, subject, email or "", name or "", time.time()),
        )
    if first:
        grant(SIGNUP_GRANT, "signup")
    return status()


def sign_out() -> dict:
    """Forget the identity, keep the ledger.

    Signing out is not deleting an account, and wiping someone's balance because they
    tapped the wrong thing would be the worst possible reading of it. Deleting for
    real is a separate, louder action.
    """
    _init()
    with db._connect() as conn:
        conn.execute("DELETE FROM account WHERE id = 1")
    return status()


def account() -> dict | None:
    _init()
    with db._connect() as conn:
        row = conn.execute(
            "SELECT provider, subject, email, name, created_at FROM account WHERE id = 1"
        ).fetchone()
    return dict(row) if row else None


def balance() -> int:
    _init()
    with db._connect() as conn:
        row = conn.execute("SELECT COALESCE(SUM(delta), 0) AS n FROM credits").fetchone()
    return int(row["n"] or 0)


def grant(n: int, reason: str) -> int:
    """Add credits. Positive only: taking them away is spend(), and the two read
    differently in a ledger someone is trying to understand."""
    if n <= 0:
        raise ValueError("a grant adds credits; use spend() to take them")
    _init()
    with db._connect() as conn:
        conn.execute(
            "INSERT INTO credits (delta, reason, at) VALUES (?, ?, ?)", (n, reason, time.time())
        )
    return balance()


def spend(n: int, reason: str) -> dict:
    """Take credits for something that happened.

    Never refuses. Nothing in this app should end a conversation because a number hit
    zero — that is the mid-vent paywall the playbook rules out, arriving by a different
    door. The balance is allowed to go negative and the UI decides what to say about
    it, which keeps the decision where a person can see it rather than buried here.
    """
    if n <= 0:
        raise ValueError("a spend takes credits; use grant() to add them")
    _init()
    with db._connect() as conn:
        conn.execute(
            "INSERT INTO credits (delta, reason, at) VALUES (?, ?, ?)", (-n, reason, time.time())
        )
    return status()


def history(limit: int = 50) -> list[dict]:
    """Recent movements, newest first. This is what "where did they go" is answered with."""
    _init()
    with db._connect() as conn:
        rows = conn.execute(
            "SELECT delta, reason, at FROM credits ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def status() -> dict:
    """Everything a screen needs to draw the account, in one call."""
    acc = account()
    return {
        "signed_in": acc is not None,
        "provider": acc["provider"] if acc else None,
        "email": acc["email"] if acc else None,
        "name": acc["name"] if acc else None,
        "credits": balance(),
        # Said plainly rather than implied, because the difference matters the moment
        # money is involved and nobody reads the source.
        "enforced": False,
    }
