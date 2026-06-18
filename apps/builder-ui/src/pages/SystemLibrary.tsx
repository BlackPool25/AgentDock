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

  const [deleteTarget, setDeleteTarget] = useState<SystemSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "date" | "version">("date");

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["systems"] });
      toast.success("System deleted");
    },
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

  const filteredSystems = systems
    .filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description ?? "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "version") return b.version - a.version;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">System Library</h1>
          <p className="text-sm text-muted-foreground mt-1">Design, save, and generate multi-agent systems</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
        >
          <Plus className="w-4 h-4" /> New System
        </button>
      </div>

      {/* Search and Sort controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between mb-8 border-b border-border pb-4">
        <input
          type="text"
          placeholder="Search systems by name or description…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input w-full sm:max-w-md text-xs px-3.5 py-2 font-medium"
        />
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide">Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="input text-xs px-3 py-1.5 w-32 cursor-pointer font-semibold bg-background"
          >
            <option value="date">Last Saved</option>
            <option value="name">Name</option>
            <option value="version">Version</option>
          </select>
        </div>
      </div>

      {creating && (
        <div className="mb-6 p-4 rounded-lg border border-primary/20 bg-card shadow-sm">
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
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-opacity"
            >
              Create
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 rounded-lg border border-border text-sm font-semibold hover:bg-muted transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground italic">Loading…</div>
      ) : filteredSystems.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card">
          <Bot className="w-12 h-12 text-muted-foreground mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground font-medium">No matching systems found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSystems.map((system) => (
            <SystemCard
              key={system.id}
              system={system}
              onEdit={() => navigate(`/systems/${system.id}/edit`)}
              onGenerate={() => handleGenerate(system.id)}
              onDelete={() => setDeleteTarget(system)}
              generating={generating === system.id}
            />
          ))}
        </div>
      )}

      {/* Page count indicator */}
      {!isLoading && systems.length > 0 && (
        <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground text-center mt-8 pb-4">
          Showing {filteredSystems.length} of {systems.length} systems
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50 p-4">
          <div className="bg-card border border-border p-6 rounded-xl shadow-xl w-full max-w-sm">
            <h3 className="text-lg font-bold text-foreground mb-2">Delete System</h3>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              Are you sure you want to delete <span className="font-semibold text-foreground">"{deleteTarget.name}"</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteMutation.mutate(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                Delete
              </button>
            </div>
          </div>
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
  const formattedDate = new Date(system.updatedAt).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const formattedTime = new Date(system.updatedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="p-5 rounded-xl border border-border bg-card hover:shadow-md hover:bg-muted/10 transition-all flex flex-col justify-between min-h-[160px]">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0 pr-2">
            <h3 className="font-bold text-foreground truncate" title={system.name}>{system.name}</h3>
            {system.description && system.description !== "test" ? (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{system.description}</p>
            ) : (
              <p className="text-xs text-muted-foreground/50 italic mt-0.5 line-clamp-2 leading-relaxed">No description added</p>
            )}
          </div>
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0 cursor-help"
            title="System version (auto-increments on save)"
          >
            v{system.version}
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
          <span className="flex items-center gap-1 cursor-help" title="Number of configured agents">
            <Bot className="w-3.5 h-3.5 text-primary" /> {system.agentCount}
          </span>
          <span className="flex items-center gap-1 cursor-help" title="Number of active trigger connections">
            <Zap className="w-3.5 h-3.5 text-amber-500" /> {system.triggerCount}
          </span>
          <span className="flex items-center gap-1 cursor-help ml-auto text-[11px]" title={`Last modified on ${formattedDate} at ${formattedTime}`}>
            <Clock className="w-3.5 h-3.5 text-muted-foreground/60" /> {formattedDate} {formattedTime}
          </span>
        </div>
      </div>

      <div className="flex gap-2 border-t border-border/50 pt-3">
        <button
          onClick={onEdit}
          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted transition-colors"
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
