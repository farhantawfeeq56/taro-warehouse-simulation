// Warehouse picking simulation engine
// Real pick-path strategies using A* pathfinding.
// Single strategy: real pathfinding. Batch/Zone: mock (to be implemented).

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
      workerRoutes: idleRoutes,
      totalDistance: 0,
      workerDistances: new Array(workers).fill(0),
    };
  }

  const start = warehouse.workerStart;

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
        continue;
      }

      // Optimise the visit sequence within this order (nearest-neighbour TSP
      // from the worker's current position, which is start for the first
      // order and start again for subsequent orders).
      const visitOrder = nearestNeighborOrder(currentPos, pickTargets);

      for (const idx of visitOrder) {
        const target = pickTargets[idx];

        // A* path from current position to the target shelf cell
        const pathSegment = findPath(warehouse, currentPos, target, { neighborGraph });
        if (pathSegment.length === 0) {
          // No walkable route – skip this pick
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
      progress: 0,
    });
  }

  return { workerRoutes: allWorkerRoutes, totalDistance, workerDistances };
}

// ---------------------------------------------------------------------------
// Mock route builder (used by Batch strategy only)
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
      : `Batch Worker ${workerId}`;

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

// ---------------------------------------------------------------------------
// Zone Picking Strategy (real pathfinding)
// ---------------------------------------------------------------------------

/**
 * A rectangular zone within the warehouse grid.
 * Zones are defined by Y-row ranges so each worker owns a horizontal band.
 */
interface WarehouseZone {
  zoneId: number;       // 0-indexed
  yMin: number;         // inclusive
  yMax: number;         // inclusive
  label: string;        // display label, e.g. "Zone A"
}

/**
 * Divide the warehouse into `workerCount` roughly equal horizontal bands.
 * Every grid row belongs to exactly one zone.
 */
function defineZones(warehouse: Warehouse, workerCount: number): WarehouseZone[] {
  const workers = Math.max(1, workerCount);
  const rowsPerZone = Math.ceil(warehouse.height / workers);
  const zones: WarehouseZone[] = [];

  for (let z = 0; z < workers; z++) {
    const yMin = z * rowsPerZone;
    const yMax = Math.min((z + 1) * rowsPerZone - 1, warehouse.height - 1);
    if (yMin > yMax) break;
    zones.push({
      zoneId: z,
      yMin,
      yMax,
      label: `Zone ${String.fromCharCode(65 + z)}`,
    });
  }

  return zones;
}

/**
 * Find the zone that contains a given (x, y) pick location.
 * Returns the zoneId or -1 if the location doesn't fall into any zone.
 */
function findZoneForLocation(
  x: number,
  y: number,
  zones: WarehouseZone[]
): number {
  for (const zone of zones) {
    if (y >= zone.yMin && y <= zone.yMax) {
      return zone.zoneId;
    }
  }
  return -1;
}

/**
 * Zone Picking strategy implementation.
 *
 * Rules:
 *  - The warehouse is divided into horizontal zones (one per worker).
 *  - Each worker is assigned exactly one zone and never leaves it.
 *  - Customer orders may span multiple zones; they are split into
 *    zone-specific pick tasks.
 *  - Each worker completes only the picks belonging to their zone.
 *  - Work is grouped by warehouse location, not by order batches.
 *  - Within each zone, the visit sequence is optimised via Nearest Neighbour.
 *  - Real A* pathfinding is used between every pair of consecutive stops.
 *  - Workers start and end at the configured worker-start position.
 *
 * Unlike Single / Batch, zone-picked orders are NOT completed atomically
 * by one worker — each order may be fulfilled piecemeal by several workers
 * across different zones.
 */
