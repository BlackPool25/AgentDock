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

  return (
    <div className="flex flex-col h-full bg-card border-l border-border w-80">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="font-semibold text-sm">{agentId}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
      </div>

      <div className="flex gap-1 px-3 pt-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-2 py-1 text-xs rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>
    </div>
  );
}
