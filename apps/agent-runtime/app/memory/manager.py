from __future__ import annotations
import asyncio
import subprocess
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
    def __init__(self, base_path: Path, auto_commit: bool = True, rag_manager: Optional[Any] = None) -> None:
        self.base_path = base_path
        self.auto_commit = auto_commit
        self.git = GitManager(base_path)
        self.rag = rag_manager

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
        if self.rag:
            asyncio.create_task(self.rag.index_file(path))

    async def append(self, filename: str, content: str) -> None:
        path = self.base_path / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        existing = path.read_text() if path.exists() else ""
        separator = "\n\n" if existing and not existing.endswith("\n\n") else ""
        new_content = existing + separator + content
        path.write_text(new_content)
        if self.auto_commit:
            asyncio.create_task(self.git.commit(filename))
        if self.rag:
            asyncio.create_task(self.rag.index_file(path))

    async def list_files(self) -> list[MemoryFileInfo]:
        files: list[MemoryFileInfo] = []
        loop = asyncio.get_event_loop()
        for p in sorted(self.base_path.glob("**/*.md")):
            stat = p.stat()
            commit_hash = await loop.run_in_executor(None, self._get_commit_hash, p)
            files.append(MemoryFileInfo(
                filename=str(p.relative_to(self.base_path)),
                size=stat.st_size,
                last_modified=datetime.fromtimestamp(stat.st_mtime).isoformat(),
                last_commit_hash=commit_hash,
            ))
        return files

    def _get_commit_hash(self, file_path: Path) -> Optional[str]:
        """Get last git commit hash for a file. Returns None if not committed."""
        try:
            rel = str(file_path.relative_to(self.base_path))
            result = subprocess.run(
                ["git", "log", "--format=%H", "-1", "--", rel],
                cwd=self.base_path, capture_output=True, text=True,
            )
            h = result.stdout.strip()
            return h if h else None
        except Exception:
            return None
