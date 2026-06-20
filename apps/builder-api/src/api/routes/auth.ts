import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SignJWT } from "jose";
import { z } from "zod";
import type { LoginRequest, LoginResponse } from "@agentdock/shared-types";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@agentdock.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "changeme";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-min-32-chars-long-here");

export const authRoutes = new Hono();

authRoutes.post(
  "/login",
  zValidator("json", z.object({ email: z.string().email(), password: z.string() })),
  async (c) => {
    const { email, password } = c.req.valid("json");
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return c.json({ error: "Invalid credentials", code: "UNAUTHORIZED" }, 401);
    }
    const token = await new SignJWT({ sub: "admin", email })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(JWT_SECRET);
    return c.json<LoginResponse>({ token, expiresIn: 2592000 });
  }
);

authRoutes.get("/me", async (c) => {
  const payload = c.get("jwtPayload" as never) as { sub: string; email: string } | undefined;
  if (!payload) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  return c.json({ sub: payload.sub, email: payload.email });
});
