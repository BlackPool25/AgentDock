import { z } from "zod";

export const LLMProviderSchema = z.enum([
  "ollama",
  "openai",
  "anthropic",
  "gemini",
  "groq",
]);

export const MCPConfigSchema = z.object({
  name: z.string(),
  transport: z.enum(["sse", "stdio"]),
  url: z.string().optional(),
  command: z.string().optional(),
  env: z.record(z.string()).default({}),
});

// ─── Agent Action: a named task the agent can execute when triggered ───────────
export const AgentActionSchema = z.object({
  name: z.string().min(1),                          // e.g. "analyse_request"
  description: z.string().default(""),
  // JSON Schema for the input payload this action expects
  inputSchema: z.record(z.unknown()).default({}),
  // JSON Schema for the output this action produces
  outputSchema: z.record(z.unknown()).default({}),
  // Prompt template — use {{input.field}} placeholders
  promptTemplate: z.string().default(""),
  // Where to write the output (relative to /memory)
  outputFile: z.string().optional(),               // e.g. "analysis.md"
});

export const RAGConfigSchema = z.object({
  enabled: z.boolean().default(false),
  embedding_model: z.string().default("all-MiniLM-L6-v2"),
  folders: z.array(z.object({
    path: z.string(),
    auto_index: z.boolean().default(true),
    file_types: z.array(z.string()).default([".md", ".txt", ".pdf"]),
    exclude_files: z.array(z.string()).default([]),
  })).default([]),
  max_file_size_kb: z.number().int().default(500),
  top_k: z.number().int().default(5),
  chunk_size: z.number().int().default(500),
  chunk_overlap: z.number().int().default(50),
});

export const TriggerConfigSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task") }),
  z.object({ 
    type: z.literal("cron"), 
    schedule: z.string().min(1), 
    timezone: z.string().default("UTC"),
    actionName: z.string().optional() 
  }),
  z.object({ 
    type: z.literal("webhook"),
    actionName: z.string().optional()
  }),
]);

export const SeedFileSchema = z.object({
  filename: z.string(),
  type: z.enum(["text", "pdf"]),
  content: z.string(),
  extractedText: z.string().optional(),
});

export const InsufficientInputConfigSchema = z.object({
  enabled: z.boolean().default(false),
  message: z.string().default("I don't have enough information to proceed. Please provide more details."),
  fallbackAction: z.enum(["return_error", "ask_clarification", "use_defaults"]).default("return_error"),
});

export const AgentDesignSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1),
  description: z.string().default(""),
  position: z.object({ x: z.number(), y: z.number() }),
  llm: z.object({
    provider: LLMProviderSchema,
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().int().positive().default(4096),
    systemPrompt: z.string().default(""),
  }),
  memory: z.object({
    gitAutoCommit: z.boolean().default(true),
    readableBy: z.array(z.string()).default([]),
  }),
  rag: RAGConfigSchema.default({}),
  shell: z.object({ enabled: z.boolean().default(false) }),
  mcps: z.array(MCPConfigSchema).default([]),
  tools: z.object({
    pythonPackages: z.array(z.string()).default([]),
    systemPackages: z.array(z.string()).default([]),
  }),
  actions: z.array(AgentActionSchema).default([]),
  triggers: z.array(TriggerConfigSchema).default([{ type: "task" }]),
  expose: z.array(z.enum(["logs", "chat", "memory", "status", "tasks"])).default(["status", "logs"]),
  seedFiles: z.array(SeedFileSchema).default([]),
  insufficientInput: InsufficientInputConfigSchema.default({}),
});

// ─── Data mapping: maps output fields from source agent to input fields of target ─
export const DataMappingSchema = z.array(z.object({
  from: z.string(),   // source field path, e.g. "output.report"
  to: z.string(),     // target field path, e.g. "input.document"
})).default([]);

export const ConnectionDesignSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  // Human-readable label shown on the edge
  label: z.string().optional(),
  description: z.string().optional(),
  // Field-level data mapping from source output to target input
  dataMapping: DataMappingSchema,
  trigger: z.discriminatedUnion("type", [
    z.object({ type: z.literal("task_completion"), passOutput: z.boolean().default(true), actionFilter: z.string().optional() }),
    z.object({
      type: z.literal("cron"),
      cronSchedule: z.string(),
      timezone: z.string().default("UTC"),
    }),
    z.object({ type: z.literal("webhook") }),
    z.object({
      type: z.literal("memory_condition"),
      file: z.string(),
      contains: z.string(),
      checkIntervalSeconds: z.number().int().positive().default(30),
    }),
    z.object({
      type: z.literal("file_received"),
      // Trigger fires when the `from` agent writes a file matching this pattern
      filePattern: z.string().default("*"),
    }),
  ]),
});

