import { Hono } from "hono";
import { logger } from "./logger.js";
import { startWorker } from "./queue/worker.js";
import { queueRoutes } from "./api/routes/queue.js";
import { providerRoutes } from "./api/routes/providers.js";
import { healthRoutes } from "./api/routes/health.js";

const app = new Hono();

app.route("/api/queue", queueRoutes);
app.route("/api/providers", providerRoutes);
app.route("/api/health", healthRoutes);

app.onError((err, c) => {
  logger.error({ err: err.message }, "Unhandled error");
  return c.json({ error: err.message, code: "INTERNAL_ERROR" }, 500);
});

const worker = startWorker();
logger.info("LLM Gateway worker started");

const port = parseInt(process.env.LLM_GATEWAY_PORT ?? "5000");
logger.info({ port }, "LLM Gateway starting");

export default {
  port,
  fetch: app.fetch,
};
