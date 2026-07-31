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
  type Edge,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type {
  Warehouse,
  ToolType,
  StrategyResult,
  ZVisualizationMode,
  WorkspaceWarehouse,
  Comparison,
} from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import WarehouseFlowNode from './warehouse-flow-node';
import type { WarehouseNodeData } from './warehouse-flow-node';
import ComparisonFlowNode from './comparison-flow-node';
import type { ComparisonNodeData } from './comparison-flow-node';
import { Plus } from 'lucide-react';

/**
 * Auto-layout: simple 2-column grid that avoids overlap.
 * Used only for nodes that have no saved position.
 */
const GRID_COLS = 2;
const GRID_GAP_X = 48;
const GRID_GAP_Y = 48;

/** Title bar height for warehouse nodes. */
const TITLE_BAR_HEIGHT = 32;
/** Fixed dimensions for comparison nodes (no inner grid). */
const COMPARISON_WIDTH = 260;
const COMPARISON_HEIGHT = 100 + TITLE_BAR_HEIGHT;

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
  onNewWarehouse: () => void;
  workerCount: number;
  onWorkerCountChange: (count: number) => void;
  onPersistPosition: (warehouseId: string, x: number, y: number) => void;

  // Comparison support
  comparisons: Comparison[];
  activeComparisonId: string | null;
  warehouseNames: Record<string, string>; // warehouseId → name
  comparisonScores: Record<string, { winnerId: string | null; winnerName: string; winnerEfficiency: number } | null>;
  onSelectComparison: (comparisonId: string, opts?: { additive?: boolean }) => void;
  onRenameComparison: (comparisonId: string, name: string) => void;
  onDeleteComparison: (comparisonId: string) => void;
  onPersistComparisonPosition: (comparisonId: string, x: number, y: number) => void;

  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;

  // Link mode
  linkModeComparisonId: string | null;
  comparisonStaleness: Record<string, boolean>;
  onToggleMember: (comparisonId: string, warehouseId: string) => void;
  onStartLink: (comparisonId: string) => void;
  onExitLink: () => void;
}

const nodeTypes: NodeTypes = {
  warehouse: WarehouseFlowNode,
  comparison: ComparisonFlowNode,
};

const defaultEdgeOptions = {};

