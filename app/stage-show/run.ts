'use client';

/**
 * Shared real pipeline for /stage-show/6 and /7.
 * Everything is generated and simulated in-browser — no fixtures.
 */

import { runSimulation } from '@/core/simulationEngine';
import { reconcile } from '@/lib/taro/corrector';
import { DEFAULT_LABOR_PROFILE, DEFAULT_WAREHOUSE_PROFILE } from '@/lib/taro/constants';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import type { LayoutConfig } from '@/components/taro/layout-config-overlay';
import type { Order, SimulationResults, Warehouse } from '@/lib/taro/types';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';

export const DEMO_ORDERS = 50;
export const DEMO_AVG_SIZE = 3;
export const DEMO_WORKERS = 4;

export interface PipelineResult {
  name: string;
  warehouse: Warehouse;
  orders: Order[];
  results: SimulationResults | null;
  configuration: WarehouseConfiguration;
}

/** Same mapping the app uses to turn overlay output into a configuration. */
export function configFromOverlay(config: LayoutConfig): WarehouseConfiguration {
  return {
    layout: {
      gridHeight: config.gridHeight,
      rackCount: config.rackCount,
      aisleWidth: config.aisleWidth,
      crossAisleCount: config.crossAisleCount,
    },
    inventory: {
      skuCount: config.inventory.length,
      demandDistribution: config.demandDistribution,
      productAffinity: config.productAffinity,
      storageFootprint: config.storageFootprint,
    },
    placement: {
      slottingBias: config.slottingBias,
      categoryClustering: config.categoryClustering,
    },
  };
}

export function generateOnly(configuration: WarehouseConfiguration, name: string): Omit<PipelineResult, 'results'> {
  const generated = generateWarehouseSession(configuration, DEMO_ORDERS, DEMO_AVG_SIZE);
  const { warehouse, orders } = reconcile(generated.warehouse, generated.orders);
  return { name, warehouse, orders, configuration };
}

export function simulateOnly(
  warehouse: Warehouse,
  orders: Order[],
): SimulationResults | null {
  try {
    return runSimulation(warehouse, orders, DEMO_WORKERS, {
      warehouseProfile: DEFAULT_WAREHOUSE_PROFILE,
      laborProfile: DEFAULT_LABOR_PROFILE,
    });
  } catch (error) {
    console.error('[stage-show] simulation failed', error);
    return null;
  }
}

export function runPipeline(configuration: WarehouseConfiguration, name: string): PipelineResult {
  const base = generateOnly(configuration, name);
  return { ...base, results: simulateOnly(base.warehouse, base.orders) };
}

export function bestOf(results: SimulationResults | null) {
  if (!results) return null;
  return results.strategies.find((s) => s.strategy === results.bestStrategy) ?? null;
}

export const BASE_CONFIG: WarehouseConfiguration = {
  layout: { gridHeight: 14, rackCount: 10, aisleWidth: 1, crossAisleCount: 1 },
  inventory: { skuCount: 240, demandDistribution: 40, productAffinity: 50, storageFootprint: 20 },
  placement: { slottingBias: 60, categoryClustering: 40 },
};

export const VARIANT_WIDE: WarehouseConfiguration = {
  layout: { gridHeight: 14, rackCount: 10, aisleWidth: 2, crossAisleCount: 3 },
  inventory: { skuCount: 240, demandDistribution: 40, productAffinity: 50, storageFootprint: 20 },
  placement: { slottingBias: 20, categoryClustering: 40 },
};

export const VARIANT_DEMAND: WarehouseConfiguration = {
  layout: { gridHeight: 14, rackCount: 10, aisleWidth: 1, crossAisleCount: 1 },
  inventory: { skuCount: 200, demandDistribution: 70, productAffinity: 80, storageFootprint: 60 },
  placement: { slottingBias: 100, categoryClustering: 80 },
};
