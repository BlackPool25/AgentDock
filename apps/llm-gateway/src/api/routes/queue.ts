import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { enqueueJob, llmQueue } from "../../queue/producer.js";
import { registry } from "../../providers/registry.js";
import { randomUUID } from "crypto";

export const queueRoutes = new Hono();

const submitSchema = z.object({
  agentId: z.string(),
  provider: z.string(),
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  })),
  temperature: z.number().optional(),
  maxTokens: z.number().int().optional(),
  callbackUrl: z.string().url(),
});

queueRoutes.post("/submit", zValidator("json", submitSchema), async (c) => {
  const body = c.req.valid("json");
  const jobId = randomUUID();
  await enqueueJob({ ...body, jobId });
  return c.json({ jobId }, 202);
});

queueRoutes.get("/jobs/:jobId", async (c) => {
  const job = await llmQueue.getJob(c.req.param("jobId"));
  if (!job) return c.json({ error: "Job not found", code: "NOT_FOUND" }, 404);
  const state = await job.getState();
  return c.json({ jobId: job.id, state, data: job.data });
});
