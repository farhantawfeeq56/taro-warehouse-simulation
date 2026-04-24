import type { Warehouse, Cell, StorageLocation } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';
import { OUTER_PADDING } from './layout-utils';

interface ParallelLayoutBase {
  logicalWidth: number;
  logicalHeight: number;
  fullWidth: number;
  fullHeight: number;
  grid: Cell[][];
  rackColumnPairs: Array<[number, number]>;
  workerStart: { x: number; y: number };
}

function normalizePositiveInt(value: number, fallback = 1): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function createEmptyGrid(width: number, height: number): Cell[][] {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x,
      y,
      type: 'empty' as const,
      locations: [],
    }))
  );
}

function createParallelBaseLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number
): ParallelLayoutBase {
  const logicalHeight = normalizePositiveInt(gridHeight);
  const normalizedRackCount = normalizePositiveInt(rackCount);
  const normalizedAisleWidth = normalizePositiveInt(aisleWidth);
  const logicalWidth = (normalizedRackCount * 2) + (normalizedRackCount - 1) * normalizedAisleWidth;

  const fullWidth = logicalWidth + 2 * OUTER_PADDING;
  const fullHeight = logicalHeight + 2 * OUTER_PADDING;
  const grid = createEmptyGrid(fullWidth, fullHeight);

  const rackColumnPairs: Array<[number, number]> = [];
  let skuId = 1;

  for (let rackIndex = 0; rackIndex < normalizedRackCount; rackIndex++) {
    const xBase = OUTER_PADDING + rackIndex * (2 + normalizedAisleWidth);
    const rackColumns: [number, number] = [xBase, xBase + 1];
    rackColumnPairs.push(rackColumns);

    for (const x of rackColumns) {
      for (let logicalY = 0; logicalY < logicalHeight; logicalY++) {
        const y = logicalY + OUTER_PADDING;

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

        grid[y][x].type = 'shelf';
        grid[y][x].locations = locations;
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

  return {
    logicalWidth,
    logicalHeight,
    fullWidth,
    fullHeight,
    grid,
    rackColumnPairs,
    workerStart,
  };
}

function buildWarehouseFromGrid(baseLayout: ParallelLayoutBase): Warehouse {
  const shelves: { x: number; y: number }[] = [];
  const items: Warehouse['items'] = [];
  let itemCounter = 1;

  for (let y = 0; y < baseLayout.fullHeight; y++) {
    for (let x = 0; x < baseLayout.fullWidth; x++) {
      if (baseLayout.grid[y][x].type !== 'shelf') continue;
      shelves.push({ x, y });
      items.push({
        id: `ITEM_${String(itemCounter).padStart(3, '0')}`,
        locationId: getShelfLocationId(x, y),
      });
      itemCounter++;
    }
  }

  const warehouse: Warehouse = {
    width: baseLayout.fullWidth,
    height: baseLayout.fullHeight,
    grid: baseLayout.grid,
    shelves,
    workerStart: baseLayout.workerStart,
    locations: [],
    items,
  };

  warehouse.locations = buildCoordinateLocations(warehouse);
  return warehouse;
}

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
    locations: [],
    items: [],
  };

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

export function generateParallelLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number
): Warehouse {
  return buildWarehouseFromGrid(createParallelBaseLayout(gridHeight, rackCount, aisleWidth));
}

export function generateSegmentedLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number,
  segmentCount: number
): Warehouse {
  const baseLayout = createParallelBaseLayout(gridHeight, rackCount, aisleWidth);
  const normalizedSegmentCount = Math.floor(segmentCount);

  if (normalizedSegmentCount > 1) {
    const effectiveSegmentCount = Math.min(normalizedSegmentCount, baseLayout.logicalHeight);
    const segmentHeight = Math.floor(baseLayout.logicalHeight / effectiveSegmentCount);

    if (segmentHeight >= 2) {
      const breakRows = Array.from({ length: effectiveSegmentCount - 1 }, (_, index) => (index + 1) * segmentHeight)
        .filter(row => row > 0 && row < baseLayout.logicalHeight);

      for (let rackIndex = 0; rackIndex < baseLayout.rackColumnPairs.length; rackIndex++) {
        const [leftRackColumn, rightRackColumn] = baseLayout.rackColumnPairs[rackIndex];
        const staggerOffset = rackIndex % 2;

        for (const breakRow of breakRows) {
          const adjustedBreakRow = breakRow + staggerOffset;
          if (adjustedBreakRow <= 0 || adjustedBreakRow >= baseLayout.logicalHeight) continue;

          const y = adjustedBreakRow + OUTER_PADDING;

          if (baseLayout.grid[y][leftRackColumn].type === 'shelf') {
            baseLayout.grid[y][leftRackColumn].type = 'empty';
            baseLayout.grid[y][leftRackColumn].locations = [];
          }

          if (baseLayout.grid[y][rightRackColumn].type === 'shelf') {
            baseLayout.grid[y][rightRackColumn].type = 'empty';
            baseLayout.grid[y][rightRackColumn].locations = [];
          }
        }
      }
    }
  }

  return buildWarehouseFromGrid(baseLayout);
}

export function generateCrossAisleLayout(
  gridHeight: number,
  rackCount: number,
  aisleWidth: number,
  crossAisleCount: number
): Warehouse {
  const baseLayout = createParallelBaseLayout(gridHeight, rackCount, aisleWidth);
  const normalizedCrossAisleCount = Math.floor(crossAisleCount);

  if (normalizedCrossAisleCount > 0) {
    const spacing = Math.floor(baseLayout.logicalHeight / (normalizedCrossAisleCount + 1));

    if (spacing > 0) {
      for (let index = 1; index <= normalizedCrossAisleCount; index++) {
        const logicalRow = index * spacing;
        if (logicalRow <= 0 || logicalRow >= baseLayout.logicalHeight) continue;

        const y = logicalRow + OUTER_PADDING;

        for (let logicalX = 0; logicalX < baseLayout.logicalWidth; logicalX++) {
          const x = logicalX + OUTER_PADDING;
          if (baseLayout.grid[y][x].type !== 'shelf') continue;
          baseLayout.grid[y][x].type = 'empty';
          baseLayout.grid[y][x].locations = [];
        }
      }
    }
  }

  return buildWarehouseFromGrid(baseLayout);
}
