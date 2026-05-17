import { useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Download, Bot } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "@/components/canvas/Canvas.js";
import { AgentConfigPanel } from "@/components/panels/AgentConfigPanel.js";
import { TriggerPanel } from "@/components/panels/TriggerPanel.js";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { useSystemStore } from "@/stores/system.store.js";
import { systemsApi } from "@/api/systems.api.js";
import type { AgentDesign, ConnectionDesign } from "@agentdock/config-schema";
import type { CanvasState } from "@agentdock/shared-types";

export function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setNodes, setEdges, nodes, edges, selectedNodeId, selectedEdgeId, addAgentNode } = useCanvasStore();
  const { current, setCurrent, saveStatus, setSaveStatus } = useSystemStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [generating, setGenerating] = [false, (_: boolean) => {}]; // local state via ref
  const generatingRef = useRef(false);

  const { data: system } = useQuery({
    queryKey: ["system", id],
    queryFn: () => systemsApi.get(id!),
    enabled: !!id,
  });

  // Load canvas from DB on mount
  useEffect(() => {
    if (!system) return;
    setCurrent(system);
    const canvas = system.canvasState;
    setNodes(canvas.nodes.map((n) => ({
      ...n,
      type: n.type ?? "agent",
      data: n.data as AgentDesign,
    })) as Parameters<typeof setNodes>[0]);
    setEdges(canvas.edges.map((e) => ({
      ...e,
      type: "trigger",
      data: e.data as { trigger: ConnectionDesign["trigger"] },
    })) as Parameters<typeof setEdges>[0]);
  }, [system, setCurrent, setNodes, setEdges]);

  const saveMutation = useMutation({
    mutationFn: (canvas: CanvasState) =>
      systemsApi.update(id!, { canvasState: canvas }),
    onSuccess: () => setSaveStatus("saved"),
    onError: () => { setSaveStatus("error"); toast.error("Save failed"); },
  });

  // Debounced auto-save
  const triggerSave = useCallback(() => {
    setSaveStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setSaveStatus("saving");
      const canvas: CanvasState = {
        nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? "agent", position: n.position, data: n.data as Record<string, unknown> })),
        edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> })),
      };
      saveMutation.mutate(canvas);
    }, 2000);
  }, [nodes, edges, setSaveStatus, saveMutation]);

  // Watch canvas changes for auto-save
  useEffect(() => {
    if (!system) return;
    triggerSave();
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (generatingRef.current) return;
    generatingRef.current = true;
    try {
      await systemsApi.generate(id!);
      toast.success("Project generated and downloaded!");
    } catch {
      toast.error("Generation failed — ensure all agents have IDs and LLM models configured");
    } finally {
      generatingRef.current = false;
    }
  };

  const saveStatusLabel = { saved: "Saved", saving: "Saving…", unsaved: "Unsaved", error: "Save failed" }[saveStatus];
  const saveStatusColor = { saved: "text-green-400", saving: "text-yellow-400", unsaved: "text-muted-foreground", error: "text-destructive" }[saveStatus];

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/")} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-sm flex-1 truncate">{current?.name ?? "Loading…"}</h1>
        <span className={`text-xs ${saveStatusColor}`}>{saveStatusLabel}</span>
        <button
          onClick={() => {
            setSaveStatus("saving");
            const canvas: CanvasState = {
              nodes: nodes.map((n) => ({ id: n.id, type: n.type ?? "agent", position: n.position, data: n.data as Record<string, unknown> })),
              edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data as Record<string, unknown> })),
            };
            saveMutation.mutate(canvas);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs hover:border-primary/50 transition-colors"
        >
          <Save className="w-3 h-3" /> Save
        </button>
        <button
          onClick={handleGenerate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:opacity-90 transition-opacity"
        >
          <Download className="w-3 h-3" /> Generate
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — agent palette */}
        <div className="w-48 border-r border-border bg-card p-3 shrink-0">
          <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">Palette</p>
          <div
            draggable
            onDragStart={(e) => e.dataTransfer.setData("application/agentdock-node", "agent")}
            className="flex items-center gap-2 p-2 rounded-lg border border-border cursor-grab hover:border-primary/50 transition-colors"
          >
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-xs">Agent</span>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Drag onto canvas to add an agent</p>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
        </div>

        {/* Right sidebar — context panel */}
        {(selectedNodeId || selectedEdgeId) && (
          <div className="w-72 border-l border-border bg-card shrink-0 overflow-y-auto">
            {selectedNodeId && <AgentConfigPanel nodeId={selectedNodeId} />}
            {selectedEdgeId && <TriggerPanel edgeId={selectedEdgeId} />}
          </div>
        )}
      </div>
    </div>
  );
}
