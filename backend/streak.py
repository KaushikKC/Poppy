"""
The streak (POPPY_RETENTION_ENGINE §4.1).

The single highest-value mechanic in the doc after the open loop itself, and the
one the old build got wrong in three separate ways: it counted `/call/open`, so
launching the app and closing it immediately earned a day; it ran on a **UTC**
boundary, so a 9pm call in one timezone landed on the wrong day and a late-night
call in another landed on the previous one; and it had no states, so there was
nothing between "alive" and "gone".

The design here follows §4.1 closely, and the parts that look generous are the
whole point:

  * **The floor is absurdly low.** One call of 60 seconds, or one completed daily
    quest. Duolingo's real trick isn't the streak, it's that on your worst day you
    can keep it in 90 seconds. If the floor were "a real call" it would break on
    exactly the days people are most fragile, and a broken streak on a bad day is
    a churn event rather than a nudge.
  * **4am rollover, local.** A wind-down call finishing at 00:30 belongs to the
    day that just ended, not the one starting.
  * **Freezes are silent and discovered afterwards.** "You missed yesterday, I
    covered you" is protection. A warning that a freeze is about to be spent is
    just a countdown with better manners.
  * **Repair is free.** Duolingo monetizes it; for a companion that is charging
    someone to undo an emotional-sounding failure, which §4.1 marks red.

Nothing here ever shrinks or punishes. A missed day stops the count; it doesn't
take anything away.
"""

from datetime import date, datetime, timedelta

import companion

# The day flips at 4am local, so the small hours still belong to the night before.
ROLLOVER_HOUR = 4

# What earns a day (§4.1). Deliberately the lowest bar that still means contact.
MIN_CALL_SECONDS = 60

MAX_FREEZES = 2
FREEZE_EVERY_N_DAYS = 7      # one regenerates per 7 days of streak
FRAGMENTS_PER_FREEZE = 5     # quest completions grant fragments
REPAIR_WINDOW_HOURS = 48
AT_RISK_HOURS = 6            # "not met, and rollover is close"

# §4.1's eleven tiers. Delivered as a moment inside a call, never a badge popup.
MILESTONES = (3, 7, 14, 30, 50, 100, 150, 200, 365, 500, 1000)
LONG_YEAR = 365

# How much history to keep for the Perfect Week calendar and the year view.
_MAX_HISTORY_DAYS = 400

def _profile() -> dict:
    """The streak's state lives in the companion profile, which declares the
    `streak_*` fields and their defaults. Kept in one place because `update()`
    only writes keys the profile knows about, so a field declared only here would
    be silently dropped on every save."""
    p = companion.profile()
    # A profile written by the shipped 1.0 app has a streak but no streak date.
    # Adopt the old field once, before anything reads the streak.
    if p.get("current_streak", 0) > 0 and not p.get("streak_last_date") and p.get("last_call_date"):
        return _adopt_legacy_date()
    return p


def today(now: datetime | None = None) -> date:
    """The streak-date for a moment in local time (§4.1: 4am rollover)."""
    now = now or datetime.now()
    return (now - timedelta(hours=ROLLOVER_HOUR)).date()


def _next_rollover(now: datetime | None = None) -> datetime:
    now = now or datetime.now()
    boundary = now.replace(hour=ROLLOVER_HOUR, minute=0, second=0, microsecond=0)
    if now >= boundary:
        boundary += timedelta(days=1)
    return boundary


def _iso(d: date) -> str:
    return d.isoformat()


def _parse(s: str | None) -> date | None:
    try:
        return date.fromisoformat(s) if s else None
    except (ValueError, TypeError):
        return None


def _unlimited_freezes() -> bool:
    """Plus sells safety, not the relationship (§4.1, 🟡). Charging to *repair* a
    break would be the red version; this only ever adds cushion."""
    return companion.profile().get("plan") == "plus"


