# AgentDock

**Visual multi-agent system designer and generator.** Design agent pipelines on a canvas, configure every agent's LLM, memory, tools, and triggers, then click **Generate** to download a complete, self-contained Docker Compose project you can run anywhere.

---

## What It Is

AgentDock is two completely separate things:

### The Builder (this repo)
A web application for designing multi-agent systems. It has a visual canvas (like n8n), a library of all your saved designs, and a **Generate** button that produces a complete standalone project as a downloadable zip. The builder stores designs in SQLite. It does **not** run agents, manage containers, or require Docker.

### The Generated Runtime (standalone)
What the builder produces. A complete Docker Compose project — with its own orchestrator, LLM gateway, Redis, and agent containers — baked from your design. Drop it on any server with Docker, run `docker compose up`, and it runs forever with no dependency on the builder.

> **The builder is to the runtime what create-react-app is to a React project.** It generates the project. After that, the project is independent.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentDock BUILDER                         │
│                                                              │
│  ┌─────────────────┐     ┌──────────────────────────────┐   │
│  │  Builder UI     │────►│  Builder API                  │   │
│  │  React/TS :3000 │     │  Bun/Hono :3001               │   │
│  │  - Canvas       │     │  - System design CRUD         │   │
│  │  - Agent config │     │  - Project generator          │   │
│  │  - System lib   │     │  - SQLite storage             │   │
│  │  - Generate btn │     │  - Zip download               │   │
│  └─────────────────┘     └──────────────────────────────┘   │
│                                      │                       │
│                               Generates & zips               │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │   Generated Project (zip)   │
                         │   my-research-system/       │
                         │   ├── docker-compose.yml    │
                         │   ├── configs/              │
                         │   │   ├── agents/           │
                         │   │   └── workflow.yaml     │
                         │   ├── orchestrator/         │
                         │   ├── llm-gateway/          │
                         │   ├── agent-runtime/        │
                         │   └── .env.example          │
                         └─────────────┬──────────────┘
                                       │ docker compose up
                                       ▼
┌─────────────────────────────────────────────────────────────┐
│              GENERATED RUNTIME (standalone)                  │
│              Runs anywhere with Docker                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ orchestrator │  │ llm-gateway  │  │    redis         │  │
│  │ Bun/Hono     │  │ Bun/BullMQ   │  │    (isolated)    │  │
│  │ :4000        │  │ :5000 (int)  │  │    :6379 (int)   │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │ Docker socket (hot-reload only)                    │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  agent-001   │  │  agent-002   │  │   agent-N        │  │
│  │ Python/uv    │  │ Python/uv    │  │  Python/uv       │  │
│  │ :8080 (int)  │  │ :8080 (int)  │  │  :8080 (int)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  External: Only port 4000 (orchestrator) exposed            │
│  Agents: zero host port exposure — Docker DNS only          │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Docker + Docker Compose v2
- Bun ≥ 1.1 (for local development)

### Run the Builder

```bash
git clone https://github.com/your-org/agentdock
cd agentdock
cp .env.example .env
# Edit .env — set JWT_SECRET (min 32 chars) and ADMIN_PASSWORD
docker compose -f docker/builder.docker-compose.yml up -d
```

Note: the builder Docker images install dependencies from the workspace root `bun.lockb`. If you change any package versions locally, run `bun install` to update the lockfile before rebuilding the images.

Open `http://localhost:3000` → sign in with `admin@agentdock.local` / your password.

### Development (hot reload)

```bash
bun install
docker compose -f docker/builder.dev.docker-compose.yml up
```

---

## How to Use the Builder UI

1. **Create a system**: click **New System** in the System Library.
1. **Add agents**: drag **Agent** from the palette onto the canvas.
1. **Configure an agent** (right panel): General, LLM, Memory, Tools, MCPs, Expose.
1. **Connect agents**: draw edges and set trigger type (task completion, cron, webhook, memory condition).
1. **Generate**: click **Generate** to download a self-contained runtime zip.

The builder stores all designs in SQLite and keeps versioned generations in `apps/builder-api/data/generated`.

