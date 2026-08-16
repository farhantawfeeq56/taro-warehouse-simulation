'use client';

/**
 * Variant B — "improved canvas" renderer experiment.
 *
 * This is a SEPARATE implementation from the baseline (WarehouseCanvas) so
 * we can A/B/C them. It renders the exact same warehouse data with the exact
 * same grid geometry, but changes ONLY the rasterization strategy:
 *
 *   1. Backing store is sized to the CURRENT zoom × devicePixelRatio
 *      (logical size × zoom × dpr), redrawn in logical coordinates via a
 *      ctx.scale() so content stays resolution-independent.
 *   2. Re-rasterization is driven by requestAnimationFrame (throttled to
 *      one pass per frame) instead of a 120ms setTimeout debounce.
 *   3. The MAX_CANVAS_DIMENSION safety cap is preserved (soft budget).
 *
 * It intentionally does NOT apply an inverse-scale wrapper — the point is to
 * answer "how good can the plain canvas approach be?".
 *
 * Interactions (drawing tools, hover tooltip, shelf details, route
 * animation) are mirrored from the baseline so all three variants behave the
 * same. The animation loop uses rAF to redraw while a route is active.
 */

import { useRef, useEffect, useState, useCallback, useMemo, memo, type MutableRefObject } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode, StorageLocation } from '@/lib/taro/types';
import { CELL_SIZE, GRID_COLOR, SHELF_COLOR, WORKER_COLOR, EMPTY_COLOR, Z_LEVEL_COLORS } from '@/lib/taro/constants';
import { buildCoordinateLocations, getShelfLocationId } from '@/lib/taro/layout';
import { getNextSku } from '@/lib/taro/demo-generator';

const PAPER = {
  dark: '#1C2118',
  gold: '#D6A83D',
  purple: '#8A70A8',
  blue: '#5B8DB8',
  orange: '#C87555',
} as const;

const PAPER_TILES = [PAPER.gold, PAPER.purple, PAPER.blue, PAPER.orange];

const MAX_CANVAS_DIMENSION = 4096;

interface WarehouseCanvasExperimentProps {
  warehouseId?: string;
  warehouse: Warehouse;
  onWarehouseChange: (warehouseId: string, warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgressRef: MutableRefObject<number>;
  zVisualizationMode: ZVisualizationMode;
  animationReplayId: number;
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  locations: StorageLocation[];
}

interface ShelfDetailsState {
  visible: boolean;
  cellX: number;
  cellY: number;
  locations: StorageLocation[];
}

function WarehouseCanvasExperimentInner({
  warehouseId,
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseCanvasExperimentProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const rectRef = useRef<DOMRect | null>(null);

  // Zoom at which the backing store was last rasterized.
  const lastRasterizedZoomRef = useRef<number | null>(null);
  // Pending rAF id for rasterize-on-idle.
  const rasterizeRafRef = useRef<number | null>(null);

  const [isDrawing, setIsDrawing] = useState(false);
  const reactFlowInstance = useReactFlow();
  const storeApi = useStoreApi();
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    cellX: 0,
    cellY: 0,
    locations: [],
  });
  const [shelfDetails, setShelfDetails] = useState<ShelfDetailsState | null>(null);

  const logicalW = useMemo(() => warehouse.width * CELL_SIZE, [warehouse.width]);
  const logicalH = useMemo(() => warehouse.height * CELL_SIZE, [warehouse.height]);

  useEffect(() => {
    const updateRect = () => {
      const canvas = canvasRef.current;
      if (canvas) rectRef.current = canvas.getBoundingClientRect();
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  const getCellFromMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rfZoom = reactFlowInstance.getZoom();
    const rect = rectRef.current;
    if (!rect) return null;
    const x = (e.clientX - rect.left) / rfZoom;
    const y = (e.clientY - rect.top) / rfZoom;
    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);
    if (cellX >= 0 && cellX < warehouse.width && cellY >= 0 && cellY < warehouse.height) {
      return { x: cellX, y: cellY };
    }
    return null;
  }, [warehouse.width, warehouse.height, reactFlowInstance]);

