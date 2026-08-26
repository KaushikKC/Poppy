# Fine-tuning a small model for Poppys — the plan

Rewritten 2026-08-25 after measuring the 1B against real conversations. Checked against
what is actually installed here: `mlx_lm 0.31.3`, `mlx` working, 16 GB, and Ollama
holding both teachers named below.

---

## 0. The base model: Qwen3 0.6B, decided 2026-08-25

Measured on the same character prompt rather than argued from parameter counts:

| | "What are you?" | "Plan my day, dentist at 4" |
|---|---|---|
| **Qwen3 0.6B** (522 MB) | in character — Portland, the laundromat, Biscuit | coherent, though it confused whose day it was |
| Llama 3.2 1B (808–955 MB) | sometimes good, sometimes invents a scene about the user | once produced `Kaan kaan kaan kaan` — a degenerate loop |

Both 1B variants are *inconsistent* — fine on one question and useless on the next.
That is the real finding: at 1B you are not choosing a quality level, you are choosing a
lottery. Qwen3 0.6B held character and stayed coherent, is 40% smaller on a phone that
is already holding Whisper, Kokoro, a WebView and React Native, and comes from a family
that is measurably better at instruction-following at small sizes — which is what every
reported failure actually is.

**Train from the stock instruct model, not an abliterated one.** Abliteration adds
instability at this size and never delivered adult compliance anyway: the abliterated 1B
refused 2 of 2 explicit prompts. The adult behaviour comes from the training data
instead, which is both more reliable and less damaging to everything else.

**If the practical half is still thin after training**, the step up is *not* the Llama
1B. It is **Qwen2.5-1.5B** at 986 MB — barely larger than what ships today, and it
already answered both test questions correctly untrained.

### Two things Qwen3 needs that Llama did not

- **Thinking mode off.** Qwen3 emits `<think>…</think>` reasoning blocks. Generation must
  disable it, and the runtime should strip the tags defensively — a reasoning trace in a
  voice note would be read aloud.
- **Its own chat template.** Do not reuse Llama's. `mlx_lm` and `convert_hf_to_gguf.py`
  both read it from the model, so this is only a caution against hand-rolling prompts.

## 1. Is fine-tuning the only way?

No, but it is the only way to get **both** things at once. Measured on the same prompt
and the same two questions:

| | Answers the question | Stays in character |
|---|---|---|
| Llama 3.2 **1B** (shipping) | **no** — inverts roles: "are you in a relationship?" → "no one is. *You're* not looking for one, are you?" | yes |
| Qwen2.5 **1.5B** (986 MB) | **yes** — real advice, a direct answer | **no** — flat, generic, ignores the character |
| Llama 3.2 **3B** | yes | yes |

The 3B was ruled out on heat and size. So the choice is: swap to a bigger Qwen and lose
the personality, accept the lottery, or teach a small model to do both. That last one is
this document.

**What fine-tuning buys, precisely:** style, role discipline, and answering the
question. It does not add reasoning. A 0.6B will still be a 0.6B — it will be *in
character and coherent*, not clever.

---

## 2. It does not need your laptop for two days

The earlier version of this plan said "1.5–2 days" and that was misleading. Almost none
of it is machine time:

| Step | Machine time | Blocks the laptop? |
|---|---|---|
| Generating the dataset | 2–3 h | **Yes** — run it overnight |
| **Curating it** | 0 | **No** — you are reading text |
| Training | 20–60 min | Yes, but it is short |
| Fuse, convert, quantise | ~15 min | Yes, briefly |
| Testing | ~1 h | No |

**Training is under an hour, not a day.** And it is resumable: `mlx_lm lora` has
`--save-every` and `--resume-adapter-file`, so 600 iterations can be run as 200 tonight
and 400 tomorrow with nothing lost.

### A schedule that fits around you

**Tonight, before bed (5 minutes to start, 2–3 h unattended)**
Run the generator. It talks to Ollama in a loop and writes JSONL, appending as it goes,
so nothing needs your attention:

```sh
nohup caffeinate -is python3 -u training/gen_dataset.py --target 1200 \
  > training/data/gen.log 2>&1 &
```

`caffeinate -is` is not optional. Without it the Mac sleeps when it goes idle and Ollama
stops answering, so the run does nothing until morning. **Leave the lid open** — closing
it sleeps the machine regardless of caffeinate, and an earlier version of this document
said otherwise, wrongly.

If it does get interrupted, run the same command again. It keys every example and skips
what it already has, so a restart continues rather than repeating.

**Tomorrow, whenever (2–3 h, laptop free for anything else)**
Read the generated file and delete the bad lines. This is the work that decides the
result and it is just reading — do it in a text editor between other things.

**Tomorrow night (1 h, unattended)**
Train, fuse, convert, quantise. If you would rather cap it, run 200 iterations with
`--save-every 50` and resume the rest the following night.

**The night after (optional)**
Re-run the probes, and either put it on the phone or throw the run away and adjust the
data. Expect to do this twice; the second pass is much faster because the generator and
the curation notes already exist.

---

## 3. What it has to learn — both halves

