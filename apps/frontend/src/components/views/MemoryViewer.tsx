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
        <div className="text-xs text-muted-foreground mb-2 font-medium">Memory Files</div>
        {memoryList?.files.map((f) => (
          <button
            key={f.filename}
            onClick={() => { setSelectedFile(f.filename); setEditing(false); }}
            className={`w-full text-left text-xs px-2 py-1.5 rounded truncate ${selectedFile === f.filename ? "bg-primary/20 text-primary" : "hover:bg-muted text-muted-foreground"}`}
          >
            {f.filename}
          </button>
        ))}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-y-auto">
        {selectedFile && fileData ? (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono text-muted-foreground">{selectedFile}</span>
              <button
                onClick={() => { setEditing(!editing); setEditContent(fileData.content); }}
                className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80"
              >
                {editing ? "Cancel" : "Edit"}
              </button>
              {editing && (
                <button
                  onClick={() => saveMutation.mutate()}
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground ml-1"
                >
                  Save
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="w-full h-64 bg-black/40 text-xs font-mono p-2 rounded border border-border resize-none"
              />
            ) : (
              <div className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{fileData.content}</ReactMarkdown>
              </div>
            )}
          </>
        ) : (
          <div className="text-muted-foreground text-sm">Select a file to view</div>
        )}
      </div>
    </div>
  );
}
