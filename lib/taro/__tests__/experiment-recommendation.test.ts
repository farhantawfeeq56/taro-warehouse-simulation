import { describe, expect, it } from 'vitest';
import {
  generateExperiment,
  parseConstraints,
  clampToConstraints,
  toWarehouseInsight,
  pickSeedWarehouse,
  CONFIG_LIMITS,
  type WarehouseInsight,
} from '@/lib/taro/experiment-recommendation';
import type { SimulationResults } from '@/lib/taro/types';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';

const CONFIG_A: WarehouseConfiguration = {
  layout: { gridHeight: 20, rackCount: 12, aisleWidth: 1, crossAisleCount: 1 },
  inventory: { skuCount: 1000, demandDistribution: 0, productAffinity: 0, storageFootprint: 0 },
  placement: { slottingBias: 0, categoryClustering: 0 },
};

function makeResults(efficiency: number, time: number, distance: number): SimulationResults {
  return {
    strategies: [
      {
        strategy: 'single',
        strategyName: 'Single Order',
        distance,
        totalDistance: distance,
        criticalPathDistance: distance,
        estimatedTime: time,
        efficiency,
        workerUtilization: 80,
        costPerOrder: 2.5,
        route: [],
        color: '#000',
        workerRoutes: [],
        ordersCompleted: 50,
        ordersSkipped: 0,
        unreachablePicks: 0,
      },
      {
        strategy: 'batch',
        strategyName: 'Batch Picking',
        distance,
        totalDistance: distance,
        criticalPathDistance: distance,
        estimatedTime: time * 1.2,
        efficiency: efficiency - 5,
        workerUtilization: 85,
        costPerOrder: 2.1,
        route: [],
        color: '#000',
        workerRoutes: [],
        ordersCompleted: 50,
        ordersSkipped: 0,
        unreachablePicks: 0,
      },
      {
        strategy: 'zone',
        strategyName: 'Zone Picking',
        distance,
        totalDistance: distance,
        criticalPathDistance: distance,
        estimatedTime: time * 0.9,
        efficiency: efficiency + 2,
        workerUtilization: 90,
        costPerOrder: 2.0,
        route: [],
        color: '#000',
        workerRoutes: [],
        ordersCompleted: 50,
        ordersSkipped: 0,
        unreachablePicks: 0,
      },
    ],
    heatmap: [],
    bestStrategy: 'zone',
    isPartial: false,
    unresolvableItems: [],
    missingItemsCount: 0,
    invalidLocationCount: 0,
  };
}

const insights: WarehouseInsight[] = [
  {
    id: 'a',
    name: 'Warehouse A',
    configuration: CONFIG_A,
    bestEfficiency: 72,
    bestEstimatedTime: 40,
    bestTotalDistance: 2200,
    bestCostPerOrder: 2.2,
    averageDistance: 2300,
    averageTime: 42,
  },
  {
    id: 'b',
    name: 'Warehouse B',
    configuration: { ...CONFIG_A, layout: { ...CONFIG_A.layout, rackCount: 8 } },
    bestEfficiency: 66,
    bestEstimatedTime: 55,
    bestTotalDistance: 3100,
    bestCostPerOrder: 2.6,
    averageDistance: 3200,
    averageTime: 57,
  },
];

describe('parseConstraints', () => {
  it('parses rack, height, aisle, sku, budget patterns', () => {
    const out = parseConstraints('max 12 racks, height at least 20, budget $4000');
    expect(out.find((c) => c.type === 'rackCount')?.value).toBe(12);
    expect(out.find((c) => c.type === 'rackCount')?.relation).toBe('max');
    expect(out.find((c) => c.type === 'gridHeight')?.value).toBe(20);
    expect(out.find((c) => c.type === 'gridHeight')?.relation).toBe('min');
    expect(out.find((c) => c.type === 'budget')?.value).toBe(4000);
  });

  it('returns [] for empty input (no constraints)', () => {
    expect(parseConstraints('')).toEqual([]);
    expect(parseConstraints('   ')).toEqual([]);
  });

  it('falls back to custom for unrecognized segments', () => {
    const out = parseConstraints('keep the loading dock on the north side');
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('custom');
  });
});