  const applyTool = useCallback((cellX: number, cellY: number) => {
    const newGrid = [...warehouse.grid];

    const cloneRow = (y: number) => {
      if (newGrid[y] === warehouse.grid[y]) {
        newGrid[y] = [...newGrid[y]];
      }
    };

    let newShelves = warehouse.shelves;
    let newWorkerStart = warehouse.workerStart;

    switch (selectedTool) {
      case 'shelf':
        if (newGrid[cellY][cellX].type === 'empty') {
          cloneRow(cellY);
          newGrid[cellY][cellX] = { ...warehouse.grid[cellY][cellX], type: 'shelf', locations: [] };
          newShelves = [...newShelves, { x: cellX, y: cellY }];
        }
        break;
      case 'worker':
        if (newWorkerStart) {
          const old = warehouse.grid[newWorkerStart.y][newWorkerStart.x];
          if (old.type === 'worker-start') {
            cloneRow(newWorkerStart.y);
            newGrid[newWorkerStart.y][newWorkerStart.x] = { ...old, type: 'empty', locations: [] };
          }
        }
        if (newGrid[cellY][cellX].type === 'empty') {
          cloneRow(cellY);
          newGrid[cellY][cellX] = { ...warehouse.grid[cellY][cellX], type: 'worker-start', locations: [] };
          newWorkerStart = { x: cellX, y: cellY };
        }
        break;
      case 'erase':
        cloneRow(cellY);
        {
          const erased = newGrid[cellY][cellX];
          if (erased.type === 'shelf') {
            newShelves = newShelves.filter(s => !(s.x === cellX && s.y === cellY));
          }
          if (erased.type === 'worker-start') {
            newWorkerStart = null;
          }
        }
        newGrid[cellY][cellX] = { ...warehouse.grid[cellY][cellX], type: 'empty', locations: [] };
        break;
    }

    const newWarehouse: Warehouse = {
      ...warehouse,
      grid: newGrid,
      shelves: newShelves,
      workerStart: newWorkerStart,
    };
    newWarehouse.locations = buildCoordinateLocations(newWarehouse);
    onWarehouseChange(warehouseId ?? '', newWarehouse);
  }, [warehouse, selectedTool, warehouseId, onWarehouseChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'hand' || selectedTool === 'select') return;
    if (e.button === 0) {
      setIsDrawing(true);
      const cell = getCellFromMouse(e);
      if (cell) applyTool(cell.x, cell.y);
    }
  }, [selectedTool, getCellFromMouse, applyTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'hand' || selectedTool === 'select') return;
    if (isDrawing) {
      const cell = getCellFromMouse(e);
      if (cell) applyTool(cell.x, cell.y);
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    const cell = getCellFromMouse(e);
    setHoveredCell(cell);
    if (cell) {
      const cellData = warehouse.grid[cell.y][cell.x];
      if (cellData.type === 'shelf') {
        let filteredLocations = cellData.locations;
        if (zVisualizationMode !== 'all') {
          const selectedLevel = parseInt(zVisualizationMode.replace('level', ''), 10);
          filteredLocations = cellData.locations.filter(loc => loc.z === selectedLevel);
        }

        const container = containerRef.current;
        const cRect = container?.getBoundingClientRect();
        const tipX = cRect ? e.clientX - cRect.left : e.clientX;
        const tipY = cRect ? e.clientY - cRect.top - 10 : e.clientY - 10;

        setTooltip({
          visible: true,
          x: tipX,
          y: tipY,
          cellX: cell.x,
          cellY: cell.y,
          locations: filteredLocations,
        });
      } else {
        setTooltip(prev => ({ ...prev, visible: false }));
      }
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  }, [selectedTool, isDrawing, getCellFromMouse, applyTool, warehouse.grid, zVisualizationMode]);

