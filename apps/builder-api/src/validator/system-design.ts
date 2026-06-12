import type { CanvasState } from "@agentdock/shared-types";
import type { SystemDesign, AgentDesign, ConnectionDesign } from "@agentdock/config-schema";

export interface ValidationError {
  field: string;
  message: string;
}

export function canvasToSystemDesign(
  systemId: string,
  systemName: string,
  canvas: CanvasState
): { design: SystemDesign; errors: ValidationError[] } {
  const errors: ValidationError[] = [];

  const agents: AgentDesign[] = canvas.nodes
    .filter((n) => n.type === "agent")
    .map((n) => {
      const d = n.data as unknown as AgentDesign;
      // Ensure actions array exists and position is copied from node
      return { 
        ...d, 
        actions: d.actions ?? [],
        position: n.position
      };
    });

  // Build a map from node UUID → agentId for edge resolution
  const nodeUuidToAgentId = new Map<string, string>();
  canvas.nodes.filter(n => n.type === "agent").forEach(n => {
    nodeUuidToAgentId.set(n.id, (n.data as any).id ?? n.id);
  });

  const connections: ConnectionDesign[] = canvas.edges.map((e) => {
    const edgeData = e.data as {
      trigger?: ConnectionDesign["trigger"];
      label?: string;
      description?: string;
      dataMapping?: Array<{ from: string; to: string }>;
    } | undefined;

    return {
      id: e.id,
      // Resolve node UUID → agentId; fall back to the raw value if not found
      from: nodeUuidToAgentId.get(e.source) ?? e.source,
      to: nodeUuidToAgentId.get(e.target) ?? e.target,
      label: edgeData?.label || undefined,
      description: edgeData?.description || undefined,
      dataMapping: edgeData?.dataMapping ?? [],
      trigger: edgeData?.trigger ?? { type: "task_completion", passOutput: true },
    };
  });

  // Validate agents
  const agentIds = new Set(agents.map((a) => a.id));
  for (const agent of agents) {
    if (!agent.id) errors.push({ field: `agent.id`, message: "Agent ID is required" });
    if (!agent.name) errors.push({ field: `agent.${agent.id}.name`, message: "Agent name is required" });
    if (!agent.llm?.model) errors.push({ field: `agent.${agent.id}.llm.model`, message: "LLM model is required" });
  }

  // Validate connections reference valid agents
  for (const conn of connections) {
    if (!agentIds.has(conn.from)) {
      errors.push({ field: `connection.${conn.id}.from`, message: `Agent '${conn.from}' not found` });
    }
    if (!agentIds.has(conn.to)) {
      errors.push({ field: `connection.${conn.id}.to`, message: `Agent '${conn.to}' not found` });
    }
  }

  if (agents.length === 0) {
    errors.push({ field: "agents", message: "At least one agent is required" });
  }

  return {
    design: { systemId, systemName, agents, connections },
    errors,
  };
}
