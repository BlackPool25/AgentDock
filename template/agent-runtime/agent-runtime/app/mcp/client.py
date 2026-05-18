from __future__ import annotations
import asyncio
import os
from typing import Any, Optional
import structlog

log = structlog.get_logger()


def _tool_to_openai(tool: Any) -> dict[str, Any]:
    """Convert an MCP tool definition to OpenAI function-calling format."""
    schema = {}
    if hasattr(tool, "inputSchema") and tool.inputSchema:
        s = tool.inputSchema
        schema = s.model_dump() if hasattr(s, "model_dump") else dict(s)
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": schema or {"type": "object", "properties": {}},
        },
    }


def _result_to_str(result: Any) -> str:
    """Extract text from an MCP CallToolResult."""
    if not result or not result.content:
        return ""
    parts = []
    for item in result.content:
        if hasattr(item, "text"):
            parts.append(item.text)
        elif hasattr(item, "data"):
            parts.append(f"[binary data: {len(item.data)} bytes]")
        else:
            parts.append(str(item))
    return "\n".join(parts)


class _MCPSession:
    """Wraps a live MCP ClientSession with its transport context managers."""

    def __init__(self, name: str) -> None:
        self.name = name
        self._session: Any = None
        self._cm_stack: list[Any] = []
        self._tools: list[Any] = []

    async def connect_sse(self, url: str, env: dict[str, str]) -> None:
        from mcp.client.sse import sse_client
        from mcp import ClientSession

        # Inject env vars into process environment for this session
        for k, v in env.items():
            os.environ.setdefault(k, v)

        read, write = await self._enter(sse_client(url))
        session = await self._enter(ClientSession(read, write))
        await session.initialize()
        self._session = session
        await self._refresh_tools()
        log.info("mcp.sse_connected", server=self.name, url=url, tools=len(self._tools))

    async def connect_stdio(self, command: str, env: dict[str, str]) -> None:
        from mcp.client.stdio import stdio_client, StdioServerParameters
        from mcp import ClientSession

        # Merge env into current process env
        merged_env = {**os.environ, **env}
        parts = command.split()
        params = StdioServerParameters(command=parts[0], args=parts[1:], env=merged_env)

        read, write = await self._enter(stdio_client(params))
        session = await self._enter(ClientSession(read, write))
        await session.initialize()
        self._session = session
        await self._refresh_tools()
        log.info("mcp.stdio_connected", server=self.name, command=command, tools=len(self._tools))

    async def connect_streamable_http(self, url: str, env: dict[str, str]) -> None:
        from mcp.client.streamable_http import streamable_http_client
        from mcp import ClientSession

        for k, v in env.items():
            os.environ.setdefault(k, v)

        read, write, _ = await self._enter(streamable_http_client(url))
        session = await self._enter(ClientSession(read, write))
        await session.initialize()
        self._session = session
        await self._refresh_tools()
        log.info("mcp.http_connected", server=self.name, url=url, tools=len(self._tools))

    async def _enter(self, cm: Any) -> Any:
        result = await cm.__aenter__()
        self._cm_stack.append(cm)
        return result

    async def _refresh_tools(self) -> None:
        result = await self._session.list_tools()
        self._tools = result.tools if result else []

    def get_tools_openai(self) -> list[dict[str, Any]]:
        return [_tool_to_openai(t) for t in self._tools]

    async def call_tool(self, name: str, args: dict[str, Any]) -> str:
        if not self._session:
            raise RuntimeError(f"MCP session '{self.name}' not connected")
        result = await self._session.call_tool(name, arguments=args)
        return _result_to_str(result)

    async def close(self) -> None:
        for cm in reversed(self._cm_stack):
            try:
                await cm.__aexit__(None, None, None)
            except Exception as e:
                log.warning("mcp.close_error", server=self.name, error=str(e))
        self._cm_stack.clear()
        self._session = None


class MCPClientManager:
    """Manages MCP server sessions per agent config."""

    def __init__(self, mcp_configs: list[Any]) -> None:
        self.configs = mcp_configs
        self._sessions: dict[str, _MCPSession] = {}

    async def start(self) -> None:
        for cfg in self.configs:
            try:
                await self._connect(cfg)
            except Exception as e:
                log.error("mcp_connect_failed", name=cfg.name, transport=cfg.transport, error=str(e))

    async def _connect(self, cfg: Any) -> None:
        session = _MCPSession(cfg.name)
        env = {k: os.environ.get(k, v) for k, v in (cfg.env or {}).items()}

        transport = cfg.transport.lower()
        if transport == "sse":
            if not cfg.url:
                raise ValueError(f"MCP '{cfg.name}': SSE transport requires url")
            await session.connect_sse(cfg.url, env)
        elif transport == "stdio":
            if not cfg.command:
                raise ValueError(f"MCP '{cfg.name}': stdio transport requires command")
            await session.connect_stdio(cfg.command, env)
        elif transport in ("streamable-http", "http"):
            if not cfg.url:
                raise ValueError(f"MCP '{cfg.name}': streamable-http transport requires url")
            await session.connect_streamable_http(cfg.url, env)
        else:
            raise ValueError(f"MCP '{cfg.name}': unknown transport '{cfg.transport}'")

        self._sessions[cfg.name] = session

    async def get_all_tools(self) -> list[dict[str, Any]]:
        """Return all tool definitions from all connected MCP servers in OpenAI tool format."""
        tools: list[dict[str, Any]] = []
        for session in self._sessions.values():
            tools.extend(session.get_tools_openai())
        return tools

    def get_tool_server(self, tool_name: str) -> Optional[_MCPSession]:
        """Find which server owns a given tool name."""
        for session in self._sessions.values():
            if any(t.function["name"] == tool_name for t in session.get_tools_openai()):
                return session
        return None

    async def call_tool(self, tool_name: str, args: dict[str, Any]) -> str:
        session = self.get_tool_server(tool_name)
        if not session:
            raise ValueError(f"No connected MCP server found for tool: {tool_name}")
        log.info("mcp_tool_call", server=session.name, tool=tool_name)
        return await session.call_tool(tool_name, args)

    async def stop(self) -> None:
        for session in self._sessions.values():
            await session.close()
        self._sessions.clear()
