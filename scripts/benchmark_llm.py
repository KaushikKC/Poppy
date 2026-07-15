"""Benchmark MLX chat models for the companion: TTFT, tokens/sec, memory.

Compares candidate models on companion-style short prompts. Run when deciding
whether a bigger/smaller model should ship as the default.

    python3 scripts/benchmark_llm.py                          # shipped 3B only
    python3 scripts/benchmark_llm.py mlx-community/Llama-3.2-3B-Instruct-4bit \
                                     prism-ml/Ternary-Bonsai-27B-mlx-2bit

⚠️  Heavy while it runs: each model saturates the GPU for a few minutes and an
uncached model is a multi-GB download. The script refuses to download when free
disk would drop below 5 GB. Weights land in the Hugging Face cache
(~/.cache/huggingface) — delete a rejected model's folder there to reclaim disk.
"""

import shutil
import sys
import time
from pathlib import Path

DEFAULT_MODEL = "mlx-community/Llama-3.2-3B-Instruct-4bit"
MIN_FREE_GB_AFTER_DOWNLOAD = 5

PROMPTS = [
    "Hey, how are you doing today?",
    "I had a rough day at work, my manager criticized my report in front of everyone.",
    "Tell me something interesting to cheer me up.",
    "I've been thinking about starting to exercise again but I keep putting it off.",
    "What do you remember about me?",
    "My sister's birthday is coming up and I have no idea what to get her.",
    "Honestly I just feel a bit lonely this evening.",
    "Can you explain why the sky is blue, but keep it short and fun?",
]

SYSTEM = (
    "You are a warm, friendly conversational companion. "
    "Keep replies concise — two to four sentences unless the user asks for more."
)


def _cached(repo: str) -> bool:
    from huggingface_hub import snapshot_download
    try:
        snapshot_download(repo, local_files_only=True)
        return True
    except Exception:
        return False


def _free_gb() -> float:
    return shutil.disk_usage(Path.home()).free / 1e9


def bench(repo: str) -> dict | None:
    import mlx.core as mx
    from mlx_lm import load, stream_generate

    if not _cached(repo):
        free = _free_gb()
        print(f"  {repo} is not cached (free disk: {free:.1f} GB).")
        est = 6.5 if "27" in repo else 2.5  # rough weight-size guess, GB
        if free - est < MIN_FREE_GB_AFTER_DOWNLOAD:
            print(f"  ✋ Skipping: downloading (~{est:.0f} GB) would leave "
                  f"<{MIN_FREE_GB_AFTER_DOWNLOAD} GB free. Clear space first.")
            return None
        print(f"  Downloading (~{est:.0f} GB)…")

    print(f"  Loading {repo}…")
    mx.reset_peak_memory()
    t0 = time.perf_counter()
    model, tokenizer = load(repo)
    load_s = time.perf_counter() - t0

    ttfts, rates = [], []
    for i, user in enumerate(PROMPTS):
        msgs = [{"role": "system", "content": SYSTEM},
                {"role": "user", "content": user}]
        prompt = tokenizer.apply_chat_template(msgs, add_generation_prompt=True)
        t0 = time.perf_counter()
        ttft = None
        n = 0
        for out in stream_generate(model, tokenizer, prompt, max_tokens=120):
            if ttft is None:
                ttft = time.perf_counter() - t0
            n += 1
        total = time.perf_counter() - t0
        ttfts.append(ttft or total)
        rates.append(n / max(total - (ttft or 0), 1e-6))
        print(f"    [{i+1}/{len(PROMPTS)}] ttft={ttfts[-1]*1000:.0f}ms  {rates[-1]:.1f} tok/s")

    peak_gb = mx.get_peak_memory() / 1e9
    return {
        "repo": repo,
        "load_s": load_s,
        "ttft_ms": sorted(ttfts)[len(ttfts) // 2] * 1000,  # median
        "tok_s": sorted(rates)[len(rates) // 2],
        "peak_gb": peak_gb,
    }


def main() -> int:
    repos = sys.argv[1:] or [DEFAULT_MODEL]
    print(f"Benchmarking {len(repos)} model(s) on {len(PROMPTS)} companion prompts.")
    print("⚠️  GPU will be busy for a few minutes per model.\n")
    results = []
    for repo in repos:
        print(f"→ {repo}")
        r = bench(repo)
        if r:
            results.append(r)
        print()

    if results:
        print(f"{'model':55} {'load':>6} {'ttft':>8} {'speed':>10} {'peak mem':>9}")
        for r in results:
            print(f"{r['repo']:55} {r['load_s']:5.1f}s {r['ttft_ms']:6.0f}ms "
                  f"{r['tok_s']:7.1f} t/s {r['peak_gb']:7.2f} GB")
        print("\nSpeech pace is ~3-4 tok/s — anything above ~8 tok/s stays "
              "comfortably ahead of the voice.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
