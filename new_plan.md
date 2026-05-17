# AgentDock — Full Implementation Specification (v2)
> **For the AI coding agent:** Read this entire document before writing any code. Every decision has a reason. The most important architectural fact in this document is in Section 2 — read it first.

---

## 0. How to Use This Document

- **Before using any library**, use **Context7 MCP** to fetch its latest docs. Never rely on training data for API signatures.
- **Before each phase**, re-read the full phase spec and the relevant architecture section.
- **Never assume** an unstated design choice. If something is ambiguous, the simplest implementation that satisfies the stated requirement is correct.
- **MUST** = non-negotiable. **SHOULD** = strong preference.

---

## 1. What This System Is

AgentDock is two completely separate things that never run in the same process:

### 1.1 — The Builder (you run this)
A web application that lets you visually design multi-agent systems. It has a canvas (like n8n), a library of all the systems you've designed, and a "Create Image" button that generates a complete standalone project. The builder stores your designs in a database. It does NOT run agents. It does NOT manage containers at runtime. It is purely a **design, storage, and code generation tool**.

### 1.2 — The Generated Runtime (standalone, lives independently)
What the builder produces when you hit "Create Image." A complete Docker Compose project — with its own orchestrator, LLM gateway, Redis, and agent containers — baked from your design. You take this project, drop it on any server or machine with Docker, run `docker compose up`, and it runs forever with no dependency on the builder. Shut the builder down. The runtime doesn't know or care.

**The builder is to the runtime what create-react-app is to a React project.** It generates the project. After that, the project is independent.

---

## 2. The Most Important Architectural Fact

> **The builder and the runtime are two different codebases. They share nothing at runtime. The builder generates files. The runtime consumes those files.**

This means:
- The builder has NO Docker socket access
- The builder has NO BullMQ or Redis
- The builder does NOT proxy agent endpoints
- The runtime has NO knowledge of the builder
- The runtime does NOT call home to the builder
- Editing a running system = either regenerate from builder OR hot-edit YAML configs in the running project directly

---

## 3. Architectural Philosophy

**P1 — The builder is a generator, not a server.** Its job is to take a visual design and produce files. That's it.

**P2 — The runtime is fully self-contained.** Every generated project is a complete system. No external dependencies beyond Docker and whatever LLM APIs you configure.

**P3 — Config files are the interface between builder and runtime.** The builder writes YAML. The runtime reads YAML. This is the only coupling between them — and it happens at generation time, not at runtime.

**P4 — Each generated system is isolated.** Its Redis, its network, its LLM gateway. Two generated systems on the same host share nothing.

**P5 — The runtime orchestrator is lightweight.** It doesn't spawn containers dynamically — containers are defined at generation time in the Compose file. The runtime orchestrator's job is: route tasks between agents, manage triggers, proxy agent API endpoints externally, and emit live events via WebSocket.

**P6 — Editability is always possible.** A system design stored in the builder can always be loaded back into the canvas, modified, and regenerated. A running system's YAML configs can be edited directly, and the runtime orchestrator hot-reloads them per-agent without restarting the whole system.

**P7 — Bun for all Node.js, uv for all Python. No exceptions.**

---

## 4. Architecture Decision Records

### ADR-001: Builder has no Docker dependency
The builder is a web app + database + file generator. It does not need Docker to run. This makes it simpler, safer, and hostable anywhere (even serverless). The generated Compose project is what has Docker requirements.

### ADR-002: Generated project = parameterised template
The builder contains a **project template** (a folder of Dockerfiles, orchestrator source, LLM gateway source, base Compose file). When you click "Create Image," the generator takes your system design JSON and fills in the template — agent configs, connections, trigger definitions, env var stubs — and zips it up as a downloadable project. The generated orchestrator source is the same code every time, configured by the YAML files the builder writes.

### ADR-003: SQLite for builder storage
The builder stores system designs in SQLite via `better-sqlite3`. Rationale: the builder is a single-user or small-team tool, not a multi-tenant SaaS. SQLite is zero-infrastructure, easily backed up (one file), and sufficient for hundreds of saved systems. Swap to Postgres later if needed — the database layer is abstracted.

### ADR-004: Generated runtime orchestrator uses Docker socket
The generated runtime's orchestrator DOES mount the Docker socket — for restarting individual agent containers on hot-reload, checking container health, and reading logs. This is appropriate because the runtime orchestrator is deployed with the system it manages, not as a shared platform service.

### ADR-005: Agent configs are editable in running systems
Generated agent YAML configs are mounted as read-only bind mounts into agent containers. To hot-reload: edit the YAML file on disk, call `POST /api/agents/{id}/reload` on the runtime orchestrator, which restarts only that agent container. No other agents are affected.

### ADR-006: System designs are stored as graph JSON in builder DB
The visual canvas state (nodes, edges, positions, all config) is serialised as JSON and stored in the builder's SQLite database. Loading a system for editing = fetch that JSON, hydrate the React Flow canvas. This makes every saved system fully editable at any time.

