from __future__ import annotations
from typing import Any, TYPE_CHECKING, Optional
import structlog

if TYPE_CHECKING:
    from .client import LLMClient, ToolCall
    from ..communication.task_receiver import TaskPayload
    from ..config.schema import AgentConfig
    from ..shell.executor import ShellExecutor
    from ..mcp.client import MCPClientManager
    from ..rag.manager import RAGManager

log = structlog.get_logger()

MAX_TOOL_ROUNDS = 10  # Hard limit — prevents infinite loops


class AgentLoop:
    def __init__(
        self,
        gateway: "LLMClient",
        mcp_manager: "MCPClientManager",
        shell: "ShellExecutor",
        config: "AgentConfig",
        rag_manager: Optional["RAGManager"] = None,
    ) -> None:
        self.gateway = gateway
        self.mcp = mcp_manager
        self.shell = shell
        self.config = config
        self.rag = rag_manager

    async def run(self, task: "TaskPayload", system_prompt: str) -> str:
        """
        Run the full agentic loop for a task.
        Returns the final text output when the LLM stops requesting tool calls.
        """
        import base64

        # 1. Gather available tools from all MCP servers
        try:
            mcp_tools = await self.mcp.get_all_tools()
        except Exception as e:
            log.warning("agent_loop.mcp_tools_failed", error=str(e))
            mcp_tools = []

        # 2. Built-in shell tool (if enabled)
        all_tools: list[dict[str, Any]] = list(mcp_tools)
        if self.config.shell.enabled:
            all_tools.append(self._build_shell_tool_definition())

        # 3. Retrieve relevant RAG context for this task
        rag_context = ""
        if self.rag:
            rag_context = await self.rag.query(task.instruction)

        # 4. Build initial message history
        messages = self._build_initial_messages(task, system_prompt, rag_context)

        # 5. Check for insufficient input
        if self.config.insufficient_input.enabled:
            is_insufficient = await self._check_input_sufficiency(task, messages)
            if is_insufficient:
                cfg = self.config.insufficient_input
                if cfg.fallback_action == "return_error":
                    return cfg.message
                elif cfg.fallback_action == "ask_clarification":
                    messages.append({"role": "assistant", "content": cfg.message})
                    messages.append({"role": "user", "content": "Please provide additional information or clarification."})
                elif cfg.fallback_action == "use_defaults":
                    messages.append({"role": "system", "content": "Input may be incomplete. Proceed with available information and reasonable defaults."})

        # 6. THE LOOP
        for round_num in range(MAX_TOOL_ROUNDS):
            log.info("agent_loop.round", round=round_num, task_id=task.taskId)

            response = await self.gateway.chat(
                messages=messages,
                tools=all_tools if all_tools else None,
            )

            # Add assistant response to history
            assistant_msg: dict[str, Any] = {"role": "assistant", "content": response.content}
            if response.tool_calls:
                assistant_msg["tool_calls"] = [
                    {"id": tc.id, "type": "function", "function": {"name": tc.name, "arguments": __import__("json").dumps(tc.arguments)}}
                    for tc in response.tool_calls
                ]
            messages.append(assistant_msg)

            # If no tool calls → LLM is done
            if not response.tool_calls:
                log.info("agent_loop.complete", rounds=round_num + 1, task_id=task.taskId)
                return response.content

            # Execute each tool call and collect results
            for tool_call in response.tool_calls:
                result = await self._execute_tool(tool_call)
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result,
                })
                log.info("agent_loop.tool_executed", tool=tool_call.name, task_id=task.taskId)

        # Hit MAX_TOOL_ROUNDS — return last content
        log.warning("agent_loop.max_rounds_hit", task_id=task.taskId)
        last_content = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "assistant"),
            "Max tool rounds reached without final answer.",
        )
        return last_content or "Max tool rounds reached without final answer."

    async def _execute_tool(self, tool_call: "ToolCall") -> str:
        """Route tool call to correct executor. Returns string result."""
        if tool_call.name == "shell_execute":
            try:
                result = await self.shell.execute(tool_call.arguments.get("command", ""))
                return f"exit_code: {result.exit_code}\nstdout: {result.stdout}\nstderr: {result.stderr}"
            except Exception as e:
                return f"Shell error: {str(e)}"

        # All other tools are MCP tools
        try:
            result = await self.mcp.call_tool(tool_call.name, tool_call.arguments)
            return str(result)
        except Exception as e:
            log.error("agent_loop.tool_error", tool=tool_call.name, error=str(e))
            return f"Tool error: {str(e)}"

    def _build_initial_messages(self, task: "TaskPayload", system_prompt: str, rag_context: str = "") -> list[dict[str, Any]]:
        import base64
        messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]

        # Inject seed file content
        if self.config.seed_files:
            seed_content = "\n\n--- SEED FILES (Base Knowledge) ---\n"
            for sf in self.config.seed_files:
                seed_content += f"\n### {sf.filename}\n"
                if sf.extracted_text:
                    seed_content += sf.extracted_text + "\n"
                elif sf.type == "text" and sf.content:
                    seed_content += sf.content + "\n"
                elif sf.type == "pdf" and sf.content_base64:
                    seed_content += f"[PDF file: {sf.filename} - binary content]\n"
            messages.append({"role": "system", "content": seed_content})

        if rag_context:
            messages.append({
                "role": "system",
                "content": f"Relevant context from your knowledge base:\n\n{rag_context}"
            })

        # Include information about attached files
        if task.attachedFiles:
            file_info = "\n".join([
                f"- {f.filename} (saved to /storage/received/{task.senderId}/{f.filename})"
                for f in task.attachedFiles
            ])
            messages.append({
                "role": "system",
                "content": f"Files attached to this task (already saved to your storage):\n{file_info}",
            })
            # Inline text files as context
            for f in task.attachedFiles:
                if f.mimeType.startswith("text/") or f.filename.endswith(".md"):
                    try:
                        content = base64.b64decode(f.content).decode("utf-8", errors="replace")
                        messages.append({"role": "user", "content": f"<attached_file name=\"{f.filename}\">\n{content}\n</attached_file>"})
                        messages.append({"role": "assistant", "content": f"I have read the attached file: {f.filename}"})
                    except Exception:
                        pass

        messages.append({"role": "user", "content": task.instruction})
        return messages

    async def _check_input_sufficiency(self, task: "TaskPayload", messages: list[dict[str, Any]]) -> bool:
        """Use LLM to check if input is sufficient to proceed."""
        check_messages = [
            {"role": "system", "content": "You are evaluating whether the provided input contains enough information to proceed with the task. Respond with only 'SUFFICIENT' or 'INSUFFICIENT'."},
        ] + messages
        try:
            response = await self.gateway.chat(messages=check_messages, tools=None)
            return "INSUFFICIENT" in response.content.upper()
        except Exception as e:
            log.warning("input_check_failed", error=str(e))
            return False

    def _build_shell_tool_definition(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": "shell_execute",
                "description": "Execute a shell command in the /workspace directory. Returns stdout, stderr, and exit code.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to execute",
                        }
                    },
                    "required": ["command"],
                },
            },
        }
