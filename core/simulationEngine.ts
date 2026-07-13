// Warehouse picking simulation engine
// Real pick-path strategies using A* pathfinding.
// Single Order: real pathfinding. Batch: real pathfinding. Zone: mock (to be implemented).

import type {
  Warehouse,
  Order,
  PickTask,
  StrategyResult,
  SimulationResults,
  StrategyType,
  WorkerRoute,
  SimulationProfiles,
  WarehouseProfile,
  LaborProfile,
  SimulationValidationContext,
  OrderValidationResult,
} from '../lib/taro/types';
import {
  STRATEGY_COLORS,
  STRATEGY_NAMES,
  WORKER_COLORS,
  DEFAULT_WAREHOUSE_PROFILE,
  DEFAULT_LABOR_PROFILE,
} from '../lib/taro/constants';
import { assertWarehouseInvariants } from '../lib/taro/inventory';
import { findPath, calculatePathDistance, getNeighborGraph } from '../lib/taro/pathfinding';
import { calculateOctileDistance } from '../lib/taro/distance';
import { resolveOrderToLocations } from '../lib/taro/order-location-resolver';

export class UnreachableLocationError extends Error {
  constructor(
    message: string,
    public readonly location: { x: number; y: number }
  ) {
    super(message);
    this.name = 'UnreachableLocationError';
  }
}

// Generate a stable location key for StorageLocation
export function getLocationKey(x: number, y: number, z: number, sku: string): string {
  return `${x},${y},${z}-${sku}`;
}

// Parse location key back to components
export function parseLocationKey(key: string): { x: number; y: number; z: number; sku: string } | null {
  const match = key.match(/^(-?\d+),(-?\d+),(\d+)-(.+)$/);
  if (!match) return null;
  return {
    x: parseInt(match[1], 10),
    y: parseInt(match[2], 10),
    z: parseInt(match[3], 10),
    sku: match[4],
  };
}

// ---------------------------------------------------------------------------
// Single Order Picking Strategy (real pathfinding)
// ---------------------------------------------------------------------------

/**
 * Nearest Neighbour heuristic for ordering pick locations within a single
 * order.  Given a starting position, it greedily picks the closest unvisited
 * location at each step.  This is not an exact TSP solver, but it is fast
 * and yields reasonable visit sequences for typical order sizes (5–10 items).
 *
 * @returns indices into `points` in visit order.
 */
function nearestNeighborOrder(
  start: { x: number; y: number },
  points: { x: number; y: number }[]
): number[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [0];

  const remaining = new Set(points.map((_, i) => i));
  const order: number[] = [];
  let current = start;

  while (remaining.size > 0) {
    let bestIdx = -1;
    let bestDist = Infinity;

    for (const idx of remaining) {
      const dist = calculateOctileDistance(current, points[idx]);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    }

    order.push(bestIdx);
    current = points[bestIdx];
    remaining.delete(bestIdx);
  }

  return order;
}

/**
 * Single Order Picking strategy implementation.
 *
 * Rules:
 *  - One worker picks one order at a time.
 *  - Worker starts from the configured start location.
 *  - Collects every item in the order (visit sequence optimised via nearest
 *    neighbour).
 *  - Returns to start after completing the order.
 *  - Only then begins the next order.
 *  - Orders are never merged.
 *  - Orders are distributed round-robin across N workers.
 *
 * Uses real A* pathfinding between every pair of consecutive stops.
 */