def _adopt_legacy_date() -> dict:
    """Carry a pre-1.1 streak across the upgrade.

    Before the rebuild the only record of when someone last called was
    `last_call_date`, written on a UTC clock. `streak_last_date` did not exist, so
    a profile written by the shipped app arrives here with a streak number and no
    date attached to it. `record_activity` would then see no previous day and
    start again from 1: someone with a nine-day run would open the update, call,
    and be told they were on day one.

    Adopting the old date is not exact, since it was UTC and this is local, but it
    is out by at most a day and it errs toward keeping the streak. Losing a run to
    a version bump is the one outcome worth avoiding.
    """
    p = companion.profile()
    if p.get("streak_last_date") or not p.get("last_call_date"):
        return p
    if p.get("current_streak", 0) <= 0:
        return p
    return companion.update(streak_last_date=p["last_call_date"])


def _settle(now: datetime | None = None) -> dict:
    """Bring the streak up to date with the clock, spending freezes for any days
    missed since the last activity.

    Freezes are described as "auto-consumed at rollover", but there is no 4am job
    on a desktop app that may not even be running, so they are applied lazily the
    next time anything reads the streak. The user-visible result is identical.
    """
    p = _profile()
    cur = today(now)
    last = _parse(p.get("streak_last_date"))
    if last is None or p.get("current_streak", 0) <= 0:
        return p

    gap = (cur - last).days
    if gap <= 1:
        return p  # met today, or today is still open

    missed = gap - 1
    freezes = p.get("streak_freezes", 0)
    changes: dict = {}

    if _unlimited_freezes():
        covered = missed
    else:
        covered = min(missed, freezes)
        changes["streak_freezes"] = freezes - covered

    if covered:
        changes["streak_freeze_notice"] = p.get("streak_freeze_notice", 0) + covered

    if covered >= missed:
        # Fully covered: the run continues. Covered days are recorded separately
        # from days they actually showed up for, so the Perfect Week calendar can
        # show them honestly as covered rather than claiming they were there.
        frozen = list(p.get("streak_frozen_days", []))
        for i in range(1, missed + 1):
            frozen.append(_iso(last + timedelta(days=i)))
        changes["streak_frozen_days"] = sorted(set(frozen))[-_MAX_HISTORY_DAYS:]
        changes["streak_last_date"] = _iso(cur - timedelta(days=1))
        changes["current_streak"] = p.get("current_streak", 0) + missed
    else:
        # Not covered. The run ends, but stays repairable for 48h (§4.1).
        #
        # The break is dated to the rollover it actually happened at, not to the
        # moment we noticed. Settlement is lazy (there is no 4am job on a desktop
        # app that may not be running), so stamping "now" would restart the 48h
        # grace every time the app opened and a streak abandoned for a month would
        # still offer repair.
        first_uncovered = last + timedelta(days=covered + 1)
        broke_at = datetime.combine(
            first_uncovered + timedelta(days=1),
            datetime.min.time(),
        ) + timedelta(hours=ROLLOVER_HOUR)
        changes["streak_broken_at"] = broke_at.isoformat()
        changes["streak_broken_from"] = p.get("current_streak", 0)
        changes["current_streak"] = 0

    return companion.update(**changes) if changes else p


def _repair_available(p: dict, now: datetime) -> bool:
    """48h grace, free once per calendar month, no ceremony (§4.1)."""
    broken_at = p.get("streak_broken_at")
    if not broken_at or not p.get("streak_broken_from"):
        return False
    try:
        when = datetime.fromisoformat(broken_at)
    except (ValueError, TypeError):
        return False
    if now - when > timedelta(hours=REPAIR_WINDOW_HOURS):
        return False
    return p.get("streak_repair_month") != now.strftime("%Y-%m")


