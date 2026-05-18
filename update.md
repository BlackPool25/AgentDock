# AgentFlow — Full Implementation Specification (v3)
> **For the AI coding agent.** Read this entire document before writing any code. Every section exists for a reason. Pay special attention to Section 8 (Agentic Tool Loop) — it is the most commonly misimplemented part of agent systems.

---

## 0. How to Use This Document

- **Before using any library**, use **Context7 MCP** to fetch its latest docs. Never use training data for API signatures.
- **MUST** = non-negotiable. **SHOULD** = strong preference.
- Bun for all Node.js. uv for all Python. No exceptions.

---

## 1. What This System Is

Two completely decoupled things:

**The Builder** — a visual design tool. Stores system designs in SQLite. Generates standalone Docker Compose projects. Has no Docker socket, no BullMQ, no Redis. It is a design + code generation tool only.

**The Generated Runtime** — a self-contained Docker Compose project with its own orchestrator, LLM gateway, Redis, and agent containers. Runs anywhere with Docker. Knows nothing about the builder after generation.

See v2 spec for full architecture. This document adds: the correct agentic tool loop, RAG system, improved file storage, agent communication improvements, and Ollama model guidance.

---

## 2. Critical Architectural Facts (unchanged from v2)

- Builder has NO Docker access, NO Redis, NO BullMQ
- Runtime is fully independent after generation
- Agents expose zero ports to host — all traffic through orchestrator on port 4000
- Config files (YAML) are the only coupling between builder and runtime
- Each generated system has its own isolated Redis
- Secrets come from `.env` only — never in YAML or DB

---

## 3. What Changed in v3 (New Sections)

| Area | Status | What's New |
|---|---|---|
| Agentic tool loop | **NEW — critical** | Full multi-turn tool-calling loop inside agent runtime |
| RAG system | **NEW** | ChromaDB embedded in each agent, auto-indexed on write |
| File storage | **IMPROVED** | Manifest file, deduplication, size limits |
| Agent-to-agent task delivery | **IMPROVED** | Retry with backoff, task acknowledgment |
| Ollama model guidance | **NEW** | Which models work and why |

---

## 4. The Agentic Tool Loop (Most Important New Section)

### 4.1 Why This Matters

The original design showed agents sending one LLM request and processing one response. This is NOT how agents work. A real agent must:

1. Receive a task
2. Send it to the LLM with available tools (MCP tools + shell tool definitions)
3. LLM responds — either with a final answer OR a tool call request
4. If tool call: execute the tool, collect the result, send it BACK to the LLM as a `tool_result` message
5. LLM responds again — possibly with another tool call
6. Repeat until LLM produces a final answer with no tool calls
7. Then write output to memory, send completion event to Orchestrator

Without this loop, MCP tools and shell tools are completely non-functional — the agent receives their definitions but can never act on them.

### 4.2 Implementation — `app/llm/agent_loop.py`

