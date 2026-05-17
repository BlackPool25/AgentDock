import { api } from "./client.js";
import type { AgentInfo, AgentStatusResponse, MemoryFile } from "@agentdock/shared-types";

export const agentsApi = {
  status: (id: string) => api.get(`agents/${id}/status`).json<AgentStatusResponse>(),
  logs: (id: string, limit = 100) => api.get(`agents/${id}/logs?limit=${limit}`).json(),
  listMemory: (id: string) => api.get(`agents/${id}/memory`).json<{ files: MemoryFile[] }>(),
  getMemoryFile: (id: string, file: string) =>
    api.get(`agents/${id}/memory/${file}`).json<{ filename: string; content: string }>(),
  writeMemoryFile: (id: string, file: string, content: string) =>
    api.put(`agents/${id}/memory/${file}`, { json: { content } }).json(),
  chat: (id: string, message: string) =>
    api.post(`agents/${id}/chat`, { json: { message } }).json(),
  tasks: (id: string) => api.get(`agents/${id}/tasks`).json(),
  getConfig: (id: string) => api.get(`agents/${id}/config`).json(),
  updateConfig: (id: string, config: unknown) =>
    api.put(`agents/${id}/config`, { json: config }).json(),
  trigger: (id: string) => api.post(`agents/${id}/trigger`).json(),
};
