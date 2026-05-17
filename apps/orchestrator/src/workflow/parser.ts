import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { WorkflowConfigSchema, AgentConfigSchema } from "@agentdock/config-schema";
import type { WorkflowConfig, AgentConfig } from "@agentdock/config-schema";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

export function loadWorkflow(id: string): WorkflowConfig {
  const path = join(env.CONFIGS_DIR, "workflows", `${id}.yaml`);
  const raw = yaml.load(readFileSync(path, "utf-8"));
  return WorkflowConfigSchema.parse(raw);
}

export function loadAllWorkflows(): WorkflowConfig[] {
  const dir = join(env.CONFIGS_DIR, "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .flatMap((f) => {
      try {
        return [loadWorkflow(f.replace(/\.ya?ml$/, ""))];
      } catch (err) {
        logger.error({ file: f, err }, "Failed to load workflow");
        return [];
      }
    });
}

export function loadAgentConfig(id: string): AgentConfig {
  const path = join(env.CONFIGS_DIR, "agents", `${id}.yaml`);
  const raw = yaml.load(readFileSync(path, "utf-8"));
  return AgentConfigSchema.parse(raw);
}

export function saveWorkflow(config: WorkflowConfig): void {
  const { mkdirSync, writeFileSync } = require("fs");
  const dir = join(env.CONFIGS_DIR, "workflows");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${config.workflow.id}.yaml`), yaml.dump(config));
}

export function saveAgentConfig(config: AgentConfig): void {
  const { mkdirSync, writeFileSync } = require("fs");
  const dir = join(env.CONFIGS_DIR, "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${config.agent.id}.yaml`), yaml.dump(config));
}
