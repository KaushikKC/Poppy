import asyncio
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from ollama_client import stream_reply
from tts import synthesize_to_wav_bytes
from phrase_chunker import PhraseChunker
from config import MAX_HISTORY_TURNS, KOKORO_SAMPLE_RATE, SAFETY_ADDENDUM, CRISIS_ADDENDUM
import personas as persona_store
import accent as accent_mod
import safety
import memory_store
import accent_detect
import gender as gender_mod
import gender_detect
import emotion as emotion_mod
import db

conversation_history: list[dict] = []


async def _synthesize(text: str, accent: str, gender: str) -> bytes:
    return await asyncio.to_thread(synthesize_to_wav_bytes, text, accent, gender)


async def _db_save(session_id: str, role: str, content: str) -> None:
    await asyncio.to_thread(db.save_turn, session_id, role, content)


def _trim_history():
    cap = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > cap:
        del conversation_history[: len(conversation_history) - cap]


async def handle_chat(ws: WebSocket):
    await ws.accept()
    session_id = str(uuid.uuid4())
    await asyncio.to_thread(db.create_session, session_id)

    try:
        while True:
            msg = await ws.receive_json()
            if msg.get("type") != "chat":
                continue

            user_text = msg.get("text", "").strip()
            if not user_text:
                continue

            persona = persona_store.get(msg.get("persona", ""))
            # Emotional-support framing: base persona + supportive addendum +
            # remembered facts, with a stronger addendum if distress is detected.
            risk = safety.check(user_text)
            memory_block = await asyncio.to_thread(memory_store.as_prompt_block)
            system_prompt = persona["system_prompt"] + SAFETY_ADDENDUM + memory_block
            if risk["crisis"]:
                system_prompt += CRISIS_ADDENDUM
                await ws.send_json({"type": "safety", "resources": risk["resources"]})

            # Adapt tone to how the user sounds this turn (momentary; neutral if
            # absent, e.g. typed messages).
            tone = emotion_mod.tone_for(msg.get("emotion"))
            if tone:
                system_prompt = f"{system_prompt} {tone}"

            # Reply in the user's accent + gender: use client-supplied values if
            # any, otherwise the latest detected from their voice (both sticky).
            reply_accent = accent_mod.normalize(
                msg.get("accent") or accent_detect.tracker.current
            )
            reply_gender = gender_mod.normalize(
                msg.get("gender") or gender_detect.tracker.current
            )

            await ws.send_json({"type": "config", "sampleRate": KOKORO_SAMPLE_RATE})

            chunker = PhraseChunker()
            full_reply: list[str] = []

            async def tts_and_send(phrase: str):
                audio = await _synthesize(phrase, reply_accent, reply_gender)
                await ws.send_bytes(audio)

            tts_tasks: list[asyncio.Task] = []
            try:
                async for token in stream_reply(conversation_history, user_text, system_prompt):
                    full_reply.append(token)
                    await ws.send_json({"type": "token", "text": token})

                    phrase = chunker.push(token)
                    if phrase:
                        tts_tasks.append(asyncio.create_task(tts_and_send(phrase)))

                remainder = chunker.flush()
                if remainder:
                    tts_tasks.append(asyncio.create_task(tts_and_send(remainder)))

                if tts_tasks:
                    await asyncio.gather(*tts_tasks)

                assistant_text = "".join(full_reply)
                conversation_history.append({"role": "user", "content": user_text})
                conversation_history.append({"role": "assistant", "content": assistant_text})
                _trim_history()

                await asyncio.gather(
                    _db_save(session_id, "user", user_text),
                    _db_save(session_id, "assistant", assistant_text),
                )

                # Capture any durable facts from this turn into encrypted memory.
                await asyncio.to_thread(memory_store.extract_and_store, user_text)

                await ws.send_json({"type": "done", "sessionId": session_id})
            finally:
                # On barge-in the socket closes mid-stream; cancel any pending
                # synthesis so we don't leave orphaned tasks sending into a dead
                # connection.
                for t in tts_tasks:
                    if not t.done():
                        t.cancel()
                await asyncio.gather(*tts_tasks, return_exceptions=True)

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


async def clear_history():
    conversation_history.clear()
