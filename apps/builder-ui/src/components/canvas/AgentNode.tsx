import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Cpu, Zap } from "lucide-react";
import { cn } from "@/lib/utils.js";
import type { AgentNodeData } from "@/stores/canvas.store.js";

const PROVIDER_COLORS: Record<string, string> = {
  ollama: "bg-green-500/20 text-green-400",
  openai: "bg-emerald-500/20 text-emerald-400",
  anthropic: "bg-orange-500/20 text-orange-400",
  gemini: "bg-blue-500/20 text-blue-400",
  groq: "bg-purple-500/20 text-purple-400",
};

export const AgentNode = memo(({ data, selected }: NodeProps<AgentNodeData>) => {
  const providerColor = PROVIDER_COLORS[data.llm?.provider ?? "ollama"] ?? PROVIDER_COLORS["ollama"];

  return (
    <div
      className={cn(
        "min-w-[180px] rounded-lg border bg-card shadow-lg transition-all",
        selected ? "border-primary shadow-primary/20" : "border-border"
      )}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3" />

      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{data.name || "Unnamed Agent"}</p>
            <p className="text-xs text-muted-foreground font-mono truncate">{data.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={cn("text-xs px-1.5 py-0.5 rounded font-mono", providerColor)}>
            {data.llm?.provider ?? "ollama"}
          </span>
          {data.triggers?.some((t) => t.type === "cron") && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> cron
            </span>
          )}
          {data.expose?.includes("chat") && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400">chat</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!w-3 !h-3" />
    </div>
  );
});

AgentNode.displayName = "AgentNode";
