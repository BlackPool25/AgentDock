import { Cron } from "croner";
import { randomUUID } from "crypto";
import type { WorkflowConfig } from "../config/loader.js";
import { wsHub } from "../api/websocket/hub.js";
import { logger } from "../logger.js";

const AGENT_PORT = 8080;
const SYSTEM_ID = process.env.SYSTEM_ID ?? "unknown";

async function sendTask(
  toAgentId: string,
  instruction: string,
  context: Record<string, unknown> = {},
  attachedFiles: { filename: string; content: string; mimeType: string }[] = []
) {
  const taskId = randomUUID();
  const url = `http://${toAgentId}:${AGENT_PORT}/tasks`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, senderId: "orchestrator", instruction, context, attachedFiles }),
    });
    wsHub.broadcast({ type: "agent:task:started", agentId: toAgentId, systemId: SYSTEM_ID, taskId, timestamp: new Date().toISOString() });
    logger.info({ toAgentId, taskId }, "Task dispatched");
  } catch (err) {
    logger.error({ toAgentId, taskId, err }, "Failed to dispatch task");
  }
}

const cronJobs: Cron[] = [];
const memoryPollers: ReturnType<typeof setInterval>[] = [];

export function startTriggers(workflow: WorkflowConfig) {
  for (const conn of workflow.connections) {
    const { trigger, to } = conn;

    if (trigger.type === "cron" && trigger.schedule) {
      const job = new Cron(trigger.schedule, { timezone: trigger.timezone ?? "UTC" }, () => {
        logger.info({ to, schedule: trigger.schedule }, "Cron trigger fired");
        sendTask(to, `Scheduled task: ${trigger.schedule}`);
      });
      cronJobs.push(job);
      logger.info({ to, schedule: trigger.schedule }, "Cron trigger registered");
    }

    if (trigger.type === "memory_condition" && trigger.file && trigger.contains) {
      // Poll the source agent's memory API — avoids needing direct volume access
      const interval = (trigger.check_interval_seconds ?? 30) * 1000;
      const poller = setInterval(async () => {
        try {
          const res = await fetch(
            `http://${conn.from}:${AGENT_PORT}/memory/${trigger.file}`,
            { signal: AbortSignal.timeout(5000) }
          );
          if (!res.ok) return;
          const { content } = await res.json() as { content: string };
          if (content.includes(trigger.contains!)) {
            logger.info({ from: conn.from, to, file: trigger.file }, "Memory condition met");
            sendTask(to, `Memory condition triggered: ${trigger.file} contains '${trigger.contains}'`, {
              sourceAgentId: conn.from,
              triggerFile: trigger.file,
            });
          }
        } catch {
          // Agent not ready yet — normal during startup
        }
      }, interval);
      memoryPollers.push(poller);
      logger.info({ from: conn.from, to, file: trigger.file }, "Memory condition poller registered");
    }

    // file_received: handled via internal events from agents (see handleFileWritten below)
  }
}

export function stopTriggers() {
  for (const job of cronJobs) job.stop();
  for (const poller of memoryPollers) clearInterval(poller);
}

// Called when an agent completes a task
export async function handleTaskCompletion(
  fromAgentId: string,
  taskId: string,
  output: string,
  workflow: WorkflowConfig
) {
  wsHub.broadcast({
    type: "agent:task:completed",
    agentId: fromAgentId,
    systemId: SYSTEM_ID,
    taskId,
    output,
    timestamp: new Date().toISOString(),
  });

  for (const conn of workflow.connections) {
    if (conn.from === fromAgentId && conn.trigger.type === "task_completion") {
      const instruction = conn.trigger.pass_output
        ? `Process this output from ${fromAgentId}:\n\n${output}`
        : `${fromAgentId} completed a task. Begin your work.`;
      await sendTask(conn.to, instruction, { sourceTaskId: taskId, sourceAgentId: fromAgentId });
    }
  }
}

// Called when an agent writes a file to its memory (agent posts agent:memory:written event)
export async function handleFileWritten(
  fromAgentId: string,
  filename: string,
  content: string,
  workflow: WorkflowConfig
) {
  wsHub.broadcast({
    type: "agent:memory:updated",
    agentId: fromAgentId,
    systemId: SYSTEM_ID,
    file: filename,
    timestamp: new Date().toISOString(),
  });

  for (const conn of workflow.connections) {
    if (conn.from !== fromAgentId || conn.trigger.type !== "file_received") continue;
    const pattern = conn.trigger.file_pattern ?? "*";
    if (!matchesPattern(filename, pattern)) continue;

    logger.info({ from: fromAgentId, to: conn.to, filename }, "file_received trigger fired");
    await sendTask(
      conn.to,
      `File received from ${fromAgentId}: ${filename}`,
      { sourceAgentId: fromAgentId, filename },
      [{ filename, content: Buffer.from(content).toString("base64"), mimeType: "text/plain" }]
    );
  }
}

function matchesPattern(filename: string, pattern: string): boolean {
  if (pattern === "*") return true;
  // Simple glob: only supports * wildcard
  const regex = new RegExp("^" + pattern.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$");
  return regex.test(filename);
}