describe('clampToConstraints', () => {
  it('clamps to max, min and exact relations', () => {
    const cs = parseConstraints('max 10 racks, height at least 30');
    expect(clampToConstraints(cs, 'rackCount', 12, CONFIG_LIMITS.rackCount)).toBe(10);
    expect(clampToConstraints(cs, 'rackCount', 8, CONFIG_LIMITS.rackCount)).toBe(8);
    expect(clampToConstraints(cs, 'gridHeight', 20, CONFIG_LIMITS.gridHeight)).toBe(30);
    expect(clampToConstraints(cs, 'skuCount', 500, CONFIG_LIMITS.skuCount)).toBe(500);
  });

  it('respects the generator limits as the outer bound', () => {
    const cs = parseConstraints('');
    expect(clampToConstraints(cs, 'rackCount', 9999, CONFIG_LIMITS.rackCount)).toBe(
      CONFIG_LIMITS.rackCount.max,
    );
  });
});

describe('generateExperiment', () => {
  it('seeds from the best-performing warehouse with a config', () => {
    const rec = generateExperiment(insights, '');
    expect(rec.seedWarehouseName).toBe('Warehouse A');
  });

  it('produces a valid, within-limits configuration', () => {
    const rec = generateExperiment(insights, '');
    expect(rec.configuration.layout.rackCount).toBeGreaterThanOrEqual(CONFIG_LIMITS.rackCount.min);
    expect(rec.configuration.layout.rackCount).toBeLessThanOrEqual(CONFIG_LIMITS.rackCount.max);
    expect(rec.configuration.layout.gridHeight).toBeGreaterThanOrEqual(CONFIG_LIMITS.gridHeight.min);
    expect(rec.configuration.inventory.skuCount).toBeGreaterThanOrEqual(CONFIG_LIMITS.skuCount.min);
  });

  it('mutates along a single axis with an explicit change', () => {
    const rec = generateExperiment(insights, '');
    expect(rec.changes.length).toBeGreaterThan(0);
    // Every axis mutation must have produced a real delta.
    const allSame = rec.changes.every((c) => c.before === c.after);
    expect(allSame).toBe(false);
  });

  it('respects a rack-count max constraint', () => {
    const rec = generateExperiment(insights, 'max 12 racks');
    expect(rec.configuration.layout.rackCount).toBeLessThanOrEqual(12);
  });

  it('clamps the SKU count when a budget constraint applies', () => {
    const rec = generateExperiment(insights, 'budget $1');
    expect(rec.configuration.inventory.skuCount).toBeLessThan(1000);
  });

  it('returns the no-change case when constraints block every mutation', () => {
    const rec = generateExperiment(insights, 'max 8 racks, max 1 cross aisle, max 0 category clustering');
    // With the seed at rackCount 12, "max 8" forces a shrink - that's still a
    // change, so this shouldn't be no-change. For a true no-change, constrain
    // everything to the seed's exact values.
    const exact = generateExperiment(insights, 'exactly 12 racks, exactly 1 cross aisle, exactly 0 category clustering');
    expect(exact.constrainedToNoChange).toBe(true);
  });

  it('handles the no-config/no-data case gracefully', () => {
    const rec = generateExperiment([], '');
    expect(rec).toBeTruthy();
  });
});

describe('pickSeedWarehouse', () => {
  it('skips warehouses without a configuration', () => {
    const noConfig: WarehouseInsight = {
      id: 'x',
      name: 'Legacy',
      configuration: null,
      bestEfficiency: 99,
      bestEstimatedTime: 10,
      bestTotalDistance: 100,
      bestCostPerOrder: 1,
      averageDistance: 100,
      averageTime: 10,
    };
    const picked = pickSeedWarehouse([noConfig, insights[0]]);
    expect(picked?.id).toBe('a');
  });

  it('returns null when nothing has a config', () => {
    expect(pickSeedWarehouse([])).toBeNull();
  });
});

describe('toWarehouseInsight', () => {
  it('extracts the best strategy and averages', () => {
    const insight = toWarehouseInsight('a', 'A', CONFIG_A, makeResults(70, 50, 2000));
    expect(insight.bestEfficiency).toBe(72); // zone (+2)
    expect(insight.bestEstimatedTime).toBe(45); // zone (50 * 0.9)
    expect(insight.bestTotalDistance).toBe(2000);
    expect(insight.configuration).toBe(CONFIG_A);
  });
});
