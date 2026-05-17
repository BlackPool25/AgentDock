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
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
              {m.content}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2 p-2 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Send a message to the agent…"
          className="flex-1 bg-muted rounded px-3 py-2 text-sm outline-none"
        />
        <button
          onClick={send}
          disabled={sendMutation.isPending}
          className="p-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
