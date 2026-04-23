// Simulation engine for picking strategies

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
} from './types';
import { findPath, calculatePathDistance } from './pathfinding';
import { calculateOctileDistance } from './distance';
import { safelyResolveOrderLocations, type ResolvedOrder } from './validation';
import {
  STRATEGY_COLORS,
  STRATEGY_NAMES,
  WORKER_COLORS,
  DEFAULT_WAREHOUSE_PROFILE,
  DEFAULT_LABOR_PROFILE,
} from './constants';

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

function getAllPickableLocations(warehouse: Warehouse): Map<string, { x: number; y: number; z: number; sku: string }> {
  const locationMap = new Map<string, { x: number; y: number; z: number; sku: string }>();

  for (const location of warehouse.locations) {
    if (location.items.length === 0) continue;
    locationMap.set(location.id, {
      x: location.x,
      y: location.y,
      z: location.z,
      sku: location.items[0],
    });
  }

  return locationMap;
}

// Strategy allocation functions (extracted for maintainability)

function roundRobinAllocation(itemKeys: string[], numWorkers: number): Map<number, string[]> {
  const workerBuckets = new Map<number, string[]>();
  for (let i = 1; i <= numWorkers; i++) {
    workerBuckets.set(i, []);
  }

  itemKeys.forEach((key, i) => {
    const workerId = (i % numWorkers) + 1;
    workerBuckets.get(workerId)!.push(key);
  });

  return workerBuckets;
}

function bucketStopsRoundRobin(stops: PickStop[], numWorkers: number): PickStop[][] {
  const buckets: PickStop[][] = Array.from({ length: numWorkers }, () => []);
  stops.forEach((stop, index) => {
    buckets[index % numWorkers].push(stop);
  });
  return buckets;
}

interface PickStop {
  key: string;
  pos: { x: number; y: number; z: number; sku: string };
  pickCount: number;
}

interface WorkUnit {
  zoneLabel: string;
  stops: PickStop[];
}

function dedupeLocationsByFirstSeen(
  orders: ResolvedOrder[],
  allLocations: Map<string, { x: number; y: number; z: number; sku: string }>
): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const order of orders) {
    for (const locationId of order.locations) {
      if (!allLocations.has(locationId) || seen.has(locationId)) continue;
      seen.add(locationId);
      deduped.push(locationId);
    }
  }
  return deduped;
}

function countLocationPickDemand(
  orders: ResolvedOrder[],
  allLocations: Map<string, { x: number; y: number; z: number; sku: string }>
): Map<string, number> {
  const pickCounts = new Map<string, number>();
  for (const order of orders) {
    for (const locationId of order.locations) {
      if (!allLocations.has(locationId)) continue;
      pickCounts.set(locationId, (pickCounts.get(locationId) ?? 0) + 1);
    }
  }
  return pickCounts;
}

function orderStopsNearestNeighbor(
  start: { x: number; y: number },
  stops: PickStop[]
): typeof stops {
  const unvisited = [...stops];
  const orderedStops: typeof stops = [];
  let current = start;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < unvisited.length; i++) {
      const candidate = unvisited[i];
      const distance = calculateOctileDistance(candidate.pos, current);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    const [nearestStop] = unvisited.splice(nearestIndex, 1);
    orderedStops.push(nearestStop);
    current = nearestStop.pos;
  }

  return orderedStops;
}

function optimizeRoute2Opt(
  start: { x: number; y: number },
  stops: PickStop[]
): typeof stops {
  if (stops.length < 3) return stops;

  const routeDistance = (route: typeof stops) => {
    let total = 0;
    let previous = start;
    for (const stop of route) {
      total += calculateOctileDistance(previous, stop.pos);
      previous = stop.pos;
    }
    return total;
  };

  let improved = true;
  let bestRoute = [...stops];

  while (improved) {
    improved = false;
    for (let i = 0; i < bestRoute.length - 1; i++) {
      for (let j = i + 1; j < bestRoute.length; j++) {
        const candidateRoute = [
          ...bestRoute.slice(0, i),
          ...bestRoute.slice(i, j + 1).reverse(),
          ...bestRoute.slice(j + 1),
        ];

        if (routeDistance(candidateRoute) < routeDistance(bestRoute)) {
          bestRoute = candidateRoute;
          improved = true;
        }
      }
    }
  }

  return bestRoute;
}

