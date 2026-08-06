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
    AVATAR_BACKEND,
)
import safety
import memory_store
import companion
import disclosure
import ritual_pact
import characters
import avatar
import emotion as emotion_mod
import db

conversation_history: list[dict] = []

# Where the current call starts inside that history. The history deliberately
# survives across calls so she keeps context, which means "the turns of this call"
# is not the same as "the history" — and anything that reads back what was just
# said (the closing hook, the ritual answer) must only see this call, or it will
# answer a question the user resolved yesterday.
_call_turn_base = 0


def mark_call_start() -> None:
    """Called from /call/open so per-call reads have a boundary to work from."""
    global _call_turn_base
    _call_turn_base = len(conversation_history)


def current_call_turns() -> list[dict]:
    """Just this call's turns."""
    return conversation_history[_call_turn_base:]


def current_call_turn_no() -> int:
    """1-based index of the turn being handled right now, within this call."""
    return (len(conversation_history) - _call_turn_base) // 2 + 1

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


class SpeechStream:
    """Synthesise a reply's phrases one at a time, in order.

    Every phrase used to get its own `asyncio.create_task`, so a long reply fired
    eight or ten synthesis calls at the speech model simultaneously. They thrash:
    each one then takes longer than the timeout and gets dropped, which is heard
    as her going silent while the text still appears. Worse as the conversation
    goes on, because replies get longer.

    One worker fixes both that and an ordering bug that was there all along: the
    concurrent tasks sent their audio in completion order, not phrase order, so a
    reply could play back scrambled.

    Streaming is preserved. The first phrase starts synthesising while the model
    is still generating the rest; it just never runs two at once.
    """

    def __init__(self, ws: WebSocket, accent: str, voice: str):
        self._ws = ws
        self._accent = accent
        self._voice = voice
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker = asyncio.create_task(self._run())

    async def _run(self) -> None:
        while True:
            phrase = await self._queue.get()
            try:
                if phrase is None:
                    return
                audio = await _synthesize_safe(phrase, self._accent, self._voice)
                if audio:
                    await self._ws.send_bytes(audio)
            except (asyncio.CancelledError, Exception):
                if isinstance(phrase, str):
                    print(f"[tts] dropped phrase after send failure: {phrase[:40]!r}")
                raise
            finally:
                self._queue.task_done()

    def push(self, phrase: str) -> None:
        if phrase:
            self._queue.put_nowait(phrase)

    async def close(self) -> None:
        """Wait for every queued phrase to be spoken."""
        self._queue.put_nowait(None)
        await self._worker

    async def cancel(self) -> None:
        if not self._worker.done():
            self._worker.cancel()
        try:
            await self._worker
        except (asyncio.CancelledError, Exception):
            pass


async def _db_save(session_id: str, role: str, content: str) -> None:
    await asyncio.to_thread(db.save_turn, session_id, role, content)


def _trim_history():
    cap = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > cap:
        del conversation_history[: len(conversation_history) - cap]


async def _reply_video(ws: WebSocket, text: str, voice: str):
    """Deliver one turn as a talking-head clip instead of streamed audio
    (AVATAR_BACKEND=video). The reply text still streams to the bubble; the clip
    (rendered on the GPU box, audio baked in) is fetched by the browser at the sent
    URL. If rendering is unavailable the client just keeps its static avatar."""
    clip_id = await asyncio.to_thread(avatar.render, text, voice)
    if clip_id:
        await ws.send_json({"type": "avatar_clip", "url": f"/avatar/clip/{clip_id}"})


