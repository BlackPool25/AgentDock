import { Hono } from "hono";
import { validateApiKey } from "../../auth/jwt.js";
import { containerName } from "../../docker/container-manager.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";

export const webhookRoutes = new Hono();

webhookRoutes.post("/:apiKey", async (c) => {
  const apiKey = c.req.param("apiKey");
  const keyData = validateApiKey(apiKey);
  if (!keyData) {
    return c.json({ error: "Invalid API key", code: "UNAUTHORIZED" }, 401);
  }

  const body = await c.req.json();
  const target = `http://${containerName(env.SYSTEM_ID, keyData.agentId)}:8080/tasks`;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        senderId: "webhook",
        instruction: body.event ?? "Webhook triggered",
        context: body.payload ?? {},
      }),
    });
    return c.json({ ok: res.ok });
  } catch (err) {
    logger.error({ agentId: keyData.agentId, err }, "Webhook delivery failed");
    return c.json({ error: "Agent unreachable", code: "PROXY_ERROR" }, 502);
  }
});
