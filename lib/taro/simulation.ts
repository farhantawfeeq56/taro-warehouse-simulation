// Simulation engine for picking strategies

import type { Warehouse, Order, StrategyResult, SimulationResults, StrategyType, WorkerRoute, StorageLocation } from './types';
import { findPath, calculatePathDistance } from './pathfinding';
import {
  STRATEGY_COLORS,
  STRATEGY_NAMES,
  WORKER_COLORS,
  CELL_SIZE_METERS,
  WALKING_SPEED,
  COST_PER_MINUTE,
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

// Get all pickable items from warehouse locations
// Single source of truth for location mapping
function getAllPickableLocations(warehouse: Warehouse): Map<string, { x: number; y: number; z: number; sku: string }> {
  const locations = new Map<string, { x: number; y: number; z: number; sku: string }>();

  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf' && cell.locations.length > 0) {
        for (const loc of cell.locations) {
          const key = getLocationKey(loc.x, loc.y, loc.z, loc.sku);
          locations.set(key, { x: loc.x, y: loc.y, z: loc.z, sku: loc.sku });
        }
      }
    }
  }

  return locations;
}

// Get position from SKU (find first location with matching SKU)
function getSkuPosition(warehouse: Warehouse, sku: string, allLocations: Map<string, { x: number; y: number; z: number; sku: string }>): { x: number; y: number; z: number; sku: string } | null {
  for (const [key, pos] of allLocations) {
    if (pos.sku === sku) {
      return pos;
    }
  }
  return null;
}

// Strategy allocation functions (extracted for maintainability)

interface AllocationStrategy {
  allocateItems: (
    itemKeys: string[],
    allLocations: Map<string, { x: number; y: number; z: number; sku: string }>,
    numWorkers: number,
    warehouse: Warehouse
  ) => Map<number, string[]>;
}

const zoneAllocation: AllocationStrategy['allocateItems'] = (itemKeys, allLocations, numWorkers, warehouse) => {
  const workerBuckets = new Map<number, string[]>();
  for (let i = 1; i <= numWorkers; i++) {
    workerBuckets.set(i, []);
  }

  for (const key of itemKeys) {
    const pos = allLocations.get(key);
    if (!pos) continue;

    let workerId = 1;
    if (numWorkers === 2) {
      const midX = Math.floor(warehouse.width / 2);
      workerId = pos.x < midX ? 1 : 2;
    } else if (numWorkers === 3) {
      const zoneWidth = warehouse.width / 3;
      if (pos.x < zoneWidth) workerId = 1;
      else if (pos.x < zoneWidth * 2) workerId = 2;
      else workerId = 3;
    }

    workerBuckets.get(workerId)!.push(key);
  }

  return workerBuckets;
};

const roundRobinAllocation: AllocationStrategy['allocateItems'] = (itemKeys, _allLocations, numWorkers) => {
  const workerBuckets = new Map<number, string[]>();
  for (let i = 1; i <= numWorkers; i++) {
    workerBuckets.set(i, []);
  }

  itemKeys.forEach((key, i) => {
    const workerId = (i % numWorkers) + 1;
    workerBuckets.get(workerId)!.push(key);
  });

  return workerBuckets;
};

const singleAllocation: AllocationStrategy['allocateItems'] = (itemKeys, _allLocations, _numWorkers) => {
  const workerBuckets = new Map<number, string[]>();
  workerBuckets.set(1, [...itemKeys]);
  return workerBuckets;
};

/**
 * Generate strategy-aware parallel worker routes.
 *
 * Logic:
 * 1. For 'single' strategy: forces 1 worker regardless of workerCount.
 * 2. For 'zone' strategy: spatial allocation by x-coordinate.
 * 3. For other strategies: fallback to round-robin for now.
 * 4. Each worker gets an independent nearest-neighbor route.
 */
