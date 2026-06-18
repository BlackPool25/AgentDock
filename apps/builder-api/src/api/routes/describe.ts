/**
 * POST /api/systems/:id/describe
 *
 * Two-phase workflow generation from natural language:
 *
 * Phase 1 — Intent Analysis
 *   Extract: what agents are needed, what data flows between them,
 *   does this system need user state tracking, what pattern fits best.
 *
 * Phase 2 — Agent Generation
 *   For each agent from Phase 1, generate a complete high-quality config
 *   using the agent quality rules. Each agent is generated independently
 *   so the LLM can focus on one agent at a time.
 *
 * This produces far better configs than a single "generate everything" prompt
 * because the LLM isn't trying to do intent analysis, agent design, prompt
 * writing, and JSON formatting simultaneously.
 *
 * Request:  { "description": "...", "context": { ...optional extra info } }
 * Response: { "canvasState": { nodes, edges }, "intent": {...}, "agentCount": N }
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "../../db/client.js";
import { systems } from "../../db/schema.js";
import { logger } from "../../logger.js";
import { AGENT_QUALITY_RULES, USER_STATE_RULES, PIPELINE_PATTERNS } from "./agent-rules.js";
import { MCP_REGISTRY } from "../../../../../packages/mcp-registry/src/index.js";


const describeRoutes = new Hono();

// Compact quality rules injected into agent generation prompts.
// Enriched to produce production-grade multi-agent specifications, structured inputs, outputs, and exposed capabilities.
const AGENT_QUALITY_RULES_COMPACT = `
Agent Quality & Production-Grade Rules (follow all):
1. Single Responsibility: Each agent has exactly ONE job.
2. System Prompt Guidelines: Write in second person ("You are..."). It must be highly detailed and answer:
   - What is this agent's single responsibility?
   - What inputs does it receive? State exact filename paths (e.g., read from "/storage/received/{sender-agent-id}/{filename}" for upstream files).
   - What tools should it use and when? (e.g. fetch_url, search_web, run_code).
   - What is the exact format of its output?
   - What output file does it write to (matching the action's outputFile)?
3. Temperature Selection:
   - 0.1 for classification, routing, scoring, or code execution
   - 0.3 for explanations, summaries, or reports
   - 0.6 for creative content or brainstorming
4. Actions and File Deliverables:
   - Every agent must have at least one action.
   - Action name: snake_case verb phrase (e.g. "analyze_gap", "generate_report").
   - outputFile: Set to exactly the agent's expected outputFile. Use descriptive kebab-case names ending in .md (e.g., "market-trends.md", "quiz-scores.md"). Never use "output.md" or "result.md".
   - promptTemplate: Must reference the exact input filenames and instruct the agent to write its final output to the outputFile. Use the standard placeholder {{input.instruction}} for user instructions.
5. Connections & Event Handoffs:
   - First agent: Set trigger type to "webhook" (allows POST trigger) and "task" (allows manual run).
   - Downstream agents: Trigger type is "task". They run when the orchestrator forwards a task event.
   - Agents communicate by writing file deliverables to /memory/filename. The orchestrator triggers the downstream agent via a "file_received" connection once the file is written. The downstream agent reads the file at "/storage/received/{upstream-agent-id}/{filename}".
6. RAG & User Profiles:
   - If the system requires user history/progress tracking:
     * Write profile state to a named file (e.g., "user-profile.md" or "profiles/{{input.userId}}.md" if multi-user).
     * Set rag.enabled = true and rag.self_learning = true.
     * Instruct the agent to read/write these profiles in RAG.
7. Tools & Packages:
   - If agent uses "search_web", add "duckduckgo-search" to tools.pythonPackages.
   - If agent uses "fetch_url", add "trafilatura" and "pypdf" to tools.pythonPackages.
   - If agent uses "run_code", no extra python packages are needed (it executes via standard shell).
`;

const DescribeRequestSchema = z.object({
  description: z.string().min(3).max(50000),
  // Optional extra context the user provides
  context: z.record(z.string()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentSpec {
  id: string;
  name: string;
  role: string;           // one-sentence job description
  inputFiles: string[];   // files this agent reads
  outputFile: string;     // file this agent writes (empty for terminal agents)
  triggeredBy: string;    // "webhook" | file name from upstream agent
  needsTools: string[];   // ["fetch_url", "run_code", "search_web"]
  needsUserState: boolean;
}

interface PipelineIntent {
  problem: string;        // what real problem this solves
  pattern: string;        // which pipeline pattern fits
  needsUserState: boolean;
  multiUser: boolean;
  agents: AgentSpec[];
  connections: Array<{ from: string; to: string; filePattern: string }>;
}

// ── Route ─────────────────────────────────────────────────────────────────────

describeRoutes.post(
  "/:id/describe",
  zValidator("json", DescribeRequestSchema, (result, c) => {
    if (!result.success) {
      logger.error({ err: result.error.format() }, "describe.validation_failed");
      return c.json({ error: "Validation failed", details: result.error.format() }, 400);
    }
  }),
  async (c) => {
    const { id } = c.req.param();
    const { description, context, provider, model } = c.req.valid("json");

    const row = db.select().from(systems).where(eq(systems.id, id)).get();
    if (!row) return c.json({ error: "System not found" }, 404);

  // Phase 1: extract structured intent
  let intent: PipelineIntent;
  try {
    intent = await analyzeIntent(description, context, provider, model);
  } catch (e) {
    logger.error({ err: e }, "describe.intent_failed");
    return c.json({ error: "Intent analysis failed", detail: String(e) }, 500);
  }

  logger.info({ systemId: id, agents: intent.agents.map(a => a.id), needsUserState: intent.needsUserState }, "describe.intent_extracted");

  // Phase 2: generate each agent config in parallel with a Validator & Self-Correction retry loop
  const MAX_RETRIES = 3;
  let attempt = 0;
  let generatedAgents: any[] = [];
  let agentFeedback: Record<string, string> = {};
  let isValid = false;

  // We keep previous configs of agents to feed them back to the Prompt Engineer on retry
  const previousConfigs: Record<string, any> = {};

  while (attempt < MAX_RETRIES && !isValid) {
    attempt++;
    logger.info({ attempt, systemId: id }, "describe.generation_loop_start");

    // Generate/regenerate agents. Only generate the ones that failed or haven't been generated yet!
    const generationPromises = intent.agents.map(async (spec) => {
      const feedback = agentFeedback[spec.id];
      // Reuse previously successful agent config if there's no failure feedback for it in this round
      if (previousConfigs[spec.id] && !feedback) {
        return previousConfigs[spec.id];
      }

      logger.info({ agentId: spec.id, attempt, hasFeedback: !!feedback }, "describe.generating_agent");
      try {
        const config = await generateAgentConfig(
          spec,
          intent,
          description,
          provider,
          model,
          feedback,
          previousConfigs[spec.id]
        );
        previousConfigs[spec.id] = config;
        return config;
      } catch (e) {
        logger.error({ err: e, agentId: spec.id }, "describe.agent_gen_failed_internal");
        throw e;
      }
    });

    try {
      generatedAgents = await Promise.all(generationPromises);
    } catch (e) {
      return c.json({ error: "Agent generation failed", detail: String(e) }, 500);
    }

    // Programmatic validation
    const progResult = validateAgentConfigs(intent, generatedAgents);
    if (!progResult.isValid) {
      logger.warn({ attempt, feedback: progResult.agentFeedback }, "describe.programmatic_validation_failed");
      agentFeedback = progResult.agentFeedback;
      isValid = false;
      continue;
    }

    // LLM Quality & Coherence validation
    const llmResult = await runLLMValidator(intent, generatedAgents, provider, model);
    if (!llmResult.isValid) {
      logger.warn({ attempt, feedback: llmResult.agentFeedback }, "describe.llm_validation_failed");
      agentFeedback = llmResult.agentFeedback;
      isValid = false;
      continue;
    }

    isValid = true;
    agentFeedback = {};
    logger.info({ attempt, systemId: id }, "describe.validation_passed");
  }

  if (!isValid) {
    logger.error({ systemId: id, maxRetries: MAX_RETRIES }, "describe.validation_failed_all_attempts");
    return c.json({
      error: "Generation validation failed after maximum retries",
      details: agentFeedback
    }, 500);
  }

  // Build canvas state from generated agents + connections
  const canvasState = buildCanvasState(generatedAgents, intent);
  const agentCount = canvasState.nodes.length;
  const now = Date.now();

  db.update(systems)
    .set({
      canvasState: JSON.stringify(canvasState),
      metadata: JSON.stringify({ agentCount, triggerCount: canvasState.edges.length }),
      updatedAt: now,
    })
    .where(eq(systems.id, id))
    .run();

  return c.json({ canvasState, intent, agentCount });
});

// ── Phase 1: Intent Analysis ──────────────────────────────────────────────────

async function analyzeIntent(description: string, context?: Record<string, string>, provider?: string, model?: string): Promise<PipelineIntent> {
  const contextStr = context ? `\nAdditional context: ${JSON.stringify(context)}` : "";

  const prompt = `You are a systems architect. Analyze this requirement and extract a structured pipeline design.

Requirement: "${description}"${contextStr}

User state rules:
- needsUserState=true if the system must remember user history across sessions or serves multiple users
- multiUser=true if multiple different users will use the system
- If multiUser, profile path pattern is "profiles/{{input.userId}}.md"

Return ONLY valid JSON (no explanation, no markdown):
{
  "problem": "what real problem this solves",
  "pattern": "sequential",
  "needsUserState": false,
  "multiUser": false,
  "agents": [
    {
      "id": "agent-slug",
      "name": "Agent Name",
      "role": "exactly what this agent does in one sentence",
      "inputFiles": ["input_filename.md"],
      "outputFile": "output_filename.md",
      "triggeredBy": "webhook",
      "needsTools": [],
      "needsUserState": false
    }
  ],
  "connections": [
    { "from": "source-agent-slug", "to": "target-agent-slug", "filePattern": "output_filename.md" }
  ]
}

Rules:
- "pattern" must be one of: "sequential", "parallel", "router"
- "triggeredBy" must be "webhook" for the first agent, or the outputFile of the upstream agent for all others
- "needsTools" can contain: "fetch_url", "run_code", "search_web"
- 3–5 agents maximum
- Each connection filePattern must exactly match the outputFile of the "from" agent
- Return ONLY the JSON object`;

  const raw = await callLLM(prompt, 0.1, 3000, provider, model);
  return cleanAndParseJSON(raw) as PipelineIntent;
}

// ── Phase 2: Per-Agent Config Generation ─────────────────────────────────────

function getMCPSummaryPrompt(description: string): string {
  const descLower = description.toLowerCase();
  // Keywords that suggest specific MCP categories
  const relevant = MCP_REGISTRY.filter(mcp => {
    const text = (mcp.name + " " + mcp.description + " " + (mcp.audiences || []).join(" ")).toLowerCase();
    // Always include core communication/search MCPs
    if (["brave-search", "web-fetch", "filesystem", "memory-kg", "sequential-thinking"].includes(mcp.id)) return true;
    // Include if description mentions related keywords
    const keywords = text.split(/\s+/);
    return keywords.some(kw => kw.length > 4 && descLower.includes(kw));
  }).slice(0, 12); // cap at 12 to keep prompt short

  if (relevant.length === 0) return "No specific MCPs needed beyond builtin tools (search_web, fetch_url, run_code).";
  return relevant.map(mcp =>
    `- ${mcp.id}: ${mcp.name} — ${mcp.description} (transport: "${mcp.transport}", pkg: "${mcp.package}")`
  ).join("\n");
}

// ── Phase 2: Per-Agent Config Generation ─────────────────────────────────────

async function generateAgentConfig(
  spec: AgentSpec,
  intent: PipelineIntent,
  originalDescription: string,
  provider?: string,
  model?: string,
  feedback?: string,
  previousConfig?: any
): Promise<Record<string, unknown>> {
  const nodeId = previousConfig?.nodeId ?? randomUUID();

  const userStateInstruction = (intent.needsUserState && spec.needsUserState)
    ? `This agent must read and/or update user state. ${intent.multiUser
        ? 'Use "profiles/{{input.userId}}.md" for per-user state.'
        : 'Use "user-profile.md" for user state.'}`
    : "";

  const toolsInstruction = spec.needsTools.length > 0
    ? `This agent needs these builtin tools: ${spec.needsTools.join(", ")}.`
    : "This agent does not need external tools.";

  const mcpRegistryPrompt = `Available MCP servers (choose only if needed for external integrations):
${getMCPSummaryPrompt(originalDescription)}`;

  const feedbackInstruction = feedback && previousConfig
    ? `\n### CRITICAL: Your previous generation attempt failed validation with the following feedback:
"${feedback}"

Here was your previous generated config:
${JSON.stringify(previousConfig, null, 2)}

Please correct these specific issues, ensure all output files, triggers, inputs, and formats are correctly specified, and output the complete corrected configuration JSON.`
    : "";

  // Map input files to their source agent directory pathways
  const upstreamConnections = intent.connections.filter(c => c.to === spec.id);
  const inputPathsInstruction = upstreamConnections.map(conn =>
    `- Upstream input "${conn.filePattern}" is written by agent "${conn.from}", so you MUST read/load it from: "/storage/received/${conn.from}/${conn.filePattern}".`
  ).join("\n");

  const prompt = `You are generating a single agent config for a multi-agent system.

Overall system goal: "${originalDescription}"
This agent's role: ${spec.role}
${userStateInstruction}
${toolsInstruction}
${mcpRegistryPrompt}
${feedbackInstruction}

Input files this agent reads: ${spec.inputFiles.length ? spec.inputFiles.join(", ") : "none (receives via webhook/task instruction)"}
Output file this agent writes: ${spec.outputFile || "none (terminal agent)"}

### CRITICAL FILENAME & PATHING RULES (Strictly Enforced):
${spec.inputFiles.length ? `- You MUST explicitly reference the exact input filename(s) and their directory paths in BOTH your "systemPrompt" and your action "promptTemplate" (e.g., "Read the input file from /storage/received/{upstream-agent-id}/filename").
${inputPathsInstruction}` : ''}
${spec.outputFile ? `- You MUST set the action's "outputFile" field to EXACTLY "${spec.outputFile}".
- You MUST explicitly mention that the final output must be written to this file (e.g., "Write your final output to ${spec.outputFile}") in BOTH your "systemPrompt" and action "promptTemplate".` : ''}

${AGENT_QUALITY_RULES_COMPACT}

Return ONLY this JSON object (no markdown, no explanation):
{
  "nodeId": "${nodeId}",
  "agentId": "${spec.id}",
  "name": "${spec.name}",
  "description": "one sentence describing the agent",
  "llm": {
    "provider": "${provider ?? "ollama"}",
    "model": "${model ?? "qwen3:8b"}",
    "temperature": 0.3,
    "maxTokens": 2048,
    "systemPrompt": "detailed, specific system prompt following the quality checklist"
  },
  "rag": {
    "enabled": false,
    "self_learning": false,
    "readableBy": []
  },
  "tools": {
    "pythonPackages": []
  },
  "mcps": [],
  "actions": [
    {
      "name": "action_name_verb_phrase",
      "description": "what this action does",
      "promptTemplate": "specific prompt with exact file names, output format, and {{input.instruction}} placeholder",
      "outputFile": "${spec.outputFile || ""}"
    }
  ],
  "triggers": ${spec.triggeredBy === "webhook"
    ? '[{ "type": "webhook" }, { "type": "task" }]'
    : '[{ "type": "task" }]'}
}

Instructions:
- temperature: float 0.1-0.8
- rag.enabled: true if needs memory across sessions
- rag.self_learning: true if improves from interactions
- tools.pythonPackages: list only packages this agent actually needs
- mcps: only include if agent needs external service integration (WhatsApp, Gmail, etc.)
- Return ONLY the JSON object`;

  const raw = await callLLM(prompt, 0.2, 3000, provider, model);
  const config = cleanAndParseJSON(raw) as Record<string, unknown>;

  // Post-process: if the model omitted outputFile on actions, fill it from spec
  if (spec.outputFile && Array.isArray(config.actions)) {
    for (const act of config.actions as any[]) {
      if (!act.outputFile) act.outputFile = spec.outputFile;
    }
  }

  return config;
}

// ── Validation Helpers ─────────────────────────────────────────────────────────

interface ValidationResult {
  isValid: boolean;
  agentFeedback: Record<string, string>;
}

function validateAgentConfigs(
  intent: PipelineIntent,
  generatedAgents: any[]
): ValidationResult {
  const agentFeedback: Record<string, string> = {};
  let overallValid = true;

  const agentMap = new Map<string, any>();
  generatedAgents.forEach(a => {
    if (a && a.agentId) {
      agentMap.set(a.agentId, a);
    }
  });

  for (const spec of intent.agents) {
    const config = agentMap.get(spec.id);
    if (!config) {
      agentFeedback[spec.id] = "Agent configuration was not generated.";
      overallValid = false;
      continue;
    }

    const errors: string[] = [];

    // System prompt validation
    const sysPrompt = config.llm?.systemPrompt || "";
    if (!sysPrompt || sysPrompt.length < 50) {
      errors.push("System prompt is empty or too short. It must be a detailed, specific system prompt instructing the agent on its exact job, input files, tools, and output formats.");
    }

    // Webhook trigger check
    if (spec.triggeredBy === "webhook") {
      const hasWebhook = config.triggers?.some((t: any) => t.type === "webhook");
      if (!hasWebhook) {
        errors.push("This is the first agent in the pipeline but it is missing the 'webhook' trigger.");
      }
    }

    // Actions check
    const actions = config.actions || [];
    if (actions.length === 0) {
      errors.push("Agent must have at least one action defined.");
    } else {
      actions.forEach((act: any, idx: number) => {
        if (!act.name) {
          errors.push(`Action at index ${idx} is missing a name.`);
        }
        if (!act.promptTemplate || act.promptTemplate.length < 20) {
          errors.push(`Action '${act.name || idx}' has a missing or too short promptTemplate.`);
        }
        if (spec.outputFile && !act.outputFile) {
          errors.push(`Agent is expected to output '${spec.outputFile}' but action '${act.name}' has no outputFile.`);
        }
      });
    }

    // Input files check
    const inputFiles = spec.inputFiles || [];
    inputFiles.forEach(file => {
      const promptLower = sysPrompt.toLowerCase();
      const actionsLower = actions.map((a: any) => (a.promptTemplate || "").toLowerCase()).join(" ");
      if (!promptLower.includes(file.toLowerCase()) && !actionsLower.includes(file.toLowerCase())) {
        errors.push(`Agent reads input file '${file}', but this file is never referenced in your system prompt or action prompt templates.`);
      }
    });

    if (errors.length > 0) {
      agentFeedback[spec.id] = errors.join(" ");
      overallValid = false;
    }
  }

  // Connection integrity check
  intent.connections.forEach(conn => {
    const fromAgent = agentMap.get(conn.from);
    if (fromAgent) {
      const actions = fromAgent.actions || [];
      const hasMatchingOutput = actions.some((act: any) => act.outputFile === conn.filePattern);
      if (!hasMatchingOutput) {
        const msg = `Agent is connected to '${conn.to}' via file '${conn.filePattern}', but no action outputs a file named '${conn.filePattern}'.`;
        agentFeedback[conn.from] = agentFeedback[conn.from]
          ? `${agentFeedback[conn.from]} ${msg}`
          : msg;
        overallValid = false;
      }
    }
  });

  return {
    isValid: overallValid,
    agentFeedback,
  };
}

async function runLLMValidator(
  intent: PipelineIntent,
  generatedAgents: any[],
  provider?: string,
  model?: string
): Promise<ValidationResult> {
  const prompt = `You are a QA validator for a multi-agent builder. Check the generated agent configurations against the intent for critical issues only.

Extracted Intent:
${JSON.stringify(intent, null, 2)}

Generated Agent Configurations:
${JSON.stringify(generatedAgents, null, 2)}

Only fail (isValid=false) if an agent has one of these CRITICAL issues:
1. systemPrompt is missing or under 50 characters
2. The first agent (triggeredBy="webhook") has no webhook trigger
3. An agent has zero actions defined
4. An agent's action is missing outputFile when the spec requires one

Do NOT fail for style preferences, minor inconsistencies, redundant fields, or suggestions for improvement.

Return ONLY this JSON (no markdown):
{
  "isValid": true,
  "agentFeedback": {}
}
Set isValid=false and populate agentFeedback only for CRITICAL failures listed above.`;

  try {
    const raw = await callLLM(prompt, 0.1, 2000, provider, model);
    const parsed = cleanAndParseJSON(raw);
    return {
      isValid: !!parsed.isValid,
      agentFeedback: parsed.agentFeedback || {},
    };
  } catch (e) {
    logger.warn({ err: e }, "LLM validator failed, falling back to programmatic checks only");
    return { isValid: true, agentFeedback: {} };
  }
}

// ── Build Canvas State ────────────────────────────────────────────────────────

function buildCanvasState(
  agents: unknown[],
  intent: PipelineIntent,
): { nodes: unknown[]; edges: unknown[] } {
  // Position agents in a horizontal flow with slight vertical offset for branches
  const nodes = (agents as Array<Record<string, unknown>>).map((a, i) => {
    const rag = a.rag as Record<string, unknown>;
    const tools = a.tools as Record<string, unknown>;
    const actions = a.actions as Array<Record<string, unknown>>;
    const spec = intent.agents[i];
    const needsShell = spec?.needsTools?.includes("run_code") ?? false;
    const isFirst = spec?.triggeredBy === "webhook";
    const expose = ["status", "logs", "memory", "tasks"];
    if (isFirst) expose.push("chat");
    if (needsShell) expose.push("shell");

    return {
      id: a.nodeId as string,
      type: "agent",
      position: { x: 150 + i * 320, y: 200 },
      data: {
        id: a.agentId,
        name: a.name,
        description: a.description,
        position: { x: 150 + i * 320, y: 200 },
        llm: a.llm,
        memory: { gitAutoCommit: true, readableBy: rag?.readableBy ?? [] },
        rag: {
          enabled: rag?.enabled ?? false,
          embedding_model: "all-MiniLM-L6-v2",
          folders: rag?.enabled ? [{ path: "/memory", auto_index: true, file_types: [".md", ".txt"] }] : [],
          top_k: 5,
          chunk_size: 500,
          chunk_overlap: 50,
          self_learning: rag?.self_learning ?? false,
          self_learning_file: "rag-learned.md",
          min_confidence_threshold: 0.3,
        },
        shell: {
          enabled: needsShell,
          level: "restricted",
          allowed_commands: needsShell ? ["python3", "pip", "uv", "curl", "git"] : [],
        },
        mcps: (a.mcps as Array<any> ?? []).map(mcp => ({
          name: mcp.name,
          transport: mcp.transport ?? "stdio",
          url: mcp.url ?? "",
          command: mcp.command ?? "",
          args: mcp.args ?? [],
          env: mcp.env ?? {},
        })),
        tools: { pythonPackages: tools?.pythonPackages ?? [], systemPackages: [] },
        actions: (actions ?? []).map(act => ({
          name: act.name,
          description: act.description ?? "",
          inputSchema: {},
          outputSchema: {},
          promptTemplate: act.promptTemplate ?? "",
          outputFile: act.outputFile ?? "",
        })),
        triggers: a.triggers,
        expose,
        seedFiles: [],
        insufficientInput: { enabled: false, message: "", fallbackAction: "return_error" },
      },
    };
  });

  // Build node ID lookup by agentId
  const nodeIdByAgentId = new Map<string, string>();
  nodes.forEach(n => nodeIdByAgentId.set(n.data.id as string, n.id));

  const edges = intent.connections.map(conn => ({
    id: randomUUID(),
    source: nodeIdByAgentId.get(conn.from) ?? conn.from,
    target: nodeIdByAgentId.get(conn.to) ?? conn.to,
    type: "trigger",
    data: {
      trigger: { type: "file_received", filePattern: conn.filePattern },
    },
  }));

  return { nodes, edges };
}

// ── JSON Cleanup & Parsing Helper ──────────────────────────────────────────────

function cleanAndParseJSON(raw: string): any {
  // Strip <think>...</think> blocks that thinking models emit before JSON
  const stripped = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    logger.error({ rawResponse: raw.slice(0, 500) }, "Could not find JSON block in LLM response");
    throw new Error("Could not find JSON block in LLM response");
  }

  let jsonString = stripped.substring(firstBrace, lastBrace + 1).trim();

  // Remove block and line comments
  jsonString = jsonString
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?:^|[^:])\/\/.*$/gm, "");

  // Strip trailing commas before closing braces/brackets
  jsonString = jsonString.replace(/,(\s*[\]}])/g, "$1");

  // Fix embedded literal newlines inside JSON string values.
  // qwen3 thinking models emit: "key": "line1\n  line2" where \n is a real newline,
  // not the escaped sequence \\n — this breaks JSON.parse.
  // Strategy: scan character by character, replace bare newlines inside strings with \\n
  jsonString = fixEmbeddedNewlines(jsonString);

  try {
    return JSON.parse(jsonString);
  } catch (e: any) {
    logger.error({ extractedJson: jsonString.slice(0, 800), parseError: e.message }, "Failed to parse JSON from LLM");
    throw new Error(`JSON parsing failed: ${e.message}`);
  }
}

/** Replace literal newlines (and tabs) inside JSON string values with their escape sequences. */
function fixEmbeddedNewlines(json: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      result += ch;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
    }
    result += ch;
  }
  return result;
}