---

## Running a Generated System

1. Unzip the generated project.
1. Copy env template and fill in required values:

```bash
cp .env.example .env
# Edit .env to add JWT_SECRET and any LLM provider keys
```

1. Start the runtime:

```bash
docker compose up --build
```

The runtime is API-only (no UI). It exposes a single public surface: the orchestrator on port 4000.

---

## Endpoint Exposure Model

- **Only the orchestrator is public**. Agent containers never expose host ports.
- Every agent endpoint is proxied through `http://localhost:4000/api/agents/{id}/...`.
- The `expose` list in each agent config controls what is accessible (status, logs, memory, chat, tasks).
- Endpoints not in `expose[]` return `403 Forbidden` — the orchestrator enforces this before proxying.
- Update `expose` in the builder UI, regenerate, or hot-edit the YAML and reload the agent.

---

## .env and Configuration

The generated `.env.example` includes:
- Required system keys (`SYSTEM_ID`, `JWT_SECRET`, `ORCHESTRATOR_PORT`)
- LLM provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.)
- MCP env var stubs inferred from MCP configs

If you need additional env vars:
- Add `${VAR_NAME}` references inside the generated agent YAML (or MCP `env` entries in the builder UI), then
- Put the actual values in `.env` before running.

The builder intentionally does **not** store secrets. All secret values live in the generated runtime `.env`.

---

## Generated Project Structure

```
{system-name}-system/
├── docker-compose.yml           ← All services: orchestrator, llm-gateway, redis, agents
├── .env.example                 ← All required env vars (no values)
├── configs/
│   ├── workflow.yaml            ← Connections and trigger definitions
│   └── agents/
│       ├── {agent-id}.yaml      ← One config file per agent
│       └── ...
├── orchestrator/                ← Runtime orchestrator (same code every time)
├── llm-gateway/                 ← LLM job queue (same code every time)
├── agent-runtime/               ← Python agent base (same code every time)
└── README.md                    ← Auto-generated: agents, endpoints, quickstart
```

### Deploy a Generated System

```bash
unzip my-research-system-v1.zip
cd my-research-system
cp .env.example .env
# Edit .env — fill in JWT_SECRET and LLM API keys
docker compose up --build
```

---

## Builder API Reference

All builder API endpoints are on port 3001.

```bash
# Auth
POST /api/auth/login              → { token, expiresIn }
GET  /api/auth/me                 → { sub, email }   (requires JWT)

# System designs (all require JWT)
GET    /api/systems               → list all saved systems
POST   /api/systems               → create new system
GET    /api/systems/:id           → get system with canvasState
PUT    /api/systems/:id           → update system (saves canvas, increments version)
DELETE /api/systems/:id           → delete system + all generations

# Generation
GET  /api/systems/:id/generations          → list generation history
POST /api/systems/:id/generate             → generate zip → streams download
GET  /api/systems/:id/generations/:genId   → re-download a previous generation
```

---

## Generated Runtime API

All agent endpoints are proxied through the orchestrator (port 4000) and gated by the `expose[]` config.

```bash
# System health
GET  http://localhost:4000/health

# System status (all agents)
GET  http://localhost:4000/api/system/status
Authorization: Bearer {jwt}

# Agent endpoints (gated by expose[] config + JWT)
GET  http://localhost:4000/api/agents/{id}/status    # requires expose: status
GET  http://localhost:4000/api/agents/{id}/logs      # requires expose: logs
GET  http://localhost:4000/api/agents/{id}/memory    # requires expose: memory
POST http://localhost:4000/api/agents/{id}/chat      # requires expose: chat
GET  http://localhost:4000/api/agents/{id}/tasks     # requires expose: tasks

# Hot-reload agent config (edit YAML → reload → only that agent restarts)
POST http://localhost:4000/api/agents/{id}/reload
Authorization: Bearer {jwt}

# Webhook trigger (public — no JWT required)
POST http://localhost:4000/webhooks/{agent-id}
Content-Type: application/json
{"instruction": "Do something", "payload": {...}}

# WebSocket events
WS   ws://localhost:4000/ws?token={jwt}
```