function generateStrategyAwareWorkerRoutes(
  warehouse: Warehouse,
  orders: Order[],
  strategy: StrategyType,
  workerCount: number
): WorkerRoute[] {
  // Validate worker start
  const start = warehouse.workerStart;
  if (!start) return [];

  // Force single worker for single strategy
  const numWorkers = strategy === 'single' ? 1 : Math.max(1, Math.min(3, workerCount));

  // Build SKU→position map from all locations in the warehouse
  const allLocations = getAllPickableLocations(warehouse);

  // Collect all unique SKUs from all orders (deduplicate by SKU)
  const allSkuKeys = new Set<string>();
  for (const order of orders) {
    for (const sku of order.items) {
      // Find the first location with this SKU
      const pos = getSkuPosition(warehouse, sku, allLocations);
      if (pos) {
        allSkuKeys.add(getLocationKey(pos.x, pos.y, pos.z, pos.sku));
      }
    }
  }

  const itemKeys = Array.from(allSkuKeys);

  // For single strategy, order items by order sequence (preserve order)
  if (strategy === 'single') {
    const route: { x: number; y: number }[] = [];
    let currentPos = start;
    const picks: { locationKey: string; x: number; y: number; z: number; sku: string }[] = [];

    for (const order of orders) {
      for (const sku of order.items) {
        const pos = getSkuPosition(warehouse, sku, allLocations);
        if (pos) {
          const path = findPath(warehouse, currentPos, pos);
          if (path.length > 0) {
            route.push(...path);
            currentPos = pos;
            picks.push({
              locationKey: getLocationKey(pos.x, pos.y, pos.z, pos.sku),
              x: pos.x,
              y: pos.y,
              z: pos.z,
              sku: pos.sku,
            });
          }
        }
      }
      const returnPath = findPath(warehouse, currentPos, start);
      if (returnPath.length > 0) {
        route.push(...returnPath);
        currentPos = start;
      }
    }

    return [{
      workerId: 1,
      route,
      picks,
      color: WORKER_COLORS[0],
      zone: 'All Zones',
      assignedPickCount: picks.length,
      progress: 0,
    }];
  }

  // Strategy-specific allocation
  const allocationMap: Record<StrategyType, AllocationStrategy['allocateItems']> = {
    zone: zoneAllocation,
    batch: roundRobinAllocation,
    wave: roundRobinAllocation,
    single: singleAllocation,
  };

  const workerBuckets = allocationMap[strategy](itemKeys, allLocations, numWorkers, warehouse);

  // Generate routes for each worker
  return Array.from({ length: numWorkers }, (_, i) => {
    const wid = i + 1;
    const keys = workerBuckets.get(wid) || [];

    const picks = keys
      .map(key => ({ key, pos: allLocations.get(key)! }))
      .filter(p => p.pos !== undefined);

    const route: { x: number; y: number }[] = [];

    if (picks.length > 0) {
      let currentPos = start;
      const remaining = [...picks];

      // Nearest-neighbor within each worker's zone/bucket
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let j = 0; j < remaining.length; j++) {
          const d =
            Math.abs(remaining[j].pos.x - currentPos.x) +
            Math.abs(remaining[j].pos.y - currentPos.y);
          if (d < nearestDist) { nearestDist = d; nearestIdx = j; }
        }
        const next = remaining.splice(nearestIdx, 1)[0];
        const path = findPath(warehouse, currentPos, next.pos);
        if (path.length > 0) { route.push(...path); currentPos = next.pos; }
      }

      // Return to start
      const returnPath = findPath(warehouse, currentPos, start);
      if (returnPath.length > 0) route.push(...returnPath);
    }

    return {
      workerId: wid,
      route,
      picks: picks.map(p => ({
        locationKey: p.key,
        x: p.pos.x,
        y: p.pos.y,
        z: p.pos.z,
        sku: p.pos.sku,
      })),
      color: WORKER_COLORS[i % WORKER_COLORS.length],
      zone: picks.length > 0 ? `Worker ${wid}` : `Worker ${wid} (idle)`,
      assignedPickCount: picks.length,
      progress: 0,
    };
  });
}

function simulateSingleOrderPicking(
  warehouse: Warehouse,
  orders: Order[]
): { route: { x: number; y: number }[]; distance: number } {
  if (!warehouse.workerStart || orders.length === 0) {
    return { route: [], distance: 0 };
  }

  const allLocations = getAllPickableLocations(warehouse);
  const fullRoute: { x: number; y: number }[] = [];
  let totalDistance = 0;

  for (const order of orders) {
    let currentPos = warehouse.workerStart;

    for (const sku of order.items) {
      const itemPos = getSkuPosition(warehouse, sku, allLocations);
      if (itemPos) {
        const path = findPath(warehouse, currentPos, itemPos);
        if (path.length > 0) {
          fullRoute.push(...path);
          totalDistance += calculatePathDistance(path);
          currentPos = itemPos;
        }
      }
    }

    // Return to start after each order
    const returnPath = findPath(warehouse, currentPos, warehouse.workerStart);
    if (returnPath.length > 0) {
      fullRoute.push(...returnPath);
      totalDistance += calculatePathDistance(returnPath);
    }
  }

  return { route: fullRoute, distance: totalDistance };
}

