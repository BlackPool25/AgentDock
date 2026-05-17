import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { agentsApi } from "../api/agents.api.js";
import { LogViewer } from "../components/views/LogViewer.js";
import { MemoryViewer } from "../components/views/MemoryViewer.js";
import { ChatInterface } from "../components/views/ChatInterface.js";

const TABS = ["Status", "Logs", "Memory", "Chat", "Tasks"] as const;
type Tab = (typeof TABS)[number];

export function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState<Tab>("Status");

  const { data: status } = useQuery({
    queryKey: ["agent-status", id],
    queryFn: () => agentsApi.status(id!),
    enabled: !!id,
    refetchInterval: 5000,
  });

  if (!id) return null;

  return (
    <div className="flex flex-col h-full p-4">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-lg font-bold">{id}</h1>
        <span className={`text-xs px-2 py-0.5 rounded-full ${status?.status === "running" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
          {status?.status ?? "unknown"}
        </span>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "Status" && (
          <div className="space-y-2 text-sm">
            <div className="bg-card rounded p-3 border border-border">
              <div className="text-muted-foreground text-xs mb-1">Uptime</div>
              <div>{status?.uptime ? `${Math.floor(status.uptime)}s` : "—"}</div>
            </div>
            <div className="bg-card rounded p-3 border border-border">
              <div className="text-muted-foreground text-xs mb-1">Current Task</div>
              <div>{status?.currentTask ?? "Idle"}</div>
            </div>
            <div className="bg-card rounded p-3 border border-border">
              <div className="text-muted-foreground text-xs mb-1">Memory Files</div>
              <div>{status?.memoryFiles?.length ?? 0} files</div>
            </div>
          </div>
        )}
        {tab === "Logs" && <LogViewer agentId={id} />}
        {tab === "Memory" && <MemoryViewer agentId={id} />}
        {tab === "Chat" && <ChatInterface agentId={id} />}
        {tab === "Tasks" && (
          <div className="text-muted-foreground text-sm">Task history coming soon</div>
        )}
      </div>
    </div>
  );
}
