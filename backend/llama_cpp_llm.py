"""In-process LLM backend using llama.cpp (GGUF), for Windows and any CPU-only machine.

Selected with LLM_BACKEND=llamacpp. Exposes the exact same interface the dispatcher
expects — stream_reply(history, user_text, system_prompt) -> AsyncIterator[str] and
warmup() — so nothing else in the app changes when swapping off MLX.

Design mirrors mlx_llm.py:
  * The model is loaded once (module-global) and stays resident between turns — the
    keep_alive=-1 equivalent, so no per-turn cold load.
  * Generation is blocking (it runs on CPU/GPU), so it runs in a worker thread and
    streams tokens back to the asyncio loop over a threadsafe queue.
  * GPU offload is optional: n_gpu_layers auto-detects a usable GPU but the app runs
    fully on CPU, so an 8 GB integrated-GPU laptop still works. GPU is a bonus.

llama_cpp is imported lazily so the app still starts (and the MLX/Ollama backends
still work) on machines where it isn't installed.
"""

import asyncio
import os
import threading
from typing import AsyncIterator, Callable

from config import (
    LLAMACPP_MODEL_REPO,
    LLAMACPP_MODEL_FILE,
    LLAMACPP_N_CTX,
    LLAMACPP_N_GPU_LAYERS,
    LLAMACPP_N_THREADS,
    LLAMACPP_MAX_TOKENS,
    SYSTEM_PROMPT,
)

_llm = None
_loaded = False
# Serialize generation: one llama.cpp context must not be driven by two turns at once.
_gen_lock = threading.Lock()


def _model_path() -> str:
    """Local path to the GGUF file, fetched from the HF cache (downloaded on first
    run by preflight/download_models; local_files_only here so runtime stays offline)."""
    from huggingface_hub import hf_hub_download
    offline = os.environ.get("HF_HUB_OFFLINE") == "1"
    return hf_hub_download(
        LLAMACPP_MODEL_REPO, LLAMACPP_MODEL_FILE, local_files_only=offline
    )


def _n_gpu_layers() -> int:
    """How many layers to offload to a GPU. Explicit env wins; otherwise auto: try
    to offload everything (-1) when llama.cpp was built with GPU support, else 0.
    Kept conservative — a failed GPU init falls back to CPU in _load()."""
    if LLAMACPP_N_GPU_LAYERS != "":
        return int(LLAMACPP_N_GPU_LAYERS)
    try:
        from llama_cpp import llama_supports_gpu_offload
        return -1 if llama_supports_gpu_offload() else 0
    except Exception:
        return 0


def _n_threads() -> int | None:
    if LLAMACPP_N_THREADS != "":
        return int(LLAMACPP_N_THREADS)
    try:
        import psutil
        return psutil.cpu_count(logical=False) or None
    except Exception:
        return None


def _load() -> None:
    global _llm, _loaded
    if _loaded:
        return
    from llama_cpp import Llama

    path = _model_path()
    common = dict(
        model_path=path,
        n_ctx=LLAMACPP_N_CTX,
        n_threads=_n_threads(),
        verbose=False,
    )
    n_gpu = _n_gpu_layers()
    try:
        _llm = Llama(n_gpu_layers=n_gpu, **common)
    except Exception:
        # GPU offload can fail to init (driver/VRAM); fall back to pure CPU rather
        # than breaking the LLM — CPU is the guaranteed path.
        if n_gpu != 0:
            _llm = Llama(n_gpu_layers=0, **common)
        else:
            raise
    _loaded = True


def _messages(history: list[dict], user_text: str, system_prompt: str) -> list[dict]:
    msgs = [{"role": "system", "content": system_prompt}]
    msgs.extend(history)
    msgs.append({"role": "user", "content": user_text})
    return msgs


def _generate_sync(messages: list[dict], emit: Callable[[tuple], None]) -> None:
    try:
        with _gen_lock:
            stream = _llm.create_chat_completion(
                messages=messages,
                max_tokens=LLAMACPP_MAX_TOKENS,
                stream=True,
            )
            for chunk in stream:
                delta = chunk["choices"][0].get("delta", {})
                text = delta.get("content")
                if text:
                    emit(("token", text))
        emit(("done", None))
    except Exception as e:  # surfaced to the caller, which turns it into a ws error
        emit(("error", e))


async def stream_reply(
    history: list[dict],
    user_text: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    await asyncio.to_thread(_load)
    messages = _messages(history, user_text, system_prompt)

    loop = asyncio.get_running_loop()
    q: asyncio.Queue = asyncio.Queue()

    def emit(item: tuple) -> None:
        loop.call_soon_threadsafe(q.put_nowait, item)

    task = asyncio.create_task(asyncio.to_thread(_generate_sync, messages, emit))
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
        # Let the worker finish even on barge-in (it can't be interrupted mid-step)
        # so the llama.cpp context is left in a consistent state for the next turn.
        await task


def _warmup_blocking() -> None:
    try:
        _load()
        for _ in _llm.create_chat_completion(
            messages=_messages([], "hi", SYSTEM_PROMPT), max_tokens=1, stream=True
        ):
            break
    except Exception:
        pass


async def warmup() -> None:
    """Load the GGUF model and run one token at startup so the first real turn
    doesn't pay the cold load + first-inference compile."""
    await asyncio.to_thread(_warmup_blocking)