function simulateBatchPicking(
  warehouse: Warehouse,
  orders: Order[]
): { route: { x: number; y: number }[]; distance: number } {
  if (!warehouse.workerStart || orders.length === 0) {
    return { route: [], distance: 0 };
  }

  const allLocations = getAllPickableLocations(warehouse);

  // Collect all unique SKUs across all orders
  const allSkuKeys = new Set<string>();
  for (const order of orders) {
    for (const sku of order.items) {
      const pos = getSkuPosition(warehouse, sku, allLocations);
      if (pos) {
        allSkuKeys.add(getLocationKey(pos.x, pos.y, pos.z, pos.sku));
      }
    }
  }

  // Sort items by position (left to right, top to bottom) for efficient picking
  const sortedItems = Array.from(allSkuKeys)
    .map(key => ({ key, pos: allLocations.get(key)! }))
    .sort((a, b) => {
      if (a.pos.y !== b.pos.y) return a.pos.y - b.pos.y;
      return a.pos.x - b.pos.x;
    });

  const fullRoute: { x: number; y: number }[] = [];
  let currentPos = warehouse.workerStart;
  let totalDistance = 0;

  for (const item of sortedItems) {
    const path = findPath(warehouse, currentPos, item.pos);
    if (path.length > 0) {
      fullRoute.push(...path);
      totalDistance += calculatePathDistance(path);
      currentPos = item.pos;
    }
  }

  // Return to start
  const returnPath = findPath(warehouse, currentPos, warehouse.workerStart);
  if (returnPath.length > 0) {
    fullRoute.push(...returnPath);
    totalDistance += calculatePathDistance(returnPath);
  }

  return { route: fullRoute, distance: totalDistance };
}

function simulateZonePicking(
  warehouse: Warehouse,
  orders: Order[]
): { route: { x: number; y: number }[]; distance: number } {
  if (!warehouse.workerStart || orders.length === 0) {
    return { route: [], distance: 0 };
  }

  const allLocations = getAllPickableLocations(warehouse);

  // Divide warehouse into zones (left and right halves)
  const midX = Math.floor(warehouse.width / 2);

  // Collect all items and group by zone
  const allSkuKeys = new Set<string>();
  for (const order of orders) {
    for (const sku of order.items) {
      const pos = getSkuPosition(warehouse, sku, allLocations);
      if (pos) {
        allSkuKeys.add(getLocationKey(pos.x, pos.y, pos.z, pos.sku));
      }
    }
  }

  const leftZoneItems: { key: string; pos: { x: number; y: number; z: number; sku: string } }[] = [];
  const rightZoneItems: { key: string; pos: { x: number; y: number; z: number; sku: string } }[] = [];

  for (const key of allSkuKeys) {
    const pos = allLocations.get(key);
    if (pos) {
      if (pos.x < midX) {
        leftZoneItems.push({ key, pos });
      } else {
        rightZoneItems.push({ key, pos });
      }
    }
  }

  // Sort items within each zone
  leftZoneItems.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);
  rightZoneItems.sort((a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x);

  const fullRoute: { x: number; y: number }[] = [];
  let currentPos = warehouse.workerStart;
  let totalDistance = 0;

  // Pick left zone first, then right zone
  for (const item of [...leftZoneItems, ...rightZoneItems]) {
    const path = findPath(warehouse, currentPos, item.pos);
    if (path.length > 0) {
      fullRoute.push(...path);
      totalDistance += calculatePathDistance(path);
      currentPos = item.pos;
    }
  }

  // Return to start
  const returnPath = findPath(warehouse, currentPos, warehouse.workerStart);
  if (returnPath.length > 0) {
    fullRoute.push(...returnPath);
    totalDistance += calculatePathDistance(returnPath);
  }

  return { route: fullRoute, distance: totalDistance };
}

