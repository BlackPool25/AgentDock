import { Hono } from "hono";
import { proxyToAgent } from "../../proxy/agent-proxy.js";
import { restartAgent } from "../../docker/agent-manager.js";
import type { SystemConfig } from "../../config/loader.js";
import { logger } from "../../logger.js";

export function createAgentRoutes(config: SystemConfig) {
  const app = new Hono();

  // POST /api/agents/:id/reload — hot-reload agent config
  app.post("/:id/reload", async (c) => {
    const agentId = c.req.param("id");
    if (!config.agents.has(agentId)) {
      return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
    }
    try {
      await restartAgent(agentId);
      logger.info({ agentId }, "Agent hot-reloaded");
      return c.json({ ok: true, agentId });
    } catch (err) {
      logger.error({ agentId, err }, "Hot-reload failed");
      return c.json({ error: "Reload failed", code: "RELOAD_FAILED" }, 500);
    }
  });

  // All other agent endpoints — proxy with expose[] gating
  app.all("/:id/*", async (c) => {
    const agentId = c.req.param("id");
    const agentConfig = config.agents.get(agentId);
    if (!agentConfig) {
      return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
    }
    // Extract path after /api/agents/:id/
    const fullPath = c.req.path;
    const prefix = `/api/agents/${agentId}/`;
    const agentPath = fullPath.startsWith(prefix) ? fullPath.slice(prefix.length) : fullPath;
    return proxyToAgent(c, agentId, agentPath, agentConfig);
  });

  return app;
}
