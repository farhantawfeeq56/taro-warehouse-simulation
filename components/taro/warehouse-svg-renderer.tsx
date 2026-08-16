'use client';

/**
 * Variant C — SVG renderer experiment.
 *
 * Renders the warehouse as pure vector SVG inside the React Flow node. The
 * SVG is positioned at the logical size (width×CELL_SIZE × height×CELL_SIZE)
 * and React Flow's CSS transform scales it — SVG scales crisply at any zoom
 * because the browser re-vectors it rather than resampling a bitmap.
 *
 * Data parity with A/B: same `warehouse`, same `activeRoute`, same
 * `animationProgressRef`, same coordinates. Interaction parity: hover
 * highlight + tooltip + click details are implemented with the same
 * cell-from-mouse math; drawing tools mutate the same warehouse via
 * `onWarehouseChange`.
 *
 * This is intentionally NOT pixel-perfect with the canvas — it's the
 * "does vector fundamentally solve sharpness?" experiment.
 */

import { useRef, useEffect, useState, useCallback, useMemo, memo, type MutableRefObject } from 'react';
import { useReactFlow } from '@xyflow/react';
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

interface WarehouseSvgRendererProps {
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

function WarehouseSvgRendererInner({
  warehouseId,
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgressRef,
  zVisualizationMode,
  animationReplayId,
}: WarehouseSvgRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const animationRef = useRef<number | null>(null);
  const reactFlowInstance = useReactFlow();

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
      if (containerRef.current) rectRef.current = containerRef.current.getBoundingClientRect();
    };
    updateRect();
    window.addEventListener('resize', updateRect);
    return () => window.removeEventListener('resize', updateRect);
  }, []);

  const getCellFromMouse = useCallback((e: React.MouseEvent) => {
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
      if (newGrid[y] === warehouse.grid[y]) newGrid[y] = [...newGrid[y]];
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
          if (erased.type === 'shelf') newShelves = newShelves.filter(s => !(s.x === cellX && s.y === cellY));
          if (erased.type === 'worker-start') newWorkerStart = null;
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (selectedTool === 'hand' || selectedTool === 'select') return;
    if (e.button === 0) {
      const cell = getCellFromMouse(e);
      if (cell) applyTool(cell.x, cell.y);
    }
  }, [selectedTool, getCellFromMouse, applyTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (selectedTool === 'hand' || selectedTool === 'select') return;
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
        setTooltip({ visible: true, x: tipX, y: tipY, cellX: cell.x, cellY: cell.y, locations: filteredLocations });
      } else {
        setTooltip(prev => ({ ...prev, visible: false }));
      }
    } else {
      setTooltip(prev => ({ ...prev, visible: false }));
    }
  }, [selectedTool, getCellFromMouse, warehouse.grid, zVisualizationMode]);

  const handleMouseLeave = useCallback(() => {
    setHoveredCell(null);
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    if (selectedTool === 'hand') return;
    const cellPosition = getCellFromMouse(e);
    if (!cellPosition) return;
    const cell = warehouse.grid[cellPosition.y][cellPosition.x];
    if (cell.type !== 'shelf') {
      setShelfDetails(null);
      return;
    }
    setShelfDetails({ visible: true, cellX: cellPosition.x, cellY: cellPosition.y, locations: cell.locations });
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

  // Animation: while a route is active, tick progress and force a re-render
  // of the SVG (React re-renders the path/dots). Same progress source as A/B.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (activeRoute && animationProgressRef.current < 1) {
      const animate = () => {
        setTick(t => t + 1);
        if (animationProgressRef.current < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [activeRoute, animationReplayId, animationProgressRef]);

  // ── SVG content (pure vector) ────────────────────────────────────────

  // Grid cells
  const gridCells = useMemo(() => {
    const cells: React.ReactNode[] = [];
    for (let y = 0; y < warehouse.height; y++) {
      for (let x = 0; x < warehouse.width; x++) {
        const cell = warehouse.grid[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;
        let fill = EMPTY_COLOR;
        if (cell.type === 'shelf') fill = SHELF_COLOR;
        if (cell.type === 'worker-start') fill = WORKER_COLOR;
        cells.push(
          <rect key={`c-${x}-${y}`} x={px} y={py} width={CELL_SIZE} height={CELL_SIZE} fill={fill} stroke={cell.type === 'shelf' ? '#E7E8EC' : GRID_COLOR} strokeWidth={cell.type === 'shelf' ? 1 : 0.5} />,
        );
      }
    }
    return cells;
  }, [warehouse]);

  // Paper bays (dark rounded rect + up to 4 colored circles per stocked bin)
  const shelfBays = useMemo(() => {
    const bays: React.ReactNode[] = [];
    for (const shelf of warehouse.shelves) {
      const px = shelf.x * CELL_SIZE;
      const py = shelf.y * CELL_SIZE;
      const S = CELL_SIZE;
      const pad = 2;
      const x = px + pad;
      const y = py + pad;
      const w = S - pad * 2;
      const h = S - pad * 2;

      const cell = warehouse.grid[shelf.y][shelf.x];
      const slots: (string | null)[] = [null, null, null, null];
      cell.locations.slice(0, 4).forEach((loc, i) => {
        slots[i] = PAPER_TILES[i % PAPER_TILES.length] ?? '#3b82f6';
      });

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

      bays.push(
        <g key={`bay-${shelf.x}-${shelf.y}`}>
          <rect x={x} y={y} width={w} height={h} rx={2} fill={PAPER.dark} />
          {positions.map(([cxp, cyp], i) => {
            const color = slots[i];
            return color ? <circle key={`s-${i}`} cx={cxp} cy={cyp} r={r} fill={color} /> : null;
          })}
        </g>,
      );
    }
    return bays;
  }, [warehouse]);

  // Route heatmap
  const heatmapRects = useMemo(() => {
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
        if (ry >= 0 && ry < warehouse.height && rx >= 0 && rx < warehouse.width) heatmap[ry][rx]++;
      }
    }
    const maxHeat = Math.max(0, ...heatmap.flat());
    if (maxHeat <= 0) return null;
    const rects: React.ReactNode[] = [];
    for (let y = 0; y < warehouse.height; y++) {
      for (let x = 0; x < warehouse.width; x++) {
        const heat = heatmap[y][x];
        if (heat <= 0) continue;
        const intensity = heat / maxHeat;
        const alpha = 0.12 + intensity * 0.43;
        rects.push(
          <rect key={`h-${x}-${y}`} x={x * CELL_SIZE + 1} y={y * CELL_SIZE + 1} width={CELL_SIZE - 2} height={CELL_SIZE - 2} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />,
        );
      }
    }
    return rects;
  }, [activeRoute, warehouse]);

  // Worker route polylines + animated dots
  const routePaths = useMemo(() => {
    if (!activeRoute) return null;
    const groups = activeRoute.workerRoutes && activeRoute.workerRoutes.length > 0
      ? activeRoute.workerRoutes.map(wr => ({ color: wr.color, route: wr.route }))
      : [{ color: activeRoute.color, route: activeRoute.route }];

    const paths: React.ReactNode[] = [];
    for (let gi = 0; gi < groups.length; gi++) {
      const { color, route } = groups[gi];
      if (route.length === 0) continue;
      const visiblePoints = Math.max(1, Math.floor(route.length * animationProgressRef.current));
      const pts = route.slice(0, visiblePoints)
        .map(p => `${(p.x * CELL_SIZE + CELL_SIZE / 2).toFixed(1)},${(p.y * CELL_SIZE + CELL_SIZE / 2).toFixed(1)}`)
        .join(' ');
      paths.push(
        <g key={`r-${gi}`}>
          <polyline points={pts} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" opacity={0.8} />
          {visiblePoints > 0 && (() => {
            const wp = route[visiblePoints - 1];
            const cx = wp.x * CELL_SIZE + CELL_SIZE / 2;
            const cy = wp.y * CELL_SIZE + CELL_SIZE / 2;
            return (
              <g>
                <circle cx={cx} cy={cy} r={8} fill={color} opacity={0.25} />
                <circle cx={cx} cy={cy} r={5} fill={color} stroke="#ffffff" strokeWidth={2} />
              </g>
            );
          })()}
        </g>,
      );
    }
    return paths;
  }, [activeRoute, animationProgressRef]);

  // Worker start label
  const workerStart = warehouse.workerStart;

  const hovered = hoveredCell ? warehouse.grid[hoveredCell.y]?.[hoveredCell.x] : null;
  const isHoveringShelf = !!hovered && hovered.type === 'shelf';

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/30 overflow-hidden relative border border-border rounded"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ cursor: selectedTool === 'hand' ? 'grab' : selectedTool === 'select' ? 'default' : isHoveringShelf ? 'pointer' : 'crosshair', touchAction: 'none' }}
    >
      <svg
        width={logicalW}
        height={logicalH}
        viewBox={`0 0 ${logicalW} ${logicalH}`}
        className="block"
        style={{ width: logicalW, height: logicalH, touchAction: 'none' }}
      >
        {/* Grid + base cells */}
        {gridCells}

        {/* Paper bays */}
        {shelfBays}

        {/* Route heatmap */}
        {heatmapRects}

        {/* Route paths + worker dots */}
        {routePaths}

        {/* Hover highlight */}
        {hoveredCell && hovered?.type === 'shelf' && (
          <g>
            <rect
              x={hoveredCell.x * CELL_SIZE}
              y={hoveredCell.y * CELL_SIZE}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill="rgba(59, 130, 246, 0.2)"
            />
            <rect
              x={hoveredCell.x * CELL_SIZE + 1}
              y={hoveredCell.y * CELL_SIZE + 1}
              width={CELL_SIZE - 2}
              height={CELL_SIZE - 2}
              fill="none"
              stroke="#3b82f6"
              strokeWidth={2}
            />
          </g>
        )}

        {/* Worker start label */}
        {workerStart && (
          <text
            x={workerStart.x * CELL_SIZE + CELL_SIZE / 2}
            y={workerStart.y * CELL_SIZE + CELL_SIZE / 2}
            fill="#ffffff"
            fontSize={12}
            textAnchor="middle"
            dominantBaseline="central"
            fontFamily="sans-serif"
          >
            S
          </text>
        )}

        {/* Border */}
        <rect x={0.5} y={0.5} width={logicalW - 1} height={logicalH - 1} fill="none" stroke="#d1d5db" strokeWidth={2} />
      </svg>

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
        <span>SVG renderer · hover for tooltip, click for details</span>
      </div>
    </div>
  );
}

export const WarehouseSvgRenderer = memo(WarehouseSvgRendererInner);
