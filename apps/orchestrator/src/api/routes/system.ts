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

  app.get("/topology", (c) => {
    const agentsList = [];
    const workflowAgents = (config.workflow as any).agents || [];
    for (const wa of workflowAgents) {
      const agentId = wa.ref || wa.id;
      const details = config.agents.get(agentId) || {};
      agentsList.push({
        id: agentId,
        name: details.agent?.name || agentId,
        type: details.agent?.type || "unknown",
        description: details.agent?.description || "",
        model: details.agent?.model || "",
        x: wa.position?.x ?? 100,
        y: wa.position?.y ?? 100,
      });
    }

    const connectionsList = (config.workflow.connections || []).map((conn, idx) => ({
      id: (conn as any).id || `conn-${idx}`,
      from: conn.from,
      to: conn.to,
      active: false,
      filePattern: (conn.trigger as any).file_pattern || (conn.trigger as any).filePattern || "",
    }));

    return c.json({
      systemId: process.env.SYSTEM_ID ?? config.workflow.id ?? "unknown",
      agents: agentsList,
      connections: connectionsList,
    });
  });

  return app;
}
