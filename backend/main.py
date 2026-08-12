import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from stt import transcribe
from config import DETECTION_DEFAULT, AVATAR_BACKEND
from ws_handler import handle_chat, clear_history as ws_clear_history
import ws_handler
import avatar
import personas as persona_store
import persona_suggest
import characters
import companion
import loops
import loop_author
import streak
import quests
import bloom
import garden
import opening
import ritual_pact
import boundaries
import updates
import nudges
import notify
import metrics
import billing
import memory_store
import memory_extract
import audio_utils
import accent_detect
import gender_detect
import emotion_detect
import db
import paths

FRONTEND_DIR = paths.bundle_root() / "frontend"

app = FastAPI(title="Private Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def _no_cache_frontend(request, call_next):
    """Never let the browser cache the app's own files.

    Everything here is served from the same machine, so caching buys nothing and
    costs a genuinely confusing class of bug: after an update the browser keeps
    running the old JS, which looks exactly like the new feature being broken.
    That cost a debugging cycle chasing a click handler that was, in fact, fine.
    """
    response = await call_next(request)
    path = request.url.path
    if path == "/" or path.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response

# Background voice-detection tasks, kept referenced so the event loop doesn't
# garbage-collect them mid-run (asyncio holds only weak refs to bare tasks).
_detect_tasks: set = set()


def _run_detection(pcm) -> None:
    """Update the sticky accent/gender/emotion trackers from one clip. Runs in a
    worker thread off the /stt response path, so it shapes the *next* turn's reply
    instead of delaying this one. Best-effort: per-classifier errors are swallowed."""
    for update in (
        accent_detect.tracker.update,
        gender_detect.tracker.update,
        emotion_detect.tracker.update,
    ):
        try:
            update(pcm)
        except Exception as e:
            print(f"[stt] background detection failed: {e}")


def _schedule_detection(pcm) -> None:
    task = asyncio.create_task(asyncio.to_thread(_run_detection, pcm))
    _detect_tasks.add(task)
    task.add_done_callback(_detect_tasks.discard)


async def _ritual_notifier_loop():
    """Fire the daily ritual reminder as a native OS notification the moment it's
    due (§6). Runs in the always-on backend, so it works even when the app window
    is backgrounded and its JS timers are suspended — the in-app banner alone isn't
    reliable there. Fires once per day; the in-app banner still greets on open."""
    while True:
        try:
            due = await asyncio.to_thread(companion.ritual_due)
            if due.get("due") and await asyncio.to_thread(companion.should_notify):
                prof = await asyncio.to_thread(companion.profile)
                text = await asyncio.to_thread(nudges.compose_nudge, due.get("kind"))
                # §4.8: past the end of the ladder the copy is empty, which means
                # send nothing. Mark it handled so we don't retry every 30s.
                if text:
                    await asyncio.to_thread(notify.send, prof.get("companion_name", "Poppy"), text)
                await asyncio.to_thread(companion.mark_notified)
            # A reveal that has reached its moment (§ Octalysis: unpredictability).
            # Separate from the ritual reminder on purpose: the ritual is the habit
            # cue and must stay at the time the user picked, while this is her
            # having something of her own to say and can arrive whenever.
            #
            # Capped hard. Once every few days at most, and never while a ritual
            # reminder is also pending, so the two can't stack into nagging.
            if not due.get("due") and await asyncio.to_thread(companion.reveal_notifiable):
                loop = await asyncio.to_thread(loops.newly_due)
                if loop:
                    prof = await asyncio.to_thread(companion.profile)
                    text = await asyncio.to_thread(loops.surface_text, loop)
                    if text and nudges.is_healthy(text):
                        await asyncio.to_thread(
                            notify.send, prof.get("companion_name", "Poppy"), text,
                        )
                        await asyncio.to_thread(companion.mark_reveal_notified)
                        await asyncio.to_thread(db.record_event, "reveal_surfaced")
        except Exception as e:
            print(f"[ritual] notifier loop error: {e}")
        await asyncio.sleep(30)


@app.on_event("startup")
async def _start_ritual_notifier():
    asyncio.create_task(_ritual_notifier_loop())


@app.on_event("startup")
async def _warmup_models():
    # Warm the heavy models in the background so the first turn is fast instead of
    # paying cold-load costs mid-conversation: Kokoro TTS and the Ollama LLM (which
    # then stays resident via keep_alive=-1).
    import tts
    import llm
    import stt
    import accent_detect
    import emotion_detect
    asyncio.create_task(asyncio.to_thread(tts.warmup))
    asyncio.create_task(llm.warmup())
    asyncio.create_task(asyncio.to_thread(stt.warmup))
    # Pre-load the wav2vec2 classifiers too, so the first /stt doesn't pay their
    # (multi-second) lazy load on top of transcription.
    asyncio.create_task(asyncio.to_thread(accent_detect._ensure_model))
    asyncio.create_task(asyncio.to_thread(emotion_detect._ensure_model))


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/settings")
async def settings():
    # Frontend reads this on load to initialize the voice-adaptation toggle so the
    # UI matches the server default, and to learn which avatar mode is active
    # ("3d" = local Three.js, "video" = cloud MuseTalk talking-head clips).
    return {"detection": DETECTION_DEFAULT, "avatar": AVATAR_BACKEND}


@app.get("/avatar/clip/{clip_id}")
async def avatar_clip(clip_id: str):
    """Serve a rendered talking-head clip (AVATAR_BACKEND=video). The chat socket
    sends the URL; the browser fetches the mp4 here and plays it."""
    data = await asyncio.to_thread(avatar.get_clip, clip_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Clip not found or expired")
    return Response(content=data, media_type="video/mp4")


@app.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    persona: str = Form("friendly"),
    detect: bool | None = Form(None),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")

    do_detect = DETECTION_DEFAULT if detect is None else detect

    pcm = await asyncio.to_thread(audio_utils.decode_16k_mono, data)
    # Transcription is the only work on the response's critical path, so /stt stays
    # ~0.4s whether or not adaptation is on.
    transcript = await asyncio.to_thread(transcribe, pcm)
    if do_detect:
        # Voice adaptation on: return the identity accumulated from prior turns
        # (the trackers are sticky) and classify *this* clip in the background so it
        # shapes the NEXT turn — never blocking this reply on the slow classifiers.
        detected_accent = accent_detect.tracker.current
        detected_gender = gender_detect.tracker.current
        emotion = emotion_detect.tracker.current
        _schedule_detection(pcm)
    else:
        # Detection off (default): no classifiers at all — reply uses default voice/tone.
        detected_accent = detected_gender = emotion = None

    if not transcript:
        return JSONResponse({
            "transcript": "", "empty": True,
            "accent": detected_accent, "gender": detected_gender, "emotion": emotion,
        })
    suggestion = persona_suggest.observe(transcript, persona)
    return {
        "transcript": transcript,
        "accent": detected_accent,
        "gender": detected_gender,
        "emotion": emotion,
        "suggestion": suggestion,
    }


@app.websocket("/ws/chat")
async def websocket_chat(ws: WebSocket):
    await handle_chat(ws)


@app.get("/personas")
async def list_personas():
    return persona_store.ui_list()


# ── Companion profile + call lifecycle (POPPY_PRODUCT_PLAYBOOK §2–§6) ──────────

@app.get("/characters")
async def list_characters():
    """The companion cast for the onboarding picker (name, gender, tagline, colour)."""
    return characters.ui_list()


@app.get("/companion")
async def get_companion():
    """Full profile. `onboarded=false` tells the frontend to run onboarding."""
    return await asyncio.to_thread(companion.profile)


@app.post("/companion")
async def onboard_companion(payload: dict = Body(...)):
    """Complete onboarding: pick a character, who becomes the companion.

    `seed` is the "one thing on your mind today" answer. Passing it here rather
    than only into the first call is what lets onboarding end non-empty (§2
    endowed progress): it becomes a real memory and the first open loop.
    """
    return await asyncio.to_thread(
        companion.create, payload.get("character", "poppy"), payload.get("seed"),
    )


@app.post("/companion/character")
async def switch_character(payload: dict = Body(...)):
    """Switch to a different character. Memory is per-character, so switching swaps
    whose memories are in play (streak/ritual stay — they're the user's own habit).
    The in-memory conversation context is reset so the new character starts fresh."""
    result = await asyncio.to_thread(companion.set_character, payload.get("character", "poppy"))
    await ws_clear_history()
    persona_suggest.reset()
    return result


@app.post("/companion/update")
async def update_companion(payload: dict = Body(...)):
    """Patch profile fields — vibe change, ritual pick, avatar swap (§6)."""
    return await asyncio.to_thread(lambda: companion.update(**payload))


@app.get("/companion/personality")
async def personality_status():
    """Has Poppy's personality (vibe-prompt version or model) changed under the user
    since she was created? Drives a deliberate 'Poppy's been updated' heads-up (§3.6)."""
    return await asyncio.to_thread(companion.personality_status)


@app.post("/companion/personality/accept")
async def accept_personality():
    """Re-pin to the current personality — the user chose to take the update."""
    return await asyncio.to_thread(companion.accept_personality_update)


@app.post("/call/open")
async def open_call(payload: dict = Body(default={})):
    """Start a call: roll the streak forward and return the line Poppy opens with.

    `seed` (optional) is the onboarding "one thing on your mind" answer (§2.6);
    `mode` frames a mood-mode call (§4.5). A newly-reached streak milestone (§6) is
    woven into the opener and returned so the UI can mark the moment."""
    data = payload or {}
    # Trust-as-code (§8): a paywall may only appear at an abundance moment, never a
    # vulnerable one. If it's due, signal it and do NOT open/record the call. A
    # vulnerable call (vent/wind, or later a distress turn) always passes through.
    if await asyncio.to_thread(billing.paywall_due, {"mode": data.get("mode")}):
        ent = await asyncio.to_thread(billing.entitlement)
        return {"paywall": ent}

    profile = await asyncio.to_thread(companion.record_call)
    # The milestone was reached when the streak was credited, at the *close* of the
    # qualifying call. It's surfaced here so she can make it a moment inside the
    # next conversation rather than a badge popup (§4.1).
    milestone = await asyncio.to_thread(streak.check_milestone)
    # §4.4: a level-up is a scene, not a toast. Surfaced here so she can notice it
    # herself mid-conversation, which is a reward no XP bar can produce.
    level_up = await asyncio.to_thread(bloom.take_level_up)
    ws_handler.mark_call_start()

    # ACT 1 (RETENTION_ENGINE §7): the opener pays off the open loop before
    # anything else. The seed call is the very first one (no history to owe), and
    # a mood-mode entry is already framed, so neither surfaces a loop.
    surfaced = None
    if not data.get("seed") and not data.get("mode"):
        surfaced = await asyncio.to_thread(companion.open_loop)

    line = await asyncio.to_thread(
        opening.compose, data.get("seed"), data.get("mode"), milestone, surfaced,
    )

    if surfaced:
        await asyncio.to_thread(loops.mark_surfaced, surfaced["id"])
        await asyncio.to_thread(db.record_event, "loop_surfaced")

    # §10: habit vs. prod. A call the user started themselves is worth more than
    # one a notification dragged in, and the ratio between them is the health of
    # the habit — so the two are distinguishable in the log.
    await asyncio.to_thread(db.record_event, "call_started")
    if data.get("source") != "notification":
        await asyncio.to_thread(db.record_event, "call_self_initiated")

    callback_offered = bool(surfaced)
    if callback_offered:
        await asyncio.to_thread(db.record_event, "callback_offered")
    return {
        "opening": line, "profile": profile,
        "milestone": milestone, "callback_offered": callback_offered,
        "surfaced_loop_id": surfaced["id"] if surfaced else None,
        "level_up": level_up,
    }


@app.post("/ritual")
async def set_ritual(payload: dict = Body(default={})):
    """Opt into (or clear) a daily ritual time the user picks themselves (§6)."""
    data = payload or {}
    prof = await asyncio.to_thread(companion.set_ritual, data.get("kind"), data.get("time"))
    if prof.get("ritual_kind"):
        await asyncio.to_thread(db.record_event, "ritual_set")
    return {"ritual_kind": prof.get("ritual_kind"), "ritual_time": prof.get("ritual_time")}


@app.get("/ritual/due")
async def ritual_due():
    """Whether a ritual reminder is due right now, with the copy to show (§6). The
    frontend polls this while on Home — a reliable in-app reminder that works even
    where the webview blocks Web Notifications."""
    due = await asyncio.to_thread(companion.ritual_due)
    if not due.get("due"):
        return {"due": False}
    text = await asyncio.to_thread(nudges.compose_nudge, due.get("kind"))
    if not text:
        return {"due": False}  # §4.8: past the ladder, silence is the message
    return {"due": True, "kind": due.get("kind"), "text": text}


@app.post("/ritual/dismiss")
async def ritual_dismiss():
    """Mark today's ritual reminder as handled so it stops showing (§6)."""
    await asyncio.to_thread(companion.mark_reminded)
    return {"ok": True}


@app.get("/nudge")
async def get_nudge():
    """The earned, guardrailed reminder copy in Poppy's voice (§6). Used for the
    in-app ritual reminder (and, on mobile later, the scheduled push)."""
    prof = await asyncio.to_thread(companion.profile)
    text = await asyncio.to_thread(nudges.compose_nudge, prof.get("ritual_kind"))
    return {"text": text}


@app.post("/call/close")
async def close_call(payload: dict = Body(default={})):
    """End a call: resolve the loop she opened on, author the next one (§1, §7 Act
    3), and log content-free call metrics (§12).

    `duration_s` is the call length; a call is "meaningful" at >= 60s (or if it
    saved a memory). The returned `open_loop` is the hook to render on the outro
    keepsake card.
    """
    data = payload or {}
    # Only this call's turns. The history survives across calls so she keeps
    # context, but the closing hook and the ritual answer must come from what was
    # just said, not from something the user resolved two calls ago.
    turns = ws_handler.current_call_turns()
    spoke = any(t.get("role") == "user" and t.get("content") for t in turns)

    # §1.3 Rule 3: the loop she opened on is resolved once the user actually
    # engaged with it. Hanging up without saying anything is not a resolution —
    # the loop stays live and gets another chance rather than being silently
    # counted as paid off.
    surfaced_id = data.get("surfaced_loop_id")
    if surfaced_id and spoke:
        await asyncio.to_thread(loops.resolve, surfaced_id)
        await asyncio.to_thread(db.record_event, "loop_resolved")

    # §5: if she raised the pact this call, read the answer back out of what they
    # said. A time they committed to out loud is an implementation intention; the
    # settings form sets the same field but not the same mechanic.
    ritual = None
    pact_was_due = await asyncio.to_thread(ritual_pact.is_due)
    if pact_was_due and spoke:
        answer = await asyncio.to_thread(ritual_pact.parse_from_turns, turns)
        await asyncio.to_thread(ritual_pact.mark_asked)
        if answer and answer.get("declined"):
            await asyncio.to_thread(companion.update, ritual_pact_declined=True)
            await asyncio.to_thread(db.record_event, "ritual_pact_declined")
        elif answer:
            await asyncio.to_thread(companion.set_ritual, answer["kind"], answer["time"])
            ritual = {
                **answer,
                "confirm": ritual_pact.confirm_line(answer["kind"], answer["time"]),
            }
            await asyncio.to_thread(db.record_event, "ritual_set")
            await asyncio.to_thread(db.record_event, "ritual_set_by_pact")

    # Rules she was given out loud in this call ("never ask me about my dad").
    # Read from the transcript for the same reason the ritual is: the natural way
    # to tell someone a boundary is to say it, not to find a settings screen.
    rules_set = []
    if spoke:
        for rule in await asyncio.to_thread(boundaries.parse_from_turns, turns):
            await asyncio.to_thread(boundaries.add, rule["kind"], rule["topic"])
            rules_set.append(rule)
        if rules_set:
            counts = await asyncio.to_thread(boundaries.counts)
            await asyncio.to_thread(
                db.record_event, "boundary_set", counts["avoid"] + counts["always"],
            )

    # §1.3 Rule 5: the end of every payoff is the start of the next hook, so a
    # call that had a real conversation never ends without planting one.
    planted = None
    if spoke:
        try:
            hook = await loop_author.author(turns)
            planted = await asyncio.to_thread(
                companion.add_open_loop, hook["hook"], hook["type"],
            )
        except Exception as e:
            print(f"[loops] could not plant a loop at close: {e}")
    if planted:
        await asyncio.to_thread(db.record_event, "loop_planted")

    # §5: a call that landed on its anchor also leaves the cadence hanging. This
    # is the weakest loop type by design, so it never takes the visible slot from
    # the conversational one, it just holds the habit between calls.
    if spoke:
        cadence = await asyncio.to_thread(ritual_pact.closing_loop)
        if cadence:
            await asyncio.to_thread(companion.add_open_loop, cadence, "ritual")

    duration = float(data.get("duration_s") or 0)
    meaningful = duration >= 60 or bool(data.get("saved_memory"))

    # §4.3: quests complete from what actually happened, never from the user
    # ticking a box. A quest finished without trying should feel like the app
    # noticing you.
    quest_done = False
    newly: list[str] = []
    if not await asyncio.to_thread(companion.daily_layer_off):
        signals = {
            "loop_resolved": bool(surfaced_id and spoke),
            "call_5min": duration >= 300,
            "ritual_time": bool(await asyncio.to_thread(ritual_pact.anchor_now)),
            # Read from what they said, not from a flag the client never sent.
            "good_thing": await asyncio.to_thread(quests.detect_good_thing, turns),
            "memory_saved": bool(data.get("saved_memory")),
            "memory_edited": bool(data.get("edited_memory")),
            "mood_new": bool(data.get("mood_new")),
        }
        newly = await asyncio.to_thread(quests.complete, signals)
        quest_done = bool(newly)
        for _ in newly:
            await asyncio.to_thread(db.record_event, "quest_completed")

    # §4.1: the day is credited here, not at call open, and only once the floor is
    # actually met. The floor is deliberately low so a bad day can still be kept.
    streak_status = None
    if await asyncio.to_thread(streak.qualifies, duration, quest_done or data.get("quest_done")):
        streak_status = await asyncio.to_thread(streak.record_activity)
        await asyncio.to_thread(db.record_event, "streak_day", streak_status["current"])
        # §4.1's Long Year. The one thing that exists only at 365 days, and the
        # only thing in the product a user a year in has left to reach.
        if await asyncio.to_thread(streak.mark_long_year):
            await asyncio.to_thread(garden.plant_long_year)
            await asyncio.to_thread(db.record_event, "long_year")

    # §3.1: a call plants a bud, a call with something real in it blooms. Absence
    # never removes anything, so there is no path here that takes a flower away.
    #
    # Gated on the same floor as the streak rather than on whether they spoke, so
    # one call grows exactly one thing and the garden can't disagree with the day
    # the streak just credited.
    if streak_status:
        await asyncio.to_thread(
            garden.plant, data.get("mode") or "talk", bool(meaningful),
        )

    # §4.4: depth, not duration. Note there is deliberately no award keyed to how
    # long the call ran past the floor, which is what makes the number
    # un-grindable and stops a user optimising BP from optimising minutes.
    if not await asyncio.to_thread(companion.daily_layer_off):
        if streak_status:
            await asyncio.to_thread(bloom.award, "call")
        if surfaced_id and spoke:
            await asyncio.to_thread(bloom.award, "loop_resolved")
        if data.get("saved_memory"):
            await asyncio.to_thread(bloom.award, "memory_saved")
        if data.get("edited_memory"):
            await asyncio.to_thread(bloom.award, "memory_edited")
        if await asyncio.to_thread(ritual_pact.anchor_now):
            await asyncio.to_thread(bloom.award, "ritual_hit")
        if quest_done:
            await asyncio.to_thread(bloom.award, "quest", len(newly))

    await asyncio.to_thread(db.record_event, "call_ended", duration)
    if meaningful:
        await asyncio.to_thread(db.record_event, "meaningful_session", duration)
        if data.get("callback_offered"):
            await asyncio.to_thread(db.record_event, "callback_landed")
    return {
        "ok": True,
        "meaningful": meaningful,
        "open_loop": planted.get("hook_text") if planted else None,
        "ritual": ritual,
        "streak": streak_status,
        "rules_set": rules_set,
    }


@app.get("/entitlement")
async def get_entitlement():
    """Current tier, the fair daily-call budget, and how much is left (§8)."""
    return await asyncio.to_thread(billing.entitlement)


@app.post("/entitlement")
async def set_entitlement(payload: dict = Body(...)):
    """Change tier. On desktop this is a local stub; on mobile it's gated by the
    store's purchase flow through the thin cloud (D2)."""
    ent = await asyncio.to_thread(billing.set_plan, payload.get("plan", "free"))
    await asyncio.to_thread(db.record_event, "plan_" + ent["plan"])
    return ent


@app.get("/referral")
async def get_referral():
    """The user's share code + copy for the referral loop (§7)."""
    return await asyncio.to_thread(billing.referral)


@app.get("/update")
async def get_update():
    """Whether a newer version has been released.

    The only network request this app makes. Off with one switch, once a day at
    most, sends nothing about the user, and silently reports nothing on any
    failure: an offline app that complains about being offline is worse than one
    that says nothing.
    """
    state = await asyncio.to_thread(updates.check)
    state["notice"] = await asyncio.to_thread(updates.notice)
    return state


@app.post("/update/check")
async def set_update_check(payload: dict = Body(default={})):
    """Turn the version check on or off. Off means no network request is built."""
    on = bool((payload or {}).get("on", True))
    enabled = await asyncio.to_thread(updates.set_enabled, on)
    await asyncio.to_thread(db.record_event, "update_check_on" if enabled else "update_check_off")
    return {"enabled": enabled}


@app.get("/boundaries")
async def get_boundaries():
    """What she was told never to raise, and what to always ask about."""
    return await asyncio.to_thread(boundaries.get)


@app.post("/boundaries")
async def set_boundary(payload: dict = Body(default={})):
    """Add or remove a rule. `{"kind": "avoid"|"always", "topic": str, "remove": bool}`

    Only counts are logged. A boundary is the user's own words about their own
    life, so the text stays in the local store.
    """
    data = payload or {}
    kind, topic = data.get("kind", ""), data.get("topic", "")
    if data.get("remove"):
        result = await asyncio.to_thread(boundaries.remove, kind, topic)
    else:
        result = await asyncio.to_thread(boundaries.add, kind, topic)
    counts = await asyncio.to_thread(boundaries.counts)
    await asyncio.to_thread(db.record_event, "boundary_set", counts["avoid"] + counts["always"])
    return result


@app.get("/garden")
async def get_garden():
    """The garden (§3.1). Carries no number of any kind: the counting all lives on
    the /bloom surface, and the moment one appears here the user starts gardening
    for a score instead of talking."""
    return await asyncio.to_thread(garden.state)


@app.post("/garden/arrange")
async def arrange_garden(payload: dict = Body(default={})):
    """Save where the user placed their flowers (§3.1).

    The one thing this product gave the user no way to do was make something.
    Rearranging their own garden is that, and unlike a level it never runs out.
    """
    moved = await asyncio.to_thread(garden.arrange, (payload or {}).get("positions") or {})
    if moved:
        await asyncio.to_thread(db.record_event, "garden_arranged", moved)
    return {"moved": moved}


@app.post("/garden/label")
async def label_flower(payload: dict = Body(default={})):
    """Name a flower, or clear its name with an empty string (§3.1).

    Only a count is logged, never the text: a label is the user's own words about
    their own life and belongs in the encrypted local store, not in analytics.
    """
    data = payload or {}
    f = await asyncio.to_thread(garden.label, data.get("id", ""), data.get("label", ""))
    if f is None:
        raise HTTPException(status_code=404, detail="No such flower")
    await asyncio.to_thread(
        db.record_event, "garden_labelled", await asyncio.to_thread(garden.labelled_count),
    )
    return {"id": f["id"], "label": f.get("label")}


@app.get("/garden/year")
async def get_year():
    """"My year with Poppy" (§3.1): the private-by-default share artifact."""
    return await asyncio.to_thread(garden.year_in_review)


@app.get("/bloom")
async def get_bloom():
    """Level, band, and the distance to the next level only when the user is
    inside the last 20% of it (§4.4's goal gradient)."""
    if await asyncio.to_thread(companion.daily_layer_off):
        return {"off": True}
    return await asyncio.to_thread(bloom.status)


@app.get("/quests")
async def get_quests():
    """Today's three quests, the chosen goal, and the ring (§4.2, §4.3). Slot 1 is
    always the open loop. Empty when the daily layer is switched off."""
    if await asyncio.to_thread(companion.daily_layer_off):
        return {"off": True}
    return await asyncio.to_thread(quests.status)


@app.post("/goal")
async def set_goal(payload: dict = Body(default={})):
    """Pick the daily goal. A goal the user chose out loud in a call is an
    implementation intention and outperforms one the app assigned (§4.2)."""
    result = await asyncio.to_thread(quests.set_goal, (payload or {}).get("goal"))
    await asyncio.to_thread(db.record_event, "goal_set")
    return result


@app.post("/daily-layer")
async def set_daily_layer(payload: dict = Body(default={})):
    """§4.9: "Just let me talk to her" hides the counting layer entirely.

    Tracked so that cohort's retention can be compared against everyone else's,
    which is the point of the guardrail: in products like this they retain best.
    Nothing here ever nags them back.
    """
    off = bool((payload or {}).get("off"))
    await asyncio.to_thread(companion.update, daily_layer_off=off)
    await asyncio.to_thread(db.record_event, "daily_layer_off" if off else "daily_layer_on")
    return {"off": off}


@app.get("/long-year")
async def get_long_year():
    """The Long Year (§4.1): visible from day one as a distant known-unknown.

    Deliberately not a countdown. The distance is withheld until the user is
    nearly there, and there is nothing to lose by never arriving, which is what
    separates an aspiration from a threat.
    """
    return await asyncio.to_thread(streak.long_year)


@app.get("/streak")
async def get_streak():
    """The full streak state (§4.1): the count, which of the five states it's in,
    freezes in hand, and the seven Perfect Week dots."""
    return await asyncio.to_thread(streak.status)


@app.post("/streak/repair")
async def repair_streak():
    """Restore a streak broken within the last 48 hours. Free, once a calendar
    month, no ceremony. Charging to undo an emotional-sounding failure is the one
    thing §4.1 marks red about repair, so there is no payment path here at all."""
    result = await asyncio.to_thread(streak.repair)
    await asyncio.to_thread(db.record_event, "streak_repaired", result["current"])
    return result


@app.get("/metrics")
async def get_metrics():
    """The §12 dashboard, computed from content-free local events. Optimizes for
    meaningful sessions + trust, never minutes-in-app (§5.5)."""
    return await asyncio.to_thread(metrics.dashboard)


@app.get("/home")
async def home():
    """Everything the home screen needs in one call (§3): who Poppy is, the single
    open loop, and the streak.

    RETENTION_ENGINE §1.4 surface 2: the strip is the ranked open loop **in her
    voice**, because it doubles as the reason to tap Call. It is not labelled or
    framed as an app notice — the itch works only if it reads as her talking.
    """
    profile = await asyncio.to_thread(companion.profile)
    loop = await asyncio.to_thread(companion.open_loop)
    remembers = await asyncio.to_thread(loops.surface_text, loop)
    if not remembers:
        facts = await asyncio.to_thread(memory_store.recall)
        if facts:
            remembers = f"I remember: {facts[-1]}"
    return {
        "companion_name": profile.get("companion_name", "Poppy"),
        "character": profile.get("character", "poppy"),
        "gender": profile.get("gender", "female"),
        "vibe": profile.get("vibe", "friend"),
        "avatar": profile.get("avatar", "brunette"),
        "remembers": remembers,
        "closeness": await asyncio.to_thread(companion.closeness),
        "streak": await asyncio.to_thread(streak.status),
        # §4.1: the user learns a freeze was spent *after* the fact, warmly. Read
        # once and cleared, so it's a moment rather than a running tally.
        "freeze_notice": await asyncio.to_thread(streak.take_freeze_notice),
        "current_streak": profile.get("current_streak", 0),
        "total_calls": profile.get("total_calls", 0),
        "ritual_kind": profile.get("ritual_kind"),
        "ritual_time": profile.get("ritual_time"),
    }


@app.get("/sessions")
async def list_sessions():
    return await asyncio.to_thread(db.list_sessions)


@app.get("/export/{session_id}")
async def export_session(session_id: str):
    turns = await asyncio.to_thread(db.get_turns, session_id)
    if not turns:
        raise HTTPException(status_code=404, detail="Session not found")
    lines = [f"[{t['created_at']}] {t['role'].upper()}: {t['content']}" for t in turns]
    return JSONResponse({"session_id": session_id, "turns": turns, "text": "\n".join(lines)})


@app.get("/memory")
async def get_memory():
    """The typed records for the "What Poppy knows about you" screen (§5)."""
    recs = await asyncio.to_thread(memory_store.records)
    return {"records": recs, "categories": list(memory_store.CATEGORIES)}


@app.post("/memory/extract")
async def extract_memory(payload: dict = Body(...)):
    """Pull out what is worth remembering from what the user just said, and keep it.

    This used to only propose, and every single memory required tapping "Save" on
    a prompt. In use that was constant interruption during a conversation, and
    anything not tapped in time was simply lost, which is why she kept failing to
    remember things that had plainly been said.

    Saving is automatic now. The promise it replaces was consent-before-storing,
    so the guarantees that remain have to carry the weight, and they do: nothing
    leaves the device, every memory is listed in one place, each one is editable
    and deletable in a tap, "forget everything" is one button, and a subject she
    has been told to avoid is never captured at all.
    """
    candidates = await memory_extract.propose(payload.get("text", ""))
    saved = []
    for c in candidates:
        rec = await asyncio.to_thread(
            memory_store.remember, c["text"], c.get("category", "ongoing"), c.get("why"),
        )
        if rec:
            saved.append(rec)
            await asyncio.to_thread(db.record_event, "memory_saved")
    return {"candidates": candidates, "saved": [
        {"id": r["id"], "text": r["text"], "category": r["category"]} for r in saved
    ]}


@app.post("/memory/confirm")
async def confirm_memory(payload: dict = Body(...)):
    """Store a candidate the user approved (Save / Edit-then-Save) (§3.2)."""
    rec = await asyncio.to_thread(
        memory_store.remember,
        payload.get("text", ""),
        payload.get("category", "ongoing"),
        payload.get("why"),
        bool(payload.get("sensitive", False)),
    )
    if rec:
        await asyncio.to_thread(db.record_event, "memory_saved")
    return {"record": rec}


@app.post("/memory/suppress")
async def suppress_memory(payload: dict = Body(...)):
    """"Never remember this kind" — stop proposing a whole category (§3.2)."""
    await asyncio.to_thread(memory_store.suppress_category, payload.get("category", ""))
    return {"ok": True}


@app.patch("/memory/{fact_id}")
async def edit_memory(fact_id: str, payload: dict = Body(...)):
    rec = await asyncio.to_thread(memory_store.update, fact_id, payload.get("text", ""))
    if not rec:
        raise HTTPException(status_code=404, detail="Fact not found")
    await asyncio.to_thread(db.record_event, "memory_edited")
    return {"record": rec}


@app.delete("/memory/{fact_id}")
async def delete_memory(fact_id: str):
    deleted = await asyncio.to_thread(memory_store.delete, fact_id)
    if deleted:
        await asyncio.to_thread(db.record_event, "memory_deleted")
    return {"deleted": deleted}


@app.delete("/memory")
async def forget_memory():
    await asyncio.to_thread(memory_store.forget_all)
    return {"forgotten": True}


@app.delete("/history")
async def clear_history():
    await ws_clear_history()
    persona_suggest.reset()
    return {"cleared": True}


# Serve frontend at / — must come AFTER all API routes
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