function simulateWavePicking(
  warehouse: Warehouse,
  orders: Order[]
): { route: { x: number; y: number }[]; distance: number } {
  if (!warehouse.workerStart || orders.length === 0) {
    return { route: [], distance: 0 };
  }

  const allLocations = getAllPickableLocations(warehouse);

  // Wave picking: optimize route using nearest neighbor heuristic
  const allSkuKeys = new Set<string>();
  for (const order of orders) {
    for (const sku of order.items) {
      const pos = getSkuPosition(warehouse, sku, allLocations);
      if (pos) {
        allSkuKeys.add(getLocationKey(pos.x, pos.y, pos.z, pos.sku));
      }
    }
  }

  const itemsWithPos = Array.from(allSkuKeys)
    .map(key => ({ key, pos: allLocations.get(key)! }));

  const fullRoute: { x: number; y: number }[] = [];
  let currentPos = warehouse.workerStart;
  let totalDistance = 0;
  const visited = new Set<string>();

  // Nearest neighbor algorithm
  while (visited.size < itemsWithPos.length) {
    let nearestItem: { key: string; pos: { x: number; y: number; z: number; sku: string } } | null = null;
    let nearestDistance = Infinity;

    for (const item of itemsWithPos) {
      if (!visited.has(item.key)) {
        const dist = Math.abs(item.pos.x - currentPos.x) + Math.abs(item.pos.y - currentPos.y);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestItem = item;
        }
      }
    }

    if (nearestItem) {
      visited.add(nearestItem.key);
      const path = findPath(warehouse, currentPos, nearestItem.pos);
      if (path.length > 0) {
        fullRoute.push(...path);
        totalDistance += calculatePathDistance(path);
        currentPos = nearestItem.pos;
      }
    }
  }

  // Return to start
  const returnPath = findPath(warehouse, currentPos, warehouse.workerStart);
  if (returnPath.length > 0) {
    fullRoute.push(...returnPath);
    totalDistance += calculatePathDistance(returnPath);
  }

  return { route: fullRoute, distance: totalDistance };
}

function generateHeatmap(warehouse: Warehouse, routes: { x: number; y: number }[][]): number[][] {
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

  // Apply z-weighting to heatmap values
  // Higher z-levels are harder to reach, so we slightly reduce their heat values
  for (let y = 0; y < warehouse.height; y++) {
    for (let x = 0; x < warehouse.width; x++) {
      const cell = warehouse.grid[y][x];
      if (cell.type === 'shelf' && cell.locations.length > 0) {
        // Calculate average z-level at this cell
        const avgZLevel = cell.locations.reduce((sum, loc) => sum + loc.z, 0) / cell.locations.length;
        // Weight: slightly reduce heat for higher z-levels (harder to reach)
        // Formula: value * (1 + (1 - avgZLevel) * 0.2)
        // For avgZLevel=1: value * 1.2 (brighter, easier to reach)
        // For avgZLevel=2: value * 1.0
        // For avgZLevel=3: value * 0.8 (dimmer, harder to reach)
        // For avgZLevel=4: value * 0.6
        const weightFactor = 1 + (1 - avgZLevel) * 0.2;
        heatmap[y][x] *= weightFactor;
      }
    }
  }

  return heatmap;
}

export function runSimulation(warehouse: Warehouse, orders: Order[], workerCount: number = 2): SimulationResults {
  const strategies: StrategyType[] = ['single', 'batch', 'zone', 'wave'];
  const results: StrategyResult[] = [];
  const allRoutes: { x: number; y: number }[][] = [];

  // Calculate baseline (single order picking) for efficiency comparison
  const singleResult = simulateSingleOrderPicking(warehouse, orders);
  const baselineDistance = singleResult.distance || 1;

  for (const strategy of strategies) {
    let result: { route: { x: number; y: number }[]; distance: number };

    switch (strategy) {
      case 'single':  result = singleResult; break;
      case 'batch':   result = simulateBatchPicking(warehouse, orders); break;
      case 'zone':    result = simulateZonePicking(warehouse, orders); break;
      case 'wave':    result = simulateWavePicking(warehouse, orders); break;
    }

    allRoutes.push(result.route);

    // Generate parallel worker routes using strategy-aware allocation
    const workerRoutes = generateStrategyAwareWorkerRoutes(warehouse, orders, strategy, workerCount);

    // Calculate metrics from individual worker routes
    const workerDistances = workerRoutes.map(w => {
      let d = 0;
      for (let i = 1; i < w.route.length; i++) {
        d += Math.abs(w.route[i].x - w.route[i-1].x) + Math.abs(w.route[i].y - w.route[i-1].y);
      }
      return d * CELL_SIZE_METERS;
    });

    const totalDistance = workerDistances.reduce((sum, d) => sum + d, 0);
    const criticalPathDistance = Math.max(...workerDistances, 0);
    const timeMinutes = criticalPathDistance / WALKING_SPEED;

    const efficiency = strategy === 'single'
      ? 0
      : Math.round(((baselineDistance - (totalDistance / CELL_SIZE_METERS)) / baselineDistance) * 100);

    const utilization = Math.min(95, 60 + Math.random() * 30);
    const cost = timeMinutes * COST_PER_MINUTE;

    results.push({
      strategy,
      strategyName: STRATEGY_NAMES[strategy],
      distance: Math.round(totalDistance), // Keep for backward compat
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

  return {
    strategies: results,
    heatmap: generateHeatmap(warehouse, allRoutes),
    bestStrategy,
  };
}
