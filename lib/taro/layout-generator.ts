import type { Warehouse, Cell, StorageLocation } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';
import { OUTER_PADDING } from './layout-utils';

/**
 * Generates a fishbone warehouse layout using a geometric approach.
 * 
 * @param width Width of the warehouse in grid cells
 * @param height Height of the warehouse in grid cells
 * @param theta Angle of diagonal aisles in degrees
 * @param I2 Spacing growth factor/multiplier
 * @param s Base spacing between diagonal aisles
 * @param ap Density factor (0.0 to 1.0) for shelf placement
 */
export function generateFishboneLayout(
  width: number,
  height: number,
  theta: number = 45,
  I2: number = 1,
  s: number = 4,
  ap: number = 0.8
): Warehouse {
  const fullWidth = width + 2 * OUTER_PADDING;
  const fullHeight = height + 2 * OUTER_PADDING;

  const grid: Cell[][] = Array.from({ length: fullHeight }, (_, y) =>
    Array.from({ length: fullWidth }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [],
    }))
  );

  const centerX = Math.floor(width / 2);
  const tanTheta = Math.tan((theta * Math.PI) / 180);
  const rowSpacing = s * I2;
  
  const shelves: { x: number; y: number }[] = [];
  let skuId = 1;
  let itemCounter = 1;

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const x = lx + OUTER_PADDING;
      const y = ly + OUTER_PADDING;

      // 1. Central Spine (Vertical Aisle)
      if (lx === centerX) {
        grid[y][x].type = 'empty';
        continue;
      }

      // 2. Diagonal Aisles
      // Expression: ly - |lx - centerX| * tan(theta)
      // We add a large offset to ensure the value is positive before modulo
      const diagonalValue = (ly - Math.abs(lx - centerX) * tanTheta) + 500;
      
      // We want diagonal aisles at regular intervals. 
      // Using modulo to create repeating diagonal lines.
      const isAisle = (diagonalValue % rowSpacing) < 1.0;

      if (isAisle) {
        grid[y][x].type = 'empty';
      } else {
        // 3. Shelf Placement based on density
        const pseudoRandom = (Math.sin(lx * 12.9898 + ly * 78.233) * 43758.5453123) % 1;
        const normalizedRandom = (pseudoRandom + 1) / 2;

        if (normalizedRandom < ap) {
          grid[y][x].type = 'shelf';
          
          // Generate storage locations for the shelf
          const locations: StorageLocation[] = [];
          const numZLevels = Math.floor(Math.random() * 3) + 1;
          
          for (let z = 1; z <= numZLevels; z++) {
            const sku = `SKU_${String(skuId).padStart(3, '0')}`;
            const quantity = Math.floor(Math.random() * 90) + 10;
            locations.push({
              id: `${sku}@${x},${y},${z}`,
              locationId: getShelfLocationId(x, y),
              x,
              y,
              z,
              sku,
              quantity,
            });
            skuId++;
          }
          
          grid[y][x].locations = locations;
          shelves.push({ x, y });
        }
      }
    }
  }

  // Set worker start position
  const workerStart = { x: centerX + OUTER_PADDING, y: fullHeight - OUTER_PADDING - 1 };
  grid[workerStart.y][workerStart.x] = {
    x: workerStart.x,
    y: workerStart.y,
    type: 'worker-start',
    locations: [],
  };

  const warehouse: Warehouse = {
    width: fullWidth,
    height: fullHeight,
    grid,
    shelves,
    workerStart,
    locations: [],
    items: [],
  };

  // Populate items (one per shelf for consistency with demo generator)
  for (const shelf of shelves) {
    warehouse.items.push({
      id: `ITEM_${String(itemCounter).padStart(3, '0')}`,
      locationId: getShelfLocationId(shelf.x, shelf.y),
    });
    itemCounter++;
  }

  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

/**
 * Generates a parallel warehouse layout.
 * 
 * @param gridHeight Height of the warehouse in grid cells
 * @param rackCount Number of rack columns
 * @param aisleWidth Spacing between rack columns
 */
export function generateParallelLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number
): Warehouse {
  return generateSegmentedLayout(gridHeight, rackCount, aisleWidth, 1);
}

