import { useCanvasStore } from "@/stores/canvas.store.js";
import type { ConnectionDesign } from "@agentdock/config-schema";

type TriggerType = ConnectionDesign["trigger"]["type"];

const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
  { value: "task_completion", label: "Task Completion" },
  { value: "cron", label: "Cron Schedule" },
  { value: "webhook", label: "Webhook" },
  { value: "memory_condition", label: "Memory Condition" },
  { value: "file_received", label: "File Received" },
];

export function TriggerPanel({ edgeId }: { edgeId: string }) {
  const edge = useCanvasStore((s) => s.edges.find((e) => e.id === edgeId));
  const nodes = useCanvasStore((s) => s.nodes);
  const updateEdgeData = useCanvasStore((s) => s.updateEdgeData);

  if (!edge) return null;

  const sourceName = (nodes.find((n) => n.id === edge.source)?.data as { name?: string })?.name ?? edge.source;
  const targetName = (nodes.find((n) => n.id === edge.target)?.data as { name?: string })?.name ?? edge.target;

  const edgeData = edge.data as {
    trigger?: ConnectionDesign["trigger"];
    label?: string;
    description?: string;
    dataMapping?: Array<{ from: string; to: string }>;
  } | undefined;

  const trigger: ConnectionDesign["trigger"] = edgeData?.trigger ?? { type: "task_completion", passOutput: true };
  const label = edgeData?.label ?? "";
  const description = edgeData?.description ?? "";
  const dataMapping = edgeData?.dataMapping ?? [];

  const updateTrigger = (next: ConnectionDesign["trigger"]) =>
    updateEdgeData(edgeId, { trigger: next });

  const setTriggerType = (type: TriggerType) => {
    const defaults: Record<TriggerType, ConnectionDesign["trigger"]> = {
      task_completion: { type: "task_completion", passOutput: true },
      cron: { type: "cron", cronSchedule: "0 9 * * 1-5", timezone: "UTC" },
      webhook: { type: "webhook" },
      memory_condition: { type: "memory_condition", file: "status.md", contains: "done", checkIntervalSeconds: 30 },
      file_received: { type: "file_received", filePattern: "*" },
    };
    updateTrigger(defaults[type]);
  };

  const addMapping = () =>
    updateEdgeData(edgeId, { dataMapping: [...dataMapping, { from: "", to: "" }] });

  const updateMapping = (i: number, field: "from" | "to", value: string) => {
    const next = dataMapping.map((m, idx) => idx === i ? { ...m, [field]: value } : m);
    updateEdgeData(edgeId, { dataMapping: next });
  };

  const removeMapping = (i: number) =>
    updateEdgeData(edgeId, { dataMapping: dataMapping.filter((_, idx) => idx !== i) });

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold">Connection</p>
        <p className="text-xs text-muted-foreground font-mono truncate">{sourceName} → {targetName}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Label & description */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Label (shown on edge)</label>
          <input
            className="input"
            placeholder="e.g. send report"
            value={label}
            onChange={(e) => updateEdgeData(edgeId, { label: e.target.value })}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Description</label>
          <textarea
            className="input resize-none text-xs"
            rows={2}
            placeholder="What does this connection do?"
            value={description}
            onChange={(e) => updateEdgeData(edgeId, { description: e.target.value })}
          />
        </div>

        {/* Trigger type */}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Trigger Type</label>
          <select
            className="input w-full"
            value={trigger.type}
            onChange={(e) => setTriggerType(e.target.value as TriggerType)}
          >
            {TRIGGER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {trigger.type === "task_completion" && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={trigger.passOutput}
              onChange={(e) => updateTrigger({ ...trigger, passOutput: e.target.checked })}
              className="accent-primary"
            />
            <span className="text-sm">Pass output to next agent</span>
          </label>
        )}

        {trigger.type === "cron" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Cron Expression</label>
              <input
                className="input font-mono"
                value={trigger.cronSchedule}
                onChange={(e) => updateTrigger({ ...trigger, cronSchedule: e.target.value })}
                placeholder="0 9 * * 1-5"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Timezone</label>
              <input
                className="input"
                value={trigger.timezone}
                onChange={(e) => updateTrigger({ ...trigger, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>
          </>
        )}

        {trigger.type === "webhook" && (
          <p className="text-xs text-muted-foreground">
            Webhook URL will be available at deployment:<br />
            <code className="font-mono text-primary">POST /webhooks/&#123;api-key&#125;</code>
          </p>
        )}

        {trigger.type === "file_received" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">File Pattern</label>
            <input
              className="input font-mono"
              value={trigger.filePattern}
              onChange={(e) => updateTrigger({ ...trigger, filePattern: e.target.value })}
              placeholder="* or report-*.md"
            />
            <p className="text-xs text-muted-foreground">
              Triggers when the source agent writes a matching file to its memory.
            </p>
          </div>
        )}

        {trigger.type === "memory_condition" && (
          <>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Memory File</label>
              <input
                className="input font-mono"
                value={trigger.file}
                onChange={(e) => updateTrigger({ ...trigger, file: e.target.value })}
                placeholder="status.md"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Contains String</label>
              <input
                className="input"
                value={trigger.contains}
                onChange={(e) => updateTrigger({ ...trigger, contains: e.target.value })}
                placeholder="done"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Check Interval (seconds)</label>
              <input
                type="number"
                className="input"
                value={trigger.checkIntervalSeconds}
                onChange={(e) => updateTrigger({ ...trigger, checkIntervalSeconds: parseInt(e.target.value) || 30 })}
              />
            </div>
          </>
        )}

        {/* Data mapping */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Data Mapping</label>
            <button className="text-xs text-primary hover:underline" onClick={addMapping}>+ Add</button>
          </div>
          <p className="text-xs text-muted-foreground">
            Map output fields from <span className="text-foreground font-mono">{sourceName}</span> to input fields of <span className="text-foreground font-mono">{targetName}</span>.
          </p>
          {dataMapping.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No mappings — full output is passed.</p>
          )}
          {dataMapping.map((m, i) => (
            <div key={i} className="flex gap-1 items-center">
              <input
                className="input text-xs font-mono flex-1"
                placeholder="output.field"
                value={m.from}
                onChange={(e) => updateMapping(i, "from", e.target.value)}
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                className="input text-xs font-mono flex-1"
                placeholder="input.field"
                value={m.to}
                onChange={(e) => updateMapping(i, "to", e.target.value)}
              />
              <button className="text-xs text-destructive px-1" onClick={() => removeMapping(i)}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
