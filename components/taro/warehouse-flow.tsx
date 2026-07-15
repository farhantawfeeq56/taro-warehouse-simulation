'use client';

import { useMemo, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  useNodesState,
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

export function WarehouseFlow({
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

  // Keep node data in sync with props without recreating the node array
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
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
  }, [
    warehouse,
    onWarehouseChange,
    selectedTool,
    activeRoute,
    animationProgressRef,
    zVisualizationMode,
    animationReplayId,
    setNodes,
  ]);

  const isHandTool = selectedTool === 'hand';

  // Log a warning if the React Flow styles might not be loaded
  useEffect(() => {
    // Check if react-flow styles are applied by looking for a known class
    const styleCheck = document.querySelector('.react-flow');
    if (!styleCheck) {
      console.warn(
        '[WarehouseFlow] React Flow container not found. The @xyflow/react styles may not be loaded.'
      );
    }
  }, []);

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
