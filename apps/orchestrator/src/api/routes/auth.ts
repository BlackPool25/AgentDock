import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { signToken, generateApiKey, storeApiKey } from "../../auth/jwt.js";
import { env } from "../../config/env.js";

export const authRoutes = new Hono();

authRoutes.post(
  "/login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string() })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    if (email !== env.ADMIN_EMAIL || password !== env.ADMIN_PASSWORD) {
      return c.json({ error: "Invalid credentials", code: "UNAUTHORIZED" }, 401);
    }
    const token = await signToken({ sub: email, role: "admin" });
    return c.json({ token, expiresIn: 86400 });
  }
);

authRoutes.post(
  "/api-keys",
  zValidator("json", z.object({
    agentId: z.string(),
    name: z.string(),
    scopes: z.array(z.string()),
  })),
  (c) => {
    const { agentId, name, scopes } = c.req.valid("json");
    const apiKey = generateApiKey();
    storeApiKey(apiKey, agentId, scopes, name);
    return c.json({ apiKey, agentId, scopes, name });
  }
);
