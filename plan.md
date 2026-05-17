# AgentDock — Full Implementation Specification
> **Written for an AI coding agent.** Read this entire document before writing a single line of code. Every decision here has a reason. Do not deviate from stated patterns without understanding why they exist. When in doubt, re-read the relevant section.

---

## 0. How to Use This Document

- **Before using any library or framework**, use the **Context7 MCP** to fetch its latest documentation. Do not rely on training data for API signatures, package names, or config formats — these change.
- **Before each phase**, re-read the full Phase spec and the Architecture section.
- **Never assume** an unstated design choice. If something is ambiguous, default to the simplest implementation that satisfies the stated requirement.
- This document uses the word **MUST** for non-negotiable requirements and **SHOULD** for strong preferences.

---

## 1. Project Purpose & Intent

AgentDock is a **self-hostable, production-ready multi-agent workflow orchestration platform**. The core product is:

1. A **visual web editor** (like n8n) where you design agent graphs — nodes are agents, arrows are triggers.
2. A **runtime engine** that converts that graph into real Docker containers that talk to each other.
3. A **unified API gateway** that exposes every agent's status, memory, logs, and chat interface externally.
4. A **shareable deployment unit** — the entire multi-agent system is a Docker Compose bundle anyone can run anywhere.

**The goal is not to build a framework. It is to build a complete, running product** — something you can open in a browser, draw a workflow, hit "Deploy," and get back API endpoints for every agent within seconds.

**What this is NOT:**
- Not a cloud SaaS platform (though it can be deployed to cloud)
- Not a general-purpose container orchestrator (not replacing Kubernetes)
- Not a wrapper around LangChain or AutoGen — agents are first-class Python processes
- Not a toy — every design decision must hold under production load

---

## 2. Architectural Philosophy

### 2.1 Core Principles

**P1 — The Orchestrator is the only public surface.** All external API calls, all WebSocket connections, all webhook ingress go through the Orchestrator. Agent containers never expose ports to the host. This makes the system easy to secure, easy to proxy behind nginx, and easy to reason about.

**P2 — Agents own their memory.** Nothing outside an agent container writes to that agent's `.md` files. The Orchestrator can READ memory (via the agent's API), but never WRITE directly. This prevents race conditions and preserves agent autonomy.

**P3 — Configuration is the source of truth.** Every agent's behavior is fully defined in its YAML config file. Changing config + restarting that one container is the only way to change agent behavior. No runtime state mutations from the outside.

**P4 — Communication is always named, never addressed by IP.** Agents address each other by Docker DNS name (container name), never by IP address. IPs change. Names don't.

**P5 — Queues absorb all LLM traffic.** No agent ever calls an LLM provider directly. All LLM requests go to the LLM Gateway queue. This is what makes the load balancer and provider switching work correctly.

**P6 — Each system is fully isolated.** Each "system" (a workflow + its agents) has its own Redis, its own Docker network, its own LLM Gateway. Systems never share infrastructure.

**P7 — The frontend writes config, the runtime reads it.** The visual editor produces YAML/JSON config files. The runtime consumes them. These are the only two things. Do not couple the frontend to the runtime in any other way than through the Orchestrator API.

---

## 3. Architecture Decision Records (ADRs)

### ADR-001: Docker Socket Mounting over Docker-in-Docker
**Decision:** Mount `/var/run/docker.sock` into the Orchestrator container instead of running true DinD (`--privileged`).
**Reason:** True DinD gives the container full host kernel access — a catastrophic security hole in production. Socket mounting achieves the exact same result (Orchestrator can spawn, inspect, start, stop, remove containers) with standard Docker authorization. The agent containers appear as sibling containers on the host, which is also easier to debug.
**Implication:** The Orchestrator uses the Docker SDK (`dockerode` for Node.js) to manage containers. It MUST create a dedicated Docker network per system and attach all agents to it.

### ADR-002: YAML + JSON for Workflow Persistence
**Decision:** Workflow definitions are stored as YAML files. Agent configs are stored as YAML files. Both are validated against JSON Schema on load.
**Reason:** YAML is human-readable and editable without the UI. Hot-reload of a single agent (modify its YAML → restart its container) works without touching the Orchestrator or any other agent. JSON Schema validation prevents invalid configs from ever reaching the runtime.
**Implication:** There is a `packages/config-schema` package that exports Zod schemas (TypeScript) and JSON Schema files. Both the frontend and the Orchestrator validate against these before accepting any config.

### ADR-003: Orchestrator as API Proxy for All Agent Endpoints
**Decision:** All external calls to agent endpoints go through the Orchestrator, which proxies them to the agent's internal FastAPI server.
**Reason:** (1) Agents don't need to know about authentication. (2) The Orchestrator can enforce `expose` permissions from agent config — if `memory` is not in the `expose` list, the proxy returns 403. (3) This is the right slot for RBAC middleware later — one place, no agent-side changes needed. (4) No host port management needed — agents live entirely on the internal Docker network.
**Implication:** The Orchestrator has a `/proxy` module that maps `/api/agents/:id/*` to `http://{container-name}:8080/*`.

### ADR-004: BullMQ in a Dedicated LLM Gateway Container
**Decision:** A separate `llm-gateway` container handles all LLM job queuing, provider routing, and Ollama load balancing.
**Reason:** LLM calls are the most resource-intensive and failure-prone operations. Isolating them means: (1) you can scale the gateway independently, (2) a provider outage doesn't crash the orchestrator, (3) you can inspect the queue and retry jobs without restarting anything else, (4) the load balancer logic for multiple Ollama servers is cleanly encapsulated.
**Implication:** Agents NEVER call LLM providers directly. They POST a job to the LLM Gateway's HTTP API and either poll or receive a webhook callback with the result.

### ADR-005: Markdown Files + Git for Agent Memory
**Decision:** Each agent's memory is a set of `.md` files mounted as a Docker volume. Every write triggers a `git commit` on that volume.
**Reason:** `.md` files are readable by humans, readable by LLMs (just pass the file content as context), editable in any text editor, and diffable. Git gives you time-travel for free. No database to manage, no schema migrations, no connection pooling.
**Implication:** Each agent container has a `/memory` volume. The Python runtime has a `MemoryManager` class that wraps all file I/O and calls `git add . && git commit -m "..."` after every write. Git commits are non-blocking (run in a subprocess, agent does not wait for commit to complete before continuing work).

### ADR-006: Agent-to-Agent Communication via Internal Docker DNS + HTTP
**Decision:** Agents communicate with each other via HTTP on the internal Docker network using container DNS names.
**Reason:** This is the simplest, most debuggable, most production-proven approach. gRPC adds complexity without meaningful benefit at this scale. Message brokers for agent-to-agent messages add latency and another infrastructure component. Direct HTTP on a private network is fast, observable, and simple.
**Implication:** Every agent's FastAPI server exposes `/tasks` (receive a task), `/files` (receive a file), `/status`, `/memory`, `/logs`. Agents know each other's DNS names from their config (injected as env vars at container start by the Orchestrator).

