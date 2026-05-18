import { Hono } from "hono";
import { validateApiKey } from "../../auth/jwt.js";
import { containerName } from "../../docker/container-manager.js";
import { env } from "../../config/env.js";
import { logger } from "../../logger.js";
import { loadAgentConfig } from "../../workflow/parser.js";

export const webhookRoutes = new Hono();

webhookRoutes.post("/:apiKey", async (c) => {
  const apiKey = c.req.param("apiKey");
  const keyData = validateApiKey(apiKey);
  if (!keyData) {
    return c.json({ error: "Invalid API key", code: "UNAUTHORIZED" }, 401);
  }

  const agentId = keyData.agentId;
  const body = await c.req.json();
  const target = `http://${containerName(env.SYSTEM_ID, agentId)}:8080/tasks`;

  // Find if this agent has a webhook trigger with an explicit action
  let actionName: string | undefined;
  try {
    const config = loadAgentConfig(agentId);
    const trigger = config.triggers.find(t => t.type === "webhook");
    if (trigger && "actionName" in trigger) {
      actionName = trigger.actionName;
    }
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
