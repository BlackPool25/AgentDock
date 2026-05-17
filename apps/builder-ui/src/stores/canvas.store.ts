import { create } from "zustand";
import {
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  addEdge,
} from "@xyflow/react";
import { nanoid } from "nanoid";
import type { AgentDesign, ConnectionDesign } from "@agentdock/config-schema";

export type AgentNodeData = AgentDesign & Record<string, unknown>;

export interface TriggerEdgeData {
  trigger: ConnectionDesign["trigger"];
}
export type TriggerEdgeDataRecord = TriggerEdgeData & Record<string, unknown>;

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;

  updateNodeData: (id: string, data: Partial<AgentNodeData>) => void;
  updateEdgeData: (id: string, data: Partial<TriggerEdgeData>) => void;

  addAgentNode: (position: { x: number; y: number }) => void;
}

let nodeCounter = 0;

function defaultAgent(id: string): AgentNodeData {
  return {
    id,
    name: "New Agent",
    description: "",
    position: { x: 0, y: 0 },
    llm: { provider: "ollama", model: "llama3.1:8b", temperature: 0.7, maxTokens: 4096, systemPrompt: "" },
    memory: { gitAutoCommit: true, readableBy: [] },
    shell: { enabled: false },
    mcps: [],
    tools: { pythonPackages: [], systemPackages: [] },
    triggers: [{ type: "task" }],
    expose: ["status", "logs"],
  };
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,

  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) =>
    set({ nodes: applyNodeChanges(changes, get().nodes) }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) }),

  onConnect: (connection) => {
    const id = `edge-${nanoid(6)}`;
    const newEdge: Edge = {
      ...connection,
      id,
      type: "trigger",
      data: { trigger: { type: "task_completion", passOutput: true } } as TriggerEdgeDataRecord,
    };
    set({
      edges: addEdge(newEdge, get().edges),
      // Auto-select the new edge so TriggerPanel opens immediately
      selectedEdgeId: id,
      selectedNodeId: null,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  updateNodeData: (id, data) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }),

  updateEdgeData: (id, data) =>
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, ...data } as TriggerEdgeDataRecord } : e
      ),
    }),

  addAgentNode: (position) => {
    nodeCounter++;
    const id = `agent-${nodeCounter}`;
    const node: Node = {
      id,
      type: "agent",
      position,
      data: defaultAgent(id),
    };
    set({ nodes: [...get().nodes, node] });
  },
}));