### ADR-007: Bun for all Node.js services, uv for all Python services
**Decision:** Use Bun as the JavaScript runtime and package manager for all Node.js services. Use uv for all Python package management.
**Reason:** Bun is significantly faster for both startup and package installation — critical for container builds and cold starts. uv is the modern Python package manager with lockfile support and dramatically faster resolution than pip.
**Implication:** No `npm`, `yarn`, `pnpm`, or `pip` commands anywhere in this codebase. Dockerfiles use `bun install` and `uv sync`. `package.json` scripts use `bun run`. Python projects use `pyproject.toml` + `uv.lock`.

---

## 4. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOST MACHINE                                  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              SYSTEM-{id} Docker Network                       │   │
│  │                                                               │   │
│  │  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │   │
│  │  │  frontend   │    │ orchestrator │    │  llm-gateway   │  │   │
│  │  │  :3000      │◄───│  :4000       │───►│  :5000         │  │   │
│  │  │  React/Vite │    │  Bun/Hono    │    │  Bun/BullMQ    │  │   │
│  │  └─────────────┘    └──────┬───────┘    └───────┬────────┘  │   │
│  │                            │                    │            │   │
│  │                     Docker │Socket              │ Queue      │   │
│  │                            ▼                    ▼            │   │
│  │  ┌─────────────┐    ┌──────────────┐    ┌────────────────┐  │   │
│  │  │    redis    │    │   agent-001  │    │  Ollama / APIs │  │   │
│  │  │  :6379      │◄───│  :8080 (int) │    │  (configured)  │  │   │
│  │  │  (isolated) │    │  Python/uv   │    └────────────────┘  │   │
│  │  └─────────────┘    └──────┬───────┘                        │   │
│  │                            │ Docker DNS                      │   │
│  │                     ┌──────▼───────┐                         │   │
│  │                     │   agent-002  │                         │   │
│  │                     │  :8080 (int) │                         │   │
│  │                     │  Python/uv   │                         │   │
│  │                     └─────────────┘                          │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  /var/run/docker.sock ──────────────────────────► orchestrator      │
└─────────────────────────────────────────────────────────────────────┘

