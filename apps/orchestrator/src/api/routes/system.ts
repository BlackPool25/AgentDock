import { Hono } from "hono";
import type { SystemConfig } from "../../config/loader.js";
import { getAgentStatus } from "../../docker/agent-manager.js";

export function createSystemRoutes(config: SystemConfig) {
  const app = new Hono();

  app.get("/status", async (c) => {
    const agentIds = [...config.agents.keys()];
    const statuses = await Promise.all(
      agentIds.map(async (id) => ({
        id,
        status: await getAgentStatus(id),
      }))
    );
    const allRunning = statuses.every((s) => s.status === "running");
    return c.json({
      systemId: process.env.SYSTEM_ID ?? "unknown",
      status: allRunning ? "running" : "partial",
      agents: statuses,
    });
  });

  return app;
}
