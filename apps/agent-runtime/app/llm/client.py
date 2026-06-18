from __future__ import annotations
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional
import httpx
import structlog

log = structlog.get_logger()

GATEWAY_URL = os.environ.get("LLM_GATEWAY_URL", "http://llm-gateway:5000")
AGENT_ID = os.environ.get("AGENT_ID", "unknown")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8080"))


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ChatResponse:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    usage: dict[str, int] = field(default_factory=dict)


class LLMClient:
    def __init__(self, provider: str, model: str, temperature: float, max_tokens: int) -> None:
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def submit(
        self,
        messages: list[dict[str, Any]],
        callback_path: str = "/llm-callback",
    ) -> str:
        """Submit a job to the LLM Gateway queue. Returns jobId."""
        job_id = str(uuid.uuid4())
        callback_url = f"http://{AGENT_ID}:{AGENT_PORT}{callback_path}"
        payload = {
            "jobId": job_id,
            "agentId": AGENT_ID,
            "provider": self.provider,
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "maxTokens": self.max_tokens,
            "callbackUrl": callback_url,
        }
        async with httpx.AsyncClient() as client:
            res = await client.post(f"{GATEWAY_URL}/api/queue/submit", json=payload, timeout=10)
            res.raise_for_status()
        log.info("llm_job_submitted", job_id=job_id, provider=self.provider)
        return job_id

    async def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> ChatResponse:
        """Synchronous chat call via /api/chat/sync — used by the agentic loop."""
        payload: dict[str, Any] = {
            "provider": self.provider,
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "maxTokens": self.max_tokens,
        }
        if tools:
            payload["tools"] = tools

        async with httpx.AsyncClient(timeout=360.0) as client:
            res = await client.post(f"{GATEWAY_URL}/api/chat/sync", json=payload)
            res.raise_for_status()
            data = res.json()

        tool_calls: list[ToolCall] = []
        for tc in data.get("toolCalls") or []:
            tool_calls.append(ToolCall(
                id=tc.get("id", str(uuid.uuid4())),
                name=tc["name"],
                arguments=tc.get("arguments", {}),
            ))

        return ChatResponse(
            content=data.get("content", ""),
            tool_calls=tool_calls,
            usage=data.get("usage", {}),
        )
