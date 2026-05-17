import { Cron } from "croner";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import type { WorkflowConfig } from "../config/loader.js";
import { wsHub } from "../api/websocket/hub.js";
import { logger } from "../logger.js";

const AGENT_PORT = 8080;
const SYSTEM_ID = process.env.SYSTEM_ID ?? "unknown";
const CONFIGS_DIR = process.env.CONFIGS_DIR ?? "/app/configs";

async function sendTask(toAgentId: string, instruction: string, context: Record<string, unknown> = {}) {
  const taskId = randomUUID();
  const url = `http://${toAgentId}:${AGENT_PORT}/tasks`;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, senderId: "orchestrator", instruction, context }),
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
        sendTask(to, `Scheduled task from cron: ${trigger.schedule}`);
      });
      cronJobs.push(job);
      logger.info({ to, schedule: trigger.schedule }, "Cron trigger registered");
    }

    if (trigger.type === "memory_condition" && trigger.file && trigger.contains) {
      const interval = (trigger.check_interval_seconds ?? 30) * 1000;
      const poller = setInterval(() => {
        try {
          const filePath = join(CONFIGS_DIR, "..", "memory", conn.from, trigger.file!);
          const content = readFileSync(filePath, "utf8");
          if (content.includes(trigger.contains!)) {
            logger.info({ from: conn.from, to, file: trigger.file }, "Memory condition met");
            sendTask(to, `Memory condition triggered: ${trigger.file} contains '${trigger.contains}'`);
          }
        } catch {
          // File doesn't exist yet — normal
        }
      }, interval);
      memoryPollers.push(poller);
    }
  }
}

export function stopTriggers() {
  for (const job of cronJobs) job.stop();
  for (const poller of memoryPollers) clearInterval(poller);
}

// Called by agents via POST /internal/events when they complete a task
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

  // Find connections triggered by this agent's task completion
  for (const conn of workflow.connections) {
    if (conn.from === fromAgentId && conn.trigger.type === "task_completion") {
      const instruction = conn.trigger.pass_output
        ? `Process this output from ${fromAgentId}: ${output}`
        : `${fromAgentId} completed a task. Begin your work.`;
      await sendTask(conn.to, instruction, { sourceTaskId: taskId, sourceAgentId: fromAgentId });
    }
  }
}
