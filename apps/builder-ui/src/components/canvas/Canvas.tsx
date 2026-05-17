import { useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeMouseHandler,
  type EdgeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { AgentNode } from "./AgentNode.js";
import { TriggerEdge } from "./TriggerEdge.js";

const nodeTypes = { agent: AgentNode };
const edgeTypes = { trigger: TriggerEdge };

export function Canvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    selectNode, selectEdge, addAgentNode,
  } = useCanvasStore();

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    selectNode(node.id);
  }, [selectNode]);

  const onEdgeClick: EdgeMouseHandler = useCallback((_e, edge) => {
    selectEdge(edge.id);
  }, [selectEdge]);

  const onPaneClick = useCallback(() => {
    selectNode(null);
    selectEdge(null);
  }, [selectNode, selectEdge]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/agentdock-node");
      if (type !== "agent") return;
      const bounds = (e.currentTarget as HTMLElement).getBoundingClientRect();
      addAgentNode({ x: e.clientX - bounds.left - 90, y: e.clientY - bounds.top - 40 });
    },
    [addAgentNode]
  );

  return (
    <div className="w-full h-full" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        deleteKeyCode="Delete"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(216 34% 22%)" />
        <Controls className="!bg-card !border-border" />
        <MiniMap
          className="!bg-card !border-border"
          nodeColor="hsl(210 100% 56%)"
          maskColor="hsl(222 47% 9% / 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