type FlowNode = Node<WarehouseNodeData | ComparisonNodeData>;

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
  onNewWarehouse,
  workerCount,
  onWorkerCountChange,
  onPersistPosition,
  comparisons,
  activeComparisonId,
  warehouseNames,
  comparisonScores,
  onSelectComparison,
  onRenameComparison,
  onDeleteComparison,
  onPersistComparisonPosition,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
  // Link mode
  linkModeComparisonId,
  comparisonStaleness,
  onToggleMember,
  onStartLink,
  onExitLink,
  // Loading states
  duplicatingWarehouseId,
  deletingWarehouseId,
}: WarehouseFlowProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const reactFlowInstance = useReactFlow();
  const prevCountRef = useRef(
    workspaceWarehouses.length + comparisons.length,
  );
  const positionTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  type LayoutCell = { id: string; width: number; height: number };
  type LayoutCellWithPos = LayoutCell & {
    position: { x: number; y: number };
  };

  /** Compute positions for both warehouse nodes and comparison nodes together. */
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

    for (const c of comparisons) {
      if (c.positionX != null && c.positionY != null) {
        withPosition.push({
          id: c.id,
          width: COMPARISON_WIDTH,
          height: COMPARISON_HEIGHT,
          position: { x: c.positionX, y: c.positionY },
        });
      } else {
        withoutPosition.push({
          id: c.id,
          width: COMPARISON_WIDTH,
          height: COMPARISON_HEIGHT,
        });
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
  }, [workspaceWarehouses, comparisons]);

  // Derived edges: one edge from each member warehouse to its comparison.
  const edges = useMemo((): Edge[] => {
    const es: Edge[] = [];
    for (const c of comparisons) {
      for (const wid of c.warehouseIds) {
        es.push({
          id: `${wid}→${c.id}`,
          source: wid,
          target: c.id,
          sourceHandle: null,
          targetHandle: null,
          type: 'smoothstep',
          animated: false,
          style: {
            stroke: '#94a3b8',
            strokeWidth: 1.5,
            strokeDasharray: '5 3',
            opacity: 0.6,
          },
        });
      }
    }
    return es;
  }, [comparisons]);

  // Re-create nodes when workspace warehouses or comparisons change structurally.
  const workspaceKey = useMemo(
    () =>
      [
        workspaceWarehouses.map((w) => w.id).join(','),
        comparisons.map((c) => c.id).join(','),
      ].join('|'),
    [workspaceWarehouses, comparisons],
  );

  useEffect(() => {
    const newNodes: FlowNode[] = [];

    // Warehouse nodes
    for (const layout of nodeLayout) {
      const ww = workspaceWarehouses.find((w) => w.id === layout.id);
      if (ww) {
        // Scoreboard data derive from comparisonResultsById — but we don't have it here.
        // Scoreboard is handled at the comparison node level later.
        const isLinkMode = linkModeComparisonId != null;
        const linkComp =
          linkModeComparisonId
            ? comparisons.find((c) => c.id === linkModeComparisonId)
            : null;
        const isWarehouseMember =
          linkComp != null && linkComp.warehouseIds.includes(ww.id);
        newNodes.push({
          id: layout.id,
          type: 'warehouse',
          position: layout.position,
          width: layout.width,
          height: layout.height,
          draggable: !isLinkMode,
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
            workerCount,
            onWorkerCountChange,
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
            // Link-mode fields
            isLinkMode,
            isMember: isWarehouseMember,
            linkModeComparisonId,
            onToggleMember,
          },
        });
      } else {
        const comp = comparisons.find((c) => c.id === layout.id);
        if (comp) {
          newNodes.push({
            id: layout.id,
            type: 'comparison',
            position: layout.position,
            width: layout.width,
            height: layout.height,
            draggable: !(linkModeComparisonId === comp.id),
            selectable: false,
            focusable: false,
            data: {
              comparisonId: comp.id,
              comparisonName: comp.name,
              warehouseIds: comp.warehouseIds,
              warehouseNames,
              score: comparisonScores[comp.id] ?? null,
              stale: comparisonStaleness[comp.id] ?? false,
              onSelect: onSelectComparison,
              onRename: onRenameComparison,
              onDelete: onDeleteComparison,
              memberCount: comp.warehouseIds.length,
              isActive: comp.id === activeComparisonId,
              // Link-mode fields
              isLinkModeTarget: linkModeComparisonId === comp.id,
              onStartLink,
              onExitLink,
            },
          });
        }
      }
    }

    setNodes(newNodes);

    if (
      prevCountRef.current !==
      workspaceWarehouses.length + comparisons.length
    ) {
      prevCountRef.current =
        workspaceWarehouses.length + comparisons.length;
      requestAnimationFrame(() => reactFlowInstance.fitView({ padding: 0.2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceKey]);

  // Sync node data without recreation.
  useEffect(() => {
    const isLinkMode = linkModeComparisonId != null;
    setNodes((nds) =>
      nds.map((n) => {
        const ww = workspaceWarehouses.find((w) => w.id === n.id);
        if (ww) {
          const linkComp =
            linkModeComparisonId
              ? comparisons.find((c) => c.id === linkModeComparisonId)
              : null;
          const isWarehouseMember =
            linkComp != null && linkComp.warehouseIds.includes(ww.id);
          return {
            ...n,
            draggable: !isLinkMode,
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
              workerCount,
              onWorkerCountChange,
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
              // Link-mode fields
              isLinkMode,
              isMember: isWarehouseMember,
              linkModeComparisonId,
              onToggleMember,
            },
          };
        }

        const comp = comparisons.find((c) => c.id === n.id);
        if (comp) {
          return {
            ...n,
            draggable: !(linkModeComparisonId === comp.id),
            data: {
              comparisonId: comp.id,
              comparisonName: comp.name,
              warehouseIds: comp.warehouseIds,
              warehouseNames,
              score: comparisonScores[comp.id] ?? null,
              stale: comparisonStaleness[comp.id] ?? false,
              onSelect: onSelectComparison,
              onRename: onRenameComparison,
              onDelete: onDeleteComparison,
              memberCount: comp.warehouseIds.length,
              isActive: comp.id === activeComparisonId,
              // Link-mode fields
              isLinkModeTarget: linkModeComparisonId === comp.id,
              onStartLink,
              onExitLink,
            },
          };
        }

        return n;
      }),
    );
  }, [
    workspaceWarehouses,
    activeWarehouseId,
    comparisons,
    activeComparisonId,
    onWarehouseChange,
    onSelectWarehouse,
    onRenameWarehouse,
    onDeleteWarehouse,
    onDuplicateWarehouse,
    onOpenLayoutConfig,
    workerCount,
    onWorkerCountChange,
    onSelectComparison,
    onRenameComparison,
    onDeleteComparison,
    selectedTool,
    activeRoute,
    animationProgressRef,
    zVisualizationMode,
    animationReplayId,
    warehouseNames,
    linkModeComparisonId,
    comparisonStaleness,
    onToggleMember,
    onStartLink,
    onExitLink,
    duplicatingWarehouseId,
    deletingWarehouseId,
    setNodes,
  ]);

  const handleNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      // In link mode: clicking a warehouse toggles membership for the active
      // link-target comparison.
      if (linkModeComparisonId) {
        if (node.type === 'warehouse') {
          event.stopPropagation();
          onToggleMember(linkModeComparisonId, node.id);
        }
        // Clicking anything else (comparison / canvas) stays in link mode.
        return;
      }

      if (node.type === 'warehouse') {
        onSelectWarehouse(node.id, { additive: event.shiftKey });
      } else {
        onSelectComparison(node.id, { additive: event.shiftKey });
      }
    },
    [linkModeComparisonId, onToggleMember, onSelectWarehouse, onSelectComparison],
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
          } else if (comparisons.find((c) => c.id === id)) {
            onPersistComparisonPosition(id, pos.x, pos.y);
          }
          timers.delete(id);
        }, 500),
      );
    },
    [
      workspaceWarehouses,
      comparisons,
      onPersistPosition,
      onPersistComparisonPosition,
    ],
  );

  // Escape key exits link mode
  useEffect(() => {
    if (!linkModeComparisonId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onExitLink();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [linkModeComparisonId, onExitLink]);

  // Clicking empty canvas exits link mode
  const handlePaneClick = useCallback(() => {
    if (linkModeComparisonId) onExitLink();
  }, [linkModeComparisonId, onExitLink]);

  const isHandTool = selectedTool === 'hand';

  return (
    <div className="relative flex-1 w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onNodeClick={handleNodeClick}
        onNodeDragStop={handleNodeDragStop}
        onPaneClick={handlePaneClick}
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

      {/* Floating Add Warehouse button — subtle top left */}
      <button
        onClick={onNewWarehouse}
        title="Add a new warehouse"
        className="
          nodrag absolute top-3 left-3 z-50
          flex items-center gap-1 px-2 py-1.5
          bg-white/60 backdrop-blur-sm text-muted-foreground
          border border-border rounded-lg
          hover:bg-white hover:text-foreground hover:border-muted-foreground/30
          active:bg-muted
          transition-colors text-[11px] font-medium shadow-sm
        "
      >
        <Plus className="h-3.5 w-3.5" />
        Add
      </button>
    </div>
  );
}
