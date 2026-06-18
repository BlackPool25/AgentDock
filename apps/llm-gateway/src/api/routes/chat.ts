import { Hono } from "hono";
import { z } from "zod";
import { registry } from "../../providers/registry.js";
import { logger } from "../../logger.js";
import { QueueEvents } from "bullmq";
import { redis, llmQueue } from "../../queue/producer.js";
import { randomUUID } from "crypto";

export const chatRoutes = new Hono();

const queueEvents = new QueueEvents("llm-jobs", { connection: redis as any });

const SyncChatSchema = z.object({
  provider: z.string(),
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().default(""),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
  })),
  tools: z.array(z.any()).optional(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().int().optional().default(4096),
});

/**
 * POST /api/chat/sync
 * Synchronous LLM call — enqueued and blocked via BullMQ to protect rate limits.
 * Used by the agentic tool loop where each round must complete before the next.
 */
chatRoutes.post("/sync", async (c) => {
  let body: z.infer<typeof SyncChatSchema>;
  try {
    body = SyncChatSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: "Invalid request body", details: String(err) }, 400);
  }

  const provider = registry.get(body.provider);
  if (!provider) {
    return c.json({ error: `Provider not found: ${body.provider}` }, 404);
  }

  const jobId = randomUUID();
  try {
    const job = await llmQueue.add(
      "llm-request",
      {
        jobId,
        agentId: "sync-client",
        provider: body.provider,
        model: body.model,
        messages: body.messages as any,
        temperature: body.temperature,
        maxTokens: body.maxTokens,
        tools: body.tools,
        type: "sync",
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        jobId,
      }
    );

    const result = await job.waitUntilFinished(queueEvents, 300_000);
    logger.info({ provider: body.provider, model: body.model, jobId }, "sync_chat_completed");
    return c.json({
      content: result.content ?? result.output ?? "",
      toolCalls: result.toolCalls ?? [],
      usage: result.usage ?? {},
    });
  } catch (err) {
    logger.error({ provider: body.provider, jobId, err: String(err) }, "sync_chat_failed");
    return c.json({ error: String(err) }, 500);
  }
});
