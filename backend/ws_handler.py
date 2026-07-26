import asyncio
import uuid
from fastapi import WebSocket, WebSocketDisconnect
from llm import stream_reply
import tts
from tts import synthesize_to_wav_bytes
from phrase_chunker import PhraseChunker
from config import (
    MAX_HISTORY_TURNS,
    KOKORO_SAMPLE_RATE,
    SAFETY_ADDENDUM,
    CRISIS_ADDENDUM,
    DISTRESS_ADDENDUM,
)
import safety
import memory_store
import companion
import characters
import emotion as emotion_mod
import db

conversation_history: list[dict] = []

# A single phrase's synthesis must never be able to hang the whole turn. If it
# stalls past this (GPU contention, a pathological phrase), we skip that phrase's
# audio and let the reply finish rather than leaving the voice frozen mid-reply.
TTS_TIMEOUT_S = 15.0


async def _synthesize(text: str, accent: str, voice: str) -> bytes:
    return await asyncio.to_thread(synthesize_to_wav_bytes, text, accent, None, voice)


async def _synthesize_safe(text: str, accent: str, voice: str) -> bytes:
    """Synthesize one phrase in the character's voice, but never raise or hang the
    turn: on timeout or error return empty bytes (that phrase just gets no audio)."""
    try:
        return await asyncio.wait_for(_synthesize(text, accent, voice), TTS_TIMEOUT_S)
    except Exception as e:
        print(f"[tts] synth skipped for phrase ({e!r}): {text[:40]!r}")
        return b""


async def _db_save(session_id: str, role: str, content: str) -> None:
    await asyncio.to_thread(db.save_turn, session_id, role, content)


def _trim_history():
    cap = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > cap:
        del conversation_history[: len(conversation_history) - cap]


async def _say(ws: WebSocket, text: str, accent: str, voice: str):
    """Speak a line the companion initiates herself (the opening line, an end-of-call
    sign-off) — TTS + on-screen text, no LLM turn. Mirrors the chat path's
    phrase-chunked streaming so the first audio still starts almost immediately."""
    await ws.send_json({"type": "config", "sampleRate": tts.SAMPLE_RATE})
    chunker = PhraseChunker()
    tts_tasks: list[asyncio.Task] = []

    async def tts_and_send(phrase: str):
        audio = await _synthesize_safe(phrase, accent, voice)
        if audio:
            await ws.send_bytes(audio)

    try:
        # Reveal the whole line up front (the text is already known), then stream
        # its audio phrase by phrase.
        await ws.send_json({"type": "token", "text": text})
        for ch in text:
            phrase = chunker.push(ch)
            if phrase:
                tts_tasks.append(asyncio.create_task(tts_and_send(phrase)))
                await asyncio.sleep(0)
        remainder = chunker.flush()
        if remainder:
            tts_tasks.append(asyncio.create_task(tts_and_send(remainder)))
        if tts_tasks:
            await asyncio.gather(*tts_tasks)
        await ws.send_json({"type": "done"})
    finally:
        for t in tts_tasks:
            if not t.done():
                t.cancel()
        await asyncio.gather(*tts_tasks, return_exceptions=True)


async def handle_chat(ws: WebSocket):
    await ws.accept()
    session_id = str(uuid.uuid4())
    await asyncio.to_thread(db.create_session, session_id)

    try:
        while True:
            msg = await ws.receive_json()

            # Assistant-initiated speech (she speaks first, sign-off): TTS a given
            # line with no LLM turn, in the CHARACTER's own voice.
            if msg.get("type") == "say":
                say_text = msg.get("text", "").strip()
                if say_text:
                    char = characters.get((await asyncio.to_thread(companion.profile)).get("character", "poppy"))
                    await _say(ws, say_text, char["accent"], char["voice"])
                continue

            if msg.get("type") != "chat":
                continue

            user_text = msg.get("text", "").strip()
            if not user_text:
                continue

            # The chosen character is the personality + voice. (Mood modes frame the
            # opener; the character itself stays constant.)
            profile = await asyncio.to_thread(companion.profile)
            char = characters.get(profile.get("character", "poppy"))
            # Emotional-support framing: character personality + supportive addendum +
            # remembered facts, with a stronger addendum if distress is detected.
            risk = safety.check(user_text)
            memory_block = await asyncio.to_thread(memory_store.as_prompt_block, user_text)
            identity_block = await asyncio.to_thread(companion.as_prompt_block)
            system_prompt = (
                char["system_prompt"] + identity_block + SAFETY_ADDENDUM + memory_block
            )
            if risk["level"] == "crisis":
                system_prompt += CRISIS_ADDENDUM
                await ws.send_json({"type": "safety", "resources": risk["resources"]})
            elif risk["level"] == "distress":
                system_prompt += DISTRESS_ADDENDUM

            # Adapt tone to how the user sounds this turn (momentary; neutral if
            # absent, e.g. typed messages).
            tone = emotion_mod.tone_for(msg.get("emotion"))
            if tone:
                system_prompt = f"{system_prompt} {tone}"

            # The companion speaks in the character's own fixed voice (their identity),
            # not the user's detected voice.
            reply_accent = char["accent"]
            reply_voice = char["voice"]

            await ws.send_json({"type": "config", "sampleRate": tts.SAMPLE_RATE})

            chunker = PhraseChunker()
            full_reply: list[str] = []

            async def tts_and_send(phrase: str):
                audio = await _synthesize_safe(phrase, reply_accent, reply_voice)
                if audio:
                    await ws.send_bytes(audio)

            tts_tasks: list[asyncio.Task] = []
            try:
                async for token in stream_reply(conversation_history, user_text, system_prompt):
                    full_reply.append(token)
                    await ws.send_json({"type": "token", "text": token})

                    phrase = chunker.push(token)
                    if phrase:
                        tts_tasks.append(asyncio.create_task(tts_and_send(phrase)))
                        # Yield so synthesis of this phrase starts now (in its
                        # thread) rather than only after the whole text stream
                        # ends — that's what makes the voice begin while typing.
                        await asyncio.sleep(0)

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

                # Memory is no longer captured silently here. Nothing durable is
                # stored without consent (§5): after the turn the frontend calls
                # /memory/extract to get candidates and asks the user to Save them.
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
