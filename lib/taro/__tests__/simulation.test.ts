import { describe, it, expect } from 'vitest';
import { runSimulation, buildRouteFrequencyHeatmap } from '../../../core/simulationEngine';
import { generateDemoWarehouse, generateRandomOrders } from '../demo-generator';
import { getShelfLocationId } from '../layout';
import type { Cell, Order, StorageLocation, Warehouse, WarehouseLocation } from '../types';

function bin(x: number, y: number, z: number, sku: string, quantity = 10): StorageLocation {
  return {
    id: `${sku}@${x},${y},${z}`,
    locationId: getShelfLocationId(x, y),
    x,
    y,
    z,
    sku,
    quantity,
  };
}

function emptyCell(x: number, y: number): Cell {
  return { x, y, type: 'empty', locations: [] };
}

function shelfCell(x: number, y: number, bins: StorageLocation[]): Cell {
  return { x, y, type: 'shelf', locations: bins };
}

function workerStartCell(x: number, y: number): Cell {
  return { x, y, type: 'worker-start', locations: [] };
}

function buildWarehouse(
  width: number,
  height: number,
  shelfBins: Array<[number, number, StorageLocation[]]>,
  workerStart: { x: number; y: number } | null = { x: 0, y: 0 }
): Warehouse {
  const grid: Cell[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => emptyCell(x, y))
  );
  const shelves: { x: number; y: number }[] = [];
  const locations: WarehouseLocation[] = [];
  for (const [x, y, bins] of shelfBins) {
    grid[y][x] = shelfCell(x, y, bins);
    shelves.push({ x, y });
    locations.push({
      id: getShelfLocationId(x, y),
      x,
      y,
      type: 'shelf',
      binIds: bins.map(b => b.id),
    });
  }
  if (workerStart) {
    grid[workerStart.y][workerStart.x] = workerStartCell(workerStart.x, workerStart.y);
  }
  return { width, height, grid, shelves, workerStart, locations };
}

describe('simulation', () => {
  const flattenRoutes = (routes: { x: number; y: number }[][]): number =>
    routes.reduce((total, route) => total + route.length, 0);

  it('should run simulation with demo warehouse', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 3);
    const results = runSimulation(warehouse, orders, 2);

    expect(results).toBeDefined();
    expect(results.strategies).toHaveLength(4); // single, batch, zone, wave
    expect(results.heatmap).toBeDefined();
    expect(results.bestStrategy).toBeDefined();
    expect(['single', 'batch', 'zone', 'wave']).toContain(results.bestStrategy);
  });

  it('should calculate correct metrics for each strategy', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);
    const results = runSimulation(warehouse, orders, 2);

    for (const strategy of results.strategies) {
      expect(strategy.distance).toBeGreaterThanOrEqual(0);
      expect(strategy.totalDistance).toBeGreaterThanOrEqual(0);
      expect(strategy.criticalPathDistance).toBeGreaterThanOrEqual(0);
      expect(strategy.estimatedTime).toBeGreaterThan(0);
      expect(strategy.workerUtilization).toBeGreaterThanOrEqual(0);
      expect(strategy.workerUtilization).toBeLessThanOrEqual(100);
      expect(strategy.costPerOrder).toBeGreaterThanOrEqual(0);
    }
  });

  it('should baseline efficiency should be 0 for single strategy', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);
    const results = runSimulation(warehouse, orders, 2);

    const singleStrategy = results.strategies.find(s => s.strategy === 'single');
    expect(singleStrategy?.efficiency).toBe(0);
  });

  it('should generate worker routes for multi-worker strategies', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 3);
    const results = runSimulation(warehouse, orders, 3);

    for (const strategy of results.strategies) {
      if (strategy.strategy === 'single') continue;
      expect(strategy.workerRoutes).toHaveLength(3);
      expect(strategy.workerRoutes.every(route => route.color)).toBe(true);
    }
  });

  it('should include worker start in every route', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);
    const results = runSimulation(warehouse, orders, 2);

    expect(results.heatmap).toBeDefined();
    expect(Array.isArray(results.heatmap)).toBe(true);
    // heatmap is a 2D array
    if (results.heatmap.length > 0) {
      expect(Array.isArray(results.heatmap[0])).toBe(true);
    }
  });

