#!/usr/bin/env python3
"""Measure REAL per-call time for the voice + avatar servers on this box.

This prints no guessed prices. It measures the one thing only the hardware can tell
you: how many seconds a voice synth and an avatar render actually take here. Combine
that with AWS's own $/hr (shown at launch and in the bill) to get true cost, and
confirm the dollars in Cost Explorer after the run.

    # on the box, with voice_server (8600) and/or avatar_server (8601) running:
    python bench.py                                  # times both, 5 calls each
    python bench.py --n 20 --speaker af_heart
    python bench.py --voice-url http://127.0.0.1:8600 --avatar-url http://127.0.0.1:8601
    python bench.py --rate 0.526                      # also print calls-per-hour and
                                                       # $/call using YOUR real rate

Watch GPU use in another shell while it runs:  nvidia-smi dmon
"""

import argparse
import json
import statistics
import time
import urllib.request

LINES = [
    "Hey, I'm really glad you called. How has your day been going so far?",
    "That sounds really heavy. I'm right here, take your time, tell me everything.",
    "Arre, don't worry so much, sab theek ho jayega. I believe in you, okay?",
    "Okay, let's make a tiny plan. What is the one thing you want to get done today?",
    "I remember you had that meeting. How did it actually go in the end?",
]


def _post(url: str, payload: dict, timeout: float) -> tuple[float, int]:
    body = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=body, method="POST",
                                 headers={"Content-Type": "application/json"})
    t = time.perf_counter()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return time.perf_counter() - t, len(data)


def _health(base: str) -> bool:
    try:
        with urllib.request.urlopen(f"{base}/health", timeout=5) as r:
            json.loads(r.read())
        return True
    except Exception as e:
        print(f"  [skip] {base} not reachable: {e}")
        return False


def _run(name: str, url: str, speaker: str, n: int, timeout: float, rate: float | None):
    times, kb = [], []
    print(f"\n== {name} ({url}) — {n} calls ==")
    for i in range(n):
        line = LINES[i % len(LINES)]
        try:
            dt, size = _post(url, {"text": line, "speaker": speaker}, timeout)
        except Exception as e:
            print(f"  call {i+1:2d}  FAILED: {e}")
            continue
        times.append(dt); kb.append(size / 1024)
        tag = "  (first call = cold model load)" if i == 0 else ""
        print(f"  call {i+1:2d}  {dt:6.2f}s   {size/1024:7.1f} KB{tag}")
    if not times:
        print("  no successful calls."); return
    warm = times[1:] or times            # drop the cold first call from the summary
    med = statistics.median(warm)
    print(f"  warm: min {min(warm):.2f}s  median {med:.2f}s  max {max(warm):.2f}s"
          f"   (cold first: {times[0]:.2f}s)")
    if med > 0:
        print(f"  throughput: ~{3600/med:.0f} calls per running-hour (median, sequential)")
        if rate:
            print(f"  at YOUR rate ${rate:.3f}/hr -> ${rate*med/3600:.5f} per call"
                  f"  (${rate/(3600/med):.5f})")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice-url", default="http://127.0.0.1:8600")
    ap.add_argument("--avatar-url", default="http://127.0.0.1:8601")
    ap.add_argument("--speaker", default="af_heart")
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--rate", type=float, default=None,
                    help="YOUR real $/hr from AWS, to also print $/call (optional)")
    ap.add_argument("--voice-timeout", type=float, default=60)
    ap.add_argument("--avatar-timeout", type=float, default=180)
    a = ap.parse_args()

    print("Measuring real per-call time on THIS box. Prices are yours from AWS, not "
          "guessed here.")
    if _health(a.voice_url):
        _run("VOICE  (Chatterbox)", f"{a.voice_url}/tts", a.speaker, a.n,
             a.voice_timeout, a.rate)
    if _health(a.avatar_url):
        _run("AVATAR (MuseTalk)", f"{a.avatar_url}/avatar", a.speaker, a.n,
             a.avatar_timeout, a.rate)

    print("\nNow the REAL dollars: stop the box, then AWS Console -> Billing -> Cost "
          "Explorer (group by Usage Type / hourly) shows exactly what this run cost, "
          "and Billing -> Credits shows credits used. That is the proof.")


if __name__ == "__main__":
    main()
