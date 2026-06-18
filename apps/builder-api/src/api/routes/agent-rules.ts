/**
 * Agent Builder Rules
 * ===================
 * These are the quality rules injected into every agent generation prompt.
 * They encode what makes a good agent config vs a bad one.
 *
 * This is the "skill" for building systems — not pre-built templates,
 * but rules that produce correct configs for any arbitrary requirement.
 */

export const AGENT_QUALITY_RULES = `
## Agent Design Rules (follow all of these)

### Identity
- Each agent has ONE job. If you can describe it with "and", split it into two agents.
- Agent ID: lowercase, hyphenated, ends with "-agent" (e.g. "gap-analyzer-agent")
- Name: Title Case, human-readable (e.g. "Gap Analyzer Agent")
- System prompt: written in second person ("You are..."), specific to the task, never generic

### LLM Selection
- Use temperature 0.1–0.2 for agents that classify, route, score, or extract structured data
- Use temperature 0.3–0.5 for agents that write explanations, lessons, or reports
- Use temperature 0.6–0.8 for agents that generate creative content or brainstorm
- Default model: "llama-3.1-70b-versatile" on groq (fast, free tier, good tool calling)
- For code generation or debugging tasks: use "llama-3.1-70b-versatile" with temperature 0.1

### Actions
- Every agent must have at least one action
- Action name: snake_case verb phrase (e.g. "analyze_gap", "generate_quiz", "route_request")
- promptTemplate: must be specific — include what files to read, what to write, exact output format
- outputFile: required for every action that produces data for downstream agents
- outputFile naming: descriptive kebab-case .md files (e.g. "gap-analysis.md", "quiz.md")
- Never use generic names like "output.md" or "result.md"

### Triggers and Connections
- First agent in a pipeline: must have { "type": "webhook" } trigger
- All other agents: use { "type": "task" } trigger only
- Connections between agents: use "file_received" trigger type (most reliable)
- filePattern in connection: must exactly match the outputFile of the source agent's action
- Never use "task_completion" trigger unless the pipeline is truly sequential with no branching

### Memory and RAG
- Enable RAG (enabled: true) for any agent that needs to remember things across sessions
- RAG folders: always include /memory with auto_index: true
- self_learning: true for agents that improve from user interactions (tutors, analyzers)
- readableBy: list agent IDs that need to read this agent's memory files

### User State Tracking
- If the system needs to track user progress, history, or preferences across sessions:
  * Include a dedicated "profile-writer" action in the agent that updates user state
  * Write state to a named file: "user-profile.md" or "learner-profile.md"
  * Set readableBy to include ALL agents that need to adapt based on user state
  * The first agent in every session should query RAG for the profile file
- If the system serves multiple users, the webhook payload must include a userId field
  and agents must namespace their memory files: "profiles/{userId}.md"

### Tools
- fetch_url: include in pythonPackages ["trafilatura", "pypdf", "youtube-transcript-api"]
  when the agent needs to read URLs, PDFs, or YouTube videos
- run_code: no extra packages needed (builtin)
- search_web: include ["duckduckgo-search"] in pythonPackages when agent needs live search
- Only add packages the agent actually needs — don't add everything

### System Prompt Quality Checklist
A good system prompt must answer all of these:
1. What is this agent's single responsibility?
2. What inputs does it receive (file names, webhook fields)?
3. What tools should it use and when?
4. What is the exact format of its output?
5. What file does it write and what triggers downstream?
6. If user state exists: how should it read and update it?

Bad system prompt: "You are a helpful assistant that analyzes student performance."
Good system prompt: "You are the Gap Analyzer. You receive quiz-answer.md and quiz.md.
Score each answer. For each wrong answer, identify the specific misconception (not just 'incorrect').
Read user-profile.md from RAG to check prior weak areas. Update user-profile.md with new gaps.
Write gap-analysis.md with: score, misconceptions, next recommended topic."

### Expose Config
- Always include: ["status", "logs", "memory", "tasks"]
- Add "chat" only if the agent is a direct conversational interface
- Add "shell" only if shell.enabled is true

### Runtime API & File-Based Handoff Endpoints
The generated runtime runs inside Docker-compose and exposes these API interfaces:
1. **Public Webhook Trigger**: \`POST /webhooks/:agent-id\`
   - Receives tasks from external clients. Payload format: \`{ "instruction": "...", "payload": { "userId": "...", ... } }\`.
   - Any uploaded files are automatically saved to \`/storage/received/webhook/{filename}\`.
   - This trigger is reserved ONLY for the first agent in the system topology.
2. **Internal Task API**: \`POST /api/agents/:id/tasks\`
   - The Orchestrator triggers downstream agents by posting a task payload to their tasks endpoint.
   - Downstream agents receive the task and retrieve upstream outputs (file handoffs) from \`/storage/received/{senderId}/{filename}\`.
3. **Memory & State Storage**:
   - Each agent container has a dedicated, persistent named Docker volume mounted at \`/memory\`.
   - ChromaDB RAG stores indices at \`/memory/rag\`.
   - File-based handoffs must always produce a file artifact written by the action's \`outputFile\`.
   - For all incoming handoffs, the runtime decodes files into \`/storage/received/{senderId}/{filename}\` and updates the manifest at \`/storage/manifest.json\`.
4. **Agent Proxy Interface**:
   - Status: \`GET /api/agents/:id/status\` (checks agent health and readiness)
   - Logs: \`GET /api/agents/:id/logs\` (retrieves stdout/stderr runtime logs)
   - Memory: \`GET /api/agents/:id/memory\` (retrieves stored markdown files/profiles)
   - Chat: \`POST /api/agents/:id/chat\` (allows interactive session)

### Model Context Protocol (MCP) Servers
Agents can connect to external services via MCP. Two connection modes are available:

- **Platform MCPs (stdio, always available)**: \`filesystem\`, \`memory-kg\`, \`sequential-thinking\`, \`web-fetch\`.
  These are pre-bundled with AgentDock. Configure with \`transport: "stdio"\` and the appropriate \`npx\` command.

- **Smithery-hosted MCPs (streamable-http)**: Any server listed on smithery.ai that has \`remote=true\`.
  Configure with \`transport: "streamable-http"\`, \`url: "https://server.smithery.ai/{qualifiedName}/mcp"\`, and \`env: { "SMITHERY_API_KEY": "<key>" }\`.

**Rules for MCP selection:**
  - Only add an MCP if the agent CANNOT accomplish its task with builtin tools (\`search_web\`, \`fetch_url\`, \`run_code\`).
  - Prefer builtin tools over MCPs for web searches and URL fetching.
  - Do not add MCPs speculatively — every configured MCP adds startup latency and a potential failure point.
  - Custom MCP schema: \`{ "name": "...", "transport": "stdio"|"streamable-http", "url": "...", "command": "...", "env": { "KEY": "val" } }\`.

- **Internet Search**:
  - Every generated agent has outbound internet access.
  - For web searches use the \`search_web\` builtin tool (duckduckgo-search) or the Smithery-hosted \`brave\` MCP.
`;