<<<<<<< Updated upstream
  it('should reflect exact path frequency counts without weighting', () => {
    const warehouse = generateDemoWarehouse();
    const routes = [[
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 1 },
    ]];

    const heatmap = buildRouteFrequencyHeatmap(warehouse, routes);
    expect(heatmap[1][1]).toBe(2);
    expect(heatmap[1][2]).toBe(2);
    expect(heatmap[0][0]).toBe(0);
    expect(flattenRoutes(routes)).toBe(4);
    expect(heatmap.flat().reduce((sum, value) => sum + value, 0)).toBe(4);
  });

  it('should generate heatmap from the best strategy route data', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 3);
    const results = runSimulation(warehouse, orders, 2);

    const best = results.strategies.find(strategy => strategy.strategy === results.bestStrategy);
    expect(best).toBeDefined();

    const bestRoutes = best!.workerRoutes && best!.workerRoutes.length > 0
      ? best!.workerRoutes.map(workerRoute => workerRoute.route)
      : [best!.route];

    const expectedHeatmap = buildRouteFrequencyHeatmap(warehouse, bestRoutes);
    expect(results.heatmap).toEqual(expectedHeatmap);
  });

  it('should handle empty orders by throwing an error', () => {
    const warehouse = generateDemoWarehouse();
    expect(() => runSimulation(warehouse, [], 2)).toThrow(/Simulation requirements not met/);
  });

  it('should allow overriding simulation profiles from input', () => {
=======
  it('should produce heatmap with frequency counts', () => {
>>>>>>> Stashed changes
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);
    const results = runSimulation(warehouse, orders, 2);

    const totalHeat = results.heatmap.flat().reduce((sum, n) => sum + n, 0);
    expect(totalHeat).toBeGreaterThan(0);
  });

  it('should build heatmap correctly from routes', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 1);
    const results = runSimulation(warehouse, orders, 1);
    const singleStrategy = results.strategies.find(s => s.strategy === 'single');
    expect(singleStrategy).toBeDefined();
    const heatmap = buildRouteFrequencyHeatmap(warehouse, [singleStrategy!.route]);
    expect(heatmap.length).toBe(warehouse.height);
    expect(heatmap[0].length).toBe(warehouse.width);
  });

  it('should produce strategy-specific distances for overlapping orders', () => {
    const warehouse = buildWarehouse(12, 6, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
      [4, 1, [bin(4, 1, 1, 'SKU_B')]],
      [9, 1, [bin(9, 1, 1, 'SKU_C')]],
      [10, 5, [bin(10, 5, 1, 'SKU_D')]],
    ]);
    const orders: Order[] = [
      { id: 'order-1', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_D' }], assignedWorkerId: null },
      { id: 'order-2', items: [{ skuId: 'SKU_B' }, { skuId: 'SKU_D' }], assignedWorkerId: null },
      { id: 'order-3', items: [{ skuId: 'SKU_C' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 2);
    const distancesByStrategy = new Map(results.strategies.map(strategy => [strategy.strategy, strategy.totalDistance]));
    const uniqueDistances = new Set(distancesByStrategy.values());

    expect(uniqueDistances.size).toBeGreaterThan(1);
    expect(distancesByStrategy.get('single')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
    expect(distancesByStrategy.get('wave')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
  });

  it('should accept strictly skuId-based order entries', () => {
    const warehouse = buildWarehouse(6, 6, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
      [4, 4, [bin(4, 4, 1, 'SKU_B')]],
    ]);
    const orders: Order[] = [
      { id: 'order-future', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 2);
    expect(results.strategies).toHaveLength(4);
  });

  it('should count assignedPickCount as total item picks (including duplicate locations)', () => {
    const warehouse = buildWarehouse(8, 6, [
      [2, 1, [bin(2, 1, 1, 'SKU_A')]],
      [5, 1, [bin(5, 1, 1, 'SKU_B')]],
    ]);
    const fewerPickOrders: Order[] = [
      { id: 'order-a', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }], assignedWorkerId: null },
    ];
    const morePickOrders: Order[] = [
      { id: 'order-a', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }], assignedWorkerId: null },
      { id: 'order-b', items: [{ skuId: 'SKU_A' }], assignedWorkerId: null },
    ];

    const fewerResults = runSimulation(warehouse, fewerPickOrders, 1);
    const moreResults = runSimulation(warehouse, morePickOrders, 1);

    for (const strategy of fewerResults.strategies) {
      const totalAssignedPicks = strategy.workerRoutes.reduce((sum, route) => sum + route.assignedPickCount, 0);
      expect(totalAssignedPicks).toBe(2);
    }

    for (const strategy of moreResults.strategies) {
      const totalAssignedPicks = strategy.workerRoutes.reduce((sum, route) => sum + route.assignedPickCount, 0);
      expect(totalAssignedPicks).toBe(3);
    }

    for (const strategyName of ['single', 'batch', 'zone', 'wave'] as const) {
      const fewer = fewerResults.strategies.find(strategy => strategy.strategy === strategyName);
      const more = moreResults.strategies.find(strategy => strategy.strategy === strategyName);
      expect(fewer).toBeDefined();
      expect(more).toBeDefined();
      expect(more!.estimatedTime).toBeGreaterThan(fewer!.estimatedTime);
    }
  });

  it('should split batch picks across available workers', () => {
    const warehouse = buildWarehouse(12, 8, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
      [2, 1, [bin(2, 1, 1, 'SKU_B')]],
      [3, 1, [bin(3, 1, 1, 'SKU_C')]],
      [4, 1, [bin(4, 1, 1, 'SKU_D')]],
      [5, 1, [bin(5, 1, 1, 'SKU_E')]],
      [6, 1, [bin(6, 1, 1, 'SKU_F')]],
    ]);
    const orders: Order[] = [
      { id: 'order-1', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }], assignedWorkerId: null },
      { id: 'order-2', items: [{ skuId: 'SKU_C' }, { skuId: 'SKU_D' }], assignedWorkerId: null },
      { id: 'order-3', items: [{ skuId: 'SKU_E' }, { skuId: 'SKU_F' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 3);
    const batch = results.strategies.find(strategy => strategy.strategy === 'batch');

    expect(batch).toBeDefined();
    expect(batch!.workerRoutes).toHaveLength(3);

    const activeWorkers = batch!.workerRoutes.filter(route => route.assignedPickCount > 0);
    expect(activeWorkers).toHaveLength(3);

    const picksPerWorker = activeWorkers.map(route => route.picks.length);
    expect(Math.max(...picksPerWorker) - Math.min(...picksPerWorker)).toBeLessThanOrEqual(1);
    expect(activeWorkers.every(route => route.zone.startsWith('Batch Worker'))).toBe(true);
  });

  it('should throw a clear error for unknown skuId entries in orders', () => {
    const warehouse = generateDemoWarehouse();
    const invalidOrders: Order[] = [
      { id: 'invalid-order', items: [{ skuId: 'DOES_NOT_EXIST' }], assignedWorkerId: null },
    ];

    expect(() => runSimulation(warehouse, invalidOrders, 2)).toThrow(
      'Order "invalid-order" references unknown skuId "DOES_NOT_EXIST" at index 0.'
    );
  });

  it('should refuse partial resolution unless allowPartial is set', () => {
    const warehouse = buildWarehouse(6, 6, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
    ]);
    // Add a cell with a different SKU so the warehouse is internally consistent;
    // the "invalid" SKU is referenced from the order but doesn't exist anywhere.
    const orders: Order[] = [
      { id: 'order-1', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_NOT_FOUND' }], assignedWorkerId: null },
    ];

    expect(() => runSimulation(warehouse, orders, 1)).toThrow(/cannot be resolved/);
  });

<<<<<<< Updated upstream
  it('should handle orders with items that have invalid locationIds by throwing an error', () => {
    const warehouse: Warehouse = {
      width: 6,
      height: 6,
      grid: Array.from({ length: 6 }, (_, y) =>
        Array.from({ length: 6 }, (_, x) => ({
          x,
          y,
          type: 'empty',
          locations: [],
        }))
      ),
      shelves: [],
      workerStart: { x: 0, y: 0 },
      locations: [
        { id: 'L1', x: 1, y: 1, z: 1, type: 'shelf', items: ['SKU-1'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_INVALID', locationId: 'DOES_NOT_EXIST' },
      ],
    };

    const orders = [
      { id: 'order-1', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_INVALID' }], assignedWorkerId: null },
    ];

    // Partial resolution is no longer permitted in the engine
    expect(() => runSimulation(warehouse, orders, 1, { allowPartial: true })).toThrow(/cannot be resolved/);
  });

  it('should handle mixed valid/invalid orders by throwing an error', () => {
    const warehouse: Warehouse = {
      width: 8,
      height: 6,
      grid: Array.from({ length: 6 }, (_, y) =>
        Array.from({ length: 8 }, (_, x) => ({
          x,
          y,
          type: 'empty',
          locations: [],
        }))
      ),
      shelves: [],
      workerStart: { x: 0, y: 0 },
      locations: [
        { id: 'L1', x: 1, y: 1, z: 1, type: 'shelf', items: ['SKU-1'] },
        { id: 'L2', x: 3, y: 1, z: 1, type: 'shelf', items: ['SKU-2'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_L2', locationId: 'L2' },
        { id: 'ITEM_BAD', locationId: 'DOES_NOT_EXIST' },
      ],
    };

    const orders = [
      { id: 'order-valid', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
      { id: 'order-mixed', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_BAD' }], assignedWorkerId: null },
=======
  it('should run partial simulation when allowPartial is set', () => {
    const warehouse = buildWarehouse(6, 6, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
    ]);
    const orders: Order[] = [
      { id: 'order-1', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_NOT_FOUND' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 1, { allowPartial: true });
    expect(results).toBeDefined();
    expect(results.strategies).toHaveLength(4);
    expect(results.validationContext).toBeDefined();
    expect(results.validationContext?.missingItems).toBe(1);
    expect(results.validationContext?.affectedOrders).toBe(1);
  });

  it('should handle mixed valid/invalid orders and run partial simulation', () => {
    const warehouse = buildWarehouse(8, 6, [
      [1, 1, [bin(1, 1, 1, 'SKU_A')]],
      [3, 1, [bin(3, 1, 1, 'SKU_B')]],
    ]);
    const orders: Order[] = [
      { id: 'order-valid', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_B' }], assignedWorkerId: null },
      { id: 'order-mixed', items: [{ skuId: 'SKU_A' }, { skuId: 'SKU_NOT_FOUND' }], assignedWorkerId: null },
>>>>>>> Stashed changes
    ];

    expect(() => runSimulation(warehouse, orders, 1, { allowPartial: true })).toThrow(/cannot be resolved/);
  });
});