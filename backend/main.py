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
import opening
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
                await asyncio.to_thread(notify.send, prof.get("companion_name", "Poppy"), text)
                await asyncio.to_thread(companion.mark_notified)
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
    """Complete onboarding: pick a character, who becomes the companion."""
    return await asyncio.to_thread(companion.create, payload.get("character", "poppy"))


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
    milestone = await asyncio.to_thread(companion.check_milestone)

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
    turns = list(ws_handler.conversation_history)
    spoke = any(t.get("role") == "user" and t.get("content") for t in turns)

    # §1.3 Rule 3: the loop she opened on is resolved once the user actually
    # engaged with it. Hanging up without saying anything is not a resolution —
    # the loop stays live and gets another chance rather than being silently
    # counted as paid off.
    surfaced_id = data.get("surfaced_loop_id")
    if surfaced_id and spoke:
        await asyncio.to_thread(loops.resolve, surfaced_id)
        await asyncio.to_thread(db.record_event, "loop_resolved")

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

    duration = float(data.get("duration_s") or 0)
    meaningful = duration >= 60 or bool(data.get("saved_memory"))
    await asyncio.to_thread(db.record_event, "call_ended", duration)
    if meaningful:
        await asyncio.to_thread(db.record_event, "meaningful_session", duration)
        if data.get("callback_offered"):
            await asyncio.to_thread(db.record_event, "callback_landed")
    return {
        "ok": True,
        "meaningful": meaningful,
        "open_loop": planted.get("hook_text") if planted else None,
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
    """Propose (never store) candidate memories from what the user just said (§3.1).
    The frontend turns these into "Want me to remember that?" consent prompts."""
    candidates = await memory_extract.propose(payload.get("text", ""))
    return {"candidates": candidates}


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