export const USER_STATE_RULES = `
## User State Tracking Rules

Determine if this system needs user state tracking by asking:
- Does the system need to remember what a user has done in previous sessions? → YES
- Does the system serve multiple different users? → YES (needs userId namespacing)
- Is this a one-shot pipeline (runs once, no repeat users)? → NO

If YES to user state:
- The agent that produces the final output or scores user input must write to user-profile.md
- Format: structured markdown with sections (Completed, Weak Areas, Preferences, History)
- All agents that adapt behavior based on user history must have RAG enabled and read this file
- If multi-user: use "profiles/{{input.userId}}.md" as the file path pattern

If NO to user state:
- No profile files needed
- RAG can be disabled (enabled: false) to save resources
`;

export const PIPELINE_PATTERNS = `
## Common Pipeline Patterns

### Adaptive Learning Loop (for tutoring, coaching, practice)
intake → teacher → quiz → analyzer → [back to intake]
- intake: routes messages (new topic vs answer submission)
- teacher: explains concept, writes lesson.md
- quiz: generates questions from lesson.md, writes quiz.md
- analyzer: scores answers, updates user-profile.md, writes analysis.md
- Needs user state: YES

### Document Q&A (for research, study assistant)
intake → retriever → responder
- intake: receives question + optional document URL
- retriever: fetches URL/PDF, chunks and indexes content, writes retrieved-context.md
- responder: answers question using retrieved context, writes response.md
- Needs user state: NO (unless tracking what documents user has studied)

### Content Generation Pipeline (for creating study materials)
planner → generator → reviewer → formatter
- planner: breaks down the content request into sections, writes content-plan.md
- generator: writes each section, writes draft.md
- reviewer: checks accuracy and completeness, writes review.md
- formatter: produces final formatted output, writes final-content.md
- Needs user state: NO

### Assessment Pipeline (for grading, evaluation)
intake → evaluator → feedback-writer → reporter
- intake: receives submission, writes submission.md
- evaluator: scores against rubric, writes evaluation.md
- feedback-writer: generates constructive feedback, writes feedback.md
- reporter: formats final report for teacher/student, writes report.md
- Needs user state: YES (track submission history)

### Notification/Communication Pipeline (for alerts, reports)
trigger → analyzer → formatter → sender
- trigger: receives event (cron or webhook), writes event.md
- analyzer: determines what to communicate and to whom, writes message-plan.md
- formatter: formats for the channel (WhatsApp, email, SMS), writes formatted-message.md
- sender: sends via MCP tool (Gmail, WhatsApp, etc.), writes send-log.md
- Needs user state: NO (unless personalizing messages)
`;
