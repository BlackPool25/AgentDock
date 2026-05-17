import type { Context } from "hono";
import { loadAgentConfig } from "../workflow/parser.js";
import { containerName } from "../docker/container-manager.js";
import { env } from "../config/env.js";
import { logger } from "../logger.js";

const EXPOSE_PATH_MAP: Record<string, string> = {
  logs: "/logs",
  status: "/status",
  memory: "/memory",
  chat: "/chat",
  tasks: "/tasks",
  raw_response: "/raw",
};

export async function proxyToAgent(c: Context): Promise<Response> {
  const agentId = c.req.param("agentId");
  const rest = c.req.param("rest") ?? "";

  // Load agent config to check expose permissions
  let agentConfig;
  try {
    agentConfig = loadAgentConfig(agentId);
  } catch {
    return c.json({ error: "Agent not found", code: "NOT_FOUND" }, 404);
  }

  // Check expose permissions
  const requestedSection = rest.split("/")[0];
  const isAllowed = agentConfig.expose.some((e) => {
    const mapped = EXPOSE_PATH_MAP[e];
    return mapped && rest.startsWith(mapped.slice(1));
  });

  // JWT-authenticated requests bypass expose check
  const isJwt = c.get("jwtPayload") !== undefined;
  if (!isJwt && !isAllowed) {
    return c.json({ error: "Endpoint not exposed", code: "FORBIDDEN" }, 403);
  }

  const systemId = env.SYSTEM_ID;
  const target = `http://${containerName(systemId, agentId)}:8080/${rest}`;

  try {
    const req = c.req.raw;
    const proxyRes = await fetch(target, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req.body,
      signal: AbortSignal.timeout(30_000),
    });

    logger.info({ agentId, path: rest, status: proxyRes.status }, "Proxy request");
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      headers: proxyRes.headers,
    });
  } catch (err) {
    logger.error({ agentId, err }, "Proxy error");
    return c.json({ error: "Agent unreachable", code: "PROXY_ERROR" }, 502);
  }
}
