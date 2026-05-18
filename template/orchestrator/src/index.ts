import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { upgradeWebSocket, websocket } from "hono/bun";
import { randomUUID } from "crypto";
import { logger } from "./logger.js";
import { loadConfig } from "./config/loader.js";
import { wsHub } from "./api/websocket/hub.js";
import { createAgentRoutes } from "./api/routes/agents.js";
import { createSystemRoutes } from "./api/routes/system.js";
import { createWebhookRoutes } from "./api/routes/webhooks.js";
import { startTriggers, handleTaskCompletion, handleFileWritten } from "./trigger/manager.js";
import { getAgentStatus } from "./docker/agent-manager.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me";
const PORT = parseInt(process.env.ORCHESTRATOR_PORT ?? "4000");
const SYSTEM_ID = process.env.SYSTEM_ID ?? "unknown";

// ── Load config ───────────────────────────────────────────────────────────────
const config = loadConfig();

// ── Start triggers ────────────────────────────────────────────────────────────
startTriggers(config.workflow);

const app = new Hono();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));

// ── Public routes ─────────────────────────────────────────────────────────────
app.get("/health", async (c) => {
  const agentNames = (process.env.AGENT_NAMES ?? "").split(",").filter(Boolean);
  const statuses = await Promise.all(
    agentNames.map(async (id) => ({ id, status: await getAgentStatus(id) }))
  );
  const allOk = statuses.every((s) => s.status === "running");
  return c.json({ status: allOk ? "ok" : "degraded", systemId: SYSTEM_ID, agents: statuses });
});

// ── Internal events from agents ───────────────────────────────────────────────
app.post("/internal/events", async (c) => {
  const event = await c.req.json() as {
    type: string;
    agentId: string;
    taskId?: string;
    output?: string;
    [key: string]: unknown;
  };
  wsHub.broadcast({ ...event, systemId: SYSTEM_ID, timestamp: new Date().toISOString() });

  if (event.type === "agent:task:completed" && event.taskId && event.output) {
    await handleTaskCompletion(event.agentId, event.taskId, event.output as string, config.workflow, event.actionName as string | undefined);
  }

  if (event.type === "agent:memory:written" && event.filename && event.content !== undefined) {
    await handleFileWritten(event.agentId, event.filename as string, event.content as string, config.workflow);
  }

  return c.json({ ok: true });
});

// ── Webhooks (public — authenticated by agent ID) ─────────────────────────────
app.route("/webhooks", createWebhookRoutes(config));

// ── JWT-protected routes ──────────────────────────────────────────────────────
app.use("/api/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));
app.route("/api/agents", createAgentRoutes(config));
app.route("/api/system", createSystemRoutes(config));

// ── WebSocket ─────────────────────────────────────────────────────────────────
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const clientId = randomUUID();
    return {
      onOpen(_event, ws) {
        wsHub.add(clientId, ws as unknown as { send: (d: string) => void; readyState: number });
        logger.info({ clientId }, "WS client connected");
      },
      onClose() {
        wsHub.remove(clientId);
        logger.info({ clientId }, "WS client disconnected");
      },
      onError() {
        wsHub.remove(clientId);
      },
    };
  })
);

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  // hono/jwt throws HTTPException with status 401 on invalid/missing token
  const status = (err as { status?: number }).status;
  if (status === 401) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

logger.info({ port: PORT, systemId: SYSTEM_ID }, "Runtime orchestrator starting");

export default { port: PORT, fetch: app.fetch, websocket };
