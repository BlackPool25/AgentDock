import { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { LLMJob } from "../types.js";

export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const llmQueue = new Queue<LLMJob>("llm-jobs", { connection: redis as any });

export async function enqueueJob(job: LLMJob): Promise<string> {
  const added = await llmQueue.add("llm-request", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    jobId: job.jobId,
  });
  return added.id ?? job.jobId;
}
