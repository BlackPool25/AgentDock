from __future__ import annotations
import base64
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional
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


class TaskRecord(BaseModel):
    taskId: str
    senderId: str
    instruction: str
    status: str  # pending | processing | completed | failed
    startedAt: str
    completedAt: Optional[str] = None
    output: Optional[str] = None
    actionName: Optional[str] = None


class TaskReceiver:
    def __init__(self, memory_manager: Any, llm_client: Any, config: Any = None) -> None:
        self.memory = memory_manager
        self.llm = llm_client
        self.config = config
        self._pending: dict[str, TaskPayload] = {}
        self._pending_action: dict[str, Any] = {}  # task_id -> ActionConfig
        self._tasks: list[TaskRecord] = []
        self._current_task: Optional[str] = None
        self._last_activity: Optional[str] = None

    def _render_template(self, template: str, payload: TaskPayload, attached_content: dict[str, str]) -> str:
        """Render a prompt_template with {{input.*}} placeholders."""
        result = template
        for key, val in payload.context.items():
            result = result.replace(f"{{{{input.{key}}}}}", str(val))
        result = result.replace("{{input.instruction}}", payload.instruction)
        result = result.replace("{{input.request}}", payload.instruction)
        for fname, content in attached_content.items():
            result = result.replace("{{input.analysis_content}}", content)
            result = result.replace("{{input.report_content}}", content)
            safe_key = re.sub(r"[^a-z0-9_]", "_", fname.lower())
            result = result.replace(f"{{{{input.{safe_key}}}}}", content)
        result = re.sub(r"\{\{input\.[^}]+\}\}", "", result)
        return result.strip()

    def _pick_action(self, payload: TaskPayload) -> Optional[Any]:
        """Pick the best matching action from config for this task."""
        if not self.config or not self.config.actions:
            return None
        if len(self.config.actions) == 1:
            return self.config.actions[0]

        instruction_lower = payload.instruction.lower()
        sender = payload.senderId.lower()

        # Webhooks always go to the first action (entry-point)
        if sender == "webhook":
            return self.config.actions[0]

        # File-received tasks: match action whose output_file matches the received file
        if "file received from" in instruction_lower:
            parts = instruction_lower.split(":")
            received_file = parts[-1].strip() if len(parts) > 1 else ""
            for action in self.config.actions:
                if action.output_file and received_file and received_file in action.output_file.lower():
                    return action
            # No output_file match — pick the last action (terminal/compile action)
            return self.config.actions[-1]

        # Keyword match on action name (skip short words)
        for action in self.config.actions:
            name_words = [w for w in action.name.lower().replace("_", " ").split() if len(w) > 4]
            if any(w in instruction_lower for w in name_words):
                return action

        return self.config.actions[0]

    async def receive(self, payload: TaskPayload) -> str:
        task_id = payload.taskId or str(uuid.uuid4())
        payload.taskId = task_id

        # Save attached files to storage
        for f in payload.attachedFiles:
            dest = Path(f"/storage/received/{payload.senderId}/{f.filename}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(base64.b64decode(f.content))

        ts = datetime.now(timezone.utc).isoformat()
        action = self._pick_action(payload)

        # Track task
        record = TaskRecord(
            taskId=task_id,
            senderId=payload.senderId,
            instruction=payload.instruction[:200],
            status="processing",
            startedAt=ts,
            actionName=action.name if action else None,
        )
        self._tasks.append(record)
        self._current_task = task_id
        self._last_activity = ts

        await self.memory.append(
            "task_queue.md",
            f"## Task {task_id}\n- **From:** {payload.senderId}\n- **Time:** {ts}\n- **Action:** {action.name if action else 'default'}\n- **Status:** processing\n\n{payload.instruction[:500]}",
        )
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: processing\naction: {action.name if action else 'none'}\n")

        messages = await self._build_messages(payload, action)

        self._pending[task_id] = payload
        if action:
            self._pending_action[task_id] = action

        await self.llm.submit(messages, callback_path=f"/llm-callback/{task_id}")
        log.info("task_received", task_id=task_id, sender=payload.senderId, action=action.name if action else None)
        return task_id

    async def _build_messages(self, payload: TaskPayload, action: Any) -> list[dict[str, str]]:
        messages: list[dict[str, str]] = []

        attached_content: dict[str, str] = {}
        for f in payload.attachedFiles:
            try:
                attached_content[f.filename] = base64.b64decode(f.content).decode("utf-8", errors="replace")
            except Exception:
                pass

        memory_context = await self._read_memory_context()
        if memory_context:
            messages.append({"role": "user", "content": f"<memory_context>\n{memory_context}\n</memory_context>"})
            messages.append({"role": "assistant", "content": "I have reviewed my memory context."})

        for fname, content in attached_content.items():
            messages.append({"role": "user", "content": f"<attached_file name=\"{fname}\">\n{content}\n</attached_file>"})
            messages.append({"role": "assistant", "content": f"I have read the attached file: {fname}"})

        if action and action.prompt_template:
            rendered = self._render_template(action.prompt_template, payload, attached_content)
            messages.append({"role": "user", "content": rendered})
        else:
            messages.append({"role": "user", "content": payload.instruction})

        return messages

    async def _read_memory_context(self) -> str:
        try:
            files = await self.memory.list_files()
            relevant = [f for f in files if f.filename not in ("task_queue.md", "state.md")]
            if not relevant:
                return ""
            parts: list[str] = []
            for f in relevant[:10]:
                try:
                    content = await self.memory.read(f.filename)
                    parts.append(f"### {f.filename}\n{content}")
                except Exception:
                    pass
            return "\n\n".join(parts)
        except Exception:
            return ""

    async def complete(self, task_id: str, output: str) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        self._last_activity = ts
        self._current_task = None

        for rec in self._tasks:
            if rec.taskId == task_id:
                rec.status = "completed"
                rec.completedAt = ts
                rec.output = output[:500] if output else None
                break

        action = self._pending_action.pop(task_id, None)
        self._pending.pop(task_id, None)

        await self.memory.write(f"output_{task_id}.md", output)
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: completed\n")

        # If action has output_file, write it and fire file_received trigger
        if action and action.output_file:
            await self.write_memory_and_notify(action.output_file, output)
            log.info("action_output_written", task_id=task_id, output_file=action.output_file)

        await self._notify_orchestrator({
            "type": "agent:task:completed",
            "agentId": AGENT_ID,
            "taskId": task_id,
            "output": output,
            "actionName": action.name if action else None,
            "timestamp": ts,
        })
        log.info("task_completed", task_id=task_id, action=action.name if action else None)

    async def fail(self, task_id: str, error: str) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        self._last_activity = ts
        self._current_task = None
        for rec in self._tasks:
            if rec.taskId == task_id:
                rec.status = "failed"
                rec.completedAt = ts
                break
        self._pending_action.pop(task_id, None)
        self._pending.pop(task_id, None)
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: failed\nerror: {error}\n")
        await self._notify_orchestrator({
            "type": "agent:task:failed",
            "agentId": AGENT_ID,
            "taskId": task_id,
            "error": error,
            "timestamp": ts,
        })
        log.error("task_failed", task_id=task_id, error=error)

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
