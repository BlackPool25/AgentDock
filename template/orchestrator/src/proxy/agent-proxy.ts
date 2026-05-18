import type { Context } from "hono";
import type { AgentConfig } from "../config/loader.js";
import { logger } from "../logger.js";

const AGENT_PORT = 8080;

type ExposeOption = "logs" | "chat" | "memory" | "status" | "tasks" | "shell";

const ENDPOINT_EXPOSE_MAP: Record<string, ExposeOption> = {
  status: "status",
  logs: "logs",
  memory: "memory",
  chat: "chat",
  tasks: "tasks",
  files: "tasks",
  shell: "shell",
  rag: "status",  // RAG status/reindex gated by status expose
};

export async function proxyToAgent(
  c: Context,
  agentId: string,
  agentPath: string,
  agentConfig: AgentConfig
): Promise<Response> {
  // Determine required expose permission
  const topSegment = agentPath.split("/")[0] as string;
  const required = ENDPOINT_EXPOSE_MAP[topSegment];

  if (required && !agentConfig.expose.includes(required)) {
    return c.json({ error: `Endpoint '${topSegment}' not exposed for agent '${agentId}'`, code: "FORBIDDEN" }, 403);
  }

  const targetUrl = `http://${agentId}:${AGENT_PORT}/${agentPath}`;

  try {
    const req = c.req.raw;
    // Strip Authorization header — agents don't use JWT auth, forwarding it causes rejections
    const headers = new Headers(req.headers);
    headers.delete("authorization");
    const proxyReq = new Request(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    const res = await fetch(proxyReq);
    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    logger.error({ agentId, agentPath, err }, "Proxy error");
    return c.json({ error: "Agent unreachable", code: "AGENT_UNREACHABLE" }, 502);
  }
}
