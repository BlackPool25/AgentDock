import { randomUUID } from "crypto";
import type { WorkflowConfig } from "@agentdock/config-schema";
import { wsHub } from "../api/websocket/hub.js";
import { logger } from "../logger.js";

const AGENT_PORT = 8080;
const SYSTEM_ID = process.env.SYSTEM_ID ?? "unknown";
const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendTask(
  toAgentId: string,
  instruction: string,
  context: Record<string, unknown> = {},
  attachedFiles: { filename: string; content: string; mimeType: string }[] = [],
): Promise<void> {
  const taskId = randomUUID();
  const url = `http://${toAgentId}:${AGENT_PORT}/tasks`;
  const body = JSON.stringify({ taskId, senderId: "orchestrator", instruction, context, attachedFiles });

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 202) {
        wsHub.broadcast({ type: "agent:task:started", agentId: toAgentId, systemId: SYSTEM_ID, taskId, timestamp: new Date().toISOString() } as any);
        logger.info({ toAgentId, taskId, attempt }, "task.delivered");
        return;
      }
      throw new Error(`Agent returned ${res.status}`);
    } catch (err) {
      if (attempt === RETRY_DELAYS.length) {
        logger.error({ toAgentId, taskId, err }, "task.delivery_failed");
        wsHub.broadcast({ type: "agent:task:failed", agentId: toAgentId, systemId: SYSTEM_ID, taskId, error: String(err), timestamp: new Date().toISOString() } as any);
        return;
      }
      const delay = RETRY_DELAYS[attempt] ?? 16000;
      logger.warn({ toAgentId, taskId, attempt, delay }, "task.delivery_retry");
      await sleep(delay);
    }
  }
}

function mapData(source: any, mapping: Array<{ from: string; to: string }>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const m of mapping) {
    const value = getNested(source, m.from);
    if (value !== undefined) setNested(result, m.to, value);
  }
  return result;
}

function getNested(obj: any, path: string): any {
  return path.split(".").reduce((o, key) => (o && o[key] !== undefined ? o[key] : undefined), obj);
}

function setNested(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  const lastKey = keys.pop()!;
  const target = keys.reduce((o, key) => (o[key] = o[key] || {}), obj);
  target[lastKey] = value;
}

export async function handleTaskCompletion(
  fromAgentId: string,
  taskId: string,
  output: string,
  workflow: WorkflowConfig,
  actionName?: string,
): Promise<void> {
  wsHub.broadcast({ type: "agent:task:completed", agentId: fromAgentId, systemId: SYSTEM_ID, taskId, output, timestamp: new Date().toISOString() } as any);

  for (const conn of workflow.connections) {
    if (conn.from !== fromAgentId || conn.trigger.type !== "task_completion") continue;
    // Bug 1 fix: action_filter — only fire when completed action matches
    const filter = (conn.trigger as any).action_filter as string | undefined;
    if (filter && filter !== actionName) continue;

    const sourceContext = { output, actionName, taskId, agentId: fromAgentId };
    const mappedContext = mapData(sourceContext, conn.data_mapping || []);

    const instruction = (conn.trigger as any).pass_output
      ? `Process this output from ${fromAgentId}:\n\n${output}`
      : `${fromAgentId} completed a task. Begin your work.`;
    
    await sendTask(conn.to, instruction, { ...mappedContext, sourceTaskId: taskId, sourceAgentId: fromAgentId });
  }
}

export async function handleFileWritten(
  fromAgentId: string,
  filename: string,
  content: string,
  workflow: WorkflowConfig,
): Promise<void> {
  wsHub.broadcast({ type: "agent:memory:updated", agentId: fromAgentId, systemId: SYSTEM_ID, file: filename, timestamp: new Date().toISOString() } as any);

  for (const conn of workflow.connections) {
    if (conn.from !== fromAgentId || conn.trigger.type !== "file_received") continue;
    const pattern = (conn.trigger as any).file_pattern ?? "*";
    if (!matchesPattern(filename, pattern)) continue;

    const sourceContext = { filename, content, agentId: fromAgentId };
    const mappedContext = mapData(sourceContext, conn.data_mapping || []);

    logger.info({ from: fromAgentId, to: conn.to, filename }, "file_received.trigger");
    await sendTask(
      conn.to,
      `File received from ${fromAgentId}: ${filename}`,
      { ...mappedContext, sourceAgentId: fromAgentId, filename },
      [{ filename, content: Buffer.from(content).toString("base64"), mimeType: "text/plain" }],
    );
  }
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern === "*") return true;
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
  return regex.test(filename);
}
