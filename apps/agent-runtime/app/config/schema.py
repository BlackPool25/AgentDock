from __future__ import annotations
from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


class ActionInputSchema(BaseModel):
    type: str = "object"
    properties: dict[str, Any] = Field(default_factory=dict)


class ActionConfig(BaseModel):
    name: str
    description: Optional[str] = None
    input_schema: Optional[ActionInputSchema] = None
    output_schema: Optional[ActionInputSchema] = None
    prompt_template: Optional[str] = None
    output_file: Optional[str] = None


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


class RAGFolderConfig(BaseModel):
    path: str
    auto_index: bool = True
    file_types: list[str] = Field(default_factory=lambda: [".md", ".txt", ".pdf"])
    exclude_files: list[str] = Field(default_factory=list)


class RAGConfig(BaseModel):
    enabled: bool = False
    embedding_model: str = "all-MiniLM-L6-v2"
    folders: list[RAGFolderConfig] = Field(default_factory=list)
    max_file_size_kb: int = 500
    top_k: int = 5
    chunk_size: int = 500
    chunk_overlap: int = 50
    # Self-learning loop configuration
    self_learning: bool = False
    self_learning_file: str = "rag-learned.md"
    min_confidence_threshold: float = 0.3  # Only learn from queries with distance < this


class ShellConfig(BaseModel):
    enabled: bool = False
    level: Literal["root", "restricted"] = "restricted"
    allowed_commands: list[str] = Field(default_factory=list)


class MCPServerConfig(BaseModel):
    name: str
    transport: Literal["sse", "stdio", "streamable-http", "http"]
    url: Optional[str] = None
    command: Optional[str] = None
    env: dict[str, str] = Field(default_factory=dict)


class WebhookInputField(BaseModel):
    name: str
    type: Literal["string", "number", "boolean", "file"] = "string"
    required: bool = False
    description: Optional[str] = None


class ToolsConfig(BaseModel):
    python_packages: list[str] = Field(default_factory=list)
    system_packages: list[str] = Field(default_factory=list)


class TriggerConfig(BaseModel):
    type: Literal["task", "cron", "webhook"]
    schedule: Optional[str] = None
    timezone: str = "UTC"
    actionName: Optional[str] = None
    # Webhook-specific: defines the expected input fields (used for validation + UI)
    webhook_input_schema: list["WebhookInputField"] = Field(default_factory=list)


class SeedFileConfig(BaseModel):
    filename: str
    type: Literal["text", "pdf"]
    content: Optional[str] = None
    content_base64: Optional[str] = None
    extracted_text: Optional[str] = None


class InsufficientInputConfig(BaseModel):
    enabled: bool = False
    message: str = "I don't have enough information to proceed. Please provide more details."
    fallback_action: Literal["return_error", "ask_clarification", "use_defaults"] = "return_error"


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
    rag: RAGConfig = Field(default_factory=RAGConfig)
    shell: ShellConfig = Field(default_factory=ShellConfig)
    mcps: list[MCPServerConfig] = Field(default_factory=list)
    tools: ToolsConfig = Field(default_factory=ToolsConfig)
    actions: list[ActionConfig] = Field(default_factory=list)
    seed_files: list[SeedFileConfig] = Field(default_factory=list)
    insufficient_input: InsufficientInputConfig = Field(default_factory=InsufficientInputConfig)
    triggers: list[TriggerConfig] = Field(default_factory=lambda: [TriggerConfig(type="task")])
    expose: list[str] = Field(default_factory=lambda: ["status", "logs"])
    ports: dict[str, int] = Field(default_factory=lambda: {"internal": 8080})
