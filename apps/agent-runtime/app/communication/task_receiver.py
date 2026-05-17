from __future__ import annotations
import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
import structlog
from pydantic import BaseModel

log = structlog.get_logger()

AGENT_ID = os.environ.get("AGENT_ID", "unknown")
ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://orchestrator:4000")


class AttachedFile(BaseModel):
    filename: str
    content: str  # base64
    mimeType: str


class TaskPayload(BaseModel):
    taskId: Optional[str] = None
    senderId: str = "orchestrator"
    instruction: str
    context: dict[str, Any] = {}
    attachedFiles: list[AttachedFile] = []


class TaskReceiver:
    def __init__(self, memory_manager: Any, llm_client: Any) -> None:
        self.memory = memory_manager
        self.llm = llm_client
        self._pending: dict[str, TaskPayload] = {}

    async def receive(self, payload: TaskPayload) -> str:
        task_id = payload.taskId or str(uuid.uuid4())
        payload.taskId = task_id

        # Save attached files
        for f in payload.attachedFiles:
            dest = Path(f"/storage/received/{payload.senderId}/{f.filename}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(base64.b64decode(f.content))

        # Write to task queue memory
        ts = datetime.now(timezone.utc).isoformat()
        await self.memory.append(
            "task_queue.md",
            f"## Task {task_id}\n- **From:** {payload.senderId}\n- **Time:** {ts}\n- **Status:** pending\n\n{payload.instruction}",
        )
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: processing\n")

        # Build messages for LLM
        messages: list[dict[str, str]] = []
        if self.llm.provider and hasattr(self.llm, "provider"):
            pass  # system prompt injected by LLM client from config
        messages.append({"role": "user", "content": payload.instruction})

        self._pending[task_id] = payload
        await self.llm.submit(messages, callback_path=f"/llm-callback/{task_id}")
        log.info("task_received", task_id=task_id, sender=payload.senderId)
        return task_id

    async def complete(self, task_id: str, output: str) -> None:
        await self.memory.write(f"output_{task_id}.md", output)
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: completed\n")
        self._pending.pop(task_id, None)

        # Notify orchestrator
        import httpx
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{ORCHESTRATOR_URL}/internal/events",
                    json={
                        "type": "agent:task:completed",
                        "agentId": AGENT_ID,
                        "taskId": task_id,
                        "output": output,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                    timeout=5,
                )
        except Exception as e:
            log.error("orchestrator_notify_failed", error=str(e))
