import asyncio
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from stt import transcribe
from config import DETECTION_DEFAULT
from ws_handler import handle_chat, clear_history as ws_clear_history
import personas as persona_store
import persona_suggest
import memory_store
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
    facts = await asyncio.to_thread(memory_store.recall)
    return {"facts": facts}


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
