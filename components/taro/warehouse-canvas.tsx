'use client';

/**
 * WarehouseCanvas — the single-warehouse workspace canvas (replaces the
 * React Flow `WarehouseFlow`; the flow dependency was removed so the canvas
 * is now plain DOM + SVG).
 *
 * The app supports exactly one warehouse, so the canvas renders that
 * warehouse's warehouse renderer directly — there is no title bar (the old
 * per-warehouse Name / Configuration / Duplicate / Delete / Active controls
 * were removed; configuration now lives in the right sidebar). Pan/zoom
 * affordances are intentionally not re-implemented here: the SVG renderer
 * draws at logical size and the page scrolls/clips naturally.
 */

import { useMemo } from 'react';
import type {
  Warehouse,
  ToolType,
  StrategyResult,
  ZVisualizationMode,
  WorkspaceWarehouse,
} from '@/lib/taro/types';
import type { MutableRefObject } from 'react';
import { CELL_SIZE } from '@/lib/taro/constants';
import { WarehouseSvgRenderer } from './warehouse-svg-renderer';

interface WarehouseCanvasProps {
  workspaceWarehouses: WorkspaceWarehouse[];
  activeWarehouseId: string | null;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
}

/**
 * Renders the active warehouse: just its SVG renderer, no title bar.
 */
export function WarehouseCanvas({
  workspaceWarehouses,
  activeWarehouseId,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseCanvasProps) {
  const active = useMemo(
    () => workspaceWarehouses.find((w) => w.id === activeWarehouseId) ?? null,
    [workspaceWarehouses, activeWarehouseId],
  );

  if (!active) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center bg-muted/20">
        <p className="text-sm text-muted-foreground">No warehouse configured.</p>
      </div>
    );
  }

  const warehouse = active.warehouse;
  const logicalW = warehouse.width * CELL_SIZE;
  const logicalH = warehouse.height * CELL_SIZE;

  return (
    <div className="relative flex-1 w-full h-full overflow-auto bg-background">
      <div
        className="relative border border-border rounded-md shadow-sm mx-auto"
        style={{ width: logicalW, height: logicalH }}
      >
        {/* Warehouse renderer — SVG (vector-crisp at every zoom). */}
        <div className="relative" style={{ width: logicalW, height: logicalH }}>
          <WarehouseSvgRenderer
            warehouseId={active.id}
            warehouse={warehouse}
            onWarehouseChange={onWarehouseChange}
            selectedTool={selectedTool}
            activeRoute={activeRoute}
            animationProgressRef={animationProgressRef}
            zVisualizationMode={zVisualizationMode}
            animationReplayId={animationReplayId}
          />
        </div>
      </div>
    </div>
  );
}