External access: Only port 4000 (orchestrator) and 3000 (frontend) exposed to host.
All agent containers: ZERO host port exposure.
```

**Data flow for a task:**
1. External trigger (webhook / cron / manual) → Orchestrator
2. Orchestrator creates task payload → POST to target agent's `/tasks` endpoint (via Docker DNS)
3. Agent receives task → writes task to its own memory (`task_queue.md`)
4. Agent sends LLM request → POST to LLM Gateway `/api/queue/submit`
5. LLM Gateway queues job in BullMQ → routes to provider → returns result
6. Agent processes result → updates memory `.md` files → git commit (async)
7. Agent POSTs result to next agent's `/tasks` (if configured) OR sends completion event to Orchestrator
8. Orchestrator broadcasts `agent:task:completed` WebSocket event to all connected UI clients

---

## 5. Complete Technology Stack

> **IMPORTANT:** Before using any library below, use Context7 MCP to fetch its current documentation. Run: `mcp context7 resolve-library-id "{library name}"` then `mcp context7 get-library-docs "{id}"`.

### 5.1 Orchestrator (`apps/orchestrator`) — Node.js/TypeScript/Bun

| Concern | Library | Reason |
|---|---|---|
| HTTP server | `hono` | Lightweight, TypeScript-first, works perfectly with Bun |
| WebSocket | `hono/ws` or `ws` | Native WebSocket upgrade on Hono |
| Docker SDK | `dockerode` | Most mature Node.js Docker API client |
| JWT | `hono/jwt` or `jose` | Standard JWT for Hono middleware |
| YAML parsing | `js-yaml` | Well-tested, no native deps |
| Schema validation | `zod` | TypeScript-first, runtime + compile-time safety |
| Cron | `croner` | Modern cron with timezone support, Bun-compatible |
| HTTP proxy | `http-proxy-middleware` or manual fetch proxy | For agent endpoint proxying |
| Logging | `pino` | Structured JSON logging, very fast |
| Config | `dotenv` via Bun built-in | Environment variable loading |

### 5.2 LLM Gateway (`apps/llm-gateway`) — Node.js/TypeScript/Bun

| Concern | Library | Reason |
|---|---|---|
| HTTP server | `hono` | Same as orchestrator, consistent |
| Queue | `bullmq` | The specified queue system — mature, Redis-backed |
| Redis client | `ioredis` | Required by BullMQ, most reliable Redis client |
| OpenAI compat | `openai` | Covers OpenAI + any OpenAI-compatible API (Ollama, Groq) |
| Anthropic | `@anthropic-ai/sdk` | Official SDK |
| Google AI | `@google/generative-ai` | Official Gemini SDK |
| Logging | `pino` | Consistent with orchestrator |

### 5.3 Agent Runtime (`apps/agent-runtime`) — Python/uv

| Concern | Library | Reason |
|---|---|---|
| HTTP server | `fastapi` | Async, fast, OpenAPI docs auto-generated |
| ASGI server | `uvicorn` | Standard FastAPI server |
| HTTP client | `httpx` | Async HTTP, consistent API |
| YAML | `pyyaml` | Config file loading |
| Schema validation | `pydantic` v2 | FastAPI uses it natively |
| Git operations | `gitpython` | Python git wrapper |
| Shell execution | `asyncio.subprocess` | Built-in, async shell |
| Scheduling | `apscheduler` | Cron + interval job scheduling inside agent |
| Logging | `structlog` | Structured logging, consistent with pino output format |
| File watching | `watchfiles` | Watch config file for hot-reload |

### 5.4 Frontend (`apps/frontend`) — React/TypeScript/Bun/Vite

| Concern | Library | Reason |
|---|---|---|
| Build | `vite` | Fastest dev server + build, Bun-compatible |
| Canvas | `@xyflow/react` (React Flow v12) | Industry standard for node-graph UIs, exactly like n8n |
| State | `zustand` | Simple, no boilerplate, works perfectly for canvas state |
| Server state | `@tanstack/react-query` | Data fetching, caching, real-time sync |
| WebSocket | `socket.io-client` or native `WebSocket` | Real-time agent events |
| Forms | `react-hook-form` + `zod` | Agent config forms with validation |
| UI components | `shadcn/ui` | Headless, customizable, Tailwind-based |
| Styling | `tailwindcss` | Utility-first, required by shadcn |
| Icons | `lucide-react` | Consistent icon set |
| Code editor | `@monaco-editor/react` | For `.md` memory file viewer/editor |
| Notifications | `sonner` | Toast notifications for agent events |
| Markdown render | `react-markdown` | Render agent memory `.md` files |
| HTTP client | `ky` | Lightweight fetch wrapper |

---

## 6. Monorepo Structure

```
AgentDock/
├── apps/
│   ├── orchestrator/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── systems.ts       # System CRUD + lifecycle
│   │   │   │   │   ├── agents.ts        # Agent CRUD + proxy
│   │   │   │   │   ├── workflows.ts     # Workflow config CRUD
│   │   │   │   │   ├── webhooks.ts      # Inbound webhook triggers
│   │   │   │   │   └── auth.ts          # Login, API key management
│   │   │   │   ├── middleware/
│   │   │   │   │   ├── jwt.ts
│   │   │   │   │   ├── apiKey.ts
│   │   │   │   │   └── expose-check.ts  # Enforce agent expose[] config
│   │   │   │   └── websocket/
│   │   │   │       └── hub.ts           # WebSocket connection hub
│   │   │   ├── docker/
│   │   │   │   ├── client.ts            # dockerode instance + helpers
│   │   │   │   ├── container-manager.ts # Spawn, stop, restart containers
│   │   │   │   └── network-manager.ts   # Create/delete Docker networks
│   │   │   ├── workflow/
│   │   │   │   ├── parser.ts            # YAML → validated WorkflowGraph
│   │   │   │   ├── engine.ts            # Execute graph, manage state
│   │   │   │   └── hot-reload.ts        # Watch config files, restart agents
│   │   │   ├── trigger/
│   │   │   │   ├── cron.ts              # croner-based scheduler
│   │   │   │   ├── task-completion.ts   # Listen for agent done events
│   │   │   │   ├── memory-condition.ts  # Poll/watch agent memory for conditions
│   │   │   │   └── webhook.ts           # Register inbound webhook routes
│   │   │   ├── proxy/
│   │   │   │   └── agent-proxy.ts       # Proxy /api/agents/:id/* to container
│   │   │   ├── auth/
│   │   │   │   ├── jwt.ts
│   │   │   │   └── api-keys.ts          # Generate, store, validate API keys
│   │   │   ├── config/
│   │   │   │   └── env.ts               # Zod-validated env vars
│   │   │   └── index.ts                 # App entry point
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── llm-gateway/
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   └── routes/
│   │   │   │       ├── queue.ts          # Submit job, get job status
│   │   │   │       ├── providers.ts      # CRUD provider configs
│   │   │   │       └── health.ts
│   │   │   ├── queue/
│   │   │   │   ├── worker.ts             # BullMQ worker — processes LLM jobs
│   │   │   │   └── producer.ts           # BullMQ job producer
│   │   │   ├── providers/
│   │   │   │   ├── base.ts               # Abstract LLMProvider interface
│   │   │   │   ├── ollama.ts             # Ollama via OpenAI-compat SDK
│   │   │   │   ├── openai.ts
│   │   │   │   ├── anthropic.ts
│   │   │   │   ├── gemini.ts
│   │   │   │   ├── groq.ts
│   │   │   │   └── registry.ts           # Map provider name → instance
│   │   │   ├── loadbalancer/
│   │   │   │   └── ollama-lb.ts          # Round-robin / least-busy across Ollama servers
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── agent-runtime/
│   │   ├── app/
│   │   │   ├── main.py                   # FastAPI app, lifespan startup
│   │   │   ├── config/
│   │   │   │   ├── loader.py             # Load + validate agent YAML config
│   │   │   │   └── schema.py             # Pydantic models for agent config
│   │   │   ├── memory/
│   │   │   │   ├── manager.py            # Read/write .md files
│   │   │   │   └── git.py                # Async git commit after writes
│   │   │   ├── shell/
│   │   │   │   └── executor.py           # asyncio.subprocess shell runner
│   │   │   ├── mcp/
│   │   │   │   └── client.py             # MCP session manager per agent
│   │   │   ├── llm/
│   │   │   │   └── client.py             # POST job to LLM Gateway, await result
│   │   │   ├── communication/
│   │   │   │   ├── task_receiver.py      # /tasks endpoint handler
│   │   │   │   └── file_receiver.py      # /files endpoint handler
│   │   │   ├── triggers/
│   │   │   │   └── scheduler.py          # APScheduler cron jobs
│   │   │   └── api/
│   │   │       └── routes.py             # All FastAPI routes
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   └── uv.lock
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   │   ├── canvas/
│       │   │   │   ├── AgentNode.tsx     # Custom React Flow node
│       │   │   │   ├── TriggerEdge.tsx   # Custom React Flow edge with trigger config
│       │   │   │   ├── Canvas.tsx        # Main React Flow wrapper
│       │   │   │   └── Toolbar.tsx       # Add agent, save, deploy buttons
│       │   │   ├── panels/
│       │   │   │   ├── AgentConfigPanel.tsx   # Right panel: configure selected agent
│       │   │   │   ├── TriggerPanel.tsx        # Configure edge trigger type
│       │   │   │   └── MCPPanel.tsx            # Add/remove MCPs for agent
│       │   │   ├── views/
│       │   │   │   ├── LogViewer.tsx
│       │   │   │   ├── MemoryViewer.tsx         # Markdown file browser + editor
│       │   │   │   ├── ChatInterface.tsx
│       │   │   │   ├── StatusDashboard.tsx
│       │   │   │   └── TaskQueueView.tsx
│       │   │   └── layout/
│       │   │       ├── Sidebar.tsx
│       │   │       └── Header.tsx
│       │   ├── stores/
│       │   │   ├── workflow.store.ts      # Canvas nodes + edges state (Zustand)
│       │   │   ├── agents.store.ts        # Live agent status
│       │   │   └── ws.store.ts            # WebSocket connection + events
│       │   ├── api/
│       │   │   ├── client.ts             # ky HTTP client with auth headers
│       │   │   ├── systems.api.ts
│       │   │   ├── agents.api.ts
│       │   │   └── workflows.api.ts
│       │   ├── pages/
│       │   │   ├── WorkflowEditor.tsx    # Main canvas page
│       │   │   ├── AgentDetail.tsx       # Agent logs/memory/chat tabs
│       │   │   └── Login.tsx
│       │   ├── types/                    # TypeScript types matching backend Zod schemas
│       │   └── main.tsx
│       ├── Dockerfile
│       ├── vite.config.ts
│       ├── package.json
│       └── tailwind.config.ts
│
├── packages/
│   ├── config-schema/
│   │   ├── src/
│   │   │   ├── agent.schema.ts           # Zod schema for agent YAML
│   │   │   ├── workflow.schema.ts        # Zod schema for workflow YAML
│   │   │   └── index.ts
│   │   └── package.json
│   └── shared-types/
│       ├── src/
│       │   ├── events.ts                 # WebSocket event types
│       │   ├── api.ts                    # Request/response types
│       │   └── index.ts
│       └── package.json
│
├── docker/
│   ├── agent-base.Dockerfile             # Base image for all agent containers
│   ├── orchestrator.Dockerfile
│   ├── llm-gateway.Dockerfile
│   └── frontend.Dockerfile
│
├── compose/
│   ├── docker-compose.yml                # Production (pull from registry)
│   └── docker-compose.dev.yml            # Dev overrides (build local, hot reload)
│
├── docs/
│   ├── architecture.md
│   ├── agent-config-reference.md
│   ├── workflow-config-reference.md
│   ├── api-reference.md
│   ├── deployment-guide.md
│   └── development-guide.md
│
├── scripts/
│   ├── build-images.sh                   # Build all Docker images
│   ├── push-images.sh                    # Push to registry
│   └── dev.sh                            # Start dev environment
│
├── .env.example
├── bunfig.toml                           # Bun workspace config
└── package.json                          # Workspace root
```

---

## 7. Data Schemas

### 7.1 Agent Config YAML (per agent, lives in `configs/agents/{id}.yaml`)

```yaml
agent:
  id: "youtube-transcriber"                 # Unique within a system, used as container name suffix
  name: "YouTube Transcriber"
  description: "Reads YouTube transcripts and summarizes them on demand"
  version: "1.0.0"

