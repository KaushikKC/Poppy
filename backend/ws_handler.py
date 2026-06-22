import asyncio
from fastapi import WebSocket, WebSocketDisconnect
from ollama_client import stream_reply
from tts import synthesize_to_wav_bytes
from phrase_chunker import PhraseChunker
from config import MAX_HISTORY_TURNS

conversation_history: list[dict] = []


async def _synthesize(text: str) -> bytes:
    return await asyncio.to_thread(synthesize_to_wav_bytes, text)


def _trim_history():
    cap = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > cap:
        del conversation_history[: len(conversation_history) - cap]


async def handle_chat(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "chat":
                continue

            user_text = msg.get("text", "").strip()
            if not user_text:
                continue

            await ws.send_json({"type": "config", "sampleRate": 22050})

            chunker = PhraseChunker()
            full_reply: list[str] = []

            async def tts_and_send(phrase: str):
                audio = await _synthesize(phrase)
                await ws.send_bytes(audio)

            tts_tasks: list[asyncio.Task] = []

            async for token in stream_reply(conversation_history, user_text):
                full_reply.append(token)
                await ws.send_json({"type": "token", "text": token})

                phrase = chunker.push(token)
                if phrase:
                    task = asyncio.create_task(tts_and_send(phrase))
                    tts_tasks.append(task)

            remainder = chunker.flush()
            if remainder:
                task = asyncio.create_task(tts_and_send(remainder))
                tts_tasks.append(task)

            if tts_tasks:
                await asyncio.gather(*tts_tasks)

            assistant_text = "".join(full_reply)
            conversation_history.append({"role": "user", "content": user_text})
            conversation_history.append({"role": "assistant", "content": assistant_text})
            _trim_history()

            await ws.send_json({"type": "done"})

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


async def clear_history():
    conversation_history.clear()
