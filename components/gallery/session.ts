'use client';

/**
 * Demo session for the /components gallery.
 *
 * Generates real warehouse sessions in the browser (same pipeline the app
 * uses) so every component page renders against genuine data instead of
 * hand-written fixtures. Nothing here is imported by the app itself.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Order, SimulationResults, Warehouse } from '@/lib/taro/types';
import type { WarehouseConfiguration } from '@/lib/taro/warehouse-configuration';
import { DEFAULT_LABOR_PROFILE, DEFAULT_WAREHOUSE_PROFILE } from '@/lib/taro/constants';
import { generateWarehouseSession } from '@/lib/taro/warehouse-generator';
import { reconcile } from '@/lib/taro/corrector';
import { validateItems } from '@/lib/taro/order-validation';
import { evaluateReadiness, type SimulationReadiness } from '@/lib/taro/readiness';
import { runSimulation } from '@/core/simulationEngine';

export const DEMO_WORKER_COUNT = 4;

export interface DemoWarehouse {
  id: string;
  name: string;
  warehouse: Warehouse;
  configuration: WarehouseConfiguration;
  orders: Order[];
  results: SimulationResults | null;
  readiness: SimulationReadiness;
  isReady: boolean;
}

/** Base look - a mid-size, colourful warehouse so previews read well. */
const BASE: WarehouseConfiguration = {
  layout: { gridHeight: 14, rackCount: 10, aisleWidth: 1, crossAisleCount: 1 },
  inventory: { skuCount: 240, demandDistribution: 40, productAffinity: 50, storageFootprint: 20 },
  placement: { slottingBias: 60, categoryClustering: 40 },
};

function variant(patch: {
  layout?: Partial<WarehouseConfiguration['layout']>;
  inventory?: Partial<WarehouseConfiguration['inventory']>;
  placement?: Partial<WarehouseConfiguration['placement']>;
}): WarehouseConfiguration {
  return {
    layout: { ...BASE.layout, ...patch.layout },
    inventory: { ...BASE.inventory, ...patch.inventory },
    placement: { ...BASE.placement, ...patch.placement },
  };
}

function build(name: string, configuration: WarehouseConfiguration): DemoWarehouse {
  const generated = generateWarehouseSession(configuration, 30, 3);
  const { warehouse, orders } = reconcile(generated.warehouse, generated.orders);

  let results: SimulationResults | null = null;
  try {
    results = runSimulation(warehouse, orders, DEMO_WORKER_COUNT, {
      warehouseProfile: DEFAULT_WAREHOUSE_PROFILE,
      laborProfile: DEFAULT_LABOR_PROFILE,
    });
  } catch (error) {
    console.error(`[gallery] simulation failed for "${name}"`, error);
  }

  const readiness = evaluateReadiness(
    warehouse,
    orders,
    'all',
    validateItems(orders, warehouse),
  );

  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    warehouse,
    configuration,
    orders,
    results,
    readiness,
    isReady: readiness.isReady,
  };
}

const VARIANTS: { name: string; configuration: WarehouseConfiguration }[] = [
  { name: 'Baseline', configuration: BASE },
  {
    name: 'Wide cross-aisles',
    configuration: variant({ layout: { crossAisleCount: 3, aisleWidth: 2 }, placement: { slottingBias: 20 } }),
  },
  {
    name: 'Demand slotting',
    configuration: variant({
      inventory: { skuCount: 200, storageFootprint: 60, productAffinity: 80, demandDistribution: 70 },
      placement: { slottingBias: 100, categoryClustering: 80 },
    }),
  },
];

/** Builds (once) a small workspace of demo warehouses with simulation results. */
export function useDemoSession() {
  return useMemo(() => {
    const warehouses = VARIANTS.map((v) => build(v.name, v.configuration));
    return { warehouses, base: warehouses[0] };
  }, []);
}

/**
 * Loops an animation progress value in [0,1) - the same ref + throttled state
 * pair the app feeds the canvas, so routes/dots animate like the real thing.
 */
export function useReplayProgress(durationMs = 6000) {
  const ref = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      ref.current = ((now - start) % durationMs) / durationMs;
      // Re-render at ~10fps (the app throttles the same way); the ref stays live.
      if (now - last > 100) {
        last = now;
        tick((n) => n + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [durationMs]);

  return ref;
}
