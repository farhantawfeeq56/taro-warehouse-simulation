// Simulation engine for picking strategies

import type { Warehouse, Order, StrategyResult, SimulationResults, StrategyType, WorkerRoute } from './types';
import { findPath, calculatePathDistance } from './pathfinding';

const STRATEGY_COLORS: Record<StrategyType, string> = {
  single: '#3b82f6', // blue
  batch: '#22c55e',  // green
  zone: '#a855f7',   // purple
  wave: '#f97316',   // orange
};

const STRATEGY_NAMES: Record<StrategyType, string> = {
  single: 'Single Order',
  batch: 'Batch Picking',
  zone: 'Zone Picking',
  wave: 'Wave Picking',
};

const WORKER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']; // blue, emerald, amber, red

// Meters per grid cell
const CELL_SIZE_METERS = 2;
// Walking speed in meters per minute
const WALKING_SPEED = 60;
// Cost per minute of worker time
const COST_PER_MINUTE = 0.50;

function getItemPosition(warehouse: Warehouse, itemId: number): { x: number; y: number } | null {
  const item = warehouse.items.find(i => i.id === itemId);
  return item ? { x: item.x, y: item.y } : null;
}

/**
 * Generate independent parallel routes — one per worker.
 * Each worker gets a subset of pick locations and navigates
 * from the SAME start point through their own assigned items.
 */