### ADR-007: "Create Image" produces a downloadable zip
When you click "Create Image," the builder backend generates the project files, zips them, and offers a download. Alternatively, if the builder is running on a server with Docker, it can also trigger a `docker build` and push to a configured registry. Both modes are supported.

---

## 5. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AgentDock BUILDER                         │
│                  (your design tool)                          │
│                                                              │
│  ┌─────────────────┐     ┌──────────────────────────────┐   │
│  │  Builder UI     │────►│  Builder Backend              │   │
│  │  React/TS       │     │  Bun/Hono                     │   │
│  │  - Canvas       │     │  - System design CRUD         │   │
│  │  - Agent config │     │  - Project generator          │   │
│  │  - System lib   │     │  - SQLite storage             │   │
│  │  - Create Image │     │  - Template engine            │   │
│  └─────────────────┘     └──────────────────────────────┘   │
│                                      │                       │
│                               Generates & zips               │
│                                      │                       │
└──────────────────────────────────────┼──────────────────────┘
                                       │
                         ┌─────────────▼──────────────┐
                         │   Generated Project (zip)   │
                         │   my-research-system/       │
                         │   ├── docker-compose.yml    │
                         │   ├── configs/              │
                         │   │   ├── agents/           │
                         │   │   └── workflow.yaml     │
                         │   ├── orchestrator/  (src)  │
                         │   ├── llm-gateway/   (src)  │
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
│  │ :4000        │  │ :5000        │  │    :6379         │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │ Docker socket (agent hot-reload only)              │
│         │                                                    │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  agent-001   │  │  agent-002   │  │   agent-N        │  │
│  │ Python/uv    │  │ Python/uv    │  │  Python/uv       │  │
│  │ :8080 (int)  │  │ :8080 (int)  │  │  :8080 (int)     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│                                                              │
│  External access: Only port 4000 (orchestrator) exposed     │
│  Agents: zero host port exposure, Docker DNS only           │
└─────────────────────────────────────────────────────────────┘
```

---

## 6. What Changed vs. Original Plan

| Aspect | Original Plan | Updated Plan |
|---|---|---|
| Builder role | Runtime + design tool | Design + generate tool only |
| Agent spawning | Orchestrator spawns dynamically | Defined in generated Compose file |
| Builder storage | None (no DB) | SQLite — stores all system designs |
| Docker in builder | Socket mounted | No Docker in builder at all |
| Output artifact | Running containers | Downloadable zip project |
| Editability | Live only | Builder canvas edit + regenerate OR hot-reload running YAML |
| Runtime orchestrator | The builder itself | Generated lightweight service, baked into project |
| Redis in builder | Yes | No — only in generated runtime |
| BullMQ in builder | Yes | No — only in generated runtime's llm-gateway |

**What stays identical:**
- Agent runtime (Python/FastAPI/uv) — same code
- LLM Gateway (Bun/BullMQ) — same code, generated into project
- Agent base Dockerfile — same
- Trigger types (cron, task completion, webhook, memory condition) — same, implemented in generated orchestrator
- Agent memory system (MD files + git) — same
- Agent-to-agent communication (Docker DNS + HTTP) — same
- All agent YAML config schema — same
- Frontend canvas behaviour — same

---

## 7. Complete Technology Stack

### 7.1 Builder Backend (`apps/builder-api`) — Node.js/TypeScript/Bun

| Concern | Library |
|---|---|
| HTTP server | `hono` |
| Database | `better-sqlite3` (with Bun bindings) |
| ORM/Query | `drizzle-orm` with `drizzle-orm/better-sqlite3` |
| YAML generation | `js-yaml` |
| File archiving (zip) | `archiver` |
| Schema validation | `zod` |
| Template rendering | Native string interpolation + `js-yaml` serialisation (no Handlebars — keep it simple) |
| JWT auth | `hono/jwt` |
| Logging | `pino` |

### 7.2 Builder Frontend (`apps/builder-ui`) — React/TypeScript/Bun/Vite

| Concern | Library |
|---|---|
| Build | `vite` |
| Canvas | `@xyflow/react` (React Flow v12) |
| State | `zustand` |
| Server state | `@tanstack/react-query` |
| Forms | `react-hook-form` + `zod` |
| UI components | `shadcn/ui` + `tailwindcss` |
| Icons | `lucide-react` |
| HTTP client | `ky` |
| Notifications | `sonner` |

### 7.3 Generated Runtime — Orchestrator (`template/orchestrator`) — Node.js/TypeScript/Bun

| Concern | Library |
|---|---|
| HTTP server | `hono` |
| Docker SDK | `dockerode` (for hot-reload restarts + health checks) |
| YAML parsing | `js-yaml` |
| Schema validation | `zod` |
| Cron | `croner` |
| Logging | `pino` |
| WebSocket | `hono/ws` |

### 7.4 Generated Runtime — LLM Gateway (`template/llm-gateway`) — Node.js/TypeScript/Bun

Same as original plan — `hono`, `bullmq`, `ioredis`, `openai`, `@anthropic-ai/sdk`, `@google/generative-ai`.

### 7.5 Generated Runtime — Agent Runtime (`template/agent-runtime`) — Python/uv

Same as original plan — `fastapi`, `uvicorn`, `httpx`, `pyyaml`, `pydantic`, `gitpython`, `apscheduler`, `structlog`, `watchfiles`.

---

## 8. Full Monorepo Structure

```
AgentDock/
├── apps/
│   ├── builder-api/                    # Builder backend (design storage + generator)
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   └── routes/
│   │   │   │       ├── systems.ts      # CRUD for saved system designs
│   │   │   │       ├── generate.ts     # POST /generate → produce zip
│   │   │   │       └── auth.ts
│   │   │   ├── db/
│   │   │   │   ├── schema.ts           # Drizzle schema
│   │   │   │   ├── migrations/
│   │   │   │   └── client.ts
│   │   │   ├── generator/
│   │   │   │   ├── index.ts            # Main generator entry point
│   │   │   │   ├── compose-gen.ts      # Generate docker-compose.yml
│   │   │   │   ├── agent-config-gen.ts # Generate per-agent YAML configs
│   │   │   │   ├── workflow-gen.ts     # Generate workflow.yaml
│   │   │   │   ├── env-gen.ts          # Generate .env.example
│   │   │   │   └── zip.ts              # Archive generated files into zip
│   │   │   ├── validator/
│   │   │   │   └── system-design.ts    # Validate design before generating
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   └── builder-ui/                     # Builder frontend
│       ├── src/
│       │   ├── components/
│       │   │   ├── canvas/
│       │   │   │   ├── AgentNode.tsx
│       │   │   │   ├── TriggerEdge.tsx
│       │   │   │   ├── Canvas.tsx
│       │   │   │   └── Toolbar.tsx
│       │   │   ├── panels/
│       │   │   │   ├── AgentConfigPanel.tsx
│       │   │   │   ├── TriggerPanel.tsx
│       │   │   │   └── MCPPanel.tsx
│       │   │   └── layout/
│       │   ├── pages/
│       │   │   ├── SystemLibrary.tsx   # List of all saved systems
│       │   │   ├── WorkflowEditor.tsx  # Canvas for designing a system
│       │   │   └── Login.tsx
│       │   ├── stores/
│       │   │   ├── canvas.store.ts     # React Flow nodes + edges
│       │   │   └── system.store.ts     # Current system being edited
│       │   └── api/
│       │       ├── client.ts
│       │       └── systems.api.ts
│       ├── Dockerfile
│       └── package.json
│
├── template/                           # The generated runtime template (NOT a running app)
│   │                                   # This is what gets copied + filled + zipped
│   ├── orchestrator/                   # Runtime orchestrator source (same every time)
│   │   ├── src/
│   │   │   ├── api/
│   │   │   │   ├── routes/
│   │   │   │   │   ├── agents.ts       # Proxy to agent containers + expose gating
│   │   │   │   │   ├── system.ts       # System health, status
│   │   │   │   │   └── webhooks.ts     # Inbound webhook triggers
│   │   │   │   └── websocket/
│   │   │   │       └── hub.ts
│   │   │   ├── docker/
│   │   │   │   └── agent-manager.ts   # Hot-reload: restart single agent container
│   │   │   ├── trigger/
│   │   │   │   ├── cron.ts
│   │   │   │   ├── task-completion.ts
│   │   │   │   ├── memory-condition.ts
│   │   │   │   └── webhook.ts
│   │   │   ├── proxy/
│   │   │   │   └── agent-proxy.ts
│   │   │   ├── config/
│   │   │   │   └── loader.ts          # Load workflow.yaml + all agent YAMLs on startup
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── llm-gateway/                    # Same as original plan
│   ├── agent-runtime/                  # Same as original plan
│   ├── agent-base.Dockerfile
│   └── docker-compose.template.yml    # Template Compose file (filled by generator)
│
├── packages/
│   ├── config-schema/                 # Zod schemas for agent + workflow YAML
│   └── shared-types/                  # Types shared between builder-api and builder-ui
│
├── docs/
│   ├── architecture.md
│   ├── builder-guide.md               # How to use the builder UI
│   ├── generated-system-guide.md      # How to deploy + manage a generated system
│   ├── agent-config-reference.md
│   ├── api-reference.md               # Builder API + generated runtime API
│   └── development-guide.md
│
├── docker/
│   └── builder.docker-compose.yml     # Run the builder itself
├── .env.example
└── package.json                       # Bun workspace root
```

---

## 9. Builder Database Schema (Drizzle + SQLite)

```typescript
// apps/builder-api/src/db/schema.ts

