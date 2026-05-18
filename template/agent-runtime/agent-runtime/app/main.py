from __future__ import annotations
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncGenerator
import structlog
from fastapi import FastAPI

from .config.loader import load_config
from .memory.manager import MemoryManager
from .rag.manager import RAGManager
from .shell.executor import ShellExecutor
from .llm.client import LLMClient
from .communication.task_receiver import TaskReceiver, TaskPayload
from .communication.file_receiver import FileReceiver
from .mcp.client import MCPClientManager
from .triggers.scheduler import AgentScheduler
from .api.routes import router, configure_structlog

# Configure structlog with ring buffer capture BEFORE any logging happens
configure_structlog()
log = structlog.get_logger()


def _seed_memory(base_path: Path) -> None:
    """Copy seed files from /app/seed/ to /memory/ on first boot."""
    seed_dir = Path("/app/seed")
    if not seed_dir.exists():
        return
    for src in seed_dir.rglob("*"):
        if src.is_file():
            rel = src.relative_to(seed_dir)
            dest = base_path / rel
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(src.read_bytes())
                log.info("seed_file_copied", source=str(src), dest=str(dest))


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # 1. Load config
    config = load_config()
    log.info("config_loaded", agent_id=config.agent.id)

    # 2. RAG
    rag = RAGManager(config.rag)
    if rag.enabled:
        await rag.force_reindex()

    # 3. Memory
    memory = MemoryManager(Path(config.memory.path), config.memory.git_auto_commit, rag)
    memory.setup()

    # 3.5 Wire memory to RAG for self-learning
    if rag.enabled:
        rag.set_memory_manager(memory)

    # 4. Seed files (copy from /app/seed/ to /memory/ if present)
    _seed_memory(memory.base_path)

    # 5. Shell
    shell = ShellExecutor(
        config.shell.enabled,
        config.shell.level,
        config.shell.allowed_commands,
    )

    # 6. LLM client
    llm = LLMClient(
        provider=config.llm.provider,
        model=config.llm.model,
        temperature=config.llm.temperature,
        max_tokens=config.llm.max_tokens,
    )

    # 7. MCP
    mcp = MCPClientManager(config.mcps)
    await mcp.start()

    # 8. Task + file receivers — pass config so task_receiver can dispatch actions
    task_receiver = TaskReceiver(memory, llm, config, rag, mcp, shell)
    file_receiver = FileReceiver(memory, rag)

    # 9. Scheduler
    scheduler = AgentScheduler()
    await scheduler.start(config.triggers, lambda msg: task_receiver.receive(
        TaskPayload(instruction=msg, senderId="scheduler")
    ))

    # Attach to app state
    app.state.config = config
    app.state.memory = memory
    app.state.shell = shell
    app.state.llm = llm
    app.state.rag = rag
    app.state.task_receiver = task_receiver
    app.state.file_receiver = file_receiver
    app.state.mcp = mcp

    log.info("agent_started", agent_id=config.agent.id)
    yield

    await mcp.stop()
    await scheduler.stop()
    log.info("agent_stopped", agent_id=config.agent.id)


app = FastAPI(title="AgentDock Runtime", lifespan=lifespan)
app.include_router(router)