function simulateZoneStrategy(
  warehouse: Warehouse,
  orders: Order[],
  workerCount: number
): {
  workerRoutes: WorkerRoute[];
  totalDistance: number;
  workerDistances: number[];
  unreachablePicks: number;
} {
  const start = warehouse.workerStart!;
  const neighborGraph = getNeighborGraph(warehouse);

  // ── 1. Define zones ───────────────────────────────────────────────────
  const zones = defineZones(warehouse, workerCount);
  const effectiveWorkers = zones.length;

  // ── 2. Resolve all order items and assign each pick location to a zone ─
  interface ZonePickTarget {
    x: number;
    y: number;
    z: number;
    sku: string;
    locationKey: string;
    orderId: string;
    zoneId: number;
  }

  const zonePickTargets: ZonePickTarget[][] = Array.from(
    { length: effectiveWorkers },
    () => []
  );

  for (const order of orders) {
    const resolved = resolveOrderToLocations(order, warehouse);

    for (const line of resolved.lines) {
      const zoneId = findZoneForLocation(line.bin.x, line.bin.y, zones);
      if (zoneId < 0 || zoneId >= effectiveWorkers) {
        // Location outside all defined zones — shouldn't happen but guard
        continue;
      }

      zonePickTargets[zoneId].push({
        x: line.bin.x,
        y: line.bin.y,
        z: line.bin.z,
        sku: line.skuId,
        locationKey: line.bin.id,
        orderId: order.id,
        zoneId,
      });
    }
  }

  // ── 3. For each zone: one worker picks all zone-specific tasks ─────────
  let totalDistance = 0;
  let totalUnreachablePicks = 0;
  const allWorkerRoutes: WorkerRoute[] = [];
  const workerDistances: number[] = [];

  for (let z = 0; z < effectiveWorkers; z++) {
    const workerId = z + 1;
    const zone = zones[z];
    const picks = zonePickTargets[z];

    if (picks.length === 0) {
      // Idle worker — nothing to pick in this zone
      allWorkerRoutes.push({
        workerId,
        route: [],
        picks: [],
        tasks: [],
        color: WORKER_COLORS[z % WORKER_COLORS.length],
        zone: `${zone.label} (idle)`,
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
    let currentPos = { x: start.x, y: start.y };

    // ── 4. Merge duplicate pick locations within the zone ──────────────
    // Same bin visited only once, but pickCount accumulates.
    const mergedPicks = new Map<
      string,
      {
        x: number;
        y: number;
        z: number;
        sku: string;
        locationKey: string;
        orderIds: Set<string>;
        pickCount: number;
      }
    >();

    for (const pick of picks) {
      const key = `${pick.x},${pick.y},${pick.z}-${pick.sku}`;
      const existing = mergedPicks.get(key);
      if (existing) {
        existing.pickCount++;
        existing.orderIds.add(pick.orderId);
      } else {
        mergedPicks.set(key, {
          x: pick.x,
          y: pick.y,
          z: pick.z,
          sku: pick.sku,
          locationKey: pick.locationKey,
          orderIds: new Set([pick.orderId]),
          pickCount: 1,
        });
      }
    }

    // ── 5. Optimise visit order (Nearest Neighbour) ────────────────────
    const pickTargets = [...mergedPicks.values()];
    const visitOrder = nearestNeighborOrder(currentPos, pickTargets);

    for (const idx of visitOrder) {
      const target = pickTargets[idx];

      // A* path from current position to the target shelf cell
      const pathSegment = findPath(warehouse, currentPos, target, { neighborGraph });
      if (pathSegment.length === 0) {
        // No walkable route — count and skip this pick
        totalUnreachablePicks++;
        continue;
      }

      const segmentDistance = calculatePathDistance(pathSegment);
      workerDistance += segmentDistance;

      // Append to the full route (skip first vertex to avoid duplication)
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

      // Create one task per order being fulfilled from this bin
      for (const orderId of target.orderIds) {
        allTasks.push({
          workerId,
          step: step++,
          zone: zone.label,
          location: `${target.x},${target.y}`,
          sku: `${target.sku} (Order ${orderId})`,
        });
      }

      currentPos = { x: target.x, y: target.y };
    }

    // ── 6. Return to worker start ──────────────────────────────────────
    const returnPath = findPath(warehouse, currentPos, start, { neighborGraph });
    if (returnPath.length > 1) {
      workerDistance += calculatePathDistance(returnPath);
      fullRoute.push(...returnPath.slice(1));
    }

    totalDistance += workerDistance;
    workerDistances.push(workerDistance);

    allWorkerRoutes.push({
      workerId,
      route: fullRoute,
      picks: allPicks,
      tasks: allTasks,
      color: WORKER_COLORS[z % WORKER_COLORS.length],
      zone: zone.label,
      assignedPickCount: allPicks.reduce((sum, p) => sum + (p.pickCount ?? 1), 0),
      progress: 1,
    });
  }

  return {
    workerRoutes: allWorkerRoutes,
    totalDistance,
    workerDistances,
    unreachablePicks: totalUnreachablePicks,
  };
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
      unreachablePicks?: number;
    };

    if (strategy === 'single') {
      // --- Real single-order-picking simulation ---
      routeResult = simulateSingleStrategy(warehouse, orders, workerCount);
    } else if (strategy === 'zone') {
      // --- Real zone-picking simulation ---
      routeResult = simulateZoneStrategy(warehouse, orders, workerCount);
    } else {
      // --- Mock (Batch will be implemented later) ---
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

    // Efficiency: single is the baseline (0%). Zone uses real results.
    // Batch is still mock and uses placeholder random efficiency.
    let efficiency = 0;
    if (strategy === 'single') {
      baselineTime = timeMinutes || 1;
      efficiency = 0;
    } else if (strategy === 'zone') {
      // Real efficiency: time saved vs. single-order baseline
      efficiency = baselineTime > 0
        ? Math.round(((baselineTime - timeMinutes) / baselineTime) * 100)
        : 0;
    } else if (strategy === 'batch') {
      efficiency = Math.round(Math.min(35 + Math.random() * 15, 45));
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
      unreachablePicks: routeResult.unreachablePicks ?? 0,
    });
  }

  // Determine "best" strategy (zone always wins in mock since it has highest efficiency)
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
    isPartial: results.some(r => r.unreachablePicks > 0) || missingSkuIds.size > 0,
    unresolvableItems,
    missingItemsCount: missingSkuIds.size,
    invalidLocationCount: 0,
    validationContext: finalValidationContext,
  };
}
