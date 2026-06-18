import { Play, Square, Save, Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { WorkflowConfig } from "@agentdock/config-schema";
import { systemsApi } from "../../api/systems.api.js";
import { workflowsApi } from "../../api/workflows.api.js";
import { useWorkflowStore } from "../../stores/workflow.store.js";
import { toast } from "sonner";

export function Toolbar() {
  const { currentWorkflow, nodes, edges, isDirty, markClean } = useWorkflowStore();

  const startMutation = useMutation({
    mutationFn: () => systemsApi.start(currentWorkflow!.system.id),
    onSuccess: () => toast.success("System deploying…"),
    onError: () => toast.error("Failed to start system"),
  });

  const stopMutation = useMutation({
    mutationFn: () => systemsApi.stop(currentWorkflow!.system.id),
    onSuccess: () => toast.success("System stopped"),
    onError: () => toast.error("Failed to stop system"),
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!currentWorkflow) throw new Error("No workflow loaded");
      const updated: WorkflowConfig = {
        ...currentWorkflow,
        agents: nodes.map((n) => ({ ref: n.id, position: n.position })),
        connections: edges.map((e) => ({
          id: e.id,
          from: e.source,
          to: e.target,
          trigger: ((e.data as { trigger?: any })?.trigger ?? { type: "task_completion", pass_output: true }),
          label: e.label as string | undefined,
          data_mapping: (e.data as { data_mapping?: any })?.data_mapping ?? [],
        })),
      };
      return workflowsApi.update(currentWorkflow.workflow.id, updated);
    },
    onSuccess: () => { markClean(); toast.success("Workflow saved"); },
    onError: () => toast.error("Failed to save workflow"),
  });

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card">
      <span className="text-sm font-semibold text-foreground mr-2">
        {currentWorkflow?.workflow.name ?? "No workflow"}
        {isDirty && <span className="ml-1 text-amber-500 font-bold" title="Unsaved changes">●</span>}
      </span>

      <button
        onClick={() => saveMutation.mutate()}
        disabled={!isDirty || saveMutation.isPending}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground font-semibold disabled:opacity-50 transition-colors"
      >
        <Save size={14} /> Save
      </button>

      <button
        onClick={() => startMutation.mutate()}
        disabled={!currentWorkflow || startMutation.isPending}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50 transition-colors"
      >
        <Play size={14} /> Deploy
      </button>

      <button
        onClick={() => stopMutation.mutate()}
        disabled={!currentWorkflow || stopMutation.isPending}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50 transition-colors"
      >
        <Square size={14} /> Stop
      </button>
    </div>
  );
}
