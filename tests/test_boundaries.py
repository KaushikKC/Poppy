"""What she's told never to raise, and what to always ask about."""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

import boundaries
import companion
import loops

ok = True


def check(label, cond, extra=""):
    global ok
    print(("  PASS  " if cond else "  FAIL  ") + label + (f"  {extra}" if extra else ""))
    if not cond:
        ok = False


def reset():
    companion._PATH.unlink(missing_ok=True)
    loops._PATH.unlink(missing_ok=True)
    companion.create("poppy")


print("\n== reading a rule the user says out loud ==")
reset()
for said, kind, topic in (
    ("don't ask me about my dad", "avoid", "dad"),
    ("please never bring up the divorce", "avoid", "divorce"),
    ("stop asking about my job", "avoid", "job"),
    ("I don't want to talk about the interview", "avoid", "interview"),
    ("let's not talk about money", "avoid", "money"),
    ("never mention my ex again", "avoid", "ex again"),
    ("always ask about my sister", "always", "sister"),
    ("keep asking me about the marathon", "always", "marathon"),
    ("make sure you ask about my mum", "always", "mum"),
    ("don't forget to ask about the flat", "always", "flat"),
):
    got = boundaries.parse(said)
    good = got and got["kind"] == kind and got["topic"].lower().startswith(topic.split()[0])
    check(f"{said[:42]:44s} -> {kind}", good, "" if good else str(got))

print("\n== ordinary conversation sets no rules ==")
for said in ("work was rough today", "I talked to my dad yesterday",
             "she asked about the interview", "I always ask him first",
             "don't worry about it", "my sister is visiting"):
    got = boundaries.parse(said)
    check(f"ignores: {said[:40]}", got is None, str(got))

print("\n== a rule about 'it' is not a rule we can keep ==")
for said in ("don't ask me about it", "never bring up that", "stop asking about stuff"):
    check(f"refuses: {said[:38]}", boundaries.parse(said) is None, str(boundaries.parse(said)))

print("\n== storing, undoing, and changing your mind ==")
reset()
boundaries.add("avoid", "my dad")
check("stored", boundaries.get()["avoid"] == ["dad"], str(boundaries.get()))
boundaries.add("avoid", "dad")
check("no duplicates", boundaries.get()["avoid"] == ["dad"], str(boundaries.get()))
boundaries.add("always", "dad")
check("moving it to the other list removes it from the first",
      boundaries.get() == {"avoid": [], "always": ["dad"]}, str(boundaries.get()))
boundaries.remove("always", "dad")
check("removable", boundaries.get()["always"] == [], str(boundaries.get()))

reset()
for i in range(20):
    boundaries.add("avoid", f"topic{i}")
check("capped", len(boundaries.get()["avoid"]) == boundaries.MAX_TOPICS,
      str(len(boundaries.get()["avoid"])))

print("\n== a boundary blocks the subject, not the whole language ==")
reset()
boundaries.add("avoid", "the divorce")
check("blocks the subject", boundaries.is_blocked("how did the divorce hearing go?"))
check("blocks it inside a longer hook", boundaries.is_blocked("tell me what happened with the divorce"))
check("leaves everything else alone", not boundaries.is_blocked("how did the interview go?"))
check("empty text is fine", not boundaries.is_blocked(""))
reset()
check("no rules means nothing is blocked", not boundaries.is_blocked("anything at all"))

print("\n== the rules reach her prompt as absolutes ==")
reset()
check("nothing to say when there are no rules", boundaries.as_prompt_block() == "")
boundaries.add("avoid", "my dad")
block = boundaries.as_prompt_block()
print("   ", block.strip()[:110])
check("tells her never to raise it", "NEVER raise" in block)
check("names the subject", "dad" in block)
check("but lets the user raise it themselves", "follow their lead" in block)
boundaries.add("always", "the marathon")
block = boundaries.as_prompt_block()
check("carries both lists", "dad" in block and "marathon" in block)
check("no em dash", "—" not in block)

