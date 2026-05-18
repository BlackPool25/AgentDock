from __future__ import annotations
from typing import Any, TYPE_CHECKING
import structlog

if TYPE_CHECKING:
    from .task_receiver import TaskPayload

log = structlog.get_logger()

MAX_TOOL_ROUNDS = 10


class AgentLoop:
    def __init__(self, llm_client: Any, config: Any, rag_manager: Optional[Any] = None) -> None:
        self.llm = llm_client
        self.config = config
        self.rag = rag_manager

    async def run(self, task: "TaskPayload", system_prompt: str) -> str:
        import base64
        
        # Query RAG for context
        rag_context = ""
        if self.rag:
            rag_context = await self.rag.query(task.instruction)

        messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        
        if rag_context:
            messages.append({
                "role": "system", 
                "content": f"Relevant context from your knowledge base:\n\n{rag_context}"
            })

        # Inline text attachments as context
        for f in task.attachedFiles:
            if f.mimeType.startswith("text/") or f.filename.endswith(".md"):
                try:
                    content = base64.b64decode(f.content).decode("utf-8", errors="replace")
                    messages.append({"role": "user", "content": f"<attached_file name=\"{f.filename}\">\n{content}\n</attached_file>"})
                    messages.append({"role": "assistant", "content": f"I have read: {f.filename}"})
                except Exception:
                    pass

        messages.append({"role": "user", "content": task.instruction})

        for round_num in range(MAX_TOOL_ROUNDS):
            log.info("agent_loop.round", round=round_num, task_id=task.taskId)
            response = await self.llm.chat(messages=messages)

            assistant_msg: dict[str, Any] = {"role": "assistant", "content": response.content}
            if response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": tc.arguments}}
                    for tc in response.tool_calls
                ]
            messages.append(assistant_msg)

            if not response.tool_calls:
                log.info("agent_loop.complete", rounds=round_num + 1, task_id=task.taskId)
                return response.content

            for tc in response.tool_calls:
                result = await self._execute_tool(tc)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
                log.info("agent_loop.tool_executed", tool=tc.name, task_id=task.taskId)

        log.warning("agent_loop.max_rounds_hit", task_id=task.taskId)
        last = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "assistant"), "")
        return last or "Max tool rounds reached."

    async def _execute_tool(self, tool_call: Any) -> str:
        if tool_call.name == "shell_execute":
            if not (self.config and self.config.shell.enabled):
                return "Shell is disabled for this agent."
            try:
                from ..shell.executor import ShellExecutor
                shell = ShellExecutor(True, self.config.shell.level, self.config.shell.allowed_commands)
                result = await shell.execute(tool_call.arguments.get("command", ""))
                return f"exit_code: {result.exit_code}\nstdout: {result.stdout}\nstderr: {result.stderr}"
            except Exception as e:
                return f"Shell error: {e}"
        return f"Unknown tool: {tool_call.name}"
