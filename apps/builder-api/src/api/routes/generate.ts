import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createReadStream, existsSync } from "fs";
import { db } from "../../db/client.js";
import { systems, systemGenerations } from "../../db/schema.js";
import { generateProject } from "../../generator/index.js";
import { canvasToSystemDesign } from "../../validator/system-design.js";
import { logger } from "../../logger.js";
import type { CanvasState } from "@agentdock/shared-types";

export const generateRoutes = new Hono();

// POST /api/systems/:id/generate
generateRoutes.post("/:id/generate", async (c) => {
  const id = c.req.param("id");
  const row = db.select().from(systems).where(eq(systems.id, id)).get();
  if (!row) return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);

  const canvas = JSON.parse(row.canvasState) as CanvasState;
  const { design, errors } = canvasToSystemDesign(id, row.name, canvas);

  if (errors.length > 0) {
    return c.json({ error: "Invalid system design", code: "VALIDATION_ERROR", details: errors }, 422);
  }

  const genId = nanoid(12);
  const now = Date.now();

  try {
    const zipPath = await generateProject(design, genId);

    db.insert(systemGenerations).values({
      id: genId,
      systemId: id,
      version: row.version,
      generatedAt: now,
      zipPath,
    }).run();

    logger.info({ systemId: id, genId, zipPath }, "Generation complete");

    // Stream zip as download
    const projectName = row.name.toLowerCase().replace(/\s+/g, "-");
    const filename = `${projectName}-system-v${row.version}.zip`;

    c.header("Content-Type", "application/zip");
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("X-Generation-Id", genId);

    // Use Bun's file streaming
    const file = Bun.file(zipPath);
    return c.body(file.stream() as ReadableStream, 200);
  } catch (err) {
    logger.error({ err, systemId: id }, "Generation failed");
    return c.json({ error: "Generation failed", code: "GENERATION_ERROR" }, 500);
  }
});

// GET /api/systems/:id/generations/:genId — re-download a previous generation
generateRoutes.get("/:id/generations/:genId", async (c) => {
  const { id, genId } = c.req.param();
  const row = db.select().from(systemGenerations)
    .where(eq(systemGenerations.id, genId))
    .get();

  if (!row || row.systemId !== id) {
    return c.json({ error: "Not found", code: "NOT_FOUND" }, 404);
  }
  if (!row.zipPath || !existsSync(row.zipPath)) {
    return c.json({ error: "Zip file not found on disk", code: "FILE_NOT_FOUND" }, 404);
  }

  const system = db.select().from(systems).where(eq(systems.id, id)).get();
  const projectName = (system?.name ?? id).toLowerCase().replace(/\s+/g, "-");
  const filename = `${projectName}-system-v${row.version}.zip`;

  c.header("Content-Type", "application/zip");
  c.header("Content-Disposition", `attachment; filename="${filename}"`);

  const file = Bun.file(row.zipPath);
  return c.body(file.stream() as ReadableStream, 200);
});
