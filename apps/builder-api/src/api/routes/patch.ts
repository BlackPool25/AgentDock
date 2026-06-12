/**
 * POST /api/systems/:id/patch
 *
 * Apply a natural-language change to an existing workflow without
 * regenerating the entire pipeline.
 *
 * Pain point: A teacher designs a 5-agent pipeline, then wants to change
 * "generate 3 quiz questions" to "generate 5 quiz questions". Without patch
 * mode, they'd have to regenerate the whole system and reconfigure everything.
 * With patch mode, the LLM returns a minimal diff and only the affected node
 * updates on the canvas.
 *
 * Request body:
 *   { "change": "make the quiz agent generate 5 questions instead of 3" }
 *
 * Response:
 *   {
 *     "patch": { "op": "replace", "agentId": "quiz-agent",
 *                "field": "actions[0].promptTemplate", "value": "..." },
 *     "canvasState": { ...updated canvas... },
 *     "affectedAgentId": "quiz-agent"
 *   }
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { systems } from "../../db/schema.js";
import { logger } from "../../logger.js";
import type { AgentDesign } from "@agentdock/config-schema";

const patchRoutes = new Hono();

const PatchRequestSchema = z.object({
  change: z.string().min(3).max(500),
});

patchRoutes.post("/:id/patch", zValidator("json", PatchRequestSchema), async (c) => {
  const { id } = c.req.param();
  const { change } = c.req.valid("json");

  const row = db.select().from(systems).where(eq(systems.id, id)).get();
  if (!row) return c.json({ error: "System not found" }, 404);

  const canvasState = JSON.parse(row.canvasState) as {
    nodes: Array<{ id: string; data: AgentDesign }>;
    edges: unknown[];
  };

  // Build a compact representation of the current design for the LLM
  const designSummary = canvasState.nodes.map((n) => ({
    id: n.data.id,
    name: n.data.name,
    actions: (n.data.actions ?? []).map((a) => ({
      name: a.name,
      promptTemplate: a.promptTemplate?.slice(0, 300),
      outputFile: a.outputFile,
    })),
    systemPrompt: n.data.llm?.systemPrompt?.slice(0, 300),
  }));

  const llmPrompt = `You are a workflow editor. Given the current pipeline design and a change request, return a minimal JSON patch.

Current pipeline agents:
${JSON.stringify(designSummary, null, 2)}

Change requested: "${change}"

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "agentId": "<id of the agent to change>",
  "field": "<dot-path to the field, e.g. actions[0].promptTemplate or llm.systemPrompt>",
  "value": "<new value as a string>"
}

Rules:
- Only change ONE field in ONE agent per patch
- If the change requires multiple agents, pick the most important one
- For prompt changes, write the complete new prompt (not a diff)
- agentId must exactly match one of the agent ids above`;

  let patch: { agentId: string; field: string; value: string };
  try {
    patch = await callLLMForPatch(llmPrompt);
  } catch (e) {
    logger.error({ err: e }, "patch.llm_failed");
    return c.json({ error: "LLM patch generation failed", detail: String(e) }, 500);
  }

  // Apply the patch to the canvas state
  const updatedCanvas = applyPatch(canvasState, patch);
  if (!updatedCanvas) {
    return c.json({ error: `Agent '${patch.agentId}' not found in canvas` }, 400);
  }

  // Persist
  const now = Date.now();
  db.update(systems)
    .set({ canvasState: JSON.stringify(updatedCanvas), updatedAt: now })
    .where(eq(systems.id, id))
    .run();

  logger.info({ systemId: id, agentId: patch.agentId, field: patch.field }, "patch.applied");

  return c.json({
    patch,
    canvasState: updatedCanvas,
    affectedAgentId: patch.agentId,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function callLLMForPatch(prompt: string): Promise<{ agentId: string; field: string; value: string }> {
  const provider = process.env.LLM_PROVIDER ?? "openai";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;

  if (provider !== "ollama" && !apiKey) {
    throw new Error("No LLM API key configured (set OPENAI_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY)");
  }

  let content: string;

  if (provider === "ollama") {
    const ollamaBase = process.env.OLLAMA_URL ?? "http://localhost:11434";
    const res = await fetch(`${ollamaBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        think: false,
        stream: false,
        messages: [{ role: "user", content: prompt }],
        options: { temperature: 0.1, num_predict: 512 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { message: { content: string } };
    content = data.message?.content ?? "";
  } else if (provider === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) throw new Error("GEMINI_API_KEY not set");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
        }),
      }
    );
    if (!res.ok) throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    content = data.candidates[0]?.content?.parts[0]?.text ?? "";
  } else {
    const baseUrl = provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1";
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.1, max_tokens: 512 }),
    });
    if (!res.ok) throw new Error(`LLM API error: ${res.status} ${await res.text()}`);
    const data = await res.json() as { choices: Array<{ message: { content: string } }> };
    content = data.choices[0]?.message?.content ?? "";
  }

  // Strip markdown code fences if present
  const json = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  return JSON.parse(json);
}

function applyPatch(
  canvas: { nodes: Array<{ id: string; data: AgentDesign }>; edges: unknown[] },
  patch: { agentId: string; field: string; value: string },
): typeof canvas | null {
  const nodeIndex = canvas.nodes.findIndex((n) => n.data.id === patch.agentId);
  if (nodeIndex === -1) return null;

  const node = structuredClone(canvas.nodes[nodeIndex]);
  setNestedField(node.data, patch.field, patch.value);

  const updatedNodes = [...canvas.nodes];
  updatedNodes[nodeIndex] = node;
  return { ...canvas, nodes: updatedNodes };
}

/** Set a value at a dot-path like "actions[0].promptTemplate" */
function setNestedField(obj: Record<string, unknown>, path: string, value: unknown): void {
  // Convert "actions[0].promptTemplate" → ["actions", "0", "promptTemplate"]
  const keys = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = isNaN(Number(keys[i + 1])) ? {} : [];
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
}

export { patchRoutes };
