import yaml from "js-yaml";
import type { AgentDesign } from "@agentdock/config-schema";

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
    shell: { enabled: agent.shell.enabled },
    mcps: agent.mcps.map((mcp) => ({
      name: mcp.name,
      transport: mcp.transport,
      url: mcp.url,
      command: mcp.command,
      env: mcp.env,
    })),
    tools: {
      python_packages: agent.tools.pythonPackages,
      system_packages: agent.tools.systemPackages,
    },
    triggers: agent.triggers,
    expose: agent.expose,
    ports: { internal: 8080 },
  };
  return yaml.dump(config, { lineWidth: 120 });
}
