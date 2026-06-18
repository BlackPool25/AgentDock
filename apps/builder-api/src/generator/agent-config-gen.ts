import yaml from "js-yaml";
import type { AgentDesign } from "@agentdock/config-schema";

const DEFAULT_MCP_COMMANDS: Record<string, string> = {
  filesystem: "npx -y @modelcontextprotocol/server-filesystem /workspace",
  "brave-search": "npx -y @modelcontextprotocol/server-brave-search",
  postgres: "npx -y @modelcontextprotocol/server-postgres",
  sqlite: "npx -y @modelcontextprotocol/server-sqlite",
  "memory-kg": "npx -y @modelcontextprotocol/server-memory",
  "web-fetch": "npx -y @modelcontextprotocol/server-fetch",
  git: "npx -y @modelcontextprotocol/server-git",
  docker: "npx -y @modelcontextprotocol/server-docker",
  "sequential-thinking": "npx -y @modelcontextprotocol/server-sequential-thinking",
  "youtube-transcript": "npx -y mcp-server-youtube-transcript",
  "google-drive": "npx -y google-drive-mcp",
  gmail: "npx -y google-gmail-mcp",
  "google-docs": "npx -y google-workspace-mcp",
  "google-sheets": "npx -y google-workspace-mcp",
};

export function generateAgentConfig(agent: AgentDesign): string {
  const config = {
    agent: {
      id: agent.id,
      name: agent.name,
      description: agent.description || undefined,
      version: "1.0.0",
    },
    runtime: {
      base_image: "agentdock/agent-base:latest",
    },
    llm: {
      provider: agent.llm.provider,
      model: agent.llm.model,
      temperature: agent.llm.temperature,
      max_tokens: agent.llm.maxTokens,
      system_prompt: agent.llm.systemPrompt || undefined,
    },
    memory: {
      path: "/memory",
      git_auto_commit: agent.memory.gitAutoCommit,
      readable_by: agent.memory.readableBy,
    },
    rag: agent.rag || undefined,
    shell: { 
      enabled: agent.shell.enabled,
      level: agent.shell.level ?? "restricted",
      allowed_commands: agent.shell.allowed_commands ?? [],
    },
    mcps: agent.mcps
      .map((mcp) => {
        let command = mcp.command;
        if (mcp.transport === "stdio" && (!command || command.trim() === "")) {
          command = DEFAULT_MCP_COMMANDS[mcp.name] || "";
        }
        return { ...mcp, command };
      })
      .filter((mcp) => {
        // Drop stdio MCPs with no command — they will crash the MCP client on startup
        if (mcp.transport === "stdio" && (!mcp.command || mcp.command.trim() === "")) return false;
        // Drop SSE/HTTP MCPs with no URL
        if (mcp.transport !== "stdio" && (!mcp.url || mcp.url.trim() === "")) return false;
        return true;
      })
      .map((mcp) => ({
        name: mcp.name,
        transport: mcp.transport,
        url: mcp.url,
        command: mcp.command,
        env: mcp.env || {},
      })),
    tools: {
      python_packages: agent.tools.pythonPackages,
      system_packages: agent.tools.systemPackages,
    },
    // Named actions this agent can execute when triggered
    actions: (agent.actions ?? []).map((a) => ({
      name: a.name,
      description: a.description || undefined,
      input_schema: Object.keys(a.inputSchema).length > 0 ? a.inputSchema : undefined,
      output_schema: Object.keys(a.outputSchema).length > 0 ? a.outputSchema : undefined,
      prompt_template: a.promptTemplate || undefined,
      output_file: a.outputFile,
    })),
    seed_files: (agent.seedFiles ?? []).map((sf) => ({
      filename: sf.filename,
      type: sf.type,
      content: sf.type === "text" ? sf.content : undefined,
      content_base64: sf.type === "pdf" ? sf.content : undefined,
      extracted_text: sf.extractedText,
    })),
    insufficient_input: agent.insufficientInput || { enabled: false },
    triggers: agent.triggers.map((t) => {
      if (t.type === "webhook") {
        return {
          type: "webhook",
          ...(t.actionName ? { actionName: t.actionName } : {}),
          ...((t as any).webhook_input_schema?.length
            ? { webhook_input_schema: (t as any).webhook_input_schema }
            : {}),
        };
      }
      return t;
    }),
    expose: agent.expose,
    ports: { internal: 8080 },
  };
  return yaml.dump(config, { lineWidth: 120 });
}
