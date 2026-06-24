import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, WebSocket
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from stt import transcribe
from ws_handler import handle_chat, clear_history as ws_clear_history
import personas as persona_store
import accent
import memory_store
import db

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="Private Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    persona: str = Form("friendly"),
):
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio file")
    suffix = ".webm"
    if audio.content_type and "/" in audio.content_type:
        ext = audio.content_type.split("/")[-1].split(";")[0]
        suffix = f".{ext}"
    transcript = transcribe(data, suffix=suffix)
    if not transcript:
        return JSONResponse({"transcript": "", "empty": True})
    suggestion = accent.observe(transcript, persona)
    return {"transcript": transcript, "suggestion": suggestion}


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
    accent.reset()
    return {"cleared": True}


# Serve frontend at / — must come AFTER all API routes
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
