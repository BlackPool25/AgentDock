from __future__ import annotations
import asyncio
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
    actionName: Optional[str] = None
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
    def __init__(self, memory_manager: Any, llm_client: Any, config: Any = None, rag_manager: Optional[Any] = None, mcp_manager: Optional[Any] = None, shell_executor: Optional[Any] = None) -> None:
        self.memory = memory_manager
        self.llm = llm_client
        self.config = config
        self.rag = rag_manager
        self.mcp = mcp_manager
        self.shell = shell_executor
        self._pending: dict[str, TaskPayload] = {}
        self._pending_action: dict[str, Any] = {}
        self._tasks: list[TaskRecord] = []
        self._current_task: Optional[str] = None
        self._last_activity: Optional[str] = None

    def _pick_action(self, payload: TaskPayload) -> Optional[Any]:
        if not self.config or not self.config.actions:
            return None
        
        # If payload explicitly requests an action, use it
        if payload.actionName:
            for action in self.config.actions:
                if action.name == payload.actionName:
                    return action

        if len(self.config.actions) == 1:
            return self.config.actions[0]
        instruction_lower = payload.instruction.lower()
        if payload.senderId.lower() == "webhook":
            return self.config.actions[0]
        if "file received from" in instruction_lower:
            parts = instruction_lower.split(":")
            received_file = parts[-1].strip() if len(parts) > 1 else ""
            for action in self.config.actions:
                if action.output_file and received_file and received_file in action.output_file.lower():
                    return action
            return self.config.actions[-1]
        for action in self.config.actions:
            name_words = [w for w in action.name.lower().replace("_", " ").split() if len(w) > 4]
            if any(w in instruction_lower for w in name_words):
                return action
        return self.config.actions[0]

    async def receive(self, payload: TaskPayload) -> str:
        # Sanitize task_id to prevent directory traversal
        task_id = re.sub(r'[^a-zA-Z0-9_-]', '', payload.taskId) if payload.taskId else str(uuid.uuid4())
        payload.taskId = task_id

        # Sanitize sender ID and attached filenames
        sender_clean = Path(payload.senderId).name
        for f in payload.attachedFiles:
            filename_clean = Path(f.filename).name
            dest = Path(f"/storage/received/{sender_clean}/{filename_clean}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(base64.b64decode(f.content))

        # Check if this task is resuming a suspended upstream feedback request
        source_task_id = payload.context.get("sourceTaskId")
        if source_task_id:
            source_task_id = re.sub(r'[^a-zA-Z0-9_-]', '', str(source_task_id))
            orig_payload = self._pending.get(source_task_id)
            if orig_payload:
                # Re-activate suspended task record
                for rec in self._tasks:
                    if rec.taskId == source_task_id:
                        rec.status = "processing"
                        break
                ts = datetime.now(timezone.utc).isoformat()
                self._current_task = source_task_id
                self._last_activity = ts

                # Attach feedback history turns
                orig_payload.feedback_history = [
                    {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call_feedback",
                                "type": "function",
                                "function": {
                                    "name": "request_feedback",
                                    "arguments": f'{{"target_agent_id": "{sender_clean}", "query": ""}}'
                                }
                            }
                        ]
                    },
                    {
                        "role": "tool",
                        "tool_call_id": "call_feedback",
                        "content": "[feedback_requested] Clarification request submitted."
                    },
                    {
                        "role": "user",
                        "content": payload.instruction
                    }
                ]

                await self.memory.append(
                    "task_queue.md",
                    f"## Task Resume {source_task_id}\n- **Feedback From:** {sender_clean}\n- **Time:** {ts}\n- **Status:** processing\n\n{payload.instruction[:500]}",
                )
                await self.memory.write("state.md", f"current_task: {source_task_id}\nstatus: processing\n")

                action = self._pending_action.get(source_task_id)
                asyncio.create_task(self._run_loop(source_task_id, orig_payload, action))
                log.info("task_resumed", task_id=source_task_id, sender=sender_clean)
                return source_task_id

        ts = datetime.now(timezone.utc).isoformat()
        action = self._pick_action(payload)

        record = TaskRecord(
            taskId=task_id,
            senderId=sender_clean,
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
            f"## Task {task_id}\n- **From:** {sender_clean}\n- **Time:** {ts}\n- **Action:** {action.name if action else 'default'}\n- **Status:** processing\n\n{payload.instruction[:500]}",
        )
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: processing\naction: {action.name if action else 'none'}\n")

        self._pending[task_id] = payload
        if action:
            self._pending_action[task_id] = action

        # Run agentic loop as background task
        asyncio.create_task(self._run_loop(task_id, payload, action))
        log.info("task_received", task_id=task_id, sender=sender_clean, action=action.name if action else None)
        return task_id

    async def _run_loop(self, task_id: str, payload: TaskPayload, action: Any) -> None:
        """Run the agentic loop as a background task."""
        try:
            from ..llm.agent_loop import AgentLoop, FeedbackRequestedException
            system_prompt = (self.config.llm.system_prompt or "") if self.config else ""
            if action and action.prompt_template:
                system_prompt = self._render_template(action.prompt_template, payload)
            loop = AgentLoop(self.llm, self.mcp, self.shell, self.config, self.rag)
            output = await loop.run(payload, system_prompt)

            # Guard: if the model returned nothing, retry once with a stripped-down prompt
            if not output or not output.strip():
                log.warning("empty_output_retry", task_id=task_id, action=action.name if action else None)
                bare_prompt = f"Complete this task and write your full response:\n\n{payload.instruction}"
                output = await loop.run(payload, bare_prompt)

            if not output or not output.strip():
                raise ValueError("Agent produced empty output after retry")

            await self.complete(task_id, output)
        except FeedbackRequestedException as fre:
            log.info("feedback_requested_suspend", task_id=task_id, target=fre.target_agent_id)
            await self.suspend(task_id, fre.target_agent_id, fre.query)
        except Exception as e:
            log.error("agent_loop_failed", task_id=task_id, error=str(e))
            await self.fail(task_id, str(e))

    def _render_template(self, template: str, payload: TaskPayload) -> str:
        result = template
        # Replace all context variables: {{input.key}}
        for key, val in payload.context.items():
            result = result.replace(f"{{{{input.{key}}}}}", str(val))
        # Built-in variables
        result = result.replace("{{input.instruction}}", payload.instruction)
        result = result.replace("{{input.request}}", payload.instruction)
        result = result.replace("{{input.sender}}", payload.senderId)
        result = result.replace("{{input.filename}}", str(payload.context.get("filename", "")))
        result = result.replace("{{input.sourceAgent}}", str(payload.context.get("sourceAgentId", "")))
        result = result.replace("{{input.filePath}}", str(payload.context.get("filePath", "")))
        # Remove any remaining unresolved placeholders
        result = re.sub(r"\{\{input\.[^}]+\}\}", "", result)

        # Replace profile file references with existence-guarded instructions.
        # If the profile file doesn't exist yet, tell the agent to skip reading it.
        def _guard_profile_ref(match: re.Match) -> str:
            path_str = match.group(1)
            full_path = Path(f"/memory/{path_str}")
            if full_path.exists():
                return match.group(0)  # keep original reference
            return f"(no profile file found at {path_str} — skip reading it and proceed with defaults)"

        result = re.sub(r"profiles?/([^\s,\.\"\']+\.md)", _guard_profile_ref, result)
        return result.strip()

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

        payload = self._pending.get(task_id) or next((t for t in self._tasks if t.taskId == task_id), None)
        context = payload.context if (payload and hasattr(payload, "context")) else {}

        action = self._pending_action.pop(task_id, None)
        self._pending.pop(task_id, None)

        # Write internal output file bypassing memory written events
        output_path = self.memory.base_path / f"output_{task_id}.md"
        output_path.write_text(output)

        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: completed\n")

        if action and action.output_file:
            await self.write_memory_and_notify(action.output_file, output)

        await self._notify_orchestrator({
            "type": "agent:task:completed",
            "agentId": AGENT_ID,
            "taskId": task_id,
            "output": output,
            "actionName": action.name if action else None,
            "context": context,
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

    async def suspend(self, task_id: str, target_agent_id: str, query: str) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        self._last_activity = ts
        self._current_task = None
        for rec in self._tasks:
            if rec.taskId == task_id:
                rec.status = "suspended"
                break
        await self.memory.write("state.md", f"current_task: {task_id}\nstatus: suspended\n")
        await self._notify_orchestrator({
            "type": "agent:task:feedback_requested",
            "agentId": AGENT_ID,
            "taskId": task_id,
            "targetAgentId": target_agent_id,
            "instruction": query,
            "timestamp": ts,
        })
        log.info("task_suspended_for_feedback", task_id=task_id, target_agent_id=target_agent_id)

    async def write_memory_and_notify(self, filename: str, content: str) -> None:
        """Write a named output file and notify orchestrator to fire file_received triggers."""
        await self.memory.write(filename, content)
        await self._notify_orchestrator({
            "type": "agent:memory:written",
            "agentId": AGENT_ID,
            "filename": filename,
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    async def _notify_orchestrator(self, event: dict[str, Any]) -> None:
        retry_delays = [1, 2, 4, 8, 16]
        for attempt, delay in enumerate(retry_delays + [30]):
            try:
                async with httpx.AsyncClient() as client:
                    res = await client.post(f"{ORCHESTRATOR_URL}/internal/events", json=event, timeout=5)
                    res.raise_for_status()
                log.info("orchestrator_notified", event_type=event.get("type"), attempt=attempt)
                return
            except Exception as e:
                log.warning("orchestrator_notify_retry", attempt=attempt, delay=delay, error=str(e))
                if attempt == len(retry_delays):
                    log.error("orchestrator_notify_failed", error=str(e))
                    return
                await asyncio.sleep(delay)
