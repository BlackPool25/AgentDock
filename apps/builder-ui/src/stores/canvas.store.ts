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
import type { AgentDesign, ConnectionDesign } from "@agentdock/config-schema";

export type AgentNodeData = AgentDesign;

export interface TriggerEdgeData {
  trigger: ConnectionDesign["trigger"];
}

interface CanvasStore {
  nodes: Node<AgentNodeData>[];
  edges: Edge<TriggerEdgeData>[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  setNodes: (nodes: Node<AgentNodeData>[]) => void;
  setEdges: (edges: Edge<TriggerEdgeData>[]) => void;
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
    set({ nodes: applyNodeChanges(changes, get().nodes) as Node<AgentNodeData>[] }),

  onEdgesChange: (changes) =>
    set({ edges: applyEdgeChanges(changes, get().edges) as Edge<TriggerEdgeData>[] }),

  onConnect: (connection) =>
    set({
      edges: addEdge(
        { ...connection, type: "trigger", data: { trigger: { type: "task_completion", passOutput: true } } },
        get().edges
      ) as Edge<TriggerEdgeData>[],
    }),

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
        e.id === id ? { ...e, data: { ...e.data, ...data } as TriggerEdgeData } : e
      ),
    }),

  addAgentNode: (position) => {
    nodeCounter++;
    const id = `agent-${nodeCounter}`;
    const node: Node<AgentNodeData> = {
      id,
      type: "agent",
      position,
      data: defaultAgent(id),
    };
    set({ nodes: [...get().nodes, node] });
  },
}));
