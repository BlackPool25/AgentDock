import { Hono } from "hono";
import { validateApiKey } from "../../auth/jwt.js";
import { logger } from "../../logger.js";
import { loadAgentConfig } from "../../workflow/parser.js";

export function createWebhookRoutes(config: any) {
  const app = new Hono();

  app.post("/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const secret = c.req.query("secret") || c.req.header("x-webhook-secret");
    const configuredSecret = process.env.WEBHOOK_SECRET || process.env.JWT_SECRET;

    if (!configuredSecret) {
      logger.error("No WEBHOOK_SECRET or JWT_SECRET configured. Webhooks are disabled for security.");
      return c.json({ error: "Webhooks misconfigured", code: "MISCONFIGURED" }, 500);
    }

    if (!secret || secret !== configuredSecret) {
      return c.json({ error: "Invalid webhook secret", code: "UNAUTHORIZED" }, 401);
    }

    const agentConfig = config.agents.get(agentId);
    if (!agentConfig) {
      return c.json({ error: `Agent '${agentId}' not found`, code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const target = `http://${agentId}:8080/tasks`;

    let actionName: string | undefined;
    try {
      const trigger = agentConfig.triggers?.find((t: any) => t.type === "webhook");
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
