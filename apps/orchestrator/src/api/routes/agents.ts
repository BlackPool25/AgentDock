import { Hono } from "hono";
import { proxyToAgent } from "../../proxy/agent-proxy.js";
import { loadAgentConfig, saveAgentConfig } from "../../workflow/parser.js";
import { AgentConfigSchema } from "@agentdock/config-schema";

export const agentRoutes = new Hono();

// Proxy all agent sub-paths
agentRoutes.all("/:agentId/:rest{.*}", proxyToAgent);

// Config management (JWT-protected at router level)
agentRoutes.get("/:agentId/config", (c) => {
  try {
    return c.json(loadAgentConfig(c.req.param("agentId")));
  } catch {
    return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
  }
});

agentRoutes.put("/:agentId/config", async (c) => {
  const body = await c.req.json();
  const parsed = AgentConfigSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.message, code: "VALIDATION_ERROR" }, 400);
  }
  saveAgentConfig(parsed.data);
  // TODO: trigger hot-reload
  return c.json(parsed.data);
});
