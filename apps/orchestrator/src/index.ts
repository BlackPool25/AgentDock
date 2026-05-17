import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { upgradeWebSocket, websocket } from "hono/bun";
import { randomUUID } from "crypto";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { verifyDockerConnection } from "./docker/client.js";
import { wsHub } from "./api/websocket/hub.js";
import { authRoutes } from "./api/routes/auth.js";
import { systemRoutes } from "./api/routes/systems.js";
import { workflowRoutes } from "./api/routes/workflows.js";
import { agentRoutes } from "./api/routes/agents.js";
import { webhookRoutes } from "./api/routes/webhooks.js";
import type { AgentEvent } from "@agentdock/shared-types";

const app = new Hono();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));

// ─── Public routes ────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", systemId: env.SYSTEM_ID }));
app.route("/api/auth", authRoutes);
app.route("/webhooks", webhookRoutes);

// ─── Internal events from agents ──────────────────────────────────────────────
app.post("/internal/events", async (c) => {
  const event = await c.req.json() as AgentEvent;
  wsHub.broadcast(event);
  return c.json({ ok: true });
});

// ─── JWT-protected routes ─────────────────────────────────────────────────────
app.use("/api/systems/*", jwt({ secret: env.JWT_SECRET, alg: "HS256" }));
app.use("/api/workflows/*", jwt({ secret: env.JWT_SECRET, alg: "HS256" }));
app.use("/api/agents/*", jwt({ secret: env.JWT_SECRET, alg: "HS256" }));

app.route("/api/systems", systemRoutes);
app.route("/api/workflows", workflowRoutes);
app.route("/api/agents", agentRoutes);

// ─── WebSocket ────────────────────────────────────────────────────────────────
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const clientId = randomUUID();
    return {
      onOpen(_event, ws) {
        wsHub.add(clientId, ws as unknown as { send: (d: string) => void; readyState: number });
      },
      onClose() {
        wsHub.remove(clientId);
      },
      onError(event) {
        logger.error({ clientId, event }, "WS error");
        wsHub.remove(clientId);
      },
    };
  })
);

// ─── Error handler ────────────────────────────────────────────────────────────
app.onError((err, c) => {
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

// ─── Startup ──────────────────────────────────────────────────────────────────
await verifyDockerConnection();
logger.info({ port: env.ORCHESTRATOR_PORT }, "Orchestrator starting");

export default {
  port: env.ORCHESTRATOR_PORT,
  fetch: app.fetch,
  websocket,
};
