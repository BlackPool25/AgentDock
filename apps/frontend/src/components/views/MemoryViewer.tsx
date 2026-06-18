import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "../../api/agents.api.js";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

interface Props {
  agentId: string;
}

export function MemoryViewer({ agentId }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const qc = useQueryClient();

  const { data: memoryList } = useQuery({
    queryKey: ["memory-list", agentId],
    queryFn: () => agentsApi.listMemory(agentId),
    refetchInterval: 5000,
  });

  const { data: fileData } = useQuery({
    queryKey: ["memory-file", agentId, selectedFile],
    queryFn: () => agentsApi.getMemoryFile(agentId, selectedFile!),
    enabled: !!selectedFile,
  });

  const saveMutation = useMutation({
    mutationFn: () => agentsApi.writeMemoryFile(agentId, selectedFile!, editContent),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["memory-file", agentId, selectedFile] });
      setEditing(false);
      toast.success("Memory file saved");
    },
  });

  return (
    <div className="flex h-full gap-3">
      {/* File list */}
      <div className="w-48 flex-shrink-0 overflow-y-auto">
        <div className="text-xs font-semibold text-muted-foreground mb-2 tracking-wider uppercase text-[10px]">Memory Files</div>
        <div className="space-y-1">
          {memoryList?.files.map((f) => (
            <button
              key={f.filename}
              onClick={() => { setSelectedFile(f.filename); setEditing(false); }}
              className={`w-full text-left text-xs px-2.5 py-2 rounded-lg truncate transition-colors ${selectedFile === f.filename ? "bg-primary/10 text-primary font-medium border border-primary/20" : "hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent"}`}
            >
              {f.filename}
            </button>
          ))}
        </div>
      </div>

      {/* File content */}
      <div className="flex-1 overflow-y-auto">
        {selectedFile && fileData ? (
          <>
            <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
              <span className="text-xs font-mono text-muted-foreground">{selectedFile}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditing(!editing); setEditContent(fileData.content); }}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted font-medium transition-colors"
                >
                  {editing ? "Cancel" : "Edit"}
                </button>
                {editing && (
                  <button
                    onClick={() => saveMutation.mutate()}
                    className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                  >
                    Save
                  </button>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-64 bg-slate-50 text-xs font-mono p-3 rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all resize-none"
              />
            ) : (
              <div className="prose prose-slate prose-sm max-w-none leading-relaxed">
                <ReactMarkdown>{fileData.content}</ReactMarkdown>
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-sm italic">Select a file to view</div>
        )}
      </div>
    </div>
  );
}