```python
# This is the core of agent intelligence. Get this right.

from app.llm.gateway_client import GatewayClient
from app.mcp.client import MCPClientManager
from app.shell.executor import ShellExecutor
from app.rag.manager import RAGManager
import structlog

log = structlog.get_logger()

MAX_TOOL_ROUNDS = 10  # Hard limit — prevents infinite loops

class AgentLoop:
    def __init__(
        self,
        gateway: GatewayClient,
        mcp_manager: MCPClientManager,
        shell: ShellExecutor,
        rag: RAGManager,
        config: AgentConfig
    ):
        self.gateway = gateway
        self.mcp = mcp_manager
        self.shell = shell
        self.rag = rag
        self.config = config

    async def run(self, task: TaskPayload) -> str:
        """
        Run the full agentic loop for a task.
        Returns the final text output when the LLM stops requesting tool calls.
        """
        # 1. Gather available tools from all MCP servers
        mcp_tools = await self.mcp.get_all_tools()  # List[MCPToolDefinition]

        # 2. Define the built-in shell tool (always available if shell is enabled)
        shell_tool = self._build_shell_tool_definition() if self.config.shell.enabled else None

        all_tools = mcp_tools + ([shell_tool] if shell_tool else [])

        # 3. Retrieve relevant RAG context for this task
        rag_context = await self.rag.query(task.instruction, top_k=5)

        # 4. Build initial message history
        messages = self._build_initial_messages(task, rag_context)

        # 5. THE LOOP
        for round_num in range(MAX_TOOL_ROUNDS):
            log.info("agent_loop.round", round=round_num, task_id=task.task_id)

            # Call LLM via gateway (synchronous per round — await completion)
            response = await self.gateway.chat(
                messages=messages,
                tools=all_tools,
                provider=self.config.llm.provider,
                model=self.config.llm.model,
                temperature=self.config.llm.temperature,
                max_tokens=self.config.llm.max_tokens,
            )

            # Add assistant response to history
            messages.append({"role": "assistant", "content": response.content, "tool_calls": response.tool_calls})

            # If no tool calls → LLM is done, return final answer
            if not response.tool_calls:
                log.info("agent_loop.complete", rounds=round_num + 1, task_id=task.task_id)
                return response.content

            # Execute each tool call and collect results
            tool_results = []
            for tool_call in response.tool_calls:
                result = await self._execute_tool(tool_call)
                tool_results.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": result
                })
                log.info("agent_loop.tool_executed", tool=tool_call.name, task_id=task.task_id)

            # Add all tool results to history before next round
            messages.extend(tool_results)

        # If we hit MAX_TOOL_ROUNDS, return whatever we have
        log.warning("agent_loop.max_rounds_hit", task_id=task.task_id)
        return messages[-1].get("content", "Max tool rounds reached without final answer.")

    async def _execute_tool(self, tool_call: ToolCall) -> str:
        """Route tool call to correct executor. Returns string result."""
        if tool_call.name == "shell_execute":
            result = await self.shell.execute(tool_call.arguments["command"])
            return f"exit_code: {result.exit_code}\nstdout: {result.stdout}\nstderr: {result.stderr}"

        # All other tools are MCP tools
        try:
            result = await self.mcp.call_tool(tool_call.name, tool_call.arguments)
            return str(result)
        except Exception as e:
            log.error("agent_loop.tool_error", tool=tool_call.name, error=str(e))
            return f"Tool error: {str(e)}"

    def _build_initial_messages(self, task: TaskPayload, rag_context: str) -> list:
        messages = [{"role": "system", "content": self.config.llm.system_prompt}]

        if rag_context:
            messages.append({
                "role": "system",
                "content": f"Relevant context from your knowledge base:\n\n{rag_context}"
            })

        # Include information about attached files
        if task.attached_files:
            file_info = "\n".join([
                f"- {f.filename} (saved to /storage/received/{task.sender_id}/{f.filename})"
                for f in task.attached_files
            ])
            messages.append({
                "role": "system",
                "content": f"Files attached to this task (already saved to your storage):\n{file_info}"
            })

        messages.append({"role": "user", "content": task.instruction})
        return messages

    def _build_shell_tool_definition(self) -> dict:
        return {
            "type": "function",
            "function": {
                "name": "shell_execute",
                "description": "Execute a shell command in the /workspace directory. Returns stdout, stderr, and exit code.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": {
                            "type": "string",
                            "description": "The shell command to execute"
                        }
                    },
                    "required": ["command"]
                }
            }
        }
```

### 4.3 LLM Gateway — Synchronous Mode for Agent Loop

The gateway needs to support a **synchronous (non-queued) chat call** for the agentic loop. The BullMQ queue is for fire-and-forget LLM calls. But in the agentic loop, each round must complete before the next starts.

Add to `template/llm-gateway/src/api/routes/chat.ts`:
```
POST /api/chat/sync
Body: { provider, model, messages, tools?, temperature, maxTokens }
Response: { content: string, toolCalls: ToolCall[], usage: Usage }
```

This endpoint bypasses BullMQ and calls the provider directly. It's synchronous and blocking — the agent waits for a response before executing tools and sending the next round. This is correct and intentional.

**When to use each mode:**
- `POST /api/queue/submit` (BullMQ) — for simple one-shot LLM calls, background generation tasks
- `POST /api/chat/sync` — for the agentic tool loop (agent_loop.py always uses this)

---

## 5. RAG System

### 5.1 Design Decisions

**Library:** ChromaDB in embedded mode (`chromadb` Python package, no server needed). Stores on disk at `/memory/rag/`. Persists across container restarts via the named Docker volume.

