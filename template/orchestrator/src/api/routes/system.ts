import { Hono } from "hono";
import { getAgentStatus } from "../../docker/agent-manager.js";
import type { SystemConfig } from "../../config/loader.js";

export function createSystemRoutes(config: SystemConfig) {
  const app = new Hono();

  app.get("/status", async (c) => {
    const agentStatuses = await Promise.all(
      [...config.agents.keys()].map(async (id) => ({
        id,
        name: config.agents.get(id)!.agent.name,
        status: await getAgentStatus(id),
      }))
    );
    const allRunning = agentStatuses.every((a) => a.status === "running");
    const anyRunning = agentStatuses.some((a) => a.status === "running");
    return c.json({
      systemId: process.env.SYSTEM_ID,
      status: allRunning ? "running" : anyRunning ? "partial" : "stopped",
      agents: agentStatuses,
    });
  });

  return app;
}
