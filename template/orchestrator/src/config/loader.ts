import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { z } from "zod";
import { logger } from "../logger.js";

const CONFIGS_DIR = process.env.CONFIGS_DIR ?? "/app/configs";

const WorkflowSchema = z.object({
  workflow: z.object({ id: z.string(), name: z.string() }),
  agents: z.array(z.object({ ref: z.string(), position: z.object({ x: z.number(), y: z.number() }) })),
  connections: z.array(z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    trigger: z.object({
      type: z.enum(["task_completion", "cron", "webhook", "memory_condition"]),
      pass_output: z.boolean().optional(),
      schedule: z.string().optional(),
      timezone: z.string().optional(),
      file: z.string().optional(),
      contains: z.string().optional(),
      check_interval_seconds: z.number().optional(),
    }),
  })).default([]),
});

const AgentConfigSchema = z.object({
  agent: z.object({ id: z.string(), name: z.string() }),
  expose: z.array(z.string()).default([]),
  triggers: z.array(z.object({ type: z.string() })).default([]),
  ports: z.object({ internal: z.number().default(8080) }).default({}),
});

export type WorkflowConfig = z.infer<typeof WorkflowSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export interface SystemConfig {
  workflow: WorkflowConfig;
  agents: Map<string, AgentConfig>;
}

export function loadConfig(): SystemConfig {
  const workflowPath = join(CONFIGS_DIR, "workflow.yaml");
  const workflow = WorkflowSchema.parse(yaml.load(readFileSync(workflowPath, "utf8")));
  logger.info({ workflowId: workflow.workflow.id }, "Workflow config loaded");

  const agents = new Map<string, AgentConfig>();
  const agentsDir = join(CONFIGS_DIR, "agents");
  for (const file of readdirSync(agentsDir)) {
    if (!file.endsWith(".yaml")) continue;
    const raw = yaml.load(readFileSync(join(agentsDir, file), "utf8"));
    const config = AgentConfigSchema.parse(raw);
    agents.set(config.agent.id, config);
    logger.info({ agentId: config.agent.id }, "Agent config loaded");
  }

  return { workflow, agents };
}
