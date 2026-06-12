# AgentDock Hardening & Bug Fixes

This document records critical runtime fixes, hardening efforts, and architectural corrections implemented in the AgentDock generator and runner layers following end-to-end system audits.

---

## Historical Bug Fixes

### 1. Connections Silently Dropped in Config Loader (Critical)
- **Component:** Runtime Orchestrator (`apps/orchestrator/src/config/loader.ts`)
- **Root Cause:** The `workflow.yaml` file stores main configuration metadata (`id`, `name`, `version`) under a nested `workflow:` key, but `connections` and `agents` arrays live at the document's top level. The loader executed `workflow = raw?.workflow ?? workflow`, replacing the configuration with the nested sub-object and discarding all workflow connections. Because of this, the trigger manager received an empty array and downstream agents never fired.
- **Fix:** Merged the nested `workflow` metadata block with the top-level connections and agents lists:
  ```ts
  workflow = {
    ...(raw?.workflow ?? {}),
    connections: raw?.connections ?? raw?.workflow?.connections ?? [],
    agents: raw?.agents ?? raw?.workflow?.agents ?? [],
  };
  ```

### 2. Empty MCP Command Strings Crash Agent Startup (High)
- **Component:** Builder API Generator (`apps/builder-api/src/generator/agent-config-gen.ts`)
- **Root Cause:** When the LLM omitted the MCP `command` attribute (frequent with stdio-based servers), the generator emitted an empty string (`command: ''`) inside the agent's configuration YAML. On container startup, the MCP client validated stdio transports, threw a `mcp_connect_failed` exception, and crashed the runtime.
- **Fix:** Added validation checks to filter out MCP entries with empty commands or invalid transport configurations before compiling the system configs.

### 3. Silent Zero-Byte Output Files (High)
- **Component:** Agent Runtime (`apps/agent-runtime/app/communication/task_receiver.py`)
- **Root Cause:** Smaller inference models (e.g., 0.6B parameters) occasionally returned empty strings due to context congestion or prompt fatigue. The runtime wrote these blank strings directly to output communication files, producing 0-byte outputs that stalled downstream pipeline steps.
- **Fix:** Implemented an output check. If an agent returns an empty output, the execution loop retries once with a simplified instruction prompt. If it fails a second time, the runtime throws an explicit execution exception rather than writing empty data.

### 4. Git Index Lock on Concurrent Commits (Medium)
- **Component:** Agent Runtime Git Memory (`apps/agent-runtime/app/memory/git.py`)
- **Root Cause:** Both the `write()` and `append()` methods in the memory manager spawned asynchronous background git commits via `asyncio.create_task(self.git.commit(...))`. When multiple files (e.g., `task_queue.md` and `state.md`) were updated simultaneously, concurrent `git add .` executions collided, resulting in Git index lock errors (exit code 128).
- **Fix:** Integrated an `asyncio.Lock` inside the `GitManager` class. This serializes all git commit transactions for the agent's volume, guaranteeing thread-safe, non-overlapping updates.

### 5. Git Repository Not Initialized on Container Startup (Medium)
- **Component:** Base Agent Image (`template/agent-base.Dockerfile`)
- **Root Cause:** `git init` was executed programmatically during python startup inside `MemoryManager.setup()`. However, if the docker volume was mounted or checked early during container health checks, git operations failed with "not a git repository" errors.
- **Fix:** Moved repository initialization to the docker building layer by running `git init /memory` during the Docker image compilation.

### 6. Missing Profile File Causes Prompt Compilation Errors (Medium)
- **Component:** Agent Runtime (`apps/agent-runtime/app/communication/task_receiver.py`)
- **Root Cause:** Prompt templates reference `profiles/{{input.userId}}.md` to load user histories. If a user had no existing profile (e.g., on first interaction), the engine passed literal missing path instructions, confusing the LLM and wasting token budget on invalid tool calls.
- **Fix:** The parser now verifies the existence of user state profiles. If a profile is absent, it injects a fallback message: `(no profile file found at ... — skip reading it and proceed with defaults)`.

### 7. naive RAG Chunker Splitting (Medium)
- **Component:** Agent Runtime RAG (`apps/agent-runtime/app/rag/manager.py`)
- **Root Cause:** The embedding processor utilized a character-length sliding window (`chunk_size=500`, `chunk_overlap=50`) that arbitrarily sliced markdown headers, code snippets, and sentences, introducing semantic noise and degrading retrieval accuracy.
- **Fix:** Replaced the naive chunker with a markdown-aware parser that splits content hierarchically:
  1. Splitting on Markdown Headers (`#`, `##`, `###`) to preserve section context.
  2. Splitting on blank lines (paragraphs) when sections exceed max chunk size.
  3. Splitting on sentences as a final fallback.
