import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { registry } from "../../providers/registry.js";

export const providerRoutes = new Hono();

providerRoutes.get("/", (c) => {
  const lb = registry.getOllamaLb();
  return c.json({
    providers: registry.list(),
    ollamaServers: lb.getStatus(),
  });
});

const addProviderSchema = z.object({
  name: z.string(),
  type: z.enum(["openai", "anthropic", "gemini", "groq", "ollama"]),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
});

providerRoutes.post("/", zValidator("json", addProviderSchema), (c) => {
  const body = c.req.valid("json");
  registry.register(body);
  return c.json({ ok: true });
});

providerRoutes.post("/ollama-servers", zValidator("json", z.object({ url: z.string().url() })), (c) => {
  const { url } = c.req.valid("json");
  registry.getOllamaLb().addServer(url);
  return c.json({ ok: true });
});
