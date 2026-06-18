from __future__ import annotations
import asyncio
import os
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
        self.level = level  # "root" | "restricted"
        self.allowed_commands = allowed_commands
        # Workspace is /workspace if it exists, else /tmp/workspace
        self._workspace = "/workspace" if os.path.isdir("/workspace") else "/tmp/workspace"
        os.makedirs(self._workspace, exist_ok=True)

    async def execute(self, command: str, timeout: int = 120) -> ShellResult:
        if not self.enabled:
            raise PermissionError("Shell execution is disabled for this agent")

        if self.level == "restricted":
            # If allowed_commands is empty, reject everything
            if not self.allowed_commands:
                raise PermissionError("No commands are allowed for this restricted agent")

            # Check for shell injection / multi-commands
            forbidden_chars = [";", "&", "|", "`", "$", "\n", "\r"]
            if any(char in command for char in forbidden_chars):
                raise PermissionError("Shell operators or multi-commands are not allowed in restricted mode")

            cmd_name = command.strip().split()[0] if command.strip() else ""
            if cmd_name not in self.allowed_commands:
                raise PermissionError(
                    f"Command '{cmd_name}' not in allowed list: {self.allowed_commands}"
                )

        # When level is "root" and we're not already root, use sudo
        effective_command = command
        if self.level == "root" and os.geteuid() != 0:
            effective_command = f"sudo -n {command}"

        proc = await asyncio.create_subprocess_shell(
            effective_command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=self._workspace,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return ShellResult(
                exit_code=proc.returncode or 0,
                stdout=stdout.decode(errors="replace"),
                stderr=stderr.decode(errors="replace"),
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            raise ShellTimeoutError(f"Command timed out after {timeout}s: {command[:100]}")
