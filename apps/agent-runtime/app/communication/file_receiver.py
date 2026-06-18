from __future__ import annotations
import base64
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from pydantic import BaseModel
import structlog

log = structlog.get_logger()


class FilePayload(BaseModel):
    senderId: str
    filename: str
    content: str  # base64
    mimeType: str
    metadata: dict[str, Any] = {}


class FileReceiver:
    def __init__(self, memory_manager: Any, rag_manager: Optional[Any] = None) -> None:
        self.memory = memory_manager
        self.rag = rag_manager

    async def receive(self, payload: FilePayload) -> str:
        sender_clean = Path(payload.senderId).name
        filename_clean = Path(payload.filename).name
        dest = Path(f"/storage/received/{sender_clean}/{filename_clean}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(base64.b64decode(payload.content))

        ts = datetime.now(timezone.utc).isoformat()
        await self.memory.append(
            "received_files.md",
            f"- [{ts}] {filename_clean} from {sender_clean} → {dest}",
        )
        if self.rag:
            import asyncio
            asyncio.create_task(self.rag.index_file(dest))

        log.info("file_received", filename=filename_clean, sender=sender_clean)
        return str(dest)


