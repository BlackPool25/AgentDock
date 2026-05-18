import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { upgradeWebSocket, websocket } from "hono/bun";
import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
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

// ── Build expose map: agentId → Set<expose option> ───────────────────────────
function buildExposeMap(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [agentId, agentConfig] of config.agents) {
    map.set(agentId, new Set(agentConfig.expose));
  }
  return map;
}

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
// This endpoint is internal-only (not exposed to host). Agents post events here.
app.post("/internal/events", async (c) => {
  const event = await c.req.json() as {
    type: string;
    agentId: string;
    taskId?: string;
    output?: string;
    content?: string;
    [key: string]: unknown;
  };

  // Process triggers FIRST (needs full data including content/output)
  if (event.type === "agent:task:completed" && event.taskId && event.output) {
    await handleTaskCompletion(
      event.agentId,
      event.taskId,
      event.output as string,
      config.workflow,
      event.actionName as string | undefined,
    );
  }

  if (event.type === "agent:memory:written" && event.filename && event.content !== undefined) {
    await handleFileWritten(
      event.agentId,
      event.filename as string,
      event.content as string,
      config.workflow,
    );
  }

  // Broadcast to WebSocket clients — strip sensitive content fields
  // WS clients only need metadata, not full file content or task output
  const wsEvent: Record<string, unknown> = {
    ...event,
    systemId: SYSTEM_ID,
    timestamp: new Date().toISOString(),
  };
  // Strip content from memory:written (downstream agents get it via file_received trigger, not WS)
  if (wsEvent.type === "agent:memory:written") {
    delete wsEvent.content;
    wsEvent.contentPreview = (event.content as string)?.slice(0, 200) + "...";
  }
  // Strip output from task:completed (use task:completed metadata only, fetch full output via API)
  if (wsEvent.type === "agent:task:completed") {
    delete wsEvent.output;
    wsEvent.outputPreview = (event.output as string)?.slice(0, 200) + "...";
  }
  wsHub.broadcast(wsEvent);

  return c.json({ ok: true });
});

// ── Auth — login to get a JWT ─────────────────────────────────────────────────
app.post("/auth/login", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { password?: string };
  const API_PASSWORD = process.env.API_PASSWORD ?? JWT_SECRET;
  if (!body.password || body.password !== API_PASSWORD) {
    return c.json({ error: "Invalid password" }, 401);
  }
  const secret = new TextEncoder().encode(JWT_SECRET);
  const token = await new SignJWT({ sub: "admin", systemId: SYSTEM_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
  return c.json({ token, expiresIn: "24h" });
});

// ── Webhooks (public — no JWT, but validated against agent's input schema) ────
app.route("/webhooks", createWebhookRoutes(config));

// ── JWT-protected routes ──────────────────────────────────────────────────────
app.use("/api/*", jwt({ secret: JWT_SECRET, alg: "HS256" }));
app.route("/api/agents", createAgentRoutes(config));
app.route("/api/system", createSystemRoutes(config));

// ── WebSocket — requires JWT as query param ───────────────────────────────────
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const clientId = randomUUID();
    let authenticated = false;

    return {
      async onOpen(_event, ws) {
        // Verify JWT from query param: /ws?token=<jwt>
        const token = new URL(c.req.url, "http://localhost").searchParams.get("token");
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Missing token" }));
          ws.close();
          return;
        }
        try {
          const secret = new TextEncoder().encode(JWT_SECRET);
          await jwtVerify(token, secret);
          authenticated = true;
          const exposeMap = buildExposeMap();
          wsHub.add(clientId, ws as unknown as { send: (d: string) => void; readyState: number }, exposeMap);
          ws.send(JSON.stringify({ type: "connected", clientId, systemId: SYSTEM_ID }));
          logger.info({ clientId }, "WS client authenticated");
        } catch {
          ws.send(JSON.stringify({ type: "error", message: "Invalid token" }));
          ws.close();
        }
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
  const status = (err as { status?: number }).status;
  if (status === 401) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

logger.info({ port: PORT, systemId: SYSTEM_ID }, "Runtime orchestrator starting");

export default { port: PORT, fetch: app.fetch, websocket };