  const handleMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDrawing(false);
    setHoveredCell(null);
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (selectedTool === 'hand') return;
    const cellPosition = getCellFromMouse(e);
    if (!cellPosition) return;
    const cell = warehouse.grid[cellPosition.y][cellPosition.x];
    if (cell.type !== 'shelf') {
      setShelfDetails(null);
      return;
    }
    setShelfDetails({
      visible: true,
      cellX: cellPosition.x,
      cellY: cellPosition.y,
      locations: cell.locations,
    });
  }, [selectedTool, getCellFromMouse, warehouse]);

  const addItemToShelf = useCallback(() => {
    if (!shelfDetails) return;
    const nextWarehouse = {
      ...warehouse,
      grid: warehouse.grid.map(row => row.map(cell => ({ ...cell, locations: [...cell.locations] }))),
    };

    const locationId = getShelfLocationId(shelfDetails.cellX, shelfDetails.cellY);
    const cell = nextWarehouse.grid[shelfDetails.cellY][shelfDetails.cellX];
    const nextZ = Math.min(cell.locations.length + 1, 4);
    if (cell.locations.length >= 4) return;

    const sku = getNextSku(warehouse);
    const newLocation: StorageLocation = {
      id: `${sku}@${shelfDetails.cellX},${shelfDetails.cellY},${nextZ}`,
      locationId,
      x: shelfDetails.cellX,
      y: shelfDetails.cellY,
      z: nextZ,
      sku,
      quantity: 50,
    };
    cell.locations.push(newLocation);
    nextWarehouse.locations = buildCoordinateLocations(nextWarehouse);
    onWarehouseChange(warehouseId ?? '', nextWarehouse);
  }, [onWarehouseChange, shelfDetails, warehouse, warehouseId]);

  const selectedShelfCell = shelfDetails
    ? warehouse.grid[shelfDetails.cellY]?.[shelfDetails.cellX]
    : null;
  const shelfBins = selectedShelfCell?.locations ?? [];

  const activeRouteHeatmap = useCallback((): number[][] | null => {
    if (!activeRoute) return null;
    const heatmap: number[][] = Array(warehouse.height)
      .fill(null)
      .map(() => Array(warehouse.width).fill(0));

    const routeGroups = activeRoute.workerRoutes && activeRoute.workerRoutes.length > 0
      ? activeRoute.workerRoutes.map(workerRoute => workerRoute.route)
      : [activeRoute.route];

    for (const route of routeGroups) {
      for (const pos of route) {
        const rx = Math.round(pos.x);
        const ry = Math.round(pos.y);
        if (ry >= 0 && ry < warehouse.height && rx >= 0 && rx < warehouse.width) {
          heatmap[ry][rx]++;
        }
      }
    }
    return heatmap;
  }, [activeRoute, warehouse.height, warehouse.width]);

  useEffect(() => {
    if (!shelfDetails) return;
    const latestCell = warehouse.grid[shelfDetails.cellY]?.[shelfDetails.cellX];
    if (!latestCell || latestCell.type !== 'shelf') {
      setShelfDetails(null);
      return;
    }
    if (shelfDetails.locations !== latestCell.locations) {
      setShelfDetails(prev => prev ? { ...prev, locations: latestCell.locations } : prev);
    }
  }, [warehouse, shelfDetails?.cellX, shelfDetails?.cellY, shelfDetails?.locations, shelfDetails]);

  const drawShelf = useCallback(
    (ctx: CanvasRenderingContext2D, px: number, py: number, slots: (string | null)[]) => {
      const S = CELL_SIZE;
      const pad = 2;
      const x = px + pad;
      const y = py + pad;
      const w = S - pad * 2;
      const h = S - pad * 2;

      ctx.fillStyle = PAPER.dark;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 2);
      ctx.fill();

      const padX = w * 0.08;
      const padY = h * 0.1;
      const gap = w * 0.06;
      const tw = (w - padX * 2 - gap) / 2;
      const th = (h - padY * 2 - gap) / 2;
      const ox = x + padX;
      const oy = y + padY;

      const r = Math.min(tw, th) / 2;
      const positions = [
        [ox + tw / 2, oy + th / 2],
        [ox + tw + gap + tw / 2, oy + th / 2],
        [ox + tw / 2, oy + th + gap + th / 2],
        [ox + tw + gap + tw / 2, oy + th + gap + th / 2],
      ] as const;
      positions.forEach(([cxp, cyp], i) => {
        const color = slots[i];
        if (color) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(cxp, cyp, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    },
    [],
  );

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    const scale = canvas.width / logicalW;
    ctx.scale(scale, scale);

    for (let y = 0; y < warehouse.grid.length; y++) {
      for (let x = 0; x < warehouse.grid[0].length; x++) {
        const cell = warehouse.grid[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        let fillColor = EMPTY_COLOR;
        switch (cell.type) {
          case 'shelf':
            fillColor = SHELF_COLOR;
            break;
          case 'worker-start':
            fillColor = WORKER_COLOR;
            break;
        }

        ctx.fillStyle = fillColor;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);

        if (cell.type === 'shelf') {
          ctx.strokeStyle = '#E7E8EC';
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);

          const slotSlots: (string | null)[] = [null, null, null, null];
          cell.locations.slice(0, 4).forEach((loc, i) => {
            slotSlots[i] = PAPER_TILES[i % PAPER_TILES.length] ?? '#3b82f6';
          });
          drawShelf(ctx, px, py, slotSlots);
        }

        if (cell.type !== 'shelf') {
          ctx.strokeStyle = GRID_COLOR;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
        }

        if (cell.type === 'worker-start') {
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', px + CELL_SIZE / 2, py + CELL_SIZE / 2);
        }
      }
    }

    const heatmap = activeRouteHeatmap();
    if (heatmap) {
      const maxHeat = heatmap.reduce((max, row) => Math.max(max, ...row), 0);
      if (maxHeat > 0) {
        for (let y = 0; y < warehouse.height; y++) {
          for (let x = 0; x < warehouse.width; x++) {
            const heat = heatmap[y][x];
            if (heat <= 0) continue;
            const px = x * CELL_SIZE;
            const py = y * CELL_SIZE;
            const intensity = heat / maxHeat;
            const alpha = 0.12 + intensity * 0.43;
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha.toFixed(3)})`;
            ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
          }
        }
      }
    }

    if (activeRoute) {
      if (activeRoute.workerRoutes && activeRoute.workerRoutes.length > 0) {
        for (const workerRoute of activeRoute.workerRoutes) {
          if (workerRoute.route.length === 0) continue;
          const visiblePoints = Math.max(1, Math.floor(workerRoute.route.length * animationProgressRef.current));
          ctx.beginPath();
          ctx.strokeStyle = workerRoute.color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 0.8;
          const firstPoint = workerRoute.route[0];
          ctx.moveTo(firstPoint.x * CELL_SIZE + CELL_SIZE / 2, firstPoint.y * CELL_SIZE + CELL_SIZE / 2);
          for (let i = 1; i < visiblePoints; i++) {
            const point = workerRoute.route[i];
            ctx.lineTo(point.x * CELL_SIZE + CELL_SIZE / 2, point.y * CELL_SIZE + CELL_SIZE / 2);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;

          const workerPos = workerRoute.route[visiblePoints - 1];
          ctx.beginPath();
          ctx.fillStyle = workerRoute.color;
          ctx.globalAlpha = 0.25;
          ctx.arc(workerPos.x * CELL_SIZE + CELL_SIZE / 2, workerPos.y * CELL_SIZE + CELL_SIZE / 2, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.fillStyle = workerRoute.color;
          ctx.arc(workerPos.x * CELL_SIZE + CELL_SIZE / 2, workerPos.y * CELL_SIZE + CELL_SIZE / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (activeRoute.route.length > 1) {
        const visiblePoints = Math.floor(activeRoute.route.length * animationProgressRef.current);
        if (visiblePoints > 0) {
          ctx.beginPath();
          ctx.strokeStyle = activeRoute.color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 0.8;
          const firstPoint = activeRoute.route[0];
          ctx.moveTo(firstPoint.x * CELL_SIZE + CELL_SIZE / 2, firstPoint.y * CELL_SIZE + CELL_SIZE / 2);
          for (let i = 1; i < visiblePoints; i++) {
            const point = activeRoute.route[i];
            ctx.lineTo(point.x * CELL_SIZE + CELL_SIZE / 2, point.y * CELL_SIZE + CELL_SIZE / 2);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;

          const workerPos = activeRoute.route[visiblePoints - 1];
          ctx.beginPath();
          ctx.fillStyle = activeRoute.color;
          ctx.globalAlpha = 0.3;
          ctx.arc(workerPos.x * CELL_SIZE + CELL_SIZE / 2, workerPos.y * CELL_SIZE + CELL_SIZE / 2, 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.fillStyle = activeRoute.color;
          ctx.arc(workerPos.x * CELL_SIZE + CELL_SIZE / 2, workerPos.y * CELL_SIZE + CELL_SIZE / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    }

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, warehouse.width * CELL_SIZE, warehouse.height * CELL_SIZE);

    if (hoveredCell) {
      const cell = warehouse.grid[hoveredCell.y][hoveredCell.x];
      if (cell.type === 'shelf') {
        const px = hoveredCell.x * CELL_SIZE;
        const py = hoveredCell.y * CELL_SIZE;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }

    ctx.restore();
  }, [warehouse, activeRoute, activeRouteHeatmap, zVisualizationMode, hoveredCell, logicalW, drawShelf]);

  /**
   * Rasterize at the CURRENT zoom × DPR (1:1 device pixels), redraw, and
   * record the zoom we rasterized at. This is the "best-case" plain-canvas
   * resolution. The MAX_CANVAS_DIMENSION soft cap is preserved.
   */
  const rasterizeNow = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const zoom = reactFlowInstance.getZoom();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    let targetW = Math.max(1, Math.round(logicalW * zoom * dpr));
    let targetH = Math.max(1, Math.round(logicalH * zoom * dpr));

    const longest = Math.max(targetW, targetH);
    if (longest > MAX_CANVAS_DIMENSION) {
      const cap = MAX_CANVAS_DIMENSION / longest;
      targetW = Math.max(1, Math.round(targetW * cap));
      targetH = Math.max(1, Math.round(targetH * cap));
    }

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      canvas.style.width = `${logicalW}px`;
      canvas.style.height = `${logicalH}px`;
    }
    lastRasterizedZoomRef.current = zoom;
    drawCanvas();
  }, [logicalW, logicalH, reactFlowInstance, drawCanvas]);

  // rAF-driven: on store change, schedule one rasterize per frame once the
  // zoom has actually changed from what we last rendered at.
  useEffect(() => {
    const unsubscribe = storeApi.subscribe(() => {
      const zoom = storeApi.getState().transform[2];
      const last = lastRasterizedZoomRef.current;
      if (last === null || Math.abs(zoom - last) > 0.001) {
        if (rasterizeRafRef.current !== null) return; // already scheduled
        rasterizeRafRef.current = requestAnimationFrame(() => {
          rasterizeRafRef.current = null;
          rasterizeNow();
        });
      }
    });
    return () => {
      unsubscribe();
      if (rasterizeRafRef.current !== null) {
        cancelAnimationFrame(rasterizeRafRef.current);
        rasterizeRafRef.current = null;
      }
    };
  }, [storeApi, rasterizeNow]);

  // Draw on mount + drive the route animation loop.
  useEffect(() => {
    rasterizeNow();

    if (activeRoute && animationProgressRef.current < 1) {
      const animate = () => {
        drawCanvas();
        if (animationProgressRef.current < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [rasterizeNow, drawCanvas, activeRoute, animationReplayId]);

  const isHoveringShelf = hoveredCell && warehouse.grid[hoveredCell.y][hoveredCell.x].type === 'shelf';

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/30 overflow-hidden relative border border-border rounded"
    >
      <canvas
        ref={canvasRef}
        width={logicalW}
        height={logicalH}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        className={selectedTool === 'hand' ? 'cursor-grab' : selectedTool === 'select' ? 'cursor-default' : isHoveringShelf ? 'cursor-pointer' : 'cursor-crosshair'}
        style={{
          width: logicalW,
          height: logicalH,
          touchAction: 'none',
        }}
      />

      {/* Hover Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute z-50 pointer-events-none bg-foreground text-background rounded-md px-3 py-2 text-xs shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          <div className="font-semibold mb-1">Shelf ({tooltip.cellX}, {tooltip.cellY})</div>
          <div className="space-y-0.5">
            {tooltip.locations.length === 0 ? (
              <div className="text-background/70 italic">Click to manage items</div>
            ) : (
              tooltip.locations.slice(0, 4).map((loc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: Z_LEVEL_COLORS[loc.z] || '#3b82f6' }} />
                  <span>Z{loc.z}</span>
                  <span className="font-mono">{loc.sku}</span>
                  <span className="text-background/70">×{loc.quantity}</span>
                </div>
              ))
            )}
            {tooltip.locations.length > 4 && (
              <div className="text-background/70 italic">+{tooltip.locations.length - 4} more...</div>
            )}
          </div>
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
        </div>
      )}

      {/* Shelf Details Panel */}
      {shelfDetails && shelfDetails.visible && (
        <div className="absolute top-3 left-3 z-40 bg-background border border-border rounded-lg shadow-lg p-4 min-w-[200px] max-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Shelf ({shelfDetails.cellX}, {shelfDetails.cellY})</h3>
            <button onClick={() => setShelfDetails(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {shelfBins.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items stored</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {shelfBins.map((bin) => (
                <div key={bin.id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/50 text-xs">
                  <div className="font-mono font-medium truncate">{bin.sku}</div>
                  <div className="text-muted-foreground">Z{bin.z} · qty {bin.quantity}</div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            Total bins: {shelfBins.length}
          </div>

          <div className="mt-3">
            <button onClick={addItemToShelf} className="w-full px-2.5 py-2 text-xs font-medium border border-border rounded-md hover:bg-muted/60 transition-colors">
              + Add Item
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded border border-border">
        <span>Hover for tooltip, click for details</span>
      </div>
    </div>
  );
}

export const WarehouseCanvasExperiment = memo(WarehouseCanvasExperimentInner);
