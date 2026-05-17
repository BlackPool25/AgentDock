import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getStraightPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils.js";
import type { TriggerEdgeData } from "@/stores/canvas.store.js";

const TRIGGER_LABELS: Record<string, string> = {
  task_completion: "task done",
  cron: "cron",
  webhook: "webhook",
  memory_condition: "memory",
};

export const TriggerEdge = memo(
  ({ id, sourceX, sourceY, targetX, targetY, data, selected }: EdgeProps<TriggerEdgeData>) => {
    const [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    const triggerType = data?.trigger?.type ?? "task_completion";
    const label = TRIGGER_LABELS[triggerType] ?? triggerType;

    return (
      <>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{ stroke: selected ? "hsl(210 100% 56%)" : "hsl(216 34% 40%)", strokeWidth: 2 }}
        />
        <EdgeLabelRenderer>
          <div
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
            className={cn(
              "absolute pointer-events-all text-xs px-2 py-0.5 rounded-full border",
              "bg-card border-border text-muted-foreground",
              selected && "border-primary text-primary"
            )}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

TriggerEdge.displayName = "TriggerEdge";
