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
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  Warehouse,
  ToolType,
  StrategyResult,
  ZVisualizationMode,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import WarehouseFlowNode from './warehouse-flow-node';
import type { WarehouseNodeData } from './warehouse-flow-node';

/**
 * Auto-layout: simple 2-column grid that avoids overlap.
 * Used only for nodes that have no saved position.
 */
const GRID_COLS = 2;
const GRID_GAP_X = 48;
const GRID_GAP_Y = 48;

/** Title bar height for warehouse nodes. */
const TITLE_BAR_HEIGHT = 32;

interface WarehouseFlowProps {
  workspaceWarehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string, opts?: { additive?: boolean }) => void;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onDuplicateWarehouse: (warehouseId: string) => void;
  onRenameWarehouse: (warehouseId: string, name: string) => void;
  onDeleteWarehouse: (warehouseId: string) => void;
  onOpenLayoutConfig: (warehouseId: string) => void;
  /** Warehouse id currently being duplicated — shows spinner on the node's duplicate button. */
  duplicatingWarehouseId: string | null;
  /** Warehouse id currently being deleted — shows spinner on the node's delete button. */
  deletingWarehouseId: string | null;
  /** Warehouse id currently being renamed — shows a brief spinner on the node name. */
  renamingWarehouseId: string | null;
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

