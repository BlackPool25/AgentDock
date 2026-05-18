from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class LLMConfig(BaseModel):
    provider: Literal["ollama", "openai", "anthropic", "gemini", "groq"]
    model: str
    temperature: float = 0.7
    max_tokens: int = 4096
    system_prompt: Optional[str] = None


class MemoryConfig(BaseModel):
    path: str = "/memory"
    git_auto_commit: bool = True
    readable_by: list[str] = Field(default_factory=list)
    writable_by: list[str] = Field(default_factory=list)


class ShellConfig(BaseModel):
    enabled: bool = False
    level: Literal["root", "restricted"] = "restricted"
    allowed_commands: list[str] = Field(default_factory=list)


class MCPServerConfig(BaseModel):
    name: str
    transport: Literal["sse", "stdio"]
    url: Optional[str] = None
    command: Optional[str] = None
    env: dict[str, str] = Field(default_factory=dict)


class ToolsConfig(BaseModel):
    python_packages: list[str] = Field(default_factory=list)
    system_packages: list[str] = Field(default_factory=list)


class TriggerConfig(BaseModel):
    type: Literal["task", "cron", "webhook"]
    schedule: Optional[str] = None
    timezone: str = "UTC"


class ActionConfig(BaseModel):
    name: str
    description: Optional[str] = None
    prompt_template: Optional[str] = None
    output_file: Optional[str] = None  # written to /memory, fires file_received trigger


class AgentMeta(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    version: str = "1.0.0"


class RuntimeConfig(BaseModel):
    base_image: str = "agentdock/agent-base:latest"


class AgentConfig(BaseModel):
    agent: AgentMeta
    runtime: RuntimeConfig = Field(default_factory=RuntimeConfig)
    llm: LLMConfig
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    shell: ShellConfig = Field(default_factory=ShellConfig)
    mcps: list[MCPServerConfig] = Field(default_factory=list)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    actions: list[ActionConfig] = Field(default_factory=list)
    triggers: list[TriggerConfig] = Field(default_factory=lambda: [TriggerConfig(type="task")])
    expose: list[str] = Field(default_factory=lambda: ["status", "logs"])
    ports: dict[str, int] = Field(default_factory=lambda: {"internal": 8080})
