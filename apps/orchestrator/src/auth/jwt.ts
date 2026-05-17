import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";
import { randomBytes } from "crypto";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function signToken(payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secret);
}

export async function verifyToken(token: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, secret);
  return payload as Record<string, unknown>;
}

// In-memory API key store (replace with persistent store in production)
const apiKeys = new Map<string, { agentId: string; scopes: string[]; name: string }>();

export function generateApiKey(): string {
  return `af_${randomBytes(24).toString("hex")}`;
}

export function storeApiKey(key: string, agentId: string, scopes: string[], name: string): void {
  apiKeys.set(key, { agentId, scopes, name });
}

export function validateApiKey(key: string): { agentId: string; scopes: string[] } | null {
  return apiKeys.get(key) ?? null;
}
