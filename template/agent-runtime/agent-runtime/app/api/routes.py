from __future__ import annotations
import os
import time
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import structlog

log = structlog.get_logger()

router = APIRouter()
_start_time = time.time()
AGENT_ID = os.environ.get("AGENT_ID", "unknown")


def get_state(request: Request) -> Any:
    return request.app.state


# ─── Health ───────────────────────────────────────────────────────────────────
@router.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "agentId": AGENT_ID, "uptime": time.time() - _start_time}


# ─── Status ───────────────────────────────────────────────────────────────────
@router.get("/status")
async def status(request: Request) -> dict[str, Any]:
    s = get_state(request)
    files = await s.memory.list_files()
    return {
        "agentId": AGENT_ID,
        "status": "running",
        "currentTask": None,
        "memoryFiles": [f.filename for f in files],
        "lastActivity": None,
        "uptime": time.time() - _start_time,
    }


# ─── Logs ─────────────────────────────────────────────────────────────────────
@router.get("/logs")
async def logs(limit: int = 100, level: str = "info") -> dict[str, Any]:
    return {"logs": [], "agentId": AGENT_ID}


# ─── Memory ───────────────────────────────────────────────────────────────────
@router.get("/memory")
async def list_memory(request: Request) -> dict[str, Any]:
    s = get_state(request)
    files = await s.memory.list_files()
    return {"files": [f.__dict__ for f in files]}


@router.get("/memory/{filename:path}")
async def get_memory_file(filename: str, request: Request) -> dict[str, Any]:
    s = get_state(request)
    try:
        content = await s.memory.read(filename)
        return {"filename": filename, "content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")


class MemoryWriteBody(BaseModel):
    content: str


@router.put("/memory/{filename:path}")
async def write_memory_file(filename: str, body: MemoryWriteBody, request: Request) -> dict[str, Any]:
    s = get_state(request)
    await s.memory.write(filename, body.content)
    return {"ok": True}


# ─── Tasks ────────────────────────────────────────────────────────────────────
@router.post("/tasks", status_code=202)
async def receive_task(request: Request) -> dict[str, Any]:
    from ..communication.task_receiver import TaskPayload
    s = get_state(request)
    body = await request.json()
    payload = TaskPayload.model_validate(body)
    task_id = await s.task_receiver.receive(payload)
    return {"taskId": task_id, "status": "accepted"}


@router.get("/tasks")
async def list_tasks() -> dict[str, Any]:
    return {"tasks": []}


# ─── LLM Callback ─────────────────────────────────────────────────────────────
@router.post("/llm-callback/{task_id}")
async def llm_callback(task_id: str, request: Request) -> dict[str, Any]:
    s = get_state(request)
    body = await request.json()
    if "error" in body:
        log.error("llm_callback_error", task_id=task_id, error=body["error"])
        return {"ok": False}
    await s.task_receiver.complete(task_id, body.get("output", ""))
    return {"ok": True}


# ─── Files ────────────────────────────────────────────────────────────────────
@router.post("/files")
async def receive_file(request: Request) -> dict[str, Any]:
    from ..communication.file_receiver import FilePayload
    s = get_state(request)
    body = await request.json()
    payload = FilePayload.model_validate(body)
    path = await s.file_receiver.receive(payload)
    return {"path": path}


# ─── Chat ─────────────────────────────────────────────────────────────────────
class ChatBody(BaseModel):
    message: str


@router.post("/chat")
async def chat(body: ChatBody, request: Request) -> dict[str, Any]:
    import uuid
    s = get_state(request)
    task_id = await s.task_receiver.receive(
        __import__("app.communication.task_receiver", fromlist=["TaskPayload"]).TaskPayload(
            instruction=body.message,
            senderId="chat",
        )
    )
    return {"taskId": task_id, "status": "processing"}


# ─── Shell ────────────────────────────────────────────────────────────────────
class ShellBody(BaseModel):
    command: str
    timeout: int = 60


@router.post("/shell")
async def run_shell(body: ShellBody, request: Request) -> dict[str, Any]:
    s = get_state(request)
    try:
        result = await s.shell.execute(body.command, body.timeout)
        return {"exitCode": result.exit_code, "stdout": result.stdout, "stderr": result.stderr}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ─── Config ───────────────────────────────────────────────────────────────────
@router.get("/config")
async def get_config(request: Request) -> dict[str, Any]:
    s = get_state(request)
    cfg = s.config.model_dump()
    # Redact any potential secrets
    return cfg
