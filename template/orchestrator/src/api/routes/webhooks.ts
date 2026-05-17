import { Hono } from "hono";
import { randomUUID } from "crypto";
import { logger } from "../../logger.js";
import type { SystemConfig } from "../../config/loader.js";

const AGENT_PORT = 8080;

export function createWebhookRoutes(config: SystemConfig) {
  const app = new Hono();

  // POST /webhooks/:agentId — trigger an agent via webhook
  app.post("/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    if (!config.agents.has(agentId)) {
      return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
    }

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const taskId = randomUUID();

    try {
      await fetch(`http://${agentId}:${AGENT_PORT}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId,
          senderId: "webhook",
          instruction: (body.instruction as string) ?? "Webhook triggered",
          context: body.payload ?? body,
        }),
      });
      logger.info({ agentId, taskId }, "Webhook trigger dispatched");
      return c.json({ ok: true, taskId });
    } catch (err) {
      logger.error({ agentId, err }, "Webhook dispatch failed");
      return c.json({ error: "Agent unreachable", code: "AGENT_UNREACHABLE" }, 502);
    }
  });

  return app;
}
