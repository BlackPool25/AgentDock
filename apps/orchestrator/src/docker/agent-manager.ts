import { logger } from "../logger.js";

const AGENT_PORT = 8080;

export async function getAgentStatus(agentId: string): Promise<"running" | "stopped" | "error"> {
  try {
    const res = await fetch(`http://${agentId}:${AGENT_PORT}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "running" : "error";
  } catch {
    return "stopped";
  }
}

export async function restartAgent(agentId: string): Promise<void> {
  // In docker-compose runtime, agents are restarted via docker compose restart
  // This is a no-op here — hot-reload is handled by the orchestrator
  logger.info({ agentId }, "Agent reload requested (use docker compose restart)");
}
