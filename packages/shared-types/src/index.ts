import type { SystemDesign } from "@agentdock/config-schema";

// ─── Auth ──────────────────────────────────────────────────────────────────────
export interface LoginRequest { email: string; password: string }
export interface LoginResponse { token: string; expiresIn: number }

// ─── Canvas state (React Flow serialised) ─────────────────────────────────────
export interface CanvasNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

export interface CanvasState {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

// ─── System designs ───────────────────────────────────────────────────────────
export interface SystemSummary {
  id: string;
  name: string;
  description: string | null;
  agentCount: number;
  triggerCount: number;
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface SystemDetail extends SystemSummary {
  canvasState: CanvasState;
}

export interface CreateSystemRequest {
  name: string;
  description?: string;
}

export interface UpdateSystemRequest {
  name?: string;
  description?: string;
  canvasState: CanvasState;
}

// ─── Generations ──────────────────────────────────────────────────────────────
export interface GenerationRecord {
  id: string;
  systemId: string;
  version: number;
  generatedAt: number;
  notes: string | null;
}

// ─── Runtime WebSocket events (emitted by generated runtime orchestrator) ─────
export type AgentStatus = "running" | "stopped" | "error" | "starting" | "restarting";
export type SystemStatus = "running" | "stopped" | "partial";
export type LogLevel = "info" | "warn" | "error" | "debug";

export type RuntimeEvent =
  | { type: "agent:status"; agentId: string; systemId: string; status: AgentStatus; timestamp: string }
  | { type: "agent:log"; agentId: string; systemId: string; level: LogLevel; message: string; timestamp: string }
  | { type: "agent:memory:updated"; agentId: string; systemId: string; file: string; commitHash: string; timestamp: string }
  | { type: "agent:task:started"; agentId: string; systemId: string; taskId: string; timestamp: string }
  | { type: "agent:task:completed"; agentId: string; systemId: string; taskId: string; output: string; timestamp: string }
  | { type: "agent:task:failed"; agentId: string; systemId: string; taskId: string; error: string; timestamp: string }
  | { type: "system:status"; systemId: string; status: SystemStatus; timestamp: string };

// ─── LLM Gateway (used by generated runtime) ──────────────────────────────────
export interface LLMJob {
  jobId: string;
  agentId: string;
  provider: string;
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  callbackUrl: string;
}

export interface LLMJobResult {
  jobId: string;
  output: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// ─── API Error ────────────────────────────────────────────────────────────────
export interface ApiError { error: string; code: string }
