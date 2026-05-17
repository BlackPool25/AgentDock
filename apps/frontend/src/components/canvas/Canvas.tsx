import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect } from "react";
import { AgentNode } from "./AgentNode.js";
import { TriggerEdge } from "./TriggerEdge.js";
import { useWorkflowStore } from "../../stores/workflow.store.js";

const nodeTypes = { agentNode: AgentNode };
const edgeTypes = { triggerEdge: TriggerEdge };

export function Canvas() {
  const { nodes: storeNodes, edges: storeEdges, setNodes, setEdges, markDirty } = useWorkflowStore();
  const [nodes, setLocalNodes, onNodesChange] = useNodesState(storeNodes);
  const [edges, setLocalEdges, onEdgesChange] = useEdgesState(storeEdges);

  useEffect(() => {
    setLocalNodes(storeNodes);
    setLocalEdges(storeEdges);
  }, [storeNodes, storeEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setLocalEdges((eds) => addEdge({ ...connection, type: "triggerEdge" }, eds));
      markDirty();
    },
    [setLocalEdges, markDirty]
  );

  const onNodesChangeHandler = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      setNodes(nodes);
      markDirty();
    },
    [onNodesChange, nodes, setNodes, markDirty]
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChangeHandler}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap className="!bg-card" />
      </ReactFlow>
    </div>
  );
}
