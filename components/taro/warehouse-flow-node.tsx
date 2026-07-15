'use client';

import { memo } from 'react';
import type { Node, NodeProps } from '@xyflow/react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { WarehouseCanvas } from './warehouse-canvas';

export type WarehouseNodeData = Record<string, unknown> & {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
};

/**
 * Custom React Flow node that renders the existing WarehouseCanvas inside.
 * Interaction classes (`nodrag`, `nopan`, `nowheel`) are conditionally applied:
 * - When a drawing tool is active → React Flow ignores events on the canvas,
 *   allowing the canvas to handle drawing, internal pan, and hover.
 * - When the hand/pan tool is active → events bubble through so React Flow
 *   handles viewport pan/zoom; the canvas stops handling drawing.
 */
function WarehouseFlowNode({ data }: NodeProps<Node<WarehouseNodeData>>) {
  console.log('[WarehouseFlowNode] render', { selectedTool: data.selectedTool, isHand: data.selectedTool === 'hand' });
  const isHandTool = data.selectedTool === 'hand';

  return (
    <div
      className={
        isHandTool
          ? 'relative w-full h-full'
          : 'nodrag nopan relative w-full h-full'
      }
    >
      <WarehouseCanvas
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
