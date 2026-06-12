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
  label?: string;
  description?: string;
  dataMapping?: Array<{ from: string; to: string }>;
}
export type TriggerEdgeDataRecord = TriggerEdgeData & Record<string, unknown>;

interface CanvasStore {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;

  isDirty: boolean;
  setDirty: (dirty: boolean) => void;

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
    llm: { provider: "ollama", model: "qwen3:8b", temperature: 0.7, maxTokens: 4096, systemPrompt: "" },
    memory: { gitAutoCommit: true, readableBy: [] },
    rag: {
      enabled: false,
      embedding_model: "all-MiniLM-L6-v2",
      folders: [],
      max_file_size_kb: 500,
      top_k: 5,
      chunk_size: 500,
      chunk_overlap: 50,
      self_learning: false,
      self_learning_file: "rag-learned.md",
      min_confidence_threshold: 0.3,
    },
    shell: { enabled: false, level: "restricted", allowed_commands: [] },
    mcps: [],
    tools: { pythonPackages: [], systemPackages: [] },
    actions: [],
    triggers: [{ type: "task" }],
    expose: ["status", "logs"],
    seedFiles: [],
    insufficientInput: { enabled: false, message: "I don't have enough information to proceed. Please provide more details.", fallbackAction: "return_error" },
  };
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  isDirty: false,

  setDirty: (isDirty) => set({ isDirty }),
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  onNodesChange: (changes) => {
    const newNodes = applyNodeChanges(changes, get().nodes);
    const hasMeaningfulChange = changes.some(
      (c) => c.type === "remove" || c.type === "add" ||
             (c.type === "position" && !(c as any).dragging)
    );
    set(hasMeaningfulChange ? { nodes: newNodes, isDirty: true } : { nodes: newNodes });
  },

  onEdgesChange: (changes) => {
    const newEdges = applyEdgeChanges(changes, get().edges);
    const hasMeaningfulChange = changes.some((c) => c.type !== "select");
    set(hasMeaningfulChange ? { edges: newEdges, isDirty: true } : { edges: newEdges });
  },

  onConnect: (connection) => {
    const id = `edge-${nanoid(6)}`;
    const newEdge: Edge = {
      ...connection,
      id,
      type: "trigger",
      data: {
        trigger: { type: "task_completion", passOutput: true },
        label: "",
        description: "",
        dataMapping: [],
      } as TriggerEdgeDataRecord,
    };
    set({
      edges: addEdge(newEdge, get().edges),
      // Auto-select the new edge so TriggerPanel opens immediately
      selectedEdgeId: id,
      selectedNodeId: null,
      isDirty: true,
    });
  },

  selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),

  updateNodeData: (id, data) =>
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
      isDirty: true,
    }),

  updateEdgeData: (id, data) =>
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, ...data } as TriggerEdgeDataRecord } : e
      ),
      isDirty: true,
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
    set({ nodes: [...get().nodes, node], isDirty: true });
  },
}));