runtime:
  base_image: "AgentDock/agent-base:latest" # Can be overridden per agent
  # Optional: custom_dockerfile: "./agents/youtube/Dockerfile"

llm:
  provider: "ollama"                        # ollama | openai | anthropic | gemini | groq
  model: "llama3.1:8b"
  # For Ollama: the LLM Gateway load balancer picks the server
  # For cloud: API key read from env var at runtime (never in config)
  temperature: 0.7
  max_tokens: 4096
  system_prompt: |
    You are a YouTube transcript analyzer. You receive transcripts and produce
    structured summaries. Always output in Markdown format.

memory:
  path: "/memory"                           # Mount point inside container (always /memory)
  git_auto_commit: true
  readable_by:                              # Other agent IDs allowed to read this agent's memory
    - "summarizer-agent"
  writable_by: []                           # Other agents allowed to write — leave empty unless needed

shell:
  enabled: true
  level: "root"                             # root | restricted (allowlist)
  # If level is "restricted", list allowed commands:
  # allowed_commands: ["curl", "yt-dlp", "python3"]

mcps:
  - name: "youtube-mcp"
    transport: "sse"                        # sse | stdio
    url: "http://youtube-mcp:3000/sse"     # For SSE transport
    # For stdio: command: "npx @modelcontextprotocol/server-youtube"
    env:
      YOUTUBE_API_KEY: "${YOUTUBE_API_KEY}" # Env var injection — never hardcode secrets

tools:
  # Additional packages to install at container startup (via uv pip install)
  python_packages: ["yt-dlp", "youtube-transcript-api"]
  system_packages: []                       # apt packages (requires root)

triggers:
  # Triggers this agent listens for (how it gets activated)
  - type: "task"                            # Receives a task from orchestrator or another agent
  - type: "cron"
    schedule: "0 9 * * 1-5"               # Standard cron expression
    timezone: "Asia/Kolkata"
  - type: "webhook"                         # Exposed as POST /webhooks/{agent-api-key}

expose:
  # What this agent's API key allows external callers to see
  # Options: logs | chat | memory | status | tasks | raw_response
  - logs
  - status
  - memory
  - chat

ports:
  internal: 8080                            # FastAPI server — NEVER change this
  # No host port. Ever. The orchestrator proxies all traffic.
```

### 7.2 Workflow Config YAML (lives in `configs/workflows/{id}.yaml`)

```yaml
workflow:
  id: "youtube-research-pipeline"
  name: "YouTube Research Pipeline"
  version: "1.0.0"
  description: "Transcribes YouTube videos and produces research reports"

system:
  id: "research-system-01"                  # Which system this workflow belongs to
  docker_network: "AgentDock-research-01"  # Auto-generated, do not set manually

agents:
  - ref: "youtube-transcriber"             # Must match agent config id
    position: { x: 100, y: 200 }          # Canvas position (set by UI)
  - ref: "summarizer"
    position: { x: 400, y: 200 }
  - ref: "reporter"
    position: { x: 700, y: 200 }

connections:
  - id: "conn-001"
    from: "youtube-transcriber"
    to: "summarizer"
    trigger:
      type: "task_completion"              # When youtube-transcriber completes, trigger summarizer
      pass_output: true                    # Pass the output of from-agent as input to to-agent
    metadata:
      label: "Transcript ready"

  - id: "conn-002"
    from: "summarizer"
    to: "reporter"
    trigger:
      type: "memory_condition"
      condition:
        file: "state.md"
        contains: "summary_complete: true"
      check_interval_seconds: 10
    metadata:
      label: "Summary done"
```

---

## 8. Service Implementation Details

### 8.1 Orchestrator

**Startup sequence:**
1. Validate env vars with Zod (fail fast if missing)
2. Connect to Docker socket — verify it is accessible, log Docker version
3. Load all workflow YAML files from `configs/workflows/`
4. For each system that has `auto_start: true`, spawn containers
5. Start cron triggers from workflow connection configs
6. Start webhook listener routes
7. Start memory condition watchers
8. Start HTTP server + WebSocket hub

**Container spawning logic** (`docker/container-manager.ts`):
```
function spawnAgent(agentConfig, systemId, workflowConfig):
  1. Pull base image if not present
  2. Create container with:
     - name: `AgentDock-{systemId}-{agentId}`
     - image: agentConfig.runtime.base_image
     - network: system's Docker network (attach at creation)
     - volumes:
         - `AgentDock-memory-{agentId}:/memory` (named Docker volume — persists across restarts)
         - `./configs/agents/{agentId}.yaml:/app/config/agent.yaml:ro` (read-only config mount)
     - env:
         - AGENT_ID={agentId}
         - SYSTEM_ID={systemId}
         - LLM_GATEWAY_URL=http://AgentDock-{systemId}-llm-gateway:5000
         - REDIS_URL=redis://AgentDock-{systemId}-redis:6379
         - ORCHESTRATOR_URL=http://AgentDock-{systemId}-orchestrator:4000
         - All secrets from .env file scoped to this agent
         - PEER_AGENTS={json array of {id, url} for agents this one is allowed to contact}
     - no host port bindings (critical)
  3. Start container
  4. Wait for health check on :8080/health (max 30s, retry every 2s)
  5. Emit WebSocket event: agent:started
