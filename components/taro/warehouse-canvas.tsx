'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode, StorageLocation, Item } from '@/lib/taro/types';
import { CELL_SIZE, GRID_COLOR, SHELF_COLOR, WORKER_COLOR, EMPTY_COLOR, Z_LEVEL_COLORS } from '@/lib/taro/constants';
import { buildCoordinateLocations, getShelfLocationId } from '@/lib/taro/layout';
import { getItemsByLocation } from '@/lib/taro/items';
import { getNextSku } from '@/lib/taro/demo-generator';

interface WarehouseCanvasProps {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgress: number;
  zVisualizationMode: ZVisualizationMode;
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

export function WarehouseCanvas({
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  animationProgress,
  zVisualizationMode,
}: WarehouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);

  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<{ x: number; y: number } | null>(null);
  
  // Tooltip state for hover
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    cellX: 0,
    cellY: 0,
    locations: [],
  });
  
  // Shelf details panel state for click
  const [shelfDetails, setShelfDetails] = useState<ShelfDetailsState | null>(null);

  const getCellFromMouse = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;

    const cellX = Math.floor(x / CELL_SIZE);
    const cellY = Math.floor(y / CELL_SIZE);

    if (cellX >= 0 && cellX < warehouse.width && cellY >= 0 && cellY < warehouse.height) {
      return { x: cellX, y: cellY };
    }
    return null;
  }, [panOffset, zoom, warehouse.width, warehouse.height]);

  const applyTool = useCallback((cellX: number, cellY: number) => {
    const newWarehouse = { ...warehouse };
    newWarehouse.grid = warehouse.grid.map(row => row.map(cell => ({ ...cell, locations: [...cell.locations] })));
    newWarehouse.shelves = [...warehouse.shelves];

    const cell = newWarehouse.grid[cellY][cellX];

    switch (selectedTool) {
      case 'shelf':
        if (cell.type === 'empty') {
          cell.type = 'shelf';
          cell.locations = [];
          newWarehouse.shelves.push({ x: cellX, y: cellY });
        }
        break;
      case 'worker':
        // Remove old worker-start cell first
        if (newWarehouse.workerStart) {
          const old = newWarehouse.grid[newWarehouse.workerStart.y][newWarehouse.workerStart.x];
          if (old.type === 'worker-start') {
            old.type = 'empty';
            old.locations = [];
          }
        }
        if (cell.type === 'empty') {
          cell.type = 'worker-start';
          cell.locations = [];
          newWarehouse.workerStart = { x: cellX, y: cellY };
        }
        break;
      case 'erase':
        if (cell.type === 'shelf') {
          // Remove from shelves array
          newWarehouse.shelves = newWarehouse.shelves.filter(s => !(s.x === cellX && s.y === cellY));
          
          // Cleanup items associated with this shelf
          const locationId = getShelfLocationId(cellX, cellY);
          newWarehouse.items = newWarehouse.items.filter(item => item.locationId !== locationId);
        }
        if (cell.type === 'worker-start') {
          newWarehouse.workerStart = null;
        }
        cell.type = 'empty';
        cell.locations = [];
        break;
    }

    newWarehouse.locations = buildCoordinateLocations(newWarehouse);
    onWarehouseChange(newWarehouse);
  }, [warehouse, selectedTool, onWarehouseChange]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }

    if (e.button === 0) {
      setIsDrawing(true);
      const cell = getCellFromMouse(e);
      if (cell) {
        applyTool(cell.x, cell.y);
      }
    }
  }, [getCellFromMouse, applyTool]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      // Hide tooltip while panning
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    if (isDrawing) {
      const cell = getCellFromMouse(e);
      if (cell) {
        applyTool(cell.x, cell.y);
      }
      setTooltip(prev => ({ ...prev, visible: false }));
      return;
    }

    // Handle hover for tooltip
    const cell = getCellFromMouse(e);
    setHoveredCell(cell);
    if (cell) {
      const cellData = warehouse.grid[cell.y][cell.x];
      if (cellData.type === 'shelf') {
        // Filter locations based on z-visualization mode
        let filteredLocations = cellData.locations;
        if (zVisualizationMode !== 'all') {
          const selectedLevel = parseInt(zVisualizationMode.replace('level', ''), 10);
          filteredLocations = cellData.locations.filter(loc => loc.z === selectedLevel);
        }
        
        setTooltip({
          visible: true,
          x: e.clientX,
          y: e.clientY - 10,
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
  }, [isPanning, isDrawing, lastPanPoint, getCellFromMouse, applyTool, warehouse.grid, zVisualizationMode]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDrawing(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsPanning(false);
    setIsDrawing(false);
    setHoveredCell(null);
    setTooltip(prev => ({ ...prev, visible: false }));
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 3));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
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
  }, [getCellFromMouse, warehouse]);

  const addItemToShelf = useCallback(() => {
    if (!shelfDetails) return;

    const nextWarehouse = {
      ...warehouse,
      items: [...warehouse.items],
      grid: warehouse.grid.map(row => row.map(cell => ({ ...cell, locations: [...cell.locations] }))),
    };

    const locationId = getShelfLocationId(shelfDetails.cellX, shelfDetails.cellY);
    const cell = nextWarehouse.grid[shelfDetails.cellY][shelfDetails.cellX];
    
    // Determine next z-level (cap at 4 as per suggestions)
    const nextZ = Math.min(cell.locations.length + 1, 4);
    if (cell.locations.length >= 4) {
      // Already at max levels for this demo
      return;
    }

    const sku = getNextSku(warehouse);
    
    // 1. Add to items list
    const newItem: Item = {
      id: `ITEM_${sku.replace('SKU_', '')}`,
      locationId,
    };
    nextWarehouse.items.push(newItem);

    // 2. Add to cell locations
    const newLocation: StorageLocation = {
      id: `${sku}@${shelfDetails.cellX},${shelfDetails.cellY},${nextZ}`,
      locationId,
      x: shelfDetails.cellX,
      y: shelfDetails.cellY,
      z: nextZ,
      sku,
      quantity: 50, // Default quantity
    };
    cell.locations.push(newLocation);
    nextWarehouse.locations = buildCoordinateLocations(nextWarehouse);

    onWarehouseChange(nextWarehouse);
  }, [onWarehouseChange, shelfDetails, warehouse]);

  const selectedShelfLocationId = shelfDetails
    ? getShelfLocationId(shelfDetails.cellX, shelfDetails.cellY)
    : null;
  const shelfItems = selectedShelfLocationId
    ? getItemsByLocation(warehouse, selectedShelfLocationId)
    : [];

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
        if (pos.y >= 0 && pos.y < warehouse.height && pos.x >= 0 && pos.x < warehouse.width) {
          heatmap[pos.y][pos.x]++;
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
      setShelfDetails(prev => prev
        ? {
            ...prev,
            locations: latestCell.locations,
          }
        : prev
      );
    }
  }, [warehouse, shelfDetails?.cellX, shelfDetails?.cellY, shelfDetails?.locations, shelfDetails]);

  // Draw the canvas - memoized draw function to avoid recreation
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = warehouse.width * CELL_SIZE;
    const height = warehouse.height * CELL_SIZE;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    // Draw cells
    for (let y = 0; y < warehouse.height; y++) {
      for (let x = 0; x < warehouse.width; x++) {
        const cell = warehouse.grid[y][x];
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        // Base color
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

        // Draw shelf with visual dominance - darker border
        if (cell.type === 'shelf') {
          ctx.strokeStyle = '#E7E8EC'; // Darker gray border
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 0.5, py + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
        }

        // Draw grid lines (lighter for shelves to not compete)
        if (cell.type !== 'shelf') {
          ctx.strokeStyle = GRID_COLOR;
          ctx.lineWidth = 0.5;
          ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);
        }

        // Draw shelf location markers and labels
        if (cell.type === 'shelf' && cell.locations.length > 0) {
          if (zVisualizationMode === 'all') {
            // Show count badge and mini dots for all levels
            const totalCount = cell.locations.length;
            const levelCounts = new Map<number, number>();
            cell.locations.forEach(loc => {
              levelCounts.set(loc.z, (levelCounts.get(loc.z) || 0) + 1);
            });

            // Draw small colored dots for each level present
            const uniqueLevels = Array.from(levelCounts.keys()).sort();
            const dotSize = 3;
            const dotSpacing = 8;
            const startX = px + 4;
            const startY = py + 4;

            uniqueLevels.slice(0, 4).forEach((level, index) => {
              const color = Z_LEVEL_COLORS[level] || '#3b82f6';
              ctx.beginPath();
              ctx.fillStyle = color;
              ctx.arc(startX + index * dotSpacing, startY, dotSize, 0, Math.PI * 2);
              ctx.fill();
            });

            // Draw count badge if more items
            if (totalCount > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 8px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(totalCount.toString(), px + CELL_SIZE / 2, py + CELL_SIZE - 6);
            }
          } else {
            // Specific level mode - show SKU labels
            const selectedLevel = parseInt(zVisualizationMode.replace('level', ''), 10);
            const levelLocations = cell.locations.filter(loc => loc.z === selectedLevel);

            if (levelLocations.length > 0) {
              const markerColor = Z_LEVEL_COLORS[selectedLevel] || '#3b82f6';
              
              // Draw colored indicator bar at top
              ctx.fillStyle = markerColor;
              ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, 3);

              // Show SKU for single item, count for multiple
              if (levelLocations.length === 1) {
                const loc = levelLocations[0];
                const shortSku = loc.sku.length > 5 ? loc.sku.slice(0, 4) + '…' : loc.sku;
                ctx.fillStyle = '#ffffff';
                ctx.font = '7px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(shortSku, px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 2);
              } else {
                // Show count for multiple items at same level
                ctx.fillStyle = markerColor;
                ctx.font = 'bold 9px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${levelLocations.length}`, px + CELL_SIZE / 2, py + CELL_SIZE / 2 + 2);
              }
            }
          }
        }

        // Draw worker icon
        if (cell.type === 'worker-start') {
          ctx.fillStyle = '#ffffff';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S', px + CELL_SIZE / 2, py + CELL_SIZE / 2);
        }
      }
    }

    // Draw route animation — all workers animate in parallel
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

    // Draw route animation — all workers animate in parallel
    if (activeRoute) {
      if (activeRoute.workerRoutes && activeRoute.workerRoutes.length > 0) {
        for (const workerRoute of activeRoute.workerRoutes) {
          if (workerRoute.route.length === 0) continue;

          // All workers use the same animationProgress — true parallel execution
          const visiblePoints = Math.max(1, Math.floor(workerRoute.route.length * animationProgress));

          // Draw path
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

          // Animated worker dot
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
        // Fallback: single route
        const visiblePoints = Math.floor(activeRoute.route.length * animationProgress);
        if (visiblePoints > 0) {
          ctx.beginPath();
          ctx.strokeStyle = activeRoute.color;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = 0.8;
          const firstPoint = activeRoute.route[0];
          ctx.moveTo(
            firstPoint.x * CELL_SIZE + CELL_SIZE / 2,
            firstPoint.y * CELL_SIZE + CELL_SIZE / 2
          );
          for (let i = 1; i < visiblePoints; i++) {
            const point = activeRoute.route[i];
            ctx.lineTo(
              point.x * CELL_SIZE + CELL_SIZE / 2,
              point.y * CELL_SIZE + CELL_SIZE / 2
            );
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

    // Draw border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    // Draw hover highlight
    if (hoveredCell) {
      const cell = warehouse.grid[hoveredCell.y][hoveredCell.x];
      if (cell.type === 'shelf') {
        const px = hoveredCell.x * CELL_SIZE;
        const py = hoveredCell.y * CELL_SIZE;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // Blue tint
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.strokeStyle = '#3b82f6'; // Bright blue border
        ctx.lineWidth = 2;
        ctx.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      }
    }

    ctx.restore();
  }, [warehouse, panOffset, zoom, activeRoute, activeRouteHeatmap, animationProgress, zVisualizationMode, hoveredCell]);

  // Use RAF for smooth animation, avoid 60fps React re-renders
  useEffect(() => {
    drawCanvas();

    if (activeRoute && animationProgress < 1) {
      const animate = () => {
        drawCanvas();
        animationRef.current = requestAnimationFrame(animate);
      };
      animationRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [drawCanvas, activeRoute, animationProgress]);

  const isHoveringShelf = hoveredCell && warehouse.grid[hoveredCell.y][hoveredCell.x].type === 'shelf';

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-muted/30 overflow-hidden relative border border-border rounded"
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onClick={handleClick}
        className={isHoveringShelf ? 'cursor-pointer' : 'cursor-crosshair'}
        style={{ touchAction: 'none' }}
      />
      
      {/* Hover Tooltip */}
      {tooltip.visible && (
        <div
          className="fixed z-50 pointer-events-none bg-foreground text-background rounded-md px-3 py-2 text-xs shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-semibold mb-1">Shelf ({tooltip.cellX}, {tooltip.cellY})</div>
          <div className="space-y-0.5">
            {tooltip.locations.length === 0 ? (
              <div className="text-background/70 italic">Click to manage items</div>
            ) : (
              tooltip.locations.slice(0, 4).map((loc, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: Z_LEVEL_COLORS[loc.z] || '#3b82f6' }}
                  />
                  <span>Z{loc.z}</span>
                  <span className="font-mono">{loc.sku}</span>
                  <span className="text-background/70">×{loc.quantity}</span>
                </div>
              ))
            )}
            {tooltip.locations.length > 4 && (
              <div className="text-background/70 italic">
                +{tooltip.locations.length - 4} more...
              </div>
            )}
          </div>
          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 w-2 h-2 bg-foreground rotate-45" />
        </div>
      )}

      {/* Shelf Details Panel */}
      {shelfDetails && shelfDetails.visible && (
        <div className="absolute top-3 left-3 z-40 bg-background border border-border rounded-lg shadow-lg p-4 min-w-[200px] max-w-[280px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">
              Shelf ({shelfDetails.cellX}, {shelfDetails.cellY})
            </h3>
            <button
              onClick={() => setShelfDetails(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {shelfItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items stored</p>
          ) : (
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {shelfItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs"
                >
                  <div className="font-mono font-medium truncate">{item.id}</div>
                </div>
              ))}
            </div>
          )}
          
          <div className="mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
            Total items: {shelfItems.length}
          </div>

          <div className="mt-3">
            <button
              onClick={addItemToShelf}
              className="w-full px-2.5 py-2 text-xs font-medium border border-border rounded-md hover:bg-muted/60 transition-colors"
            >
              + Add Item
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded border border-border">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="text-border">|</span>
        <span>Alt+drag to pan</span>
        <span className="text-border">|</span>
        <span>Hover for tooltip, click for details</span>
      </div>
    </div>
  );
}
