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
    <div className="h-full overflow-y-auto bg-black/40 rounded p-3 font-mono text-xs">
      {logs.length === 0 ? (
        <span className="text-muted-foreground">No logs yet. Waiting for agent activity…</span>
      ) : (
        logs.map((line, i) => (
          <div key={i} className={`leading-5 ${line.includes("[error]") ? "text-red-400" : line.includes("[warn]") ? "text-yellow-400" : "text-green-300"}`}>
            {line}
          </div>
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