**Embeddings:** `sentence-transformers` with model `all-MiniLM-L6-v2` (22MB, runs on CPU, fast enough for agent use, no GPU needed). This runs entirely inside the agent container.

**Why not a separate vector DB container?** Each agent has its own knowledge domain. Sharing a vector DB between agents would mix their knowledge and create coupling. Embedded ChromaDB in each agent container is cleaner, simpler, and fully isolated.

**What gets indexed:**
- All `.md` files in `/memory` (automatically on every write)
- All files in configured RAG source folders (on file receipt or manual re-index)
- Files listed in agent YAML `rag.folders` config

**What does NOT get indexed:**
- `task_queue.md`, `received_files.md` — operational logs, not knowledge
- Files larger than `rag.max_file_size_kb` (default 500KB)
- Binary files (images, zip files, etc.)

### 5.2 Agent YAML Config — New RAG Section

```yaml
rag:
  enabled: true
  embedding_model: "all-MiniLM-L6-v2"   # Runs locally inside container
  folders:
    - path: "/memory"
      auto_index: true                    # Re-index this folder on every file write
      exclude_files:                      # Files to exclude from RAG
        - "task_queue.md"
        - "received_files.md"
        - "state.md"
    - path: "/storage/received"
      auto_index: true                    # Re-index when new files are received
      file_types: [".md", ".txt", ".pdf"] # Only index these types
  max_file_size_kb: 500
  top_k: 5                               # How many chunks to retrieve per query
  chunk_size: 500                        # Characters per chunk
  chunk_overlap: 50
```

### 5.3 RAG Manager Implementation — `app/rag/manager.py`

```python
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from pathlib import Path
import hashlib
import structlog

log = structlog.get_logger()

EXCLUDED_FILES = {"task_queue.md", "received_files.md", "state.md"}

class RAGManager:
    def __init__(self, config: RAGConfig):
        self.config = config
        self.enabled = config.enabled
        if not self.enabled:
            return

        # Embedded ChromaDB — stores at /memory/rag/
        self.client = chromadb.PersistentClient(
            path="/memory/rag",
            settings=Settings(anonymized_telemetry=False)
        )
        self.collection = self.client.get_or_create_collection(
            name="agent_knowledge",
            metadata={"hnsw:space": "cosine"}
        )
        self.embedder = SentenceTransformer(config.embedding_model)
        log.info("rag.initialized", collection_count=self.collection.count())

    async def index_file(self, file_path: Path) -> None:
        """Index or re-index a single file. Called after every memory write."""
        if not self.enabled:
            return
        if file_path.name in EXCLUDED_FILES:
            return
        if not self._should_index(file_path):
            return

        try:
            content = file_path.read_text(encoding="utf-8")
            if not content.strip():
                return

            # Chunk the content
            chunks = self._chunk(content)
            file_hash = hashlib.md5(content.encode()).hexdigest()

            # Delete existing chunks for this file before re-indexing
            existing = self.collection.get(where={"source": str(file_path)})
            if existing["ids"]:
                self.collection.delete(ids=existing["ids"])

            if not chunks:
                return

            # Generate embeddings for all chunks at once (batch is faster)
            embeddings = self.embedder.encode(chunks, show_progress_bar=False).tolist()

            ids = [f"{file_hash}-{i}" for i in range(len(chunks))]
            metadatas = [{"source": str(file_path), "file": file_path.name, "chunk": i} for i in range(len(chunks))]

            self.collection.add(documents=chunks, embeddings=embeddings, ids=ids, metadatas=metadatas)
            log.info("rag.indexed", file=str(file_path), chunks=len(chunks))

        except Exception as e:
            # RAG indexing failure must NEVER crash the agent
            log.error("rag.index_error", file=str(file_path), error=str(e))

    async def index_folder(self, folder_path: Path, file_types: list[str] = None) -> None:
        """Index all files in a folder. Called on startup and on new file receipt."""
        if not self.enabled:
            return
        allowed = set(file_types) if file_types else {".md", ".txt"}
        for file_path in folder_path.rglob("*"):
            if file_path.is_file() and file_path.suffix in allowed:
                await self.index_file(file_path)

    async def query(self, query_text: str, top_k: int = None) -> str:
        """Return relevant context as a formatted string for LLM injection."""
        if not self.enabled or self.collection.count() == 0:
            return ""
        k = top_k or self.config.top_k
        try:
            query_embedding = self.embedder.encode([query_text]).tolist()
            results = self.collection.query(
                query_embeddings=query_embedding,
                n_results=min(k, self.collection.count()),
                include=["documents", "metadatas", "distances"]
            )
            # Filter by relevance (cosine distance < 0.5 means relevant)
            output_parts = []
            for doc, meta, dist in zip(results["documents"][0], results["metadatas"][0], results["distances"][0]):
                if dist < 0.5:
                    output_parts.append(f"[From {meta['file']}]\n{doc}")
            return "\n\n---\n\n".join(output_parts)
        except Exception as e:
            log.error("rag.query_error", error=str(e))
            return ""

    async def force_reindex(self) -> int:
        """Full re-index of all configured folders. Returns chunk count."""
        if not self.enabled:
            return 0
        self.collection.delete(where={})  # Clear all
        for folder_config in self.config.folders:
            if Path(folder_config.path).exists():
                await self.index_folder(
                    Path(folder_config.path),
                    folder_config.file_types
                )
        return self.collection.count()

    def _chunk(self, text: str) -> list[str]:
        size = self.config.chunk_size
        overlap = self.config.chunk_overlap
        chunks = []
        start = 0
        while start < len(text):
            end = start + size
            chunks.append(text[start:end])
            start += size - overlap
        return [c for c in chunks if c.strip()]

    def _should_index(self, file_path: Path) -> bool:
        if file_path.stat().st_size > self.config.max_file_size_kb * 1024:
            return False
        return True
```

