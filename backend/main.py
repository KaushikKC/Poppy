from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from ollama_client import stream_reply
from config import MAX_HISTORY_TURNS

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


@app.delete("/history")
async def clear_history():
    conversation_history.clear()
    return {"cleared": True}
