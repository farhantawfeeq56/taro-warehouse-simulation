// Mock simulation engine for picking strategies
// Generates plausible-looking routes and metrics without real pathfinding.

import type {
  Warehouse,
  Order,
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

// Build a mock route that snakes through the warehouse shelves
function buildMockRoute(
  warehouse: Warehouse,
  strategy: StrategyType,
  workerCount: number
): { workerRoutes: WorkerRoute[]; totalDistance: number } {
  if (!warehouse.workerStart) {
    const workers = Math.max(1, Math.min(4, workerCount));
    return {
      totalDistance: 0,
      workerRoutes: Array.from({ length: workers }, (_, i) => ({
        workerId: i + 1,
        route: [],
        picks: [],
        tasks: [],
        color: WORKER_COLORS[i % WORKER_COLORS.length],
        zone: `Worker ${i + 1} (idle)`,
        assignedPickCount: 0,
        progress: 0,
      })),
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

  return { workerRoutes, totalDistance };
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
      if (pos.y >= 0 && pos.y < warehouse.height && pos.x >= 0 && pos.x < warehouse.width) {
        heatmap[pos.y][pos.x]++;
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

  // Generate mock results for each strategy
  const strategies: StrategyType[] = ['single', 'batch', 'zone'];
  const results: StrategyResult[] = [];

  // Baseline (single) serves as reference for efficiency
  let baselineTime = 1;
  const strategyResults = new Map<StrategyType, { workerRoutes: WorkerRoute[]; totalDistance: number }>();

  for (const strategy of strategies) {
    const mockResult = buildMockRoute(warehouse, strategy, workerCount);
    strategyResults.set(strategy, mockResult);

    const workerRoutes = mockResult.workerRoutes;
    const totalDistance = Math.round(mockResult.totalDistance * warehouseProfile.scale);
    const workerDistances = workerRoutes.map(() =>
      Math.round((totalDistance / Math.max(workerRoutes.length, 1)) * warehouseProfile.scale)
    );
    const criticalPathDistance = Math.max(...workerDistances, 0);
    const workerTimes = workerRoutes.map((route, idx) =>
      calculateWorkerTimeMinutes(workerDistances[idx], route.assignedPickCount, warehouseProfile)
    );
    const timeMinutes = Math.max(...workerTimes, 0);
    const totalLaborMinutes = workerTimes.reduce((sum, m) => sum + m, 0);
    const cost = (totalLaborMinutes / 60) * laborProfile.costPerHour;

    // Scale metrics differently per strategy for visual differentiation
    let efficiency = 0;
    if (strategy === 'single') {
      baselineTime = timeMinutes || 1;
      efficiency = 0;
    } else if (strategy === 'batch') {
      efficiency = Math.round(Math.min(35 + Math.random() * 15, 45));
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
    isPartial: false,
    unresolvableItems,
    missingItemsCount: missingSkuIds.size,
    invalidLocationCount: 0,
    validationContext: finalValidationContext,
  };
}
