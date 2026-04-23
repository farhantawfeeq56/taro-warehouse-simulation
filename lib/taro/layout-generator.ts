import type { Warehouse, LayoutConfig, Cell } from './types';
import { createEmptyWarehouse } from './demo-generator';
import { buildCoordinateLocations } from './layout';

/**
 * Generates a warehouse layout based on the provided configuration.
 * Uses a geometry-first constructive algorithm for fishbone layouts and
 * maintains structured row growth for standard layouts.
 */
export function generateLayout(config: LayoutConfig): Warehouse {
  const { width, height, type, density, shortcuts, rowLength } = config;
  const warehouse = createEmptyWarehouse(width, height);

  // 1. Calculate Hub Constants
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  const spineWidth = 3;
  const highwayHeight = 3;
  
  const highwayRows = Array.from({ length: highwayHeight }, (_, i) => midY - Math.floor(highwayHeight / 2) + i);

  // Pre-calculate aisle cells for geometry-first constructive approach
  const aisleCells = new Set<string>();

  // Central Vertical Spine (applied to all, but essential for fishbone connectivity)
  const halfSpine = Math.floor(spineWidth / 2);
  for (let y = 0; y < height; y++) {
    for (let x = midX - halfSpine; x <= midX + halfSpine; x++) {
      if (x >= 0 && x < width) {
        aisleCells.add(`${x},${y}`);
      }
    }
  }

  // Set corrected density-based rowInterval
  let rowInterval = Math.max(3, 11 - density);
  
  if (type === 'fishbone') {
    // Corrected density mapping for fishbone: higher density = larger interval (fewer horizontal aisles)
    rowInterval = Math.max(3, density);
    
    const pdX = midX;
    const pdY = height - 1;

    // Symmetric Diagonal Aisles (V-shape)
    // Angle ~33.7° (arctan 2/3) results in 1.5:1 horizontal-to-vertical slope (dx = 1.5 * dy)
    for (let y = 0; y < height; y++) {
      const dy = pdY - y;
      if (dy < 0) continue;
      
      const targetDx = 1.5 * dy;
      // Define aisle width with a range around targetDx
      for (let xOffset = -1; xOffset <= 1; xOffset++) {
        const xLeft = Math.floor(pdX - targetDx + xOffset);
        const xRight = Math.ceil(pdX + targetDx + xOffset);
        
        if (xLeft >= 0 && xLeft < width) aisleCells.add(`${xLeft},${y}`);
        if (xRight >= 0 && xRight < width) aisleCells.add(`${xRight},${y}`);
      }
    }

    // Additional V-shape ribs (shortcuts) if requested
    if (shortcuts > 0) {
      const ribSpacing = Math.floor(height / (shortcuts + 1));
      for (let i = 1; i <= shortcuts; i++) {
        const ribY = pdY - i * ribSpacing;
        for (let y = 0; y < height; y++) {
          const dy = ribY - y;
          if (dy < 0) continue;
          const targetDx = 1.5 * dy;
          for (let xOffset = -1; xOffset <= 1; xOffset++) {
            const xLeft = Math.floor(pdX - targetDx + xOffset);
            const xRight = Math.ceil(pdX + targetDx + xOffset);
            if (xLeft >= 0 && xLeft < width) aisleCells.add(`${xLeft},${y}`);
            if (xRight >= 0 && xRight < width) aisleCells.add(`${xRight},${y}`);
          }
        }
      }
    }

    // Explicitly add Horizontal Aisles to the aisle set for fishbone
    for (let y = 0; y < height; y++) {
      if (y % rowInterval === 0) {
        for (let x = 0; x < width; x++) aisleCells.add(`${x},${y}`);
      }
    }
  } else {
    // Standard horizontal aisles for other layouts
    for (let y = 0; y < height; y++) {
      if (highwayRows.includes(y) || y % rowInterval === 0) {
        for (let x = 0; x < width; x++) aisleCells.add(`${x},${y}`);
      }
    }
  }

  // 2. Structured Row Growth
  const startCol = 3;
  const endCol = width - 4;
  
  // Non-fishbone vertical shortcuts
  const shortcutCols: number[] = [];
  if (shortcuts > 0 && type !== 'fishbone') {
    const segmentWidth = Math.floor((endCol - startCol) / (shortcuts + 1));
    for (let i = 1; i <= shortcuts; i++) {
      shortcutCols.push(startCol + i * segmentWidth);
    }
  }

  const gapFactor = 11 - rowLength;

  for (let y = 2; y < height - 2; y++) {
    // Skip if it's a designated horizontal aisle row
    let isRowAisle = false;
    if (type === 'fishbone') {
      if (y % rowInterval === 0) isRowAisle = true;
    } else {
      if (highwayRows.includes(y) || y % rowInterval === 0) isRowAisle = true;
    }
    if (isRowAisle) continue;

    // Cross-aisle special central gap
    if (type === 'cross-aisle' && Math.abs(y - midY) < 2) continue;

    for (let x = startCol; x <= endCol; x++) {
      // Skip cells that coincide with pre-defined aisles (Central Spine, Diagonal, etc.)
      if (aisleCells.has(`${x},${y}`)) continue;

      // Skip non-fishbone vertical shortcut columns
      if (type !== 'fishbone' && shortcutCols.includes(x)) continue;

      // Apply rowLength continuity gaps
      // Higher rowLength means fewer gaps. 
      // Using Math.floor(30 / gapFactor) to determine gap frequency.
      // rowLength=10 -> gapFactor=1 -> gap every 30 cells (few)
      // rowLength=1 -> gapFactor=10 -> gap every 3 cells (many)
      if (x % Math.floor(30 / gapFactor) === 0) {
        if (type === 'segmented' || rowLength < 10) continue;
      }

      // Add shelf
      warehouse.grid[y][x].type = 'shelf';
      warehouse.shelves.push({ x, y });
    }
  }

  // 3. Connectivity Validation (Constructive pruning)
  // Ensure every shelf cell is cardinally adjacent to at least one aisle (non-shelf) cell
  const grid = warehouse.grid;
  const reachableShelves: {x: number, y: number}[] = [];
  const unreachableShelves: {x: number, y: number}[] = [];
  
  for (const shelf of warehouse.shelves) {
    const {x, y} = shelf;
    let hasAisleNeighbor = false;
    
    const neighbors = [
      {nx: x, ny: y - 1}, {nx: x, ny: y + 1},
      {nx: x - 1, ny: y}, {nx: x + 1, ny: y}
    ];

    for (const {nx, ny} of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        // Any cell that is not a shelf is an aisle for picking purposes
        if (grid[ny][nx].type !== 'shelf') {
          hasAisleNeighbor = true;
          break;
        }
      }
    }
    
    if (hasAisleNeighbor) {
      reachableShelves.push(shelf);
    } else {
      unreachableShelves.push(shelf);
    }
  }

  // Apply pruning: change unreachable shelves back to empty
  for (const {x, y} of unreachableShelves) {
    grid[y][x].type = 'empty';
  }
  warehouse.shelves = reachableShelves;

  // 4. Final Cleanup: remove isolated shelves (no horizontal shelf neighbors)
  // This ensures shelf rows have a minimum continuity.
  const finalShelves: {x: number, y: number}[] = [];
  for (const shelf of warehouse.shelves) {
    const {x, y} = shelf;
    let horizontalShelfNeighbors = 0;
    if (x > 0 && grid[y][x-1].type === 'shelf') horizontalShelfNeighbors++;
    if (x < width - 1 && grid[y][x+1].type === 'shelf') horizontalShelfNeighbors++;
    
    if (horizontalShelfNeighbors > 0) {
      finalShelves.push(shelf);
    } else {
      grid[y][x].type = 'empty';
    }
  }
  warehouse.shelves = finalShelves;

  // Set worker start position
  warehouse.workerStart = { x: 1, y: height - 2 };
  warehouse.grid[height - 2][1].type = 'worker-start';
  
  // Rebuild location data for the generated grid
  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}
