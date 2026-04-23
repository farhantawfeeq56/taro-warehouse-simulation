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
  
  for (let y = 2; y < height - 2; y++) {
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
  if (shortcuts > 0) {
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

      // Fishbone type: V-shape approximation
      if (type === 'fishbone') {
        const midPoint = (startCol + endCol) / 2;
        const distanceFromMid = Math.abs(x - midPoint);
        // Create an angled gap
        if (Math.abs(distanceFromMid - (y % 10)) < 1) {
          continue;
        }
      }

      // Row continuity: apply occasional gaps if continuity is low
      if (rowLength < 10 && x % (rowLength * 5) === 0) {
        continue;
      }

      warehouse.grid[y][x].type = 'shelf';
      warehouse.shelves.push({ x, y });
    }
  }

  warehouse.workerStart = { x: 1, y: height - 2 };
  warehouse.grid[height - 2][1].type = 'worker-start';
  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}
