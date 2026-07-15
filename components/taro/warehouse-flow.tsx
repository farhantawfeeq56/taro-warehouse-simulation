'use client';

import { useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import WarehouseFlowNode from './warehouse-flow-node';
import type { WarehouseNodeData } from './warehouse-flow-node';

interface WarehouseFlowProps {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
}

const nodeTypes: NodeTypes = {
  warehouse: WarehouseFlowNode,
};

const defaultEdgeOptions = {};

/**
 * Outer wrapper that provides the React Flow context.
 * All hooks that depend on the provider are called in WarehouseFlowInner.
 */
export function WarehouseFlow(props: WarehouseFlowProps) {
  return (
    <ReactFlowProvider>
      <WarehouseFlowInner {...props} />
    </ReactFlowProvider>
  );
}

function WarehouseFlowInner({
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseFlowProps) {
  const nodeWidth = warehouse.width * CELL_SIZE;
  const nodeHeight = warehouse.height * CELL_SIZE;

  // Single warehouse node, stable reference via useMemo
  const initialNodes: Node<WarehouseNodeData>[] = useMemo(
    () => [
      {
        id: 'warehouse',
        type: 'warehouse',
        position: { x: 0, y: 0 },
        width: nodeWidth,
        height: nodeHeight,
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          warehouse,
          onWarehouseChange,
          selectedTool,
          activeRoute,
          animationProgressRef,
          zVisualizationMode,
          animationReplayId,
        },
      },
    ],
    // We intentionally keep this stable — data mutations are passed via props
    // inside the node's render. Recreating the node array only when dimensions
    // change prevents unnecessary React Flow re-initializations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodeWidth, nodeHeight]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const reactFlowInstance = useReactFlow();
  const prevNodeSizeRef = useRef({ width: nodeWidth, height: nodeHeight });

  // Keep node data and dimensions in sync with props.
  // When warehouse dimensions change, update the node's width/height so
  // React Flow's layout matches the new canvas, then fit the viewport.
  useEffect(() => {
    const prev = prevNodeSizeRef.current;
    const sizeChanged = prev.width !== nodeWidth || prev.height !== nodeHeight;
    if (sizeChanged) prevNodeSizeRef.current = { width: nodeWidth, height: nodeHeight };

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        width: nodeWidth,
        height: nodeHeight,
        data: {
          warehouse,
          onWarehouseChange,
          selectedTool,
          activeRoute,
          animationProgressRef,
          zVisualizationMode,
          animationReplayId,
        },
      }))
    );

    if (sizeChanged) {
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.1 }));
    }
  }, [
    nodeWidth,
    nodeHeight,
    warehouse,
    onWarehouseChange,
    selectedTool,
    activeRoute,
    animationProgressRef,
    zVisualizationMode,
    animationReplayId,
    setNodes,
    reactFlowInstance,
  ]);

  const isHandTool = selectedTool === 'hand';

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      panOnDrag={isHandTool}
      panOnScroll={true}
      zoomOnScroll={false}
      zoomActivationKeyCode="Control"
      zoomOnPinch={true}
      zoomOnDoubleClick={false}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      preventScrolling={true}
      minZoom={0.1}
      maxZoom={4}
      fitView={false}
      colorMode="light"
      className="bg-muted/30"
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="#d1d5db"
      />
    </ReactFlow>
  );
}
