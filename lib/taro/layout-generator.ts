import type { Warehouse, LayoutConfig, Cell } from './types';
import { createEmptyWarehouse } from './demo-generator';
import { buildCoordinateLocations } from './layout';

export function generateLayout(config: LayoutConfig): Warehouse {
  const { width, height, type, density, shortcuts, rowLength } = config;
  const warehouse = createEmptyWarehouse(width, height);

  // 1. Calculate Hub Constants
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const spineWidth = 3;
  const highwayHeight = 3;
  
  const spineCols = Array.from({ length: spineWidth }, (_, i) => midX - Math.floor(spineWidth / 2) + i);
  const highwayRows = Array.from({ length: highwayHeight }, (_, i) => midY - Math.floor(highwayHeight / 2) + i);

  // Pre-calculate Fishbone Aisles if needed
  const fishboneAisles = new Set<string>();
  if (type === 'fishbone') {
    const addAisle = (x: number, y: number) => {
      // 3-cell horizontal width for 4-way pathfinding
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width && y >= 0 && y < height) {
          fishboneAisles.add(`${nx},${y}`);
        }
      }
    };

    const generateCorridor = (startX: number, startY: number, dirX: number, dirY: number) => {
      let x = startX;
      let y = startY;
      while (x >= 0 && x < width && y >= 0 && y < height) {
        addAisle(x, y);
        x += dirX;
        y += dirY;
      }
    };

    // Central Vertical Spine
    for (let y = 0; y < height; y++) {
      for (const x of spineCols) {
        fishboneAisles.add(`${x},${y}`);
      }
    }

    // Main V-shape diagonals from center
    generateCorridor(midX, midY, 1, 1);   // Bottom Right
    generateCorridor(midX, midY, -1, 1);  // Bottom Left
    generateCorridor(midX, midY, 1, -1);  // Top Right
    generateCorridor(midX, midY, -1, -1); // Top Left

    // Shortcut ribs
    if (shortcuts > 0) {
      const spacing = Math.max(8, Math.floor(width / (shortcuts + 2)));
      for (let i = 1; i <= shortcuts; i++) {
        const offset = i * spacing;
        // Outer ribs
        generateCorridor(midX, midY + offset, 1, 1);
        generateCorridor(midX, midY + offset, -1, 1);
        generateCorridor(midX, midY - offset, 1, -1);
        generateCorridor(midX, midY - offset, -1, -1);
        
        // Inner ribs
        generateCorridor(midX, midY - offset, 1, 1);
        generateCorridor(midX, midY - offset, -1, 1);
        generateCorridor(midX, midY + offset, 1, -1);
        generateCorridor(midX, midY + offset, -1, -1);
      }
    }
  }

  // 2. Define Shelf Rows
  // density 1-10: 1 means more space (fewer rows), 10 means more storage (more rows)
  const rowInterval = Math.max(3, 11 - density); 
  const shelfRows: number[] = [];
  
  for (let y = 2; y < height - 2; y++) {
    // Skip if it's part of the horizontal highway
    if (highwayRows.includes(y)) continue;

    // Basic pattern: 2 rows of shelves followed by an aisle
    if (y % rowInterval !== 0) {
      shelfRows.push(y);
    }
  }

  // 3. Calculate column ranges and cross-aisle shortcuts
  const startCol = 3;
  const endCol = width - 4;
  
  // Non-fishbone shortcuts: vertical cross-aisles
  const shortcutCols: number[] = [];
  if (shortcuts > 0 && type !== 'fishbone') {
    const segmentWidth = Math.floor((endCol - startCol) / (shortcuts + 1));
    for (let i = 1; i <= shortcuts; i++) {
      shortcutCols.push(startCol + i * segmentWidth);
    }
  }

  // 4. Populate Shelves
  for (const y of shelfRows) {
    // Cross-aisle type special handling: larger central gap if not already handled by highwayRows
    if (type === 'cross-aisle' && Math.abs(y - midY) < 2) {
      continue;
    }

    for (let x = startCol; x <= endCol; x++) {
      if (type === 'fishbone') {
        if (fishboneAisles.has(`${x},${y}`)) continue;
        // For fishbone, we ignore the gap frequency and rowLength to keep racks continuous
      } else {
        // Standard layout logic
        if (shortcutCols.includes(x)) continue;

        // Segmented type: gaps based on rowLength
        const gapFrequency = 11 - rowLength;
        if (type === 'segmented' && x % (Math.max(2, gapFrequency) * 3) === 0) {
          continue;
        }

        // Row continuity: apply occasional gaps if continuity is low
        if (rowLength < 10 && x % (rowLength * 5) === 0) {
          continue;
        }
      }

      warehouse.grid[y][x].type = 'shelf';
      warehouse.shelves.push({ x, y });
    }
  }

  // 5. Cleanup pass: remove isolated shelves or tiny segments
  const grid = warehouse.grid;
  const shelvesToRemove: {x: number, y: number}[] = [];
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x].type === 'shelf') {
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
