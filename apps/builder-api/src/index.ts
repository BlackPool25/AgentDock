import { Hono } from "hono";
import { cors } from "hono/cors";
import { jwt } from "hono/jwt";
import { logger } from "./logger.js";
import { authRoutes } from "./api/routes/auth.js";
import { systemRoutes } from "./api/routes/systems.js";
import { generateRoutes } from "./api/routes/generate.js";
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

app.use("*", cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  allowHeaders: ["Authorization", "Content-Type"],
}));

// ── Public routes ─────────────────────────────────────────────────────────────
app.get("/health", (c) => c.json({ status: "ok", service: "builder-api" }));
app.route("/api/auth", authRoutes);

// ── JWT-protected routes ──────────────────────────────────────────────────────
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-min-32-chars-long-here";
app.use("/api/systems/*", jwt({ secret: jwtSecret, alg: "HS256" }));

app.route("/api/systems", systemRoutes);
app.route("/api/systems", generateRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

const port = parseInt(process.env.PORT ?? "3001");
logger.info({ port }, "Builder API starting");

export default { port, fetch: app.fetch };
