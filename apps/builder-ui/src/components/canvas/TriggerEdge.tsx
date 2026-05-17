import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils.js";
import type { TriggerEdgeDataRecord } from "@/stores/canvas.store.js";

const TRIGGER_LABELS: Record<string, string> = {
  task_completion: "task done",
  cron: "cron",
  webhook: "webhook",
  memory_condition: "memory",
  file_received: "file",
};

export const TriggerEdge = memo(
  ({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps) => {
    const [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX, sourceY, sourcePosition,
      targetX, targetY, targetPosition,
      borderRadius: 12,
    });
    const edgeData = data as TriggerEdgeDataRecord | undefined;
    const triggerType = edgeData?.trigger?.type ?? "task_completion";
    const triggerLabel = TRIGGER_LABELS[triggerType] ?? triggerType;
    const customLabel = edgeData?.label;
    const displayLabel = customLabel || triggerLabel;

    const color = selected ? "hsl(210 100% 56%)" : "hsl(216 34% 50%)";
    const markerId = `arrow-${id}`;

    return (
      <>
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill={color} />
          </marker>
        </defs>
        <BaseEdge
          id={id}
          path={edgePath}
          style={{
            stroke: color,
            strokeWidth: selected ? 2.5 : 1.8,
            markerEnd: `url(#${markerId})`,
          }}
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
            {displayLabel}
          </div>
        </EdgeLabelRenderer>
      </>
    );
  }
);

TriggerEdge.displayName = "TriggerEdge";
