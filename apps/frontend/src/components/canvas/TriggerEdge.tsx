import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  type EdgeProps,
} from "@xyflow/react";

export function TriggerEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  label,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  });

  const triggerType = (data as { trigger?: { type?: string } })?.trigger?.type ?? "task_completion";

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)` }}
          className="absolute pointer-events-all nodrag nopan"
        >
          <div className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground border border-border">
            {label ?? triggerType}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
