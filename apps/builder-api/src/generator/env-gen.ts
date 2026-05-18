import type { SystemDesign } from "@agentdock/config-schema";

export function generateEnvExample(design: SystemDesign): string {
  const lines: string[] = [
    "# AgentDock Generated System — Environment Variables",
    `# System: ${design.systemName}`,
    "",
    "# ── Required ──────────────────────────────────────────────────────────────",
    "SYSTEM_ID=" + design.systemId,
    "JWT_SECRET=change-me-to-a-random-32-char-string",
    "# API_PASSWORD: password for POST /auth/login. Defaults to JWT_SECRET if not set.",
    "API_PASSWORD=",
    "ORCHESTRATOR_PORT=4000",
    "",
    "# ── LLM Providers (fill in what you use) ──────────────────────────────────",
    "OPENAI_API_KEY=",
    "ANTHROPIC_API_KEY=",
    "GEMINI_API_KEY=",
    "GROQ_API_KEY=",
    "OLLAMA_SERVERS=http://host.docker.internal:11434",
    "",
  ];

  // Collect all unique MCP env vars
  const mcpEnvVars = new Set<string>();
  for (const agent of design.agents) {
    for (const mcp of agent.mcps) {
      for (const key of Object.keys(mcp.env)) {
        mcpEnvVars.add(key);
      }
    }
  }

  if (mcpEnvVars.size > 0) {
    lines.push("# ── MCP Environment Variables ─────────────────────────────────────────────");
    for (const key of mcpEnvVars) {
      lines.push(`${key}=`);
    }
    lines.push("");
  }

  lines.push("# ── Agents ────────────────────────────────────────────────────────────────");
  lines.push("# Configure OLLAMA_SERVERS above, then set each agent's model in configs/agents/{id}.yaml");
  for (const agent of design.agents) {
    lines.push(`# ${agent.name} (${agent.id}) — provider: ${agent.llm.provider}, model: ${agent.llm.model}`);
  }

  return lines.join("\n") + "\n";
}