function simulateSingleStrategy(
  warehouse: Warehouse,
  orders: Order[],
  workerCount: number
): { workerRoutes: WorkerRoute[]; totalDistance: number; workerDistances: number[]; completedOrders: number; skippedOrders: number; unreachablePicks: number } {
  const workers = Math.max(1, workerCount);
  const start = warehouse.workerStart!;
  let skippedOrdersCount = 0;
  let unreachablePickCount = 0;
  let completedOrdersCount = 0;

  // Distribute orders round-robin across workers
  const workerOrders: Order[][] = Array.from({ length: workers }, () => []);
  for (let i = 0; i < orders.length; i++) {
    workerOrders[i % workers].push(orders[i]);
  }

  // Build the neighbour graph once – reused across all pathfinding calls
  const neighborGraph = getNeighborGraph(warehouse);

  const allWorkerRoutes: WorkerRoute[] = [];
  const workerDistances: number[] = [];
  let totalDistance = 0;

  for (let w = 0; w < workers; w++) {
    const workerId = w + 1;
    const assignedOrders = workerOrders[w];

    if (assignedOrders.length === 0) {
      allWorkerRoutes.push({
        workerId,
        route: [],
        picks: [],
        tasks: [],
        color: WORKER_COLORS[w % WORKER_COLORS.length],
        zone: `Worker ${workerId} (idle)`,
        assignedPickCount: 0,
        progress: 0,
      });
      workerDistances.push(0);
      continue;
    }

    // Full route array (grid coords) and pick/task lists for this worker
    const fullRoute: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    const allPicks: WorkerRoute['picks'] = [];
    const allTasks: PickTask[] = [];
    let step = 1;
    let workerDistance = 0;

    // Worker always starts from the configured start position.  After each
    // order they return to start, so `currentPos` is reset to start at the
    // beginning of every order.
    let currentPos = { x: start.x, y: start.y };

    for (const order of assignedOrders) {
      // Resolve order items to their warehouse bin locations
      const resolved = resolveOrderToLocations(order, warehouse);

      // Build the list of pick targets (only lines with resolved bins)
      const pickTargets = resolved.lines.map((line) => ({
        x: line.bin.x,
        y: line.bin.y,
        z: line.bin.z,
        sku: line.skuId,
        locationKey: line.bin.id,
      }));

      if (pickTargets.length === 0) {
        // All SKUs in this order are missing – skip it entirely
        skippedOrdersCount++;
        continue;
      }

      // Optimise the visit sequence within this order (nearest-neighbour TSP
      // from the worker's current position, which is start for the first
      // order and start again for subsequent orders).
      let picksMadeInOrder = 0;
      const visitOrder = nearestNeighborOrder(currentPos, pickTargets);

      for (const idx of visitOrder) {
        const target = pickTargets[idx];

        // A* path from current position to the target shelf cell
        const pathSegment = findPath(warehouse, currentPos, target, { neighborGraph });
        if (pathSegment.length === 0) {
          // No walkable route – skip this pick
          unreachablePickCount++;
          continue;
        }

        const segmentDistance = calculatePathDistance(pathSegment);
        workerDistance += segmentDistance;

        // Append to the full route (skip the first vertex to avoid
        // duplication with the previous segment's last vertex).
        fullRoute.push(...pathSegment.slice(1));

        // Record the pick event
        allPicks.push({
          locationKey: target.locationKey,
          x: target.x,
          y: target.y,
          z: target.z,
          sku: target.sku,
          pickCount: 1,
        });
        allTasks.push({
          workerId,
          step: step++,
          zone: `Worker ${workerId}`,
          location: `${target.x},${target.y}`,
          sku: target.sku,
        });

        currentPos = { x: target.x, y: target.y };
        picksMadeInOrder++;
      }

      // Determine whether this order was completed or skipped
      if (picksMadeInOrder > 0) {
        completedOrdersCount++;
      } else {
        skippedOrdersCount++;
      }

      // After the last pick, the worker returns to the start location.
      // This completes the current order.
      const returnPath = findPath(warehouse, currentPos, start, { neighborGraph });
      if (returnPath.length > 1) {
        workerDistance += calculatePathDistance(returnPath);
        fullRoute.push(...returnPath.slice(1));
      }
      // Reset position to start for the next order
      currentPos = { x: start.x, y: start.y };
    }

    totalDistance += workerDistance;
    workerDistances.push(workerDistance);

    allWorkerRoutes.push({
      workerId,
      route: fullRoute,
      picks: allPicks,
      tasks: allTasks,
      color: WORKER_COLORS[w % WORKER_COLORS.length],
      zone: `Worker ${workerId} (Single)`,
      assignedPickCount: allPicks.length,
      progress: 1,
    });
  }

  return {
    workerRoutes: allWorkerRoutes,
    totalDistance,
    workerDistances,
    completedOrders: completedOrdersCount,
    skippedOrders: skippedOrdersCount,
    unreachablePicks: unreachablePickCount,
  };
}

// ---------------------------------------------------------------------------
// Mock route builder (used by Zone strategy only)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Batch Picking Strategy (real pathfinding)
// ---------------------------------------------------------------------------

