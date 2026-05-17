import { create } from "zustand";
import type { AgentStatus } from "@agentdock/shared-types";

interface AgentsState {
  statuses: Record<string, AgentStatus>;
  setStatus: (agentId: string, status: AgentStatus) => void;
}

export const useAgentsStore = create<AgentsState>((set) => ({
  statuses: {},
  setStatus: (agentId, status) =>
    set((s) => ({ statuses: { ...s.statuses, [agentId]: status } })),
}));
