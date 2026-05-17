import yaml from "js-yaml";
import type { SystemDesign } from "@agentdock/config-schema";

export function generateWorkflow(design: SystemDesign): string {
  const config = {
    workflow: {
      id: design.systemId,
      name: design.systemName,
      version: "1.0.0",
    },
    agents: design.agents.map((a) => ({
      ref: a.id,
      position: a.position,
    })),
    connections: design.connections.map((conn) => {
      const trigger: Record<string, unknown> = { type: conn.trigger.type };
      if (conn.trigger.type === "task_completion") {
        trigger["pass_output"] = conn.trigger.passOutput;
      } else if (conn.trigger.type === "cron") {
        trigger["schedule"] = conn.trigger.cronSchedule;
        trigger["timezone"] = conn.trigger.timezone;
      } else if (conn.trigger.type === "memory_condition") {
        trigger["file"] = conn.trigger.file;
        trigger["contains"] = conn.trigger.contains;
        trigger["check_interval_seconds"] = conn.trigger.checkIntervalSeconds;
      } else if (conn.trigger.type === "file_received") {
        trigger["file_pattern"] = conn.trigger.filePattern;
      }

      return {
        id: conn.id,
        from: conn.from,
        to: conn.to,
        ...(conn.label ? { label: conn.label } : {}),
        ...(conn.description ? { description: conn.description } : {}),
        data_mapping: (conn.dataMapping ?? []).length > 0 ? conn.dataMapping : undefined,
        trigger,
      };
    }),
  };
  return yaml.dump(config, { lineWidth: 120 });
}
