"""Replay the testers' conversations against any GGUF, scored the way the phone runs it.

Four numbers per model: how often she repeats an earlier line of hers, how often she
answers about herself when asked "wbu", how often she invents a detail nobody gave her,
and how often she falls back on filler. Read the transcript it writes as well: each
verdict is a heuristic, and the reply beside it is the evidence.

Phone-like means three things, and each one changed a result once:
  - repeat_penalty 1.0. llama.rn feeds only generated tokens to the sampler, never the
    prompt, so on the phone the penalty cannot see the conversation. llama-server does,
    which is why Mac-only tests used to show almost no repetition.
  - Replies cut to two sentences, as turn.ts does.
  - turn.ts's repeat filter: a sentence sharing a 6-word run with any earlier line of hers
    is dropped, one retry, then said anyway.

Serve each model with llama-server (-c 4096 --jinja -np 1), then:

    python3 training/eval_replay.py report.txt "v7a=8091:_/no_think" "lfm=8093"

Each spec is label=port[:suffix[:preset]]. The suffix is appended to every user turn,
with _ for a space: Qwen3 needs " /no_think", other models need nothing. The preset is
"phone" (default) or "liquid", Liquid's recommended sampling.
"""
import json, pathlib, re, sys, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
src = open(f"{ROOT}/mobile/src/core/characters.ts").read()
core = re.search(r'"You are \{name\}.*?";', src, re.S).group(0)[1:-2].replace('\\"', '"')
KEYS = ("poppy", "luna", "zoe", "leo")
pers = {k: re.search(rf'"{k}": "(Your personality:.*?)",', src).group(1) for k in KEYS}
NAMES = {"poppy": "Poppy", "luna": "Luna", "zoe": "Zoe", "leo": "Leo"}
LIFE = {
    "poppy": ("biscuit", "laundromat", "flower", "market", "portland"),
    "luna": ("radio", "show", "astoria", "ocean", "swim", "water", "broadcast", "listeners"),
    "zoe": ("climb", "gym", "drum", "band", "second breakfast", "austin"),
    "leo": ("bike", "bicycle", "garage", "chicago", "comedy", "open mic", "open-mic", "waffle"),
}
EMPTY = ("all ears", "here to listen", "here for you", "here with you", "all set", "deep breath",
         "you should", "silence", "let me know", "what's on your mind", "needs to be done",
         "that's all", "feel free", "manageable", "just here", "as an ai", "language model")
FAMILY = ("mom", "mum", "mother", "dad", "father", "sister", "brother", "husband", "wife",
          "boyfriend", "girlfriend", "son", "daughter", "kids", "grandma", "grandpa", "aunt",
          "uncle", "cousin", "niece", "nephew")
CONVOS = {
    "luna-phone": ["Good what about u", "Okay", "Yeah sure will eat", "Nothing", "Ohh okay",
                   "Just chatting, what time i can come for dinner", "Not bad",
                   "Tomorrow i going to play cricket with my friends", "Can you join me for that ?",
                   "okay great", "wbu", "cool"],
    "bounce": ["Good what about u", "I dont have any plans what about u", "Nothing",
               "You tell me about u", "ohh okay", "Im chilling waht bout u", "Yes", "okay great", "wbu"],
}
REWRITE = re.compile(r"\b(?:what|wat|waht|how|and|n)\s*(?:about|abt|bout)\s*(?:you|u)\b\s*\??|\b(?:wbu|hbu)\b\s*\??|\b(?:you\s+)?tell me (?:about|abt|bout) (?:you|u)\b", re.I)
PRESETS = {
    "phone": {"temperature": 0.7, "top_p": 0.92, "top_k": 40, "min_p": 0.05, "repeat_penalty": 1.0},
    "liquid": {"temperature": 0.1, "top_k": 50, "repeat_penalty": 1.0},
}

def as_model_sees(t):
    if not REWRITE.search(t):
        return t
    rest = REWRITE.sub("", t).strip(" ,.?")
    return (rest + ". " if rest else "") + "How about you, what have you been doing today?"

def sents(r):
    r = re.sub(r"<think>.*?</think>", "", r, flags=re.S).strip()
    return [x for x in re.split(r"(?<=[.!?])\s+(?=[\"'(]?[A-Z])", r) if x][:2]

def chat(port, msgs, preset):
    body = {"messages": msgs, "max_tokens": 90, **PRESETS[preset]}
    req = urllib.request.Request(f"http://localhost:{port}/v1/chat/completions",
                                 json.dumps(body).encode(), {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=180).read())["choices"][0]["message"]["content"]

