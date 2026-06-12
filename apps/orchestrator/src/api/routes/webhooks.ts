import { Hono } from "hono";
import { validateApiKey } from "../../auth/jwt.js";
import { logger } from "../../logger.js";
import { loadAgentConfig } from "../../workflow/parser.js";

export function createWebhookRoutes(_config: any) {
  const app = new Hono();

  app.post("/:apiKey", async (c) => {
    const apiKey = c.req.param("apiKey");
    const keyData = validateApiKey(apiKey);
    if (!keyData) {
      return c.json({ error: "Invalid API key", code: "UNAUTHORIZED" }, 401);
    }

    const agentId = keyData.agentId;
    const body = await c.req.json();
    const target = `http://${agentId}:8080/tasks`;

    let actionName: string | undefined;
    try {
      const config = loadAgentConfig(agentId);
      const trigger = config?.agent?.triggers?.find((t: any) => t.type === "webhook");
      if (trigger?.actionName) actionName = trigger.actionName;
    } catch (err) {
      logger.warn({ agentId, err }, "Could not load agent config for webhook context");
    }

    try {
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId: "webhook",
          instruction: body.instruction || body.event || "Webhook triggered",
          actionName,
          context: body.payload || body,
        }),
      });
      return c.json({ ok: res.ok, taskId: (await res.json() as any)?.taskId });
    } catch (err) {
      logger.error({ agentId, err }, "Webhook delivery failed");
      return c.json({ error: "Agent unreachable", code: "PROXY_ERROR" }, 502);
    }
  });

  return app;
}
