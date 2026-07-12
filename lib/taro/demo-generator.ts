// Demo data generators for Taro

import type { Warehouse, Cell, Order, StorageLocation } from './types';
import { buildCoordinateLocations, getShelfLocationId } from './layout';
import { OUTER_PADDING } from './layout-utils';
import { collectSkuMetadata, type SkuMeta } from './inventory';

// Get all pickable locations from warehouse (local copy for demo-generator)
function getAllPickableLocations(warehouse: Warehouse): Map<string, { x: number; y: number; z: number; sku: string }> {
  const locations = new Map<string, { x: number; y: number; z: number; sku: string }>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf' && cell.locations.length > 0) {
        for (const loc of cell.locations) {
          locations.set(loc.id, { x: loc.x, y: loc.y, z: loc.z, sku: loc.sku });
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
    locations: buildCoordinateLocations({ grid, width: fullWidth, height: fullHeight, workerStart: null }),
  };
  return warehouse;
}

export function generateDemoWarehouse(): Warehouse {
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

  // Add test data at (5, 3) with z-levels
  const tx = 5 + OUTER_PADDING;
  const ty = 3 + OUTER_PADDING;
  const testLocations: StorageLocation[] = [
    { id: `SKU_001@${tx},${ty},1`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 1, sku: 'SKU_001', quantity: 100 },
    { id: `SKU_002@${tx},${ty},2`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 2, sku: 'SKU_002', quantity: 50 },
    { id: `SKU_003@${tx},${ty},3`, locationId: getShelfLocationId(tx, ty), x: tx, y: ty, z: 3, sku: 'SKU_003', quantity: 30 },
  ];

  // Place locations
  warehouse.grid[ty][tx].locations = testLocations;

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

/**
 * Affinity boost multiplier: how much extra weight same-affinity-group SKUs
 * get during order generation. At 5×, a same-group SKU is 5× as likely to
 * be picked as a non-group SKU with the same demandScore, all else equal.
 *
 * This is a single fixed constant — not user-configurable. The Product
 * Affinity slider already controls the existence and size of groups, so
 * at affinity = 0% the boost never applies (all SKUs are singletons) and
 * at affinity = 100% it generates strong co-purchase patterns within large
 * groups. Tweak this value later based on real-world feel.
 */
const AFFINITY_BOOST = 5;

/**
 * Weighted random index selection: pick one index from the given range
 * proportional to `weights` (an array parallel to the pool).
 * Returns -1 if total weight is zero.
 */
function weightedRandomIndex(weights: number[], totalWeight: number): number {
  if (totalWeight <= 0) return -1;
  const r = Math.random() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return i;
  }
  // Guard against floating-point epsilon at the very end
  return weights.length - 1;
}

/**
 * Generate random orders using demand-weighted and affinity-biased selection.
 *
 * The algorithm:
 * 1. Collect all SKUs with their demandScore and affinityGroup from the warehouse.
 * 2. For each order, pick the first SKU weighted by demandScore alone.
 * 3. For the remaining picks, weight by demandScore × AFFINITY_BOOST if the
 *    candidate shares the first SKU's affinity group, or demandScore alone
 *    otherwise. This creates realistic co-purchase patterns without making
 *    them deterministic — high-demand SKUs from other groups still get
 *    picked regularly.
 * 4. SKUs are sampled without replacement within a single order.
 */
export function generateRandomOrders(warehouse: Warehouse, count: number, avgOrderSize: number = 5): Order[] {
  const orders: Order[] = [];
  const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const pool = collectSkuMetadata(warehouse);
  if (pool.length === 0) return orders;

  const poolSize = pool.length;

  for (let i = 0; i < count; i++) {
    // Item count varies naturally around avgOrderSize (±40%) using a uniform distribution
    const itemCount = Math.min(
      Math.max(1, Math.round(avgOrderSize * (0.6 + Math.random() * 0.8))),
      poolSize
    );

    const orderItems: Order['items'] = [];
    // Track picked indices in the pool, not just SKU ids, so we can recompute
    // weights for the remaining candidates each round.
    const pickedIndices = new Set<number>();

    if (itemCount === 0) continue;

    // ── Round 1: first pick weighted solely by demandScore ────────────────
    {
      const weights = pool.map((meta) => meta.demandScore);
      const total = weights.reduce((s, w) => s + w, 0);
      const idx = weightedRandomIndex(weights, total);
      if (idx < 0) continue;
      pickedIndices.add(idx);
      orderItems.push({ skuId: pool[idx].skuId });
    }

    // Determine the affinity group of the anchor (first) pick
    const anchorGroup = pool[Array.from(pickedIndices)[0]].affinityGroup;

    // ── Rounds 2..itemCount: demand-score × affinity boost ────────────────
    while (pickedIndices.size < itemCount) {
      // Build weights for un-picked candidates
      const weights: number[] = [];
      let totalWeight = 0;
      for (let j = 0; j < poolSize; j++) {
        if (pickedIndices.has(j)) {
          weights.push(0);
          continue;
        }
        const meta = pool[j];
        let w = meta.demandScore;
        // Apply affinity boost when the candidate shares the anchor's group
        if (anchorGroup !== undefined && meta.affinityGroup === anchorGroup) {
          w *= AFFINITY_BOOST;
        }
        weights.push(w);
        totalWeight += w;
      }

      const idx = weightedRandomIndex(weights, totalWeight);
      if (idx < 0) break; // no pickable candidate left
      pickedIndices.add(idx);
      orderItems.push({ skuId: pool[idx].skuId });
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
