"""
Monetization: charge for depth, never for dignity (POPPY_PRODUCT_PLAYBOOK §8).

Two tiers only (Free and Plus — Studio waits for v1.x), India-anchored pricing, and
one rule enforced *in code* rather than left to judgement: **never put a paywall in
front of a vulnerable moment.** Charging someone mid-vent or mid-crisis is exactly
the Replika complaint, and it caps lifetime value because it breaks trust. So the
paywall may only appear at *abundance* moments ("you two talk a lot — go unlimited"),
and `can_show_paywall()` makes a vulnerable-moment paywall impossible, the same way
nudges.py makes a guilt-trip impossible.

On desktop the entitlement is a local stub (a field on the profile); on mobile it's
backed by StoreKit / Play Billing through the thin cloud (D2). The *logic* — tiers,
the fair free limit, and the timing guardrail — is identical either way.
"""

from datetime import datetime, timezone

import companion
import db

# India-anchored, priced below Character.AI's ₹999; simple two-tier stack (§8).
TIERS = {
    "free": {
        "name": "Free",
        "price": "₹0",
        "blurb": "Everything you need to build the habit.",
        "features": [
            "A few calls a day",
            "Your companion, your vibe",
            "Core memory that remembers you",
            "Morning / night ritual",
            "Full privacy, export, and delete",
        ],
    },
    "plus": {
        "name": "Poppy Plus",
        "price": "₹299/mo · ₹2,499/yr",
        "blurb": "For when Poppy's part of your day.",
        "features": [
            "Unlimited, longer calls",
            "Richer voice and deeper memory",
            "Look-together and background calls",
            "Priority latency",
        ],
    },
}

# A *fair* daily limit on the free tier, not a wall. Abundance, never dignity: going
# over it during an ordinary call is where we invite an upgrade; going over it during
# a vulnerable call is where we simply let the person talk (see can_show_paywall).
FREE_DAILY_CALLS = 5

# Mood modes that are emotionally vulnerable by nature — never monetize these.
_VULNERABLE_MODES = {"vent", "wind"}


def plan() -> str:
    return companion.profile().get("plan", "free")


def calls_today() -> int:
    today = datetime.now(timezone.utc).date()
    n = 0
    for e in db.get_events():
        if e["name"] != "call_started":
            continue
        try:
            if datetime.fromisoformat(e["created_at"]).date() == today:
                n += 1
        except (ValueError, KeyError):
            pass
    return n


def can_show_paywall(context: dict | None = None) -> bool:
    """The §8 guardrail. False for any vulnerable moment — a distress/crisis-flagged
    turn or an emotionally vulnerable mood mode — so a paywall there is impossible."""
    ctx = context or {}
    if ctx.get("crisis") or ctx.get("distress"):
        return False
    if ctx.get("mode") in _VULNERABLE_MODES:
        return False
    return True


def paywall_due(context: dict | None = None) -> bool:
    """True only when a free user is over the fair daily limit AND this is an
    abundance (non-vulnerable) moment. Vulnerable calls always pass through free."""
    if plan() != "free":
        return False
    if calls_today() < FREE_DAILY_CALLS:
        return False
    return can_show_paywall(context)


def entitlement() -> dict:
    p = plan()
    used = calls_today()
    limit = None if p != "free" else FREE_DAILY_CALLS
    return {
        "plan": p,
        "tier": TIERS.get(p, TIERS["free"]),
        "tiers": TIERS,
        "calls_today": used,
        "daily_limit": limit,
        "calls_left": None if limit is None else max(0, limit - used),
    }


def set_plan(new_plan: str) -> dict:
    new_plan = new_plan if new_plan in TIERS else "free"
    companion.update(plan=new_plan)
    return entitlement()


def referral() -> dict:
    """A share code for the aligned-incentive referral loop (§7 loop B: 'give a
    friend a week with Poppy, get a week yourself'). Local stub on desktop; real
    redemption/attribution is a thin-cloud job (D2)."""
    import uuid
    p = companion.profile()
    code = p.get("referral_code")
    if not code:
        code = "POPPY-" + uuid.uuid4().hex[:6].upper()
        companion.update(referral_code=code)
    return {
        "code": code,
        "message": "Give a friend a week of Poppy Plus, and get a week yourself.",
    }
