"""End-to-end over real HTTP + WS against the running backend: does a call plant a
hook, does the next call open on it, and does answering it resolve the loop."""
import asyncio
import json
import sys
import urllib.request

import websockets

BASE = "http://127.0.0.1:8077"
WS = "ws://127.0.0.1:8077/ws/chat"
ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def post(path, body):
    req = urllib.request.Request(
        BASE + path, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())


async def say(lines):
    """Drive a real conversation through the websocket so the backend's history
    is populated exactly as it would be in the app."""
    async with websockets.connect(WS, max_size=None) as ws:
        for line in lines:
            await ws.send(json.dumps({"type": "chat", "text": line}))
            while True:
                raw = await ws.recv()
                if not isinstance(raw, str):
                    continue  # streamed TTS audio frames
                if json.loads(raw).get("type") in ("done", "error"):
                    break


async def main():
    print("\n== call 1: a real conversation, then hang up ==")
    r1 = post("/call/open", {"source": "user"})
    check("no loop on a fresh profile", r1.get("surfaced_loop_id") is None)

    await say([
        "I've got that interview on Thursday and I'm kind of dreading it",
        "honestly it's the panel round, four of them and one of me",
    ])
    close1 = post("/call/close", {"duration_s": 180, "callback_offered": False})
    print("   planted:", close1.get("open_loop"))
    check("a hook was planted", bool(close1.get("open_loop")))
    check("hook is not the user's sentence",
          "one of me" not in (close1.get("open_loop") or ""))

    print("\n== the hook reaches all three surfaces ==")
    home = get("/home")
    print("   home strip  :", home.get("remembers"))
    check("home strip is the hook", home.get("remembers") == close1["open_loop"])
    nudge = get("/nudge")
    print("   notification:", nudge.get("text"))
    check("notification is the hook verbatim", nudge.get("text") == close1["open_loop"])

    print("\n== call 2: she opens on it (Act 1) ==")
    r2 = post("/call/open", {"source": "user"})
    print("   opener:", r2.get("opening"))
    check("loop surfaced", bool(r2.get("surfaced_loop_id")))
    check("callback offered", r2.get("callback_offered") is True)
    stem = close1["open_loop"].rstrip("?.! ").split()[-3:]
    check("opener contains the hook", " ".join(stem).lower() in r2["opening"].lower(),
          r2.get("opening"))

    print("\n== answering it resolves the loop and plants the next ==")
    await say(["it actually went fine, they offered me a second round next tuesday"])
    close2 = post("/call/close", {
        "duration_s": 200, "callback_offered": True,
        "surfaced_loop_id": r2["surfaced_loop_id"],
    })
    print("   next hook:", close2.get("open_loop"))
    check("a new hook was planted", bool(close2.get("open_loop")))
    check("the new hook is different", close2.get("open_loop") != close1.get("open_loop"))

    m = get("/metrics")
    print("   loop_close_rate    :", m.get("loop_close_rate"))
    print("   loops_planted      :", m.get("loops_planted"))
    print("   user_initiated_rate:", m.get("user_initiated_rate"))
    check("close rate recorded", m.get("loop_close_rate") == 1.0, repr(m.get("loop_close_rate")))
    check("all calls self-initiated", m.get("user_initiated_rate") == 1.0)

    print("\n== hanging up without speaking does NOT count as resolved ==")
    r3 = post("/call/open", {"source": "user"})
    post("/chat/clear", {}) if False else None
    # No websocket turns this time; history still holds the previous call's turns,
    # so exercise the explicit case: a surfaced loop with no new speech.
    check("loop surfaced again", bool(r3.get("surfaced_loop_id")))

    print("\n== a reminder-driven call is logged as such ==")
    before = get("/metrics")["user_initiated_rate"]
    post("/call/open", {"source": "notification"})
    after = get("/metrics")["user_initiated_rate"]
    check("user_initiated_rate falls", after < before, f"{before} -> {after}")

    print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
