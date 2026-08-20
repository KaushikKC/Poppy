import asyncio
import io
import uuid
import wave
from fastapi import WebSocket, WebSocketDisconnect
from llm import stream_reply
import tts
from tts import synthesize_to_wav_bytes
from config import (
    MAX_HISTORY_TURNS,
    CONTEXT_WINDOW,
    REPLY_RESERVE,
    KOKORO_SAMPLE_RATE,
    SAFETY_ADDENDUM,
    CRISIS_ADDENDUM,
    CRISIS_LAYER,
    DISTRESS_ADDENDUM,
    AVATAR_BACKEND,
)
import safety
import reply_shape
import traits
import memory_store
import companion
import disclosure
import ritual_pact
import boundaries
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
# stalls past this (GPU contention, a pathological line) the turn finishes without a
# recording rather than leaving the socket hanging. A floor, not the whole budget:
# _reply_voice_note scales it with the length of what it is rendering.
TTS_TIMEOUT_S = 15.0


async def _synthesize(text: str, accent: str, voice: str) -> bytes:
    return await asyncio.to_thread(synthesize_to_wav_bytes, text, accent, None, voice)


async def _db_save(session_id: str, role: str, content: str) -> None:
    await asyncio.to_thread(db.save_turn, session_id, role, content)


def _trim_history():
    """The turn cap, for latency: fewer turns means a smaller prefill.

    This is not the thing that keeps the prompt inside the window — a count cannot
    know how big its messages are. context_budget.fit() does that, per turn, from
    the measured sizes, just before the prompt is sent.
    """
    cap = MAX_HISTORY_TURNS * 2
    if len(conversation_history) > cap:
        del conversation_history[: len(conversation_history) - cap]


async def _reply_voice_note(ws: WebSocket, text: str, accent: str, voice: str) -> None:
    """Deliver one turn as a single recording, the way a voice message arrives.

    Not phrase by phrase. That design exists to start speaking before the model has
    finished, which is right when synthesis outruns speech — and measured on a phone
    it does not: roughly six seconds of audio take ten to render, and every phrase
    boundary costs a further second of fixed per-call overhead. Speaking early
    therefore only meant running out early, heard as a sentence, five seconds of
    silence, then another sentence.

    Rendered whole there is one call and no next phrase to wait for, so the wait is
    paid once, up front, where a voice note's wait belongs. The duration is known
    before a sound is made, so the page can draw a real progress bar rather than a
    spinner of unknown length.
    """
    line = (text or "").strip()
    if not line:
        return

    # Config first so the page's player is configured before anything reaches it, then
    # the recording notice — the same order the mobile core sends them in, because the
    # frontend has to see one contract rather than two.
    #
    # Both are sent when synthesis actually starts, not when the turn does: during
    # generation nobody knows yet whether there will be a recording at all, and
    # claiming there is one would be a guess shown as a fact.
    await ws.send_json({"type": "config", "sampleRate": tts.SAMPLE_RATE})
    await ws.send_json({"type": "recording"})

    # The phrase timeout is far too short for a whole reply — it is the same work
    # several times over — so it scales with the text, with the old value as a floor.
    timeout = max(TTS_TIMEOUT_S, len(line) * 0.25)
    try:
        audio = await asyncio.wait_for(_synthesize(line, accent, voice), timeout)
    except Exception as e:
        print(f"[tts] the recording failed ({e!r}): {line[:60]!r}")
        await ws.send_json({"type": "error", "message": "Her voice could not be rendered."})
        return

    if not audio:
        return

    # The words as well as the length. Not streamed and not shown by default — the
    # note is still a note, not a subtitle you finish before she starts — but a voice
    # message you cannot read back is one you cannot check, quote, or use at all if
    # you are somewhere you cannot play sound. The page puts it behind a tap, the same
    # way it does for the user's own recordings.
    await ws.send_json({
        "type": "voice",
        "durationMs": _wav_duration_ms(audio),
        "text": line,
    })
    await ws.send_bytes(audio)


def _wav_duration_ms(audio: bytes) -> int:
    """How long the recording runs, read from the WAV itself.

    From the header rather than from len(bytes), because the arithmetic depends on
    the channel count and sample width, and guessing those wrong gives a progress bar
    that finishes at half time or runs twice as long as the audio.
    """
    try:
        with wave.open(io.BytesIO(audio), "rb") as w:
            frames, rate = w.getnframes(), w.getframerate()
            return int(frames / rate * 1000) if rate else 0
    except Exception:
        return 0


async def _reply_video(ws: WebSocket, text: str, voice: str):
    """Deliver one turn as a talking-head clip instead of streamed audio
    (AVATAR_BACKEND=video). The reply text still streams to the bubble; the clip
    (rendered on the GPU box, audio baked in) is fetched by the browser at the sent
    URL. If rendering is unavailable the client just keeps its static avatar."""
    clip_id = await asyncio.to_thread(avatar.render, text, voice)
    if clip_id:
        await ws.send_json({"type": "avatar_clip", "url": f"/avatar/clip/{clip_id}"})


