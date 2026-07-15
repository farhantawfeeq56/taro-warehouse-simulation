'use client';

import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { WarehouseCanvas } from './warehouse-canvas';

export type WarehouseNodeData = Record<string, unknown> & {
  warehouseId: string;
  warehouse: Warehouse;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  onSelect?: (warehouseId: string) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
  /** Whether this node is the currently active/selected warehouse. */
  isActive: boolean;
};

/**
 * Custom React Flow node that renders the existing WarehouseCanvas inside.
 * Interaction classes (`nodrag`, `nopan`, `nowheel`) are conditionally applied:
 * - When a drawing tool is active → React Flow ignores events on the canvas,
 *   allowing the canvas to handle drawing, internal pan, and hover.
 * - When the hand/pan tool is active → events bubble through so React Flow
 *   handles viewport pan/zoom; the canvas stops handling drawing.
 *
 * A title bar at the top shows the warehouse name and a visual selection
 * indicator. Clicking the title bar or the node selects the warehouse.
 */
function WarehouseFlowNode({ data }: NodeProps<Node<WarehouseNodeData>>) {
  const isHandTool = data.selectedTool === 'hand';
  const label = `Warehouse ${data.warehouseId?.slice(0, 8) ?? '–'}`;

  return (
    <div
      className={
        isHandTool
          ? 'relative w-full h-full'
          : 'nodrag nopan relative w-full h-full'
      }
    >
      {/* Title bar — always clickable for selection */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => data.onSelect?.(data.warehouseId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            data.onSelect?.(data.warehouseId);
          }
        }}
        className={`
          flex items-center justify-between px-3 py-1.5 text-xs font-medium border-b select-none
          ${data.isActive
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
          }
        `}
        style={{ cursor: 'pointer' }}
      >
        <span className="truncate">{label}</span>
        {data.isActive && (
          <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            Active
          </span>
        )}
      </div>

      {/* Canvas */}
      <WarehouseCanvas
        warehouseId={data.warehouseId}
        warehouse={data.warehouse}
        onWarehouseChange={data.onWarehouseChange}
        selectedTool={data.selectedTool}
        activeRoute={data.activeRoute}
        animationProgressRef={data.animationProgressRef}
        zVisualizationMode={data.zVisualizationMode}
        animationReplayId={data.animationReplayId}
      />
    </div>
  );
}

export default memo(WarehouseFlowNode);
