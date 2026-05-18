from __future__ import annotations
import os
import time
from typing import Any
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import structlog

router = APIRouter()
_start_time = time.time()
AGENT_ID = os.environ.get("AGENT_ID", "unknown")

# ── Log ring buffer ────────────────────────────────────────────────────────────
_log_buffer: list[dict[str, Any]] = []
_MAX_LOGS = 500


class _RingBufferProcessor:
    """structlog processor that captures every log event into the ring buffer."""
    def __call__(self, logger: Any, method: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        import time as _t
        level = method if method in ("debug", "info", "warning", "error", "critical") else "info"
        _log_buffer.append({
            "timestamp": _t.strftime("%Y-%m-%dT%H:%M:%SZ", _t.gmtime()),
            "level": level,
            "message": str(event_dict.get("event", "")),
            **{k: str(v) for k, v in event_dict.items() if k not in ("event", "_record")},
        })
        if len(_log_buffer) > _MAX_LOGS:
            _log_buffer.pop(0)
        return event_dict


def configure_structlog() -> None:
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


log = structlog.get_logger()


def get_state(request: Request) -> Any:
    return request.app.state


@router.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "agentId": AGENT_ID, "uptime": time.time() - _start_time}


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


@router.get("/logs")
async def logs(limit: int = 100, level: str = "info") -> dict[str, Any]:
    level_order = {"debug": 0, "info": 1, "warning": 2, "error": 3}
    min_level = level_order.get(level.lower(), 1)
    filtered = [e for e in _log_buffer if level_order.get(e.get("level", "info").lower(), 1) >= min_level]
    return {"logs": filtered[-limit:], "agentId": AGENT_ID}


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


@router.post("/tasks", status_code=202)
async def receive_task(request: Request) -> dict[str, Any]:
    from ..communication.task_receiver import TaskPayload
    s = get_state(request)
    body = await request.json()
    payload = TaskPayload.model_validate(body)
    log.info("task_received_http", sender=payload.senderId, task_id=payload.taskId)
    task_id = await s.task_receiver.receive(payload)
    return {"taskId": task_id, "status": "accepted"}


@router.get("/tasks")
async def list_tasks(request: Request, limit: int = 50) -> dict[str, Any]:
    s = get_state(request)
    tasks = [t.model_dump() for t in s.task_receiver._tasks[-limit:]]
    return {"tasks": tasks, "agentId": AGENT_ID}


@router.post("/llm-callback/{task_id}")
async def llm_callback(task_id: str, request: Request) -> dict[str, Any]:
    s = get_state(request)
    body = await request.json()
    if "error" in body:
        log.error("llm_callback_error", task_id=task_id, error=body["error"])
        await s.task_receiver.fail(task_id, body["error"])
        return {"ok": False}
    log.info("llm_callback_ok", task_id=task_id)
    await s.task_receiver.complete(task_id, body.get("output", ""))
    return {"ok": True}


@router.post("/files")
async def receive_file(request: Request) -> dict[str, Any]:
    from ..communication.file_receiver import FilePayload
    s = get_state(request)
    body = await request.json()
    payload = FilePayload.model_validate(body)
    path = await s.file_receiver.receive(payload)
    return {"path": path}


class ChatBody(BaseModel):
    message: str


@router.post("/chat")
async def chat(body: ChatBody, request: Request) -> dict[str, Any]:
    from ..communication.task_receiver import TaskPayload
    s = get_state(request)
    task_id = await s.task_receiver.receive(TaskPayload(instruction=body.message, senderId="chat"))
    return {"taskId": task_id, "status": "processing"}


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


@router.get("/config")
async def get_config(request: Request) -> dict[str, Any]:
    s = get_state(request)
    return s.config.model_dump()