/**
 * Generates a segmented warehouse layout (parallel with horizontal breaks).
 * 
 * @param gridHeight Height of the warehouse in grid cells
 * @param rackCount Number of rack columns
 * @param aisleWidth Spacing between rack columns
 * @param segmentCount Number of vertical segments (1 = no breaks)
 */
export function generateSegmentedLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number,
  segmentCount: number
): Warehouse {
  const width = (rackCount * 2) + (rackCount - 1) * aisleWidth;
  const height = gridHeight;

  const fullWidth = width + 2 * OUTER_PADDING;
  const fullHeight = height + 2 * OUTER_PADDING;

  const grid: Cell[][] = Array.from({ length: fullHeight }, (_, y) =>
    Array.from({ length: fullWidth }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [],
    }))
  );

  const shelves: { x: number; y: number }[] = [];
  let skuId = 1;
  let itemCounter = 1;

  // Calculate segment heights and break positions
  const crossAisleHeight = 1;
  const totalBreakHeight = (segmentCount - 1) * crossAisleHeight;
  const usableHeight = height - totalBreakHeight;
  const segmentHeight = Math.floor(usableHeight / segmentCount);
  
  const isBreakRow = (ly: number) => {
    if (segmentCount <= 1) return false;
    for (let i = 1; i < segmentCount; i++) {
      const breakStart = i * segmentHeight + (i - 1) * crossAisleHeight;
      if (ly >= breakStart && ly < breakStart + crossAisleHeight) return true;
    }
    return false;
  };

  for (let rackIndex = 0; rackIndex < rackCount; rackIndex++) {
    const xBase = OUTER_PADDING + rackIndex * (2 + aisleWidth);
    for (let xOffset = 0; xOffset < 2; xOffset++) {
      const x = xBase + xOffset;
      for (let ly = 0; ly < height; ly++) {
        if (isBreakRow(ly)) continue;

        const y = ly + OUTER_PADDING;
        grid[y][x].type = 'shelf';
        
        // Generate storage locations for the shelf
        const locations: StorageLocation[] = [];
        const numZLevels = Math.floor(Math.random() * 3) + 1;
        
        for (let z = 1; z <= numZLevels; z++) {
          const sku = `SKU_${String(skuId).padStart(3, '0')}`;
          const quantity = Math.floor(Math.random() * 90) + 10;
          locations.push({
            id: `${sku}@${x},${y},${z}`,
            locationId: getShelfLocationId(x, y),
            x,
            y,
            z,
            sku,
            quantity,
          });
          skuId++;
        }
        
        grid[y][x].locations = locations;
        shelves.push({ x, y });
      }
    }
  }

  // Set worker start position in the first aisle
  const workerStartX = OUTER_PADDING + (rackCount > 1 ? 2 : 0);
  const workerStart = { x: workerStartX, y: fullHeight - OUTER_PADDING - 1 };
  grid[workerStart.y][workerStart.x] = {
    x: workerStart.x,
    y: workerStart.y,
    type: 'worker-start',
    locations: [],
  };

  const warehouse: Warehouse = {
    width: fullWidth,
    height: fullHeight,
    grid,
    shelves,
    workerStart,
    locations: [],
    items: [],
  };

  // Populate items (one per shelf)
  for (const shelf of shelves) {
    warehouse.items.push({
      id: `ITEM_${String(itemCounter).padStart(3, '0')}`,
      locationId: getShelfLocationId(shelf.x, shelf.y),
    });
    itemCounter++;
  }

  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

/**
 * Generates a layout with cross-aisles (major horizontal aisles).
 * 
 * @param gridHeight Height of the warehouse in grid cells
 * @param rackCount Number of rack columns
 * @param aisleWidth Spacing between rack columns
 * @param crossAisleCount Number of major horizontal aisles
 */
export function generateCrossAisleLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number,
  crossAisleCount: number
): Warehouse {
  // Cross aisle layout is essentially a segmented layout where segments are roughly equal
  return generateSegmentedLayout(gridHeight, rackCount, aisleWidth, crossAisleCount + 1);
}

