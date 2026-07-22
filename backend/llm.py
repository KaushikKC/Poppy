"""LLM backend dispatcher.

Selects the in-process MLX-LM backend or the Ollama server from LLM_BACKEND and
exposes a single stream_reply / warmup interface, so the rest of the app doesn't
care which is active. Import the chosen backend lazily so an unused one's heavy
deps (e.g. mlx-lm) are never imported.
"""

from typing import AsyncIterator
from config import (
    LLM_BACKEND,
    SYSTEM_PROMPT,
    OLLAMA_MODEL,
    MLX_LM_MODEL,
    LLAMACPP_MODEL_FILE,
)

if LLM_BACKEND == "mlx":
    import mlx_llm as _backend
elif LLM_BACKEND == "llamacpp":
    import llama_cpp_llm as _backend
else:
    import ollama_client as _backend


def model_id() -> str:
    """A stable label for the active model, so the companion can pin the exact
    model its personality was calibrated on and notice when it changes (§3.6)."""
    if LLM_BACKEND == "mlx":
        return MLX_LM_MODEL
    if LLM_BACKEND == "llamacpp":
        return LLAMACPP_MODEL_FILE
    return OLLAMA_MODEL


def stream_reply(
    history: list[dict],
    user_text: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    return _backend.stream_reply(history, user_text, system_prompt)


async def complete(user_text: str, system_prompt: str, max_tokens: int = 200) -> str:
    """One-shot completion for side tasks (e.g. memory extraction). Backends that
    keep an in-process prompt cache (MLX) provide a cache-free `complete`; others
    fall back to collecting a fresh stream, which doesn't share the chat cache."""
    if hasattr(_backend, "complete"):
        return await _backend.complete(user_text, system_prompt, max_tokens=max_tokens)
    chunks: list[str] = []
    async for tok in _backend.stream_reply([], user_text, system_prompt):
        chunks.append(tok)
    return "".join(chunks)


async def warmup() -> None:
    await _backend.warmup()
