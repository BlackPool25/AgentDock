import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { env } from "./env.js";
import { logger } from "../logger.js";

export interface AgentConfig {
  id: string;
  expose: string[];
  [key: string]: unknown;
}

export interface WorkflowConfig {
  id?: string;
  name?: string;
  connections: Array<{
    from: string;
    to: string;
    trigger: { type: string; [key: string]: unknown };
    data_mapping?: Array<{ from: string; to: string }>;
  }>;
  [key: string]: unknown;
}

export interface LoadedConfig {
  agents: Map<string, any>;
  workflow: WorkflowConfig;
}

// Alias expected by route files
export type SystemConfig = LoadedConfig;

export function loadConfig(): LoadedConfig {
  const agents = new Map<string, any>();

  const agentsDir = join(env.CONFIGS_DIR, "agents");
  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      try {
        const raw = yaml.load(readFileSync(join(agentsDir, file), "utf-8")) as any;
        const agent = raw?.agent;
        if (agent?.id) {
          agents.set(agent.id, { ...agent, ...raw });
        }
      } catch (err) {
        logger.error({ file, err }, "Failed to load agent config");
      }
    }
  }

  const workflowPath = join(env.CONFIGS_DIR, "workflow.yaml");
  let workflow: WorkflowConfig = { id: env.SYSTEM_ID, name: env.SYSTEM_ID, connections: [] };
  if (existsSync(workflowPath)) {
    try {
      const raw = yaml.load(readFileSync(workflowPath, "utf-8")) as any;
      // workflow.yaml has a nested `workflow:` block for metadata (id, name, version)
      // but `connections` and `agents` live at the top level — merge both.
      workflow = {
        ...(raw?.workflow ?? {}),
        connections: raw?.connections ?? raw?.workflow?.connections ?? [],
        agents: raw?.agents ?? raw?.workflow?.agents ?? [],
      };
    } catch (err) {
      logger.error({ err }, "Failed to load workflow.yaml");
    }
  }

  logger.info({ agentCount: agents.size, workflowId: workflow.id }, "Config loaded");
  return { agents, workflow };
}
