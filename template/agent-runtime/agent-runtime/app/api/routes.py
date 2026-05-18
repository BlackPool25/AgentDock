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

# In-memory log buffer (ring buffer, last 500 entries)
_log_buffer: list[dict[str, Any]] = []
_MAX_LOGS = 500


def _capture_log(level: str, message: str, **kwargs: Any) -> None:
    import time as _time
    _log_buffer.append({
        "timestamp": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
        "level": level,
        "message": message,
        **{k: str(v) for k, v in kwargs.items()},
    })
    if len(_log_buffer) > _MAX_LOGS:
        _log_buffer.pop(0)


class _RingBufferProcessor:
    """structlog processor that captures all log events into the ring buffer."""
    def __call__(self, logger: Any, method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        level = method if method in ("debug", "info", "warning", "error", "critical") else "info"
        message = str(event_dict.get("event", ""))
        extra = {k: v for k, v in event_dict.items() if k not in ("event", "_record", "level", "message")}
        _capture_log(level, message, **extra)
        return event_dict

def configure_structlog() -> None:
    """Configure structlog to capture into ring buffer + render to stdout."""
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            _RingBufferProcessor(),
            structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(0),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )



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
    tr = s.task_receiver
    return {
        "agentId": AGENT_ID,
        "status": "running",
        "currentTask": tr._current_task,
        "memoryFiles": [f.filename for f in files],
        "lastActivity": tr._last_activity,
        "uptime": time.time() - _start_time,
    }


# ─── Logs ─────────────────────────────────────────────────────────────────────
@router.get("/logs")
async def logs(limit: int = 100, level: str = "info") -> dict[str, Any]:
    level_order = {"debug": 0, "info": 1, "warning": 2, "error": 3}
    min_level = level_order.get(level.lower(), 1)
    filtered = [
        entry for entry in _log_buffer
        if level_order.get(entry.get("level", "info").lower(), 1) >= min_level
    ]
    return {"logs": filtered[-limit:], "agentId": AGENT_ID}


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
    _capture_log("info", f"Task received from {payload.senderId}", taskId=payload.taskId, sender=payload.senderId)
    task_id = await s.task_receiver.receive(payload)
    return {"taskId": task_id, "status": "accepted"}


@router.get("/tasks")
async def list_tasks(request: Request, limit: int = 50) -> dict[str, Any]:
    s = get_state(request)
    tasks = [t.model_dump() for t in s.task_receiver._tasks[-limit:]]
    return {"tasks": tasks, "agentId": AGENT_ID}


# ─── LLM Callback ─────────────────────────────────────────────────────────────
@router.post("/llm-callback/{task_id}")
async def llm_callback(task_id: str, request: Request) -> dict[str, Any]:
    s = get_state(request)
    body = await request.json()
    if "error" in body:
        err = body["error"]
        _capture_log("error", f"LLM job failed for task {task_id}", taskId=task_id, error=err)
        log.error("llm_callback_error", task_id=task_id, error=err)
        await s.task_receiver.fail(task_id, err)
        return {"ok": False}
    _capture_log("info", f"LLM job completed for task {task_id}", taskId=task_id)
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
    from ..communication.task_receiver import TaskPayload
    s = get_state(request)
    _capture_log("info", f"Chat message received", message=body.message[:100])
    payload = TaskPayload(instruction=body.message, senderId="chat")
    task_id = await s.task_receiver.receive(payload)
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
    return cfg
