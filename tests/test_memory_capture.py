"""Memory capture: what she keeps from what you say."""
import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import boundaries
import companion
import memory_extract as me
import memory_store

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


companion._PATH.unlink(missing_ok=True)
companion.create("poppy")

print("\n== a real disclosure is never lost ==")
# The model is inconsistent on this task, so the guarantee cannot depend on it.
# Whatever the model does, something substantive must survive.
for said in ("my sister Anjali is visiting this weekend",
             "dad is unwell and I am worried",
             "I am moving to Manchester in October",
             "work has been really hard since the reorg"):
    got = asyncio.run(me.propose(said))
    check(f"kept: {said[:40]}", bool(got), str(got))

print("\n== filler and questions are still ignored ==")
for said in ("yeah", "okay thanks", "nothing much", "hi", "no", "cool"):
    check(f"ignored: {said}", not me._worth_keeping(said))
for said in ("how are you doing?", "what do you think?", "did you sleep well?",
             "can you remember what I told you?"):
    check(f"ignored question: {said[:30]}", not me._worth_keeping(said))

print("\n== the fallback keeps the sentence readable ==")
check("capitalised", me._as_fact("my sister is visiting").startswith("My"))
check("trailing punctuation trimmed", not me._as_fact("I am tired.").endswith("."))
check("whitespace collapsed", "  " not in me._as_fact("I   am    tired today"))
check("length capped", len(me._as_fact("x " * 200)) <= 140)

print("\n== a forbidden subject is never captured, by any path ==")
boundaries.add("avoid", "dad")
got = asyncio.run(me.propose("dad is unwell and I visited him at the hospital"))
check("not captured even by the fallback", got == [], str(got))
got = asyncio.run(me.propose("I am moving to Manchester in October"))
check("everything else still is", bool(got), str(got))

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
