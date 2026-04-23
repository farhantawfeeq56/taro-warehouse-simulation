import type { Warehouse, LayoutConfig, Cell } from './types';
import { createEmptyWarehouse } from './demo-generator';
import { buildCoordinateLocations } from './layout';

export function generateLayout(config: LayoutConfig): Warehouse {
  const { width, height, type, aisles } = config;
  const warehouse = createEmptyWarehouse(width, height);

  // Simple layout generation logic
  const shelfRows = [];
  const rowSpacing = Math.floor(height / (aisles + 1));
  
  for (let i = 1; i <= aisles; i++) {
    shelfRows.push(i * rowSpacing);
    shelfRows.push(i * rowSpacing + 1);
  }

  const startCol = 3;
  const endCol = width - 4;

  for (const row of shelfRows) {
    if (row >= height) continue;
    for (let col = startCol; col <= endCol; col++) {
      warehouse.grid[row][col].type = 'shelf';
      warehouse.shelves.push({ x: col, y: row });
    }
  }

  warehouse.workerStart = { x: 1, y: height - 2 };
  warehouse.grid[height - 2][1].type = 'worker-start';
  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}
