'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Warehouse, ToolType, StrategyResult } from '@/lib/taro/types';
import { getNextItemId } from '@/lib/taro/demo-generator';

interface WarehouseCanvasProps {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  heatmap: number[][] | null;
  showHeatmap: boolean;
  animationProgress: number;
}

const CELL_SIZE = 20;
const GRID_COLOR = '#e5e7eb';
const SHELF_COLOR = '#374151';
const ITEM_COLOR = '#3b82f6';
const WORKER_COLOR = '#22c55e';
const EMPTY_COLOR = '#ffffff';

export function WarehouseCanvas({
  warehouse,
  onWarehouseChange,
  selectedTool,
  activeRoute,
  heatmap,
  showHeatmap,
  animationProgress,
}: WarehouseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);

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
    newWarehouse.grid = warehouse.grid.map(row => row.map(cell => ({ ...cell })));
    newWarehouse.items = [...warehouse.items];

    const cell = newWarehouse.grid[cellY][cellX];

    switch (selectedTool) {
      case 'shelf':
        if (cell.type === 'empty') {
          cell.type = 'shelf';
        }
        break;
      case 'item':
        if (cell.type === 'empty' || cell.type === 'item') {
          const existingItem = newWarehouse.items.find(i => i.x === cellX && i.y === cellY);
          if (!existingItem) {
            const newId = getNextItemId(newWarehouse);
            cell.type = 'item';
            cell.itemId = newId;
            newWarehouse.items.push({ id: newId, x: cellX, y: cellY });
          }
        }
        break;
      case 'erase':
        if (cell.type === 'item') {
          newWarehouse.items = newWarehouse.items.filter(i => !(i.x === cellX && i.y === cellY));
        }
        if (cell.type === 'worker-start') {
          newWarehouse.workerStart = null;
        }
        cell.type = 'empty';
        cell.itemId = undefined;
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
  }, [isPanning, isDrawing, lastPanPoint, getCellFromMouse, applyTool]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
    setIsDrawing(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 3));
  }, []);

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
    if (heatmap && showHeatmap) {
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
          case 'item':
            fillColor = ITEM_COLOR;
            break;
          case 'worker-start':
            fillColor = WORKER_COLOR;
            break;
        }

        // Apply heatmap overlay if enabled
        if (showHeatmap && heatmap && cell.type === 'empty') {
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

        // Draw grid lines
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

        // Draw item ID
        if (cell.type === 'item' && cell.itemId !== undefined) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(cell.itemId), px + CELL_SIZE / 2, py + CELL_SIZE / 2);
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

    // Draw route animation - support for multiple worker routes
    if (activeRoute) {
      // If worker routes exist (multi-worker), draw them
      if (activeRoute.workerRoutes && activeRoute.workerRoutes.length > 0) {
        for (const workerRoute of activeRoute.workerRoutes) {
          if (workerRoute.route.length > 0) {
            const routeLength = workerRoute.route.length;
            const visiblePoints = Math.floor(routeLength * animationProgress);

            if (visiblePoints > 0) {
              // Draw path
              ctx.beginPath();
              ctx.strokeStyle = workerRoute.color;
              ctx.lineWidth = 3;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.globalAlpha = 0.8;

              const firstPoint = workerRoute.route[0];
              ctx.moveTo(
                firstPoint.x * CELL_SIZE + CELL_SIZE / 2,
                firstPoint.y * CELL_SIZE + CELL_SIZE / 2
              );

              for (let i = 1; i < Math.min(visiblePoints, workerRoute.route.length); i++) {
                const point = workerRoute.route[i];
                ctx.lineTo(
                  point.x * CELL_SIZE + CELL_SIZE / 2,
                  point.y * CELL_SIZE + CELL_SIZE / 2
                );
              }
              ctx.stroke();
              ctx.globalAlpha = 1;

              // Draw worker dot
              if (visiblePoints > 0) {
                const workerPos = workerRoute.route[Math.min(visiblePoints - 1, workerRoute.route.length - 1)];
                
                // Shadow
                ctx.beginPath();
                ctx.fillStyle = workerRoute.color;
                ctx.globalAlpha = 0.3;
                ctx.arc(
                  workerPos.x * CELL_SIZE + CELL_SIZE / 2,
                  workerPos.y * CELL_SIZE + CELL_SIZE / 2,
                  8,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
                
                // Main dot
                ctx.globalAlpha = 1;
                ctx.beginPath();
                ctx.fillStyle = workerRoute.color;
                ctx.arc(
                  workerPos.x * CELL_SIZE + CELL_SIZE / 2,
                  workerPos.y * CELL_SIZE + CELL_SIZE / 2,
                  5,
                  0,
                  Math.PI * 2
                );
                ctx.fill();
                
                // Outline
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.stroke();
              }
            }
          }
        }
      } else if (activeRoute.route.length > 1) {
        // Fallback: single route (backward compatibility)
        const routeLength = activeRoute.route.length;
        const visiblePoints = Math.floor(routeLength * animationProgress);

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

          for (let i = 1; i < Math.min(visiblePoints, activeRoute.route.length); i++) {
            const point = activeRoute.route[i];
            ctx.lineTo(
              point.x * CELL_SIZE + CELL_SIZE / 2,
              point.y * CELL_SIZE + CELL_SIZE / 2
            );
          }
          ctx.stroke();
          ctx.globalAlpha = 1;

          if (visiblePoints > 0) {
            const workerPos = activeRoute.route[Math.min(visiblePoints - 1, activeRoute.route.length - 1)];
            
            ctx.beginPath();
            ctx.fillStyle = activeRoute.color;
            ctx.globalAlpha = 0.3;
            ctx.arc(
              workerPos.x * CELL_SIZE + CELL_SIZE / 2,
              workerPos.y * CELL_SIZE + CELL_SIZE / 2,
              8,
              0,
              Math.PI * 2
            );
            ctx.fill();
            
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.fillStyle = activeRoute.color;
            ctx.arc(
              workerPos.x * CELL_SIZE + CELL_SIZE / 2,
              workerPos.y * CELL_SIZE + CELL_SIZE / 2,
              5,
              0,
              Math.PI * 2
            );
            ctx.fill();
            
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }
    }

    // Draw border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, width, height);

    ctx.restore();
  }, [warehouse, panOffset, zoom, activeRoute, animationProgress, heatmap, showHeatmap]);

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
        className="cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <div className="absolute bottom-3 right-3 flex items-center gap-2 text-xs text-muted-foreground bg-background/90 px-2 py-1 rounded border border-border">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="text-border">|</span>
        <span>Alt+drag to pan</span>
      </div>
    </div>
  );
}