### 5.4 Integration Points

**In MemoryManager — after every write:**
```python
async def write(self, filename: str, content: str, commit_message: str = None):
    file_path = self.base_path / filename
    file_path.write_text(content, encoding="utf-8")
    # Non-blocking: fire and forget both git commit and RAG index
    asyncio.create_task(self.git.commit(filename, commit_message))
    asyncio.create_task(self.rag.index_file(file_path))  # ADD THIS
```

**In FileReceiver — after file is saved:**
```python
async def receive_file(self, payload: FilePayload) -> str:
    # ... save file to /storage/received/{senderId}/{filename}
    saved_path = save_path  # Path object
    # Update manifest
    await self._update_manifest(payload, saved_path)
    # Append to received_files.md
    await self.memory.append("received_files.md", f"- [{now}] {payload.filename} from {payload.sender_id}")
    # RAG index the received file if it's in a configured RAG folder
    asyncio.create_task(self.rag.index_file(saved_path))  # ADD THIS
    return str(saved_path)
```

**New API endpoint — force re-index:**
```
POST /rag/reindex    → triggers force_reindex(), returns { chunks_indexed: int }
GET  /rag/status     → { enabled, chunk_count, folders }
```

**Add to agent YAML expose options:**
```yaml
expose:
  - rag  # Allows external caller to trigger reindex and see RAG status
```

---

## 6. Improved File Storage

### 6.1 Storage Structure (Updated)

```
/storage/
├── received/
│   └── {sender-agent-id}/
│       └── {filename}          # Decoded file content
└── manifest.json               # Index of all received files
```

### 6.2 Storage Manifest — `app/storage/manifest.py`

The manifest is a JSON file at `/storage/manifest.json` tracking all received files.

```python
# Manifest entry structure
{
  "files": [
    {
      "id": "nanoid",
      "sender_id": "agent-a",
      "filename": "transcript.md",
      "path": "/storage/received/agent-a/transcript.md",
      "mime_type": "text/markdown",
      "size_bytes": 4200,
      "content_hash": "sha256:...",   # For deduplication
      "received_at": "2024-01-15T10:30:00Z",
      "task_id": "task-uuid",          # Which task brought this file
      "metadata": {}                   # Sender-provided metadata
    }
  ]
}
```

**Deduplication logic:** Before saving a file, compute SHA-256 of content. Check manifest for existing entry with same `content_hash`. If found, skip saving the file bytes (just add a new manifest entry pointing to the existing path). This prevents duplicate large files from filling storage.

