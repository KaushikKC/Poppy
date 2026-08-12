"""When the app shows the first-run setup screen, and when it must not."""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "desktop"))

import preflight
from preflight import Check, Report

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def report(*checks):
    r = Report()
    for c in checks:
        r.add(c)
    return r


# Import the decision without pulling in the GUI at module import time.
import importlib.util
spec = importlib.util.spec_from_file_location("_launcher", ROOT / "desktop" / "launcher.py")
launcher = importlib.util.module_from_spec(spec)
try:
    spec.loader.exec_module(launcher)
except Exception as e:  # webview/GUI import may fail headless; the logic still loads
    print(f"  (launcher imported with warnings: {type(e).__name__})")

MODEL = "Language model (mlx-community/Llama-3.2-3B-Instruct-4bit)"
ESPEAK = "Voice engine (espeak-ng)"
SPEECH = "Speech models cached"

print("\n== everything fine: the setup screen must not appear ==")
r = report(Check(MODEL, True, critical=True), Check(ESPEAK, True, critical=False), Check(SPEECH, True, critical=False))
check("all good -> quiet splash", launcher._needs_setup(r) is False)

print("\n== the reported bug: espeak missing forever ==")
# espeak-ng is a system dependency Poppy does not install, and it is explicitly
# non-critical. It must never force the first-run screen, or it shows every
# single launch and nothing the user does can clear it.
r = report(Check(MODEL, True, critical=True), Check(ESPEAK, False, critical=False), Check(SPEECH, True, critical=False))
check("espeak missing -> still quiet splash", launcher._needs_setup(r) is False)
check("and nothing is downloaded for it", launcher._models_missing(r) is False)

print("\n== genuine first run: models not downloaded ==")
r = report(Check(MODEL, False, critical=True), Check(ESPEAK, True, critical=False), Check(SPEECH, False, critical=False))
check("models missing -> setup screen", launcher._needs_setup(r) is True)
check("and it downloads", launcher._models_missing(r) is True)

print("\n== speech models missing on their own ==")
r = report(Check(MODEL, True, critical=True), Check(ESPEAK, True, critical=False), Check(SPEECH, False, critical=False))
check("speech missing -> setup screen", launcher._needs_setup(r) is True)

print("\n== a critical failure is always shown ==")
r = report(Check(MODEL, False, critical=True), Check(ESPEAK, True, critical=False), Check(SPEECH, True, critical=False))
check("critical failure -> setup screen", launcher._needs_setup(r) is True)

print("\n== both non-critical checks failing still must not trap the user ==")
r = report(Check(MODEL, True, critical=True), Check(ESPEAK, False, critical=False), Check("Something else", False, critical=False))
check("non-critical only -> quiet splash", launcher._needs_setup(r) is False)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
