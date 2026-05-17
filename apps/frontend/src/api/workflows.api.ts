import { api } from "./client.js";
import type { WorkflowConfig } from "@agentdock/config-schema";

export const workflowsApi = {
  list: () => api.get("workflows").json<WorkflowConfig[]>(),
  get: (id: string) => api.get(`workflows/${id}`).json<WorkflowConfig>(),
  create: (config: WorkflowConfig) => api.post("workflows", { json: config }).json<WorkflowConfig>(),
  update: (id: string, config: WorkflowConfig) =>
    api.put(`workflows/${id}`, { json: config }).json<WorkflowConfig>(),
};
