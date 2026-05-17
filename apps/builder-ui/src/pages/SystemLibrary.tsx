import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Edit2, Download, Trash2, Bot, Zap, Clock } from "lucide-react";
import { systemsApi } from "@/api/systems.api.js";
import type { SystemSummary } from "@agentdock/shared-types";

export function SystemLibrary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: systems = [], isLoading } = useQuery({
    queryKey: ["systems"],
    queryFn: () => systemsApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => systemsApi.create({ name }),
    onSuccess: (system) => {
      qc.invalidateQueries({ queryKey: ["systems"] });
      setCreating(false);
      setNewName("");
      navigate(`/systems/${system.id}/edit`);
    },
    onError: () => toast.error("Failed to create system"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => systemsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["systems"] }),
    onError: () => toast.error("Failed to delete system"),
  });

  const handleGenerate = async (id: string) => {
    setGenerating(id);
    try {
      await systemsApi.generate(id);
      toast.success("Project generated and downloaded!");
    } catch {
      toast.error("Generation failed — check that the system has at least one agent");
    } finally {
      setGenerating(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">System Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Design, save, and generate multi-agent systems</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" /> New System
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-4 rounded-lg border border-primary/50 bg-card">
          <p className="text-sm font-medium mb-3">New System</p>
          <div className="flex gap-2">
            <input
              autoFocus
              className="input flex-1"
              placeholder="System name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) createMutation.mutate(newName.trim());
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <button
              onClick={() => newName.trim() && createMutation.mutate(newName.trim())}
              disabled={!newName.trim() || createMutation.isPending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              Create
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-border text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading…</div>
      ) : systems.length === 0 ? (
        <div className="text-center py-16">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No systems yet. Create your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {systems.map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              onEdit={() => navigate(`/systems/${system.id}/edit`)}
              onGenerate={() => handleGenerate(system.id)}
              onDelete={() => {
                if (confirm(`Delete "${system.name}"?`)) deleteMutation.mutate(system.id);
              }}
              generating={generating === system.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SystemCard({
  system, onEdit, onGenerate, onDelete, generating,
}: {
  system: SystemSummary;
  onEdit: () => void;
  onGenerate: () => void;
  onDelete: () => void;
  generating: boolean;
}) {
  return (
    <div className="p-5 rounded-xl border border-border bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{system.name}</h3>
          {system.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{system.description}</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground ml-2 shrink-0">v{system.version}</span>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
        <span className="flex items-center gap-1"><Bot className="w-3 h-3" /> {system.agentCount} agents</span>
        <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> {system.triggerCount} connections</span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(system.updatedAt).toLocaleDateString()}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs hover:border-primary/50 transition-colors"
        >
          <Edit2 className="w-3 h-3" /> Edit
        </button>
        <button
          onClick={onGenerate}
          disabled={generating}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Download className="w-3 h-3" /> {generating ? "Generating…" : "Generate"}
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg border border-border text-destructive hover:border-destructive/50 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
