"""
MVP Validation Script
Run from the backend/ directory while uvicorn and ollama are both running.

  python3 validate.py

Exits 0 if all gates pass, 1 if any fail.
"""

import asyncio
import json
import sys
import time
import httpx
import psutil
import websockets

BACKEND_HTTP = "http://127.0.0.1:8000"
BACKEND_WS   = "ws://127.0.0.1:8000"
OLLAMA_URL   = "http://localhost:11434"
LATENCY_TARGET_MS  = 1500
MEMORY_TARGET_GB   = 11.0
STABILITY_TURNS    = 10

PASS = "\033[32m PASS\033[0m"
FAIL = "\033[31m FAIL\033[0m"
INFO = "\033[36m INFO\033[0m"

results: list[tuple[str, bool]] = []


def gate(name: str, ok: bool, detail: str = "") -> bool:
    tag = PASS if ok else FAIL
    print(f"{tag}  {name}" + (f"  — {detail}" if detail else ""))
    results.append((name, ok))
    return ok


# ── Gate 0: services reachable ────────────────────────────────────────────────

def check_services() -> bool:
    print("\n── Services ─────────────────────────────────────────")
    ok_backend = ok_ollama = False
    try:
        r = httpx.get(f"{BACKEND_HTTP}/health", timeout=3)
        ok_backend = r.status_code == 200
    except Exception as e:
        print(f"       backend error: {e}")
    gate("Backend /health", ok_backend, BACKEND_HTTP)

    try:
        r = httpx.get(f"{OLLAMA_URL}/api/tags", timeout=3)
        ok_ollama = r.status_code == 200
        if ok_ollama:
            models = [m["name"] for m in r.json().get("models", [])]
            print(f"{INFO}  Ollama models: {', '.join(models)}")
    except Exception as e:
        print(f"       ollama error: {e}")
    gate("Ollama running", ok_ollama, OLLAMA_URL)

    return ok_backend and ok_ollama


# ── Gate 1: latency ───────────────────────────────────────────────────────────

async def _single_exchange(text: str) -> tuple[float, float]:
    """Returns (first_audio_ms, total_ms)."""
    t0 = time.perf_counter()
    first_audio = None
    async with websockets.connect(f"{BACKEND_WS}/ws/chat") as ws:
        await ws.send(json.dumps({"type": "chat", "text": text}))
        while True:
            msg = await asyncio.wait_for(ws.recv(), timeout=30)
            if isinstance(msg, bytes) and first_audio is None:
                first_audio = (time.perf_counter() - t0) * 1000
            elif not isinstance(msg, bytes):
                d = json.loads(msg)
                if d.get("type") == "done":
                    break
    total = (time.perf_counter() - t0) * 1000
    return first_audio or total, total


async def check_latency() -> bool:
    print("\n── Latency (3 exchanges, after warmup) ─────────────")
    # Warmup: Whisper and Piper load lazily on first request, skewing turn 1
    print(f"{INFO}  Warming up models (first request loads Whisper + Piper)…")
    try:
        await asyncio.wait_for(_single_exchange("Hi."), timeout=60)
        print(f"{INFO}  Warmup done.")
    except Exception as e:
        print(f"{INFO}  Warmup failed ({e}) — latency may include cold-start penalty")

    prompts = [
        "Say hi in one sentence.",
        "What is two plus two?",
        "Tell me one fun fact in one sentence.",
    ]
    latencies = []
    for i, p in enumerate(prompts, 1):
        try:
            fa, total = await _single_exchange(p)
            latencies.append(fa)
            status = PASS if fa <= LATENCY_TARGET_MS else FAIL
            print(f"{status}  Turn {i}: first-audio {fa:.0f} ms  total {total:.0f} ms")
        except Exception as e:
            print(f"{FAIL}  Turn {i}: error — {e}")
            latencies.append(9999)

    avg = sum(latencies) / len(latencies)
    return gate(
        "Latency ≤1500 ms (avg)",
        avg <= LATENCY_TARGET_MS,
        f"avg {avg:.0f} ms",
    )


