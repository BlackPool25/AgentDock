import { Hono } from "hono";
import { z } from "zod";
import { registry } from "../../providers/registry.js";
import { logger } from "../../logger.js";

export const chatRoutes = new Hono();

const SyncChatSchema = z.object({
  provider: z.string(),
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().optional().default(""),
    tool_calls: z.array(z.any()).optional(),
    tool_call_id: z.string().optional(),
  })),
  tools: z.array(z.any()).optional(),
  temperature: z.number().optional().default(0.7),
  maxTokens: z.number().int().optional().default(4096),
});

/**
 * POST /api/chat/sync
 * Synchronous LLM call — bypasses BullMQ queue.
 * Used by the agentic tool loop where each round must complete before the next starts.
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

  try {
    // Use provider's chat method — tools are passed through for providers that support them
    const result = await provider.chatWithTools(body.messages as any, {
      model: body.model,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      tools: body.tools,
    });

    logger.info({ provider: body.provider, model: body.model }, "sync_chat_completed");
    return c.json({
      content: result.content,
      toolCalls: result.toolCalls ?? [],
      usage: result.usage ?? {},
    });
  } catch (err) {
    logger.error({ provider: body.provider, model: body.model, err: String(err) }, "sync_chat_failed");
    return c.json({ error: String(err) }, 500);
  }
});
