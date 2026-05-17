import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Canvas } from "../components/canvas/Canvas.js";
import { Toolbar } from "../components/canvas/Toolbar.js";
import { AgentConfigPanel } from "../components/panels/AgentConfigPanel.js";
import { workflowsApi } from "../api/workflows.api.js";
import { useWorkflowStore } from "../stores/workflow.store.js";
import { useEffect } from "react";

export function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const setWorkflow = useWorkflowStore((s) => s.setWorkflow);

  const { data: workflow } = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => workflowsApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (workflow) setWorkflow(workflow);
  }, [workflow, setWorkflow]);

  return (
    <div className="flex flex-col h-full">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative" onClick={() => setSelectedAgent(null)}>
          <Canvas />
        </div>
        {selectedAgent && (
          <AgentConfigPanel
            agentId={selectedAgent}
            onClose={() => setSelectedAgent(null)}
          />
        )}
      </div>
    </div>
  );
}
