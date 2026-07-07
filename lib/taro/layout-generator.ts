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

  for (let ly = 0; ly < height; ly++) {
    for (let lx = 0; lx < width; lx++) {
      const x = lx + OUTER_PADDING;
      const y = ly + OUTER_PADDING;

      if (lx === centerX) {
        grid[y][x].type = 'empty';
        continue;
      }

      const diagonalValue = (ly - Math.abs(lx - centerX) * tanTheta) + 500;
      const isAisle = (diagonalValue % rowSpacing) < 1.0;

      if (isAisle) {
        grid[y][x].type = 'empty';
      } else {
        const pseudoRandom = (Math.sin(lx * 12.9898 + ly * 78.233) * 43758.5453123) % 1;
        const normalizedRandom = (pseudoRandom + 1) / 2;

        if (normalizedRandom < ap) {
          grid[y][x].type = 'shelf';

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
    locations: buildCoordinateLocations({ grid, width: fullWidth, height: fullHeight, workerStart }),
  };

  return warehouse;
}

function createBaseGrid(width: number, height: number): Cell[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [],
    }))
  );
}

function createShelfLocations(x: number, y: number, skuCounter: { value: number }): StorageLocation[] {
  const locations: StorageLocation[] = [];
  const numZLevels = Math.floor(Math.random() * 3) + 1;

  for (let z = 1; z <= numZLevels; z++) {
    const sku = `SKU_${String(skuCounter.value).padStart(3, '0')}`;
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

    skuCounter.value++;
  }

  return locations;
}

function rebuildWarehouseMetadata(warehouse: Warehouse): void {
  const shelves: { x: number; y: number }[] = [];

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];

      if (cell.type === 'shelf') {
        shelves.push({ x, y });
      } else if (cell.locations.length > 0) {
        cell.locations = [];
      }
    }
  }

  warehouse.shelves = shelves;
  warehouse.locations = buildCoordinateLocations(warehouse);
}

function buildBaseParallelWarehouse(gridHeight: number, rackCount: number, aisleWidth: number): Warehouse {
  const normalizedHeight = Math.max(1, Math.floor(gridHeight));
  const normalizedRackCount = Math.max(1, Math.floor(rackCount));
  const normalizedAisleWidth = Math.max(1, Math.floor(aisleWidth));

  const logicalWidth = (normalizedRackCount * 2) + (normalizedRackCount - 1) * normalizedAisleWidth;
  const fullWidth = logicalWidth + 2 * OUTER_PADDING;
  const fullHeight = normalizedHeight + 2 * OUTER_PADDING;

  const grid = createBaseGrid(fullWidth, fullHeight);
  const skuCounter = { value: 1 };

  for (let rackIndex = 0; rackIndex < normalizedRackCount; rackIndex++) {
    const xBase = OUTER_PADDING + rackIndex * (2 + normalizedAisleWidth);

    for (let xOffset = 0; xOffset < 2; xOffset++) {
      const x = xBase + xOffset;

      for (let ly = 0; ly < normalizedHeight; ly++) {
        const y = ly + OUTER_PADDING;
        grid[y][x].type = 'shelf';
        grid[y][x].locations = createShelfLocations(x, y, skuCounter);
      }
    }
  }

  const workerStartX = OUTER_PADDING + (normalizedRackCount > 1 ? 2 : 0);
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
    shelves: [],
    workerStart,
    locations: [],
  };

  rebuildWarehouseMetadata(warehouse);
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
  return buildBaseParallelWarehouse(gridHeight, rackCount, aisleWidth);
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
  const warehouse = buildBaseParallelWarehouse(gridHeight, rackCount, aisleWidth);
  const normalizedHeight = Math.max(1, Math.floor(gridHeight));
  const normalizedCrossAisleCount = Math.max(0, Math.floor(crossAisleCount));

  if (normalizedCrossAisleCount === 0) {
    return warehouse;
  }

  const segmentCount = normalizedCrossAisleCount + 1;
  const segmentHeight = Math.floor(normalizedHeight / segmentCount);

  if (segmentHeight <= 0) {
    return warehouse;
  }

  const breakRows = Array.from({ length: segmentCount - 1 }, (_, index) => (index + 1) * segmentHeight)
    .filter((row) => row > 0 && row < normalizedHeight);

  if (breakRows.length === 0) {
    return warehouse;
  }

  const logicalWidth = warehouse.width - 2 * OUTER_PADDING;

  for (const logicalRow of breakRows) {
    const y = logicalRow + OUTER_PADDING;

    for (let lx = 0; lx < logicalWidth; lx++) {
      const x = lx + OUTER_PADDING;
      const cell = warehouse.grid[y][x];

      if (cell.type === 'worker-start') {
        continue;
      }

      cell.type = 'empty';
      cell.locations = [];
    }
  }

  rebuildWarehouseMetadata(warehouse);
  return warehouse;
}
