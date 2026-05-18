# AgentDock Project Analysis Report

## 1. Architectural Overview
AgentDock is designed with a strict **Generator-Runtime** architecture. It consists of two completely decoupled systems:
*   **The Builder (Design Environment):** A web application (React/Bun/Hono/SQLite) used to visually orchestrate multi-agent systems. It stores designs as JSON and acts as a code generator.
*   **The Generated Runtime (Execution Environment):** A standalone Docker Compose project produced by the Builder. Once generated, it runs entirely independently with its own Orchestrator, LLM Gateway, Redis queue, and individual Agent containers. They share no state with the Builder.

## 2. Authentication, Roles, and Exposure
*   **Builder Auth:** Employs a single "Admin" role using JWT authentication. Credentials are provided via environment variables (`ADMIN_EMAIL`, `ADMIN_PASSWORD`).
*   **Runtime Security & API Exposure:** Agent containers are strictly locked down. They expose **zero ports** to the host machine. Instead, the Orchestrator serves as a proxy gateway on port 4000.
*   **User API Knowledge:** How does a user know what to call? The Builder generates a dynamic `README.md` for every exported project. This README explicitly lists the endpoints (`/status`, `/logs`, `/chat`, `/memory`, `/tasks`) available for each agent based on their specific configuration.
*   **The `expose` Array:** Every agent's YAML config has an `expose` array. When a user calls `http://localhost:4000/api/agents/{id}/logs`, the Orchestrator checks the agent's `expose` array. If "logs" is present, it strips the JWT Authorization header (agents don't handle auth) and proxies the request to the agent via internal Docker DNS. If not present, it returns `403 Forbidden`.

## 3. Agent Creation and Configuration
*   Agents are created visually on the React Flow canvas.
*   Upon clicking "Generate", the Builder translates the visual canvas state into individual YAML configuration files (`configs/agents/{agent-id}.yaml`).
*   The `agent-runtime` codebase is identical for every agent. It becomes a unique agent by reading its specific YAML config at startup, which defines its prompt, tools, MCP servers, and triggers.

## 4. MCP Integration and Ollama Compatibility
*   **MCP Accessibility:** Agents possess an `MCPClientManager` capable of maintaining sessions with multiple MCP servers (supporting SSE and stdio). Tools defined by these MCP servers are dynamically passed to the LLM Gateway.
*   **Ollama Tool Calling:** Can Ollama models use MCP tools accurately? The LLM Gateway implements the Ollama provider by wrapping the `OpenAIProvider`, pointing it to Ollama's OpenAI-compatible `/v1` endpoint. This means the *gateway infrastructure* fully supports passing MCP tools to Ollama. However, the *accuracy* depends entirely on the specific local model being run. Large, tool-trained models (like `llama3.1:8b` or `qwen2.5-coder`) will use MCP tools reasonably well, while smaller or older models will fail to format tool calls correctly.

## 5. Shell Tools Execution
*   Agents use a `ShellExecutor` running `asyncio.create_subprocess_shell`.
*   It operates inside a dedicated `/workspace` directory.
*   It is gated by the agent's YAML config: it can be entirely disabled, set to "full" access, or "restricted" (where it only allows a specific whitelist of commands). It also includes strict timeout enforcement to prevent runaway processes.

## 6. System Communication (Multiple Agents)
Agents rarely call each other directly. Communication is purely event-driven and mediated by the Orchestrator.
*   When Agent A finishes a task or writes a file, it sends a `POST /internal/events` HTTP call to the Orchestrator.
*   The Orchestrator checks the `workflow.yaml` file (generated from the visual canvas edges).
*   If a trigger matches (e.g., a `task_completion` trigger connects Agent A to Agent B), the Orchestrator constructs a new `TaskPayload` and sends it to Agent B's internal `/tasks` endpoint via internal Docker DNS (`http://{agent_id}:8080`).

## 7. File Structure, Logs, and File Lifecycle
*   **Memory Volume:** Every agent container has a dedicated, persistent named Docker volume mounted at `/memory`.
*   **Task State Lifecycle:** When an agent receives a task, it logs it to `/memory/task_queue.md`. When complete, the output is saved to `/memory/output_{task_id}.md` and the agent's internal `state.md` is updated. 
*   **File Transfer Lifecycle:** If Agent A sends a file to Agent B (or the Orchestrator attaches a file to a task), the `FileReceiver` saves the raw base64-decoded file into `/storage/received/{senderId}/{filename}`. It then appends a log of this receipt to `/memory/received_files.md`. These files persist for the lifetime of the container volume.
*   **Git Auto-commit:** If enabled, the `MemoryManager` automatically commits changes in the `/memory` directory to a local Git repository, creating a versioned history of the agent's thought process and outputs.
*   **Logs:** Agents output structured JSON logs via `structlog` to stdout. The Orchestrator can retrieve historical logs by reading the Docker socket, or it can stream real-time logs by broadcasting the agent's internal events over the Orchestrator's WebSocket (`/ws`).

## 8. LLM Gateway and External API Providers
*   The `llm-gateway` service acts as an abstraction layer and job queue (using BullMQ and Redis) to prevent rate-limiting and handle bursts of agent requests.
*   It supports OpenAI, Anthropic, Gemini, Groq, and Ollama.
*   **Secret Management:** External API keys are **never** stored in the SQLite database or the YAML configs. The generated project includes an `.env.example` file. Users must create an `.env` file in the generated directory and provide their API keys before running `docker compose up`. The Gateway's `ProviderRegistry` reads these keys at runtime.