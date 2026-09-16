"""
Monetization: charge for quiet, never for dignity (POPPY_PRODUCT_PLAYBOOK §8).

**One paid thing, and it is not a feature.** Free is the whole product: every call,
every vibe, the full memory, the rituals, unlimited. Plus is the same product with the
ads switched off, bought once. There is no tier that talks to her more, because a
companion that meters conversation is a companion that fails the person who needs the
sixth call more than the first.

That leaves exactly one guardrail worth enforcing in code, and it is the one this file
has always had: **an interruption may only land at an abundance moment.** It used to
mean a paywall. It now means an ad, which needs it more — an ad on top of someone
venting is worse than a paywall there, and is the fastest way to lose the trust the
whole product runs on. `can_interrupt()` makes both impossible, the same way nudges.py
makes a guilt-trip impossible.

The entitlement is a StoreKit / Play Billing non-consumable. Unlike the credit ledger in
accounts.py, it is genuinely enforceable without a server: `Transaction.currentEntitlements`
and `queryPurchasesAsync` are signed by the store and verified on-device. On desktop it
stays a local field on the profile.
"""

import companion

# Two tiers, and the difference between them is one word long.
#
# The copy matters more than usual here: whatever is written in `features` is what the
# store listing promises. The old text promised Plus "unlimited, longer calls" back when
# Free was capped at five a day. Free is uncapped now, so that line would be a false
# claim on two storefronts, not merely stale marketing.
TIERS = {
    "free": {
        "name": "Free",
        "price": "₹0",
        "blurb": "The whole thing, free.",
        "features": [
            "Unlimited calls, always",
            "Your companion, your vibe",
            "Core memory that remembers you",
            "Morning / night ritual",
            "Full privacy, export, and delete",
            "A few ads between conversations",
        ],
    },
    "plus": {
        "name": "Poppy Plus",
        "price": "$20 once",
        "blurb": "The same Poppy, without the ads.",
        "features": [
            "No ads, anywhere, ever",
            "Everything in Free, unchanged",
            "One payment, not a subscription",
        ],
    },
}

# Mood modes that are emotionally vulnerable by nature. Nothing interrupts these.
_VULNERABLE_MODES = {"vent", "wind"}


def plan() -> str:
    return companion.profile().get("plan", "free")


def can_interrupt(context: dict | None = None) -> bool:
    """The §8 guardrail, and the only gate in this file.

    False for any vulnerable moment: a distress/crisis-flagged turn, or an emotionally
    vulnerable mood mode. Every ad surface and every upgrade prompt must pass through
    here, so neither can appear at a moment where it would cost more than it earns.
    """
    ctx = context or {}
    if ctx.get("crisis") or ctx.get("distress"):
        return False
    if ctx.get("mode") in _VULNERABLE_MODES:
        return False
    return True


def should_show_ads(context: dict | None = None) -> bool:
    """True when an ad may be requested right now: the user has not bought Plus, and
    this is an abundance moment. Check this at *every* ad call site — a paid user must
    never see a request fire, not even one that fails to fill."""
    if plan() != "free":
        return False
    return can_interrupt(context)


def entitlement() -> dict:
    """Current tier and, the only thing any caller actually branches on, whether ads
    are on. No counters: there is nothing left to count."""
    p = plan()
    return {
        "plan": p,
        "ads": p == "free",
        "tier": TIERS.get(p, TIERS["free"]),
        "tiers": TIERS,
    }


def set_plan(new_plan: str) -> dict:
    """Record the tier. The *authority* for this is the store receipt, not this call:
    mobile resolves the entitlement from StoreKit / Play Billing on every cold start
    and calls this to cache the result. Desktop has no store, so here it is the truth."""
    new_plan = new_plan if new_plan in TIERS else "free"
    companion.update(plan=new_plan)
    return entitlement()


def referral() -> dict:
    """A share code for the aligned-incentive referral loop (§7 loop B). Local stub on
    desktop; real redemption/attribution is a thin-cloud job (D2)."""
    import uuid
    p = companion.profile()
    code = p.get("referral_code")
    if not code:
        code = "POPPY-" + uuid.uuid4().hex[:6].upper()
        companion.update(referral_code=code)
    return {
        "code": code,
        "message": "Give a friend Poppy, ad-free for a week, and get a week yourself.",
    }
