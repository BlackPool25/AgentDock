import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { logger } from "./logger.js";
import { authRoutes } from "./api/routes/auth.js";
import { systemRoutes } from "./api/routes/systems.js";
import { generateRoutes } from "./api/routes/generate.js";
import { patchRoutes } from "./api/routes/patch.js";
import { describeRoutes } from "./api/routes/describe.js";
import { db } from "./db/client.js";
import { sql } from "drizzle-orm";

// ── Bootstrap DB tables (idempotent) ──────────────────────────────────────────
db.run(sql`
  CREATE TABLE IF NOT EXISTS systems (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    canvas_state TEXT NOT NULL,
    metadata TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  )
`);
db.run(sql`
  CREATE TABLE IF NOT EXISTS system_generations (
    id TEXT PRIMARY KEY,
    system_id TEXT NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    generated_at INTEGER NOT NULL,
    zip_path TEXT,
    notes TEXT
  )
`);

const app = new Hono();
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-min-32-chars-long-here";
const jwtMiddleware = jwt({ secret: jwtSecret, alg: "HS256" });

app.use("*", cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  allowHeaders: ["Authorization", "Content-Type"],
}));

// ── Public routes ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", service: "builder-api" }));
app.post("/api/auth/login", (c) => authRoutes.fetch(new Request(new URL("/login", c.req.url), c.req.raw), c.env));

// ── JWT-protected routes ──────────────────────────────────────────────────────
// In Hono, app.use middleware applies to routes registered AFTER it.
// Register JWT middleware before the protected routes.
app.use("/api/auth/me", jwtMiddleware);
app.use("/api/systems/*", jwtMiddleware);
app.use("/api/ollama/*", jwtMiddleware);

app.get("/api/auth/me", async (c) => {
  const payload = c.get("jwtPayload") as { sub: string; email: string } | undefined;
  if (!payload) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  return c.json({ sub: payload.sub, email: payload.email });
});

app.get("/api/ollama/models", async (c) => {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`);
    if (!res.ok) {
      throw new Error(`Failed to fetch from Ollama: ${res.statusText}`);
    }
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) || [];
    return c.json({ models });
  } catch (err: any) {
    logger.warn({ err: err.message }, "Could not fetch local Ollama models, falling back to defaults");
    return c.json({
      models: ["qwen3:8b", "llama3.1:8b", "qwen2.5:7b", "qwen2.5:14b", "qwen2.5-coder:7b"],
    });
  }
});

app.route("/api/systems", systemRoutes);
app.route("/api/systems", generateRoutes);
app.route("/api/systems", patchRoutes);
app.route("/api/systems", describeRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

const port = parseInt(process.env.PORT ?? "3001");
logger.info({ port }, "Builder API starting");

export default { port, fetch: app.fetch };
