"""Live: does she actually raise the pact in her own words, and does the spoken
answer become the ritual?"""
import asyncio
import json
import sys
import urllib.request

import websockets

BASE = "http://127.0.0.1:8078"
WS = "ws://127.0.0.1:8078/ws/chat"
ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path).read())


async def say(lines):
    """Returns her replies, so we can see whether she raised the pact."""
    said = []
    async with websockets.connect(WS, max_size=None) as ws:
        for line in lines:
            await ws.send(json.dumps({"type": "chat", "text": line}))
            buf = []
            while True:
                raw = await ws.recv()
                if not isinstance(raw, str):
                    continue
                m = json.loads(raw)
                if m.get("type") == "token":
                    buf.append(m.get("text", ""))
                if m.get("type") in ("done", "error"):
                    break
            said.append("".join(buf).strip())
    return said


async def main():
    post("/companion", {"character": "poppy", "seed": "work has been rough"})
    post("/entitlement", {"plan": "plus"})  # keep the free daily cap out of the way

    print("\n== call 1: too early for the pact ==")
    post("/call/open", {"source": "user"})
    await say(["hey, just checking in today"])
    r = post("/call/close", {"duration_s": 120})
    check("no ritual set on call 1", r.get("ritual") is None)
    check("ritual still unset", get("/home").get("ritual_kind") is None)

    print("\n== call 2: she should raise it, and the answer should stick ==")
    post("/call/open", {"source": "user"})
    replies = await say([
        "work was better today actually",
        "yeah I think I'm getting on top of it",
        "before bed is best for me, say around 10pm",   # answered only after she asks
    ])
    for i, rep in enumerate(replies, 1):
        print(f"   her {i}: {rep}")
    import re
    # Strict: a real pact ask names the anchor choice or "expect you", as a question.
    ASK = re.compile(r"(expect (?:you|to hear from you)"
                     r"|after work.{0,60}(?:before (?:you )?(?:sleep|bed))"
                     r"|before (?:you )?(?:sleep|bed).{0,60}after work"
                     r"|what time.{0,50}(?:each day|every day|expect|check in))", re.I)
    asked = any(ASK.search(r) and "?" in r for r in replies)
    check("she raised the pact in her own words", asked)

    r = post("/call/close", {"duration_s": 300})
    print("   ritual returned:", r.get("ritual"))
    check("ritual came back from close", bool(r.get("ritual")))
    if r.get("ritual"):
        check("parsed as night", r["ritual"]["kind"] == "night", str(r["ritual"]))
        check("parsed the time", r["ritual"]["time"] == "22:00", str(r["ritual"]))
        check("confirm copy present", bool(r["ritual"].get("confirm")), r["ritual"].get("confirm"))

    home = get("/home")
    check("ritual persisted to the profile", home.get("ritual_kind") == "night", str(home.get("ritual_kind")))
    check("ritual time persisted", home.get("ritual_time") == "22:00", str(home.get("ritual_time")))

    print("\n== call 3: she must not raise it again ==")
    post("/call/open", {"source": "user"})
    replies = await say(["hey again"])
    print(f"   her: {replies[0][:180]}")
    asked_again = any(w in replies[0].lower() for w in ("expect you", "what time", "before you sleep"))
    check("pact not raised once it's set", not asked_again)
    post("/call/close", {"duration_s": 90})

    m = get("/metrics")
    check("ritual_set recorded", m.get("ritual_set") is True)

    print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
    return 0 if ok else 1


sys.exit(asyncio.run(main()))