**Size limit:** If file exceeds `MAX_FILE_SIZE_MB` (default: 50MB), reject with 413 and log the rejection. Never silently fail.

### 6.3 Updated FileReceiver — `app/communication/file_receiver.py`

```python
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50MB

class FileReceiver:
    async def receive(self, payload: FilePayload) -> FileReceiveResult:
        # 1. Decode base64
        try:
            file_bytes = base64.b64decode(payload.content)
        except Exception:
            raise ValueError("Invalid base64 content")

        # 2. Size check
        if len(file_bytes) > MAX_FILE_SIZE_BYTES:
            raise FileTooLargeError(f"File {payload.filename} exceeds 50MB limit")

        # 3. Content hash for deduplication
        content_hash = f"sha256:{hashlib.sha256(file_bytes).hexdigest()}"

        # 4. Check deduplication
        existing = await self.manifest.find_by_hash(content_hash)
        if existing:
            log.info("file_receiver.deduplicated", filename=payload.filename, existing_path=existing.path)
            saved_path = Path(existing.path)
        else:
            # 5. Save file
            save_dir = Path(f"/storage/received/{payload.sender_id}")
            save_dir.mkdir(parents=True, exist_ok=True)
            saved_path = save_dir / payload.filename
            saved_path.write_bytes(file_bytes)

        # 6. Update manifest
        entry = ManifestEntry(
            id=nanoid(),
            sender_id=payload.sender_id,
            filename=payload.filename,
            path=str(saved_path),
            mime_type=payload.mime_type,
            size_bytes=len(file_bytes),
            content_hash=content_hash,
            received_at=datetime.utcnow().isoformat(),
            task_id=payload.task_id,
            metadata=payload.metadata or {}
        )
        await self.manifest.add(entry)

        # 7. Update memory log (async, non-blocking)
        asyncio.create_task(
            self.memory.append("received_files.md",
                f"- [{entry.received_at}] {payload.filename} from {payload.sender_id} → {saved_path}")
        )

        # 8. RAG index (async, non-blocking)
        asyncio.create_task(self.rag.index_file(saved_path))

        return FileReceiveResult(path=str(saved_path), entry_id=entry.id)
```

---

## 7. Improved Agent-to-Agent Task Delivery

### 7.1 The Problem

The current design: Orchestrator sends a task to Agent B via `POST http://{agent-b}:8080/tasks`. If Agent B is restarting, the task is lost. There is no retry and no acknowledgment.

### 7.2 Fix — Retry with Exponential Backoff in Orchestrator

`template/orchestrator/src/trigger/task-completion.ts`:

```typescript
async function deliverTask(targetAgentId: string, payload: TaskPayload, maxRetries = 5): Promise<void> {
  const url = `http://${targetAgentId}:8080/tasks`;
  const delays = [1000, 2000, 4000, 8000, 16000]; // ms

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)  // 10s timeout per attempt
      });

      if (res.status === 202) {
        logger.info({ taskId: payload.taskId, targetAgentId, attempt }, 'task.delivered');
        return;
      }
      throw new Error(`Agent returned ${res.status}`);

    } catch (err) {
      if (attempt === maxRetries) {
        logger.error({ taskId: payload.taskId, targetAgentId, err }, 'task.delivery_failed');
        // Write failure event to WebSocket clients
        wsHub.broadcast({ type: 'agent:task:failed', agentId: targetAgentId, taskId: payload.taskId, error: String(err) });
        return;
      }
      const delay = delays[attempt] ?? 16000;
      logger.warn({ taskId: payload.taskId, attempt, delay }, 'task.delivery_retry');
      await sleep(delay);
    }
  }
}
```

### 7.3 Agent Task Endpoint — Return 202 Immediately

The agent's `/tasks` endpoint MUST return `202 Accepted` immediately after receiving and validating the payload. It MUST NOT wait for the agentic loop to complete before responding. The loop runs as a background task.

```python
@router.post("/tasks", status_code=202)
async def receive_task(payload: TaskPayload, background_tasks: BackgroundTasks):
    # Validate payload
    # Save attached files
    # Write to task_queue.md
    background_tasks.add_task(run_agent_loop, payload)  # Non-blocking
    return {"taskId": payload.task_id, "status": "accepted"}
