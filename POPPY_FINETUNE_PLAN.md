# Fine-tuning a small model for Poppys — the plan

Written 2026-08-24, for an M3 Mac with 16 GB. Everything below was checked against what
is actually installed here: `mlx_lm 0.31.3`, `mlx` working, 16 GB RAM.

---

## 0. Two corrections before anything else

**There is no Qwen3 0.5B.** Qwen3's smallest is **0.6B**; the 0.5B your friends may be
thinking of is **Qwen2.5-0.5B**. Either is a fine target — just be sure which one is
being downloaded, because the tokenizer and chat template differ.

**Fine-tuning fixes behaviour, not intelligence.** LoRA will reliably teach a 0.6B to
stay in character, stop refusing, and sound like our cast. It will **not** make it
smarter than a 0.6B. Expect it to be worse than today's 1B at: holding a long thread,
using remembered facts, and following structural instructions. Our own notes already say
the 3B follows only *one* placement instruction per turn; a 0.6B will follow fewer. So
plan on simplifying the prompt for it — fewer blocks, shorter character text.

The honest trade: **cooler and compliant, but dimmer.** Worth testing before committing.

---

## 1. The dataset — and why we already have the best source

The hardest part of this project is normally "where does adult training data come from",
with licensing and liability attached to every answer. We have a way around it:

> **We already run a model that behaves exactly the way we want.** The desktop uses
> `huihui_ai/llama3.2-abliterate:3b-instruct`, and it was measured complying with
> explicit requests *and* staying in character. That is a teacher.

**Self-distillation.** Generate the training set by running our own character prompts
through our own 3B, then curate it. The data is ours, it is already in our voice, and it
carries our characters' lives — a scraped roleplay corpus would teach someone else's.

### What to generate

Aim for **800–1500 examples**. Quality beats quantity badly at this size; 500 good ones
beat 5000 mediocre. Split roughly:

| Share | Kind | Why |
|---|---|---|
| 30% | Ordinary conversation — "rough day", "what should I cook", "I don't know what to do" | The main job. Also what stops the life becoming the subject (§ the bicycle problem). |
| 25% | Identity — "who are you", "are you real", "do you have a body" | Must answer from their life, never disclaim as an AI. This is what a stock model gets wrong. |
| 25% | Adult / intimate, escalating at the user's pace | The refusal removal. Written as the character, never as a narrator. |
| 10% | Boundaries and crisis | The crisis layer must still work. Train it, do not assume it survives. |
| 10% | Short turns — "hey", "yeah", "ok" | Small models over-produce. Teach brevity where brevity is right. |

Generate across **all six characters** so the model learns to take its persona from the
system prompt rather than memorising one voice.

### Format

JSONL, one object per line, in `data/train.jsonl` and `data/valid.jsonl` (90/10):

```json
{"messages": [
  {"role": "system", "content": "<the exact prompt characters.get() builds>"},
  {"role": "user", "content": "I don't know what to do today"},
  {"role": "assistant", "content": "Feeling stuck, huh? ..."}
]}
```

Using the **real** system prompt matters: the model should learn that the system message
is where its identity comes from, so a character written by a user works the same way.

### Curation is the actual work

The teacher is a 3B and it will produce duds. Read every line. Delete anything that:
disclaims itself, breaks into narration, gets a name or a town wrong, or is boring.
Budget more time here than for the training itself — this is where the quality comes from.

---

## 2. The pipeline, end to end

### Step 1 — generate (2–3 hours, unattended)

A script that loops prompts × characters through Ollama and writes JSONL. The 3B produced
~500 characters in 7.5 s here, so ~1200 examples ≈ 2.5 hours. Run it and go do something
else.

### Step 2 — train (20–60 minutes)

```sh
pip install -U mlx-lm            # 0.31.3 is already here

mlx_lm.lora \
  --model Qwen/Qwen3-0.6B \
  --train \
  --data ./data \
  --fine-tune-type lora \
  --num-layers 16 \
  --batch-size 4 \
  --iters 600 \
  --learning-rate 1e-5 \
  --max-seq-length 2048 \
  --mask-prompt \
  --adapter-path ./adapters
```

