from __future__ import annotations
import asyncio
from dataclasses import dataclass
from typing import Optional


class ShellTimeoutError(Exception):
    pass


@dataclass
class ShellResult:
    exit_code: int
    stdout: str
    stderr: str


class ShellExecutor:
    def __init__(self, enabled: bool, level: str, allowed_commands: list[str]) -> None:
        self.enabled = enabled
        self.level = level
        self.allowed_commands = allowed_commands

    async def execute(self, command: str, timeout: int = 60) -> ShellResult:
        if not self.enabled:
            raise PermissionError("Shell execution is disabled for this agent")
        if self.level == "restricted" and self.allowed_commands:
            cmd_name = command.split()[0]
            if cmd_name not in self.allowed_commands:
                raise PermissionError(f"Command not allowed: {cmd_name}")

        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd="/workspace",
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return ShellResult(
                exit_code=proc.returncode or 0,
                stdout=stdout.decode(),
                stderr=stderr.decode(),
            )
        except asyncio.TimeoutError:
            proc.kill()
            raise ShellTimeoutError(f"Command timed out after {timeout}s")
