from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from pathlib import Path
import structlog

log = structlog.get_logger()


class GitManager:
    def __init__(self, repo_path: Path) -> None:
        self.repo_path = repo_path
        self._lock = asyncio.Lock()  # Serialize all git operations to prevent index lock (exit 128)

    def init(self) -> None:
        import subprocess
        git_dir = self.repo_path / ".git"
        if not git_dir.exists():
            subprocess.run(["git", "init"], cwd=self.repo_path, check=True, capture_output=True)
            log.info("git_init", path=str(self.repo_path))
        # Always ensure git user config is set (needed in Docker named volumes)
        subprocess.run(["git", "config", "user.email", "agent@agentdock"], cwd=self.repo_path, capture_output=True)
        subprocess.run(["git", "config", "user.name", "AgentDock"], cwd=self.repo_path, capture_output=True)

    async def commit(self, filename: str | None = None, message: str | None = None) -> None:
        ts = datetime.now(timezone.utc).isoformat()
        msg = message or f"Memory update: {filename or 'bulk'} [{ts}]"
        async with self._lock:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, self._do_commit, msg)

    def _do_commit(self, message: str) -> None:
        try:
            import subprocess
            subprocess.run(["git", "add", "."], cwd=self.repo_path, check=True, capture_output=True)
            result = subprocess.run(
                ["git", "commit", "-m", message],
                cwd=self.repo_path, capture_output=True, text=True,
            )
            if result.returncode == 0:
                log.info("git_commit", message=message)
            # returncode 1 with "nothing to commit" is fine — swallow it
        except Exception as e:
            log.error("git_commit_failed", error=str(e))
            # Never raise — git errors must not break agent operation