# ── Gate 2: stability (10 consecutive turns) ──────────────────────────────────

async def check_stability() -> bool:
    print(f"\n── Stability ({STABILITY_TURNS} consecutive turns) ──────────────")
    passed = 0
    try:
        async with websockets.connect(f"{BACKEND_WS}/ws/chat") as ws:
            for i in range(1, STABILITY_TURNS + 1):
                try:
                    await ws.send(json.dumps({"type": "chat", "text": f"Count to {i}, one number only."}))
                    got_audio = False
                    while True:
                        msg = await asyncio.wait_for(ws.recv(), timeout=30)
                        if isinstance(msg, bytes):
                            got_audio = True
                        elif json.loads(msg).get("type") == "done":
                            break
                    passed += 1
                    print(f"{PASS}  Turn {i:02d}/10  audio={'yes' if got_audio else 'no'}")
                except Exception as e:
                    print(f"{FAIL}  Turn {i:02d}/10  error: {e}")
    except Exception as e:
        print(f"{FAIL}  WebSocket connection failed: {e}")

    return gate(
        f"Stability: {STABILITY_TURNS} turns no crash",
        passed == STABILITY_TURNS,
        f"{passed}/{STABILITY_TURNS} succeeded",
    )


# ── Gate 3: memory ────────────────────────────────────────────────────────────

def check_memory() -> bool:
    print("\n── Memory ───────────────────────────────────────────")
    total_gb = 0.0
    rows = []

    targets = {
        "ollama": "ollama",
        "uvicorn": "uvicorn",
        "python3": "python3",
    }

    seen = set()
    for proc in psutil.process_iter(["pid", "name", "cmdline", "memory_info"]):
        try:
            name = proc.info["name"] or ""
            cmd  = " ".join(proc.info["cmdline"] or [])
            mem  = proc.info["memory_info"]
            if mem is None:
                continue
            rss  = mem.rss / (1024 ** 3)

            for label, keyword in targets.items():
                if keyword in name.lower() or keyword in cmd.lower():
                    if proc.pid not in seen:
                        seen.add(proc.pid)
                        rows.append((label, proc.pid, rss))
                        total_gb += rss
                    break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    for label, pid, gb in sorted(rows, key=lambda x: -x[2]):
        print(f"{INFO}  {label:<12} pid {pid}  {gb:.2f} GB RSS")

    sys_total = psutil.virtual_memory().total / (1024 ** 3)
    sys_used  = psutil.virtual_memory().used  / (1024 ** 3)
    print(f"{INFO}  system RAM total {sys_total:.1f} GB  used {sys_used:.1f} GB")

    return gate(
        f"Memory < {MEMORY_TARGET_GB} GB (tracked processes)",
        total_gb < MEMORY_TARGET_GB,
        f"{total_gb:.2f} GB",
    )


# ── Summary ───────────────────────────────────────────────────────────────────

def summary() -> int:
    print("\n── Summary ──────────────────────────────────────────")
    for name, ok in results:
        print(f"  {'✓' if ok else '✗'}  {name}")
    passed = sum(ok for _, ok in results)
    total  = len(results)
    all_ok = passed == total
    colour = "\033[32m" if all_ok else "\033[31m"
    print(f"\n{colour}  {passed}/{total} gates passed\033[0m")
    if not all_ok:
        print("\n  Remaining manual gate:")
        print("  ✗  Full offline — enable airplane mode and reload http://localhost:8000")
    else:
        print("\n  Remaining manual gate:")
        print("  □  Full offline — enable airplane mode and reload http://localhost:8000")
    return 0 if all_ok else 1


async def _async_main() -> int:
    ok = check_services()
    if not ok:
        print(f"\n\033[31m  Cannot reach backend or Ollama. Start both and retry.\033[0m")
        return 1
    await check_latency()
    await check_stability()
    check_memory()
    return summary()


if __name__ == "__main__":
    sys.exit(asyncio.run(_async_main()))
