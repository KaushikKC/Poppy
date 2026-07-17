"""LLM backend dispatcher.

Selects the in-process MLX-LM backend or the Ollama server from LLM_BACKEND and
exposes a single stream_reply / warmup interface, so the rest of the app doesn't
care which is active. Import the chosen backend lazily so an unused one's heavy
deps (e.g. mlx-lm) are never imported.
"""

from typing import AsyncIterator
from config import LLM_BACKEND, SYSTEM_PROMPT

if LLM_BACKEND == "mlx":
    import mlx_llm as _backend
elif LLM_BACKEND == "llamacpp":
    import llama_cpp_llm as _backend
else:
    import ollama_client as _backend


def stream_reply(
    history: list[dict],
    user_text: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    return _backend.stream_reply(history, user_text, system_prompt)


async def warmup() -> None:
    await _backend.warmup()