type FlowNode = Node<WarehouseNodeData>;

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
  onOpenLayoutConfig,
  onPersistPosition,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
  // Loading states
  duplicatingWarehouseId,
  deletingWarehouseId,
  renamingWarehouseId,
}: WarehouseFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const reactFlowInstance = useReactFlow();
  const prevCountRef = useRef(workspaceWarehouses.length);
  const positionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  type LayoutCell = { id: string; width: number; height: number };
  type LayoutCellWithPos = LayoutCell & {
    position: { x: number; y: number };
  };

  /** Compute positions for the warehouse nodes. */
  const nodeLayout = useMemo(() => {
    const withPosition: LayoutCellWithPos[] = [];
    const withoutPosition: LayoutCell[] = [];

    for (const ww of workspaceWarehouses) {
      const w = ww.warehouse;
      const width = w ? w.width * CELL_SIZE : 300;
      const height = w ? w.height * CELL_SIZE + TITLE_BAR_HEIGHT : 200 + TITLE_BAR_HEIGHT;
      if (ww.position) {
        withPosition.push({ id: ww.id, width, height, position: ww.position });
      } else {
        withoutPosition.push({ id: ww.id, width, height });
      }
    }

    // Auto-layout for unsaved cells
    const rows: LayoutCell[][] = [];
    for (const cell of withoutPosition) {
      if (
        rows.length === 0 ||
        rows[rows.length - 1].length >= GRID_COLS
      ) {
        rows.push([cell]);
      } else {
        rows[rows.length - 1].push(cell);
      }
    }

    const autoYStart =
      withPosition.length > 0
        ? Math.max(...withPosition.map((p) => p.position.y + p.height)) +
          GRID_GAP_Y
        : 0;
    let y = autoYStart;
    const autoPositions: LayoutCellWithPos[] = [];
    for (const row of rows) {
      const maxHeight = Math.max(...row.map((c) => c.height));
      let x = 0;
      for (const cell of row) {
        let adjustedY = y;
        for (const pNode of withPosition) {
          const overlapX =
            x < pNode.position.x + pNode.width &&
            x + cell.width > pNode.position.x;
          const overlapY =
            adjustedY < pNode.position.y + pNode.height &&
            adjustedY + maxHeight > pNode.position.y;
          if (overlapX && overlapY) {
            adjustedY = pNode.position.y + pNode.height + GRID_GAP_Y;
          }
        }
        autoPositions.push({
          ...cell,
          position: { x, y: adjustedY },
        });
        x += cell.width + GRID_GAP_X;
      }
      y =
        Math.max(
          y + maxHeight + GRID_GAP_Y,
          ...autoPositions
            .filter((p) => p.id === row[row.length - 1]?.id)
            .map((p) => p.position.y + p.height + GRID_GAP_Y),
        );
    }

    return [...withPosition, ...autoPositions] as LayoutCellWithPos[];
  }, [workspaceWarehouses]);

  // Re-create nodes when workspace warehouses change structurally.
  const workspaceKey = useMemo(
    () => workspaceWarehouses.map((w) => w.id).join(','),
    [workspaceWarehouses],
  );

  useEffect(() => {
    const newNodes: FlowNode[] = [];

    for (const layout of nodeLayout) {
      const ww = workspaceWarehouses.find((w) => w.id === layout.id);
      if (ww) {
        newNodes.push({
          id: layout.id,
          type: 'warehouse',
          position: layout.position,
          width: layout.width,
          height: layout.height,
          draggable: true,
          selectable: false,
          focusable: false,
          data: {
            warehouseId: ww.id,
            warehouseName: ww.name,
            warehouse: ww.warehouse,
            onWarehouseChange,
            onSelect: onSelectWarehouse,
            onDuplicate: onDuplicateWarehouse,
            onRename: onRenameWarehouse,
            onDelete: onDeleteWarehouse,
            onOpenLayoutConfig,
            configuration: ww.configuration ?? null,
            canDelete: workspaceWarehouses.length > 1,
            selectedTool,
            // Only the active warehouse animates its route — passing the route to
            // every node made each canvas run its own rAF redraw loop.
            activeRoute: layout.id === activeWarehouseId ? activeRoute : null,
            animationProgressRef,
            zVisualizationMode,
            animationReplayId,
            isActive: layout.id === activeWarehouseId,
            isDuplicating: layout.id === duplicatingWarehouseId,
            isDeleting: layout.id === deletingWarehouseId,
            isRenaming: layout.id === renamingWarehouseId,
          },
        });
      }
    }

    setNodes(newNodes);

    if (prevCountRef.current !== workspaceWarehouses.length) {
      prevCountRef.current = workspaceWarehouses.length;
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  // Sync node data without recreation.
  useEffect(() => {
    setNodes((nds) =>
      nds.map((n) => {
        const ww = workspaceWarehouses.find((w) => w.id === n.id);
        if (ww) {
          return {
            ...n,
            draggable: true,
            data: {
              warehouseId: ww.id,
              warehouseName: ww.name,
              warehouse: ww.warehouse,
              onWarehouseChange,
              onSelect: onSelectWarehouse,
              onDuplicate: onDuplicateWarehouse,
              onRename: onRenameWarehouse,
              onDelete: onDeleteWarehouse,
              onOpenLayoutConfig,
              configuration: ww.configuration ?? null,
              canDelete: workspaceWarehouses.length > 1,
              selectedTool,
              // Only the active warehouse animates its route — see above.
              activeRoute: n.id === activeWarehouseId ? activeRoute : null,
              animationProgressRef,
              zVisualizationMode,
              animationReplayId,
              isActive: n.id === activeWarehouseId,
              isDuplicating: n.id === duplicatingWarehouseId,
              isDeleting: n.id === deletingWarehouseId,
              isRenaming: n.id === renamingWarehouseId,
            },
          };
        }
        return n;
      }),
    );
  }, [
    workspaceWarehouses,
    activeWarehouseId,
    onWarehouseChange,
    onSelectWarehouse,
    onRenameWarehouse,
    onDeleteWarehouse,
    onDuplicateWarehouse,
    onOpenLayoutConfig,
    selectedTool,
    activeRoute,
    animationProgressRef,
    zVisualizationMode,
    animationReplayId,
    duplicatingWarehouseId,
    deletingWarehouseId,
    renamingWarehouseId,
    setNodes,
  ]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (node.type === 'warehouse') {
        onSelectWarehouse(node.id, { additive: event.shiftKey });
      }
    },
    [onSelectWarehouse],
  );

  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const id = node.id;
      const pos = node.position;

      const timers = positionTimersRef.current;
      if (timers.has(id)) clearTimeout(timers.get(id)!);

      timers.set(
        id,
        setTimeout(() => {
          if (workspaceWarehouses.find((w) => w.id === id)) {
            onPersistPosition(id, pos.x, pos.y);
          }
          timers.delete(id);
        }, 500),
      );
    },
    [workspaceWarehouses, onPersistPosition],
  );

  const isHandTool = selectedTool === 'hand';

  return (
    <div className="relative flex-1 w-full h-full">
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
        onlyRenderVisibleElements={true}
        colorMode="light"
        className="bg-background"
        deleteKeyCode={null}
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#C9C5C4"
        />
      </ReactFlow>
    </div>
  );
}