export const SystemDesignSchema = z.object({
  systemId: z.string().regex(/^[a-z0-9-]+$/),
  systemName: z.string().min(1),
  agents: z.array(AgentDesignSchema).min(1, "At least one agent required"),
  connections: z.array(ConnectionDesignSchema).default([]),
});

// ─── Agent YAML config schema (used by generated runtime) ─────────────────────
export const AgentConfigSchema = z.object({
  agent: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    version: z.string().default("1.0.0"),
  }),
  runtime: z.object({
    base_image: z.string().default("agentdock/agent-base:latest"),
  }).default({}),
  llm: z.object({
    provider: LLMProviderSchema,
    model: z.string(),
    temperature: z.number().default(0.7),
    max_tokens: z.number().int().default(4096),
    system_prompt: z.string().optional(),
  }),
  memory: z.object({
    path: z.string().default("/memory"),
    git_auto_commit: z.boolean().default(true),
    readable_by: z.array(z.string()).default([]),
  }).default({}),
  rag: RAGConfigSchema.default({}),
  shell: z.object({ enabled: z.boolean().default(false) }).default({}),
  mcps: z.array(z.object({
    name: z.string(),
    transport: z.enum(["sse", "stdio"]),
    url: z.string().optional(),
    command: z.string().optional(),
    env: z.record(z.string()).default({}),
  })).default([]),
  tools: z.object({
    python_packages: z.array(z.string()).default([]),
    system_packages: z.array(z.string()).default([]),
  }).default({}),
  actions: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    input_schema: z.record(z.unknown()).default({}),
    output_schema: z.record(z.unknown()).default({}),
    prompt_template: z.string().optional(),
    output_file: z.string().optional(),
  })).default([]),
  seed_files: z.array(z.object({
    filename: z.string(),
    type: z.enum(["text", "pdf"]),
    content: z.string(),
    extracted_text: z.string().optional(),
  })).default([]),
  insufficient_input: z.object({
    enabled: z.boolean().default(false),
    message: z.string().default("I don't have enough information to proceed. Please provide more details."),
    fallback_action: z.enum(["return_error", "ask_clarification", "use_defaults"]).default("return_error"),
  }).default({}),
  triggers: z.array(TriggerConfigSchema).default([{ type: "task" }]),
  expose: z.array(z.enum(["logs", "chat", "memory", "status", "tasks"])).default(["status", "logs"]),
  ports: z.object({ internal: z.number().int().default(8080) }).default({}),
});

// ─── Workflow YAML schema (used by generated runtime) ─────────────────────────
export const WorkflowConfigSchema = z.object({
  workflow: z.object({
    id: z.string(),
    name: z.string(),
    version: z.string().default("1.0.0"),
  }),
  agents: z.array(z.object({
    ref: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
  })),
  connections: z.array(z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    label: z.string().optional(),
    description: z.string().optional(),
    data_mapping: z.array(z.object({ from: z.string(), to: z.string() })).default([]),
    trigger: z.discriminatedUnion("type", [
      z.object({ type: z.literal("task_completion"), pass_output: z.boolean().default(true), action_filter: z.string().optional() }),
      z.object({ type: z.literal("cron"), schedule: z.string(), timezone: z.string().default("UTC") }),
      z.object({ type: z.literal("webhook") }),
      z.object({
        type: z.literal("memory_condition"),
        file: z.string(),
        contains: z.string(),
        check_interval_seconds: z.number().int().default(30),
      }),
      z.object({
        type: z.literal("file_received"),
        file_pattern: z.string().default("*"),
      }),
    ]),
  })).default([]),
});

export type SystemDesign = z.infer<typeof SystemDesignSchema>;
export type AgentDesign = z.infer<typeof AgentDesignSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type ConnectionDesign = z.infer<typeof ConnectionDesignSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;
export type LLMProvider = z.infer<typeof LLMProviderSchema>;
export type MCPConfig = z.infer<typeof MCPConfigSchema>;
export type SeedFile = z.infer<typeof SeedFileSchema>;
export type InsufficientInputConfig = z.infer<typeof InsufficientInputConfigSchema>;
