import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

export function loadWorkflow(id: string): any {
  const path = join(env.CONFIGS_DIR, "workflow.yaml");
  const raw = yaml.load(readFileSync(path, "utf-8")) as any;
  return raw?.workflow ?? raw;
}

export function loadAllWorkflows(): any[] {
  const path = join(env.CONFIGS_DIR, "workflow.yaml");
  if (!existsSync(path)) return [];
  try { return [loadWorkflow("")]; } catch { return []; }
}

export function loadAgentConfig(id: string): any {
  const path = join(env.CONFIGS_DIR, "agents", `${id}.yaml`);
  const raw = yaml.load(readFileSync(path, "utf-8")) as any;
  return raw;
}

export function saveAgentConfig(config: any): void {
  const dir = join(env.CONFIGS_DIR, "agents");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${config.agent.id}.yaml`), yaml.dump(config));
}

export function saveWorkflow(config: any): void {
  mkdirSync(env.CONFIGS_DIR, { recursive: true });
  writeFileSync(join(env.CONFIGS_DIR, "workflow.yaml"), yaml.dump(config));
}