```

**Proxy middleware** (`proxy/agent-proxy.ts`):
- Route: `GET|POST|PUT|DELETE /api/agents/:agentId/*`
- Middleware: (1) Validate JWT or API key, (2) load agent config, (3) check if requested path is in agent's `expose[]` list — 403 if not
- Proxy to: `http://AgentDock-{systemId}-{agentId}:8080/{rest of path}`
- Forward response headers + body as-is
- Log all proxy calls with request/response metadata (not body) to pino

**WebSocket hub** (`api/websocket/hub.ts`):
- Clients connect with JWT token in query param: `ws://host:4000/ws?token=...`
- Hub maintains a `Map<clientId, WebSocket>` of connected clients
- Agents send events to orchestrator via `POST /internal/events` (internal route, no auth needed from agent containers since they're on the private network — but validate they're from a known container IP range)
- Orchestrator broadcasts to all relevant connected clients
- Event types (defined in `packages/shared-types/events.ts`):
  ```typescript
  type AgentEvent =
    | { type: 'agent:status'; agentId: string; status: 'running'|'stopped'|'error' }
    | { type: 'agent:log'; agentId: string; level: 'info'|'warn'|'error'; message: string; timestamp: string }
    | { type: 'agent:memory:updated'; agentId: string; file: string; commitHash: string }
    | { type: 'agent:task:started'; agentId: string; taskId: string }
    | { type: 'agent:task:completed'; agentId: string; taskId: string; output: string }
    | { type: 'agent:task:failed'; agentId: string; taskId: string; error: string }
    | { type: 'system:status'; systemId: string; status: 'running'|'stopped'|'partial' }
  ```

**Hot-reload logic** (`workflow/hot-reload.ts`):
- Watch `configs/agents/` directory with a file watcher
- On file change: validate new config, stop the specific agent container, respawn with new config
- Other agents are not affected — they continue running
- Log the hot-reload event, emit WebSocket event `agent:status: restarting`

### 8.2 LLM Gateway

**Queue structure:**
- One BullMQ queue named `llm-jobs` backed by the system's Redis instance
- Each job payload:
  ```typescript
  interface LLMJob {
    jobId: string;
    agentId: string;
    provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq';
    model: string;
    messages: { role: 'system'|'user'|'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
    callbackUrl: string;   // Agent's FastAPI URL to POST result back to
  }
  ```
- Worker concurrency: configurable via env var `WORKER_CONCURRENCY` (default: 5)
- On job completion: POST result to `job.callbackUrl` with `{ jobId, output, usage }`
- On job failure after 3 retries: POST error to callbackUrl with `{ jobId, error }`

**Provider registry** (`providers/registry.ts`):
- Providers are configured via `POST /api/providers` (stores in a `providers.json` file)
- On startup, load providers from `providers.json`
- Expose `getProvider(name: string): LLMProvider` function

**Ollama load balancer** (`loadbalancer/ollama-lb.ts`):
- Maintain an array of Ollama server URLs (configured via API or env)
- Strategy 1 — Round Robin: simple index rotation
- Strategy 2 — Least Busy: track in-flight requests per server, pick lowest
- Health check each Ollama server every 30 seconds (`GET /api/tags`) — remove unhealthy servers from pool, re-add when healthy
- If all Ollama servers are down, fail the job immediately (don't queue indefinitely)

**Provider interface:**
```typescript
interface LLMProvider {
  name: string;
  chat(messages: Message[], options: LLMOptions): Promise<LLMResult>;
  stream?(messages: Message[], options: LLMOptions): AsyncIterable<string>;
}
```
Each provider implements this interface. The Ollama provider uses the OpenAI SDK pointed at the Ollama URL (Ollama is OpenAI-compatible). This means you do NOT need a special Ollama SDK — use `openai` package with `baseURL` pointing to Ollama.

### 8.3 Agent Runtime (Python)

**Startup sequence** (`app/main.py` lifespan):
1. Load and validate `/app/config/agent.yaml` using Pydantic
2. Initialize `MemoryManager` — ensure `/memory` directory exists, init git repo if not already
3. Initialize `ShellExecutor`
4. Initialize `MCPClient` for each configured MCP server
5. Initialize `APScheduler` — register cron jobs from config
6. Register FastAPI routes
7. Start uvicorn

**FastAPI routes** (all internal — proxied by Orchestrator for external access):
```
GET  /health                    → { status: "ok", agentId, uptime }
GET  /status                    → { agentId, status, currentTask, memoryFiles, lastActivity }
GET  /logs                      → query params: ?limit=100&level=info (returns structured JSON lines)
GET  /memory                    → list of memory files with metadata
GET  /memory/{filename}         → raw .md file content
PUT  /memory/{filename}         → write .md file content (triggers git commit)
POST /tasks                     → receive a task (from orchestrator or another agent)
POST /files                     → receive a file from another agent
POST /chat                      → send a direct message, get response (uses LLM)
GET  /tasks                     → list of recent tasks and their status
POST /shell                     → run a shell command (returns stdout, stderr, exit code)
GET  /config                    → return current agent config (redact secrets)
```

**Task processing flow** (`communication/task_receiver.py`):
```
POST /tasks receives TaskPayload:
  {
    taskId: str,
    senderId: str,           # Which agent or "orchestrator" sent this
    instruction: str,         # The task description
    context: dict,            # Additional context data
    attachedFiles: [          # Files attached to this task
      { filename: str, content: str (base64), mimeType: str }
    ]
  }

On receive:
  1. Store attached files to /storage/received/{senderId}/{filename} (decode from base64)
  2. Write task to memory: append to task_queue.md with status: pending
  3. Update state.md: set current_task = taskId
  4. Build LLM prompt (system prompt from config + task instruction + relevant memory context)
  5. POST LLM job to Gateway with callbackUrl = http://self:8080/llm-callback
  6. Return 202 Accepted immediately (do not wait for LLM)

POST /llm-callback (internal) receives LLM result:
  1. Parse output
  2. Write output to memory: create output_{taskId}.md
  3. Update task_queue.md: mark task as completed
  4. Update state.md
  5. Git commit (async, non-blocking)
  6. POST completion event to Orchestrator: POST {ORCHESTRATOR_URL}/internal/events
     { type: "agent:task:completed", agentId, taskId, output }
  7. If config has output routing → POST to next agent's /tasks
```

**Memory Manager** (`memory/manager.py`):
```python
class MemoryManager:
    base_path: Path  # /memory
    git: GitManager

    async def read(self, filename: str) -> str:
        # Read file content. Raises FileNotFoundError if not found.

    async def write(self, filename: str, content: str, commit_message: str = None):
        # Write content to file.
        # Then: asyncio.create_task(self.git.commit(filename, commit_message))
        # Non-blocking — do not await the git commit

    async def list_files(self) -> list[MemoryFileInfo]:
        # Return list of .md files with size, last_modified, last_commit_hash

    async def append(self, filename: str, content: str):
        # Append to existing file (or create if not exists)
        # Always add a newline separator before appended content
        # Git commit async after append
```

**Git Manager** (`memory/git.py`):
```python
class GitManager:
    repo_path: Path

    def init(self):
        # If no .git directory, run: git init && git config user.email agent@AgentDock
        # Create .gitignore excluding nothing (commit all .md files)

    async def commit(self, filename: str = None, message: str = None):
        # Run in executor (non-blocking):
        # git add .
        # git commit -m "{message or 'Memory update: {filename}'} [{timestamp}]"
        # Log the commit hash
        # Emit event to orchestrator: agent:memory:updated
        # NEVER raise exception from here — git errors must be logged and swallowed
        # (a failed git commit must not break agent operation)
```

**File Receiver** (`communication/file_receiver.py`):
```
POST /files receives:
  {
    senderId: str,
    filename: str,
    content: str,   # base64 encoded
    mimeType: str,
    metadata: dict  # any sender-provided metadata
  }

On receive:
  1. Decode base64 content
  2. Save to /storage/received/{senderId}/{filename}
  3. Append to received_files.md:
     "- [{timestamp}] {filename} from {senderId} → /storage/received/{senderId}/{filename}"
  4. Git commit async
  5. Return 200 { path: "/storage/received/{senderId}/{filename}" }
```

**MCP Client** (`mcp/client.py`):
- On startup, initialize one MCP session per configured MCP server
- Expose `call_tool(tool_name, args)` method
- Keep sessions alive with heartbeat
- On tool call failure: retry once, then log error and return error result (do not crash)
- Tool results are passed back to the LLM as tool_result messages

**Shell Executor** (`shell/executor.py`):
```python
async def execute(command: str, timeout: int = 60) -> ShellResult:
    proc = await asyncio.create_subprocess_shell(
        command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd="/workspace"  # Agent's working directory
    )
    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return ShellResult(
            exit_code=proc.returncode,
            stdout=stdout.decode(),
            stderr=stderr.decode()
        )
    except asyncio.TimeoutError:
        proc.kill()
        raise ShellTimeoutError(f"Command timed out after {timeout}s")
```

### 8.4 Frontend Visual Editor

**Critical: The frontend is a single-page application. All routing is client-side. The Vite dev server proxies `/api` and `/ws` to the Orchestrator.**

**Canvas behavior** (using `@xyflow/react`):
- Each agent in the workflow is a **custom AgentNode** — shows agent name, status indicator (green/yellow/red dot), agent type icon, and a mini task counter
- Each connection is a **custom TriggerEdge** — shows a label with the trigger type, has a settings gear icon on hover
- Clicking a node opens the **AgentConfigPanel** in the right sidebar
- Clicking an edge opens the **TriggerPanel** in the right sidebar
- The canvas toolbar has: "Add Agent" (opens dropdown of available agent configs), "Save Workflow," "Deploy System," "Stop System"
- **Saving workflow**: serializes the React Flow `nodes[]` and `edges[]` into the workflow YAML format and sends `PUT /api/workflows/{id}`
- **Deploy System**: sends `POST /api/systems/{id}/start` — waits for WebSocket events to update node status dots in real-time

**AgentConfigPanel** (right sidebar, appears when node is selected):
- Tabbed: General | LLM | Memory | Shell | MCPs | Tools | Expose
- Each tab maps directly to a section of the agent YAML config
- Form built with `react-hook-form` + `zod` validation (schema from `packages/config-schema`)
- On save: `PUT /api/agents/{id}/config` → triggers hot-reload in orchestrator
- MCP section: shows configured MCPs, "Add MCP" button opens a modal with name/transport/url fields
- Expose section: checklist of: logs, chat, memory, status, tasks, raw_response

**Agent Detail Page** (`/agents/{id}`):
Tabbed view with:
1. **Status** — uptime, current task, last activity, container info
2. **Logs** — streaming log view (WebSocket `agent:log` events), filterable by level, searchable
3. **Memory** — file browser showing all `.md` files; click to open in Monaco editor; shows git history per file; read-only by default, editable toggle with save button
4. **Chat** — chat interface that calls `POST /api/agents/{id}/chat`; shows conversation history; streaming response via SSE or WebSocket
5. **Tasks** — list of recent tasks with status, input, output, timing
6. **Config** — raw YAML config viewer (read-only here; edit via canvas panel)

**WebSocket integration** (`stores/ws.store.ts`):
```typescript
// Connect once on app load
// On each event, update the relevant Zustand store
// agent:status → update agents.store.ts agentStatus map
// agent:log → push to logs buffer (ring buffer, max 1000 lines per agent)
// agent:memory:updated → invalidate react-query cache for that agent's memory
// agent:task:completed → update task list, show toast notification
```

---

## 9. Complete API Reference

### Authentication
```
POST /api/auth/login
Body: { email, password }
Response: { token: "jwt...", expiresIn: 86400 }

POST /api/auth/api-keys
Headers: Authorization: Bearer {jwt}
Body: { agentId, name, scopes: ["logs","chat","memory"] }
Response: { apiKey: "af_...", agentId, scopes }
```

### Systems
```
GET    /api/systems                     → list all systems
POST   /api/systems                     → create system (body: system config)
GET    /api/systems/:id                 → system detail + status
DELETE /api/systems/:id                 → delete system + stop all containers
POST   /api/systems/:id/start          → spawn all agent containers
POST   /api/systems/:id/stop           → stop all containers (keep volumes)
GET    /api/systems/:id/agents         → list agents in system with status
```

### Workflows
```
GET  /api/workflows                    → list all workflow configs
POST /api/workflows                    → create new workflow (saves YAML)
GET  /api/workflows/:id               → get workflow + canvas layout
PUT  /api/workflows/:id               → update (triggers hot-reload of changed agents)
```

### Agents (all proxied + permission-gated)
```
GET  /api/agents/:id/status           → requires expose: status
GET  /api/agents/:id/logs             → requires expose: logs | query: ?limit&level&since
GET  /api/agents/:id/memory           → requires expose: memory | list all .md files
GET  /api/agents/:id/memory/:file     → requires expose: memory | get file content
PUT  /api/agents/:id/memory/:file     → requires expose: memory + write scope
POST /api/agents/:id/chat             → requires expose: chat | body: { message }
GET  /api/agents/:id/tasks            → requires expose: tasks
POST /api/agents/:id/trigger          → requires API key | manually trigger agent
GET  /api/agents/:id/config           → requires JWT | get config (redacted)
PUT  /api/agents/:id/config           → requires JWT | update config + hot-reload
POST /api/agents/:id/files            → requires JWT | send file to agent
```

### Webhooks
```
POST /webhooks/:apiKey                 → trigger agent externally
Body: { event: string, payload: any }
```

### LLM Gateway (internal — not exposed to host, but documented)
```
POST /api/queue/submit                 → { provider, model, messages, callbackUrl }
GET  /api/queue/jobs/:jobId            → job status
GET  /api/providers                    → list configured providers
POST /api/providers                    → add/update provider config
GET  /api/health                       → { status, queueDepth, workerCount }
```

---

## 10. Docker Compose — Production

```yaml
# compose/docker-compose.yml
# This is the shareable artifact. Run: docker compose up -d

name: AgentDock-${SYSTEM_ID}

services:
  orchestrator:
    image: AgentDock/orchestrator:latest
    ports:
      - "${ORCHESTRATOR_PORT:-4000}:4000"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./configs:/app/configs
      - ./data/orchestrator:/app/data
    environment:
      - SYSTEM_ID=${SYSTEM_ID}
      - JWT_SECRET=${JWT_SECRET}
      - REDIS_URL=redis://redis:6379
      - LLM_GATEWAY_URL=http://llm-gateway:5000
      - DOCKER_NETWORK=AgentDock-${SYSTEM_ID}
    networks:
      - AgentDock-internal
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  llm-gateway:
    image: AgentDock/llm-gateway:latest
    volumes:
      - ./data/gateway:/app/data
    environment:
      - REDIS_URL=redis://redis:6379
      - WORKER_CONCURRENCY=${LLM_WORKER_CONCURRENCY:-5}
      - OLLAMA_SERVERS=${OLLAMA_SERVERS:-}  # Comma-separated: http://host:11434,http://host2:11434
      - OPENAI_API_KEY=${OPENAI_API_KEY:-}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
      - GEMINI_API_KEY=${GEMINI_API_KEY:-}
      - GROQ_API_KEY=${GROQ_API_KEY:-}
    networks:
      - AgentDock-internal
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped

  frontend:
    image: AgentDock/frontend:latest
    ports:
      - "${FRONTEND_PORT:-3000}:80"
    environment:
      - VITE_ORCHESTRATOR_URL=http://localhost:${ORCHESTRATOR_PORT:-4000}
      - VITE_WS_URL=ws://localhost:${ORCHESTRATOR_PORT:-4000}/ws
    networks:
      - AgentDock-internal
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5
    networks:
      - AgentDock-internal
    restart: unless-stopped

networks:
  AgentDock-internal:
    name: AgentDock-${SYSTEM_ID}
    driver: bridge

volumes:
  redis-data:
```

**NOTE:** Agent containers are NOT in this Compose file. They are spawned dynamically by the Orchestrator using the Docker socket. They attach to the same `AgentDock-${SYSTEM_ID}` network at runtime.

---

## 11. Agent Base Dockerfile

```dockerfile
# docker/agent-base.Dockerfile
FROM ubuntu:22.04

# Prevent interactive prompts during apt
ENV DEBIAN_FRONTEND=noninteractive

# Install system tools
RUN apt-get update && apt-get install -y \
    python3 python3-pip curl wget git ffmpeg \
    build-essential jq unzip ca-certificates \
    nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Install uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.cargo/bin:$PATH"

# Install Bun (for any Node.js tooling agents might need)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy runtime source
COPY apps/agent-runtime/pyproject.toml apps/agent-runtime/uv.lock ./
RUN uv sync --frozen

COPY apps/agent-runtime/app ./app

# Memory directory (will be mounted as Docker volume)
RUN mkdir -p /memory /storage/received /workspace
RUN git config --global user.email "agent@AgentDock" && git config --global user.name "AgentDock"

# Health check
HEALTHCHECK --interval=5s --timeout=3s --retries=10 \
  CMD curl -f http://localhost:8080/health || exit 1

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## 12. Implementation Phases

> Build in this exact order. Each phase must be fully working before starting the next. Do not skip phases. Do not build UI before the backend it depends on works.

### Phase 1 — Monorepo Foundation
1. Create workspace root `package.json` with Bun workspaces pointing to `apps/*` and `packages/*`
2. Create `bunfig.toml`
3. Create `packages/config-schema` with Zod schemas for agent and workflow YAML
4. Create `packages/shared-types` with WebSocket event types and API types
5. Set up `docker-compose.dev.yml` — runs orchestrator, llm-gateway, redis, frontend with hot reload
6. **Verify:** `bun install` at root installs all workspaces. `bun run dev` starts all services.

### Phase 2 — LLM Gateway (build this first — agents depend on it)
1. Scaffold Hono app with Bun
2. Set up `ioredis` + `bullmq` worker and producer
3. Implement abstract `LLMProvider` interface
4. Implement `openai` provider adapter
5. Implement `anthropic` provider adapter
6. Implement `gemini` provider adapter
7. Implement `groq` provider adapter
8. Implement `ollama` provider (using `openai` SDK with custom `baseURL`)
9. Implement Ollama load balancer (round-robin first, least-busy second)
10. Implement provider registry (load from `providers.json`)
11. Implement job submission and callback flow
12. Implement REST API routes
13. Write Dockerfile
14. **Verify:** Submit a test job via curl. Worker picks it up, calls provider, POSTs callback. Queue depth visible via API.

### Phase 3 — Agent Runtime (core)
1. Scaffold FastAPI app with uv
2. Implement config loader + Pydantic schema validation
3. Implement `MemoryManager` (read, write, append, list)
4. Implement `GitManager` (init, async commit)
5. Implement all FastAPI routes (returning mock data initially)
6. Implement `LLMClient` that POSTs to LLM Gateway and handles callback
7. Wire routes to real implementations
8. Implement `ShellExecutor`
9. Implement `TaskReceiver` (receives task, stores files, queues LLM call)
10. Implement `FileReceiver`
11. Implement MCP client manager
12. Implement APScheduler cron integration
13. Write agent base Dockerfile — build it, verify it runs
14. **Verify:** Start agent container manually. POST to /tasks. Agent processes task, calls LLM Gateway, updates memory, git commits. Check /memory returns updated files.

### Phase 4 — Orchestrator (core)
1. Scaffold Hono app with Bun
2. Implement env validation
3. Implement Docker client wrapper (`dockerode`)
4. Implement `NetworkManager` (create/delete Docker network)
5. Implement `ContainerManager` (spawn, stop, restart, inspect agents)
6. Implement YAML config loader + validator
7. Implement workflow parser (YAML → WorkflowGraph)
8. Implement system lifecycle (start system = spawn all agents, stop system = stop all containers)
9. Implement agent endpoint proxy
10. Implement JWT auth + API key auth
11. Implement `expose` permission middleware
12. Implement WebSocket hub
13. Implement internal events endpoint (agents POST events here)
14. Implement REST API routes (systems, workflows, agents)
15. **Verify:** Start a system via API. Verify agent containers are spawned on correct Docker network. Send a task to an agent via the proxy. Verify WebSocket events arrive in a test client.

### Phase 5 — Trigger System
1. Implement cron trigger (read connection configs → register croner jobs → POST to agent /tasks on schedule)
2. Implement task completion trigger (on `agent:task:completed` event → find downstream connections → POST to next agent)
3. Implement webhook trigger (register dynamic routes at startup → POST to agent /tasks on webhook hit)
4. Implement memory condition watcher (poll agent /memory/{file} on interval → check condition → trigger if met)
5. **Verify:** Full pipeline test — Agent A triggered by cron → completes → triggers Agent B → Agent B's memory condition triggers Agent C.

### Phase 6 — Frontend
1. Scaffold React + Vite + TypeScript with Bun
2. Set up Tailwind + shadcn/ui
3. Set up Zustand stores
4. Set up TanStack Query with ky HTTP client
5. Set up WebSocket store (connect to orchestrator WS)
6. Build Login page + JWT handling
7. Build React Flow canvas with custom AgentNode and TriggerEdge
8. Build Toolbar (add agent, save, deploy)
9. Build AgentConfigPanel (all tabs) + form submission
10. Build TriggerPanel (edge click → configure trigger type)
11. Build WorkflowEditor page (canvas + panels)
12. Build AgentDetail page (all tabs: status, logs, memory, chat, tasks)
13. Wire all API calls to real endpoints
14. Wire WebSocket events to live-update canvas node status dots and logs
15. **Verify:** Full end-to-end — open browser, design a workflow, deploy, watch agents start (status dots go green), trigger manually, watch logs stream in real time, view updated memory files.

### Phase 7 — Polish & Documentation
1. Error handling: all API routes return consistent `{ error: string, code: string }` on failure
2. All services log in structured JSON with pino / structlog
3. Write all docs in `docs/`
4. Write `docs/development-guide.md` with setup instructions using Bun + uv
5. Write `.env.example` with all required variables and descriptions
6. Build + push Docker images to registry
7. Final `docker-compose.yml` end-to-end test on a clean machine

---

## 13. Code Quality Standards

**TypeScript (Orchestrator + LLM Gateway):**
- `strict: true` in all `tsconfig.json` files — no exceptions
- No `any` type anywhere. Use `unknown` and narrow it.
- All async functions must have explicit return types
- All errors must be typed — use a `Result<T, E>` pattern or typed error classes
- No `console.log` in production code — use `pino` logger only
- All route handlers must be wrapped in try/catch that returns typed error responses
- Export only what is needed — default to unexported

**Python (Agent Runtime):**
- All functions must have type annotations (mypy-compatible)
- Pydantic models for all data that crosses a service boundary (HTTP requests/responses, config)
- `async` all the way down — no synchronous blocking calls in async context
- All `except` blocks must either re-raise or log and explicitly handle — never `pass` silently
- Use `structlog` for all logging — never `print()`
- All file paths constructed using `pathlib.Path` — never string concatenation

**General:**
- Every service has a `/health` endpoint that returns 200 when ready
- Every service reads config from environment variables only — no hardcoded values
- Secrets (API keys, JWT secret) MUST come from environment variables — never from config files
- Config files (agent YAML, workflow YAML) MUST NOT contain secrets — they contain env var references like `${OPENAI_API_KEY}`
- Docker images must be built to be as small as possible — use multi-stage builds where appropriate
- All Docker volumes for agent memory must be named volumes (not bind mounts) so they persist across container recreation

---

## 14. What NOT to Do

> These are mistakes that seem reasonable but will break the architecture. Do not do them.

1. **Do NOT use npm, yarn, pnpm, or pip.** Use Bun for Node.js, uv for Python. Every install command in every Dockerfile and every script must use these.

2. **Do NOT expose agent container ports to the host.** Ever. Not even for debugging. Use `docker exec` or the Orchestrator proxy for access.

3. **Do NOT share Redis between systems.** Each system's Compose stack has its own Redis. If you find yourself connecting two systems to one Redis, the architecture is wrong.

4. **Do NOT let agents call LLM providers directly.** Every LLM call goes through the LLM Gateway queue. This is what enables provider switching, load balancing, and rate limiting. Bypassing it breaks all of these.

5. **Do NOT write to an agent's memory from outside the agent.** The Orchestrator can only READ memory (via the agent's `/memory` API). Only the agent's Python runtime writes to its own `/memory` volume.

6. **Do NOT use IP addresses to address containers.** Always use Docker container names (DNS). Container IPs are ephemeral and change on restart.

7. **Do NOT put secrets in YAML config files.** Agent configs use `${ENV_VAR}` references. The actual values come from the Compose environment or `.env` file.

8. **Do NOT block on git commits.** Git commits in the memory manager are always `asyncio.create_task(...)` — the agent never waits for a commit to finish before continuing work.

9. **Do NOT use `any` in TypeScript.** If you don't know the type, use `unknown` and write a type guard.

10. **Do NOT couple the frontend directly to agent containers.** All frontend data goes through the Orchestrator API. The frontend never constructs Docker DNS URLs.

11. **Do NOT make the agent base image FROM scratch or Alpine unless you know exactly what you're doing.** It needs Python, git, curl, and system tools. Use Ubuntu 22.04 base.

12. **Do NOT start writing Phase 6 (Frontend) until Phase 5 (Triggers) passes a full end-to-end pipeline test.** Building UI against mocked backends creates integration problems.

13. **Do NOT store workflow execution state in agent memory.** The Orchestrator owns execution state. Agent memory is for the agent's own knowledge and outputs, not for pipeline coordination.

14. **Do NOT skip input validation.** Every API endpoint that accepts a body must validate it with Zod (TypeScript) or Pydantic (Python) before processing. Return 400 with a clear error message for invalid input.

---

## 15. Context7 MCP Usage Instructions

Before implementing any feature that uses a library, you MUST fetch its current documentation using Context7.

**Workflow:**
```
1. mcp context7 resolve-library-id "hono"
   → Returns: /honojs/hono (or similar)

2. mcp context7 get-library-docs "/honojs/hono" --topic "websocket"
   → Returns current docs for Hono WebSocket

3. Use the returned docs as your implementation reference.
   Do NOT use training knowledge for API signatures.
```

**Do this for EVERY library before first use:**
- `hono` — HTTP server setup, routing, middleware, WebSocket
- `bullmq` — Worker, Queue, Job lifecycle
- `dockerode` — Container create, start, stop, network attach
- `@xyflow/react` — Custom nodes, custom edges, onConnect, useReactFlow
- `react-hook-form` + `zod` — Form setup with Zod resolver
- `zustand` — Store creation, subscriptions
- `@tanstack/react-query` — QueryClient, useQuery, useMutation
- `fastapi` — Router, lifespan, WebSocket, background tasks
- `pydantic` v2 — BaseModel, field validators, model_validator
- `apscheduler` — AsyncScheduler, CronTrigger
- `gitpython` — Repo.init, index.add, index.commit
- `croner` — Cron constructor, scheduling

---

## 16. Professional Documentation Requirements

The `docs/` directory must contain these files, written in professional technical writing style:

**`docs/architecture.md`**
- System overview diagram (ASCII or Mermaid)
- Component descriptions and responsibilities
- Data flow diagrams for: task execution, agent-to-agent communication, file sharing, LLM request lifecycle
- Explanation of all ADRs (copy from this spec, rewrite for end-user audience)

**`docs/agent-config-reference.md`**
- Complete reference for every field in agent YAML
- Type, default value, required/optional, description, example for each field
- Common configuration patterns (cron agent, webhook agent, LLM-heavy agent)

**`docs/workflow-config-reference.md`**
- Complete reference for workflow YAML
- Trigger type reference (all four types with examples)
- Canvas layout fields explanation

**`docs/api-reference.md`**
- Every endpoint: method, path, auth required, request body schema, response schema, example curl command
- WebSocket event types with payload schemas
- Error codes and their meanings

**`docs/deployment-guide.md`**
- Prerequisites (Docker, Docker Compose)
- First deployment: clone, copy `.env.example` → `.env`, fill values, `docker compose up`
- Adding a new system (second workflow on the same host)
- Adding Ollama servers to the load balancer
- Upgrading (pull new images, `docker compose up` with rolling restart)
- Backup and restore (volume backup for agent memory)

**`docs/development-guide.md`**
- Prerequisites: Bun, uv, Docker
- Starting dev environment: `bun run dev`
- Adding a new LLM provider (step by step)
- Adding a new trigger type (step by step)
- Writing an agent (what the Python runtime provides, how to extend the base image)
- Running tests

---

## 17. Final Checklist Before Marking Complete

- [ ] `bun install` at repo root succeeds with zero errors
- [ ] `docker compose -f compose/docker-compose.dev.yml up` starts all services
- [ ] Login via UI with JWT works
- [ ] Create a workflow in the canvas, save it — verify YAML written to `configs/workflows/`
- [ ] Deploy system — verify agent containers spawned on correct Docker network
- [ ] Agent status dots on canvas go green when containers are healthy
- [ ] POST a task to an agent via API — verify it processes, calls LLM Gateway, updates memory
- [ ] WebSocket events arrive in the browser in real-time when agent processes task
- [ ] Agent memory files visible in Memory tab, with git history
- [ ] Agent A task completion automatically triggers Agent B
- [ ] Cron trigger fires at correct time
- [ ] Webhook trigger receives external POST and triggers agent
- [ ] Memory condition trigger fires when `.md` file matches condition
- [ ] File sent from Agent A received and stored in Agent B's `/storage/received/`
- [ ] API key for an agent with only `logs` in `expose[]` cannot access `/chat` or `/memory`
- [ ] Hot-reload: change agent YAML → only that agent restarts, others keep running
- [ ] `docker compose -f compose/docker-compose.yml up` works on a clean machine with only Docker installed
- [ ] All docs in `docs/` are complete and accurate