### WebSocket Event Types

```typescript
{ type: "agent:status";         agentId, systemId, status }
{ type: "agent:log";            agentId, systemId, level, message, timestamp }
{ type: "agent:memory:updated"; agentId, systemId, file, commitHash, timestamp }
{ type: "agent:task:started";   agentId, systemId, taskId, timestamp }
{ type: "agent:task:completed"; agentId, systemId, taskId, output, timestamp }
{ type: "agent:task:failed";    agentId, systemId, taskId, error, timestamp }
{ type: "system:status";        systemId, status, timestamp }
```

---

## Hot-Editing a Running System

For small config changes (tweaking a prompt, adjusting a cron schedule) without full regeneration:

```bash
# 1. Edit the agent's config file on the server
vim configs/agents/my-agent.yaml

# 2. Reload only that agent (rest of system unaffected)
curl -X POST http://localhost:4000/api/agents/my-agent/reload \
  -H "Authorization: Bearer {jwt}"
```

For structural changes (new agents, new connections), edit in the builder and regenerate.

---

## Agent Configuration Reference

```yaml
agent:
  id: "my-agent"           # lowercase alphanumeric + hyphens
  name: "My Agent"
  description: "Does something useful"
  version: "1.0.0"

llm:
  provider: "ollama"       # ollama | openai | anthropic | gemini | groq
  model: "qwen2.5:7b"      # For tool-calling agents, use qwen2.5 or llama3.1
  temperature: 0.2         # Keep 0.1–0.3 for tool-calling agents
  max_tokens: 4096
  system_prompt: |
    You are a helpful assistant.

memory:
  path: "/memory"
  git_auto_commit: true
  readable_by: ["other-agent"]   # agents that can read this agent's memory

shell:
  enabled: false

mcps:
  - name: "my-mcp"
    transport: "sse"
    url: "http://my-mcp-server:3000/sse"
    env:
      MY_API_KEY: "${MY_API_KEY}"

tools:
  python_packages: ["requests", "beautifulsoup4"]
  system_packages: []

# Named actions this agent can execute when triggered.
# The task_receiver picks the best matching action based on the incoming instruction.
actions:
  - name: analyse_topic
    description: Research and analyse the given topic
    prompt_template: |
      Research and analyse: {{input.topic}}
      Depth: {{input.depth}}
      Provide executive summary, key findings, and evidence.
    output_file: analysis.md   # written to /memory and fires file_received triggers

triggers:
  - type: "task"           # receives tasks from orchestrator/other agents
  - type: "cron"
    schedule: "0 9 * * 1-5"
    timezone: "Asia/Kolkata"

expose:
  - logs
  - status
  - memory
  - chat
  - tasks

ports:
  internal: 8080
```

### Workflow Trigger Types

```yaml
connections:
  # Task completion — fires when source agent completes any task
  - trigger:
      type: task_completion
      pass_output: true
      # Optional: only fire when source agent completed a specific action
      action_filter: dispatch_research

  # File received — fires when source agent writes a matching file to memory
  - trigger:
      type: file_received
      file_pattern: "analysis.md"

  # Cron — fires on schedule
  - trigger:
      type: cron
      schedule: "0 9 * * 1-5"
      timezone: "UTC"

  # Memory condition — polls source agent memory for a string match
  - trigger:
      type: memory_condition
      file: "state.md"
      contains: "status: completed"
      check_interval_seconds: 30
```

---

## Monorepo Structure

```
AgentDock/
├── apps/
│   ├── builder-api/           # Builder backend — Bun/Hono, SQLite/Drizzle, generator
│   └── builder-ui/            # Builder frontend — React/Vite, React Flow canvas
├── packages/
│   ├── config-schema/         # Zod schemas: SystemDesign, AgentDesign, YAML configs
│   └── shared-types/          # TypeScript types shared between builder-api and builder-ui
├── template/                  # Generated runtime template (copied into every generated project)
│   ├── orchestrator/          # Runtime orchestrator — Bun/Hono, triggers, proxy, WebSocket
│   ├── llm-gateway/           # LLM job queue — Bun/BullMQ, all providers
│   ├── agent-runtime/         # Python agent base — FastAPI, memory, git, shell, MCP
│   └── agent-base.Dockerfile
├── docker/
│   ├── builder.docker-compose.yml      # Run the builder (production)
│   └── builder.dev.docker-compose.yml  # Run the builder (dev, hot reload)
├── .env.example
└── package.json               # Bun workspace root
```