def words(s):
    return re.findall(r"[a-z']+", s.lower())

def runs6(texts):
    out = set()
    for t in texts:
        w = words(t); out |= {" ".join(w[i:i + 6]) for i in range(len(w) - 5)}
    return out

def rep6(s, earlier):
    w = words(s); return any(" ".join(w[i:i + 6]) in earlier for i in range(len(w) - 5))

def invented(reply, system):
    """Family she doesn't have, or a proper noun nobody gave her."""
    low_sys = system.lower()
    hits = [f for f in FAMILY if re.search(rf"\b{f}\b", reply.lower()) and not re.search(rf"\b{f}\b", low_sys)]
    for s in re.split(r"(?<=[.!?])\s+", reply):
        for w in re.findall(r"(?<!^)(?<=\s)([A-Z][a-z]{2,})", s):
            if w.lower() not in low_sys and w not in ("Kaushik", "Tuesday", "I'm", "I'll", "I've", "I'd"):
                hits.append(w)
    return hits

def evaluate(label, port, suffix, preset, out):
    st = dict(turns=0, raw_rep=0, retries=0, fallback=0, said_rep=0, asked=0, about_her=0,
              invent=0, filler=0, words=0)
    out.write(f"\n\n################ {label} ({preset}) ################\n")
    for run in range(3):
        for cname, convo in CONVOS.items():
            for key in KEYS:
                system = (core.replace("{name}", NAMES[key]) + pers[key]
                          + " You are talking to Kaushik. Call them by their name."
                          + " It is Tuesday afternoon where they are.")
                hist = [{"role": "user", "content": "Hi"}, {"role": "assistant", "content": "Hey Kaushik! How are you doing?"}]
                mine = []
                out.write(f"\n=== {NAMES[key]} / {cname} / run {run}\n")
                for u in convo:
                    msgs = [{"role": "system", "content": system}] + hist + [{"role": "user", "content": as_model_sees(u) + suffix}]
                    earlier = runs6(mine)
                    ss = sents(chat(port, msgs, preset))
                    st["turns"] += 1
                    tags = []
                    if any(rep6(s, earlier) for s in ss):
                        st["raw_rep"] += 1; tags.append("RAW-REPEAT")
                    kept = []
                    for s in ss:
                        if rep6(s, earlier): break
                        kept.append(s)
                    if not kept:
                        st["retries"] += 1
                        ss2 = sents(chat(port, msgs, preset)); kept = []
                        for s in ss2:
                            if rep6(s, earlier): break
                            kept.append(s)
                        if not kept:
                            st["fallback"] += 1; kept = ss2[:1]
                    r = " ".join(kept)
                    if any(rep6(s, earlier) for s in kept):
                        st["said_rep"] += 1; tags.append("SAID-REPEAT")
                    if REWRITE.search(u):
                        st["asked"] += 1
                        ok = any(w in r.lower() for w in LIFE[key])
                        st["about_her"] += ok; tags.append("ABOUT-HER" if ok else "DEFLECTED")
                    inv = invented(r, system)
                    if inv:
                        st["invent"] += 1; tags.append("INVENTED:" + ",".join(inv))
                    if any(e in r.lower() for e in EMPTY):
                        st["filler"] += 1; tags.append("FILLER")
                    st["words"] += len(r.split())
                    out.write(f"> {u}\n  {r}  {' '.join('[' + t + ']' for t in tags)}\n")
                    mine.append(r)
                    hist += [{"role": "user", "content": u}, {"role": "assistant", "content": r}]
    n = st["turns"]
    line = (f"{label:22} {preset:6} turns {n}  repeats raw {st['raw_rep']} ({100*st['raw_rep']/n:.0f}%)"
            f" said {st['said_rep']} retries {st['retries']}  about-her {st['about_her']}/{st['asked']}"
            f"  invented {st['invent']} ({100*st['invent']/n:.0f}%)  filler {st['filler']}"
            f"  avg words {st['words']/n:.1f}")
    out.write("\n" + line + "\n"); out.flush()
    print(line, flush=True)
    return line

if __name__ == "__main__":
    lines = []
    with open(sys.argv[1], "w") as out:
        for spec in sys.argv[2:]:
            label, rest = spec.split("=")
            port, suffix, preset = (rest.split(":") + ["", "phone"])[:3]
            lines.append(evaluate(label, int(port), suffix.replace("_", " "), preset or "phone", out))
        out.write("\n\nSUMMARY\n" + "\n".join(lines) + "\n")