/**
 * Batch Picking strategy implementation.
 *
 * Rules:
 *  - Multiple customer orders are grouped into batches (configurable batchSize).
 *  - Each batch is one work unit.
 *  - A worker completes one batch at a time.
 *  - Worker starts at the configured start location.
 *  - Picks every item in that batch (all orders merged).
 *  - Returns to worker start after completing the batch.
 *  - Only then begins the next assigned batch.
 *  - Orders are merged only within a batch; orders from different batches
 *    are never merged.
 *  - Batches are assigned to workers round-robin.
 *  - Workers never share the same batch.
 *
 * Uses real A* pathfinding between every pair of consecutive stops.
 * Duplicate pick locations within a batch (same bin) are merged into a single
 * visit with an accumulated pickCount.
 */
function simulateBatchStrategy(
  warehouse: Warehouse,
  orders: Order[],
  workerCount: number,
  batchSize: number
): { workerRoutes: WorkerRoute[]; totalDistance: number; workerDistances: number[]; completedOrders: number; skippedOrders: number; unreachablePicks: number } {
  const workers = Math.max(1, workerCount);
  const start = warehouse.workerStart!;
  const effectiveBatchSize = Math.max(1, batchSize);

  let completedOrdersCount = 0;
  let skippedOrdersCount = 0;
  let unreachablePickCount = 0;

  // ── 1. Form batches ─────────────────────────────────────────────────
  const batches: { batchId: number; orders: Order[] }[] = [];
  for (let i = 0; i < orders.length; i += effectiveBatchSize) {
    batches.push({
      batchId: batches.length + 1,
      orders: orders.slice(i, i + effectiveBatchSize),
    });
  }

  // ── 2. Assign batches to workers (round-robin) ──────────────────────
  const workerBatches: { batchId: number; orders: Order[] }[][] = Array.from(
    { length: workers },
    () => []
  );
  for (let i = 0; i < batches.length; i++) {
    workerBatches[i % workers].push(batches[i]);
  }

  // ── 3. Build neighbour graph once ───────────────────────────────────
  const neighborGraph = getNeighborGraph(warehouse);

  const allWorkerRoutes: WorkerRoute[] = [];
  const workerDistances: number[] = [];
  let totalDistance = 0;

  for (let w = 0; w < workers; w++) {
    const workerId = w + 1;
    const assignedBatches = workerBatches[w];

    if (assignedBatches.length === 0) {
      allWorkerRoutes.push({
        workerId,
        route: [],
        picks: [],
        tasks: [],
        color: WORKER_COLORS[w % WORKER_COLORS.length],
        zone: `Worker ${workerId} (idle)`,
        assignedPickCount: 0,
        progress: 0,
      });
      workerDistances.push(0);
      continue;
    }

    const fullRoute: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    const allPicks: WorkerRoute['picks'] = [];
    const allTasks: PickTask[] = [];
    let step = 1;
    let workerDistance = 0;

    // Worker starts from the configured start position at the beginning of
    // every batch.
    let currentPos = { x: start.x, y: start.y };

    for (const batch of assignedBatches) {
      // ── 4. Resolve all items from all orders in this batch ──────────
      const allResolvedLines: { skuId: string; x: number; y: number; z: number; locationKey: string }[] = [];
      let batchOrdersCompleted = 0;
      let batchOrdersSkipped = 0;

      for (const order of batch.orders) {
        const resolved = resolveOrderToLocations(order, warehouse);
        let orderHasPicks = false;
        for (const line of resolved.lines) {
          allResolvedLines.push({
            skuId: line.skuId,
            x: line.bin.x,
            y: line.bin.y,
            z: line.bin.z,
            locationKey: line.bin.id,
          });
          orderHasPicks = true;
        }
        if (orderHasPicks) {
          batchOrdersCompleted++;
        } else {
          batchOrdersSkipped++;
        }
      }

      completedOrdersCount += batchOrdersCompleted;
      skippedOrdersCount += batchOrdersSkipped;

      if (allResolvedLines.length === 0) {
        // All SKUs in this batch are missing — skip the batch entirely.
        // Worker returns to start (already there, nothing to do).
        continue;
      }

      // ── 5. Merge duplicate pick locations ───────────────────────────
      // Same bin (x, y, z, sku) visited only once, but pickCount accumulates.
      const mergedPicks = new Map<
        string,
        { x: number; y: number; z: number; sku: string; locationKey: string; pickCount: number }
      >();
      for (const line of allResolvedLines) {
        // Key: bin coordinates + SKU — unique pick location.
        const key = `${line.x},${line.y},${line.z}-${line.skuId}`;
        const existing = mergedPicks.get(key);
        if (existing) {
          existing.pickCount++;
        } else {
          mergedPicks.set(key, {
            x: line.x,
            y: line.y,
            z: line.z,
            sku: line.skuId,
            locationKey: line.locationKey,
            pickCount: 1,
          });
        }
      }

      // ── 6. Optimise visit order (Nearest Neighbour) ─────────────────
      const pickTargets = [...mergedPicks.values()];
      const visitOrder = nearestNeighborOrder(currentPos, pickTargets);

      for (const idx of visitOrder) {
        const target = pickTargets[idx];

        // A* path from current position to the target shelf cell
        const pathSegment = findPath(warehouse, currentPos, target, { neighborGraph });
        if (pathSegment.length === 0) {
          unreachablePickCount++;
          continue;
        }

        const segmentDistance = calculatePathDistance(pathSegment);
        workerDistance += segmentDistance;

        // Append to the full route (skip the first vertex to avoid
        // duplication with the previous segment's last vertex).
        fullRoute.push(...pathSegment.slice(1));

        // Record the pick event
        allPicks.push({
          locationKey: target.locationKey,
          x: target.x,
          y: target.y,
          z: target.z,
          sku: target.sku,
          pickCount: target.pickCount,
        });
        allTasks.push({
          workerId,
          step: step++,
          zone: `Worker ${workerId} (Batch ${batch.batchId})`,
          location: `${target.x},${target.y}`,
          sku: target.sku,
        });

        currentPos = { x: target.x, y: target.y };
      }

      // ── 7. Return to worker start after completing the batch ────────
      const returnPath = findPath(warehouse, currentPos, start, { neighborGraph });
      if (returnPath.length > 1) {
        workerDistance += calculatePathDistance(returnPath);
        fullRoute.push(...returnPath.slice(1));
      }
      // Reset position to start for the next batch
      currentPos = { x: start.x, y: start.y };
    }

    totalDistance += workerDistance;
    workerDistances.push(workerDistance);

    allWorkerRoutes.push({
      workerId,
      route: fullRoute,
      picks: allPicks,
      tasks: allTasks,
      color: WORKER_COLORS[w % WORKER_COLORS.length],
      zone: `Worker ${workerId} (Batch)`,
      assignedPickCount: allPicks.length,
      progress: 1,
    });
  }

  return {
    workerRoutes: allWorkerRoutes,
    totalDistance,
    workerDistances,
    completedOrders: completedOrdersCount,
    skippedOrders: skippedOrdersCount,
    unreachablePicks: unreachablePickCount,
  };
}