---

## LLM Providers

Configure in the generated system's `.env`:

| Provider | Env var | Notes |
|---|---|---|
| Ollama | `OLLAMA_SERVERS` | Comma-separated URLs, load-balanced |
| OpenAI | `OPENAI_API_KEY` | GPT-4o, GPT-4, etc. |
| Anthropic | `ANTHROPIC_API_KEY` | Claude 3.5, Claude 3 |
| Google | `GEMINI_API_KEY` | Gemini 1.5 Pro/Flash |
| Groq | `GROQ_API_KEY` | Llama 3, Mixtral (fast inference) |

### Recommended Ollama Models for Tool-Calling Agents

| Model | Size | Tool Calling | Verdict |
|---|---|---|---|
| `qwen2.5:7b` | 4.7GB | ✅ Excellent | **Best choice for most agents** |
| `qwen2.5:14b` | 9GB | ✅ Excellent | Best overall if you have VRAM |
| `llama3.1:8b` | 4.7GB | ✅ Good | Solid general purpose |
| `qwen2.5-coder:7b` | 4.7GB | ✅ Good | Best for code/shell agents |
| `gemma2:9b` | 5.4GB | ❌ Poor | Do not use for tool-calling agents |

Use `temperature: 0.1–0.3` for any agent that calls tools. Higher temperatures cause malformed tool call JSON.

---

## Technology Stack

| Layer | Stack |
|---|---|
| Builder API | Bun + Hono + Drizzle ORM + SQLite |
| Builder UI | React + Vite + Tailwind + React Flow + Zustand + TanStack Query |
| Runtime Orchestrator | Bun + Hono + Dockerode + Croner |
| Runtime LLM Gateway | Bun + Hono + BullMQ + ioredis |
| Agent Runtime | Python + FastAPI + uv |
| Agent Memory | Markdown files + Git (per-agent named Docker volume) |

---

## Implementation Status

- [x] Phase 1 — Monorepo foundation (workspaces, schemas, shared types)
- [x] Phase 2 — Builder API (Hono, SQLite/Drizzle, JWT auth, system CRUD, generator)
- [x] Phase 3 — Builder UI (React Flow canvas, agent config panels, system library, generate flow)
- [x] Phase 4 — Template runtime (orchestrator, llm-gateway, agent-runtime, Dockerfiles)
- [x] Phase 5 — Docker compose (builder production + dev)
- [x] Phase 6 — Agent runtime implementation (FastAPI routes, memory, git, shell, MCP, LLM client, action dispatch)
- [x] Phase 7 — LLM Gateway implementation (BullMQ workers, all provider adapters, sync chat endpoint)
- [x] Phase 8 — End-to-end integration (3-agent pipeline verified: webhook → coordinator → analyst → report-writer → coordinator)
- [x] Phase 9 — v3 features (agentic tool loop, task delivery retry, structured logging, git commit hashes)

### Known Working

- Builder API: JWT auth on all protected routes including `/api/auth/me`
- Builder API: System CRUD, versioned generations, zip download
- Generated runtime: Full 3-agent pipeline with `task_completion`, `file_received` triggers
- Generated runtime: `action_filter` on `task_completion` prevents pipeline loops
- Generated runtime: Agent proxy strips `Authorization` header (prevents JWT rejection at agents)
- Generated runtime: Agent `expose[]` gating — unexposed endpoints return 403
- Generated runtime: Task tracking, logs, `currentTask`/`lastActivity` in status
- Generated runtime: Action dispatch — agents pick correct action from config, write `output_file`, fire `file_received` triggers
- Generated runtime: Git memory commits work correctly in Docker named volumes
- Generated runtime: `lastCommitHash` populated per file via `git log --format=%H -1 -- <file>`
- Generated runtime: `lastActivity` set on task receipt (not just completion)
- Generated runtime: Structured logs captured into ring buffer — `/logs` endpoint returns real entries
- Generated runtime: JWT 401 returns proper 401 response (not 500)
- Generated runtime: Task delivery retries with exponential backoff (1s → 2s → 4s → 8s → 16s)
- Generated runtime: Agentic tool loop — multi-turn LLM + MCP/shell tool execution per task
- LLM Gateway: `POST /api/chat/sync` for synchronous agentic loop calls (bypasses BullMQ)
- LLM Gateway: Tool calling support in OpenAI, Anthropic, Ollama providers