def state(now: datetime | None = None) -> str:
    """One of none | safe | at_risk | frozen | repairable | broken (§4.1).

    `none` is not in the doc's list, because the doc assumes a streak exists. A
    user who has never had one has not broken anything, and showing them a break
    (or worse, offering to repair it) is both false and exactly the shame framing
    §4.1 rules out.
    """
    now = now or datetime.now()
    p = _settle(now)
    cur = today(now)
    last = _parse(p.get("streak_last_date"))

    if last is None and p.get("current_streak", 0) <= 0:
        return "none"
    if last == cur:
        return "safe"
    if p.get("current_streak", 0) > 0:
        # Today is still open. It only becomes "at risk" near the boundary.
        if p.get("streak_freeze_notice", 0):
            return "frozen"
        hours_left = (_next_rollover(now) - now).total_seconds() / 3600
        return "at_risk" if hours_left <= AT_RISK_HOURS else "safe"
    if _repair_available(p, now):
        return "repairable"
    return "broken"


def _grant_freeze_if_earned(p: dict) -> dict:
    """One freeze per 7 days of streak, capped. Never announced as a reward: it's
    a cushion the user finds out about only if they need it."""
    streak = p.get("current_streak", 0)
    mark = p.get("streak_freeze_mark", 0)
    if streak // FREEZE_EVERY_N_DAYS <= mark // FREEZE_EVERY_N_DAYS:
        return p
    if p.get("streak_freezes", 0) >= MAX_FREEZES:
        return companion.update(streak_freeze_mark=streak)
    return companion.update(
        streak_freezes=p.get("streak_freezes", 0) + 1, streak_freeze_mark=streak,
    )


def qualifies(duration_s: float = 0, quest_done: bool = False) -> bool:
    """§4.1's floor: one call of 60s, or one completed daily quest."""
    return bool(quest_done) or float(duration_s or 0) >= MIN_CALL_SECONDS


def record_activity(now: datetime | None = None) -> dict:
    """Credit today. Idempotent: a second qualifying call today changes nothing.

    Called at call *close* once the floor is met, never at call open. Opening the
    app and shutting it is not a day.
    """
    now = now or datetime.now()
    p = _settle(now)
    cur = today(now)
    last = _parse(p.get("streak_last_date"))

    if last == cur:
        return status(now)  # already counted

    if last == cur - timedelta(days=1) and p.get("current_streak", 0) > 0:
        new_streak = p.get("current_streak", 0) + 1
    else:
        new_streak = 1

    history = sorted(set(list(p.get("streak_history", [])) + [_iso(cur)]))
    p = companion.update(
        streak_last_date=_iso(cur),
        current_streak=new_streak,
        longest_streak=max(p.get("longest_streak", 0), new_streak),
        streak_history=history[-_MAX_HISTORY_DAYS:],
        # A fresh run clears the old break, so the repair offer doesn't linger.
        streak_broken_at=None,
        streak_broken_from=0,
        last_call_date=_iso(cur),  # kept for the older readers of this field
    )
    _grant_freeze_if_earned(p)
    return status(now)


def add_fragment(count: int = 1) -> dict:
    """Quest completions grant fragments; five make a freeze (§4.1)."""
    p = _profile()
    total = p.get("streak_fragments", 0) + max(int(count), 0)
    freezes = p.get("streak_freezes", 0)
    earned, remainder = divmod(total, FRAGMENTS_PER_FREEZE)
    if earned and freezes < MAX_FREEZES:
        freezes = min(freezes + earned, MAX_FREEZES)
        total = remainder
    return companion.update(streak_fragments=total, streak_freezes=freezes)


def repair(now: datetime | None = None) -> dict:
    """Restore a just-broken streak. Free, once a calendar month, no ceremony."""
    now = now or datetime.now()
    p = _settle(now)
    if not _repair_available(p, now):
        return status(now)
    restored = p.get("streak_broken_from", 0)
    companion.update(
        current_streak=restored,
        streak_last_date=_iso(today(now) - timedelta(days=1)),
        streak_repair_month=now.strftime("%Y-%m"),
        streak_broken_at=None,
        streak_broken_from=0,
    )
    return status(now)


