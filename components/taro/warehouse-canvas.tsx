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

import { useMemo, useRef, useState, useEffect } from 'react';
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

/** Padding (px) kept between the warehouse and the canvas edges when fitting. */
const FIT_PADDING = 24;

/**
 * Upper bound on how much a smaller warehouse may be upscaled to fill the
 * canvas. Vector SVG stays crisp at any scale; this just keeps a tiny
 * warehouse from ballooning absurdly large inside a huge viewport.
 */
const MAX_UPSCALE = 1.5;

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

  // Canvas measurement — tracks the available space so the warehouse can be
  // scaled to fit and centered (both vertically + horizontally).
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setCanvasSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  // Fit-to-container: scale the warehouse so it fits inside the available
  // canvas area (both axes), then center it in both directions. Because the
  // SVG is vector, any scale stays crisp.
  const availW = Math.max(canvasSize.w - FIT_PADDING * 2, 1);
  const availH = Math.max(canvasSize.h - FIT_PADDING * 2, 1);
  const fitScale =
    canvasSize.w > 0 && canvasSize.h > 0
      ? Math.min(
          Math.min(availW / logicalW, availH / logicalH),
          MAX_UPSCALE,
        )
      : 1;

  return (
    <div ref={canvasRef} className="relative flex-1 w-full h-full overflow-auto bg-background">
      {/*
       * Centering wrapper: a flex container fills the canvas and centers the
       * warehouse. The warehouse is then scaled about its center with a CSS
       * transform (the vector SVG stays crisp at any scale), so it both fits
       * the available space and stays visually centered in both axes. When
       * the warehouse is larger than the canvas it overflows and scrolls.
       */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="relative border border-border rounded-md shadow-sm"
        style={{ width: logicalW, height: logicalH, transform: `scale(${fitScale})` }}
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
            zoom={fitScale}
          />
        </div>
      </div>
      </div>
    </div>
  );
}
