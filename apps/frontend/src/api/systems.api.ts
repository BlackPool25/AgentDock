import { api } from "./client.js";
import type { SystemInfo } from "@agentdock/shared-types";

export const systemsApi = {
  list: () => api.get("systems").json<SystemInfo[]>(),
  get: (id: string) => api.get(`systems/${id}`).json<SystemInfo>(),
  start: (id: string) => api.post(`systems/${id}/start`).json(),
  stop: (id: string) => api.post(`systems/${id}/stop`).json(),
  delete: (id: string) => api.delete(`systems/${id}`).json(),
  listAgents: (id: string) => api.get(`systems/${id}/agents`).json(),
};