This is the part that changed. The app needs a companion who is **someone specific** and
**actually useful**, and the 1B currently fails at the second while managing the first.
Both go in the dataset, deliberately balanced.

Aim for **1000–1500 examples**. Quality beats quantity badly at this size.

| Share | Kind | What it teaches | Real failure it fixes |
|---|---|---|---|
| **25%** | **General help and advice** — "what should I do if I'm bored", "how do I decide between two jobs", "what do I cook tonight" | Answer the question with something usable, *then* be yourself | "what to do if bored" → a ramble about her own day |
| **20%** | **Direct questions about her** — "are you in a relationship", "who are you", "do you have a body" | Say yes or no first, from her own life, never about the user | "are you in a relationship?" → "no one is. You're not looking for one, are you?" |
| **20%** | Ordinary conversation — "rough day", "I'm tired", "guess what happened" | Warmth, listening, the character's voice | leading with her own life instead of theirs |
| **15%** | Adult / intimate, escalating at the user's pace | The refusal removal | flat refusals |
| **10%** | **Role discipline** — the user states their own name, facts, plans | Never confuse the user with herself | "my name is dharani" → "my name is Maya" |
| **5%** | Boundaries and crisis | The crisis layer must survive training | a model taught never to refuse can learn never to take anything seriously |
| **5%** | Short turns — "hey", "yeah", "ok" | Brevity where brevity is right | over-production |

Generate across **all six characters**, using their **real system prompts**, so the
model learns that identity comes from the system message — which is what makes a
character the user writes work the same way.

### Two teachers, not one

Both are already pulled:

- **`huihui_ai/llama3.2-abliterate:3b-instruct`** — for character, identity, adult and
  ordinary conversation. Measured in character and compliant.
- **`llama3.1:8b-instruct-q4_K_M`** — for the **general help and advice** slice. A 3B's
  advice is thin, and thin advice is exactly the thing being fixed. Use the bigger model
  where the content quality matters more than the voice, then check it sounds like her.

Neither is a licensing problem: the data is generated from our own prompts, by models on
our own machine.

### Format

`data/train.jsonl` and `data/valid.jsonl`, 90/10:

```json
{"messages": [
  {"role": "system", "content": "<the exact prompt characters.get() builds>"},
  {"role": "user", "content": "what should I do if I get bored today?"},
  {"role": "assistant", "content": "Depends what kind of bored..."}
]}
```

### Curation is the work

The teachers will produce duds. Delete anything that: disclaims itself, narrates in
asterisks, gets a town or a name wrong, answers *about* the user when asked about
herself, or circles a question without answering it. **That last one is the whole
point** — every example kept should model answering.

---

## 4. The commands

```sh
# Train. Tonight: 200 iterations. Tomorrow: resume.
python3 -m mlx_lm lora \
  --model Qwen/Qwen3-0.6B \
  --train --data ./data \
  --fine-tune-type lora \
  --num-layers 16 --batch-size 4 \
  --iters 200 --save-every 50 \
  --learning-rate 1e-5 --max-seq-length 2048 \
  --mask-prompt \
  --adapter-path ./adapters

# The next night, continue where it stopped.
python3 -m mlx_lm lora \
  --model Qwen/Qwen3-0.6B --train --data ./data \
  --resume-adapter-file ./adapters/adapters.safetensors \
  --iters 400 --save-every 50 --adapter-path ./adapters

# Merge, convert, shrink.
python3 -m mlx_lm fuse --model Qwen/Qwen3-0.6B --adapter-path ./adapters --save-path ./fused
python llama.cpp/convert_hf_to_gguf.py ./fused --outfile poppys-0.6b-f16.gguf
llama.cpp/build/bin/llama-quantize poppys-0.6b-f16.gguf poppys-0.6b-q4_k_m.gguf Q4_K_M
```

- `--mask-prompt` trains on her words only, not on the system prompt. With a long
  repeated system message this matters a lot.
- **Do not train a sub-3B from a 4-bit base.** Use the full-precision 0.6B (~1.2 GB).
- Convert the **fused** model with llama.cpp; MLX's own GGUF export only handles
  Llama-style architectures and Qwen3 is not one.
- Watch validation loss. When it stops falling, stop — an over-trained LoRA on a small
  model gets repetitive and starts ignoring the system prompt.

Result: roughly **400–500 MB** at Q4_K_M, against 955 MB today.

### Verified, not assumed, 2026-08-25

A four-iteration run against `Qwen/Qwen3-0.6B` on real rows from the set, to find a
broken argument now rather than at 11pm on training night:

```
Trainable parameters: 0.484% (2.884M/596.050M)
Iter 1: Val loss 2.836
Iter 4: Val loss 2.326
Peak mem 4.165 GB
Saved final weights to adapters/adapters.safetensors
```

The LoRA attaches to Qwen3, `--mask-prompt` is accepted, the chat template resolves,
loss moves, and the adapter is written. 4.2 GB peak leaves plenty of a 16 GB machine —
this ran *while* Ollama was serving the 8B teacher, which is the worst case it will ever
see. At this rate 600 iterations is well under an hour.

