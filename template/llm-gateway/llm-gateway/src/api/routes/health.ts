import { Hono } from "hono";
import { llmQueue } from "../../queue/producer.js";

export const healthRoutes = new Hono();

healthRoutes.get("/", async (c) => {
  const [waiting, active] = await Promise.all([
    llmQueue.getWaitingCount(),
    llmQueue.getActiveCount(),
  ]);
  return c.json({ status: "ok", queueDepth: waiting, activeJobs: active });
});