async def _say(ws: WebSocket, text: str, accent: str, voice: str):
    """Speak a line the companion initiates herself (the opening line, an end-of-call
    sign-off) — TTS + on-screen text, no LLM turn. Mirrors the chat path's
    phrase-chunked streaming so the first audio still starts almost immediately."""
    # Video-avatar mode: reveal the line, render one clip (which carries its own
    # audio), and skip the phrase-audio streaming entirely.
    if AVATAR_BACKEND == "video":
        await ws.send_json({"type": "token", "text": text})
        await _reply_video(ws, text, voice)
        await ws.send_json({"type": "done"})
        return

    await ws.send_json({"type": "config", "sampleRate": tts.SAMPLE_RATE})
    chunker = PhraseChunker()
    speech = SpeechStream(ws, accent, voice)

    try:
        # Reveal the whole line up front (the text is already known), then stream
        # its audio phrase by phrase.
        await ws.send_json({"type": "token", "text": text})
        for ch in text:
            phrase = chunker.push(ch)
            if phrase:
                speech.push(phrase)
        speech.push(chunker.flush())
        await speech.close()
        await ws.send_json({"type": "done"})
    except Exception:
        await speech.cancel()
        raise


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
            # The ritual pact (§5). Never on a distress or crisis turn: "so when
            # shall I expect you?" in the middle of something heavy is the exact
            # opposite of wanting to be part of their day, and it is the same
            # instinct the paywall guardrail already refuses. Held back a couple of
            # turns too: the opening turn belongs to the loop payoff (§7 Act 1), and
            # asking before they've said anything makes it an intake form.
            pact_block = ""
            turn_no = current_call_turn_no()
            if (
                risk["level"] is None
                and turn_no >= ritual_pact.ASK_FROM_TURN
                and await asyncio.to_thread(ritual_pact.is_due, profile)
            ):
                pact_block = ritual_pact.as_prompt_block()

            # ── One directive per turn ────────────────────────────────────────
            # Each of these tells the model where something goes in its reply:
            # close the open loop first, open with your own disclosure, end by
            # asking when to expect them. Stacked together the on-device 3B follows
            # whichever it sees first and silently drops the rest. Measured on the
            # pact: 3/3 asks on its own, 0/3 with the others present.
            #
            # So exactly one wins each turn, by how repeatable it is. The pact
            # happens once in the whole relationship and is the highest-value habit
            # lever we have (§5), so it outranks. Loop payoff is next, because an
            # unpaid-off loop kills that mechanic permanently (§1.3 Rule 3).
            # Disclosure happens every call and loses nothing by yielding a turn.
            disclosure_block = ""
            if not pact_block:
                disclosure_block = await asyncio.to_thread(
                    disclosure.as_prompt_block, profile.get("total_calls", 0),
                )
            identity_block = await asyncio.to_thread(
                companion.as_prompt_block, not pact_block,
            )
            system_prompt = (
                char["system_prompt"] + identity_block + disclosure_block + pact_block
                + SAFETY_ADDENDUM + memory_block
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

            # Video-avatar mode (AVATAR_BACKEND=video): stream the reply text, then
            # render one talking-head clip on the GPU box (voice baked in) instead of
            # streaming phrase audio. Leaves the local-audio path below untouched.
            if AVATAR_BACKEND == "video":
                full_reply = []
                async for token in stream_reply(conversation_history, user_text, system_prompt):
                    full_reply.append(token)
                    await ws.send_json({"type": "token", "text": token})
                assistant_text = "".join(full_reply)
                await _reply_video(ws, assistant_text, reply_voice)

                conversation_history.append({"role": "user", "content": user_text})
                conversation_history.append({"role": "assistant", "content": assistant_text})
                _trim_history()
                await asyncio.gather(
                    _db_save(session_id, "user", user_text),
                    _db_save(session_id, "assistant", assistant_text),
                )
                await ws.send_json({"type": "done", "sessionId": session_id})
                continue

            await ws.send_json({"type": "config", "sampleRate": tts.SAMPLE_RATE})

            chunker = PhraseChunker()
            full_reply: list[str] = []
            # One worker, in order. Phrases are queued as the model produces them,
            # so the voice still starts while she is still "typing", but only one
            # synthesis ever runs at a time.
            speech = SpeechStream(ws, reply_accent, reply_voice)
            try:
                async for token in stream_reply(conversation_history, user_text, system_prompt):
                    full_reply.append(token)
                    await ws.send_json({"type": "token", "text": token})
                    speech.push(chunker.push(token))

                speech.push(chunker.flush())
                await speech.close()

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
            except Exception:
                # On barge-in the socket closes mid-stream; drop anything still
                # queued rather than synthesising into a dead connection.
                await speech.cancel()
                raise

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass


async def clear_history():
    conversation_history.clear()
