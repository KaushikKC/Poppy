"""The version check: the app's only network request."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import companion
import updates
from config import APP_VERSION

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def reset():
    companion._PATH.unlink(missing_ok=True)
    companion.create("poppy")


print("\n== comparing versions ==")
# Derived from APP_VERSION rather than hardcoded. Hardcoding broke this suite on
# the version bump, which was the test's fault, not the code's.
maj, mino, pat = (int(x) for x in APP_VERSION.split(".")[:3])
cases = [
    (f"v{maj}.{mino}.{pat + 1}", True),
    (f"v{maj}.{mino + 1}.0", True),
    (f"v{maj + 1}.0.0", True),
    (f"{maj}.{mino + 1}.0", True),
    (f"v{APP_VERSION}", False),
    (APP_VERSION, False),
    ("v0.0.1", False),
]
if pat > 0:
    cases.append((f"v{maj}.{mino}.{pat - 1}", False))
if mino > 0:
    cases.append((f"v{maj}.{mino - 1}.99", False))
for tag, newer in cases:
    check(f"{tag:10s} newer than {APP_VERSION}: {newer}",
          updates.is_newer(tag) is newer, f"got {updates.is_newer(tag)}")

print("\n== a malformed tag can never claim an update ==")
for tag in ("banana", "", "v", "...", "v1.x.y", None):
    check(f"{str(tag):10s} -> not newer", updates.is_newer(tag or "") is False)

print("\n== the switch is honoured before any request is built ==")
reset()
check("on by default", updates.enabled() is True)
updates.set_enabled(False)
check("switch takes effect", updates.enabled() is False)
state = updates.check()
check("reports itself as off", state.get("off") is True, str(state))
check("nothing is claimed while off", state["available"] is False)
check("no notice while off", updates.notice() is None)
updates.set_enabled(True)
check("can be turned back on", updates.enabled() is True)

print("\n== a failed check says nothing at all ==")
reset()
real = updates.urllib.request.urlopen


def boom(*a, **k):
    raise OSError("no network")


updates.urllib.request.urlopen = boom
try:
    state = updates.check(force=True)
    check("offline reports no update", state["available"] is False, str(state))
    check("offline shows no notice", updates.notice() is None)
    check("no error surfaces to the caller", "error" not in state)
finally:
    updates.urllib.request.urlopen = real

print("\n== a newer release produces one flat line ==")
reset()


class FakeResp:
    def __init__(self, body):
        self._b = body.encode()
    def read(self):
        return self._b
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False


updates.urllib.request.urlopen = lambda *a, **k: FakeResp(
    '{"tag_name": "v1.4.0", "html_url": "https://example.invalid/releases/v1.4.0"}'
)
try:
    state = updates.check(force=True)
    check("sees the newer release", state["available"] is True, str(state))
    check("carries a link", state["url"].endswith("v1.4.0"), str(state.get("url")))
    note = updates.notice()
    print("   notice:", note)
    check("one flat sentence", note == "Version 1.4.0 is available.", repr(note))
    check("no urgency", not any(w in (note or "") for w in ("!", "now", "must", "expire")))

    print("\n== and it only asks once a day ==")
    calls = {"n": 0}
    def counting(*a, **k):
        calls["n"] += 1
        return FakeResp('{"tag_name": "v1.4.0", "html_url": "https://example.invalid/x"}')
    updates.urllib.request.urlopen = counting
    for _ in range(5):
        updates.check()
    check("five reads, zero extra requests", calls["n"] == 0, str(calls["n"]))
    updates.check(force=True)
    check("force still works", calls["n"] == 1, str(calls["n"]))
finally:
    updates.urllib.request.urlopen = real

print("\n== an older or equal release is not an update ==")
reset()
updates.urllib.request.urlopen = lambda *a, **k: FakeResp(
    '{"tag_name": "v1.0.0", "html_url": "https://example.invalid/old"}'
)
try:
    check("older release is ignored", updates.check(force=True)["available"] is False)
    check("and shows nothing", updates.notice() is None)
finally:
    updates.urllib.request.urlopen = real

print("\n== the request carries nothing about the user ==")
src = pathlib.Path(updates.__file__).read_text()
for leak in ("profile", "memory", "streak", "companion_name", "transcript", "uuid", "referral"):
    check(f"never sends {leak}", f'"{leak}"' not in src.split("def check(")[1].split("def notice")[0])
check("it is a plain GET", "data=" not in src and "POST" not in src)

print("\n== the bundle and the app agree on the version ==")
spec = pathlib.Path(__file__).resolve().parent.parent / "desktop" / "poppys.spec"
text = spec.read_text()
check("spec reads the version from config", "APP_VERSION" in text)
check("spec no longer hardcodes 1.0.0", '"1.0.0"' not in text)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
