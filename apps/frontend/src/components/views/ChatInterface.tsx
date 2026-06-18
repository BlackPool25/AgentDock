import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { agentsApi } from "../../api/agents.api.js";
import { Send } from "lucide-react";

interface Props {
  agentId: string;
}

interface Message {
  role: "user" | "agent";
  content: string;
}

export function ChatInterface({ agentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");

  const sendMutation = useMutation({
    mutationFn: (msg: string) => agentsApi.chat(agentId, msg) as Promise<{ taskId: string; status: string }>,
    onSuccess: (data) => {
      setMessages((m) => [...m, { role: "agent", content: `Task ${data.taskId} accepted — processing…` }]);
    },
  });

  const send = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: "user", content: input }]);
    sendMutation.mutate(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs italic">
            No messages yet. Send a prompt to start interacting with the agent.
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed shadow-sm border ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-border"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {sendMutation.isPending && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-xs text-muted-foreground bg-muted/40 border border-border/50 animate-pulse">
              Agent is thinking…
            </div>
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 p-3 border-t border-border bg-muted/30">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Send a message to the agent…"
          className="flex-1 bg-background rounded-lg border border-border px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/30 transition-all resize-none min-h-[36px] max-h-24 leading-normal"
        />
        <button
          onClick={send}
          disabled={sendMutation.isPending || !input.trim()}
          className="p-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0 shadow-sm"
          title="Send message"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