function buildRouteForStops(
  warehouse: Warehouse,
  start: { x: number; y: number },
  stops: PickStop[],
  context: {
    strategy: StrategyType;
    workerId: number;
    unitLabel: string;
  }
): { route: { x: number; y: number }[]; distance: number; orderedStops: PickStop[] } {
  if (stops.length === 0) return { route: [], distance: 0, orderedStops: [] };

  const initial = orderStopsNearestNeighbor(start, stops);
  const orderedStops = optimizeRoute2Opt(start, initial);

  const route: { x: number; y: number }[] = [];
  let distance = 0;
  let current = start;

  for (const stop of orderedStops) {
    const leg = findPath(warehouse, current, stop.pos);
    if (leg.length === 0) {
      throw new Error(
        `Pathfinding failed for pick leg: strategy=${context.strategy}, worker=${context.workerId}, unit=${context.unitLabel}, from=(${current.x},${current.y}), to=(${stop.pos.x},${stop.pos.y})`
      );
    }
    route.push(...leg);
    const legDistance = calculatePathDistance(leg);
    distance += legDistance;
    current = stop.pos;
  }

  const returnLeg = findPath(warehouse, current, start);
  if (returnLeg.length === 0) {
    throw new Error(
      `Pathfinding failed for return leg: strategy=${context.strategy}, worker=${context.workerId}, unit=${context.unitLabel}, from=(${current.x},${current.y}), to=(${start.x},${start.y})`
    );
  }
  route.push(...returnLeg);
  const returnDistance = calculatePathDistance(returnLeg);
  distance += returnDistance;

  return { route, distance, orderedStops };
}

