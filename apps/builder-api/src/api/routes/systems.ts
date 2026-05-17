import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "../../db/client.js";
import { systems, systemGenerations } from "../../db/schema.js";
import { logger } from "../../logger.js";
import type { SystemSummary, SystemDetail, CreateSystemRequest, UpdateSystemRequest } from "@agentdock/shared-types";

export const systemRoutes = new Hono();

const CanvasStateSchema = z.object({
  nodes: z.array(z.record(z.unknown())),
  edges: z.array(z.record(z.unknown())),
});

// GET /api/systems
systemRoutes.get("/", (c) => {
  const rows = db.select().from(systems).orderBy(desc(systems.updatedAt)).all();
  const result: SystemSummary[] = rows.map((s) => {
    const meta = JSON.parse(s.metadata) as { agentCount: number; triggerCount: number };
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      agentCount: meta.agentCount,
      triggerCount: meta.triggerCount,
      version: s.version,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  });
  return c.json(result);
});

// POST /api/systems
systemRoutes.post(
  "/",
  zValidator("json", z.object({ name: z.string().min(1), description: z.string().optional() })),
  (c) => {
    const { name, description } = c.req.valid("json");
    const id = nanoid(12);
    const now = Date.now();
    const emptyCanvas = JSON.stringify({ nodes: [], edges: [] });
    const emptyMeta = JSON.stringify({ agentCount: 0, triggerCount: 0 });
    db.insert(systems).values({ id, name, description: description ?? null, canvasState: emptyCanvas, metadata: emptyMeta, createdAt: now, updatedAt: now, version: 1 }).run();
    logger.info({ id, name }, "System created");
    return c.json({ id, name, description: description ?? null, agentCount: 0, triggerCount: 0, version: 1, createdAt: now, updatedAt: now } satisfies SystemSummary, 201);
  }
);

// GET /api/systems/:id
systemRoutes.get("/:id", (c) => {
  const row = db.select().from(systems).where(eq(systems.id, c.req.param("id"))).get();
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  const meta = JSON.parse(row.metadata) as { agentCount: number; triggerCount: number };
  return c.json<SystemDetail>({
    id: row.id,
    name: row.name,
    description: row.description,
    agentCount: meta.agentCount,
    triggerCount: meta.triggerCount,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    canvasState: JSON.parse(row.canvasState),
  });
});

// PUT /api/systems/:id
systemRoutes.put(
  "/:id",
  zValidator("json", z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    canvasState: CanvasStateSchema,
  })),
  (c) => {
    const id = c.req.param("id");
    const row = db.select().from(systems).where(eq(systems.id, id)).get();
    if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

    const body = c.req.valid("json");
    const canvas = body.canvasState;
    const agentCount = canvas.nodes.filter((n) => (n as { type?: string }).type === "agent").length;
    const triggerCount = canvas.edges.length;
    const metadata = JSON.stringify({ agentCount, triggerCount });
    const now = Date.now();

    db.update(systems).set({
      name: body.name ?? row.name,
      description: body.description !== undefined ? body.description : row.description,
      canvasState: JSON.stringify(canvas),
      metadata,
      updatedAt: now,
      version: row.version + 1,
    }).where(eq(systems.id, id)).run();

    logger.info({ id, version: row.version + 1 }, "System updated");
    return c.json({ ok: true, version: row.version + 1 });
  }
);

// DELETE /api/systems/:id
systemRoutes.delete("/:id", (c) => {
  const id = c.req.param("id");
  const row = db.select().from(systems).where(eq(systems.id, id)).get();
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  db.delete(systems).where(eq(systems.id, id)).run();
  logger.info({ id }, "System deleted");
  return c.json({ ok: true });
});

// GET /api/systems/:id/generations
systemRoutes.get("/:id/generations", (c) => {
  const id = c.req.param("id");
  const rows = db.select().from(systemGenerations)
    .where(eq(systemGenerations.systemId, id))
    .orderBy(desc(systemGenerations.generatedAt))
    .all();
  return c.json(rows);
});
