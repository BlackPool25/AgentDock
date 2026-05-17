import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Zap } from "lucide-react";
import { cn } from "@/lib/utils.js";
import type { AgentNodeData } from "@/stores/canvas.store.js";

const PROVIDER_COLORS: Record<string, string> = {
  ollama: "bg-green-500/20 text-green-400",
  openai: "bg-emerald-500/20 text-emerald-400",
  anthropic: "bg-orange-500/20 text-orange-400",
  gemini: "bg-blue-500/20 text-blue-400",
  groq: "bg-purple-500/20 text-purple-400",
};

// Each side has both a source and target handle with unique IDs.
// React Flow picks the shortest path automatically.
const SIDES = [
  { position: Position.Top,    sourceId: "src-top",    targetId: "tgt-top"    },
  { position: Position.Bottom, sourceId: "src-bottom", targetId: "tgt-bottom" },
  { position: Position.Left,   sourceId: "src-left",   targetId: "tgt-left"   },
  { position: Position.Right,  sourceId: "src-right",  targetId: "tgt-right"  },
];

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as AgentNodeData;
  const providerColor = PROVIDER_COLORS[nodeData.llm?.provider ?? "ollama"] ?? PROVIDER_COLORS["ollama"];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card shadow-lg transition-all",
        selected ? "border-primary shadow-primary/20" : "border-border"
      )}
    >
      {SIDES.map(({ position, sourceId, targetId }) => (
        <span key={sourceId}>
          <Handle
            type="source"
            position={position}
            id={sourceId}
            className="!w-2.5 !h-2.5 !bg-primary !border-primary/50"
          />
          <Handle
            type="target"
            position={position}
            id={targetId}
            className="!w-2.5 !h-2.5 !bg-muted !border-border"
          />
        </span>
      ))}

      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{nodeData.name || "Unnamed Agent"}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">{nodeData.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", providerColor)}>
            {nodeData.llm?.provider ?? "ollama"}
          </span>
          {nodeData.triggers?.some((t) => t.type === "cron") && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> cron
            </span>
          )}
          {nodeData.expose?.includes("chat") && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">chat</span>
          )}
          {nodeData.expose?.includes("tasks") && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">tasks</span>
          )}
        </div>
      </div>
    </div>
  );
});

AgentNode.displayName = "AgentNode";
