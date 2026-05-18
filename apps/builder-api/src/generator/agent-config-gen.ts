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
    rag: agent.rag || undefined,
    shell: { enabled: agent.shell.enabled },
    mcps: agent.mcps.map((mcp) => ({
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
    triggers: agent.triggers,
    expose: agent.expose,
    ports: { internal: 8080 },
  };
  return yaml.dump(config, { lineWidth: 120 });
}
