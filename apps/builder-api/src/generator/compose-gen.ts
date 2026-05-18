import yaml from "js-yaml";
import type { SystemDesign } from "@agentdock/config-schema";

function getPeerAgents(agentId: string, design: SystemDesign): string {
  const peers = new Set<string>();
  for (const conn of design.connections) {
    if (conn.from === agentId) peers.add(conn.to);
    if (conn.to === agentId) peers.add(conn.from);
  }
  peers.delete(agentId);
  return [...peers].join(",");
}

export function generateCompose(design: SystemDesign): string {
  const services: Record<string, unknown> = {};

  services["orchestrator"] = {
    build: { context: "./orchestrator" },
    ports: ["${ORCHESTRATOR_PORT:-4000}:4000"],
    volumes: [
      "/var/run/docker.sock:/var/run/docker.sock",
      "./configs:/app/configs:ro",
    ],
    environment: [
      "SYSTEM_ID=${SYSTEM_ID}",
      "JWT_SECRET=${JWT_SECRET}",
      "REDIS_URL=redis://redis:6379",
      "LLM_GATEWAY_URL=http://llm-gateway:5000",
      `AGENT_NAMES=${design.agents.map((a) => a.id).join(",")}`,
    ],
    depends_on: { redis: { condition: "service_healthy" } },
    networks: ["agentdock-net"],
    restart: "unless-stopped",
  };

  services["llm-gateway"] = {
    build: { context: "./llm-gateway" },
    environment: [
      "REDIS_URL=redis://redis:6379",
      "OLLAMA_SERVERS=${OLLAMA_SERVERS:-}",
      "OPENAI_API_KEY=${OPENAI_API_KEY:-}",
      "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}",
      "GEMINI_API_KEY=${GEMINI_API_KEY:-}",
      "GROQ_API_KEY=${GROQ_API_KEY:-}",
    ],
    extra_hosts: ["host.docker.internal:host-gateway"],
    depends_on: { redis: { condition: "service_healthy" } },
    networks: ["agentdock-net"],
    restart: "unless-stopped",
  };

  services["redis"] = {
    image: "redis:7-alpine",
    healthcheck: {
      test: ["CMD", "redis-cli", "ping"],
      interval: "10s",
      timeout: "5s",
      retries: 5,
    },
    networks: ["agentdock-net"],
    restart: "unless-stopped",
  };

  for (const agent of design.agents) {
    const peers = getPeerAgents(agent.id, design);
    const hasSeedFiles = (agent as any).seedFiles?.length > 0;
    services[agent.id] = {
      build: { context: "./agent-runtime" },
      volumes: [
        `memory-${agent.id}:/memory`,
        `./configs/agents/${agent.id}.yaml:/app/config/agent.yaml:ro`,
        ...(hasSeedFiles ? [`./configs/seed/${agent.id}:/app/seed:ro`] : []),
      ],
      environment: [
        `AGENT_ID=${agent.id}`,
        "SYSTEM_ID=${SYSTEM_ID}",
        "LLM_GATEWAY_URL=http://llm-gateway:5000",
        "ORCHESTRATOR_URL=http://orchestrator:4000",
        ...(peers ? [`PEER_AGENTS=${peers}`] : []),
        // Inject any MCP env var stubs
        ...agent.mcps.flatMap((mcp) => Object.keys(mcp.env || {}).map((k) => `${k}=\${${k}:-}`)),
      ],
      networks: ["agentdock-net"],
      restart: "unless-stopped",
      // NO ports — zero host port exposure
    };
  }

  const volumes: Record<string, null> = {};
  for (const agent of design.agents) {
    volumes[`memory-${agent.id}`] = null;
  }

  return yaml.dump(
    {
      services,
      networks: { "agentdock-net": { driver: "bridge" } },
      volumes,
    },
    { lineWidth: 120 }
  );
}