print("\n== enforced beyond the prompt ==")
reset()
boundaries.add("avoid", "the divorce")
import asyncio
import llm
import loop_author

# Drive the real author() with a stubbed model, so the guard is exercised rather
# than assumed. A prompt is advice a small model can ignore; this is the refusal.
async def _author_with(topic):
    async def fake(user_text, system_prompt, max_tokens=200):
        return '{"topic": "%s"}' % topic
    real, llm.complete = llm.complete, fake
    try:
        return await loop_author.author([
            {"role": "user", "content": "we finally filed the divorce papers and the marathon is soon"},
        ])
    finally:
        llm.complete = real

blocked = asyncio.run(_author_with("the divorce papers"))
check("a hook about a forbidden subject is refused",
      blocked["type"] == "reveal", str(blocked))
allowed = asyncio.run(_author_with("the marathon"))
check("an allowed subject still gets a real hook",
      allowed["type"] != "reveal" and "marathon" in allowed["hook"], str(allowed))

import memory_extract
cands = memory_extract._dedupe([
    {"text": "Going through a divorce", "category": "ongoing", "why": ""},
    {"text": "Training for a marathon", "category": "goals", "why": ""},
])
kept = [c["text"] for c in cands]
check("nothing about it is proposed for memory", "Going through a divorce" not in kept, str(kept))
check("everything else still is", "Training for a marathon" in kept, str(kept))

print("\n== the memory block is where it is really enforced ==")
reset()
import memory_store
memory_store.forget_all()
for txt, cat in (("Dad has been unwell since March", "people"),
                 ("Training for a half marathon", "goals"),
                 ("Name: Nina", "profile")):
    memory_store.remember(txt, cat)
check("all facts reach her prompt normally",
      any("Dad" in f for f in memory_store.relevant("heavy weekend")))

boundaries.add("avoid", "dad")
reaching = memory_store.relevant("heavy weekend")
check("the forbidden fact is withheld from her prompt",
      not any("dad" in f.lower() for f in reaching), str(reaching))
check("everything else still reaches her",
      any("marathon" in f for f in reaching), str(reaching))
check("it is withheld, NOT deleted", len(memory_store.records()) == 3,
      str(len(memory_store.records())))

boundaries.remove("avoid", "dad")
check("lifting the rule brings it back",
      any("Dad" in f for f in memory_store.relevant("heavy weekend")))

print("\n== a rule set mid-call is picked up ==")
reset()
turns = [
    {"role": "user", "content": "work was fine"},
    {"role": "assistant", "content": "Good to hear."},
    {"role": "user", "content": "and please don't ask me about my dad"},
    {"role": "assistant", "content": "Understood."},
    {"role": "user", "content": "but always ask about my sister"},
]
found = boundaries.parse_from_turns(turns)
check("both rules found", len(found) == 2, str(found))
check("correct kinds", {f["kind"] for f in found} == {"avoid", "always"}, str(found))
check("her own words are never read as rules",
      boundaries.parse_from_turns([{"role": "assistant", "content": "don't ask me about my dad"}]) == [])

print("\n== counts only, never the text ==")
reset()
boundaries.add("avoid", "something private")
c = boundaries.counts()
check("counts are numbers", isinstance(c["avoid"], int) and c["avoid"] == 1, str(c))
check("no text in the counts", "private" not in str(c), str(c))

print("\n== a rule buried mid-sentence is still heard ==")
reset()
real = ("And also I'm feeling lonely over here because I'm missing my family. "
        "I'm alone in UK. I'm from India. So while preparing all these things, "
        "I'm feeling lonely. And also main thing is don't ask. Don't ask about "
        "my dad. Don't talk about my dad. Yeah, I'm missing my family.")
got = boundaries.parse(real)
check("found inside a long spoken paragraph", got and got["topic"] == "dad", str(got))
check("it is an avoid rule", got and got["kind"] == "avoid", str(got))

print("\n" + ("ALL PASS" if ok else "FAILURES ABOVE"))
sys.exit(0 if ok else 1)
