import { create } from "zustand";
import type { SystemDetail } from "@agentdock/shared-types";

interface SystemStore {
  current: SystemDetail | null;
  saveStatus: "saved" | "saving" | "unsaved" | "error";
  setCurrent: (system: SystemDetail | null) => void;
  setSaveStatus: (status: SystemStore["saveStatus"]) => void;
}

export const useSystemStore = create<SystemStore>((set) => ({
  current: null,
  saveStatus: "saved",
  setCurrent: (current) => set({ current }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
}));
