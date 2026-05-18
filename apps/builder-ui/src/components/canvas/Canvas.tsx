import { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  type NodeTypes,
  type EdgeTypes,
  type Connection,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCanvasStore } from "@/stores/canvas.store.js";
import { AgentNode } from "./AgentNode.js";
import { TriggerEdge } from "./TriggerEdge.js";
import { nanoid } from "nanoid";
import type { TriggerEdgeDataRecord } from "@/stores/canvas.store.js";

const nodeTypes: NodeTypes = { agent: AgentNode };
const edgeTypes: EdgeTypes = { trigger: TriggerEdge };

export function Canvas() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange,
    selectNode, selectEdge, addAgentNode,
  } = useCanvasStore();

  // Custom onConnect that creates edge with proper defaults
  const handleConnect = useCallback((connection: Connection) => {
    const id = `edge-${nanoid(6)}`;
    const newEdge = {
      ...connection,
      id,
      type: "trigger",
      data: {
        trigger: { type: "task_completion", passOutput: true },
        label: "",
        description: "",
        dataMapping: [],
      } as TriggerEdgeDataRecord,
    };

    useCanvasStore.getState().setEdges(
      addEdge(newEdge, useCanvasStore.getState().edges as any) as any
    );
    // Auto-select the new edge so TriggerPanel opens immediately
    useCanvasStore.getState().selectEdge(id);
    useCanvasStore.getState().selectNode(null);
  }, []);

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
      const flowTransform = (e.currentTarget as HTMLElement).querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (flowTransform) {
        addAgentNode({ x: e.clientX - flowTransform.left - 110, y: e.clientY - flowTransform.top - 40 });
      } else {
        addAgentNode({ x: e.clientX - bounds.left - 110, y: e.clientY - bounds.top - 40 });
      }
    },
    [addAgentNode]
  );

  // Default edge options for cleaner connections
  const defaultEdgeOptions = useMemo(() => ({
    type: "trigger",
    animated: true,
    style: { stroke: "hsl(216 34% 50%)", strokeWidth: 2 },
  }), []);

  return (
    <div className="w-full h-full" onDrop={onDrop} onDragOver={(e) => e.preventDefault()}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={handleConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        deleteKeyCode="Delete"
        snapToGrid
        snapGrid={[20, 20]}
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
