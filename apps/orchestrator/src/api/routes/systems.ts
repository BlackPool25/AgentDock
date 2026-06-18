import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { loadAllWorkflows, loadAgentConfig } from "../../workflow/parser.js";
import { ensureNetwork, removeNetwork } from "../../docker/network-manager.js";
import { spawnAgent, stopAgent, listSystemContainers } from "../../docker/container-manager.js";
import { wsHub } from "../websocket/hub.js";
import { logger } from "../../logger.js";

export const systemRoutes = new Hono();

systemRoutes.get("/", (c) => {
  const workflows = loadAllWorkflows();
  return c.json(workflows.map((w) => ({
    id: w.system.id,
    name: w.workflow.name,
    workflowId: w.workflow.id,
    agentCount: w.agents.length,
  })));
});

systemRoutes.get("/:id/agents", async (c) => {
  const systemId = c.req.param("id");
  const containers = await listSystemContainers(systemId);
  return c.json(containers.map((ct) => ({
    id: ct.Labels?.["agentdock.agent"],
    containerId: ct.Id,
    status: ct.State,
    name: ct.Names[0],
  })));
});

systemRoutes.post("/:id/start", async (c) => {
  const systemId = c.req.param("id");
  const workflows = loadAllWorkflows();
  const workflow = workflows.find((w) => w.system.id === systemId);
  if (!workflow) return c.json({ error: "System not found", code: "NOT_FOUND" }, 404);

  await ensureNetwork(systemId);

  const peerAgents = workflow.agents.map((a: any) => ({
    id: a.ref,
    url: `http://agentdock-${systemId}-${a.ref}:8080`,
  }));

  const results: Array<{ agentId: string; status: string; error?: string }> = [];
  for (const agentRef of workflow.agents) {
    try {
      const agentConfig = loadAgentConfig(agentRef.ref);
      await spawnAgent(agentConfig, systemId, peerAgents);
      wsHub.broadcast({
        type: "agent:status",
        agentId: agentRef.ref,
        systemId,
        status: "running",
        timestamp: new Date().toISOString(),
      });
      results.push({ agentId: agentRef.ref, status: "started" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ agentId: agentRef.ref, err: msg }, "Failed to spawn agent");
      results.push({ agentId: agentRef.ref, status: "error", error: msg });
    }
  }

  wsHub.broadcast({
    type: "system:status",
    systemId,
    status: results.every((r) => r.status === "started") ? "running" : "partial",
    timestamp: new Date().toISOString(),
  });

  return c.json({ systemId, results });
});

systemRoutes.post("/:id/stop", async (c) => {
  const systemId = c.req.param("id");
  const containers = await listSystemContainers(systemId);
  for (const ct of containers) {
    const agentId = ct.Labels?.["agentdock.agent"];
    if (agentId) await stopAgent(systemId, agentId);
  }
  wsHub.broadcast({
    type: "system:status",
    systemId,
    status: "stopped",
    timestamp: new Date().toISOString(),
  });
  return c.json({ ok: true });
});

systemRoutes.delete("/:id", async (c) => {
  const systemId = c.req.param("id");
  const containers = await listSystemContainers(systemId);
  for (const ct of containers) {
    const agentId = ct.Labels?.["agentdock.agent"];
    if (agentId) await stopAgent(systemId, agentId);
  }
  await removeNetwork(systemId);
  return c.json({ ok: true });
});