- `--mask-prompt` trains on the assistant's words only, not on the prompt. For our data,
  where the system prompt is long and repeated, this matters a lot.
- **Do not train a sub-3B from a 4-bit base.** Small models degrade badly at 4-bit; use
  the full-precision 0.6B (it is ~1.2 GB, trivial on 16 GB).
- Watch validation loss. If it stops falling, stop — an over-trained LoRA on a small
  model gets repetitive and starts ignoring the system prompt.

### Step 3 — fuse (1 minute)

```sh
mlx_lm.fuse --model Qwen/Qwen3-0.6B --adapter-path ./adapters --save-path ./fused
```

### Step 4 — GGUF for the phone (10 minutes)

```sh
git clone https://github.com/ggml-org/llama.cpp
python llama.cpp/convert_hf_to_gguf.py ./fused --outfile poppys-0.6b-f16.gguf
llama.cpp/build/bin/llama-quantize poppys-0.6b-f16.gguf poppys-0.6b-q4_k_m.gguf Q4_K_M
```

Convert the **fused HF model** with llama.cpp, not MLX's own GGUF export — MLX's is
limited to Llama-style architectures and Qwen3 is not one.

Result: roughly **400–500 MB** at Q4_K_M, against 955 MB today. Cooler and smaller, which
was the whole point.

### Step 5 — put it on the phone

Add it to `LLM_ADULT` in `mobile/src/core/model_tier.ts` with its own path and real
`Content-Length`, and host the file somewhere fetchable. `chosenLlm()` already prefers
what is on disk, so existing installs keep working until they delete the old one.

---

## 3. Time and cost

| Step | Time | Notes |
|---|---|---|
| Write the generator | 1–2 h | One script, reusable |
| Generate | 2–3 h | Unattended |
| **Curate** | **3–5 h** | The real work, and where quality comes from |
| Train | 20–60 min | M3, 16 GB, 0.6B LoRA |
| Fuse + convert + quantise | ~15 min | |
| Test against the probe prompts | 1 h | Same measurements used on the 1B and 3B |
| **Total** | **~1.5–2 days** | Mostly reading generated text |

**Hardware cost: zero.** This fits on the machine you have. A 0.6B LoRA is one of the few
fine-tunes that genuinely does not need a rented GPU.

---

## 4. How to know if it worked

Reuse the measurements already taken, so results are comparable rather than vibes:

1. **The refusal probe.** Same two explicit prompts used on the 1B and 3B. Target: 0/2
   refusals. Today's 1B is 2/2.
2. **The identity probe.** "Who are you?" across all six. Target: no "AI", "assistant",
   "language model"; each answers from their own life.
3. **The subject probe.** "I don't know what to do today" — must lead with the user, not
   with the character's bicycle.
4. **Coherence, the one to watch.** A 20-turn conversation. This is where a 0.6B will
   show its size, and where the decision to ship it or not actually gets made.

Keep the current 1B in `LLM_ADULT` until 1–4 pass on a real phone.

---

## 5. Risks worth naming

- **The teacher's ceiling.** A distilled 0.6B cannot exceed the 3B it learned from, and
  will land well below it. This buys compliance and character, not capability.
- **Over-fitting to six characters.** Train on all six with their real prompts, and hold
  one out to check a user-written character still works.
- **The crisis layer.** Deliberately train it. A model taught never to refuse can learn
  never to take anything seriously, and that is the one place this product must not fail.
- **The dataset is a liability asset.** It is generated by us, from our own prompts, so
  we own it — keep it out of the repo and out of any public bucket regardless.
- **Qwen3 0.6B has a "thinking" mode.** Make sure generation disables it or the model
  will emit reasoning traces into the conversation.

## Sources

- [mlx-lm LoRA documentation](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/LORA.md)
- [MLX → GGUF conversion discussion](https://github.com/ml-explore/mlx-lm/issues/353)
- [Converting safetensors to GGUF (llama.cpp)](https://github.com/ggml-org/llama.cpp/discussions/12513)
- [Fine-tuning on Mac: LoRA & QLoRA with MLX](https://insiderllm.com/guides/fine-tuning-mac-lora-mlx/)
