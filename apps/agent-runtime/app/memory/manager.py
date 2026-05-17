from __future__ import annotations
import asyncio
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional
import structlog
from .git import GitManager

log = structlog.get_logger()


@dataclass
class MemoryFileInfo:
    filename: str
    size: int
    last_modified: str
    last_commit_hash: Optional[str] = None


class MemoryManager:
    def __init__(self, base_path: Path, auto_commit: bool = True) -> None:
        self.base_path = base_path
        self.auto_commit = auto_commit
        self.git = GitManager(base_path)

    def setup(self) -> None:
        self.base_path.mkdir(parents=True, exist_ok=True)
        if self.auto_commit:
            self.git.init()

    async def read(self, filename: str) -> str:
        path = self.base_path / filename
        if not path.exists():
            raise FileNotFoundError(f"Memory file not found: {filename}")
        return path.read_text()

    async def write(self, filename: str, content: str, commit_message: Optional[str] = None) -> None:
        path = self.base_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        if self.auto_commit:
            asyncio.create_task(self.git.commit(filename, commit_message))

    async def append(self, filename: str, content: str) -> None:
        path = self.base_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = path.read_text() if path.exists() else ""
        separator = "\n\n" if existing and not existing.endswith("\n\n") else ""
        path.write_text(existing + separator + content)
        if self.auto_commit:
            asyncio.create_task(self.git.commit(filename))

    async def list_files(self) -> list[MemoryFileInfo]:
        files: list[MemoryFileInfo] = []
        for p in sorted(self.base_path.glob("**/*.md")):
            stat = p.stat()
            files.append(MemoryFileInfo(
                filename=str(p.relative_to(self.base_path)),
                size=stat.st_size,
                last_modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
            ))
        return files