// ---------------------------------------------------------------------------
// Mock route builder (used by Zone strategy only)
// ---------------------------------------------------------------------------

// Build a mock route that snakes through the warehouse shelves
function buildMockRoute(
  warehouse: Warehouse,
  strategy: StrategyType,
  workerCount: number
): { workerRoutes: WorkerRoute[]; totalDistance: number; workerDistances: number[] } {
  const workers = Math.max(1, Math.min(4, workerCount));

  if (!warehouse.workerStart) {
    const idleRoutes = Array.from({ length: workers }, (_, i) => ({
      workerId: i + 1,
      route: [],
      picks: [],
      tasks: [],
      color: WORKER_COLORS[i % WORKER_COLORS.length],
      zone: `Worker ${i + 1} (idle)`,
      assignedPickCount: 0,
      progress: 0,
    }));
    return {
      totalDistance: 0,
      workerRoutes: idleRoutes,
      workerDistances: new Array(workers).fill(0),
    };
  }

  const start = warehouse.workerStart;
  const numWorkers = Math.max(1, Math.min(4, workerCount));
  const workerRoutes: WorkerRoute[] = [];
  let totalDistance = 0;

  // Collect all shelf positions
  const shelfCells: { x: number; y: number; skus: string[] }[] = [];
  for (const row of warehouse.grid) {
    for (const cell of row) {
      if (cell.type === 'shelf' && cell.locations.length > 0) {
        shelfCells.push({
          x: cell.x,
          y: cell.y,
          skus: cell.locations.map(l => l.sku),
        });
      }
    }
  }

  // Sort shelves in a snake pattern (row by row, alternating direction)
  const sortedShelves = [...shelfCells].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.y % 2 === 0 ? a.x - b.x : b.x - a.x;
  });

  // Split shelves among workers
  const shelvesPerWorker = Math.max(1, Math.ceil(sortedShelves.length / numWorkers));

  for (let w = 0; w < numWorkers; w++) {
    const workerId = w + 1;
    const workerShelves = sortedShelves.slice(w * shelvesPerWorker, (w + 1) * shelvesPerWorker);

    if (workerShelves.length === 0) {
      workerRoutes.push({
        workerId,
        route: [],
        picks: [],
        tasks: [],
        color: WORKER_COLORS[w % WORKER_COLORS.length],
        zone: `Worker ${workerId} (idle)`,
        assignedPickCount: 0,
        progress: 0,
      });
      continue;
    }

    // Build route: start → shelf stops → return to start
    const route: { x: number; y: number }[] = [{ x: start.x, y: start.y }];
    const picks: WorkerRoute['picks'] = [];
    const tasks: WorkerRoute['tasks'] = [];
    let step = 1;

    // Add a slight horizontal offset per worker so routes don't overlap exactly
    const offset = w * 0.3;

    // Add intermediate points to create smooth-looking paths
    for (let i = 0; i < workerShelves.length; i++) {
      const shelf = workerShelves[i];
      const midX = (route[route.length - 1].x + shelf.x) / 2 + offset;
      route.push({ x: Math.round(midX), y: route[route.length - 1].y });
      route.push({ x: shelf.x + offset, y: shelf.y + offset });

      for (const sku of shelf.skus) {
        picks.push({
          locationKey: `${shelf.x},${shelf.y},1-${sku}`,
          x: shelf.x,
          y: shelf.y,
          z: 1,
          sku,
          pickCount: 1,
        });
        tasks.push({
          workerId,
          step: step++,
          zone: `Worker ${workerId}`,
          location: `${shelf.x},${shelf.y}`,
          sku,
        });
      }
    }

    // Return to start
    route.push({ x: start.x + offset, y: start.y });

    const zoneLabel = strategy === 'single'
      ? `Single Worker ${workerId}`
      : strategy === 'batch'
        ? `Batch Worker ${workerId}`
        : `Zone ${String.fromCharCode(64 + workerId)}`;

    const distance = calculateMockDistance(route);
    totalDistance += distance;

    workerRoutes.push({
      workerId,
      route,
      picks,
      tasks,
      color: WORKER_COLORS[w % WORKER_COLORS.length],
      zone: zoneLabel,
      assignedPickCount: picks.length,
      progress: 0,
    });
  }

  const workerDistances = workerRoutes.map(
    () => totalDistance / Math.max(workerRoutes.filter(r => r.assignedPickCount > 0).length, 1)
  );
  return { workerRoutes, totalDistance, workerDistances };
}

