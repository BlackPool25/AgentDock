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
# Edit .env — set JWT_SECRET (min 32 chars)
docker compose -f docker/builder.docker-compose.yml up -d
```

Open `http://localhost:3000` → sign in with `admin@agentdock.local` / your password.

### Development (hot reload)

```bash
bun install
docker compose -f docker/builder.dev.docker-compose.yml up
```

---

## Using the Builder

### 1. Create a System
Click **New System** on the System Library page. Give it a name.

### 2. Design on the Canvas
- Drag **Agent** nodes from the left palette onto the canvas
- Click an agent node to configure it in the right panel (LLM, memory, tools, expose, MCPs)
- Draw connections between agents by dragging from one node's handle to another
- Click a connection to configure its trigger type (task completion, cron, webhook, memory condition)

### 3. Configure Agents
Each agent has 7 configuration tabs:

| Tab | What you configure |
|---|---|
| General | Agent ID, name, description |
| LLM | Provider (Ollama/OpenAI/Anthropic/Gemini/Groq), model, temperature, system prompt |
| Memory | Git auto-commit, which other agents can read this agent's memory |
| Shell | Enable/disable shell access |
| MCPs | MCP server connections (SSE or stdio transport) |
| Tools | Python packages and system packages to install |
| Expose | Which endpoints are accessible via API key (logs, chat, memory, status, tasks) |

### 4. Configure Connections
Each connection between agents has a trigger type:

| Trigger | When it fires |
|---|---|
| Task Completion | When the source agent finishes a task |
| Cron | On a schedule (cron expression + timezone) |
| Webhook | On an inbound HTTP POST to `/webhooks/{agent-id}` |
| Memory Condition | When a memory file contains a specific string |

### 5. Generate
Click **Generate** → the builder validates your design, generates the project, and downloads a zip file.

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

## Generated Runtime API

All agent endpoints are proxied through the orchestrator (port 4000) and gated by the `expose[]` config.

```bash
# System health
GET  http://localhost:4000/health

# System status (all agents)
GET  http://localhost:4000/api/system/status
Authorization: Bearer {jwt}

# Agent endpoints (gated by expose[] config)
GET  http://localhost:4000/api/agents/{id}/status    # requires expose: status
GET  http://localhost:4000/api/agents/{id}/logs      # requires expose: logs
GET  http://localhost:4000/api/agents/{id}/memory    # requires expose: memory
POST http://localhost:4000/api/agents/{id}/chat      # requires expose: chat
GET  http://localhost:4000/api/agents/{id}/tasks     # requires expose: tasks

# Hot-reload agent config (edit YAML → reload → only that agent restarts)
POST http://localhost:4000/api/agents/{id}/reload
Authorization: Bearer {jwt}

# Webhook trigger
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
  model: "llama3.1:8b"
  temperature: 0.7
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

ports:
  internal: 8080
```

---

## Monorepo Structure

```
AgentDock/
├── apps/
│   ├── builder-api/           # Builder backend — Bun/Hono, SQLite, generator
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
- [ ] Phase 6 — Agent runtime implementation (FastAPI routes, memory, git, shell, MCP, LLM client)
- [ ] Phase 7 — LLM Gateway implementation (BullMQ workers, all provider adapters)
- [ ] Phase 8 — End-to-end integration test
- [ ] Phase 9 — Polish (error handling, structured logging, full docs)

---

## License

MIT