def take_freeze_notice() -> str | None:
    """The warm, after-the-fact disclosure (§4.1). Read once, then cleared.

    Deliberately not a warning beforehand: telling someone a freeze is *about* to
    be spent turns protection back into a countdown.
    """
    p = _profile()
    spent = p.get("streak_freeze_notice", 0)
    if not spent:
        return None
    left = p.get("streak_freezes", 0)
    companion.update(streak_freeze_notice=0)
    day_word = "yesterday" if spent == 1 else f"{spent} days"
    if _unlimited_freezes():
        return f"You missed {day_word}. I covered you."
    remaining = "one left" if left == 1 else (f"{left} left" if left else "none left")
    return f"You missed {day_word}. I covered you, {remaining}."


def check_milestone() -> int | None:
    """A newly reached milestone, once. Returned so the opener can make it a
    moment inside the call rather than a modal with confetti (§4.1)."""
    p = _profile()
    streak = p.get("current_streak", 0)
    celebrated = list(p.get("celebrated_milestones", []))
    if streak in MILESTONES and streak not in celebrated:
        celebrated.append(streak)
        companion.update(celebrated_milestones=celebrated)
        return streak
    return None


# How close counts as close, for the Long Year. §4.4's goal gradient says the
# distance to a target should be withheld until the user is nearly there: shown
# always it becomes a progress bar they live under, shown near the line it
# produces the documented sprint.
LONG_YEAR_NEAR_DAYS = 30


def long_year(now: datetime | None = None) -> dict:
    """The Long Year (§4.1): the one thing that only exists at 365 days.

    This is the whole endgame. A user a year in has seen every quest, passed every
    milestone that mattered and finished the level curve, and until now there was
    nothing left for them at all: that is where the longest, most loyal users
    quietly leave.

    It is deliberately *visible from day one* as a distant known-unknown, and
    deliberately not a countdown. There is nothing to lose by never reaching it,
    which is what separates an aspiration from a threat.
    """
    p = _profile()
    current = p.get("current_streak", 0)
    reached = current >= LONG_YEAR or bool(p.get("long_year_marked"))
    remaining = max(LONG_YEAR - current, 0)
    return {
        "days": LONG_YEAR,
        "reached": reached,
        "marked": bool(p.get("long_year_marked")),
        # Only populated once they are nearly there.
        "days_left": remaining if (not reached and remaining <= LONG_YEAR_NEAR_DAYS) else None,
        "near": not reached and remaining <= LONG_YEAR_NEAR_DAYS,
    }


def mark_long_year() -> bool:
    """Record that the Long Year has been honoured, so it happens exactly once.

    Returns True the single time it flips.
    """
    p = _profile()
    if p.get("long_year_marked") or p.get("current_streak", 0) < LONG_YEAR:
        return False
    companion.update(long_year_marked=True)
    return True


def perfect_week(now: datetime | None = None) -> list[dict]:
    """The seven dots (§4.1). Near-miss and goal gradient made visual, and the
    cheapest DAU mechanic in the section to build."""
    now = now or datetime.now()
    cur = today(now)
    p = _profile()
    done = set(p.get("streak_history", []))
    frozen = set(p.get("streak_frozen_days", []))
    week = []
    for i in range(6, -1, -1):
        d = cur - timedelta(days=i)
        iso = _iso(d)
        week.append({
            "date": iso,
            "met": iso in done,
            # A day the streak survived without them. Shown as its own thing, so
            # the calendar never claims they were here when they weren't.
            "frozen": iso in frozen and iso not in done,
            "today": d == cur,
        })
    return week


def status(now: datetime | None = None) -> dict:
    """Everything a surface needs about the streak, in one read."""
    now = now or datetime.now()
    st = state(now)
    p = _profile()
    return {
        "state": st,
        "current": p.get("current_streak", 0),
        "longest": p.get("longest_streak", 0),
        "freezes": p.get("streak_freezes", 0),
        "fragments": p.get("streak_fragments", 0),
        "met_today": _parse(p.get("streak_last_date")) == today(now),
        "repairable": st == "repairable",
        "broken_from": p.get("streak_broken_from", 0),
        "hours_left": round((_next_rollover(now) - now).total_seconds() / 3600, 1),
        "week": perfect_week(now),
        "long_year": p.get("current_streak", 0) >= LONG_YEAR,
    }