function calculateMockDistance(route: { x: number; y: number }[]): number {
  let distance = 0;
  for (let i = 1; i < route.length; i++) {
    const dx = route[i].x - route[i - 1].x;
    const dy = route[i].y - route[i - 1].y;
    distance += Math.sqrt(dx * dx + dy * dy);
  }
  return distance;
}

export function buildRouteFrequencyHeatmap(
  warehouse: Warehouse,
  routes: { x: number; y: number }[][]
): number[][] {
  const heatmap: number[][] = Array(warehouse.height)
    .fill(null)
    .map(() => Array(warehouse.width).fill(0));

  for (const route of routes) {
    for (const pos of route) {
      // Round to nearest integer – mock routes may include fractional offsets
      const rx = Math.round(pos.x);
      const ry = Math.round(pos.y);
      if (ry >= 0 && ry < warehouse.height && rx >= 0 && rx < warehouse.width) {
        heatmap[ry][rx]++;
      }
    }
  }

  return heatmap;
}

function resolveWarehouseProfile(profile?: Partial<WarehouseProfile>): WarehouseProfile {
  return {
    scale: profile?.scale ?? DEFAULT_WAREHOUSE_PROFILE.scale,
    workerSpeed: profile?.workerSpeed ?? DEFAULT_WAREHOUSE_PROFILE.workerSpeed,
    pickTimePerItem: profile?.pickTimePerItem ?? DEFAULT_WAREHOUSE_PROFILE.pickTimePerItem,
  };
}