export const systems = sqliteTable('systems', {
  id:          text('id').primaryKey(),             // nanoid
  name:        text('name').notNull(),
  description: text('description'),
  canvasState: text('canvas_state').notNull(),      // JSON: { nodes, edges }
  metadata:    text('metadata').notNull(),           // JSON: { agentCount, triggerCount }
  createdAt:   integer('created_at').notNull(),
  updatedAt:   integer('updated_at').notNull(),
  version:     integer('version').default(1),        // Increments on each save
});

export const systemGenerations = sqliteTable('system_generations', {
  id:        text('id').primaryKey(),
  systemId:  text('system_id').notNull()
               .references(() => systems.id, { onDelete: 'cascade' }),
  version:   integer('version').notNull(),           // Which system version was generated
  generatedAt: integer('generated_at').notNull(),
  zipPath:   text('zip_path'),                       // Where the generated zip is stored on disk
  notes:     text('notes'),                          // Optional: what changed in this generation
});
```

**The `canvasState` JSON is the single source of truth for a system design.** It contains everything needed to regenerate the project at any time — every agent config, every trigger, every connection, every MCP, every canvas position.

---

## 10. The Generator

The generator is the core of the builder backend. It takes a `SystemDesign` (the canvas state) and produces a complete project directory, then zips it.

### 10.1 Generator Input (`SystemDesign`)

```typescript
interface SystemDesign {
  systemId: string;
  systemName: string;
  agents: AgentDesign[];
  connections: ConnectionDesign[];
}