function simulateStrategy(
  strategy: StrategyType,
  warehouse: Warehouse,
  orders: ResolvedOrder[],
  workerCount: number
): { route: { x: number; y: number }[]; distance: number; workerRoutes: WorkerRoute[]; workerDistances: number[] } {
  if (!warehouse.workerStart || orders.length === 0) {
    const workers = Math.max(1, Math.min(4, workerCount));
    return {
      route: [],
      distance: 0,
      workerDistances: Array.from({ length: workers }, () => 0),
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

  const allLocations = getAllPickableLocations(warehouse);
  const start = warehouse.workerStart;
  const numWorkers = Math.max(1, Math.min(4, workerCount));
  const units: WorkUnit[] = [];

  if (strategy === 'single') {
    orders.forEach((order, index) => {
      const stops = order.locations
        .map((locationId) => ({ key: locationId, pos: allLocations.get(locationId), pickCount: 1 }))
        .filter((item): item is PickStop => item.pos !== undefined);
      units.push({ zoneLabel: `Order ${index + 1}`, stops });
    });
  } else if (strategy === 'batch') {
    const pickDemandByLocation = countLocationPickDemand(orders, allLocations);
    const dedupedStops = dedupeLocationsByFirstSeen(orders, allLocations)
      .map((key) => ({ key, pos: allLocations.get(key)!, pickCount: pickDemandByLocation.get(key) ?? 0 }));
    const stopBuckets = bucketStopsRoundRobin(dedupedStops, numWorkers);
    stopBuckets.forEach((stops, index) => {
      units.push({
        zoneLabel: `Batch Worker ${index + 1} (${stops.length} picks)`,
        stops,
      });
    });
  } else if (strategy === 'zone') {
    const pickDemandByLocation = countLocationPickDemand(orders, allLocations);
    const dedupedKeys = dedupeLocationsByFirstSeen(orders, allLocations);

    const allStops: PickStop[] = dedupedKeys
      .map((key) => ({
        key,
        pos: allLocations.get(key)!,
        pickCount: pickDemandByLocation.get(key) ?? 0,
      }))
      .filter((stop) => stop.pos !== undefined);

    allStops.sort((a, b) => a.pos.x - b.pos.x);

    const totalPicks = allStops.reduce((sum, stop) => sum + stop.pickCount, 0);
    const targetPicksPerWorker = totalPicks / numWorkers;

    const zoneLabels = ['A', 'B', 'C', 'D'];
    let currentZoneStops: PickStop[] = [];
    let currentZonePicks = 0;
    let zoneIndex = 0;
    let remainingStops = allStops.length;
    let remainingWorkers = numWorkers;

    for (const stop of allStops) {
      currentZoneStops.push(stop);
      currentZonePicks += stop.pickCount;
      remainingStops--;

      const shouldCreateNewZone =
        (remainingStops >= remainingWorkers - 1) &&
        (currentZonePicks >= targetPicksPerWorker * 0.8) &&
        (zoneIndex < numWorkers - 1);

      if (shouldCreateNewZone) {
        units.push({
          zoneLabel: `Zone ${zoneLabels[zoneIndex]}`,
          stops: currentZoneStops,
        });
        currentZoneStops = [];
        currentZonePicks = 0;
        zoneIndex++;
        remainingWorkers--;
      }
    }

    if (currentZoneStops.length > 0 || zoneIndex < numWorkers) {
      units.push({
        zoneLabel: `Zone ${zoneLabels[zoneIndex]}`,
        stops: currentZoneStops,
      });
    }
  } else {
    const waveSize = 2;
    for (let i = 0; i < orders.length; i += waveSize) {
      const waveOrders = orders.slice(i, i + waveSize);
      const pickDemandByLocation = countLocationPickDemand(waveOrders, allLocations);
      const dedupedKeys = dedupeLocationsByFirstSeen(waveOrders, allLocations);
      const stops = dedupedKeys.map((key) => ({ key, pos: allLocations.get(key)!, pickCount: pickDemandByLocation.get(key) ?? 0 }));
      units.push({ zoneLabel: `Wave ${Math.floor(i / waveSize) + 1}`, stops });
    }
  }

  const workerBuckets = roundRobinAllocation(units.map((_, i) => `${i}`), numWorkers);

  const workerDistances: number[] = Array.from({ length: numWorkers }, () => 0);
  const workerRoutes: WorkerRoute[] = Array.from({ length: numWorkers }, (_, i) => {
    const workerId = i + 1;
    const unitIndices = (workerBuckets.get(workerId) || []).map(index => Number(index));
    const route: { x: number; y: number }[] = [];
    const picks: WorkerRoute['picks'] = [];
    const tasks: WorkerRoute['tasks'] = [];
    let assignedPickCount = 0;
    let distance = 0;
    let step = 1;

    for (const unitIndex of unitIndices) {
      const unit = units[unitIndex];
      if (!unit || unit.stops.length === 0) continue;
      const unitResult = buildRouteForStops(warehouse, start, unit.stops, {
        strategy,
        workerId,
        unitLabel: unit.zoneLabel,
      });
      route.push(...unitResult.route);
      distance += unitResult.distance;
      for (const stop of unitResult.orderedStops) {
        tasks.push({
          workerId,
          step: step++,
          zone: unit.zoneLabel,
          location: `${stop.pos.x},${stop.pos.y},${stop.pos.z}`,
          item: stop.pos.sku,
        });
        picks.push({
          locationKey: stop.key,
          x: stop.pos.x,
          y: stop.pos.y,
          z: stop.pos.z,
          sku: stop.pos.sku,
          pickCount: stop.pickCount,
        });
      }
      assignedPickCount += unit.stops.reduce((sum, stop) => sum + stop.pickCount, 0);
    }

    workerDistances[i] = distance;

    return {
      workerId,
      route,
      picks,
      tasks,
      color: WORKER_COLORS[i % WORKER_COLORS.length],
      zone: unitIndices.length > 0
        ? unitIndices.map(unitIndex => units[unitIndex]?.zoneLabel ?? '').filter(Boolean).join(', ')
        : `Worker ${workerId} (idle)`,
      assignedPickCount,
      progress: 0,
    };
  });

  const totalRoute: { x: number; y: number }[] = [];
  for (const workerRoute of workerRoutes) {
    totalRoute.push(...workerRoute.route);
  }
  for (let i = 0; i < workerRoutes.length; i++) {
    if (!Number.isFinite(workerDistances[i])) workerDistances[i] = 0;
  }
  const totalDistance = workerDistances.reduce((sum, workerDistance) => sum + workerDistance, 0);

  return {
    route: totalRoute,
    distance: totalDistance,
    workerRoutes,
    workerDistances,
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
    verticalSpeed: profile?.verticalSpeed ?? DEFAULT_WAREHOUSE_PROFILE.verticalSpeed,
    zScale: profile?.zScale ?? DEFAULT_WAREHOUSE_PROFILE.zScale,
    pickTimePerItem: profile?.pickTimePerItem ?? DEFAULT_WAREHOUSE_PROFILE.pickTimePerItem,
  };
}

function resolveLaborProfile(profile?: Partial<LaborProfile>): LaborProfile {
  return {
    costPerHour: profile?.costPerHour ?? DEFAULT_LABOR_PROFILE.costPerHour,
  };
}

function scaleWorkerDistances(workerDistances: number[], scale: number): number[] {
  return workerDistances.map((distance) => distance * scale);
}

function calculateZDistance(picks: WorkerRoute['picks']): number {
  if (picks.length === 0) return 0;
  let totalZ = 0;
  let currentZ = 1;
  for (const pick of picks) {
    totalZ += Math.abs(pick.z - currentZ);
    currentZ = pick.z;
  }
  totalZ += Math.abs(1 - currentZ);
  return totalZ;
}

function calculateWorkerTimeMinutes(
  distanceMeters: number,
  zDistanceLevels: number,
  assignedPickCount: number,
  warehouseProfile: WarehouseProfile
): number {
  const walkingTimeMinutes = distanceMeters / warehouseProfile.workerSpeed;
  const verticalTimeMinutes = (zDistanceLevels * warehouseProfile.zScale) / warehouseProfile.verticalSpeed;
  const pickingTimeMinutes = (assignedPickCount * warehouseProfile.pickTimePerItem) / 60;
  return walkingTimeMinutes + verticalTimeMinutes + pickingTimeMinutes;
}

export function runSimulation(
  warehouse: Warehouse,
  orders: Order[],
  workerCount: number = 2,
  profiles: SimulationProfiles = {},
  validationContext?: SimulationValidationContext
): SimulationResults {
  if (!warehouse.workerStart || orders.length === 0) {
    throw new Error('Simulation requirements not met: Worker start position and orders are required.');
  }

  const warehouseProfile = resolveWarehouseProfile(profiles.warehouseProfile);
  const laborProfile = resolveLaborProfile(profiles.laborProfile);
  const strategies: StrategyType[] = ['single', 'batch', 'zone', 'wave'];
  const results: StrategyResult[] = [];

  const { resolvedOrders, missingItemIds, invalidLocationItemIds } = safelyResolveOrderLocations(orders, warehouse);

  const validOrders = resolvedOrders.filter(order => order.locations.length > 0);
  const unresolvableItemIds = new Set([...missingItemIds, ...invalidLocationItemIds]);

  if (validOrders.length === 0 && orders.length > 0) {
    const firstInvalidItem = Array.from(unresolvableItemIds)[0];
    const firstOrder = orders[0];
    throw new Error(`Order "${firstOrder.id}" references unknown itemId "${firstInvalidItem}" at index 0.`);
  }

  if (unresolvableItemIds.size > 0) {
    throw new Error(
      'Orders contain items that cannot be resolved (missing from the layout or linked to an invalid location).'
    );
  }

  const simulationByStrategy = new Map<StrategyType, ReturnType<typeof simulateStrategy>>();
  for (const strategy of strategies) {
    simulationByStrategy.set(strategy, simulateStrategy(strategy, warehouse, validOrders, workerCount));
  }

  const baselineResult = simulationByStrategy.get('single');
  const baselineWorkerDistances = baselineResult
    ? scaleWorkerDistances(baselineResult.workerDistances, warehouseProfile.scale)
    : [];
  const baselineWorkerTimes = baselineResult?.workerRoutes.map((route, idx) =>
    calculateWorkerTimeMinutes(
      baselineWorkerDistances[idx],
      calculateZDistance(route.picks),
      route.assignedPickCount,
      warehouseProfile
    )
  ) ?? [];
  const baselineTime = Math.max(...baselineWorkerTimes, 0) || 1;

  for (const strategy of strategies) {
    const result = simulationByStrategy.get(strategy) ?? { route: [], distance: 0, workerRoutes: [], workerDistances: [] };
    const workerRoutes = result.workerRoutes;
    const workerDistances = scaleWorkerDistances(result.workerDistances, warehouseProfile.scale);

    const totalDistance = workerDistances.reduce((sum: number, d: number) => sum + d, 0);
    const criticalPathDistance = Math.max(...workerDistances, 0);
    const workerTimes = workerRoutes.map((route, idx) =>
      calculateWorkerTimeMinutes(
        workerDistances[idx],
        calculateZDistance(route.picks),
        route.assignedPickCount,
        warehouseProfile
      )
    );
    const timeMinutes = Math.max(...workerTimes, 0);

    const efficiency = strategy === 'single'
      ? 0
      : Math.round(((baselineTime - timeMinutes) / baselineTime) * 100);

    const activeWorkers = workerRoutes.filter(route => route.assignedPickCount > 0).length;
    const utilization = workerRoutes.length > 0
      ? Math.round((activeWorkers / workerRoutes.length) * 100)
      : 0;
    const totalLaborMinutes = workerTimes.reduce((sum, minutes) => sum + minutes, 0);
    const cost = (totalLaborMinutes / 60) * laborProfile.costPerHour;

    results.push({
      strategy,
      strategyName: STRATEGY_NAMES[strategy],
      distance: Math.round(totalDistance),
      totalDistance: Math.round(totalDistance),
      criticalPathDistance: Math.round(criticalPathDistance),
      estimatedTime: Math.round(timeMinutes * 10) / 10,
      efficiency,
      workerUtilization: Math.round(utilization),
      costPerOrder: Math.round((cost / Math.max(orders.length, 1)) * 100) / 100,
      route: result.route,
      color: STRATEGY_COLORS[strategy],
      workerRoutes,
    });
  }

  const bestStrategy = results
    .filter(r => r.strategy !== 'single')
    .reduce((best, current) => current.criticalPathDistance < best.criticalPathDistance ? current : best)
    .strategy;

  const bestStrategyResult = results.find(result => result.strategy === bestStrategy) ?? results[0];
  const bestStrategyRoutes = bestStrategyResult.workerRoutes.map(workerRoute => workerRoute.route);

  return {
    strategies: results,
    heatmap: buildRouteFrequencyHeatmap(warehouse, bestStrategyRoutes),
    bestStrategy,
    isPartial: false,
    unresolvableItems: Array.from(unresolvableItemIds),
    missingItemsCount: missingItemIds.size,
    invalidLocationCount: invalidLocationItemIds.size,
    validationContext,
  };
}
