'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Warehouse, ToolType, StrategyResult, ZVisualizationMode } from '@/lib/taro/types';
import { CELL_SIZE, GRID_COLOR, SHELF_COLOR, WORKER_COLOR, EMPTY_COLOR, Z_LEVEL_COLORS } from '@/lib/taro/constants';

interface WarehouseCanvasProps {
  warehouse: Warehouse;
  onWarehouseChange: (warehouse: Warehouse) => void;
  selectedTool: ToolType;
  activeRoute: StrategyResult | null;
  animationProgress: number;
  zVisualizationMode: ZVisualizationMode;
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

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const cellPosition = getCellFromMouse(e);
    if (!cellPosition) return;
    const cell = warehouse.grid[cellPosition.y][cellPosition.x];
    if (cell.type !== 'shelf') return;

    const locations = cell.locations
      .map((loc) => `z${loc.z} | ${loc.sku} | qty:${loc.quantity}`)
      .join(' ; ');
    console.log(
      `[Shelf ${cellPosition.x},${cellPosition.y}] ${
        locations.length > 0 ? locations : 'No locations configured'
      }`
    );
  }, [getCellFromMouse, warehouse]);

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
        ctx.globalAlpha = 1.0;

        // Draw grid lines
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, CELL_SIZE, CELL_SIZE);

        // Draw shelf location markers for selected z-level only.
        if (cell.type === 'shelf') {
          if (zVisualizationMode !== 'all') {
            const selectedLevel = parseInt(zVisualizationMode.replace('level', ''), 10);
            const selectedCount = cell.locations.filter(loc => loc.z === selectedLevel).length;

            if (selectedCount > 0) {
              const markerColor = Z_LEVEL_COLORS[selectedLevel] || '#3b82f6';
              const columns = Math.min(selectedCount, 4);
              const rows = Math.ceil(selectedCount / columns);
              const spacingX = CELL_SIZE / (columns + 1);
              const spacingY = CELL_SIZE / (rows + 1);
              let dotsDrawn = 0;

              for (let row = 1; row <= rows; row++) {
                for (let col = 1; col <= columns; col++) {
                  if (dotsDrawn >= selectedCount) break;
                  ctx.beginPath();
                  ctx.fillStyle = markerColor;
                  ctx.arc(px + col * spacingX, py + row * spacingY, 2, 0, Math.PI * 2);
                  ctx.fill();
                  dotsDrawn++;
                }
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
  }, [warehouse, panOffset, zoom, activeRoute, animationProgress, zVisualizationMode]);

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