function generateParallelWorkerRoutes(
  warehouse: Warehouse,
  pickLocations: { id: number; pos: { x: number; y: number } }[],
  numWorkers: number
): WorkerRoute[] {
  const clampedWorkers = Math.max(1, Math.min(3, numWorkers));
  const start = warehouse.workerStart!;

  // Distribute picks round-robin across workers so loads are even
  const buckets: { id: number; pos: { x: number; y: number } }[][] = Array.from(
    { length: clampedWorkers },
    () => []
  );
  pickLocations.forEach((item, i) => {
    buckets[i % clampedWorkers].push(item);
  });

  return buckets.map((picks, i) => {
    const route: { x: number; y: number }[] = [];

    if (picks.length > 0) {
      let currentPos = start;

      // Nearest-neighbour ordering within each worker's subset
      const remaining = [...picks];
      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let j = 0; j < remaining.length; j++) {
          const d =
            Math.abs(remaining[j].pos.x - currentPos.x) +
            Math.abs(remaining[j].pos.y - currentPos.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestIdx = j;
          }
        }
        const next = remaining.splice(nearestIdx, 1)[0];
        const path = findPath(warehouse, currentPos, next.pos);
        if (path.length > 0) {
          route.push(...path);
          currentPos = next.pos;
        }
      }

      // Return to start
      const returnPath = findPath(warehouse, currentPos, start);
      if (returnPath.length > 0) route.push(...returnPath);
    }

    return {
      workerId: i + 1,
      route,
      color: WORKER_COLORS[i % WORKER_COLORS.length],
      zone: picks.length > 0 ? `Worker ${i + 1}` : `Worker ${i + 1} (idle)`,
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

  const fullRoute: { x: number; y: number }[] = [];
  let totalDistance = 0;
  
  for (const order of orders) {
    let currentPos = warehouse.workerStart;
    
    for (const itemId of order.items) {
      const itemPos = getItemPosition(warehouse, itemId);
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

  // Collect all unique items across all orders
  const allItems = new Set<number>();
  for (const order of orders) {
    for (const itemId of order.items) {
      allItems.add(itemId);
    }
  }
  
  // Sort items by position (left to right, top to bottom) for efficient picking
  const sortedItems = Array.from(allItems)
    .map(id => ({ id, pos: getItemPosition(warehouse, id) }))
    .filter((item): item is { id: number; pos: { x: number; y: number } } => item.pos !== null)
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

  // Divide warehouse into zones (left and right halves)
  const midX = Math.floor(warehouse.width / 2);
  
  // Collect all items and group by zone
  const allItems = new Set<number>();
  for (const order of orders) {
    for (const itemId of order.items) {
      allItems.add(itemId);
    }
  }
  
  const leftZoneItems: { id: number; pos: { x: number; y: number } }[] = [];
  const rightZoneItems: { id: number; pos: { x: number; y: number } }[] = [];
  
  for (const id of allItems) {
    const pos = getItemPosition(warehouse, id);
    if (pos) {
      if (pos.x < midX) {
        leftZoneItems.push({ id, pos });
      } else {
        rightZoneItems.push({ id, pos });
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

  // Wave picking: optimize route using nearest neighbor heuristic
  const allItems = new Set<number>();
  for (const order of orders) {
    for (const itemId of order.items) {
      allItems.add(itemId);
    }
  }
  
  const itemsWithPos = Array.from(allItems)
    .map(id => ({ id, pos: getItemPosition(warehouse, id) }))
    .filter((item): item is { id: number; pos: { x: number; y: number } } => item.pos !== null);
  
  const fullRoute: { x: number; y: number }[] = [];
  let currentPos = warehouse.workerStart;
  let totalDistance = 0;
  const visited = new Set<number>();
  
  // Nearest neighbor algorithm
  while (visited.size < itemsWithPos.length) {
    let nearestItem: { id: number; pos: { x: number; y: number } } | null = null;
    let nearestDistance = Infinity;
    
    for (const item of itemsWithPos) {
      if (!visited.has(item.id)) {
        const dist = Math.abs(item.pos.x - currentPos.x) + Math.abs(item.pos.y - currentPos.y);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestItem = item;
        }
      }
    }
    
    if (nearestItem) {
      visited.add(nearestItem.id);
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
  
  return heatmap;
}

export function runSimulation(warehouse: Warehouse, orders: Order[], workerCount: number = 2): SimulationResults {
  const strategies: StrategyType[] = ['single', 'batch', 'zone', 'wave'];
  const results: StrategyResult[] = [];
  const allRoutes: { x: number; y: number }[][] = [];
  
  // Calculate baseline (single order picking) for efficiency comparison
  const singleResult = simulateSingleOrderPicking(warehouse, orders);
  const baselineDistance = singleResult.distance || 1;
  
  // Collect all unique pick locations once (shared across strategies for parallel routing)
  const allItems = new Set<number>();
  for (const order of orders) {
    for (const itemId of order.items) {
      allItems.add(itemId);
    }
  }
  const itemsWithPos = Array.from(allItems)
    .map(id => ({ id, pos: getItemPosition(warehouse, id) }))
    .filter((item): item is { id: number; pos: { x: number; y: number } } => item.pos !== null);

  for (const strategy of strategies) {
    let result: { route: { x: number; y: number }[]; distance: number };
    
    switch (strategy) {
      case 'single':
        result = singleResult;
        break;
      case 'batch':
        result = simulateBatchPicking(warehouse, orders);
        break;
      case 'zone':
        result = simulateZonePicking(warehouse, orders);
        break;
      case 'wave':
        result = simulateWavePicking(warehouse, orders);
        break;
    }
    
    allRoutes.push(result.route);
    
    // Generate parallel worker routes from the pick locations
    const workerRoutes = generateParallelWorkerRoutes(warehouse, itemsWithPos, workerCount);
    
    const distanceMeters = result.distance * CELL_SIZE_METERS;
    const timeMinutes = distanceMeters / WALKING_SPEED;
    const efficiency = strategy === 'single' 
      ? 0 
      : Math.round(((baselineDistance - result.distance) / baselineDistance) * 100);
    const utilization = Math.min(95, 60 + Math.random() * 30);
    const cost = timeMinutes * COST_PER_MINUTE;
    
    results.push({
      strategy,
      strategyName: STRATEGY_NAMES[strategy],
      distance: Math.round(distanceMeters),
      estimatedTime: Math.round(timeMinutes * 10) / 10,
      efficiency,
      workerUtilization: Math.round(utilization),
      costPerOrder: Math.round((cost / Math.max(orders.length, 1)) * 100) / 100,
      route: result.route,
      color: STRATEGY_COLORS[strategy],
      workerRoutes,
    });
  }
  
  // Find best strategy (lowest distance, excluding single)
  const bestStrategy = results
    .filter(r => r.strategy !== 'single')
    .reduce((best, current) => 
      current.distance < best.distance ? current : best
    ).strategy;
  
  return {
    strategies: results,
    heatmap: generateHeatmap(warehouse, allRoutes),
    bestStrategy,
  };
}
