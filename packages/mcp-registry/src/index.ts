// AgentDock MCP Registry
// Lean universal platform MCPs + live Smithery registry discovery.
// Replaces the static EdTech-specific bundle model with dynamic, on-demand MCP search.

// ── Types ──────────────────────────────────────────────────────────────────────

export type MCPTransport = "stdio" | "sse" | "streamable-http";

export interface MCPEntry {
  id: string;
  name: string;
  description: string;
  /** npm package name for stdio servers */
  package: string;
  /** Full npx/node command to launch the server (stdio only) */
  command?: string;
  transport: MCPTransport;
  /** Env vars required by this MCP server */
  requiredEnv: string[];
  /** Smithery registry qualified name, e.g. "brave" or "@modelcontextprotocol/github" */
  smitheryQualifiedName?: string;
}

// ── Platform MCPs ──────────────────────────────────────────────────────────────
// These 4 infrastructure MCPs are available in every AgentDock project.
// They are NOT auto-injected into agent configs — the LLM decides when they are needed.

export const PLATFORM_MCPS: MCPEntry[] = [
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Read/write local files — input deliverables, agent memory, generated reports",
    package: "@modelcontextprotocol/server-filesystem",
    command: "npx -y @modelcontextprotocol/server-filesystem /workspace",
    transport: "stdio",
    requiredEnv: [],
  },
  {
    id: "memory-kg",
    name: "Memory (Knowledge Graph)",
    description: "Persistent cross-session memory via a knowledge graph — agent state, user profiles",
    package: "@modelcontextprotocol/server-memory",
    command: "npx -y @modelcontextprotocol/server-memory",
    transport: "stdio",
    requiredEnv: [],
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured step-by-step reasoning — critical for multi-hop planning and complex workflows",
    package: "@modelcontextprotocol/server-sequential-thinking",
    command: "npx -y @modelcontextprotocol/server-sequential-thinking",
    transport: "stdio",
    requiredEnv: [],
  },
  {
    id: "web-fetch",
    name: "Web Fetch",
    description: "Fetch and parse any URL — documentation pages, APIs, public datasets",
    package: "@modelcontextprotocol/server-fetch",
    command: "npx -y @modelcontextprotocol/server-fetch",
    transport: "stdio",
    requiredEnv: [],
  },
];

// ── Smithery Registry ──────────────────────────────────────────────────────────

export const SMITHERY_API_BASE = "https://api.smithery.ai";
export const SMITHERY_SERVER_BASE = "https://server.smithery.ai";

export interface SmitheryServer {
  id: string;
  qualifiedName: string;
  displayName: string;
  description: string;
  remote: boolean;
  isDeployed: boolean;
  useCount: number;
  verified: boolean;
}

/**
 * Search the Smithery registry for MCP servers relevant to a query.
 *
 * - Requires `SMITHERY_API_KEY` env var.
 * - Returns an empty array if the key is missing or the request fails (graceful degradation).
 * - Capped at `pageSize` results (default 8) to avoid token bloat in prompts.
 */
export async function searchSmithery(query: string, pageSize = 8): Promise<SmitheryServer[]> {
  const apiKey = process.env.SMITHERY_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `${SMITHERY_API_BASE}/servers?q=${encodeURIComponent(query)}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { servers?: SmitheryServer[] };
    return data.servers ?? [];
  } catch {
    return [];
  }
}

/**
 * Build the Smithery streamable-http endpoint URL for a hosted server.
 * Append SMITHERY_API_KEY as a query parameter for authentication.
 *
 * Only use for servers where `remote === true && isDeployed === true`.
 */
export function smitheryServerUrl(qualifiedName: string): string {
  return `${SMITHERY_SERVER_BASE}/${qualifiedName}/mcp`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Look up a platform MCP by id */
export function getPlatformMCP(id: string): MCPEntry | undefined {
  return PLATFORM_MCPS.find((m) => m.id === id);
}

/** Get platform MCPs as MCP config entries (for agent YAML generation) */
export function getPlatformMCPConfigs() {
  return PLATFORM_MCPS.map((m) => ({
    name: m.id,
    transport: m.transport,
    command: m.command ?? "",
    requiredEnv: m.requiredEnv,
  }));
}
