// Demo data generators for Taro

import type { Warehouse, Cell, Order, StorageLocation } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';
import { OUTER_PADDING } from './layout-utils';

// Get all pickable locations from warehouse (local copy for demo-generator)
function getAllPickableLocations(warehouse: Warehouse): Map<string, { x: number; y: number; z: number; sku: string }> {
  const locations = new Map<string, { x: number; y: number; z: number; sku: string }>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf' && cell.locations.length > 0) {
        for (const loc of cell.locations) {
          locations.set(`${loc.x},${loc.y},${loc.z}-${loc.sku}`, { x: loc.x, y: loc.y, z: loc.z, sku: loc.sku });
        }
      }
    }
  }

  return locations;
}

export function createEmptyWarehouse(width: number, height: number): Warehouse {
  const fullWidth = width + 2 * OUTER_PADDING;
  const fullHeight = height + 2 * OUTER_PADDING;
  const grid: Cell[][] = [];

  for (let y = 0; y < fullHeight; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < fullWidth; x++) {
      row.push({ x, y, type: 'empty', locations: [] });
    }
    grid.push(row);
  }

  const warehouse: Warehouse = {
    width: fullWidth,
    height: fullHeight,
    grid,
    shelves: [],
    workerStart: null,
    locations: [],
    items: [],
  };
  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

export function generateDemoWarehouse(): Warehouse {
  const logicalWidth = 30;
  const logicalHeight = 24;
  const warehouse = createEmptyWarehouse(logicalWidth, logicalHeight);
  let demoItemIndex = 1;
  const createDemoItem = (locationId: string) => {
    warehouse.items.push({
      id: `DEMO_ITEM_${String(demoItemIndex).padStart(3, '0')}`,
      locationId,
    });
    demoItemIndex++;
  };

  // Create shelf rows with aisles between them
  const shelfRows = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
  const shelfCols: [number, number][] = [
    [3, 10],
    [13, 20],
    [23, 27],
  ];

  for (const row of shelfRows) {
    for (const [startCol, endCol] of shelfCols) {
      for (let col = startCol; col <= endCol; col++) {
        const x = col + OUTER_PADDING;
        const y = row + OUTER_PADDING;
        warehouse.grid[y][x].type = 'shelf';
        warehouse.shelves.push({ x, y });
      }
    }
  }

  // Add test data at (5, 3) with z-levels
  const tx = 5 + OUTER_PADDING;
  const ty = 3 + OUTER_PADDING;
  const testLocations: StorageLocation[] = [
    { id: `SKU_A@${tx},${ty},1`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 1, sku: 'SKU_A', quantity: 100 },
    { id: `SKU_B@${tx},${ty},2`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 2, sku: 'SKU_B', quantity: 50 },
    { id: `SKU_C@${tx},${ty},3`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 3, sku: 'SKU_C', quantity: 30 },
  ];

  // Place locations
  warehouse.grid[ty][tx].locations = testLocations;
  createDemoItem(getShelfLocationId(tx, ty));

  // Add some additional items at shelf edges with locations
  let itemId = 4; // Start after test SKUs
  // Place items on shelf rows
  const itemRows = [3, 7, 11, 15, 19];
  for (const row of itemRows) {
    for (const [startCol, endCol] of shelfCols) {
      // Place 2-3 items per shelf section with z-levels
      const itemPositions = [startCol + 1, startCol + 4, endCol - 3];
      for (const col of itemPositions) {
        if (col <= endCol && Math.random() > 0.3) {
          const x = col + OUTER_PADDING;
          const y = row + OUTER_PADDING;
          // Create 1-3 z-levels at this position
          const numZLevels = Math.floor(Math.random() * 3) + 1;
          const cellLocations: StorageLocation[] = [];

          for (let z = 1; z <= numZLevels; z++) {
            const sku = `SKU_${String(itemId).padStart(3, '0')}`;
            const quantity = Math.floor(Math.random() * 90) + 10;
            cellLocations.push({
              id: `${sku}@${x},${y},${z}`,
              locationId: getShelfLocationId(x, y),
              x,
              y,
              z,
              sku,
              quantity,
            });
            itemId++;
          }

          warehouse.grid[y][x].locations = cellLocations;
          createDemoItem(getShelfLocationId(x, y));
        }
      }
    }
  }

  // Set worker start position at entrance
  const wx = 1 + OUTER_PADDING;
  const wy = logicalHeight - 2 + OUTER_PADDING;
  warehouse.workerStart = { x: wx, y: wy };
  warehouse.grid[wy][wx].type = 'worker-start';
  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}

export function generateSkeletonWarehouse(): Warehouse {
  const logicalWidth = 30;
  const logicalHeight = 24;
  const warehouse = createEmptyWarehouse(logicalWidth, logicalHeight);

  // Create shelf rows with aisles between them
  const shelfRows = [2, 3, 6, 7, 10, 11, 14, 15, 18, 19];
  const shelfCols: [number, number][] = [
    [3, 10],
    [13, 20],
    [23, 27],
  ];

  for (const row of shelfRows) {
    for (const [startCol, endCol] of shelfCols) {
      for (let col = startCol; col <= endCol; col++) {
        const x = col + OUTER_PADDING;
        const y = row + OUTER_PADDING;
        warehouse.grid[y][x].type = 'shelf';
        warehouse.shelves.push({ x, y });
      }
    }
  }

  warehouse.locations = buildCoordinateLocations(warehouse);

  return warehouse;
}

export function generateRandomOrders(warehouse: Warehouse, count: number): Order[] {
  const orders: Order[] = [];
  const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const availableItemIds = warehouse.items.map(item => item.id);
  if (availableItemIds.length === 0) return orders;

  for (let i = 0; i < count; i++) {
    const itemCount = Math.floor(Math.random() * 4) + 2; // 2-5 items per order
    const orderItems: Order['items'] = [];
    const availableItemIdsCopy = [...availableItemIds];

    for (let j = 0; j < itemCount && availableItemIdsCopy.length > 0; j++) {
      const idx = Math.floor(Math.random() * availableItemIdsCopy.length);
      orderItems.push({ itemId: availableItemIdsCopy[idx] });
      availableItemIdsCopy.splice(idx, 1);
    }

    orders.push({
      id: `Order ${orderLabels[i] || i + 1}`,
      items: orderItems,
      assignedWorkerId: null,
    });
  }

  return orders;
}

export function getNextSku(warehouse: Warehouse): string {
  const allLocations = getAllPickableLocations(warehouse);
  const maxSkuNumber = Array.from(allLocations.values()).reduce((maxValue, location) => {
    const match = location.sku.match(/^SKU_(\d+)$/);
    if (!match) return maxValue;
    const parsed = parseInt(match[1], 10);
    if (isNaN(parsed)) return maxValue;
    return Math.max(maxValue, parsed);
  }, 0);

  return `SKU_${String(maxSkuNumber + 1).padStart(3, '0')}`;
}
