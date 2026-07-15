'use client';

import { useMemo, useEffect, useRef, useCallback, type RefObject } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeTypes,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode, WorkspaceWarehouse } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import WarehouseFlowNode from './warehouse-flow-node';
import type { WarehouseNodeData } from './warehouse-flow-node';

/**
 * Auto-layout fallback: simple 2-column grid that avoids overlap.
 * Used only for warehouses that have no saved position (first-time display).
 */
const GRID_COLS = 2;
const GRID_GAP_X = 48;
const GRID_GAP_Y = 48;

interface WarehouseFlowProps {
  workspaceWarehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string) => void;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onDuplicateWarehouse: (warehouseId: string) => void;
  onRenameWarehouse: (warehouseId: string, name: string) => void;
  onDeleteWarehouse: (warehouseId: string) => void;
  onPersistPosition: (warehouseId: string, x: number, y: number) => void;
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
  workspaceWarehouses,
  activeWarehouseId,
  onSelectWarehouse,
  onWarehouseChange,
  onDuplicateWarehouse,
  onRenameWarehouse,
  onDeleteWarehouse,
  onPersistPosition,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WarehouseNodeData>>([]);
  const reactFlowInstance = useReactFlow();
  const prevCountRef = useRef(workspaceWarehouses.length);
  const positionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /**
   * Compute auto-layout for warehouses that don't have a saved position.
   * For warehouses with saved positions, use the saved position directly.
   */
  const nodeLayout = useMemo(() => {
    // Separate warehouses into saved-position and unsaved
    const withPosition: Array<{ id: string; width: number; height: number; position: { x: number; y: number } }> = [];
    const withoutPosition: Array<{ id: string; width: number; height: number }> = [];

    for (const ww of workspaceWarehouses) {
      const w = ww.warehouse;
      const width = w ? w.width * CELL_SIZE : 300;
      const height = w ? w.height * CELL_SIZE : 200;

      if (ww.position) {
        withPosition.push({ id: ww.id, width, height, position: ww.position });
      } else {
        withoutPosition.push({ id: ww.id, width, height });
      }
    }

    // Auto-layout for unsaved: 2-column grid
    const rows: Array<Array<{ id: string; width: number; height: number }>> = [];
    for (const cell of withoutPosition) {
      if (rows.length === 0 || rows[rows.length - 1].length >= GRID_COLS) {
        rows.push([cell]);
      } else {
        rows[rows.length - 1].push(cell);
      }
    }

    const autoPositions: Array<{ id: string; position: { x: number; y: number }; width: number; height: number }> = [];
    const autoYStart = withPosition.length > 0
      ? Math.max(...withPosition.map((p) => p.position.y + p.height)) + GRID_GAP_Y
      : 0;
    let y = autoYStart;
    for (const row of rows) {
      const maxHeight = Math.max(...row.map((c) => c.height));
      let x = 0;
      for (const cell of row) {
        // If there are positioned nodes above, offset Y to avoid overlap
        // Find if any positioned node overlaps this column
        const colX = x;
        const colY = y;
        // Check overlap with positioned nodes
        let adjustedY = colY;
        for (const pNode of withPosition) {
          const overlapX = colX < pNode.position.x + pNode.width && colX + cell.width > pNode.position.x;
          const overlapY = adjustedY < pNode.position.y + pNode.height && adjustedY + maxHeight > pNode.position.y;
          if (overlapX && overlapY) {
            adjustedY = pNode.position.y + pNode.height + GRID_GAP_Y;
          }
        }
        autoPositions.push({ id: cell.id, position: { x: colX, y: adjustedY }, width: cell.width, height: cell.height });
        x += cell.width + GRID_GAP_X;
      }
      // Update y for next row based on actual max height used
      y = Math.max(y + maxHeight + GRID_GAP_Y, ...autoPositions.filter(p => p.id === row[row.length - 1]?.id).map(p => p.position.y + p.height + GRID_GAP_Y));
    }

    // Merge saved positions and auto positions
    const result: Array<{ id: string; position: { x: number; y: number }; width: number; height: number }> = [
      ...withPosition.map((p) => ({ id: p.id, position: p.position, width: p.width, height: p.height })),
      ...autoPositions,
    ];

    return result;
  }, [workspaceWarehouses]);

  // Re-initialise nodes when the workspaceWarehouses change structurally (add/remove).
  const workspaceKey = useMemo(() => workspaceWarehouses.map((w) => w.id).join(','), [workspaceWarehouses]);
  useEffect(() => {
    const newNodes: Node<WarehouseNodeData>[] = nodeLayout.map((layout) => {
      const ww = workspaceWarehouses.find((w) => w.id === layout.id)!;
      return {
        id: layout.id,
        type: 'warehouse',
        position: layout.position,
        width: layout.width,
        height: layout.height,
        draggable: true,
        selectable: false,
        focusable: false,
        data: {
          warehouseId: layout.id,
          warehouseName: ww.name,
          warehouse: ww.warehouse,
          onWarehouseChange,
          onSelect: onSelectWarehouse,
          onDuplicate: onDuplicateWarehouse,
          onRename: onRenameWarehouse,
          onDelete: onDeleteWarehouse,
          canDelete: workspaceWarehouses.length > 1,
          selectedTool,
          activeRoute,
          animationProgressRef,
          zVisualizationMode,
          animationReplayId,
          isActive: layout.id === activeWarehouseId,
        },
      };
    });

    setNodes(newNodes);

    // Fit viewport when the number of nodes changes
    if (prevCountRef.current !== workspaceWarehouses.length) {
      prevCountRef.current = workspaceWarehouses.length;
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2 }));
    }
    // Only recreate nodes on structural changes (IDs added/removed).
    // Data-only changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  // Sync node data (warehouse content, active state, rendering props) without
  // recreating the node instances — this preserves React Flow's internal state.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const ww = workspaceWarehouses.find((w) => w.id === n.id);
        if (!ww) return n;
        return {
          ...n,
          data: {
            warehouseId: ww.id,
            warehouseName: ww.name,
            warehouse: ww.warehouse,
            onWarehouseChange,
            onSelect: onSelectWarehouse,
            onDuplicate: onDuplicateWarehouse,
            onRename: onRenameWarehouse,
            onDelete: onDeleteWarehouse,
            canDelete: workspaceWarehouses.length > 1,
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
    workspaceWarehouses,
    activeWarehouseId,
    onWarehouseChange,
    onSelectWarehouse,
    onRenameWarehouse,
    onDeleteWarehouse,
    onDuplicateWarehouse,
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

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const { id, position } = node as Node<WarehouseNodeData>;
      // Debounce position persistence per node
      const timers = positionTimersRef.current;
      if (timers.has(id)) {
        clearTimeout(timers.get(id)!);
      }
      timers.set(
        id,
        setTimeout(() => {
          onPersistPosition(id, position.x, position.y);
          timers.delete(id);
        }, 500),
      );
    },
    [onPersistPosition]
  );

  const isHandTool = selectedTool === 'hand';

  return (
    <ReactFlow
      nodes={nodes}
      edges={[]}
      onNodesChange={onNodesChange}
      onNodeClick={handleNodeClick}
      onNodeDragStop={handleNodeDragStop}
      nodeTypes={nodeTypes}
      defaultEdgeOptions={defaultEdgeOptions}
      panOnDrag={isHandTool}
      panOnScroll={true}
      zoomOnScroll={false}
      zoomActivationKeyCode="Control"
      zoomOnPinch={true}
      zoomOnDoubleClick={false}
      nodesDraggable={true}
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
