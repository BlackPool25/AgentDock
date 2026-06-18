import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { systemsApi } from "../api/systems.api.js";
import { workflowsApi } from "../api/workflows.api.js";
import { Play, Square, Workflow } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function Dashboard() {
  const qc = useQueryClient();
  const { data: systems } = useQuery({
    queryKey: ["systems"],
    queryFn: systemsApi.list,
    refetchInterval: 10000,
  });
  const { data: workflows } = useQuery({
    queryKey: ["workflows"],
    queryFn: workflowsApi.list,
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => systemsApi.start(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["systems"] }); toast.success("System starting…"); },
  });
  const stopMutation = useMutation({
    mutationFn: (id: string) => systemsApi.stop(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["systems"] }); toast.success("System stopped"); },
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Systems</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {systems?.map((s) => (
            <div key={s.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-sm text-foreground">{s.name ?? s.id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${s.status === "running" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"}`}>
                  {s.status}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mb-3 font-medium">{s.agentCount} agents</div>
              <div className="flex gap-2">
                <button
                  onClick={() => startMutation.mutate(s.id)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >
                  <Play size={12} /> Start
                </button>
                <button
                  onClick={() => stopMutation.mutate(s.id)}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
                >
                  <Square size={12} /> Stop
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Workflows</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {workflows?.map((w) => (
            <Link
              key={w.workflow.id}
              to={`/workflows/${w.workflow.id}`}
              className="bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <Workflow size={16} className="text-primary" />
                <span className="font-medium text-sm">{w.workflow.name}</span>
              </div>
              <div className="text-xs text-muted-foreground">{w.agents.length} agents · {w.workflow.version}</div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
