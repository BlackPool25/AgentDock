import { Worker, type Job } from "bullmq";
import { redis } from "./producer.js";
import { registry } from "../providers/registry.js";
import { logger } from "../logger.js";
import type { LLMJob, LLMJobResult, LLMJobError } from "../types.js";

export function startWorker(): Worker {
  const worker = new Worker<LLMJob>(
    "llm-jobs",
    async (job: Job<LLMJob>) => {
      const { jobId, provider, model, messages, temperature, maxTokens, callbackUrl } = job.data;
      logger.info({ jobId, provider, model }, "Processing LLM job");

      const p = registry.get(provider);
      if (!p) throw new Error(`Unknown provider: ${provider}`);

      const result = await p.chat(messages, { model, temperature, maxTokens });

      const payload: LLMJobResult = { jobId, output: result.output, usage: result.usage };
      await fetch(callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      logger.info({ jobId }, "LLM job completed");
      return result;
    },
    {
      connection: redis,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? "5"),
    }
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.data.jobId, err: err.message }, "LLM job failed");
    const payload: LLMJobError = { jobId: job.data.jobId, error: err.message };
    try {
      await fetch(job.data.callbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      logger.error({ err: e }, "Failed to send error callback");
    }
  });

  return worker;
}
