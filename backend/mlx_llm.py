"""In-process LLM backend using MLX-LM (Apple-Silicon GPU / Metal).

Opt-in alternative to Ollama (set LLM_BACKEND=mlx). Streams tokens with the same
interface as ollama_client.stream_reply, adding two Apple-Silicon speedups:

  * Speculative decoding — an optional tiny draft model (MLX_DRAFT_MODEL)
    proposes tokens the main model verifies in a single pass.
  * Persistent prompt cache — the KV of the unchanged conversation prefix
    (system prompt + earlier turns) is kept between turns, so each turn only
    prefills the newly-added suffix. Time-to-first-token is near zero when the
    prefix is unchanged.

MLX generation is synchronous (it runs on the GPU), so it runs in a worker
thread and streams tokens back to the asyncio loop over a threadsafe queue.
mlx-lm is imported lazily so the app still starts when it isn't installed
(i.e. when the Ollama backend is in use).
"""

import asyncio
import threading
from typing import AsyncIterator, Callable

from config import (
    MLX_LM_MODEL,
    MLX_DRAFT_MODEL,
    MLX_MAX_TOKENS,
    MLX_PROMPT_CACHE,
    SYSTEM_PROMPT,
)

_model = None
_tokenizer = None
_draft_model = None
_loaded = False
# Serialize generation: one MLX model + one shared prompt cache must not be
# driven by two turns at once. We only ever generate a single reply at a time.
_gen_lock = threading.Lock()

# Persistent prompt cache plus the token ids currently held in it, for prefix reuse.
_prompt_cache = None
_cached_tokens: list[int] = []


def _load() -> None:
    global _model, _tokenizer, _draft_model, _loaded
    if _loaded:
        return
    from mlx_lm import load

    _model, _tokenizer = load(MLX_LM_MODEL)
    if MLX_DRAFT_MODEL:
        _draft_model, _ = load(MLX_DRAFT_MODEL)
    _loaded = True


def _build_prompt(history: list[dict], user_text: str, system_prompt: str) -> list[int]:
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_text})
    prompt = _tokenizer.apply_chat_template(messages, add_generation_prompt=True)
    if isinstance(prompt, str):  # some tokenizers return text rather than ids
        prompt = _tokenizer.encode(prompt)
    return list(prompt)


def _common_prefix_len(a: list[int], b: list[int]) -> int:
    n = min(len(a), len(b))
    i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i


def _prepare_cache(tokens: list[int]) -> list[int]:
    """Reuse the persistent prompt cache for the shared prefix of `tokens` and
    return just the suffix that still needs prefilling. Falls back to a full
    prefill if the cache can't be trimmed (e.g. a rotating KV cache)."""
    global _prompt_cache, _cached_tokens
    from mlx_lm.models.cache import (
        make_prompt_cache,
        trim_prompt_cache,
        can_trim_prompt_cache,
    )

    if _prompt_cache is None:
        _prompt_cache = make_prompt_cache(_model)
        _cached_tokens = []

    shared = _common_prefix_len(_cached_tokens, tokens)
    # Drop any cached tokens past the shared prefix (history was trimmed/changed).
    extra = len(_cached_tokens) - shared
    if extra > 0:
        if can_trim_prompt_cache(_prompt_cache):
            trim_prompt_cache(_prompt_cache, extra)
            _cached_tokens = _cached_tokens[:shared]
        else:
            _prompt_cache = make_prompt_cache(_model)
            _cached_tokens = []
            shared = 0

    # generate needs a non-empty prompt; keep at least the final token to prefill.
    if shared >= len(tokens):
        keep = len(tokens) - 1
        over = len(_cached_tokens) - keep
        if over > 0 and can_trim_prompt_cache(_prompt_cache):
            trim_prompt_cache(_prompt_cache, over)
            _cached_tokens = _cached_tokens[:keep]
        shared = keep

    _cached_tokens = list(tokens)  # after prefill the cache holds the whole prompt
    return tokens[shared:]


def _generate_sync(tokens: list[int], emit: Callable[[tuple], None]) -> None:
    from mlx_lm import stream_generate
    from mlx_lm.models.cache import trim_prompt_cache, can_trim_prompt_cache

    try:
        with _gen_lock:
            kwargs: dict = {"max_tokens": MLX_MAX_TOKENS}
            if _draft_model is not None:
                kwargs["draft_model"] = _draft_model
            if MLX_PROMPT_CACHE:
                prompt = _prepare_cache(tokens)
                kwargs["prompt_cache"] = _prompt_cache
            else:
                prompt = tokens

            generated = 0
            for resp in stream_generate(_model, _tokenizer, prompt, **kwargs):
                if resp.text:
                    emit(("token", resp.text))
                generated += 1
                if resp.finish_reason is not None:
                    break

            # Drop the generated KV so the cache holds exactly the prompt prefix
            # for the next turn's prefix match (the assistant reply re-enters as
            # differently-templated history tokens, so its KV can't be reused).
            if (
                MLX_PROMPT_CACHE
                and _prompt_cache is not None
                and generated
                and can_trim_prompt_cache(_prompt_cache)
            ):
                trim_prompt_cache(_prompt_cache, generated)
        emit(("done", None))
    except Exception as e:  # surfaced to the caller, which turns it into a ws error
        emit(("error", e))


async def stream_reply(
    history: list[dict],
    user_text: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    await asyncio.to_thread(_load)
    tokens = _build_prompt(history, user_text, system_prompt)

    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()

    def emit(item: tuple) -> None:
        loop.call_soon_threadsafe(q.put_nowait, item)

    task = asyncio.create_task(asyncio.to_thread(_generate_sync, tokens, emit))
    try:
        while True:
            kind, payload = await q.get()
            if kind == "token":
                yield payload
            elif kind == "done":
                break
            else:  # "error"
                raise payload
    finally:
        # Let the worker finish even on barge-in (it can't be interrupted mid-GPU
        # step) so the prompt cache stays consistent for the next turn.
        await task


def _warmup_blocking() -> None:
    try:
        _load()
        from mlx_lm import stream_generate

        tokens = _build_prompt([], "hi", SYSTEM_PROMPT)
        for _ in stream_generate(_model, _tokenizer, tokens, max_tokens=1):
            break
    except Exception:
        pass


async def warmup() -> None:
    """Load the MLX model and compile Metal kernels once at startup so the first
    real turn doesn't pay the cold start. Uses no prompt cache, so it leaves the
    persistent cache untouched."""
    await asyncio.to_thread(_warmup_blocking)
