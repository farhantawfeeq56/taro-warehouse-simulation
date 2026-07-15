'use client';

import { useMemo, useEffect, useRef, useCallback } from 'react';
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

/** Vertical gap in pixels between warehouse nodes. */
const NODE_GAP = 40;

interface WarehouseFlowProps {
  warehouses: Warehouse[];
  warehouseIds: string[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string) => void;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
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
  warehouses,
  warehouseIds,
  activeWarehouseId,
  onSelectWarehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WarehouseNodeData>>([]);
  const reactFlowInstance = useReactFlow();
  const prevNodesLengthRef = useRef(warehouseIds.length);

  // Stable layout positions — computed once per warehouse ID set so React Flow
  // does not reset its internal state on every data change.
  const nodeLayout = useMemo(() => {
    let y = 0;
    return warehouseIds.map((id, i) => {
      const wh = warehouses[i];
      const w = wh ? wh.width * CELL_SIZE : 300;
      const h = wh ? wh.height * CELL_SIZE : 200;
      const layout = { id, position: { x: 0, y }, width: w, height: h };
      y += h + NODE_GAP;
      return layout;
    });
  }, [warehouseIds, warehouses]);

  // Re-initialise nodes when the warehouse ID set changes (structural add/remove).
  const warehouseIdsKey = warehouseIds.join(',');
  useEffect(() => {
    const newNodes: Node<WarehouseNodeData>[] = nodeLayout.map((layout) => ({
      id: layout.id,
      type: 'warehouse',
      position: layout.position,
      width: layout.width,
      height: layout.height,
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        warehouseId: layout.id,
        warehouse: warehouses.find((_, i) => warehouseIds[i] === layout.id)!,
        onWarehouseChange,
        onSelect: onSelectWarehouse,
        selectedTool,
        activeRoute,
        animationProgressRef,
        zVisualizationMode,
        animationReplayId,
        isActive: layout.id === activeWarehouseId,
      },
    }));

    setNodes(newNodes);

    // Fit viewport when the number of nodes changes
    if (prevNodesLengthRef.current !== warehouseIds.length) {
      prevNodesLengthRef.current = warehouseIds.length;
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2 }));
    }
    // Only recreate nodes on structural changes (IDs added/removed).
    // Data-only changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseIdsKey]);

  // Sync node data (warehouse content, active state, rendering props) without
  // recreating the node instances — this preserves React Flow's internal state.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const wh = warehouses.find((_, i) => warehouseIds[i] === n.id)!;
        return {
          ...n,
          data: {
            warehouseId: n.id,
            warehouse: wh,
            onWarehouseChange,
            onSelect: onSelectWarehouse,
            selectedTool,
            activeRoute,
            animationProgressRef,
            zVisualizationMode,
            animationReplayId,
            isActive: n.id === activeWarehouseId,
          },
        };
      })
    );
  }, [
    warehouses,
    warehouseIds,
    activeWarehouseId,
    onWarehouseChange,
    onSelectWarehouse,
    selectedTool,
    activeRoute,
    animationProgressRef,
    zVisualizationMode,
    animationReplayId,
    setNodes,
  ]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectWarehouse(node.id);
    },
    [onSelectWarehouse]
  );

  const isHandTool = selectedTool === 'hand';

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
      onNodeClick={handleNodeClick}
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
