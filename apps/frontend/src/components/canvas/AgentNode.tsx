import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useWsStore } from "../../stores/ws.store.js";
import type { AgentStatus } from "@agentdock/shared-types";

const STATUS_COLORS: Record<AgentStatus, string> = {
  running: "bg-green-500",
  stopped: "bg-gray-500",
  error: "bg-red-500",
  starting: "bg-yellow-500",
  restarting: "bg-orange-500",
};

interface AgentNodeData {
  agentId: string;
  label: string;
}

export function AgentNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  const statuses = useWsStore((s) => s.agentStatuses);
  const status = statuses.get(nodeData.agentId) ?? "stopped";

  return (
    <div
      className={`
        min-w-[160px] rounded-lg border px-4 py-3 shadow-lg
        bg-card text-card-foreground
        ${selected ? "border-primary ring-1 ring-primary" : "border-border"}
      `}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary" />

      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status]}`} />
        <span className="text-sm font-medium truncate max-w-[120px]">{nodeData.label}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{status}</div>

      <Handle type="source" position={Position.Right} className="!bg-primary" />
    </div>
  );
}