```

### 7.4 Task Payload Schema (Final Version)

```python
class AttachedFile(BaseModel):
    filename: str
    content: str          # base64 encoded
    mime_type: str
    metadata: dict = {}

class TaskPayload(BaseModel):
    task_id: str
    sender_id: str        # "orchestrator" or agent ID
    instruction: str
    context: dict = {}
    attached_files: list[AttachedFile] = []
    priority: int = 0     # Higher = processed first (future use)
    created_at: str       # ISO8601
```

---

## 8. Ollama Model Compatibility Guide

### 8.1 What This System Demands of the LLM

This system makes heavy demands on the LLM:
1. **Tool calling** — must correctly format `tool_call` JSON across multiple rounds
2. **Following structured instructions** — must follow system prompts and output in expected formats
3. **Multi-turn coherence** — must maintain context across tool call → result → next call chains
4. **Markdown output** — must write clean `.md` content for memory files

Not all Ollama models can do this reliably. Model choice is the single biggest factor in whether your agents actually work.

### 8.2 Model Compatibility Table

| Model | Size | Tool Calling | Multi-turn | Memory Writing | Verdict |
|---|---|---|---|---|---|
| `qwen2.5:7b` | 4.7GB | ✅ Excellent | ✅ Good | ✅ Good | **Best choice for most agents** |
| `qwen2.5:14b` | 9GB | ✅ Excellent | ✅ Excellent | ✅ Excellent | **Best overall if you have VRAM** |
| `qwen2.5:32b` | 20GB | ✅ Excellent | ✅ Excellent | ✅ Excellent | Best quality, high resource |
| `qwen2.5-coder:7b` | 4.7GB | ✅ Good | ✅ Good | ✅ Good | Best for code/shell agents |
| `llama3.1:8b` | 4.7GB | ✅ Good | ✅ Good | ✅ Good | Solid general purpose |
| `llama3.1:70b` | 40GB | ✅ Excellent | ✅ Excellent | ✅ Excellent | Best Llama, very high resource |
| `llama3.2:3b` | 2GB | ⚠️ Inconsistent | ⚠️ Limited | ✅ OK | Too small for tool calling |
| `mistral-nemo:12b` | 7.1GB | ✅ Good | ✅ Good | ✅ Good | Good alternative |
| `mistral:7b` | 4.1GB | ⚠️ Inconsistent | ⚠️ Limited | ✅ OK | Old model, unreliable tools |
| `gemma2:9b` | 5.4GB | ❌ Poor | ✅ Good | ✅ Good | Do not use for tool-calling agents |
| `gemma2:27b` | 16GB | ⚠️ Inconsistent | ✅ Good | ✅ Good | Inconsistent tool calling |
| `phi3.5:3.8b` | 2.2GB | ⚠️ Limited | ⚠️ Limited | ✅ OK | Too small for complex agents |
| `deepseek-r1:7b` | 4.7GB | ⚠️ Inconsistent | ✅ Good | ✅ Good | Good reasoning, unreliable tools |
| `deepseek-r1:14b` | 9GB | ✅ Good | ✅ Good | ✅ Good | Better tool calling than 7b |
| `granite3.1-dense:8b` | 4.9GB | ✅ Good | ✅ Good | ✅ Good | IBM model, reliable tool use |

### 8.3 Recommended Configuration Per Agent Type

| Agent Type | Recommended Model | Why |
|---|---|---|
| General orchestrator agent | `qwen2.5:14b` | Best balance of tool calling + reasoning |
| Code/shell execution agent | `qwen2.5-coder:7b` | Trained specifically for code + commands |
| Research/summarisation agent | `qwen2.5:7b` or `llama3.1:8b` | Good reading comprehension |
| File processing / RAG agent | `qwen2.5:7b` | Handles long context well |
| Lightweight / fast agent | `qwen2.5:7b` | Smallest model that reliably calls tools |
| Complex multi-tool agent | `qwen2.5:14b` or `llama3.1:70b` | High reliability for complex chains |

### 8.4 Critical Notes on Ollama Tool Calling

**The tool format matters.** Ollama models use the same tool format as OpenAI (because the LLM Gateway uses the OpenAI SDK pointing at Ollama's `/v1/chat/completions`). The model MUST support the `tools` parameter. You can verify this by checking the model's Ollama page — look for "Tools" in the capabilities list.

**Temperature affects tool calling reliability.** For agents that call tools, use `temperature: 0.1–0.3`. Higher temperatures cause the model to produce malformed tool call JSON. Set temperature in the agent's YAML config — do not rely on defaults.

**Context window matters for the loop.** As the agentic loop runs more rounds, the message history grows. Models with larger context windows handle longer tool chains better. `qwen2.5:7b` has 32K context, which handles up to ~8 rounds comfortably with typical payloads.

**What to do when tool calling fails:** The LLM Gateway should detect malformed tool call JSON (when the model returns a string that looks like a tool call but fails JSON parsing) and treat it as a final answer. Log it as a warning, do not crash the loop.

### 8.5 Add to LLM Gateway — Model Validation

Add to `template/llm-gateway/src/providers/ollama.ts`:

```typescript
// Before accepting a job for an Ollama model, verify it supports tools
async function validateModelCapabilities(modelName: string, baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/show`, {
    method: 'POST',
    body: JSON.stringify({ name: modelName })
  });
  const info = await response.json();
  // Log a warning if model capabilities are unknown
  // Do not block — let it try and handle failure gracefully
  logger.info({ model: modelName, capabilities: info.capabilities }, 'ollama.model_info');
}
```

---

## 9. Updated Agent YAML Config Schema (Complete)

```yaml
agent:
  id: "research-agent"
  name: "Research Agent"
  description: "Researches topics using web search and produces structured reports"
  version: "1.0.0"

runtime:
  base_image: "agentflow/agent-base:latest"

llm:
  provider: "ollama"                      # ollama | openai | anthropic | gemini | groq
  model: "qwen2.5:7b"                     # For Ollama, use models from compatibility table
  temperature: 0.2                        # Keep low (0.1-0.3) for tool-calling agents
  max_tokens: 4096
  system_prompt: |
    You are a research agent. Your job is to research topics thoroughly
    using available tools and produce well-structured Markdown reports.
    Always save your findings to memory using the information you gather.

memory:
  path: "/memory"
  git_auto_commit: true
  readable_by: ["report-formatter-agent"]
  writable_by: []

# NEW: RAG configuration
rag:
  enabled: true
  embedding_model: "all-MiniLM-L6-v2"
  folders:
    - path: "/memory"
      auto_index: true
      exclude_files:
        - "task_queue.md"
        - "received_files.md"
        - "state.md"
    - path: "/storage/received"
      auto_index: true
      file_types: [".md", ".txt", ".pdf"]
  max_file_size_kb: 500
  top_k: 5
  chunk_size: 500
  chunk_overlap: 50

shell:
  enabled: true
  level: "root"

mcps:
  - name: "web-search-mcp"
    transport: "sse"
    url: "http://web-search-mcp:3000/sse"

tools:
  python_packages: ["requests", "beautifulsoup4"]
  system_packages: []

triggers:
  - type: "task"
  - type: "webhook"
  - type: "cron"
    schedule: "0 8 * * 1-5"
    timezone: "Asia/Kolkata"

expose:
  - logs
  - status
  - memory
  - chat
  - tasks
  - rag

ports:
  internal: 8080
```

---

## 10. Updated Python Dependencies (`pyproject.toml`)

```toml
[project]
name = "agent-runtime"
version = "1.0.0"
requires-python = ">=3.11"

dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    "httpx>=0.27.0",
    "pyyaml>=6.0",
    "pydantic>=2.7.0",
    "gitpython>=3.1.43",
    "apscheduler>=4.0.0a5",
    "structlog>=24.0.0",
    "watchfiles>=0.22.0",
    "chromadb>=0.5.0",                   # NEW: embedded vector store
    "sentence-transformers>=3.0.0",      # NEW: local embeddings
    "python-nanoid>=1.0.0",              # NEW: ID generation for manifest
    "python-multipart>=0.0.9",
]
```

**Note on container startup time:** `sentence-transformers` downloads the embedding model on first run (~22MB). In production, bake it into the Docker image so startup is instant:

```dockerfile
# In agent-base.Dockerfile, after installing Python deps:
RUN uv run python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
```

---

## 11. Updated API Endpoints for Agent Runtime

```
# Existing endpoints (unchanged)
GET  /health
GET  /status
GET  /logs
GET  /memory
GET  /memory/{filename}
PUT  /memory/{filename}
POST /tasks                          → returns 202 immediately, runs loop in background
POST /files
POST /chat
GET  /tasks
POST /shell
GET  /config

# NEW: RAG endpoints
POST /rag/reindex                    → force full re-index, returns { chunks_indexed: int }
GET  /rag/status                     → { enabled, chunk_count, folders, last_indexed }

# NEW: Storage manifest
GET  /storage/manifest               → list all received files with metadata
GET  /storage/files/{entry_id}       → get file content by manifest entry ID
```

---

## 12. Builder UI — Changes for RAG Config

In `AgentConfigPanel`, add a new **RAG** tab between Shell and MCPs:

**RAG Tab:**
- Enabled toggle
- Embedding model selector (dropdown: `all-MiniLM-L6-v2` | `all-mpnet-base-v2` | `paraphrase-multilingual-MiniLM-L12-v2`)
- Folders table: path, auto_index toggle, file_types input, exclude_files input, add/remove rows
- Max file size input (KB)
- Top K slider (1–20)
- Chunk size + overlap inputs

All RAG config is written to the agent YAML by the generator just like every other config section.

---

## 13. What NOT To Do (Updated)

*(All original rules apply, plus:)*

15. **Do NOT await RAG indexing or git commits.** Both are `asyncio.create_task()` — fire and forget. The agent must never wait for these to complete before returning from a memory write or file receipt.

16. **Do NOT let the agentic loop crash on a tool error.** Every tool execution is wrapped in try/except. A failed tool returns an error string to the LLM — it does NOT raise an exception that kills the loop. The LLM then decides what to do with the tool error.

17. **Do NOT use `temperature > 0.5` for tool-calling agents.** High temperature causes malformed tool call JSON. Set `temperature: 0.1–0.3` in the agent YAML for any agent that uses tools.

18. **Do NOT run `qwen2.5:7b` or larger on a machine without at least 8GB RAM available for Docker.** Check system resources before choosing a model. Under-resourced models produce garbage output, not errors.

19. **Do NOT treat `gemma` models as tool-calling capable.** They are good for text generation but consistently fail at structured tool call formatting. Use `qwen2.5` or `llama3.1` instead.

20. **Do NOT put the ChromaDB data directory anywhere other than `/memory/rag/`.** It must be inside the named Docker volume so it persists across container restarts alongside the `.md` files it indexes.

21. **Do NOT forget to pre-download the embedding model in the Dockerfile.** Cold-start downloading 22MB inside a running container creates unnecessary latency on first use.

---

## 14. Final Checklist (Updated)

*(All original checks apply, plus:)*

- [ ] Agent loop: POST task → agent runs multiple tool rounds → final answer written to memory
- [ ] Agent loop: Shell tool executes correctly and result is passed back to LLM as `tool_result`
- [ ] Agent loop: MCP tool is called, result returned, LLM continues reasoning
- [ ] Agent loop: Loop terminates correctly when LLM produces answer with no tool calls
- [ ] Agent loop: Loop terminates after MAX_TOOL_ROUNDS with appropriate warning log
- [ ] RAG: Writing a `.md` file triggers async re-index (verify via `/rag/status` chunk count change)
- [ ] RAG: Receiving a file triggers async re-index
- [ ] RAG: Query returns relevant chunks injected into LLM messages
- [ ] RAG: Empty RAG returns empty string (no injection), not an error
- [ ] RAG: ChromaDB data persists across agent container restart (named volume check)
- [ ] RAG: Excluded files (task_queue.md etc.) do NOT appear in RAG results
- [ ] File storage: Duplicate file (same content) is deduplicated, manifest shows both entries pointing to same path
- [ ] File storage: File over 50MB is rejected with 413, not silently dropped
- [ ] File storage: `/storage/manifest` lists all received files with correct metadata
- [ ] Task delivery: If agent is restarting, Orchestrator retries with backoff, eventually delivers
- [ ] Task delivery: Agent returns 202 immediately, runs loop as background task
- [ ] Ollama: Test with `qwen2.5:7b` — verify tool calls are formatted correctly across multiple rounds
- [ ] Embedding model: Pre-baked in Docker image, no download at container startup