function resolveLaborProfile(profile?: Partial<LaborProfile>): LaborProfile {
  return {
    costPerHour: profile?.costPerHour ?? DEFAULT_LABOR_PROFILE.costPerHour,
  };
}

function calculateWorkerTimeMinutes(
  distanceMeters: number,
  assignedPickCount: number,
  warehouseProfile: WarehouseProfile
): number {
  const walkingTimeMinutes = distanceMeters / warehouseProfile.workerSpeed;
  const pickingTimeMinutes = (assignedPickCount * warehouseProfile.pickTimePerItem) / 60;
  return walkingTimeMinutes + pickingTimeMinutes;
}

// Safely resolve order SKUs - just checks existence, no pathfinding needed
function safelyResolveOrderLocations(
  orders: Order[],
  warehouse: Warehouse
): { missingSkuIds: Set<string> } {
  assertWarehouseInvariants(warehouse);

  const skuBinMap = new Map<string, string>();
  for (const row of warehouse.grid) {
    for (const cell of row) {
      for (const bin of cell.locations) {
        const existing = skuBinMap.get(bin.sku);
        if (!existing || bin.primary) {
          skuBinMap.set(bin.sku, bin.id);
        }
      }
    }
  }

  const missingSkuIds = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!skuBinMap.has(item.skuId)) {
        missingSkuIds.add(item.skuId);
      }
    }
  }

  return { missingSkuIds };
}

// ---------------------------------------------------------------------------
// Main simulation entry point
// ---------------------------------------------------------------------------

