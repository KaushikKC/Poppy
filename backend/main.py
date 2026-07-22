import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from stt import transcribe
from config import DETECTION_DEFAULT
from ws_handler import handle_chat, clear_history as ws_clear_history
import personas as persona_store
import persona_suggest
import companion
import opening
import nudges
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
    # UI matches the server default.
    return {"detection": DETECTION_DEFAULT}


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

@app.get("/companion")
async def get_companion():
    """Full profile. `onboarded=false` tells the frontend to run onboarding."""
    return await asyncio.to_thread(companion.profile)


@app.post("/companion")
async def onboard_companion(payload: dict = Body(...)):
    """Complete onboarding: name Poppy, pick a vibe and a look (§2.3/§2.4)."""
    return await asyncio.to_thread(
        companion.create,
        payload.get("companion_name", ""),
        payload.get("vibe", "friend"),
        payload.get("avatar", "avaturn"),
    )


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
    line = await asyncio.to_thread(opening.compose, data.get("seed"), data.get("mode"), milestone)
    # A "callback" is offered when the opener follows up on a stored open loop —
    # not on the first-call seed or a mood-mode entry (§12 "she knows me" proxy).
    callback_offered = bool(
        not data.get("seed") and not data.get("mode")
        and await asyncio.to_thread(companion.latest_open_loop)
    )
    await asyncio.to_thread(db.record_event, "call_started")
    if callback_offered:
        await asyncio.to_thread(db.record_event, "callback_offered")
    return {
        "opening": line, "profile": profile,
        "milestone": milestone, "callback_offered": callback_offered,
    }


@app.post("/ritual")
async def set_ritual(payload: dict = Body(default={})):
    """Opt into (or clear) a daily ritual time the user picks themselves (§6)."""
    data = payload or {}
    prof = await asyncio.to_thread(companion.set_ritual, data.get("kind"), data.get("time"))
    if prof.get("ritual_kind"):
        await asyncio.to_thread(db.record_event, "ritual_set")
    return {"ritual_kind": prof.get("ritual_kind"), "ritual_time": prof.get("ritual_time")}


@app.get("/nudge")
async def get_nudge():
    """The earned, guardrailed reminder copy in Poppy's voice (§6). Used for the
    in-app ritual reminder (and, on mobile later, the scheduled push)."""
    prof = await asyncio.to_thread(companion.profile)
    text = await asyncio.to_thread(nudges.compose_nudge, prof.get("ritual_kind"))
    return {"text": text}


@app.post("/call/close")
async def close_call(payload: dict = Body(default={})):
    """End a call: store the forward hook Poppy planted (§4) and log content-free
    call metrics (§12). `duration_s` is the call length; a call is "meaningful" at
    >= 60s (or if it saved a memory)."""
    data = payload or {}
    loop = data.get("open_loop")
    if loop:
        await asyncio.to_thread(companion.add_open_loop, loop)

    duration = float(data.get("duration_s") or 0)
    meaningful = duration >= 60 or bool(data.get("saved_memory"))
    await asyncio.to_thread(db.record_event, "call_ended", duration)
    if meaningful:
        await asyncio.to_thread(db.record_event, "meaningful_session", duration)
        if data.get("callback_offered"):
            await asyncio.to_thread(db.record_event, "callback_landed")
    return {"ok": True, "meaningful": meaningful}


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
    """Everything the home screen needs in one call (§3): who Poppy is, the
    "she remembers" callback strip, and the streak."""
    profile = await asyncio.to_thread(companion.profile)
    loop = await asyncio.to_thread(companion.latest_open_loop)
    remembers = None
    if loop:
        remembers = f"Last time — {loop}"
    else:
        facts = await asyncio.to_thread(memory_store.recall)
        if facts:
            remembers = f"I remember: {facts[-1]}"
    return {
        "companion_name": profile.get("companion_name", "Poppy"),
        "vibe": profile.get("vibe", "friend"),
        "avatar": profile.get("avatar", "avaturn"),
        "remembers": remembers,
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