interface AgentDesign {
  id: string;                    // e.g. "youtube-transcriber"
  name: string;
  description: string;
  position: { x: number; y: number };
  llm: {
    provider: 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'groq';
    model: string;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
  };
  memory: {
    gitAutoCommit: boolean;
    readableBy: string[];        // other agent IDs
  };
  shell: { enabled: boolean };
  mcps: MCPConfig[];
  tools: { pythonPackages: string[]; systemPackages: string[] };
  triggers: TriggerConfig[];
  expose: ('logs' | 'chat' | 'memory' | 'status' | 'tasks')[];
}

interface ConnectionDesign {
  id: string;
  from: string;                  // agent ID
  to: string;                    // agent ID
  trigger: {
    type: 'task_completion' | 'cron' | 'webhook' | 'memory_condition';
    passOutput: boolean;
    cronSchedule?: string;
    memoryCondition?: { file: string; contains: string; checkIntervalSeconds: number };
  };
}
```

### 10.2 Generator Output (project structure)

```
{systemName}-system/
├── docker-compose.yml           ← Generated from template, filled with agent services
├── .env.example                 ← All required env vars listed (no values)
├── configs/
│   ├── workflow.yaml            ← Full workflow definition
│   └── agents/
│       ├── {agent-id}.yaml      ← One config file per agent
│       └── ...
├── orchestrator/                ← Copied from template/orchestrator (identical every time)
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── llm-gateway/                 ← Copied from template/llm-gateway
│   ├── src/
│   ├── package.json
│   └── Dockerfile
├── agent-runtime/               ← Copied from template/agent-runtime
│   ├── app/
│   ├── pyproject.toml
│   └── Dockerfile              ← This is the agent-base.Dockerfile
└── README.md                    ← Auto-generated: system name, agents, endpoints, quickstart
```

### 10.3 docker-compose.yml Generation Logic

```typescript
// apps/builder-api/src/generator/compose-gen.ts

function generateCompose(design: SystemDesign): string {
  const services: Record<string, any> = {};

  // Fixed services (same for every generated system)
  services['orchestrator'] = {
    build: './orchestrator',
    ports: ['${ORCHESTRATOR_PORT:-4000}:4000'],
    volumes: [
      '/var/run/docker.sock:/var/run/docker.sock',
      './configs:/app/configs'
    ],
    environment: [
      'SYSTEM_ID=${SYSTEM_ID}',
      'REDIS_URL=redis://redis:6379',
      'LLM_GATEWAY_URL=http://llm-gateway:5000',
      // One env var listing all agent container names (for health checks)
      `AGENT_NAMES=${design.agents.map(a => a.id).join(',')}`
    ],
    depends_on: { redis: { condition: 'service_healthy' } },
    networks: ['AgentDock-net'],
    restart: 'unless-stopped'
  };

  services['llm-gateway'] = { /* ... same structure */ };
  services['redis'] = { /* ... redis:7-alpine with healthcheck */ };

  // Dynamic: one service per agent
  for (const agent of design.agents) {
    services[agent.id] = {
      build: './agent-runtime',
      volumes: [
        `memory-${agent.id}:/memory`,
        `./configs/agents/${agent.id}.yaml:/app/config/agent.yaml:ro`
      ],
      environment: [
        `AGENT_ID=${agent.id}`,
        'SYSTEM_ID=${SYSTEM_ID}',
        'LLM_GATEWAY_URL=http://llm-gateway:5000',
        'ORCHESTRATOR_URL=http://orchestrator:4000',
        // Peer agents this one is allowed to contact
        `PEER_AGENTS=${getPeerAgents(agent.id, design)}`
      ],
      networks: ['AgentDock-net'],
      restart: 'unless-stopped'
      // NO ports — zero host port exposure
    };
  }

  // Named volumes for each agent's memory (persists across container restarts)
  const volumes: Record<string, null> = {};
  for (const agent of design.agents) {
    volumes[`memory-${agent.id}`] = null;
  }

  return jsYaml.dump({ services, networks: { 'AgentDock-net': { driver: 'bridge' } }, volumes });
}
```

---

## 11. Builder API Endpoints

```
POST /api/auth/login                      → JWT login
GET  /api/auth/me                         → current user

