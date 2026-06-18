import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../../api/agents.api.js";
import { toast } from "sonner";

interface Props {
  agentId: string;
  onClose: () => void;
}

const TABS = ["General", "LLM", "Memory", "Shell", "MCPs", "Expose"] as const;
type Tab = (typeof TABS)[number];

export function AgentConfigPanel({ agentId, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("General");
  const qc = useQueryClient();

  const { data: config, isLoading } = useQuery({
    queryKey: ["agent-config", agentId],
    queryFn: () => agentsApi.getConfig(agentId),
  });

  const updateMutation = useMutation({
    mutationFn: (cfg: unknown) => agentsApi.updateConfig(agentId, cfg),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["agent-config", agentId] });
      toast.success("Config saved — agent reloading");
    },
    onError: () => toast.error("Failed to save config"),
  });

  if (isLoading) return <div className="p-4 text-muted-foreground text-sm">Loading…</div>;

  const data = (config ?? {}) as any;

  return (
    <div className="absolute right-0 top-0 bottom-0 md:relative w-full md:w-80 h-full bg-card border-l border-border flex flex-col z-50 shadow-2xl md:shadow-none">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm truncate pr-2">{data.name || agentId}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none p-1">×</button>
      </div>

      <div className="flex gap-1 px-3 pt-2 flex-wrap border-b border-border/50 pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${tab === t ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === "General" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Agent ID</label>
              <div className="text-xs font-mono mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 select-all">{data.id || agentId}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Display Name</label>
              <div className="text-sm font-medium mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40">{data.name || "—"}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Description</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 whitespace-pre-wrap text-muted-foreground leading-relaxed">{data.description || "No description provided."}</div>
            </div>
          </div>
        )}

        {tab === "LLM" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Provider</label>
                <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono capitalize">{data.llm?.provider || "—"}</div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Model</label>
                <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono truncate" title={data.llm?.model}>{data.llm?.model || "—"}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Temperature</label>
                <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono">{data.llm?.temperature ?? "—"}</div>
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Max Tokens</label>
                <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono">{data.llm?.maxTokens ?? "—"}</div>
              </div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">System Prompt</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto text-muted-foreground leading-relaxed">{data.llm?.systemPrompt || "No custom system prompt."}</div>
            </div>
          </div>
        )}

        {tab === "Memory" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Git Auto Commit</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono font-medium text-foreground">{data.memory?.gitAutoCommit ? "Enabled" : "Disabled"}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Readable By</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono text-muted-foreground">
                {data.memory?.readableBy && data.memory.readableBy.length > 0
                  ? data.memory.readableBy.join(", ")
                  : "No restrictions"}
              </div>
            </div>
          </div>
        )}

        {tab === "Shell" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Shell Execution</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono font-medium text-foreground">{data.shell?.enabled ? "Enabled" : "Disabled"}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Access Level</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono capitalize">{data.shell?.level || "—"}</div>
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Allowed Commands</label>
              <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 font-mono text-muted-foreground">
                {data.shell?.allowed_commands && data.shell.allowed_commands.length > 0
                  ? data.shell.allowed_commands.join(", ")
                  : "None"}
              </div>
            </div>
          </div>
        )}

        {tab === "MCPs" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Connected Server MCPs</label>
              {data.mcps && data.mcps.length > 0 ? (
                <div className="space-y-2 mt-1">
                  {data.mcps.map((m: any, idx: number) => (
                    <div key={idx} className="text-xs p-2.5 rounded-lg border border-border bg-muted/40">
                      <div className="font-semibold text-foreground">{m.name}</div>
                      <div className="text-muted-foreground text-[10px] font-mono mt-0.5 break-all">{m.url || m.command}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs mt-1 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 text-muted-foreground italic">No MCP servers connected.</div>
              )}
            </div>
          </div>
        )}

        {tab === "Expose" && (
          <div className="space-y-3">
            <div>
              <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Exposed Capabilities</label>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {data.expose && data.expose.length > 0 ? (
                  data.expose.map((exp: string) => (
                    <span key={exp} className="text-[10px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 capitalize font-semibold tracking-wide">
                      {exp}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground italic">None</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
