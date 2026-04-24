import type { Warehouse, Cell, StorageLocation } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';

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
  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
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

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 1. Central Spine (Vertical Aisle)
      if (x === centerX) {
        grid[y][x].type = 'empty';
        continue;
      }

      // 2. Diagonal Aisles
      // Expression: y - |x - centerX| * tan(theta)
      // We add a large offset to ensure the value is positive before modulo
      const diagonalValue = (y - Math.abs(x - centerX) * tanTheta) + 500;
      
      // We want diagonal aisles at regular intervals. 
      // Using modulo to create repeating diagonal lines.
      const isAisle = (diagonalValue % rowSpacing) < 1.0;

      if (isAisle) {
        grid[y][x].type = 'empty';
      } else {
        // 3. Shelf Placement based on density
        const pseudoRandom = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453123) % 1;
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
  const workerStart = { x: centerX, y: height - 1 };
  grid[workerStart.y][workerStart.x] = {
    x: workerStart.x,
    y: workerStart.y,
    type: 'worker-start',
    locations: [],
  };

  const warehouse: Warehouse = {
    width,
    height,
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
  const width = rackCount + (rackCount - 1) * aisleWidth;
  const height = gridHeight;

  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [],
    }))
  );

  const shelves: { x: number; y: number }[] = [];
  let skuId = 1;
  let itemCounter = 1;

  for (let x = 0; x < width; x++) {
    // Parallel layout: 1 rack column followed by aisleWidth aisle columns
    const cycleWidth = 1 + aisleWidth;
    if (x % cycleWidth === 0) {
      for (let y = 0; y < height; y++) {
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
  const workerStartX = rackCount > 1 ? 1 : 0;
  const workerStart = { x: workerStartX, y: height - 1 };
  grid[workerStart.y][workerStart.x] = {
    x: workerStart.x,
    y: workerStart.y,
    type: 'worker-start',
    locations: [],
  };

  const warehouse: Warehouse = {
    width,
    height,
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
