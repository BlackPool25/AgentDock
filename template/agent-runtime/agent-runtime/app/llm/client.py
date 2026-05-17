from __future__ import annotations
import os
import uuid
import httpx
import structlog
from typing import Optional

log = structlog.get_logger()

GATEWAY_URL = os.environ.get("LLM_GATEWAY_URL", "http://llm-gateway:5000")
AGENT_ID = os.environ.get("AGENT_ID", "unknown")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "8080"))


class LLMClient:
    def __init__(self, provider: str, model: str, temperature: float, max_tokens: int) -> None:
        self.provider = provider
        self.model = model
        self.temperature = temperature
        self.max_tokens = max_tokens

    async def submit(
        self,
        messages: list[dict[str, str]],
        callback_path: str = "/llm-callback",
    ) -> str:
        """Submit a job to the LLM Gateway. Returns jobId."""
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
