import { describe, it, expect } from 'vitest';
import { runSimulation, buildRouteFrequencyHeatmap } from '../../../core/simulationEngine';
import { generateDemoWarehouse, generateRandomOrders } from '../demo-generator';
import type { Warehouse } from '../types';

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
      // All strategies should use the configured number of workers
      expect(strategy.workerRoutes).toHaveLength(3);

      // Each worker route should have the required properties
      for (const route of strategy.workerRoutes || []) {
        expect(route.workerId).toBeGreaterThan(0);
        expect(route.route).toBeDefined();
        expect(route.picks).toBeDefined();
        expect(route.color).toBeDefined();
        expect(route.assignedPickCount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('should generate heatmap with correct dimensions', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);
    const results = runSimulation(warehouse, orders, 2);

    expect(results.heatmap).toHaveLength(warehouse.height);
    for (const row of results.heatmap) {
      expect(row).toHaveLength(warehouse.width);
    }
  });

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

  it('should handle empty orders', () => {
    const warehouse = generateDemoWarehouse();
    const results = runSimulation(warehouse, [], 2);

    expect(results.strategies).toHaveLength(4);
    for (const strategy of results.strategies) {
      expect(strategy.totalDistance).toBe(0);
      expect(strategy.estimatedTime).toBe(0);
    }
  });

  it('should allow overriding simulation profiles from input', () => {
    const warehouse = generateDemoWarehouse();
    const orders = generateRandomOrders(warehouse, 2);

    const defaultResults = runSimulation(warehouse, orders, 2);
    const overriddenResults = runSimulation(warehouse, orders, 2, {
      warehouseProfile: {
        scale: 5,
        workerSpeed: 30,
        pickTimePerItem: 12,
      },
      laborProfile: {
        costPerHour: 60,
      },
    });

    const defaultBatch = defaultResults.strategies.find(s => s.strategy === 'batch');
    const overriddenBatch = overriddenResults.strategies.find(s => s.strategy === 'batch');

    expect(defaultBatch).toBeDefined();
    expect(overriddenBatch).toBeDefined();
    expect(overriddenBatch!.totalDistance).toBeGreaterThanOrEqual(defaultBatch!.totalDistance);
    expect(overriddenBatch!.estimatedTime).toBeGreaterThanOrEqual(defaultBatch!.estimatedTime);
    expect(overriddenBatch!.costPerOrder).toBeGreaterThanOrEqual(defaultBatch!.costPerOrder);
  });

  it('should produce strategy-specific distances for overlapping orders', () => {
    const warehouse: Warehouse = {
      width: 12,
      height: 8,
      grid: Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 12 }, (_, x) => ({
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
        { id: 'L2', x: 4, y: 1, z: 1, type: 'shelf', items: ['SKU-2'] },
        { id: 'L3', x: 9, y: 1, z: 1, type: 'shelf', items: ['SKU-3'] },
        { id: 'L4', x: 10, y: 5, z: 1, type: 'shelf', items: ['SKU-4'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_L2', locationId: 'L2' },
        { id: 'ITEM_L3', locationId: 'L3' },
        { id: 'ITEM_L4', locationId: 'L4' },
      ],
    };

    const orders = [
      { id: 'order-1', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L4' }], assignedWorkerId: null },
      { id: 'order-2', items: [{ itemId: 'ITEM_L2' }, { itemId: 'ITEM_L4' }], assignedWorkerId: null },
      { id: 'order-3', items: [{ itemId: 'ITEM_L3' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 2);
    const distancesByStrategy = new Map(results.strategies.map(strategy => [strategy.strategy, strategy.totalDistance]));
    const uniqueDistances = new Set(distancesByStrategy.values());

    expect(uniqueDistances.size).toBeGreaterThan(1);
    expect(distancesByStrategy.get('single')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
    expect(distancesByStrategy.get('wave')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
  });

  it('should accept strictly itemId-based order entries', () => {
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
        { id: 'L2', x: 4, y: 4, z: 1, type: 'shelf', items: ['SKU-2'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_L2', locationId: 'L2' },
      ],
    };

    const orders = [
      { id: 'order-future', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 2);
    expect(results.strategies).toHaveLength(4);
  });

  it('should count assignedPickCount as total item picks (including duplicate locations)', () => {
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
        { id: 'L1', x: 2, y: 1, z: 1, type: 'shelf', items: ['SKU-1'] },
        { id: 'L2', x: 5, y: 1, z: 1, type: 'shelf', items: ['SKU-2'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_L2', locationId: 'L2' },
      ],
    };

    const fewerPickOrders = [
      { id: 'order-a', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
    ];
    const morePickOrders = [
      { id: 'order-a', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
      { id: 'order-b', items: [{ itemId: 'ITEM_L1' }], assignedWorkerId: null },
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
    const warehouse: Warehouse = {
      width: 12,
      height: 8,
      grid: Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 12 }, (_, x) => ({
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
        { id: 'L2', x: 2, y: 1, z: 1, type: 'shelf', items: ['SKU-2'] },
        { id: 'L3', x: 3, y: 1, z: 1, type: 'shelf', items: ['SKU-3'] },
        { id: 'L4', x: 4, y: 1, z: 1, type: 'shelf', items: ['SKU-4'] },
        { id: 'L5', x: 5, y: 1, z: 1, type: 'shelf', items: ['SKU-5'] },
        { id: 'L6', x: 6, y: 1, z: 1, type: 'shelf', items: ['SKU-6'] },
      ],
      items: [
        { id: 'ITEM_L1', locationId: 'L1' },
        { id: 'ITEM_L2', locationId: 'L2' },
        { id: 'ITEM_L3', locationId: 'L3' },
        { id: 'ITEM_L4', locationId: 'L4' },
        { id: 'ITEM_L5', locationId: 'L5' },
        { id: 'ITEM_L6', locationId: 'L6' },
      ],
    };

    const orders = [
      { id: 'order-1', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
      { id: 'order-2', items: [{ itemId: 'ITEM_L3' }, { itemId: 'ITEM_L4' }], assignedWorkerId: null },
      { id: 'order-3', items: [{ itemId: 'ITEM_L5' }, { itemId: 'ITEM_L6' }], assignedWorkerId: null },
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

  it('should throw a clear error for unknown itemId entries in orders', () => {
    const warehouse = generateDemoWarehouse();
    const invalidOrders = [
      { id: 'invalid-order', items: [{ itemId: 'DOES_NOT_EXIST' }], assignedWorkerId: null },
    ];

    expect(() => runSimulation(warehouse, invalidOrders, 2)).toThrow(
      'Order "invalid-order" references unknown itemId "DOES_NOT_EXIST" at index 0.'
    );
  });

  it('should handle orders with items that have invalid locationIds gracefully', () => {
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

    // Should NOT throw - should handle gracefully with validation context
    const results = runSimulation(warehouse, orders, 1);
    expect(results).toBeDefined();
    expect(results.strategies).toHaveLength(4);
    // Should have validation context indicating missing items
    expect(results.validationContext).toBeDefined();
    expect(results.validationContext?.missingItems).toBe(1);
    expect(results.validationContext?.affectedOrders).toBe(1);
  });

  it('should handle mixed valid/invalid orders and run partial simulation', () => {
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
    ];

    // Should run successfully with partial data
    const results = runSimulation(warehouse, orders, 1);
    expect(results).toBeDefined();
    expect(results.validationContext).toBeDefined();
    expect(results.validationContext?.missingItems).toBe(1);
  });
});
