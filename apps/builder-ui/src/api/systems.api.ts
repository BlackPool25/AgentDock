import { api } from "./client.js";
import type {
  SystemSummary,
  SystemDetail,
  CreateSystemRequest,
  UpdateSystemRequest,
  GenerationRecord,
  CanvasState,
} from "@agentdock/shared-types";

export const systemsApi = {
  list: () => api.get("systems").json<SystemSummary[]>(),

  get: (id: string) => api.get(`systems/${id}`).json<SystemDetail>(),

  create: (body: CreateSystemRequest) =>
    api.post("systems", { json: body }).json<SystemSummary>(),

  update: (id: string, body: UpdateSystemRequest) =>
    api.put(`systems/${id}`, { json: body }).json<{ ok: boolean; version: number }>(),

  delete: (id: string) => api.delete(`systems/${id}`).json<{ ok: boolean }>(),

  generations: (id: string) =>
    api.get(`systems/${id}/generations`).json<GenerationRecord[]>(),

  generate: async (id: string): Promise<void> => {
    const res = await api.post(`systems/${id}/generate`, {
      headers: { "Cache-Control": "no-store" },
    });
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? `system-${id}.zip`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  login: (email: string, password: string) =>
    api.post("auth/login", { json: { email, password } }).json<{ token: string; expiresIn: number }>(),

  describe: (id: string, body: { description: string; context?: Record<string, string>; provider?: string; model?: string }) =>
    api.post(`systems/${id}/describe`, { json: body }).json<{
      canvasState: { nodes: unknown[]; edges: unknown[] };
      intent: { problem: string; needsUserState: boolean; multiUser: boolean };
      agentCount: number;
    }>(),

  patch: (id: string, change: string) =>
    api.post(`systems/${id}/patch`, { json: { change } }).json<{
      patch: { agentId: string; field: string; value: string };
      canvasState: { nodes: unknown[]; edges: unknown[] };
      affectedAgentId: string;
    }>(),

  getOllamaModels: () =>
    api.get("ollama/models").json<{ models: string[] }>(),

  getGeminiModels: () =>
    api.get("gemini/models").json<{ models: string[] }>(),

  getLlmConfig: () =>
    api.get("llm/config").json<{ provider: string; model: string }>(),
};
