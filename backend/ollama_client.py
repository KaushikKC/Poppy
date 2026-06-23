import httpx
import json
from typing import AsyncIterator
from config import OLLAMA_URL, OLLAMA_MODEL, OLLAMA_CONTEXT_WINDOW, SYSTEM_PROMPT


def _build_messages(history: list[dict], user_text: str, system_prompt: str) -> list[dict]:
    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_text})
    return messages


async def stream_reply(
    history: list[dict],
    user_text: str,
    system_prompt: str = SYSTEM_PROMPT,
) -> AsyncIterator[str]:
    messages = _build_messages(history, user_text, system_prompt)
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": True,
        "options": {"num_ctx": OLLAMA_CONTEXT_WINDOW},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", f"{OLLAMA_URL}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("message", {}).get("content", "")
                if token:
                    yield token
                if data.get("done"):
                    break
