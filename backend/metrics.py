"""
Privacy-preserving product metrics (POPPY_PRODUCT_PLAYBOOK §12, §5.5).

The whole point of §12 is to measure the *right* things — activation, the moment
of feeling known, healthy retention — and explicitly NOT "minutes in app", which is
the metric that leads to dependency design and a bad regulatory day. So this module
optimizes for **meaningful sessions and trust**, and it does so from content-free
events (a name + a number + a timestamp; see db.record_event) — no transcript ever
touches analytics. On device today; the same event names map to anonymous product
metrics on the thin cloud later.
"""

from datetime import date, datetime, timezone

import db
import companion

_MEANINGFUL_MIN_SECONDS = 60  # a call is "meaningful" at >= 60s (or if it saved a memory)


def _events_by_name(events: list[dict]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for e in events:
        out.setdefault(e["name"], []).append(e)
    return out


def _call_dates(call_events: list[dict]) -> set[date]:
    dates = set()
    for e in call_events:
        try:
            dates.add(datetime.fromisoformat(e["created_at"]).date())
        except (ValueError, KeyError):
            pass
    return dates


def _rate(numer: int, denom: int) -> float | None:
    return round(numer / denom, 3) if denom else None


def dashboard() -> dict:
    """Compute the §12 metrics that actually matter, from the local event log."""
    events = db.get_events()
    by = _events_by_name(events)
    prof = companion.profile()

    started = by.get("call_started", [])
    ended = by.get("call_ended", [])
    durations = [e["value"] for e in ended if e.get("value") is not None]
    meaningful = [d for d in durations if d >= _MEANINGFUL_MIN_SECONDS]

    # Activation: the single most predictive number — was the FIRST call >= 60s?
    first_call_ge_60s = bool(durations) and durations[0] >= _MEANINGFUL_MIN_SECONDS

    # Retention: active on day 1 / 7 / 30 after the companion was created.
    created = prof.get("created_at")
    d1 = d7 = d30 = False
    day_span = None
    if created:
        c0 = datetime.fromisoformat(created).date()
        day_span = (datetime.now(timezone.utc).date() - c0).days
        active = _call_dates(started or ended)
        d1 = any((d - c0).days >= 1 for d in active)
        d7 = any((d - c0).days >= 7 for d in active)
        d30 = any((d - c0).days >= 30 for d in active)

    weeks = max((day_span or 0) / 7, 1)
    callbacks_offered = len(by.get("callback_offered", []))
    callbacks_landed = len(by.get("callback_landed", []))
    saves = len(by.get("memory_saved", []))
    edits = len(by.get("memory_edited", []))
    deletes = len(by.get("memory_deleted", []))

    return {
        # Activation
        "first_call_ge_60s": first_call_ge_60s,           # the north-star proxy
        # Core magic — "she knows me"
        "callback_land_rate": _rate(callbacks_landed, callbacks_offered),
        # Retention
        "retained_d1": d1, "retained_d7": d7, "retained_d30": d30,
        "days_since_created": day_span,
        # Habit
        "ritual_set": bool(prof.get("ritual_kind")),
        "current_streak": prof.get("current_streak", 0),
        # Depth — quality, NOT raw minutes
        "total_calls": len(started) or prof.get("total_calls", 0),
        "meaningful_sessions": len(meaningful),
        "meaningful_session_rate": _rate(len(meaningful), len(ended)),
        "calls_per_week": round(len(started) / weeks, 2) if started else 0,
        "avg_call_seconds": round(sum(durations) / len(durations), 1) if durations else None,
        # Trust — leading indicator of LTV
        "memories_saved": saves,
        "memory_edit_delete_rate": _rate(edits + deletes, saves),
    }