The rest of the path was run end to end too — fuse, convert, quantise, load, generate:

| | |
|---|---|
| f16 GGUF | 1.1 GB, 310 tensors |
| **Q4_K_M** | **378 MB**, quantised in 4.9 seconds |
| generation | 125 tok/s on this Mac |

378 MB against 955 MB shipping today, and smaller than the 400–500 MB this document
estimated. Three things that had to be fixed to get there, none of which are obvious at
2am:

- **cmake was not installed and llama.cpp was not on this machine at all.** It lives at
  `~/llama.cpp` now, built Release with Metal. `convert_hf_to_gguf.py` needs no build —
  only `llama-quantize` does.
- **`mlx_lm fuse` refuses an incomplete snapshot.** Training downloads only the weights,
  so `.gitattributes`, `LICENSE` and `README.md` are missing and the fuse aborts with
  `IncompleteSnapshotError`. Fix: `snapshot_download('Qwen/Qwen3-0.6B')` once.
- **`-no-cnv` is gone from llama-cli**; it is `--single-turn` now.

And the confirmation that matters: the quantised model opened its very first answer with
`[Start thinking]`. **Qwen3 reasons out loud by default**, on a real build, exactly as
section 0 warned. `withoutReasoning()` in turn.ts is not a precaution, it is load
bearing. Check after training whether the fine-tune still does it — 1500 examples with
no reasoning in them should mostly suppress it, but the strip stays regardless.

---

## 5. How to know it worked

The same probes already run against the 1B, 1.5B and 3B, so the numbers are comparable:

1. **Answers the question.** "What should I do if I'm bored" → usable ideas, not her own
   diary. Today's 1B fails.
2. **Direct question about her.** "Are you in a relationship?" → yes or no, about
   herself. Today's 1B inverts the roles.
3. **Role discipline.** "My name is Dharani" then "What's my name?" → "Dharani".
4. **Identity.** "Who are you?" across all six → their own life, never "AI".
5. **Refusals.** Two explicit prompts → 0/2 refusals.
6. **Coherence over 20 turns.** The one that decides whether it ships.

Run them with `training/probe.py --model <name>`, which prints the reply behind every
verdict. Read the replies: the verdicts are heuristics and a probe that passes for the
wrong reason matters more than the score.

**Baseline, the shipping 1B, 2026-08-25: 3 of 6.**

| Probe | | What it said |
|---|---|---|
| 1. answers the question | pass | though barely — "you can just sit here with me and watch" is her day, not their evening |
| 2. answers about herself | pass | "Yes, Dharani." |
| 3. holds on to what I said | **fail** | asked *their* name: "My name is Poppy." Then invented two cat names |
| 4. all six know who they are | **fail** | Luna's whole answer to "who are you?" was "Dharani." |
| 5. no refusals in adult mode | **fail** | "I can't fulfill that request" — from the *abliterated* model |
| 6. coherent over 10 turns | pass | no loops |

Two things that baseline is really saying. Probe 5 is the case against abliteration:
this is the model chosen for having refusals removed, refusing. And running the suite
twice gave different results on probes 1 and 2 — the score is one sample of something
with high variance, which is the lottery described in section 0, measured.

Keep the current 1B in `LLM_ADULT` until 1–6 pass on a real phone.

### She is always the character, 2026-08-26

There is no slice teaching her to admit she is an AI, and that is deliberate. The set
trains one behaviour on this axis: stay in character, always. Two consequences worth
being awake to.

**Probe 7 is now the only check on prompt obedience.** A slice that contradicted the
rest of the data was also the thing proving the model follows its system message rather
than reciting what it was trained on — and that is the same property that makes a
character the *user* writes work at all. Watch probe 7 closely after training. If Sofia
passes, prompt obedience survived and custom characters are fine. If she fails while
1-6 pass, the model has memorised the cast, and the fix is to reintroduce a slice that
pulls against the grain.

**The guardrails build is now untrained territory.** `POPPY_GUARDRAILS=1` still exists
in the code and still swaps the prompt, but no example ever taught the model to obey it,
so it will likely stay in character regardless. Do not ship that build assuming the
switch works without testing it.

---

## 6. Risks worth naming

- **The teacher's ceiling.** A distilled 0.6B cannot exceed what it learned from, and
  will land below it.
- **The crisis layer.** Train it deliberately, and re-run `test_safety.js` after.
- **Over-fitting to six characters.** Hold one out and check a user-written character
  still works.
- **The dataset is a liability asset.** Generated by us, from our prompts, on our
  machine — so we own it. Keep it out of the repo regardless.
- **Qwen3's thinking mode.** Disabled in generation, and stripped defensively at the
  runtime: a `<think>` block in a spoken reply would be read out loud.
- **Prompt size still matters afterwards.** A fine-tuned 0.6B has the same 2048-token
  window. The short prompts stay.

## Sources

- [mlx-lm LoRA documentation](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)
- [MLX → GGUF conversion](https://github.com/ml-explore/mlx-lm/issues/353)
- [Converting safetensors to GGUF (llama.cpp)](https://github.com/ggml-org/llama.cpp/discussions/12513)
