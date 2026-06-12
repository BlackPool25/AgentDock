import { Hono } from "hono";
import { proxyToAgent } from "../../proxy/agent-proxy.js";
import { loadAgentConfig, saveAgentConfig } from "../../workflow/parser.js";

export function createAgentRoutes(config: any) {
  const app = new Hono();

  app.all("/:agentId/:rest{.*}", async (c) => {
    const agentId = c.req.param("agentId");
    const rest = c.req.param("rest");
    const agentConfig = config.agents.get(agentId);
    if (!agentConfig) {
      return c.json({ error: `Agent '${agentId}' not found`, code: "NOT_FOUND" }, 404);
    }
    return proxyToAgent(c, agentId, rest, agentConfig);
  });

  app.get("/:agentId/config", (c) => {
    try {
      return c.json(loadAgentConfig(c.req.param("agentId")));
    } catch {
      return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
    }
  });

  app.put("/:agentId/config", async (c) => {
    const body = await c.req.json();
    saveAgentConfig(body);
    return c.json(body);
  });

  return app;
}
