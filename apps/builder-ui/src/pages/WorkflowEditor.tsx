import { useEffect, useRef, useCallback, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save, Download, Bot, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { Canvas } from "@/components/canvas/Canvas.js";
import { AgentConfigPanel } from "@/components/panels/AgentConfigPanel.js";
import { TriggerPanel } from "@/components/panels/TriggerPanel.js";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { useSystemStore } from "@/stores/system.store.js";
import { systemsApi } from "@/api/systems.api.js";
import type { AgentDesign, ConnectionDesign } from "@agentdock/config-schema";
import type { CanvasState } from "@agentdock/shared-types";

interface ValidationIssue {
  agentId: string;
  agentName: string;
  message: string;
  severity: "error" | "warning";
}

function validatePipeline(nodes: any[], edges: any[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const node of nodes) {
    const data = node.data as AgentDesign;
    const agentId = data.id;
    const agentName = data.name;

    if (!data.llm.model.trim()) {
      issues.push({ agentId, agentName, message: "LLM model is empty", severity: "error" });
    }
    if (!data.llm.systemPrompt.trim()) {
      issues.push({ agentId, agentName, message: "System prompt is empty", severity: "warning" });
    }
    if (data.triggers.length === 0) {
      issues.push({ agentId, agentName, message: "No triggers — agent cannot be activated", severity: "error" });
    }
    // Check if agent has file_received incoming edges but no actions with output_file
    const incomingEdges = edges.filter((e: any) => e.target === node.id);
    const hasFileReceivedTrigger = incomingEdges.some((e: any) =>
      (e.data as any)?.trigger?.type === "file_received"
    );
    if (hasFileReceivedTrigger && !data.actions?.some((a: any) => a.outputFile)) {
      issues.push({ agentId, agentName, message: "Has file_received trigger but no actions with output_file", severity: "error" });
    }
    // Check if agent has outgoing file_received edges but source has no output_file
    const outgoingEdges = edges.filter((e: any) => e.source === node.id);
    for (const edge of outgoingEdges) {
      const trigger = (edge.data as any)?.trigger;
      if (trigger?.type === "file_received" && !data.actions?.some((a: any) => a.outputFile)) {
        const targetName = nodes.find((n: any) => n.id === edge.target)?.data?.name ?? edge.target;
        issues.push({ agentId, agentName, message: `No output_file — file_received trigger to ${targetName} will never fire`, severity: "error" });
      }
    }
  }

  return issues;
}

export function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setNodes, setEdges, nodes, edges, selectedNodeId, selectedEdgeId, addAgentNode } = useCanvasStore();
  const { current, setCurrent, saveStatus, setSaveStatus } = useSystemStore();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generatingRef = useRef(false);
  const [showValidation, setShowValidation] = useState(false);

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

    // Validate before generating
    const issues = validatePipeline(nodes, edges);
    const errors = issues.filter(i => i.severity === "error");
    const warnings = issues.filter(i => i.severity === "warning");

    if (errors.length > 0) {
      setShowValidation(true);
      toast.error(`Cannot generate: ${errors.length} error(s) found`);
      return;
    }

    if (warnings.length > 0) {
      setShowValidation(true);
      // Still allow generation with warnings
    }

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

  const validationIssues = validatePipeline(nodes, edges);
  const errorCount = validationIssues.filter(i => i.severity === "error").length;
  const warningCount = validationIssues.filter(i => i.severity === "warning").length;

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card shrink-0">
        <button onClick={() => navigate("/")} className="p-1.5 rounded hover:bg-muted transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="font-semibold text-sm flex-1 truncate">{current?.name ?? "Loading…"}</h1>
        <span className={`text-xs ${saveStatusColor}`}>{saveStatusLabel}</span>

        {/* Validation indicator */}
        {validationIssues.length > 0 && (
          <button
            onClick={() => setShowValidation(!showValidation)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              errorCount > 0 ? "bg-red-500/20 text-red-400 hover:bg-red-500/30" : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            )}
          >
            <AlertTriangle className="w-3 h-3" />
            {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? "s" : ""}` : ""}
            {errorCount > 0 && warningCount > 0 ? ", " : ""}
            {warningCount > 0 ? `${warningCount} warning${warningCount > 1 ? "s" : ""}` : ""}
          </button>
        )}

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

          {/* Quick tips */}
          <div className="mt-6 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tips</p>
            <ul className="text-[10px] text-muted-foreground space-y-1">
              <li>• Click agent to configure</li>
              <li>• Drag from handles to connect</li>
              <li>• Click edge to set trigger</li>
              <li>• Add actions with output_file for file_received triggers</li>
            </ul>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>

          {/* Validation panel overlay */}
          {showValidation && validationIssues.length > 0 && (
            <div className="absolute top-4 left-4 right-4 max-w-lg mx-auto bg-card border border-border rounded-lg shadow-xl z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Pipeline Validation
                </h3>
                <button onClick={() => setShowValidation(false)} className="p-1 hover:bg-muted rounded">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto space-y-2">
                {validationIssues.map((issue, i) => (
                  <div key={i} className={cn(
                    "flex items-start gap-2 p-2 rounded text-xs",
                    issue.severity === "error" ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-400"
                  )}>
                    {issue.severity === "error" ? (
                      <X className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <span className="font-mono font-medium">{issue.agentName}</span>
                      <p className="text-muted-foreground mt-0.5">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 border-t border-border flex justify-between">
                <span className="text-xs text-muted-foreground">
                  {errorCount} error{errorCount !== 1 ? "s" : ""}, {warningCount} warning{warningCount !== 1 ? "s" : ""}
                </span>
                {errorCount === 0 && (
                  <button
                    onClick={() => { setShowValidation(false); handleGenerate(); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Generate anyway →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — context panel */}
        {(selectedNodeId || selectedEdgeId) && (
          <div className="w-80 border-l border-border bg-card shrink-0 overflow-y-auto">
            {selectedNodeId && <AgentConfigPanel nodeId={selectedNodeId} />}
            {selectedEdgeId && <TriggerPanel edgeId={selectedEdgeId} />}
          </div>
        )}
      </div>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
