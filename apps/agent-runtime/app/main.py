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

# Configure structlog with ring buffer capture before any logging
configure_structlog()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    config = load_config()
    log.info("config_loaded", agent_id=config.agent.id)

    rag = RAGManager(config.rag)
    if rag.enabled:
        await rag.force_reindex()

    memory = MemoryManager(Path(config.memory.path), config.memory.git_auto_commit, rag)
    memory.setup()

    shell = ShellExecutor(config.shell.enabled, config.shell.level, config.shell.allowed_commands)

    llm = LLMClient(
        provider=config.llm.provider,
        model=config.llm.model,
        temperature=config.llm.temperature,
        max_tokens=config.llm.max_tokens,
        system_prompt=config.llm.system_prompt or "",
    )

    # Pass config so TaskReceiver can dispatch named actions
    task_receiver = TaskReceiver(memory, llm, config, rag)
    file_receiver = FileReceiver(memory, rag)

    mcp = MCPClientManager(config.mcps)
    await mcp.start()

    scheduler = AgentScheduler()
    await scheduler.start(config.triggers, lambda msg: task_receiver.receive(
        TaskPayload(instruction=msg, senderId="scheduler")
    ))

    app.state.config = config
    app.state.memory = memory
    app.state.shell = shell
    app.state.llm = llm
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
