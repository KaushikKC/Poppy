"""
Telling the user a new version exists.

Poppy is an offline app that ships as a DMG from a web page, which meant an
update was invisible: nothing told anyone a new version existed, so people kept
running an old build until they happened to revisit the site. This is the
smallest thing that fixes that permanently.

**This is the only network request the app makes**, so it is deliberately
constrained:

  * **Off with one switch**, and the switch is honoured before the request is
    built, not after.
  * **Once a day at most**, cached, so opening the app ten times asks once.
  * **Fails silently.** No error, no banner, no retry storm. An offline app that
    complains about being offline is worse than one that says nothing.
  * **Sends nothing.** It is a plain GET of a public releases endpoint. No
    identifier, no usage, no profile, nothing about the user at all. The answer
    is "what is the newest version", and the question contains no information
    about who is asking.
  * **Never downloads or installs anything.** It shows a line and a link. What
    happens next is the user's decision.
"""

import json
import urllib.request
from datetime import date

import companion
from config import APP_VERSION

# The public releases endpoint for the repo the DMG is published from.
LATEST_URL = "https://api.github.com/repos/KaushikKC/Poppy/releases/latest"
TIMEOUT_S = 4
CHECK_EVERY_DAYS = 1


def _parse_version(text: str) -> tuple:
    """"v1.2.3" -> (1, 2, 3). Unparseable parts become 0 rather than raising, so a
    malformed tag can never break the app or claim a bogus update."""
    cleaned = (text or "").strip().lstrip("vV").split("-")[0].split("+")[0]
    parts = []
    for chunk in cleaned.split(".")[:3]:
        try:
            parts.append(int(chunk))
        except ValueError:
            parts.append(0)
    while len(parts) < 3:
        parts.append(0)
    return tuple(parts)


def is_newer(candidate: str, current: str = APP_VERSION) -> bool:
    return _parse_version(candidate) > _parse_version(current)


def enabled() -> bool:
    return not companion.profile().get("update_check_off")


def set_enabled(on: bool) -> bool:
    companion.update(update_check_off=not on)
    return enabled()


def _cached() -> dict:
    return companion.profile().get("update_seen") or {}


def check(force: bool = False) -> dict:
    """Ask what the newest release is, at most once a day.

    Returns the cached answer without touching the network unless a day has
    passed. Any failure returns "nothing to report", because a version check is
    not worth a single word of the user's attention when it goes wrong.
    """
    current = {"version": APP_VERSION, "available": False, "latest": None, "url": None}
    if not enabled():
        return {**current, "off": True}

    cache = _cached()
    today = date.today().isoformat()
    if not force and cache.get("day") == today:
        return {**current, **{k: cache[k] for k in ("available", "latest", "url") if k in cache}}

    latest = url = None
    try:
        req = urllib.request.Request(
            LATEST_URL,
            headers={"Accept": "application/vnd.github+json", "User-Agent": "Poppys"},
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            data = json.loads(r.read().decode())
        latest = str(data.get("tag_name") or "").strip() or None
        url = str(data.get("html_url") or "").strip() or None
    except Exception:
        # Offline, rate-limited, GitHub down, DNS blocked: all the same answer.
        # Cache the miss for the day so a plane journey doesn't retry every launch.
        companion.update(update_seen={"day": today, "available": False})
        return current

    available = bool(latest and is_newer(latest))
    companion.update(update_seen={
        "day": today, "available": available, "latest": latest, "url": url,
    })
    return {**current, "available": available, "latest": latest, "url": url}


def notice() -> str | None:
    """The one line to show, or None. Deliberately flat: a new version is
    information, not an event."""
    state = check()
    if not state.get("available") or not state.get("latest"):
        return None
    return f"Version {state['latest'].lstrip('vV')} is available."