GET  /api/systems                         → list all saved system designs
POST /api/systems                         → create new system (body: { name, description })
GET  /api/systems/:id                     → get full system design (includes canvasState)
PUT  /api/systems/:id                     → update system design (saves canvas state)
DELETE /api/systems/:id                   → delete system + all its generations

GET  /api/systems/:id/generations         → list all generate history for a system
POST /api/systems/:id/generate            → generate project → returns zip download
GET  /api/systems/:id/generations/:genId  → download a previously generated zip
```

**`PUT /api/systems/:id` — update design:**
```typescript
Body: {
  name?: string;
  description?: string;
  canvasState: {       // Full React Flow state
    nodes: Node[];
    edges: Edge[];
  }
}
// Validates canvasState can produce a valid system design before saving
// Increments version field on every save
```

**`POST /api/systems/:id/generate` — generate project:**
```typescript
// Steps:
// 1. Load system from DB
// 2. Deserialise canvasState → SystemDesign
// 3. Validate: all agents have required fields, no orphan connections
// 4. Run generator → produces temp directory with all files
// 5. Zip the directory
// 6. Save zip path to systemGenerations table
// 7. Stream zip as download response
// Returns: application/zip stream
```

---

## 12. Generated Runtime — Orchestrator Responsibilities

The generated orchestrator is simpler than a full platform orchestrator. Its agents are known at startup (defined in Compose). It does NOT dynamically spawn containers. It DOES:

1. **On startup:** Read `configs/workflow.yaml` + all `configs/agents/*.yaml`. Build internal trigger registry.
2. **Trigger management:** Start croner jobs, register webhook routes, start memory condition pollers, listen for task completion events.
3. **Task routing:** When a trigger fires, build a task payload and POST to the target agent's `/tasks` endpoint via Docker DNS.
4. **API proxy:** Route all external calls to `GET|POST /api/agents/:id/*` through to the agent's internal FastAPI server, enforcing `expose[]` permissions.
5. **WebSocket hub:** Agents POST internal events to `POST /internal/events`. Orchestrator fans out to connected browser clients.
6. **Hot-reload:** `POST /api/agents/:id/reload` → uses Docker socket to `docker restart {container-name}`. That's the only Docker operation the runtime orchestrator does.
7. **Health endpoint:** `GET /health` → checks all agent containers are running, returns system status.

**The runtime orchestrator does NOT:**
- Spawn new containers
- Create Docker networks
- Pull Docker images
- Manage Redis or LLM Gateway directly

---

## 13. Editability — Both Modes Explained

### Mode 1: Edit in builder → Regenerate
1. Open builder UI → System Library → click system
2. Canvas loads with the saved design
3. Make changes (add/remove agents, change configs, edit triggers)
4. Click Save (auto-saves canvas state to SQLite via `PUT /api/systems/:id`)
5. Click "Create Image" → downloads new zip
6. Deploy the new zip (replace the old one, `docker compose up --build`)

This is a full regeneration. Use this for structural changes (new agents, new connections).

### Mode 2: Hot-edit running system
1. SSH into the server running the generated system
2. Edit `configs/agents/{agent-id}.yaml` directly
3. Call `POST http://localhost:4000/api/agents/{id}/reload` (or use the running system's API)
4. Only that agent restarts — rest of system unaffected

Use this for small config changes (tweaking a prompt, adjusting cron schedule) without full regeneration.

**Important:** Hot-edits to a running system are NOT automatically synced back to the builder. If you want the builder to reflect them, manually update the canvas and save. This is by design — the running system is independent.

---

## 14. Builder UI — Pages and Behaviour

### System Library Page (`/`)
- Grid of cards, one per saved system
- Each card: system name, description, agent count, last modified, version number
- Actions per card: Edit (→ opens canvas), Generate (→ triggers zip download), Delete
- Top bar: "New System" button → creates blank system in DB → opens canvas
- Search/filter by name

### Workflow Editor Page (`/systems/:id/edit`)
- Full-screen React Flow canvas
- Left sidebar: agent palette — drag to canvas to add an agent node
- Right sidebar: context panel — shows config for selected node or edge
- Top bar: system name (editable inline), Save button, Generate button, back to library
- **Save behaviour:** Auto-save on canvas change (debounced 2 seconds) + manual save button. Show "Saved" / "Saving..." indicator.
- **Generate behaviour:** Click → validate design (show errors if invalid) → POST to `/api/systems/:id/generate` → browser downloads zip. Show progress toast.
- Canvas state is the ground truth — everything the user configures on the canvas is what gets generated.

### AgentNode (custom React Flow node)
- Shows: agent name, provider badge (Ollama / OpenAI etc.), trigger type icons
- Click → opens AgentConfigPanel in right sidebar
- Has two handles (left = input trigger, right = output trigger) for connecting arrows

### TriggerEdge (custom React Flow edge)
- Shows a label: trigger type
- Click → opens TriggerPanel in right sidebar to configure trigger type + params

### AgentConfigPanel (right sidebar tabs)
1. **General** — name, description, base image override
2. **LLM** — provider dropdown, model, temperature, max tokens, system prompt textarea
3. **Memory** — git auto-commit toggle, readable_by multi-select (other agents in canvas)
4. **Shell** — enabled toggle
5. **MCPs** — list of configured MCPs, Add MCP button (name, transport, URL)
6. **Tools** — Python packages list (add/remove), system packages list
7. **Expose** — checkboxes: logs, chat, memory, status, tasks
Every tab change updates the node's data in the Zustand canvas store immediately.

### TriggerPanel (right sidebar, appears when edge is selected)
- Trigger type selector: Task Completion | Cron | Webhook | Memory Condition
- **Task Completion:** Pass output toggle
- **Cron:** Cron expression input + timezone selector + human-readable preview
- **Webhook:** Shows what the webhook URL will look like once deployed
- **Memory Condition:** File name input, contains string input, check interval input

---

## 15. Generated System — Runtime API Reference

These are the endpoints exposed by the **generated runtime orchestrator** (port 4000). All agent endpoints are proxied and permission-gated.

```
# System
GET  /health                              → overall system health + agent statuses
GET  /api/system/status                  → detailed status: all agents, trigger states

# Agent proxy (all gated by expose[] in agent config + API key)
GET  /api/agents/:id/status              → requires expose: status
GET  /api/agents/:id/logs               → requires expose: logs
GET  /api/agents/:id/memory             → requires expose: memory (list files)
GET  /api/agents/:id/memory/:file       → requires expose: memory (file content)
PUT  /api/agents/:id/memory/:file       → requires expose: memory + write permission
POST /api/agents/:id/chat               → requires expose: chat
GET  /api/agents/:id/tasks              → requires expose: tasks
POST /api/agents/:id/trigger            → manually trigger agent (any API key)
POST /api/agents/:id/reload             → hot-reload agent config (admin API key only)
POST /api/agents/:id/files              → send file to agent

# Webhooks
POST /webhooks/:agentApiKey             → external trigger for specific agent

# WebSocket
WS   /ws?token={jwt}                    → real-time events (agent logs, status, memory updates)

# Internal (called by agents, not exposed externally)
POST /internal/events                   → agents post completion events here
```

---

## 16. Agent-to-Agent Communication & File Sharing

This section is unchanged from the original. Agents communicate via Docker DNS on the private network.

**File sharing flow (Agent A → Agent B):**
```
1. Agent A (Python runtime) calls:
   POST http://{agentB-container-name}:8080/files
   Body: {
     senderId: "agent-a",
     filename: "transcript.md",
     content: "<base64 encoded file>",
     mimeType: "text/markdown",
     metadata: { sourceUrl: "https://youtube.com/..." }
   }

2. Agent B receives, decodes, saves to:
   /storage/received/agent-a/transcript.md

3. Agent B appends to /memory/received_files.md:
   "- [2024-01-15T10:30:00Z] transcript.md from agent-a"

4. Agent B git commits (async, non-blocking)

5. Agent B returns: { path: "/storage/received/agent-a/transcript.md" }
```

**Task + file together (Agent A sends task WITH a file):**
```
POST http://{agentB-container-name}:8080/tasks
Body: {
  taskId: "task-uuid",
  senderId: "agent-a",
  instruction: "Summarise this transcript",
  context: {},
  attachedFiles: [
    {
      filename: "transcript.md",
      content: "<base64>",
      mimeType: "text/markdown"
    }
  ]
}
```
Agent B saves attached files to `/storage/received/agent-a/` BEFORE processing the task, so the LLM prompt can reference them.

---

## 17. Data Schemas — Agent Config YAML (generated)

Same schema as original plan. Reproduced here for completeness:

```yaml
agent:
  id: "youtube-transcriber"
  name: "YouTube Transcriber"
  description: "..."
  version: "1.0.0"

runtime:
  base_image: "AgentDock/agent-base:latest"

llm:
  provider: "ollama"
  model: "llama3.1:8b"
  temperature: 0.7
  max_tokens: 4096
  system_prompt: |
    You are a YouTube transcript analyzer...

memory:
  path: "/memory"
  git_auto_commit: true
  readable_by: ["summarizer-agent"]

shell:
  enabled: true

mcps:
  - name: "youtube-mcp"
    transport: "sse"
    url: "http://youtube-mcp:3000/sse"
    env:
      YOUTUBE_API_KEY: "${YOUTUBE_API_KEY}"

tools:
  python_packages: ["yt-dlp", "youtube-transcript-api"]
  system_packages: []

triggers:
  - type: "task"
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

## 18. Implementation Phases

> Build in this exact order. Each phase must have a working, verifiable result before starting the next.

### Phase 1 — Monorepo Foundation
1. Create Bun workspace root with `apps/*`, `packages/*`, `template/*`
2. Create `packages/config-schema` — Zod schemas for AgentDesign, SystemDesign, agent YAML, workflow YAML
3. Create `packages/shared-types` — API request/response types for builder API
4. Create `docker/builder.docker-compose.yml` — runs builder-api + builder-ui
5. **Verify:** `bun install` at root succeeds. Dev compose file starts.

### Phase 2 — Builder Backend
1. Scaffold Hono app with Bun
2. Set up Drizzle + SQLite — create migrations for `systems` and `systemGenerations` tables
3. Implement JWT auth (login endpoint, middleware)
4. Implement system CRUD routes (create, list, get, update, delete)
5. Implement `generator/` module — start with compose-gen, then agent-config-gen, then workflow-gen, then env-gen
6. Implement zip archive endpoint — generate project → zip → stream download
7. **Verify:** Create a system via API, save a canvas state, POST /generate, download zip, inspect zip contents — all expected files present and correct.

### Phase 3 — Builder Frontend
1. Scaffold React + Vite + TypeScript with Bun
2. Set up Tailwind + shadcn/ui
3. Set up Zustand canvas store + TanStack Query
4. Build System Library page (list saved systems, create new)
5. Build React Flow canvas with custom AgentNode + TriggerEdge
6. Build AgentConfigPanel (all tabs) — updates node data in Zustand on change
7. Build TriggerPanel (edge config)
8. Wire Save button → `PUT /api/systems/:id` (debounced auto-save)
9. Wire Generate button → `POST /api/systems/:id/generate` → trigger browser download
10. **Verify:** Open builder in browser. Create a system. Add agents. Connect them. Configure. Save. Generate. Download zip. Verify zip contents match what was designed.

### Phase 4 — Agent Runtime Template
*(This is `template/agent-runtime/` — the code that runs inside every agent container)*
1. Scaffold FastAPI app with uv + pyproject.toml
2. Implement config loader (reads `/app/config/agent.yaml`)
3. Implement MemoryManager + GitManager
4. Implement all FastAPI routes (health, status, tasks, files, memory, logs, chat, shell)
5. Implement LLMClient (POSTs to llm-gateway, handles callback)
6. Implement TaskReceiver (receives task, saves attached files, queues LLM call)
7. Implement FileReceiver
8. Implement ShellExecutor
9. Implement MCP client manager
10. Implement APScheduler cron integration
11. Build and test agent-base.Dockerfile
12. **Verify:** Run agent container with a test agent.yaml. POST a task. Agent processes it, calls LLM gateway (mock), updates memory, git commits. Check /memory endpoint.

### Phase 5 — LLM Gateway Template
*(Copied into every generated project as `template/llm-gateway/`)*
1. Scaffold Hono + BullMQ + ioredis
2. Implement all provider adapters (OpenAI, Anthropic, Gemini, Groq, Ollama)
3. Implement Ollama load balancer
4. Implement queue worker + producer
5. Implement callback delivery to agents
6. Build Dockerfile
7. **Verify:** Submit LLM jobs via API. Worker processes them. Callback delivered to test server.

### Phase 6 — Generated Runtime Orchestrator Template
*(Copied into every generated project as `template/orchestrator/`)*
1. Scaffold Hono app
2. Implement config loader (reads workflow.yaml + all agent YAMLs at startup)
3. Implement all four trigger types
4. Implement agent proxy with expose[] gating
5. Implement WebSocket hub + internal events endpoint
6. Implement agent hot-reload via Docker socket
7. Build Dockerfile
8. **Verify:** Manually construct a test generated project. `docker compose up`. All triggers fire correctly. Proxy gating works. WebSocket events arrive.

### Phase 7 — End-to-End Integration
1. In builder UI: design a 3-agent pipeline (Agent A cron → Agent B task completion → Agent C memory condition)
2. Click Generate → download zip
3. Set up `.env` from `.env.example`
4. `docker compose up --build`
5. Verify all agents start, triggers fire, pipeline runs, WebSocket events arrive
6. Test hot-edit: edit an agent YAML, call /reload, verify only that agent restarts
7. Return to builder, edit the design, regenerate, redeploy

### Phase 8 — Polish + Docs
1. Error handling consistency across all services
2. Auto-generated README.md in every generated project (list agents, their API endpoints, quickstart)
3. Write all docs in `docs/`
4. Write `.env.example` with descriptions for every variable
5. Final clean-machine end-to-end test

---

## 19. Code Quality Standards

**TypeScript:** `strict: true`. No `any`. All async functions typed. All errors typed. `pino` for logging, never `console.log`. All route handlers wrapped in try/catch with typed error responses.

**Python:** Full type annotations. Pydantic for all data crossing service boundaries. `async` all the way. `structlog` for logging, never `print()`. All paths via `pathlib.Path`. All `except` blocks log and handle — never `pass` silently.

**General:**
- Every service has `/health` returning 200 when ready
- All config from env vars — never hardcoded
- Secrets NEVER in YAML files — use `${ENV_VAR}` references
- Docker volumes for agent memory are named volumes (persist across restarts)
- Git commits are always non-blocking (fire-and-forget async task)
- Agents addressed by DNS name, never by IP

---

## 20. What NOT To Do

1. **Do NOT add Docker to the builder.** The builder is a web app + database + file generator. It generates files. It does not manage containers.

2. **Do NOT make the runtime call back to the builder.** Once generated, the runtime is completely independent. No phone-home, no dependency on builder availability.

3. **Do NOT put runtime state in the builder database.** The builder stores designs, not runtime status. If you want to monitor a running system, build a separate monitoring page that calls the running system's own `/health` endpoint directly.

4. **Do NOT skip the template approach.** The orchestrator, llm-gateway, and agent-runtime are template code. They are the same code in every generated project, configured by YAML. Do not make the generator write different orchestrator source code for each system — it copies the same source and varies only the YAML configs.

5. **Do NOT use npm, pip, yarn, pnpm, poetry, or conda.** Bun for Node.js everywhere. uv for Python everywhere. Every Dockerfile, every script, every CI command.

6. **Do NOT expose agent ports to the host.** In the generated Compose file, agent services have zero `ports` entries. All external access is through the orchestrator proxy.

7. **Do NOT share Redis between generated systems.** Each generated project has its own Redis service. Two systems on the same host use different Compose projects, different Redis instances, different Docker networks.

8. **Do NOT hardcode system-specific values in the template source.** Template source is generic. All system-specific data (agent names, connections, triggers) lives in the YAML config files that the generator writes. The template source reads those configs at runtime.

9. **Do NOT make the canvas auto-generate on every save.** Save = write design to builder DB. Generate = explicit user action. These are two separate actions. Never automatically generate a zip on save.

10. **Do NOT let hot-edits to a running system automatically sync back to the builder DB.** The builder and runtime are independent after generation. Manual sync only.

---

## 21. Context7 MCP Usage

Before implementing any feature using a library, fetch current docs:
```
mcp context7 resolve-library-id "drizzle-orm"
mcp context7 get-library-docs "/drizzle-team/drizzle-orm" --topic "sqlite"
```

Do this for EVERY library before first use: `hono`, `drizzle-orm`, `better-sqlite3`, `@xyflow/react`, `react-hook-form` + `zod`, `zustand`, `@tanstack/react-query`, `bullmq`, `dockerode`, `fastapi`, `pydantic`, `apscheduler`, `gitpython`, `croner`, `archiver`.

---

## 22. Final Checklist

- [ ] Builder: Create system, save canvas state, load it back — canvas restores exactly
- [ ] Builder: Edit saved system, save again — version incremented in DB
- [ ] Builder: Generate zip — inspect structure, all expected files present
- [ ] Generated project: `docker compose up --build` on clean machine — all services healthy
- [ ] Generated project: All agents start, `/health` returns all green
- [ ] Generated project: Cron trigger fires at correct time, task delivered to agent
- [ ] Generated project: Agent A completes task → Agent B triggered automatically
- [ ] Generated project: Webhook POST to `/webhooks/:key` triggers agent
- [ ] Generated project: Memory condition fires when `.md` file matches
- [ ] Generated project: Agent A sends file → Agent B stores in `/storage/received/agent-a/`
- [ ] Generated project: `/api/agents/:id/logs` returns logs (expose: logs configured)
- [ ] Generated project: `/api/agents/:id/chat` returns 403 if expose: chat NOT configured
- [ ] Generated project: Edit agent YAML → POST /reload → only that agent restarts
- [ ] Generated project: Agent memory persists across agent container restarts (named volume)
- [ ] Builder: Generate same system twice → both zips produce identical working systems
- [ ] Docs: All files in `docs/` complete and accurate