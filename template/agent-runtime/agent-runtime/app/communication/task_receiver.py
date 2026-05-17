from __future__ import annotations
import base64
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any
import httpx
import structlog
from pydantic import BaseModel

log = structlog.get_logger()

AGENT_ID = os.environ.get("AGENT_ID", "unknown")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8080"))
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

        # Save attached files to storage
        for f in payload.attachedFiles:
            dest = Path(f"/storage/received/{payload.senderId}/{f.filename}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(base64.b64decode(f.content))

        # Log task to memory
        ts = datetime.now(timezone.utc).isoformat()
        await self.memory.append(
            "task_queue.md",
            f"## Task {task_id}\n- **From:** {payload.senderId}\n- **Time:** {ts}\n- **Status:** pending\n\n{payload.instruction}",
        )
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: processing\n")

        # Build LLM messages with memory context
        messages = await self._build_messages(payload)

        self._pending[task_id] = payload
        await self.llm.submit(messages, callback_path=f"/llm-callback/{task_id}")
        log.info("task_received", task_id=task_id, sender=payload.senderId)
        return task_id

    async def _build_messages(self, payload: TaskPayload) -> list[dict[str, str]]:
        """Build LLM message list, injecting relevant memory context."""
        messages: list[dict[str, str]] = []

        # Inject memory context as a system-level context block
        memory_context = await self._read_memory_context()
        if memory_context:
            messages.append({
                "role": "user",
                "content": f"<memory_context>\n{memory_context}\n</memory_context>",
            })
            messages.append({"role": "assistant", "content": "I have reviewed my memory context."})

        # Inject attached file contents
        for f in payload.attachedFiles:
            try:
                file_content = base64.b64decode(f.content).decode("utf-8", errors="replace")
                messages.append({
                    "role": "user",
                    "content": f"<attached_file name=\"{f.filename}\">\n{file_content}\n</attached_file>",
                })
                messages.append({"role": "assistant", "content": f"I have read the attached file: {f.filename}"})
            except Exception:
                pass

        messages.append({"role": "user", "content": payload.instruction})
        return messages

    async def _read_memory_context(self) -> str:
        """Read all memory .md files and return as a single context string."""
        try:
            files = await self.memory.list_files()
            # Exclude task_queue and state files from context (too noisy)
            relevant = [f for f in files if f.filename not in ("task_queue.md", "state.md")]
            if not relevant:
                return ""
            parts: list[str] = []
            for f in relevant[:10]:  # cap at 10 files to avoid token overflow
                try:
                    content = await self.memory.read(f.filename)
                    parts.append(f"### {f.filename}\n{content}")
                except Exception:
                    pass
            return "\n\n".join(parts)
        except Exception:
            return ""

    async def complete(self, task_id: str, output: str) -> None:
        await self.memory.write(f"output_{task_id}.md", output)
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: completed\n")
        self._pending.pop(task_id, None)

        # Notify orchestrator of task completion
        await self._notify_orchestrator({
            "type": "agent:task:completed",
            "agentId": AGENT_ID,
            "taskId": task_id,
            "output": output,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        log.info("task_completed", task_id=task_id)

    async def send_file_to_agent(
        self,
        target_agent_id: str,
        filename: str,
        content: str,
        mime_type: str = "text/plain",
        instruction: Optional[str] = None,
    ) -> None:
        """Send a file directly to another agent's /tasks endpoint with the file attached."""
        encoded = base64.b64encode(content.encode()).decode()
        task_payload = {
            "taskId": str(uuid.uuid4()),
            "senderId": AGENT_ID,
            "instruction": instruction or f"File from {AGENT_ID}: {filename}",
            "context": {"sourceAgent": AGENT_ID},
            "attachedFiles": [{"filename": filename, "content": encoded, "mimeType": mime_type}],
        }
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"http://{target_agent_id}:8080/tasks",
                    json=task_payload,
                    timeout=10,
                )
            log.info("file_sent_to_agent", target=target_agent_id, filename=filename)
        except Exception as e:
            log.error("send_file_failed", target=target_agent_id, filename=filename, error=str(e))

    async def write_memory_and_notify(self, filename: str, content: str) -> None:
        """Write a file to memory and notify orchestrator so file_received triggers fire."""
        await self.memory.write(filename, content)
        await self._notify_orchestrator({
            "type": "agent:memory:written",
            "agentId": AGENT_ID,
            "filename": filename,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _notify_orchestrator(self, event: dict[str, Any]) -> None:
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{ORCHESTRATOR_URL}/internal/events",
                    json=event,
                    timeout=5,
                )
        except Exception as e:
            log.error("orchestrator_notify_failed", error=str(e))