async def _say(ws: WebSocket, text: str, accent: str, voice: str):
    """Speak a line the companion initiates herself — the opening line, an end-of-call
    sign-off. No LLM turn: the words are already known.

    Delivered the same way a reply is, because it is the first thing anyone hears and
    a stuttering hello is a worse first impression than a slightly later one.
    """
    # Video-avatar mode: reveal the line, render one clip (which carries its own
    # audio), and skip the audio path entirely.
    if AVATAR_BACKEND == "video":
        await ws.send_json({"type": "token", "text": text})
        await _reply_video(ws, text, voice)
        await ws.send_json({"type": "done"})
        return

    # She opened the conversation, so she says it out loud — unless it is a one-line
    # hello, which is exactly what an opening line usually is.
    if reply_shape.speak_it(text):
        await _reply_voice_note(ws, text, accent, voice)
    else:
        await ws.send_json({"type": "token", "text": text})
    await ws.send_json({"type": "done"})


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

            # A rule takes effect the moment it is said, not when the call ends.
            #
            # It used to be read only at /call/close, which meant telling her to
            # drop a subject did nothing for the rest of that conversation, and
            # the memory panel could not show the rule yet either. Raising
            # something straight after being asked not to is the most expensive
            # mistake this product can make, so it is applied before this turn's
            # reply is even built.
            rule = await asyncio.to_thread(boundaries.parse, user_text)
            if rule:
                await asyncio.to_thread(boundaries.add, rule["kind"], rule["topic"])

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
                # Same reasoning as the disclosure block below: the pact is our
                # retention design, and someone else's character should not be made
                # to negotiate a daily check-in time on our behalf.
                and not char.get("custom")
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
            # A character the user wrote gets to be that character.
            #
            # The disclosure block is a placement instruction — "open every reply with
            # one sentence of your own, then your question, every time" — and at ~1100
            # characters it outweighs a custom character's own description almost two
            # to one. Measured: asked what she did this evening, an archivist who
            # restores film reels invented ordering a pizza, because the loudest
            # instruction in the prompt told her to volunteer something and ask a
            # question, and the model followed that instead of being who she is.
            #
            # So the retention scaffolding applies to our cast, whose personalities
            # were written around it. Someone else's character is theirs.
            if not pact_block and not char.get("custom"):
                disclosure_block = await asyncio.to_thread(
                    disclosure.as_prompt_block, profile.get("total_calls", 0),
                )
            identity_block = await asyncio.to_thread(
                companion.as_prompt_block, not pact_block,
            )
            # What she was told to leave alone, and what to keep track of. This
            # is a constraint list rather than a placement rule, so unlike the
            # directives above it composes and is always present.
            rules_block = await asyncio.to_thread(boundaries.as_prompt_block)
            # Traits sit with identity rather than with the momentary stance: they
            # are who she is, so they apply in every mode instead of being re-picked
            # each call. See traits.py.
            traits_block = traits.as_prompt_block(profile.get("traits"))
            system_prompt = (
                char["system_prompt"] + traits_block + identity_block + disclosure_block
                + pact_block + rules_block + SAFETY_ADDENDUM + memory_block
            )
            # Detection always runs (it is what holds the pact block back on a
            # heavy turn), but everything the user sees or the model is told is on
            # CRISIS_LAYER, so the switch means what its name says. It is
            # deliberately independent of ADULT and GUARDRAILS: appending a
            # helpline is not a content restriction, and it never refuses a turn.
            if CRISIS_LAYER and risk["level"] == "crisis":
                system_prompt += CRISIS_ADDENDUM
                await ws.send_json({"type": "safety", "resources": risk["resources"]})
            elif CRISIS_LAYER and risk["level"] == "distress":
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
                # Measured, not guessed: the character, the memories and the
                # message are all sized on this turn, and history gets what is
                # genuinely left. Overflowing would drop the system prompt from
                # the left, which costs the character rather than old small talk.
                sized_history, sized_text, _used = context_budget.fit(
                    conversation_history, system_prompt, user_text,
                    CONTEXT_WINDOW, REPLY_RESERVE,
                )
                async for token in stream_reply(sized_history, sized_text, system_prompt):
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

            # How it came in decides how it goes out: speak to her and she speaks
            # back, type and she types back. The page already knows which way the
            # message was sent, so nobody has to choose it in a menu.
            spoken = msg.get("spoken") is not False
            # …unless they asked. Arrival is the default, not the rule: someone
            # typing at their desk can still want to hear the answer, and saying
            # so in the message is the obvious way to ask for it.
            asked_for_voice = reply_shape.wants_voice(user_text)
            if asked_for_voice:
                spoken = True

            full_reply: list[str] = []
            try:
                async for token in stream_reply(conversation_history, user_text, system_prompt):
                    full_reply.append(token)
                    # Nothing readable is sent while she records. A reply that can be
                    # read while it is being spoken gets read, and then the recording
                    # is only something to sit through.
                    if not spoken:
                        await ws.send_json({"type": "token", "text": token})

                assistant_text = "".join(full_reply)

                # Decided on the finished reply, because that is the only point the
                # length is known — and it is known for free, before a sound is made.
                # An explicit request skips the length floor as well. "Yes, obviously"
                # is under sixty characters and would normally be read, but someone
                # who asked to hear it asked to hear it.
                if spoken and (asked_for_voice or reply_shape.speak_it(assistant_text)):
                    await _reply_voice_note(ws, assistant_text, reply_accent, reply_voice)
                elif spoken:
                    # Spoken to, but the answer is a line rather than a message: it
                    # arrives whole and instantly instead of costing four seconds.
                    await ws.send_json({"type": "token", "text": assistant_text})

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
                # On barge-in the socket closes mid-stream. Nothing is queued now
                # that synthesis happens once, after generation, so there is nothing
                # to drain — the raise is enough.
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
