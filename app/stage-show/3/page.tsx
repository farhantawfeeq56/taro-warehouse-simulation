'use client';

import { useMemo } from 'react';
import { CompareView } from '@/components/taro/compare-view';
import { DEFAULT_LABOR_PROFILE, DEFAULT_WAREHOUSE_PROFILE } from '@/lib/taro/constants';
import type { Order, WorkspaceWarehouse } from '@/lib/taro/types';
import { useDemoSession, DEMO_WORKER_COUNT } from '@/components/gallery/session';
import { StageNav } from '../nav';

const noop = () => {};

/** 3 — The real Compare view: every warehouse auto-simulated and ranked. */
export default function StageShow3() {
  const { warehouses } = useDemoSession();

  const list: WorkspaceWarehouse[] = useMemo(
    () =>
      warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        position: null,
        warehouse: w.warehouse,
        configuration: w.configuration,
      })),
    [warehouses],
  );
  const ordersByWarehouse: Record<string, Order[]> = useMemo(
    () => Object.fromEntries(warehouses.map((w) => [w.id, w.orders])),
    [warehouses],
  );

  return (
    <div className="shot-page">
      <div className="shot-inner">
        <StageNav />
        <div className="shot-copy">
          <div className="shot-kicker">03 · Compare</div>
          <h1 className="shot-title">Three layouts enter. One ships.</h1>
          <p className="shot-sub">
            The original compare screen, framed for the shot — it simulates every warehouse
            on entry and ranks them by travel distance.
          </p>
        </div>

        <div className="shot-frame h-[720px]">
          <CompareView
            warehouses={list}
            ordersByWarehouse={ordersByWarehouse}
            baseWarehouseId={list[0]?.id ?? null}
            workerCount={DEMO_WORKER_COUNT}
            warehouseProfile={DEFAULT_WAREHOUSE_PROFILE}
            laborProfile={DEFAULT_LABOR_PROFILE}
            onExit={noop}
            onGenerateExperiment={async () => {}}
          />
        </div>
      </div>
    </div>
  );
}
