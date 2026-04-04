'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode, VisualizationMode } from '@/lib/taro/types';

interface WarehouseCanvasProps {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  heatmap: number[][] | null;
  visualizationMode: VisualizationMode;
  animationProgress: number;
  zVisualizationMode: ZVisualizationMode;
}

const CELL_SIZE = 20;
const GRID_COLOR = '#e5e7eb';
const SHELF_COLOR = '#374151';
const WORKER_COLOR = '#22c55e';
const EMPTY_COLOR = '#ffffff';

// Colors for different z-levels
const Z_LEVEL_COLORS: Record<number, string> = {
  1: '#3b82f6', // blue
  2: '#8b5cf6', // purple
  3: '#f59e0b', // amber
  4: '#ef4444', // red
};

export function WarehouseCanvas({
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  heatmap,
  visualizationMode,
  animationProgress,
  zVisualizationMode,
}: WarehouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hoveredPickPoint, setHoveredPickPoint] = useState<{ x: number, y: number, z: number, sku: string, id: number } | null>(null);

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
    newWarehouse.items = [...warehouse.items];
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
          // Remove associated items
          newWarehouse.items = newWarehouse.items.filter(i => !(i.x === cellX && i.y === cellY));
        }
        if (cell.type === 'worker-start') {
          newWarehouse.workerStart = null;
        }
        cell.type = 'empty';
        cell.locations = [];
        break;
    }

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
      return;
    }

    if (isDrawing) {
      const cell = getCellFromMouse(e);
      if (cell) {
        applyTool(cell.x, cell.y);
      }
    }

    if (visualizationMode === 'debug-picks') {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left - panOffset.x) / zoom;
        const mouseY = (e.clientY - rect.top - panOffset.y) / zoom;
        
        const found = warehouse.items.find(item => {
          const px = item.x * CELL_SIZE + CELL_SIZE / 2;
          const py = item.y * CELL_SIZE + CELL_SIZE / 2;
          const dist = Math.sqrt((mouseX - px)**2 + (mouseY - py)**2);
          return dist < 6; // Radius for pick point
        });
        
        setHoveredPickPoint(found || null);
      }
    } else if (hoveredPickPoint) {
      setHoveredPickPoint(null);
    }
  }, [isPanning, isDrawing, lastPanPoint, getCellFromMouse, applyTool, visualizationMode, panOffset, zoom, warehouse.items, hoveredPickPoint]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDrawing(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 3));
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Log location info when clicking on a cell (not during drawing)
    const cell = getCellFromMouse(e);
    if (cell) {
      const warehouseCell = warehouse.grid[cell.y][cell.x];
      if (warehouseCell.type === 'shelf' && warehouseCell.locations.length > 0) {
        console.log(`Cell (${cell.x}, ${cell.y}) - ${warehouseCell.locations.length} location(s):`);
        console.table(warehouseCell.locations.map(loc => ({
          z: loc.z,
          sku: loc.sku,
          quantity: loc.quantity,
          itemId: loc.itemId ?? 'N/A'
        })));
      }
    }
  }, [getCellFromMouse, warehouse.grid]);

  // Draw the canvas
  useEffect(() => {
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

    // Calculate max heatmap value for normalization
    let maxHeat = 1;
    if (heatmap && visualizationMode === 'heatmap') {
      for (const row of heatmap) {
        for (const val of row) {
          maxHeat = Math.max(maxHeat, val);
        }
      }
    }

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

        // Apply faint opacity for shelves in debug mode
        if (visualizationMode === 'debug-picks' && cell.type === 'shelf') {
          ctx.globalAlpha = 0.3;
        }

        // Apply heatmap overlay if enabled
        if (visualizationMode === 'heatmap' && heatmap && cell.type === 'empty') {
          const heat = heatmap[y][x];
          if (heat > 0) {
            const intensity = Math.min(heat / maxHeat, 1);
            // Red (high traffic) to yellow (medium) to blue (low traffic)
            let r, g, b;
            if (intensity > 0.5) {
              // Red to yellow
              const t = (intensity - 0.5) * 2;
              r = 255;
              g = Math.round(150 * t);
              b = 0;
            } else {
              // Blue to yellow
              const t = intensity * 2;
              r = Math.round(100 * t);
              g = Math.round(100 * t);
              b = Math.round(255 * (1 - t));
            }
            fillColor = `rgb(${r}, ${g}, ${b})`;
          }
        }

        ctx.fillStyle = fillColor;
        ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
        ctx.globalAlpha = 1.0;

        // Draw grid lines
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

        // Draw shelf locations based on view mode
        if (cell.type === 'shelf') {
          if (visualizationMode === 'collapsed') {
            // Collapsed mode: show only z:N badge
            if (cell.locations.length > 0) {
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 9px monospace';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillText(`z:${cell.locations.length}`, px + CELL_SIZE / 2, py + CELL_SIZE / 2);
            }
          } else if (visualizationMode === 'z-level') {
            // Level mode: highlight locations at selected z-level with markers (dots)
            if (zVisualizationMode !== 'collapsed') {
              const levelNum = parseInt(zVisualizationMode.replace('level', ''), 10);
              const locationAtLevel = cell.locations.find(loc => loc.z === levelNum);
              
              if (locationAtLevel) {
                // Highlight with a dot as requested
                ctx.beginPath();
                ctx.fillStyle = Z_LEVEL_COLORS[levelNum] || '#3b82f6';
                ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            } else {
              // If zVisualizationMode is 'collapsed' but viewMode is 'z-level', 
              // show the same as 'collapsed' view mode or nothing? 
              // The ticket says "Full shelf layout + highlight markers (dots) for locations at selected z (works with existing zVisualizationMode prop)"
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

    // Draw debug-picks mode points
    if (visualizationMode === 'debug-picks') {
      warehouse.items.forEach(item => {
        const px = item.x * CELL_SIZE + CELL_SIZE / 2;
        const py = item.y * CELL_SIZE + CELL_SIZE / 2;
        
        ctx.beginPath();
        ctx.fillStyle = Z_LEVEL_COLORS[item.z] || '#9ca3af';
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        if (hoveredPickPoint && hoveredPickPoint.id === item.id) {
          ctx.beginPath();
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 2;
          ctx.arc(px, py, 6, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // Tooltip for debug-picks
      if (hoveredPickPoint) {
        const tooltipX = hoveredPickPoint.x * CELL_SIZE + CELL_SIZE;
        const tooltipY = hoveredPickPoint.y * CELL_SIZE;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(tooltipX, tooltipY, 100, 60);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`SKU: ${hoveredPickPoint.sku}`, tooltipX + 5, tooltipY + 5);
        ctx.fillText(`Pos: ${hoveredPickPoint.x}, ${hoveredPickPoint.y}`, tooltipX + 5, tooltipY + 20);
        ctx.fillText(`Level: ${hoveredPickPoint.z}`, tooltipX + 5, tooltipY + 35);
        
        // Check if there is location info for qty
        const cell = warehouse.grid[hoveredPickPoint.y][hoveredPickPoint.x];
        const loc = cell.locations.find(l => l.z === hoveredPickPoint.z && l.sku === hoveredPickPoint.sku);
        if (loc) {
          ctx.fillText(`Qty: ${loc.quantity}`, tooltipX + 5, tooltipY + 50);
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

    ctx.restore();
  }, [warehouse, panOffset, zoom, activeRoute, animationProgress, heatmap, visualizationMode, zVisualizationMode, hoveredPickPoint]);

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
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        className="cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded border border-border">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="text-border">|</span>
        <span>Alt+drag to pan</span>
        <span className="text-border">|</span>
        <span>Click shelf to see locations</span>
      </div>
    </div>
  );
}
