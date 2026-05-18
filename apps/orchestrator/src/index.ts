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
import { loadAllWorkflows } from "./workflow/parser.js";
import { handleTaskCompletion, handleFileWritten } from "./trigger/manager.js";

const app = new Hono();

app.use("*", cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"] }));

// ─── Public routes ────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", systemId: env.SYSTEM_ID }));
app.route("/api/auth", authRoutes);
app.route("/webhooks", webhookRoutes);

// ─── Internal events from agents ─────────────────────────────────────────────
app.post("/internal/events", async (c) => {
  const event = await c.req.json() as {
    type: string;
    agentId: string;
    taskId?: string;
    output?: string;
    filename?: string;
    content?: string;
    actionName?: string;
    [key: string]: unknown;
  };

  // Fan out to WebSocket clients
  wsHub.broadcast(event as any);

  // Load all workflows to find matching triggers
  const workflows = loadAllWorkflows();

  if (event.type === "agent:task:completed" && event.taskId && event.output !== undefined) {
    for (const wf of workflows) {
      await handleTaskCompletion(event.agentId, event.taskId, event.output as string, wf, event.actionName);
    }
  }

  if (event.type === "agent:memory:written" && event.filename && event.content !== undefined) {
    for (const wf of workflows) {
      await handleFileWritten(event.agentId, event.filename as string, event.content as string, wf);
    }
  }

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
      onClose() { wsHub.remove(clientId); },
      onError() { wsHub.remove(clientId); },
    };
  }),
);

// ─── Error handler — Bug 5 fix: JWT 401 must not return 500 ──────────────────
app.onError((err, c) => {
  const status = (err as { status?: number }).status;
  if (status === 401) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

// ─── Startup ──────────────────────────────────────────────────────────────────
await verifyDockerConnection();
logger.info({ port: env.ORCHESTRATOR_PORT }, "Orchestrator starting");

export default { port: env.ORCHESTRATOR_PORT, fetch: app.fetch, websocket };
