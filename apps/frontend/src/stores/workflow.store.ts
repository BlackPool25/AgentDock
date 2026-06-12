import { create } from "zustand";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowConfig } from "@agentdock/config-schema";

interface WorkflowState {
  nodes: Node[];
  edges: Edge[];
  currentWorkflow: WorkflowConfig | null;
  isDirty: boolean;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setWorkflow: (workflow: WorkflowConfig) => void;
  markDirty: () => void;
  markClean: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  nodes: [],
  edges: [],
  currentWorkflow: null,
  isDirty: false,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),
  setWorkflow: (workflow) => {
    const nodes: Node[] = workflow.agents.map((a) => ({
      id: a.ref,
      type: "agentNode",
      position: a.position,
      data: { agentId: a.ref, label: a.ref },
    }));
    const edges: Edge[] = workflow.connections.map((c) => ({
      id: c.id,
      source: c.from,
      target: c.to,
      type: "triggerEdge",
      label: c.label,
      data: { trigger: c.trigger },
    }));
    set({ nodes, edges, currentWorkflow: workflow, isDirty: false });
  },
  markDirty: () => set({ isDirty: true }),
  markClean: () => set({ isDirty: false }),
}));
