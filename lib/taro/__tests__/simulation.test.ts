import { describe, it, expect } from 'vitest';
import { runSimulation, buildRouteFrequencyHeatmap } from '../simulation';
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
      if (strategy.strategy === 'single') {
        expect(strategy.workerRoutes).toHaveLength(1);
      } else {
        expect(strategy.workerRoutes).toHaveLength(3);
      }

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
      { id: 'order-1', items: ['L1', 'L4'], assignedWorkerId: null },
      { id: 'order-2', items: ['L2', 'L4'], assignedWorkerId: null },
      { id: 'order-3', items: ['L3'], assignedWorkerId: null },
    ];

    const results = runSimulation(warehouse, orders, 2);
    const distancesByStrategy = new Map(results.strategies.map(strategy => [strategy.strategy, strategy.totalDistance]));
    const uniqueDistances = new Set(distancesByStrategy.values());

    expect(uniqueDistances.size).toBeGreaterThan(1);
    expect(distancesByStrategy.get('single')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
    expect(distancesByStrategy.get('wave')).toBeGreaterThanOrEqual(distancesByStrategy.get('batch') ?? 0);
  });

  it('should support itemId-based order entries through the compatibility resolver', () => {
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

    const legacyOrders = [
      { id: 'order-legacy', items: ['L1', 'L2'], assignedWorkerId: null },
    ];

    const futureOrders = [
      { id: 'order-future', items: [{ itemId: 'ITEM_L1' }, { itemId: 'ITEM_L2' }], assignedWorkerId: null },
    ] as unknown as Parameters<typeof runSimulation>[1];

    const legacyResults = runSimulation(warehouse, legacyOrders, 2);
    const futureResults = runSimulation(warehouse, futureOrders, 2);

    expect(futureResults.strategies.map(s => s.totalDistance)).toEqual(
      legacyResults.strategies.map(s => s.totalDistance)
    );
  });

  it('should throw a clear error for unknown itemId entries in orders', () => {
    const warehouse = generateDemoWarehouse();
    const invalidOrders = [
      { id: 'invalid-order', items: [{ itemId: 'DOES_NOT_EXIST' }], assignedWorkerId: null },
    ] as unknown as Parameters<typeof runSimulation>[1];

    expect(() => runSimulation(warehouse, invalidOrders, 2)).toThrow(
      'Order "invalid-order" references unknown itemId "DOES_NOT_EXIST" at index 0.'
    );
  });
});