export function runSimulation(
  warehouse: Warehouse,
  orders: Order[],
  workerCount: number = 2,
  profiles: SimulationProfiles = {},
  validationContext?: SimulationValidationContext
): SimulationResults {
  // Sanity check
  if (!warehouse.workerStart || orders.length === 0) {
    throw new Error('Simulation requirements not met: Worker start position and orders are required.');
  }

  const warehouseProfile = resolveWarehouseProfile(profiles.warehouseProfile);
  const laborProfile = resolveLaborProfile(profiles.laborProfile);

  // Resolve order locations to check for missing items
  const { missingSkuIds } = safelyResolveOrderLocations(orders, warehouse);

  const unresolvableSkuIds = new Set([...missingSkuIds]);

  // Pre-validation: refuse to run if any order item cannot be resolved
  // to a warehouse location, unless the caller explicitly opts into partial
  // execution via allowPartial.
  if (!profiles.allowPartial && unresolvableSkuIds.size > 0) {
    for (const order of orders) {
      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        if (unresolvableSkuIds.has(item.skuId)) {
          throw new Error(
            `Order "${order.id}" references unknown skuId "${item.skuId}" at index ${i}. The item cannot be resolved.`
          );
        }
      }
    }
  }

  // Build validation context for missing items
  let finalValidationContext = validationContext;
  if (unresolvableSkuIds.size > 0) {
    const missingItemsByOrder: OrderValidationResult[] = [];
    for (const order of orders) {
      const orderInvalidItems = order.items
        .filter(item => unresolvableSkuIds.has(item.skuId))
        .map(item => item.skuId);
      if (orderInvalidItems.length > 0) {
        missingItemsByOrder.push({ orderId: order.id, missingSkuIds: orderInvalidItems });
      }
    }
    if (missingItemsByOrder.length > 0) {
      finalValidationContext = {
        totalItems: orders.reduce((sum, o) => sum + o.items.length, 0),
        missingItems: unresolvableSkuIds.size,
        affectedOrders: missingItemsByOrder.length,
        missingItemsByOrder,
      };
    }
  }

  // Generate results for each strategy
  const strategies: StrategyType[] = ['single', 'batch', 'zone'];
  const results: StrategyResult[] = [];

  // Baseline (single) serves as reference for efficiency
  let baselineTime = 1;

  for (const strategy of strategies) {
    let routeResult: {
      workerRoutes: WorkerRoute[];
      totalDistance: number;
      workerDistances: number[];
      completedOrders?: number;
      skippedOrders?: number;
      unreachablePicks?: number;
    };

    if (strategy === 'single') {
      // --- Real single-order-picking simulation ---
      routeResult = simulateSingleStrategy(warehouse, orders, workerCount);
    } else if (strategy === 'batch') {
      // --- Real batch-picking simulation ---
      const batchSize = profiles.batchSize ?? 5;
      routeResult = simulateBatchStrategy(warehouse, orders, workerCount, batchSize);
    } else {
      // --- Mock (Zone will be implemented later) ---
      routeResult = buildMockRoute(warehouse, strategy, workerCount);
    }

    const workerRoutes = routeResult.workerRoutes;

    // Scale distances from raw grid units to meters
    const totalDistance = Math.round(routeResult.totalDistance * warehouseProfile.scale);
    const scaledWorkerDistances = routeResult.workerDistances.map(
      d => Math.round(d * warehouseProfile.scale)
    );

    const criticalPathDistance = Math.max(...scaledWorkerDistances, 0);
    const workerTimes = workerRoutes.map((route, idx) =>
      calculateWorkerTimeMinutes(scaledWorkerDistances[idx], route.assignedPickCount, warehouseProfile)
    );
    const timeMinutes = Math.max(...workerTimes, 0);
    const totalLaborMinutes = workerTimes.reduce((sum, m) => sum + m, 0);
    const cost = (totalLaborMinutes / 60) * laborProfile.costPerHour;

    // Efficiency: single is the baseline (0%). Batch uses real results. Zone is still mock.
    let efficiency = 0;
    if (strategy === 'single') {
      baselineTime = timeMinutes || 1;
      efficiency = 0;
    } else if (strategy === 'batch') {
      // Real efficiency: time saved vs. single-order baseline
      efficiency = baselineTime > 0
        ? Math.round(((baselineTime - timeMinutes) / baselineTime) * 100)
        : 0;
    } else if (strategy === 'zone') {
      efficiency = Math.round(Math.min(45 + Math.random() * 20, 60));
    }

    const activeWorkers = workerRoutes.filter(r => r.assignedPickCount > 0).length;
    const utilization = workerRoutes.length > 0
      ? Math.round((activeWorkers / workerRoutes.length) * 100)
      : 0;

    results.push({
      strategy,
      strategyName: STRATEGY_NAMES[strategy],
      distance: totalDistance,
      totalDistance,
      criticalPathDistance,
      estimatedTime: Math.round(timeMinutes * 10) / 10,
      efficiency,
      workerUtilization: Math.round(utilization),
      costPerOrder: Math.round((cost / Math.max(orders.length, 1)) * 100) / 100,
      route: workerRoutes.flatMap(r => r.route),
      color: STRATEGY_COLORS[strategy],
      workerRoutes,
      ordersCompleted: routeResult.completedOrders ?? orders.length,
      ordersSkipped: routeResult.skippedOrders ?? 0,
      unreachablePicks: routeResult.unreachablePicks ?? 0,
    });
  }

  // Determine "best" strategy (by efficiency). Zone is still mock, so batch
  // or single may be more accurate in practice.
  const bestStrategy = results
    .filter(r => r.strategy !== 'single')
    .sort((a, b) => b.efficiency - a.efficiency)[0]?.strategy ?? 'zone';

  const bestStrategyResult = results.find(r => r.strategy === bestStrategy) ?? results[0];
  const bestStrategyRoutes =
    bestStrategyResult.workerRoutes.length > 0
      ? bestStrategyResult.workerRoutes.map(wr => wr.route)
      : [bestStrategyResult.route];

  const unresolvableItems = [...new Set(finalValidationContext?.missingItemsByOrder.flatMap(o => o.missingSkuIds) ?? [])];

  return {
    strategies: results,
    heatmap: buildRouteFrequencyHeatmap(warehouse, bestStrategyRoutes),
    bestStrategy,
    isPartial: missingSkuIds.size > 0 || results.some(r => r.unreachablePicks > 0),
    unresolvableItems,
    missingItemsCount: missingSkuIds.size,
    invalidLocationCount: 0,
    validationContext: finalValidationContext,
  };
}
