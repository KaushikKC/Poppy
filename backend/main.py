import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, WebSocket
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ollama_client import stream_reply
from stt import transcribe
from ws_handler import handle_chat, clear_history as ws_clear_history
from config import MAX_HISTORY_TURNS
import db

FRONTEND_DIR = Path(__file__).parent.parent / "frontend"

app = FastAPI(title="Private Companion Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

conversation_history: list[dict] = []


class ChatRequest(BaseModel):
    text: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(req: ChatRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    full_reply = []

    async def token_stream():
        async for token in stream_reply(conversation_history, req.text):
            full_reply.append(token)
            yield token

        assistant_text = "".join(full_reply)
        conversation_history.append({"role": "user", "content": req.text})
        conversation_history.append({"role": "assistant", "content": assistant_text})

        if len(conversation_history) > MAX_HISTORY_TURNS * 2:
            del conversation_history[: len(conversation_history) - MAX_HISTORY_TURNS * 2]

    return StreamingResponse(token_stream(), media_type="text/plain")


@app.post("/stt")
async def speech_to_text(audio: UploadFile = File(...)):
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
    return {"transcript": transcript}


@app.websocket("/ws/chat")
async def websocket_chat(ws: WebSocket):
    await handle_chat(ws)


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


@app.delete("/history")
async def clear_history():
    conversation_history.clear()
    await ws_clear_history()
    return {"cleared": True}


# Serve frontend at / — must come AFTER all API routes
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
