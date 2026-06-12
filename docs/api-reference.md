# AgentDock API Reference

---

## Builder API (port 3001)

Base URL: `http://localhost:3001`

### Authentication

```
POST /api/auth/login
Content-Type: application/json
{ "email": "admin@agentdock.local", "password": "<ADMIN_PASSWORD>" }
→ { "token": "eyJ...", "expiresIn": "24h" }

GET /api/auth/me
Authorization: Bearer <token>
→ { "sub": "admin", "email": "admin@agentdock.local" }
```

All `/api/systems/*` routes require `Authorization: Bearer <token>`.

---

### System CRUD

```
GET    /api/systems
→ SystemSummary[]

POST   /api/systems
{ "name": "Web Dev Tutor", "description": "..." }
→ SystemDetail

GET    /api/systems/:id
→ SystemDetail

PUT    /api/systems/:id
{ "name": "...", "canvasState": { nodes, edges } }
→ SystemDetail

DELETE /api/systems/:id
→ { "ok": true }
```

---

### Generation

```
GET  /api/systems/:id/generations
→ GenerationRecord[]

POST /api/systems/:id/generate
→ streams zip download

GET  /api/systems/:id/generations/:genId
→ re-downloads a previous generation zip
```

---

### Workflow Description (NL → Pipeline)

```
POST /api/systems/:id/describe
Authorization: Bearer <token>
Content-Type: application/json

{
  "description": "I want to help JEE aspirants identify weak topics and get daily practice",
  "audience": "competitive",
  "subject": "Physics"
}

→ 200
{
  "canvasState": { "nodes": [...], "edges": [...] },
  "agentCount": 5,
  "summary": "Generated 5-agent pipeline for: ..."
}
```

**audience** values: `primary` | `middle` | `secondary` | `senior` | `undergraduate` | `postgraduate` | `competitive`

**How it works:** Sends the description to the configured LLM (`LLM_PROVIDER` + `LLM_MODEL` env vars). The LLM returns a full `canvasState` JSON with agent nodes, system prompts, actions, output files, and `file_received` edges. The canvas is saved and returned.

**Required env vars:** `OPENAI_API_KEY` or `GROQ_API_KEY` or `ANTHROPIC_API_KEY`, plus `LLM_PROVIDER` and `LLM_MODEL`.

---

### Workflow Patch (NL → Minimal Diff)

```
POST /api/systems/:id/patch
Authorization: Bearer <token>
Content-Type: application/json

{ "change": "make the quiz agent generate 5 questions instead of 3" }

→ 200
{
  "patch": {
    "agentId": "quiz-agent",
    "field": "actions[0].promptTemplate",
    "value": "Generate exactly 5 multiple-choice questions..."
  },
  "canvasState": { ...updated canvas... },
  "affectedAgentId": "quiz-agent"
}
```

**How it works:** Sends a compact summary of the current pipeline (agent IDs, action names, prompt snippets) to the LLM. The LLM returns a single `{agentId, field, value}` patch. The patch is applied to the canvas and persisted. Only the affected agent node changes — the rest of the pipeline is untouched.

**Use this for:** Changing prompt wording, adjusting question counts, modifying output file names, tweaking temperature — any single-field change.

---

## Generated Runtime API (port 4000)

Base URL: `http://localhost:4000`

### Authentication

```
POST /auth/login
{ "password": "<API_PASSWORD>" }
→ { "token": "eyJ...", "expiresIn": "24h" }
```

### Health

```
GET /health
→ { "status": "ok" | "degraded", "systemId": "...", "agents": [...] }
```

### System Status

```
GET /api/system/status
Authorization: Bearer <token>
→ { "agents": [{ "id", "status", "currentTask", "lastActivity" }] }
```

### Agent Endpoints

All agent endpoints are proxied through the orchestrator and gated by the agent's `expose[]` config.

```
GET  /api/agents/:id/status    # requires expose: status
GET  /api/agents/:id/logs      # requires expose: logs
GET  /api/agents/:id/memory    # requires expose: memory
POST /api/agents/:id/chat      # requires expose: chat
GET  /api/agents/:id/tasks     # requires expose: tasks
POST /api/agents/:id/reload    # hot-reload agent config
```

Endpoints not in `expose[]` return `403 Forbidden`.

### Webhook Trigger (public — no JWT)

```
POST /webhooks/:agent-id
Content-Type: application/json
{ "instruction": "I want to learn CSS Flexbox", "payload": {} }

# With file attachment:
Content-Type: multipart/form-data
instruction=<text>
file=<binary>
```

### WebSocket Events

```
WS ws://localhost:4000/ws?token=<jwt>

Event types:
{ "type": "agent:status",         "agentId", "status" }
{ "type": "agent:log",            "agentId", "level", "message" }
{ "type": "agent:memory:updated", "agentId", "file", "commitHash" }
{ "type": "agent:task:started",   "agentId", "taskId" }
{ "type": "agent:task:completed", "agentId", "taskId", "outputPreview" }
{ "type": "agent:task:failed",    "agentId", "taskId", "error" }
{ "type": "system:status",        "systemId", "status" }
```

Note: `output` and `content` fields are stripped from WS broadcasts. Use the memory/tasks endpoints to fetch full content.

---

## Builtin Agent Tools

Every agent has these tools available without any MCP configuration:

### `fetch_url`
Fetch and extract text from a URL. Supports web pages, PDFs, and YouTube videos.
```json
{ "url": "https://...", "max_chars": 8000 }
```

### `run_code`
Execute code in a sandboxed subprocess. Returns stdout + stderr.
```json
{ "code": "print('hello')", "language": "python" }
```
Supported languages: `python`, `javascript`, `bash`. Timeout: 10 seconds.

### `search_web`
DuckDuckGo search. No API key required.
```json
{ "query": "CBSE Class 10 maths syllabus 2025", "max_results": 5 }
```

---

## Environment Variables

### Builder API

| Var | Required | Description |
|-----|----------|-------------|
| `JWT_SECRET` | Yes | Min 32 chars |
| `ADMIN_PASSWORD` | Yes | Login password |
| `LLM_PROVIDER` | For describe/patch | `openai` \| `groq` \| `anthropic` \| `ollama` |
| `LLM_MODEL` | For describe/patch | e.g. `gpt-4o-mini`, `llama-3.1-70b-versatile` |
| `OPENAI_API_KEY` | If provider=openai | — |
| `GROQ_API_KEY` | If provider=groq | — |
| `ANTHROPIC_API_KEY` | If provider=anthropic | — |
| `OLLAMA_URL` | If provider=ollama | Default: `http://localhost:11434` |

### Generated Runtime

| Var | Required | Description |
|-----|----------|-------------|
| `JWT_SECRET` | Yes | Min 32 chars |
| `API_PASSWORD` | Yes | Runtime API password |
| `SYSTEM_ID` | Yes | Unique system identifier |
| `ORCHESTRATOR_PORT` | No | Default: 4000 |
| `OLLAMA_SERVERS` | If using Ollama | Comma-separated URLs |
| `OPENAI_API_KEY` | If using OpenAI | — |
| `ANTHROPIC_API_KEY` | If using Anthropic | — |
| `GEMINI_API_KEY` | If using Gemini | — |
| `GROQ_API_KEY` | If using Groq | — |
