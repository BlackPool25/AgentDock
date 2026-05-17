import { create } from "zustand";
import type { AgentEvent, AgentStatus } from "@agentdock/shared-types";

interface WsState {
  connected: boolean;
  agentStatuses: Map<string, AgentStatus>;
  agentLogs: Map<string, string[]>;
  connect: () => void;
  disconnect: () => void;
}

let ws: WebSocket | null = null;

export const useWsStore = create<WsState>((set, get) => ({
  connected: false,
  agentStatuses: new Map(),
  agentLogs: new Map(),

  connect() {
    const token = localStorage.getItem("agentdock_token");
    const wsUrl = `${import.meta.env.VITE_WS_URL ?? "ws://localhost:4000/ws"}${token ? `?token=${token}` : ""}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => set({ connected: true });
    ws.onclose = () => {
      set({ connected: false });
      setTimeout(() => get().connect(), 3000); // auto-reconnect
    };
    ws.onmessage = (e) => {
      try {
        const event: AgentEvent = JSON.parse(e.data);
        const { agentStatuses, agentLogs } = get();

        if (event.type === "agent:status") {
          const next = new Map(agentStatuses);
          next.set(event.agentId, event.status);
          set({ agentStatuses: next });
        } else if (event.type === "agent:log") {
          const next = new Map(agentLogs);
          const logs = next.get(event.agentId) ?? [];
          const updated = [...logs, `[${event.timestamp}] [${event.level}] ${event.message}`];
          next.set(event.agentId, updated.slice(-1000)); // ring buffer
          set({ agentLogs: next });
        }
      } catch {
        // ignore parse errors
      }
    };
  },

  disconnect() {
    ws?.close();
    ws = null;
    set({ connected: false });
  },
}));