// ── LLM Call ──────────────────────────────────────────────────────────────────

async function callLLM(prompt: string, temperature: number, maxTokens: number, providerOverride?: string, modelOverride?: string): Promise<string> {
  const provider = providerOverride ?? process.env.LLM_PROVIDER ?? "openai";
  const model = modelOverride ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;

  if (provider !== "ollama" && !apiKey) {
    throw new Error("No LLM API key configured (set OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY)");
  }

  // Use native Ollama API for Ollama provider — it supports think:false and num_predict correctly.
  // The OpenAI-compat /v1/chat/completions endpoint ignores both.
  if (provider === "ollama") {
    const ollamaBase = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const res = await fetch(`${ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        think: false,          // suppress <think> block entirely
        stream: false,
        messages: [{ role: "user", content: prompt }],
        options: { temperature, num_predict: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Ollama API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { message: { content: string } };
    return data.message?.content ?? "";
  }

  // Gemini — Google Generative AI REST API
  if (provider === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("GEMINI_API_KEY not set");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, maxOutputTokens: maxTokens },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    return data.candidates[0]?.content?.parts[0]?.text ?? "";
  }

  // OpenAI / Groq / Anthropic — standard OpenAI-compat endpoint
  const baseUrl = provider === "groq"
    ? "https://api.groq.com/openai/v1"
    : "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) throw new Error(`LLM API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "";
}

export { describeRoutes };
