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
 * Binary-search a cumulative distribution function (CDF) array to pick an
 * index with probability proportional to the original weight at that index.
 *
 * `cdf[i]` is the running total up to and including index `i`.
 * `total` is the last value in the CDF (total weight).
 *
 * Runs in O(log n), used as the inner loop of order generation.
 */
function sampleCdf(cdf: number[], total: number): number {
  const r = Math.random() * total;
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (cdf[mid] <= r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Generate random orders using demand-weighted and affinity-biased selection.
 *
 * The algorithm:
 * 1. Collect all SKUs with their demandScore and affinityGroup from the warehouse.
 * 2. Precompute a global CDF (cumulative distribution function) for O(log N)
 *    weighted sampling via binary search, and a group→indices map to avoid
 *    scanning every SKU for each line.
 * 3. For each order, pick the first (anchor) SKU weighted by demandScore alone.
 * 4. For the remaining picks, use a two-level rejection sampler:
 *    a. Decide in-group vs out-group via a weighted coin flip (in-group gets
 *       AFFINITY_BOOST multiplier when affinity data is present).
 *    b. Rejection-sample from the global CDF, accepting only candidates that
 *       belong to the chosen side and haven't been picked yet.
 *    This yields the same probability distribution as the original exhaustive
 *    weight-scan but runs in O(log N) expected time per pick instead of O(N).
 * 5. SKUs are sampled without replacement within a single order.
 */
export function generateRandomOrders(warehouse: Warehouse, count: number, avgOrderSize: number = 5): Order[] {
  const orders: Order[] = [];
  const orderLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  const pool = collectSkuMetadata(warehouse);
  if (pool.length === 0) return orders;

  const poolSize = pool.length;

  // ── Precompute global CDF for O(log N) weighted sampling ────────────
  const allCdf: number[] = [];
  let allTotal = 0;
  for (const meta of pool) {
    allTotal += meta.demandScore;
    allCdf.push(allTotal);
  }

  // ── Precompute group → [pool indices] map for fast partitioning ────
  const groupToIndices = new Map<number | undefined, number[]>();
  for (let i = 0; i < poolSize; i++) {
    const g = pool[i].affinityGroup;
    const arr = groupToIndices.get(g);
    if (arr) arr.push(i);
    else groupToIndices.set(g, [i]);
  }

  for (let i = 0; i < count; i++) {
    // Item count varies naturally around avgOrderSize (±40%) using a uniform distribution
    const itemCount = Math.min(
      Math.max(1, Math.round(avgOrderSize * (0.6 + Math.random() * 0.8))),
      poolSize
    );

    const orderItems: Order['items'] = [];
    const pickedIndices = new Set<number>();

    if (itemCount === 0) continue;

    // ── Round 1: anchor pick weighted solely by demandScore ──────────
    const anchorIdx = sampleCdf(allCdf, allTotal);
    pickedIndices.add(anchorIdx);
    orderItems.push({ skuId: pool[anchorIdx].skuId });

    const anchorGroup = pool[anchorIdx].affinityGroup;
    const useAffinity = anchorGroup !== undefined;

    // ── Compute initial in-group / out-group total demand ────────────
    let inGroupTotal = 0;
    for (const idx of groupToIndices.get(anchorGroup) ?? []) {
      if (idx !== anchorIdx) inGroupTotal += pool[idx].demandScore;
    }
    let outGroupTotal = allTotal - pool[anchorIdx].demandScore - inGroupTotal;

    // ── Rounds 2..itemCount ──────────────────────────────────────────
    while (pickedIndices.size < itemCount) {
      const boostedInWeight = useAffinity ? inGroupTotal * AFFINITY_BOOST : inGroupTotal;
      const totalWeight = boostedInWeight + outGroupTotal;

      if (totalWeight <= 0) break;

      // Weighted coin flip: pick from in-group or out-group
      const pickInGroup = Math.random() * totalWeight < boostedInWeight;

      // Rejection-sample from the global CDF, accepting only candidates
      // that match the chosen side and haven't been picked yet.
      //
      // Expected iterations per pick ≈ (AFFINITY_BOOST + 1) ≈ 6 when
      // the catalogue is large and the anchor's group is a small
      // fraction.  The safety counter guards against edge cases where
      // the chosen side has been fully exhausted due to floating-point
      // rounding in the coin flip.
      let pickedIdx = -1;
      for (let attempt = 0; attempt < poolSize * 2 && pickedIdx < 0; attempt++) {
        const candidate = sampleCdf(allCdf, allTotal);
        if (pickedIndices.has(candidate)) continue;

        const candidateInGroup = pool[candidate].affinityGroup === anchorGroup;

        if (pickInGroup) {
          if (candidateInGroup) pickedIdx = candidate;
        } else {
          if (!useAffinity || !candidateInGroup) pickedIdx = candidate;
        }
      }

      if (pickedIdx < 0) break; // no acceptable candidate found

      // Update running totals and bookkeeping
      if (pool[pickedIdx].affinityGroup === anchorGroup) {
        inGroupTotal -= pool[pickedIdx].demandScore;
      } else {
        outGroupTotal -= pool[pickedIdx].demandScore;
      }

      pickedIndices.add(pickedIdx);
      orderItems.push({ skuId: pool[pickedIdx].skuId });
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
