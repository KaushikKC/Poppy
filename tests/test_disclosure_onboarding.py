"""Sprint 1 items 11-12: reciprocal disclosure + endowed-progress onboarding."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import companion
import disclosure
import loops
import memory_store
import personas

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


print("\n== 11. disclosure ladder deepens with the relationship ==")
seen = []
for calls in (0, 1, 2, 3, 6, 7, 14, 15, 60):
    d = disclosure.depth(calls)
    seen.append(d)
    print(f"   {calls:3d} calls -> rung {d}")
check("starts at rung 0", disclosure.depth(0) == 0)
check("rung 1 at call 3", disclosure.depth(3) == 3)
check("rung 2 at call 7", disclosure.depth(7) == 7)
check("deep rung capped by default", disclosure.depth(15) == 7)
check("monotonic", seen == sorted(seen))
check("tops out at the safe rung", disclosure.depth(10_000) == 7)
check("deep rung is written but disabled", disclosure.DEEP_READ_ENABLED is False)
check("deep rung needs memories even if enabled",
      disclosure._READ_NEEDS_MEMORIES > 0)

print("\n== every rung carries the honesty floor (nothing invented) ==")
for calls in (0, 3, 7, 15):  # 15 falls back to the safe rung
    block = disclosure.as_prompt_block(calls)
    check(f"call {calls}: has honesty floor", "Never invent a life" in block)
    check(f"call {calls}: forbids fabricated memories", "fabricated memories" in block)
    check(f"call {calls}: says go first or lead",
          any(w in block.lower() for w in ("go first", "before you ask", "before asking", "lead with")),
          block[:70])
print("   rung 0:", disclosure.as_prompt_block(0)[:120].replace("\n", " "))
print("   rung 2:", disclosure.as_prompt_block(7)[:120].replace("\n", " "))

print("\n== the personality change is announced, not slipped in (§3.6) ==")
check("version bumped past 2", personas.PERSONALITY_VERSION > 2, str(personas.PERSONALITY_VERSION))

print("\n== 12. onboarding never ends at zero ==")
check("closeness is New before onboarding", companion.closeness()["stage"] == 0)
check("no memories yet", memory_store.records() == [])
check("no loop yet", companion.open_loop() is None)

companion.create("poppy", seed="work has been really rough lately")

c = companion.closeness()
print("   closeness:", c)
check("closeness starts at stage 1, not 0", c["stage"] == 1)
check("stage label is not 'New'", c["label"] != "New")

facts = memory_store.recall()
print("   memory   :", facts)
check("the seed became a real memory", any("work has been really rough" in f for f in facts))

loop = companion.open_loop()
print("   loop     :", loop and loop["hook_text"])
check("a first loop was planted", loop is not None)
check("loop is in her voice, not a quote",
      loop and loop["hook_text"].startswith("when we first talked you mentioned"))
check("loop is weaker than an authored hook", loop["strength"] < 0.6)

print("\n== an authored hook takes the visible slot from the seed loop ==")
authored = companion.add_open_loop("how did the review turn out?", "event")
check("authored hook outranks the seed loop", companion.open_loop()["id"] == authored["id"])

print("\n== skipping the seed fabricates nothing ==")
import shutil, tempfile, os, importlib
tmp = tempfile.mkdtemp()
os.environ["POPPY_DATA_DIR"] = tmp
for m in ("paths", "companion", "loops", "memory_store"):
    importlib.reload(sys.modules[m])
import companion as c2
import memory_store as m2
import loops as l2
c2.create("poppy", seed="")
check("no invented memory", m2.records() == [])
check("no invented loop", l2.top() is None)
check("closeness still starts at 1", c2.closeness()["stage"] == 1)
shutil.rmtree(tmp, ignore_errors=True)

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
