import type { Warehouse, LayoutConfig, Cell } from './types';
import { createEmptyWarehouse } from './demo-generator';
import { buildCoordinateLocations } from './layout';

export function generateLayout(config: LayoutConfig): Warehouse {
  const { width, height, type, density, shortcuts, rowLength } = config;
  const warehouse = createEmptyWarehouse(width, height);

  // 1. Calculate row positions
  // density 1-10: 1 means more space (fewer rows), 10 means more storage (more rows)
  // rowInterval of 3 means shelf, shelf, empty (aisle)
  const rowInterval = Math.max(3, 11 - density); 
  const shelfRows: number[] = [];
  
  // Define highway (central horizontal aisle)
  const highwayHeight = 3;
  const midY = Math.floor(height / 2);
  const highwayRows = Array.from({ length: highwayHeight }, (_, i) => midY - Math.floor(highwayHeight / 2) + i);

  for (let y = 2; y < height - 2; y++) {
    // Skip if it's part of the highway
    if (highwayRows.includes(y)) continue;

    // Basic pattern: 2 rows of shelves followed by an aisle
    if (y % rowInterval !== 0) {
      shelfRows.push(y);
    }
  }

  // 2. Calculate column ranges and gaps
  const startCol = 3;
  const endCol = width - 4;
  
  // Shortcuts (0-3): horizontal cross-aisles
  const shortcutCols: number[] = [];
  if (shortcuts > 0 && type !== 'fishbone') {
    const segmentWidth = Math.floor((endCol - startCol) / (shortcuts + 1));
    for (let i = 1; i <= shortcuts; i++) {
      shortcutCols.push(startCol + i * segmentWidth);
    }
  }

  // Row Continuity (1-10): 1 means frequent gaps, 10 means continuous rows
  const gapFrequency = 11 - rowLength;

  for (const y of shelfRows) {
    // Cross-aisle type: big gap in the middle row(s)
    if (type === 'cross-aisle' && Math.abs(y - height / 2) < 2) {
      continue;
    }

    for (let x = startCol; x <= endCol; x++) {
      // Skip if this column is a shortcut
      if (shortcutCols.includes(x)) continue;

      // Segmented type: gaps based on rowLength
      if (type === 'segmented' && x % (Math.max(2, gapFrequency) * 3) === 0) {
        continue;
      }

      // Fishbone type: V-shape approximation with central highway and diagonal aisles
      if (type === 'fishbone') {
        const midPoint = (startCol + endCol) / 2;
        const distanceFromMid = x - midPoint;
        const relativeY = y - midY;
        
        // Main V-shape diagonal aisles
        // Angle depends on distance from center
        // Shortcuts slider (0-3) controls number of diagonal aisles
        const diagonalAisleWidth = 1.5;
        let isDiagonalAisle = false;
        
        // We always have the main fishbone angle
        if (Math.abs(Math.abs(distanceFromMid) - Math.abs(relativeY)) < diagonalAisleWidth) {
          isDiagonalAisle = true;
        }

        // Additional diagonal aisles based on shortcuts
        if (shortcuts > 0) {
          const spacing = (endCol - startCol) / (shortcuts + 1);
          for (let i = 1; i <= shortcuts; i++) {
            const offset = i * spacing;
            if (Math.abs(Math.abs(distanceFromMid - offset) - Math.abs(relativeY)) < diagonalAisleWidth ||
                Math.abs(Math.abs(distanceFromMid + offset) - Math.abs(relativeY)) < diagonalAisleWidth) {
              isDiagonalAisle = true;
            }
          }
        }

        if (isDiagonalAisle) continue;
      }

      // Row continuity: apply occasional gaps if continuity is low
      if (rowLength < 10 && x % (rowLength * 5) === 0) {
        continue;
      }

      warehouse.grid[y][x].type = 'shelf';
      warehouse.shelves.push({ x, y });
    }
  }

  // Cleanup pass: remove isolated shelves or tiny segments
  const grid = warehouse.grid;
  const shelvesToRemove: {x: number, y: number}[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].type === 'shelf') {
        // In this simulation, shelves are predominantly horizontal.
        // Remove any shelf cell that doesn't have a horizontal neighbor.
        let horizontalNeighbors = 0;
        if (x > 0 && grid[y][x-1].type === 'shelf') horizontalNeighbors++;
        if (x < width - 1 && grid[y][x+1].type === 'shelf') horizontalNeighbors++;
        
        if (horizontalNeighbors === 0) {
          shelvesToRemove.push({x, y});
        }
      }
    }
  }
  
  for (const {x, y} of shelvesToRemove) {
    grid[y][x].type = 'empty';
  }
  warehouse.shelves = warehouse.shelves.filter(s => grid[s.y][s.x].type === 'shelf');

  warehouse.workerStart = { x: 1, y: height - 2 };
  warehouse.grid[height - 2][1].type = 'worker-start';
  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}