### E2E Bug Fixes (v2 → v3)

| Bug | Severity | Fix |
|---|---|---|
| Double analyst dispatch (no `action_filter`) | CRITICAL | Added `action_filter: dispatch_research` to coordinator→analyst connection |
| Duplicate `file_received` events | CRITICAL | `output_{id}.md` written directly without firing `agent:memory:written` |
| `lastCommitHash` always null | MEDIUM | `git log --format=%H -1 -- <file>` per file in `list_files()` |
| Empty logs ring buffer | MEDIUM | structlog processor captures all events into `_log_buffer` |
| JWT 401 returns 500 | LOW | `onError` checks `err.status === 401` before generic 500 handler |
| Analyst `tasks` not in `expose[]` | LOW | Added `tasks` to analyst expose list in generated configs |
| `lastActivity` null on task receipt | LOW | `_last_activity` set in `receive()` not just `complete()`/`fail()` |

### Known Working

- Builder API: JWT auth on all protected routes including `/api/auth/me`
- Builder API: System CRUD, versioned generations, zip download
- Generated runtime: Full 3-agent pipeline with `task_completion`, `file_received` triggers
- Generated runtime: `action_filter` on `task_completion` prevents pipeline loops
- Generated runtime: Agent proxy strips `Authorization` header (prevents JWT rejection at agents)
- Generated runtime: Agent `expose[]` gating — unexposed endpoints return 403
- Generated runtime: Task tracking, logs, `currentTask`/`lastActivity` in status
- Generated runtime: Action dispatch — agents pick correct action from config, write `output_file`, fire `file_received` triggers
- Generated runtime: Git memory commits work correctly in Docker named volumes
- Generated runtime: `lastCommitHash` populated per file via `git log --format=%H -1 -- <file>`
- Generated runtime: `lastActivity` set on task receipt (not just completion)
- Generated runtime: Structured logs captured into ring buffer — `/logs` endpoint returns real entries
- Generated runtime: JWT 401 returns proper 401 response (not 500)
- Generated runtime: Task delivery retries with exponential backoff (1s → 2s → 4s → 8s → 16s)
- Generated runtime: Agentic tool loop — multi-turn LLM + MCP/shell tool execution per task
- LLM Gateway: `POST /api/chat/sync` for synchronous agentic loop calls (bypasses BullMQ)
- LLM Gateway: Tool calling support in OpenAI, Anthropic, Ollama providers

### E2E Bug Fixes (v2 → v3)

| Bug | Severity | Fix |
|---|---|---|
| Double analyst dispatch (no `action_filter`) | CRITICAL | Added `action_filter: dispatch_research` to coordinator→analyst connection |
| Duplicate `file_received` events | CRITICAL | `output_{id}.md` written directly without firing `agent:memory:written` |
| `lastCommitHash` always null | MEDIUM | `git log --format=%H -1 -- <file>` per file in `list_files()` |
| Empty logs ring buffer | MEDIUM | structlog processor captures all events into `_log_buffer` |
| JWT 401 returns 500 | LOW | `onError` checks `err.status === 401` before generic 500 handler |
| Analyst `tasks` not in `expose[]` | LOW | Added `tasks` to analyst expose list in generated configs |
| `lastActivity` null on task receipt | LOW | `_last_activity` set in `receive()` not just `complete()`/`fail()` |

---

## License

MIT
