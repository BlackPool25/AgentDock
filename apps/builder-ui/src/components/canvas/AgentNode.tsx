import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Bot, Zap, Globe, Terminal, FileText } from "lucide-react";
import { cn } from "@/lib/utils.js";
import type { AgentNodeData } from "@/stores/canvas.store.js";

const PROVIDER_COLORS: Record<string, string> = {
  ollama: "bg-green-50 text-green-700 border border-green-200/60",
  openai: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
  anthropic: "bg-orange-50 text-orange-700 border border-orange-200/60",
  gemini: "bg-blue-50 text-blue-700 border border-blue-200/60",
  groq: "bg-purple-50 text-purple-700 border border-purple-200/60",
};

// Source handles (outgoing) are on the left/top-left, target handles (incoming) on the right/bottom-right.
// This creates a natural left-to-right flow: source agents on the left, target agents on the right.
const HANDLE_STYLE_SOURCE = "!w-3 !h-3 !bg-primary !border-2 !border-background";
const HANDLE_STYLE_TARGET = "!w-3 !h-3 !bg-muted-foreground/60 !border-2 !border-background";

export const AgentNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as AgentNodeData;
  const providerColor = PROVIDER_COLORS[nodeData.llm?.provider ?? "ollama"] ?? PROVIDER_COLORS["ollama"];
  const actionCount = nodeData.actions?.length ?? 0;
  const triggerTypes = nodeData.triggers?.map((t: { type: string }) => t.type) ?? [];
  const hasWebhook = triggerTypes.includes("webhook");
  const hasCron = triggerTypes.includes("cron");
  const hasTask = triggerTypes.includes("task");
  const hasShell = nodeData.shell?.enabled ?? false;
  const hasMCPs = (nodeData.mcps?.length ?? 0) > 0;
  const outputFiles = (nodeData.actions?.filter((a: { outputFile?: string }) => a.outputFile).map((a: { outputFile?: string }) => a.outputFile) ?? []).filter(Boolean) as string[];

  return (
    <div
      className={cn(
        "min-w-[220px] rounded-lg border bg-card shadow-lg transition-all",
        selected ? "border-primary shadow-primary/20 shadow-md ring-1 ring-primary/40" : "border-border"
      )}
    >
      {/* ── Left side: source (outgoing) handles ── */}
      <Handle
        type="source"
        position={Position.Left}
        id="src-left"
        style={{ top: "50%" }}
        className={HANDLE_STYLE_SOURCE}
        title="Outgoing connection (source)"
      />

      {/* ── Right side: target (incoming) handles ── */}
      <Handle
        type="target"
        position={Position.Right}
        id="tgt-right"
        style={{ top: "50%" }}
        className={HANDLE_STYLE_TARGET}
        title="Incoming connection (target)"
      />

      {/* ── Top handles for vertical flows ── */}
      <Handle
        type="source"
        position={Position.Top}
        id="src-top"
        style={{ left: "35%" }}
        className={HANDLE_STYLE_SOURCE}
        title="Outgoing connection"
      />
      <Handle
        type="target"
        position={Position.Top}
        id="tgt-top"
        style={{ left: "65%" }}
        className={HANDLE_STYLE_TARGET}
        title="Incoming connection"
      />

      {/* ── Bottom handles for vertical flows ── */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="src-bottom"
        style={{ left: "35%" }}
        className={HANDLE_STYLE_SOURCE}
        title="Outgoing connection"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="tgt-bottom"
        style={{ left: "65%" }}
        className={HANDLE_STYLE_TARGET}
        title="Incoming connection"
      />

      <div className="p-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded bg-primary/10">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{nodeData.name || "Unnamed Agent"}</p>
            <p className="text-[10px] text-muted-foreground font-mono truncate">{nodeData.id}</p>
          </div>
        </div>

        {/* Provider + key badges */}
        <div className="flex items-center gap-1.5 flex-wrap mb-2">
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded font-mono border", providerColor)}>
            {nodeData.llm?.provider ?? "ollama"}
          </span>
          {hasWebhook && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/60 flex items-center gap-1" title="Webhook trigger enabled">
              <Globe className="w-2.5 h-2.5" /> Webhook
            </span>
          )}
          {hasCron && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 flex items-center gap-1" title="Cron trigger scheduler active">
              <Zap className="w-2.5 h-2.5 animate-pulse" /> Cron
            </span>
          )}
          {hasTask && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200/60" title="Task trigger active">
              Task
            </span>
          )}
          {hasShell && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200/60 flex items-center gap-1" title="Shell terminal access enabled">
              <Terminal className="w-2.5 h-2.5" /> Shell
            </span>
          )}
          {hasMCPs && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200/60" title={`${nodeData.mcps.length} connected MCP tool(s)`}>
              {nodeData.mcps.length} MCP
            </span>
          )}
          {actionCount > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60" title={`${actionCount} custom actions configured`}>
              {actionCount} Act
            </span>
          )}
        </div>

        {/* Output files (important for file_received triggers) */}
        {outputFiles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <FileText className="w-3 h-3 text-muted-foreground" />
            {outputFiles.map((f: string) => (
              <span key={f} className="text-[10px] px-1 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

AgentNode.displayName = "AgentNode";
