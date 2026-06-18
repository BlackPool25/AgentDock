import { useEffect, useRef } from "react";
import { useWsStore } from "../../stores/ws.store.js";

interface Props {
  agentId: string;
}

export function LogViewer({ agentId }: Props) {
  const logs = useWsStore((s) => s.agentLogs.get(agentId) ?? []);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="h-full overflow-y-auto bg-slate-50 border border-border rounded-lg p-3 font-mono text-xs">
      {logs.length === 0 ? (
        <span className="text-muted-foreground italic">No logs yet. Waiting for agent activity…</span>
      ) : (
        logs.map((line, i) => (
          <div
            key={i}
            className={`leading-5 py-0.5 border-b border-slate-100 last:border-0 ${
              line.includes("[error]")
                ? "text-rose-600 font-medium"
                : line.includes("[warn]")
                ? "text-amber-600 font-medium"
                : "text-emerald-700"
            }`}
          >
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
